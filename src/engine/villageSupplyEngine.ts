import type { Cultivator, LLMDecisionPayload, LocationNode, MapPoint, MapTile, MortalSettlement, VillageSupplyAgreement,
  VillageSupplyHazardProof, VillageSupplyLeg, VillageSupplyMove, VillageSupplySigner, WorldEvent, WorldState } from '../types/world';
import { findMapPath } from './mapMotionEngine';
import { flowActor, flowGranary, flowVillageSupplyLeg, recordResourceFlow } from './resourceFlowEngine';
import { currentVisibleTileIds, knownMapLocations, terrainTileAt } from './terrainEngine';
import { granaryAt, presentAtVillageGranary, VILLAGE_GRANARY_CAPACITY } from './villageGranaryEngine';
import { villageSupplyNet, VILLAGE_SUPPLY_FEE, VILLAGE_SUPPLY_MAX_ROUTE_TILES, VILLAGE_SUPPLY_OFFER_TICKS,
  VILLAGE_SUPPLY_QUANTITY, supplyLegEndpoints, supplyLegOpen, supplyLegTile } from './villageSupplyAccounting';
export const createVillageSupplyState=():WorldState['villageSupply']=>({agreements:[],nextId:1});
export type VillageSupplyOption =
  | { action:'VILLAGE_SUPPLY';villageSupplyMove:'offer';targetSettlementId:string;targetVillageSupplyId?:never }
  | { action:'VILLAGE_SUPPLY';villageSupplyMove:Exclude<VillageSupplyMove,'offer'>;targetVillageSupplyId:string;targetSettlementId?:never };

const allowedFields=new Set(['action','chosenAction','innerMonologue','spokenLine','villageSupplyMove','targetSettlementId','targetVillageSupplyId']);
const ascii=(a:string,b:string)=>a<b?-1:a>b?1:0;
const pending=supplyLegOpen;
const liveOffer=(caseRow:VillageSupplyAgreement,tick:number)=>caseRow.status==='offered' && caseRow.offeredTick<=tick && caseRow.expiresTick>tick;
function involved(world:WorldState,id:string,tick:number) {
  return world.villageSupply.agreements.some(row=>(row.fromSettlementId===id||row.toSettlementId===id) &&
    (row.status==='active'||liveOffer(row,tick)));
}

function getVillage(world:WorldState,id:string) {
  return world.settlements.villages.find(row=>row.id===id);
}

function villageSite(world:WorldState,village:MortalSettlement|undefined):LocationNode|undefined {
  return village && world.locations.find(row=>row.id===village.locationId && row.type!=='secret_realm' && row.type!=='abyss');
}
const populated=(village:MortalSettlement|undefined):village is MortalSettlement=>!!village && Number.isSafeInteger(village.population) && village.population>0;
const feeReady=(actor:Cultivator)=>Number.isFinite(actor.spiritStones) && actor.spiritStones>=VILLAGE_SUPPLY_FEE;

function donor(world:WorldState,actor:Cultivator,village:MortalSettlement,tick:number):VillageSupplySigner|undefined {
  const receipts=granaryAt(world,village.id)?.receipts;
  if(!receipts)return undefined;
  for(let index=receipts.length-1;index>=0;index--){
    const receipt=receipts[index];
    if(receipt.actorId===actor.id&&receipt.tick<=tick&&receipt.kind!=='draw')
      return {actorId:actor.id,donationTick:receipt.tick,donationKind:receipt.kind};
  }
  return undefined;
}

function stock(world:WorldState,id:string) {
  const base=granaryAt(world,id);
  const net=villageSupplyNet(world,id);
  return {exists:!!base,roots:base?.roots??0,stones:base?.stones??0,
    reserveRoots:net.reserveRoots,reserveStones:net.reserveStones};
}
const rootRich=(value:ReturnType<typeof stock>)=>value.exists&&value.roots>=4&&value.stones<=4&&value.stones>=0;
const stoneRich=(value:ReturnType<typeof stock>)=>value.exists&&value.stones>=16&&value.roots<=1&&value.roots>=0;
function supportedSpace(atSource:ReturnType<typeof stock>,atTarget:ReturnType<typeof stock>) {
  return atSource.stones+atSource.reserveStones+VILLAGE_SUPPLY_QUANTITY.stone<=VILLAGE_GRANARY_CAPACITY.stones &&
    atTarget.roots+atTarget.reserveRoots+VILLAGE_SUPPLY_QUANTITY.earth_root<=VILLAGE_GRANARY_CAPACITY.roots;
}

