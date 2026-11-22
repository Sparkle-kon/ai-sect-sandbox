import type { Cultivator, EscortContract, EscortMove, EscortReport, EscortState, LLMDecisionPayload, MapHazard, MapPoint,
  MarketShipment, WorldEvent, WorldState } from '../types/world';
import type {MarketFreightOption} from '../types/marketFreight';
import {marketFreightCapacity,marketFreightQuote,MARKET_FREIGHT_DISPATCH_TICKS} from './marketFreightTerms';
import {disasterShelterLocksTravel} from './disasterShelterCheckpoint';
import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import {flowActor, recordResourceFlow} from './resourceFlowEngine';
import { findMapPath } from './mapMotionEngine';
import { currentVisibleTileIds, noteTerrainVisit, terrainTileAt } from './terrainEngine';

export type {MarketFreightOption} from '../types/marketFreight';

export const ESCORT_FEE = 30;
export const ESCORT_RATIONS = 3;
const ESCORT_RISK_MULTIPLIER = .65;
const MAX_ADDITIONAL_STEPS = 8;
const REPORT_TICKS = 3;
const MAX_REPORTS_PER_ESCORT = 16;
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const findActor = (world: WorldState, id: string | undefined) => world.cultivators.find((actor) => actor.id === id);
const getMarket = (world: WorldState, id: string) => world.locations.find((site) => site.id === id && site.type === 'market');
const forShipment = (world: WorldState, shipmentId: string) => world.escorts.contracts.find((item) => item.shipmentId === shipmentId);
const tileId = (world: WorldState, point: MapPoint) => terrainTileAt(world, point.x, point.y)?.id;
const activeHazard = (world: WorldState, hazard: MapHazard) => hazard.createdTick <= world.tick && hazard.expiresTick > world.tick;
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

export interface EscortOption {
  action: 'ESCORT';
  escortMove: EscortMove;
  targetShipmentId?: string;
  targetEscortId?: string;
  targetHazardId?: string;
}

export interface EscortDirective {
  managed: boolean;
  hold: boolean;
  baselineDelay: number;
  crossedTileIds: string[];
  arrived: boolean;
  arrivedTick?: number;
  riskMultiplier: number;
  forceReturn: boolean;
}

export interface EscortView {
  contract: Omit<EscortContract, 'path' | 'lastCrossedTileIds'>;
  checkpoint?: MapPoint;
  reportCount: number;
}

export const createEscortState = (): EscortState => ({ contracts: [], reports: [] });

export function activeEscortForActor(world: WorldState, actor: Cultivator): EscortContract | undefined {
  return world.escorts.contracts.find((item) => item.status === 'active' && item.escortId === actor.id);
}

export function visibleEscorts(world: WorldState, actor?: Cultivator): EscortView[] {
  if (!actor) return [];
  return world.escorts.contracts.filter((item) => item.freight?
    world.cultivators.includes(actor)&&(item.clientId===actor.id||item.freight.carrierId===actor.id):
    item.clientId === actor.id || item.escortId === actor.id ||
    world.markets.shipments.some((shipment) => shipment.id === item.shipmentId && shipment.buyerId === actor.id))
    .map((item) => {
      const { path, lastCrossedTileIds: _excluded, ...contract } = item;
      const point = path[item.pathIndex];
      const tile = point && tileId(world, point);
      const checkpoint = item.escortId === actor.id || (tile && (actor.exploredTileIds.includes(tile) || currentVisibleTileIds(world, actor).has(tile))) ?
        point && { ...point } : undefined;
      return { contract: { ...contract, ...(contract.freight?{freight:structuredClone(contract.freight)}:{}), usedReportIds: [...contract.usedReportIds], detours: contract.detours.map((entry) => ({ ...entry })) },
        ...(checkpoint ? { checkpoint } : {}), reportCount: world.escorts.reports.filter(({ contractId }) => contractId === item.id).length };
    });
}

function unoccupied(world: WorldState, actor: Cultivator): boolean {
  return !activeEscortForActor(world, actor) &&
    !world.relocations.plans.some((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(actor.id)) &&
    !world.sieges.some((siege) => (siege.status === 'marching' || siege.status === 'sieging') && siege.participantIds.includes(actor.id)) &&
    !world.occasions.some((occasion) => (occasion.status === 'registration' || occasion.status === 'running') && occasion.participantIds.includes(actor.id)) &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon';
}

function applyEligibleReport(world: WorldState, contract: EscortContract, actor: Cultivator, hazard: MapHazard,
  visible: Set<string>): boolean {
  const escort = findActor(world, contract.escortId);
  if (!escort || !live(escort) || contract.arrivedTick !== undefined || actor.id === escort.id || actor.id === contract.clientId ||
      !activeHazard(world, hazard) || !visible.has(hazard.tileId)) return false;
  const checkpoint = contract.path[contract.pathIndex];
  const checkpointId = checkpoint && tileId(world, checkpoint);
  const flyingSword = Boolean(actor.sectId && actor.sectId === escort.sectId);
  if (!flyingSword && (!checkpointId || !visible.has(checkpointId))) return false;
  if (!contract.path.slice(contract.pathIndex + 1).some((point) => tileId(world, point) === hazard.tileId)) return false;
  const reports = world.escorts.reports.filter(({ contractId }) => contractId === contract.id);
  return reports.length < MAX_REPORTS_PER_ESCORT && !reports.some(({ hazardId }) => hazardId === hazard.id);
}

export function availableEscortActions(actor: Cultivator, world: WorldState): EscortOption[] {
  if (!live(actor) || !world.cultivators.includes(actor) || !unoccupied(world, actor)) return [];
  const options: EscortOption[] = [];
  for (const shipment of world.markets.shipments) {
    if (shipment.status !== 'in_transit' || actor.locationId !== shipment.originId) continue;
    const existing = forShipment(world, shipment.id);
    if (!existing && shipment.sellerId === actor.id && world.tick === shipment.departedTick + 1 && actor.spiritStones >= ESCORT_FEE &&
        getMarket(world, shipment.originId) && getMarket(world, shipment.destinationId)) {
      options.push({ action: 'ESCORT', escortMove: 'offer', targetShipmentId: shipment.id });
    }
    if (!existing || existing.freight || existing.status !== 'offered' || world.tick > existing.expiresTick) continue;
    if (existing.clientId === actor.id) options.push({ action: 'ESCORT', escortMove: 'decline', targetEscortId: existing.id });
    else if (shipment.buyerId !== actor.id && actor.herbs.earth_root >= ESCORT_RATIONS &&
        world.cultivators.some((client) => client.id === existing.clientId && live(client))) {
      const origin = getMarket(world, shipment.originId);
      const destination = getMarket(world, shipment.destinationId);
      if (origin && destination && findMapPath(world, origin, destination).length > 1) {
        options.push({ action: 'ESCORT', escortMove: 'accept', targetEscortId: existing.id });
      }
    }
  }
  if (!world.mapHazards.length) return options;
  const reportable = world.escorts.contracts.filter((contract) => contract.status === 'active' && contract.rationsEscrow > 0);
  if (!reportable.length) return options;
  const visible = currentVisibleTileIds(world, actor);
  if (visible.size) {
    for (const escort of reportable) {
      for (const hazard of world.mapHazards.filter((entry) => applyEligibleReport(world, escort, actor, entry, visible)).sort(byId)) {
        options.push({ action: 'ESCORT', escortMove: 'report', targetEscortId: escort.id, targetHazardId: hazard.id });
      }
    }
  }
  return options;
}

function event(world: WorldState, contract: EscortContract, key: string, title: string, description: string, actorIds: string[], locationId?: string): WorldEvent {
  return { id: `evt-${world.tick}-${contract.id}-${key}`, tick: world.tick, year: world.year, month: world.month,
    title, description, actorIds, category: 'diplomacy', ...(locationId ? { locationId } : {}), witnessScope: 'participants' };
}

function expireOffer(world: WorldState, contract: EscortContract, reason: string): void {
  if (contract.status !== 'offered') return;
  const client = findActor(world, contract.clientId);
  if (client) {
    client.spiritStones += contract.feeEscrow;
    freightFunds(world,contract,'freight_refund',contract.feeEscrow);
    contract.feeRefunded = contract.feeEscrow;
    contract.feeEscrow = 0;
  }
  if(contract.freight)contract.freight.closedBy??='expired';
  contract.status = 'expired';
  contract.settledTick = world.tick;
  contract.reason = reason;
}

export function resolveEscortAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'ESCORT') return null;
  const option = availableEscortActions(actor, world).find((candidate) => candidate.escortMove === decision.escortMove &&
    candidate.targetShipmentId === decision.targetShipmentId && candidate.targetEscortId === decision.targetEscortId && candidate.targetHazardId === decision.targetHazardId);
  if (!option) return null;
  if (option.escortMove === 'offer') {
    const shipment = world.markets.shipments.find(({ id }) => id === option.targetShipmentId)!;
    actor.spiritStones -= ESCORT_FEE;
    const contract: EscortContract = { id: `escort-${shipment.sequence}`, shipmentId: shipment.id, clientId: actor.id,
      originId: shipment.originId, destinationId: shipment.destinationId, status: 'offered', offeredTick: world.tick, expiresTick: world.tick + 1,
      feeEscrow: ESCORT_FEE, feePaid: 0, feeRefunded: 0, rationsEscrow: 0, rationsSpent: 0, rationsReturned: 0,
      path: [], pathIndex: 0, stride: 0, lastCrossedTileIds: [], usedReportIds: [], detours: [] };
    world.escorts.contracts.push(contract);
    return event(world, contract, 'offered', '商队委托护镖', `从委托人自有资产封存${ESCORT_FEE}灵石作报酬；只等候一回合，不接触货款。`,
      [actor.id], shipment.originId);
  }
  const contract = world.escorts.contracts.find(({ id }) => id === option.targetEscortId)!;
  if (option.escortMove === 'decline') {
    expireOffer(world, contract, '委托人撤回无人签署的委托，护镖报酬退回。');
    return event(world, contract, 'withdrawn', '护镖委托撤回', contract.reason!, [actor.id], contract.originId);
  }
  if (option.escortMove === 'report') {
    const hazard = world.mapHazards.find(({ id }) => id === option.targetHazardId)!;
    const report: EscortReport = { id: `escort-report-${contract.id}-${world.escorts.reports.filter((row) => row.contractId === contract.id).length + 1}`,
      contractId: contract.id, reporterId: actor.id, observedTick: world.tick, hazardId: hazard.id, tileId: hazard.tileId,
      expiresTick: Math.min(hazard.expiresTick, world.tick + REPORT_TICKS) };
    world.escorts.reports.push(report);
    return event(world, contract, report.id, '护镖收到目击简报', '独立观察者送来了确见且仍有效的险情简报，护卫可在已知道路中避让。',
      [actor.id, contract.escortId!]);
  }
  const shipment = world.markets.shipments.find(({ id }) => id === contract.shipmentId)!;
  const origin = getMarket(world, contract.originId)!;
  const destination = getMarket(world, contract.destinationId)!;
  const route = findMapPath(world, origin, destination);
  actor.herbs.earth_root -= ESCORT_RATIONS;
  contract.status = 'active';
  contract.escortId = actor.id;
  contract.acceptedTick = world.tick;
  contract.rationsEscrow = ESCORT_RATIONS - 1;
  contract.rationsSpent = 1;
  contract.path = route;
  contract.stride = Math.max(1, Math.ceil((route.length - 1) / Math.max(2, shipment.arrivalTick - shipment.departedTick)));
  return event(world, contract, 'accepted', '护镖护卫登程', '护卫送交自己的玄土根作行粮，已用去出发所需一份；未取用任何客户货物。',
    [contract.clientId, actor.id], origin.id);
}