const proof=(row:VillageSupplyHazardProof):VillageSupplyHazardProof=>({id:row.id,kind:row.kind,tileId:row.tileId,
  createdTick:row.createdTick,expiresTick:row.expiresTick,intensity:row.intensity});
function physicalHazard(world:WorldState,row:VillageSupplyHazardProof,tileId:string,tick:number) {
  if(row.tileId!==tileId||row.createdTick>=tick||tick>=row.expiresTick||
    (row.kind!=='beast_tide'&&row.kind!=='cursed_miasma')||!Number.isSafeInteger(row.createdTick)||
    row.createdTick<0||!Number.isSafeInteger(row.intensity)||row.intensity<1||row.intensity>3||
    row.expiresTick!==row.createdTick+(row.kind==='beast_tide'?4:6))return false;
  const naturalPrefix=`natural-beast-tide-${row.createdTick}-`;
  if(row.kind==='beast_tide'&&row.intensity===1&&row.id.startsWith(naturalPrefix))
    return world.spiritBeasts.some(beast=>beast.kind==='凶兽'&&beast.id===row.id.slice(naturalPrefix.length));
  const brushed=Number(/^hazard-([1-9]\d*)-/.exec(row.id)?.[1]);
  return Number.isSafeInteger(brushed)&&brushed<=world.interventionSequence&&row.id===`hazard-${brushed}-${tileId}`;
}
function weather(world:WorldState,tileId:string,tick:number) {
  const hits=world.mapHazards.filter(row=>physicalHazard(world,row,tileId,tick))
    .sort((a,b)=>b.intensity-a.intensity||ascii(a.id,b.id));
  const loss=hits.find(row=>row.kind==='beast_tide'&&row.intensity===3);
  const unsafe=hits.find(row=>row.intensity>=2);
  return {loss,unsafe};
}
const passable=(tile:MapTile)=>tile.biome!=='魔渊';

function acceptedPath(world:WorldState,from:LocationNode,to:LocationNode,first:Cultivator,second:Cultivator,tick:number) {
  const firstKnown=new Set([...first.exploredTileIds,...currentVisibleTileIds(world,first)]);
  const secondKnown=new Set([...second.exploredTileIds,...currentVisibleTileIds(world,second)]);
  const route=findMapPath(world,from,to,tile=>passable(tile)&&firstKnown.has(tile.id)&&secondKnown.has(tile.id) &&
    !weather(world,tile.id,tick).unsafe);
  const ids:string[]=[];
  for(const point of route) {
    const tile=terrainTileAt(world,point.x,point.y);
    if(!tile)return undefined;
    if(ids.at(-1)!==tile.id)ids.push(tile.id);
  }
  return ids.length>1&&ids.length<=VILLAGE_SUPPLY_MAX_ROUTE_TILES?ids:undefined;
}
function presentAdult(world:WorldState,actor:Cultivator,tick:number) {
  return world.cultivators.includes(actor)&&Number.isFinite(actor.age)&&actor.age>=18 ?
    presentAtVillageGranary(world,actor,tick) : undefined;
}
function acceptance(world:WorldState,actor:Cultivator,here:MortalSettlement,row:VillageSupplyAgreement,tick:number) {
  if(row.offeredTick>=tick || here.id!==row.toSettlementId || row.proposer.actorId===actor.id ||
    !feeReady(actor) || !populated(here))return undefined;
  const remote=getVillage(world,row.fromSettlementId);
  const signer=world.cultivators.find(person=>person.id===row.proposer.actorId);
  const from=villageSite(world,remote),to=villageSite(world,here);
  if(!signer||!from||!to||!populated(remote)||presentAdult(world,signer,tick)?.id!==remote.id||!feeReady(signer))return undefined;
  const a=stock(world,remote.id),b=stock(world,here.id);
  const acceptor=donor(world,actor,here,tick);
  if(!acceptor||!rootRich(a)||!stoneRich(b)||!supportedSpace(a,b))return undefined;
  const path=acceptedPath(world,from,to,signer,actor,tick);
  return path?{signer,acceptor,path}:undefined;
}
export function availableVillageSupplyActions(actor:Cultivator,world:WorldState,executionTick=world.tick):VillageSupplyOption[]{
  if(executionTick!==world.tick&&executionTick!==world.tick+1)return [];
  const here=presentAdult(world,actor,executionTick);
  if(!populated(here))return [];
  const localDonor=donor(world,actor,here,executionTick);
  if(!localDonor)return [];
  const options:VillageSupplyOption[]=[];
  for(const row of world.villageSupply.agreements){
    if(!liveOffer(row,executionTick))continue;
    const id=row.id;
    if(row.fromSettlementId===here.id&&row.proposer.actorId===actor.id) options.push({
      action:'VILLAGE_SUPPLY',villageSupplyMove:'withdraw',targetVillageSupplyId:id
    });
    if(row.toSettlementId!==here.id||row.proposer.actorId===actor.id||row.offeredTick>=executionTick)continue;
    options.push({action:'VILLAGE_SUPPLY',villageSupplyMove:'decline',targetVillageSupplyId:id});
    if(acceptance(world,actor,here,row,executionTick))options.push({action:'VILLAGE_SUPPLY',villageSupplyMove:'accept',targetVillageSupplyId:id});
  }
  if(involved(world,here.id,executionTick)||!rootRich(stock(world,here.id))||!feeReady(actor))return options;
  const known=new Set(knownMapLocations(world,actor).map(row=>row.id));
  for(const peer of world.settlements.villages){
    if(peer.id===here.id||involved(world,peer.id,executionTick)||!known.has(peer.locationId)||!villageSite(world,peer))continue;
    options.push({action:'VILLAGE_SUPPLY',villageSupplyMove:'offer',targetSettlementId:peer.id});
  }
  return options;
}
function witnesses(row:VillageSupplyAgreement,otherId?:string) {
  return [...new Set([row.proposer.actorId,...(row.acceptor?[row.acceptor.actorId]:otherId?[otherId]:[])])];
}
function event(world:WorldState,row:VillageSupplyAgreement,phase:string,title:string,description:string,extra?:string,
  locationId?:string):WorldEvent {
  return {id:`evt-${row.id}-${phase}-${world.tick}`,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',
    title,description,actorIds:witnesses(row,extra),witnessScope:'participants',...(locationId?{locationId}:{})};
}
const visibility=(row:VillageSupplyAgreement)=>({kind:'participants' as const,actorIds:witnesses(row)});