const freightFunds=(world:WorldState,contract:EscortContract,reason:'freight_deposit'|'freight_dispatch'|'freight_refund',
  amount:number)=>{
  const freight=contract.freight;
  if(!freight||amount<=0)return;
  const escrow={kind:'freight' as const,id:contract.id};
  const client=flowActor(contract.clientId);
  recordResourceFlow(world,{kind:'transfer',mechanism:'market',refId:contract.id,reason,good:'stone',amount,
    visibility:{kind:'participants',actorIds:[contract.clientId,freight.carrierId]},
    from:reason==='freight_deposit'?client:escrow,to:reason==='freight_deposit'?escrow:
      reason==='freight_dispatch'?flowActor(freight.carrierId):client});
};

function freightAvailableActor(world:WorldState,actor:Cultivator){
  const id=actor.id;
  return live(actor)&&actor.positionPlane===undefined&&actor.age>=18&&unoccupied(world,actor)&&
    !disasterShelterLocksTravel(world,actor)&&!activeDanxiaMedicineEscort(world,actor)&&
    !(actor.guardAssignment&&actor.guardAssignment.expiresTick>world.tick&&actor.guardAssignment.locationId!==actor.locationId)&&
    !world.couriers.dispatches.some(row=>row.courierId===id&&(row.status==='in_transit'||row.status==='returning'))&&
    !world.pilgrimages.journeys.some(row=>(row.organizerId===id||row.companionId===id)&&row.status==='active')&&
    !world.boundaryReliefs.cases.some(row=>row.incomingId===id&&(row.status==='travelling'||row.status==='returning'))&&
    !world.expeditionRescues.requests.some(row=>(row.explorerId===id||row.rescuerId===id)&&row.supplySpent===1&&
      (row.status==='extracting'||row.status==='interrupted'&&row.pathIndex>0&&!row.arrivedIds?.includes(id)&&
        world.occasions.some(occasion=>occasion.id===row.occasionId&&occasion.status==='running')));
}

function freightRoute(world:WorldState,originId:string,destinationId:string):MapPoint[]{
  const a=getMarket(world,originId),b=getMarket(world,destinationId);
  if(!a||!b)return [];
  const aTile=tileId(world,a),bTile=tileId(world,b);
  if(!aTile||!bTile||aTile===bTile)return [];
  const normalized:MapPoint[]=[];
  for(const point of findMapPath(world,a,b)){
    const prior=normalized.at(-1);
    if(!prior||tileId(world,prior)!==tileId(world,point))normalized.push(point);
    else if(tileId(world,point)===bTile)normalized[normalized.length-1]=point;
  }
  return normalized;
}

function freightCandidate(world:WorldState,client:Cultivator,carrier:Cultivator,shipment:MarketShipment){
  return client.id!==carrier.id&&carrier.id!==shipment.buyerId&&carrier.locationId===shipment.originId&&
    freightAvailableActor(world,carrier);
}

export function availableMarketFreightActions(actor:Cultivator,world:WorldState,tick=world.tick):MarketFreightOption[]{
  if(!world.cultivators.includes(actor)||!freightAvailableActor(world,actor)||(tick!==world.tick&&tick!==world.tick+1))return [];
  const options:MarketFreightOption[]=[];
  for(const shipment of world.markets.shipments){
    if(shipment.status!=='in_transit'||shipment.originId!==actor.locationId)continue;
    const contract=forShipment(world,shipment.id),quote=marketFreightQuote(shipment.good,shipment.quantity);
    if(!quote||!getMarket(world,shipment.originId)||!getMarket(world,shipment.destinationId))continue;
    if(!contract&&actor.id===shipment.sellerId&&tick===shipment.departedTick+1&&actor.spiritStones>=quote.fee&&
      freightRoute(world,shipment.originId,shipment.destinationId).length>1){
      for(const carrier of world.cultivators)if(freightCandidate(world,actor,carrier,shipment)&&
        marketFreightCapacity(carrier.realm,carrier.realmStage)>=quote.load&&carrier.herbs.earth_root>=quote.rations)
        options.push({action:'MARKET_FREIGHT',marketFreightMove:'offer',targetShipmentId:shipment.id,targetCultivatorId:carrier.id});
      continue;
    }
    const freight=contract?.freight;
    if(!contract||!freight||contract.status!=='offered'||tick>contract.expiresTick)continue;
    const reply=(marketFreightMove:'accept'|'decline'|'withdraw')=>
      options.push({action:'MARKET_FREIGHT',marketFreightMove,targetEscortId:contract.id});
    if(actor.id===contract.clientId)reply('withdraw');
    if(actor.id!==freight.carrierId||tick<=contract.offeredTick)continue;
    reply('decline');
    const client=findActor(world,contract.clientId);
    if(client&&live(client)&&freightCandidate(world,client,actor,shipment)&&actor.herbs.earth_root>=quote.rations&&
      marketFreightCapacity(actor.realm,actor.realmStage)>=quote.load&&freightRoute(world,shipment.originId,shipment.destinationId).length>1)
      reply('accept');
  }
  return options;
}