const source=(row:VillageSupplyAgreement,leg:VillageSupplyLeg)=>supplyLegEndpoints(row,leg.good).source;
const destination=(row:VillageSupplyAgreement,leg:VillageSupplyLeg)=>supplyLegEndpoints(row,leg.good).destination;
const tileAt=supplyLegTile;

export function resolveVillageSupplyAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='VILLAGE_SUPPLY'||Object.entries(payload).some(([key,val])=>val!==undefined&&
    (!allowedFields.has(key)||(key==='action'&&val!=='VILLAGE_SUPPLY'))))return null;
  const choice=availableVillageSupplyActions(actor,world).find(option=>option.villageSupplyMove===payload.villageSupplyMove&&
    option.targetSettlementId===payload.targetSettlementId&&option.targetVillageSupplyId===payload.targetVillageSupplyId);
  if(!choice)return null;
  const here=presentAdult(world,actor,world.tick)!;
  if(choice.villageSupplyMove==='offer'){
    const proposer=donor(world,actor,here,world.tick)!;
    const row:VillageSupplyAgreement={id:`village-supply-${world.villageSupply.nextId++}`,fromSettlementId:here.id,
      toSettlementId:choice.targetSettlementId,proposer,offeredTick:world.tick,expiresTick:world.tick+VILLAGE_SUPPLY_OFFER_TICKS,status:'offered'};
    world.villageSupply.agreements.push(row);
    return event(world,row,'offered','登记村镇互助邀约','本轮仅登记，未移交仓存或支付运费。',undefined,here.locationId);
  }
  const row=world.villageSupply.agreements.find(entry=>entry.id===choice.targetVillageSupplyId)!;
  if(choice.villageSupplyMove==='decline'||choice.villageSupplyMove==='withdraw'){
    row.status=choice.villageSupplyMove==='decline'?'declined':'withdrawn';
    row.closedTick=world.tick;
    return event(world,row,row.status,'未装运的互助邀约终止','未支出仓存或运费。',actor.id,here.locationId);
  }
  const ready=acceptance(world,actor,here,row,world.tick);
  if(!ready)return null;
  const make=(good:VillageSupplyLeg['good']):VillageSupplyLeg=>({good,phase:'outbound',checkpoint:0,lastAdvancedTick:world.tick});
  const fromBook=granaryAt(world,row.fromSettlementId);
  const toBook=granaryAt(world,row.toSettlementId);
  if(!fromBook||!toBook)return null;
  fromBook.roots-=VILLAGE_SUPPLY_QUANTITY.earth_root;
  toBook.stones-=VILLAGE_SUPPLY_QUANTITY.stone;
  row.acceptor=ready.acceptor;row.acceptedTick=world.tick;row.status='active';row.path=ready.path;row.legs=[make('earth_root'),make('stone')];
  for(const member of [ready.signer,actor]){
    member.spiritStones-=VILLAGE_SUPPLY_FEE;
    recordResourceFlow(world,{kind:'consumption',mechanism:'village_supply',from:flowActor(member.id),good:'stone',
      amount:VILLAGE_SUPPLY_FEE,refId:row.id,reason:'village_supply_transport',visibility:visibility(row)});
  }
  for(const leg of row.legs)recordResourceFlow(world,{kind:'transfer',mechanism:'village_supply',from:flowGranary(source(row,leg)),
    to:flowVillageSupplyLeg(row.id,leg.good),good:leg.good,amount:VILLAGE_SUPPLY_QUANTITY[leg.good],refId:row.id,
    reason:'village_supply_dispatch',visibility:visibility(row)});
  return event(world,row,'accepted','村镇双方实付并分路装运','已核验两地实际存量和途经格，费用实际支付，货物尚未抵达。',undefined,here.locationId);
}