export function projectMarketFreight(world:WorldState,viewer?:Cultivator):EscortView[]{
  return visibleEscorts(world,viewer).filter(row=>row.contract.freight!==undefined);
}

const freightKeys=new Set(['chosenAction','innerMonologue','marketFreightMove','targetShipmentId','targetEscortId','targetCultivatorId']);
export function resolveMarketFreightAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='MARKET_FREIGHT'||Object.keys(payload).some(key=>!freightKeys.has(key)))return null;
  const option=availableMarketFreightActions(actor,world).find(row=>row.marketFreightMove===payload.marketFreightMove&&
    row.targetShipmentId===payload.targetShipmentId&&row.targetEscortId===payload.targetEscortId&&row.targetCultivatorId===payload.targetCultivatorId);
  if(!option)return null;
  if(option.marketFreightMove==='offer'){
    const shipment=world.markets.shipments.find(row=>row.id===option.targetShipmentId);
    const quote=shipment&&marketFreightQuote(shipment.good,shipment.quantity);
    if(!shipment||!quote)return null;
    actor.spiritStones-=quote.fee;
    const contract:EscortContract={id:`freight-escort-${shipment.sequence}`,shipmentId:shipment.id,clientId:actor.id,
      originId:shipment.originId,destinationId:shipment.destinationId,status:'offered',offeredTick:world.tick,expiresTick:world.tick+1,
      freight:{...quote,carrierId:option.targetCultivatorId,buyOrderId:shipment.buyOrderId,sellOrderId:shipment.sellOrderId,
        buyerId:shipment.buyerId,unitPrice:shipment.unitPrice,departedTick:shipment.departedTick},
      feeEscrow:quote.fee,feePaid:0,feeRefunded:0,rationsEscrow:0,rationsSpent:0,rationsReturned:0,
      path:[],pathIndex:0,stride:0,lastCrossedTileIds:[],usedReportIds:[],detours:[]};
    world.escorts.contracts.push(contract);
    freightFunds(world,contract,'freight_deposit',quote.fee);
    return event(world,contract,'freight-offered','过秤，请人承运',
      `只量当批${quote.quantity}份，重量${quote.load}，货主封自己的${quote.fee}灵石。买卖钱货未动。`,
      [actor.id,option.targetCultivatorId],shipment.originId);
  }
  const contract=world.escorts.contracts.find(row=>row.id===option.targetEscortId);
  const freight=contract?.freight;
  if(!contract||!freight)return null;
  const participants=[contract.clientId,freight.carrierId];
  if(option.marketFreightMove!=='accept'){
    const closed=option.marketFreightMove==='decline'?'declined':'withdrawn';
    freight.closedBy=closed;
    expireOffer(world,contract,'尚未承运，原封运费原数退回。');
    return event(world,contract,`freight-${closed}`,closed==='declined'?'承运人谢绝':'货主撤回承运邀约',
      '尚未承运，原封运费原数退回。',participants,contract.originId);
  }
  const shipment=world.markets.shipments.find(row=>row.id===contract.shipmentId);
  const route=freightRoute(world,contract.originId,contract.destinationId);
  if(!shipment||route.length<=1)return null;
  const capacity=marketFreightCapacity(actor.realm,actor.realmStage);
  actor.herbs.earth_root-=freight.rations;
  freight.capability={realm:actor.realm,stage:actor.realmStage,capacity};
  freight.dispatchByTick=world.tick+MARKET_FREIGHT_DISPATCH_TICKS;
  contract.status='active';contract.escortId=actor.id;contract.acceptedTick=world.tick;
  contract.rationsEscrow=freight.rations;contract.path=route;
  const nativeStride=Math.ceil((route.length-1)/Math.max(2,shipment.arrivalTick-shipment.departedTick));
  contract.stride=Math.max(1,nativeStride-(freight.band==='light'?0:freight.band==='medium'?1:2));
  return event(world,contract,'freight-accepted','本人应允承运',
    '承运人验过载重，封存自己的行粮；货未动时运费不付，行粮也未耗。',participants,contract.originId);
}

function localKnownTiles(world: WorldState, escort: Cultivator, start: MapPoint, path: MapPoint[]): Set<string> {
  const current = terrainTileAt(world, start.x, start.y);
  const known = new Set(escort.exploredTileIds);
  for (const point of path) {
    const id = tileId(world, point);
    if (id) known.add(id); // The approved road is known even though adjacent branches may not be.
  }
  if (current) for (const tile of world.terrain.tiles) {
    if (Math.abs(tile.col - current.col) + Math.abs(tile.row - current.row) <= 2) known.add(tile.id);
  }
  return known;
}

function detour(world: WorldState, contract: EscortContract, escort: Cultivator): void {
  if (contract.rationsEscrow <= 0 || contract.arrivedTick !== undefined) return;
  const current = contract.path[contract.pathIndex];
  const destination = contract.path.at(-1);
  if (!current || !destination) return;
  const route = contract.path.slice(contract.pathIndex);
  const ahead = route.slice(1).map((point) => tileId(world, point));
  const recent = world.escorts.reports.filter((report) => report.contractId === contract.id &&
    report.observedTick <= world.tick && report.expiresTick > world.tick && !contract.usedReportIds.includes(report.id) &&
    ahead.includes(report.tileId) && world.mapHazards.some((hazard) => hazard.id === report.hazardId && hazard.tileId === report.tileId && activeHazard(world, hazard)))
    .sort((a, b) => ahead.indexOf(a.tileId) - ahead.indexOf(b.tileId) || a.observedTick - b.observedTick || byId(a, b));
  const known = localKnownTiles(world, escort, current, route);
  for (const report of recent) {
    // Knowledge, not a global hazard oracle: only this valid independently reported tile is forbidden.
    const alternate = findMapPath(world, current, destination, (tile) => known.has(tile.id) && tile.id !== report.tileId);
    if (!alternate.length || alternate.length > route.length + MAX_ADDITIONAL_STEPS ||
        alternate.some((point) => tileId(world, point) === report.tileId)) continue;
    contract.path = [...contract.path.slice(0, contract.pathIndex), ...alternate];
    contract.usedReportIds.push(report.id);
    contract.detours.push({ tick: world.tick, reportId: report.id, extraSteps: Math.max(0, alternate.length - route.length) });
    contract.rationsEscrow--;
    contract.rationsSpent++;
    return;
  }
}