function terminal(world:WorldState,row:VillageSupplyAgreement,leg:VillageSupplyLeg,phase:'delivered'|'returned'|'lost',
  place?:LocationNode) {
  if(!pending(leg))return undefined;
  if(phase!=='lost'){
    const store=granaryAt(world,phase==='returned'?source(row,leg):destination(row,leg));
    const bucket=leg.good==='earth_root'?'roots':'stones';
    const amount=VILLAGE_SUPPLY_QUANTITY[leg.good];
    if(!store||!Number.isSafeInteger(store[bucket])||store[bucket]<0||
      store[bucket]+amount>VILLAGE_GRANARY_CAPACITY[bucket])return undefined;
    store[bucket]+=amount;
  }
  leg.phase=phase;leg.settledTick=world.tick;
  const fields={mechanism:'village_supply' as const,from:flowVillageSupplyLeg(row.id,leg.good),good:leg.good,
    amount:VILLAGE_SUPPLY_QUANTITY[leg.good],refId:row.id,visibility:visibility(row)};
  if(phase==='lost') recordResourceFlow(world,{...fields,kind:'loss',reason:'village_supply_loss'});
  else recordResourceFlow(world,{...fields,kind:'transfer',to:flowGranary(phase==='returned'?source(row,leg):destination(row,leg)),
    reason:phase==='returned'?'village_supply_return':'village_supply_arrival'});
  const title=phase==='lost'?'核验途经兽潮货损':phase==='returned'?'互助实货返回原仓':'互助实货抵达对岸';
  const description=phase==='lost'?'在实际经过的格位遇到严重兽潮，本路货物已核验损失。':
    phase==='returned'?'此路沿实际检查点返回原仓，只退这一批在途实货。':'货物已走到该村检查点，实物计入目的仓。';
  return event(world,row,`${leg.good}-${phase}`,title,description,undefined,place?.id);
}

function turnback(world:WorldState,row:VillageSupplyAgreement,leg:VillageSupplyLeg,cause:'unsafe_next'|'destination_closed',
  hazard?:VillageSupplyHazardProof){
  leg.phase='returning';
  leg.turnback={tick:world.tick,checkpoint:leg.checkpoint,cause,...(hazard?{hazard:proof(hazard)}:{})};
  return event(world,row,`${leg.good}-turnback`,'一路互助车队转返','未到货，按已经核实的路线向原仓返回。');
}
function advanceLeg(world:WorldState,row:VillageSupplyAgreement,leg:VillageSupplyLeg):WorldEvent|undefined{
  if(!pending(leg)||leg.lastAdvancedTick>=world.tick||!row.path||row.path.length<2)return undefined;
  leg.lastAdvancedTick=world.tick;
  const length=row.path.length-1;
  const end=leg.phase==='outbound'?length:0;
  if(leg.checkpoint!==end){
    const next=leg.checkpoint+(leg.phase==='outbound'?1:-1);
    const actual=tileAt(row,leg,next);
    if(!actual||!world.terrain.tiles.some(tile=>tile.id===actual))return undefined;
    const {loss,unsafe}=weather(world,actual,world.tick);
    if(loss){
      leg.checkpoint=next;leg.loss=proof(loss);
      return terminal(world,row,leg,'lost');
    }
    if(unsafe){
      if(leg.phase==='returning')return undefined;
      const diverted=turnback(world,row,leg,'unsafe_next',unsafe);
      if(leg.checkpoint===0){
        const original=getVillage(world,source(row,leg));
        const home=villageSite(world,original);
        if(home&&terrainTileAt(world,home.x,home.y)?.id===tileAt(row,leg,0))
          return terminal(world,row,leg,'returned',home)??diverted;
      }
      return diverted;
    }
    leg.checkpoint=next;
  }
  if(leg.checkpoint!==end)return undefined;
  if(leg.phase==='outbound'){
    const target=getVillage(world,destination(row,leg)),site=villageSite(world,target);
    return populated(target)&&site&&terrainTileAt(world,site.x,site.y)?.id===tileAt(row,leg,end)?
      terminal(world,row,leg,'delivered',site):turnback(world,row,leg,'destination_closed');
  }
  const target=getVillage(world,source(row,leg)),site=villageSite(world,target);
  return target&&site&&terrainTileAt(world,site.x,site.y)?.id===tileAt(row,leg,end)?
    terminal(world,row,leg,'returned',site):undefined;
}