function directive(overrides: Partial<EscortDirective> = {}): EscortDirective {
  return { managed: false, hold: false, baselineDelay: 0, crossedTileIds: [], arrived: false, riskMultiplier: 1, forceReturn: false, ...overrides };
}

/** Called from the market before sampling this shipment, once per authoritative tick. */
export function escortDirective(world: WorldState, shipment: MarketShipment): EscortDirective | undefined {
  const contract = forShipment(world, shipment.id);
  if (!contract || shipment.status !== 'in_transit') return undefined;
  if (contract.status === 'offered') {
    if (world.tick === contract.offeredTick) {
      contract.holdAppliedTick = world.tick;
      return directive({ hold: true, baselineDelay: 1 });
    }
    if (world.tick >= contract.expiresTick) expireOffer(world, contract, '一回合内未签约，报酬退回，商队按原路线离开。');
  }
  const baselineDelay = contract.holdAppliedTick === undefined ? 0 : 1;
  if (contract.status !== 'active') return directive({ baselineDelay });
  const escort = findActor(world, contract.escortId);
  const freight=contract.freight;
  if (!escort || !live(escort) || escort.locationId !== contract.originId || !getMarket(world, contract.originId) ||
      !getMarket(world, contract.destinationId) || freight&&escort.positionPlane!==undefined) {
    if(freight&&!freight.dispatch)freight.closedBy='incapable';
    return directive({ managed: true, baselineDelay, forceReturn: true });
  }
  if(freight&&!freight.dispatch){
    const first=contract.path[0],second=contract.path[1],last=contract.path.at(-1);
    const origin=getMarket(world,contract.originId),destination=getMarket(world,contract.destinationId);
    const from=first&&tileId(world,first),to=second&&tileId(world,second);
    if(freight.dispatchByTick===undefined||world.tick>=freight.dispatchByTick||
      marketFreightCapacity(escort.realm,escort.realmStage)<freight.load||contract.rationsEscrow<1||
      !origin||!destination||!last||!from||!to||from===to||tileId(world,origin)!==from||
      tileId(world,destination)!==tileId(world,last)){
      freight.closedBy='incapable';
      return directive({managed:true,baselineDelay,forceReturn:true});
    }
    if(world.mapHazards.some(hazard=>(hazard.tileId===from||hazard.tileId===to)&&hazard.intensity>=2&&activeHazard(world,hazard)))
      return directive({managed:true,baselineDelay,hold:true});
  }
  if (contract.lastAdvancedTick !== world.tick) {
    contract.lastAdvancedTick = world.tick;
    contract.lastCrossedTileIds = [];
    if (contract.arrivedTick === undefined) {
      if(!freight||freight.dispatch)detour(world, contract, escort);
      const next = Math.min(contract.path.length - 1, contract.pathIndex + contract.stride);
      contract.lastCrossedTileIds = [...new Set(contract.path.slice(contract.pathIndex, next + 1).flatMap((point) => {
        const id = tileId(world, point);
        return id ? [id] : [];
      }))];
      contract.pathIndex = next;
      if(freight&&!freight.dispatch&&next>0){
        const first=contract.path[0],second=contract.path[1];
        const from=tileId(world,first),to=tileId(world,second);
        if(from&&to&&from!==to&&contract.lastCrossedTileIds.includes(to)){
          freight.dispatch={tick:world.tick,fromTileId:from,toTileId:to,pathIndex:1};
          contract.rationsEscrow--;contract.rationsSpent++;
          const earned=contract.feeEscrow;
          escort.spiritStones+=earned;
          contract.feePaid=earned;contract.feeEscrow=0;
          freightFunds(world,contract,'freight_dispatch',earned);
        }
      }
      if (next === contract.path.length - 1) contract.arrivedTick = world.tick;
    }
  }
  return directive({ managed: true, baselineDelay, crossedTileIds: [...contract.lastCrossedTileIds], arrived: contract.arrivedTick !== undefined,
    arrivedTick: contract.arrivedTick, riskMultiplier: ESCORT_RISK_MULTIPLIER });
}

function trimEscortState(world: WorldState): void {
  const shipmentsInTransit = new Set(world.markets.shipments.filter(({ status }) => status === 'in_transit').map(({ id }) => id));
  const terminal = new Set(world.escorts.contracts.filter((item) => item.status !== 'active' && item.status !== 'offered' &&
    !shipmentsInTransit.has(item.shipmentId)).slice(-96));
  const retainedFreight=new Set<string>();
  if(world.escorts.contracts.some(item=>item.freight)){
    for(const row of world.events){
      const id=/^evt-[0-9]+-(freight-escort-[1-9]\d*)-/.exec(row.id)?.[1];
      if(id)retainedFreight.add(id);
    }
    for(const month of world.resourceFlow.months)for(const row of month.entries)
      if(row.mechanism==='market'&&row.refId.startsWith('freight-escort-'))retainedFreight.add(row.refId);
  }
  world.escorts.contracts = world.escorts.contracts.filter((item) => item.status === 'active' || item.status === 'offered' ||
    shipmentsInTransit.has(item.shipmentId) || terminal.has(item) || !!item.freight&&retainedFreight.has(item.id));
  const retained = new Set(world.escorts.contracts.map(({ id }) => id));
  world.escorts.reports = world.escorts.reports.filter(({ contractId }) => retained.has(contractId));
}

export function settleEscortWithShipment(world: WorldState, shipment: MarketShipment): WorldEvent | null {
  const contract = forShipment(world, shipment.id);
  if (!contract || shipment.status === 'in_transit') return null;
  if (contract.status !== 'active' && contract.status !== 'offered') {
    trimEscortState(world);
    return null;
  }
  let result: WorldEvent | null = null;
  if (contract.status === 'offered') {
    if(contract.freight)contract.freight.closedBy='shipment_ended';
    expireOffer(world, contract, '货运先行结束，未签署的护镖委托退回。');
  } else {
    const escort = findActor(world, contract.escortId);
    const client = findActor(world, contract.clientId);
    const delivered = shipment.status === 'delivered' && escort && live(escort);
    const freight=contract.freight;
    if (delivered) {
      if(!freight){
        escort.spiritStones += contract.feeEscrow;
        contract.feePaid = contract.feeEscrow;
        contract.feeEscrow = 0;
      }
      escort.locationId = shipment.destinationId;
      noteTerrainVisit(world, escort);
    } else if (client&&(!freight||!freight.dispatch)) {
      client.spiritStones += contract.feeEscrow;
      freightFunds(world,contract,'freight_refund',contract.feeEscrow);
      contract.feeRefunded = contract.feeEscrow;
      contract.feeEscrow = 0;
      if(freight)freight.closedBy??='shipment_ended';
    }
    if (escort) {
      escort.herbs.earth_root += contract.rationsEscrow;
      contract.rationsReturned = contract.rationsEscrow;
      contract.rationsEscrow = 0;
    }
    contract.status = delivered ? 'delivered' : 'failed';
    contract.settledTick = world.tick;
    contract.reason = freight?freight.dispatch?
      '运费只在实过第一段后交割，不随原货结果重付或退回；未耗行粮归还。':
      '未实过任何路段，原封运费与未耗行粮分别归还。':
      delivered ? '实际到货后支付护镖报酬，归还未用行粮。' : '货运未完成护镖条件，独立报酬退回，已用行粮不退。';
    result = event(world, contract, freight?'freight-settled':'settled',
      freight?(delivered?'称重承运抵达':'称重承运已结'):delivered ? '护镖报酬交割' : '护镖委托未成', contract.reason,
      freight?[contract.clientId,freight.carrierId]:[contract.clientId, ...(escort ? [escort.id] : [])],
      delivered ? shipment.destinationId : shipment.originId);
  }
  trimEscortState(world);
  return result;
}