export function advanceVillageSupply(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const row of world.villageSupply.agreements){
    if(row.status==='offered'&&world.tick>=row.expiresTick){
      row.status='expired';row.closedTick=world.tick;
      events.push(event(world,row,'expired','无托管的村镇邀约到期','没有托管货品或支付运费。'));
    }
    if(row.status!=='active'||(row.acceptedTick??Infinity)>=world.tick||!row.legs)continue;
    for(const leg of row.legs){
      const result=advanceLeg(world,row,leg);
      if(result)events.push(result);
    }
    if(row.legs.every(leg=>!pending(leg))){row.status='completed';row.closedTick=world.tick;}
  }
  return events;
}

/** Actor-viewer contract details: only actual signers or a local adult donor eligible to respond to an open slip. */
export function projectVillageSupply(world:WorldState,viewer?:Cultivator):VillageSupplyAgreement[]{
  if(!viewer||!world.cultivators.includes(viewer))return [];
  const here=presentAdult(world,viewer,world.tick);
  const local=here&&donor(world,viewer,here,world.tick);
  return world.villageSupply.agreements.filter(row=>row.proposer.actorId===viewer.id||row.acceptor?.actorId===viewer.id||
    (local && liveOffer(row,world.tick)&&row.toSettlementId===here?.id)).map(row=>structuredClone(row));
}

export interface VillageSupplyCheckpoint {
  id:string;marker:MapPoint;route:MapPoint[];row:number;col:number;returning:boolean;
}
/** No partner identities, stock, or hidden geometry: only the visible connected route at actual physical checkpoints. */
export function visibleVillageSupplyCheckpoints(world:WorldState,visibleTiles?:ReadonlySet<string>):VillageSupplyCheckpoint[]{
  const result:VillageSupplyCheckpoint[]=[];
  if(!world.villageSupply.agreements.some(row=>row.status==='active'))return result;
  const tiles=new Map(world.terrain.tiles.map(tile=>[tile.id,tile]));
  const visible=(id:string|undefined)=>!!id&&(!visibleTiles||visibleTiles.has(id));
  const asPoint=(tile:MapTile):MapPoint=>({x:(tile.col+.5)*1000/world.terrain.columns,y:(tile.row+.5)*600/world.terrain.rows});
  for(const row of world.villageSupply.agreements){
    if(row.status!=='active'||!row.path||!row.legs)continue;
    for(const [slot,leg] of row.legs.entries()){
      if(!pending(leg))continue;
      const checkpoint=tileAt(row,leg,leg.checkpoint);
      const tile=checkpoint&&tiles.get(checkpoint);
      if(!tile||!visible(checkpoint))continue;
      const marker=asPoint(tile);
      const walk=(direction:number)=>{
        const points:MapPoint[]=[];
        for(let index=leg.checkpoint+direction;index>=0&&index<row.path!.length;index+=direction){
          const id=tileAt(row,leg,index);
          const at=id&&tiles.get(id);
          if(!at||!visible(id))break;
          points.push(asPoint(at));
        }
        return points;
      };
      result.push({id:`visible-supply-${row.id.slice(15)}-${slot+1}`,marker,route:[...walk(-1).reverse(),marker,...walk(1)],row:tile.row+1,col:tile.col+1,
       returning:leg.phase==='returning'});
    }
  }
  return result;
}
