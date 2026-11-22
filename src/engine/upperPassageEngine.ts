import {onLowerPlane,onUpperPassagePlane} from './upperPassageIsolation';
import type { Cultivator, LLMDecisionPayload, WorldEvent, WorldState } from '../types/world';
import { northGateRenewalApertureAuthorized } from './northGateRenewalTerms';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { northMiningIsSealed } from './northMiningCharterTerms';
import { northWellPrecinctRestricted } from './northWellRevisitTerms';
import { flowActor, recordResourceFlow } from './resourceFlowEngine';
import { routeWarningHazardValid } from './routeWarningProof';
import { completedNorthWaterWell, northWaterAddress } from './waterVeinEngine';
import { WATER_VEIN_ID, WATER_VEIN_SITE, WATER_VEIN_TILES, latestWaterRow,
  waterVeinApertureActive, waterVeinOpeningAt, waterVeinPhase } from './waterVeinTerms';
import { UPPER_PASSAGE_PATH, UPPER_PASSAGE_FEE, UPPER_PASSAGE_RELIEF_PETITION, UPPER_PASSAGE_STANDARD_PETITION,
  upperPassageId, upperPassageIndex, upperPassagePlane, upperPassageThroat,
  type UpperPassageJourney, type UpperPassageMove, type UpperPassageNodeId, type UpperPassagePetition, type UpperPassageReading } from './upperPassageTerms';

export interface UpperPassageOption {
  action:'UPPER_PASSAGE';upperPassageMove:UpperPassageMove;targetUpperPassageNodeId:UpperPassageNodeId;
}
const option=(upperPassageMove:UpperPassageMove,targetUpperPassageNodeId:UpperPassageNodeId):UpperPassageOption=>
  ({action:'UPPER_PASSAGE',upperPassageMove,targetUpperPassageNodeId});
const alive=(actor:Cultivator)=>actor.alive&&actor.hp>0;
const wallet=(actor:Cultivator,cost:number)=>Number.isFinite(actor.spiritStones)&&actor.spiritStones>=cost;
export function activeUpperPassage(world:WorldState,actorId:string):UpperPassageJourney|undefined{
  return latestWaterRow(world.upperPassage?.journeys,row=>row.actorId===actorId&&row.returnedTick===undefined&&row.deceasedTick===undefined);
}
/** Only an already dated, paid native aperture can serve the physical throat. */
export function usableUpperPassageOpening(world:WorldState,tick:number){
  const address=northWaterAddress(world), state=world.coldWaterVein;
  const gate=waterVeinOpeningAt(state,tick-1);
  if(!address||!state||state.veinId!==WATER_VEIN_ID||state.settlementId!==address.village.id||!gate||
    !waterVeinApertureActive(gate,tick)||!northGateRenewalApertureAuthorized(world,gate)||
    northMiningIsSealed(world,tick)||northWellPrecinctRestricted(world,tick)||
    (address.site.ownerSectId&&address.site.ownerSectId!==gate.sectId)||
    world.mapHazards.some(row=>row.tileId===WATER_VEIN_TILES[0]&&row.intensity>=2&&routeWarningHazardValid(world,row,tick)))return undefined;
  return completedNorthWaterWell(world,address.village.id,tick)?.id===gate.wellProjectId?gate:undefined;
}
function locallyQualified(actor:Cultivator,world:WorldState,tick:number){
  const site=northWaterAddress(world)?.site;
  return !!site&&actor.age>=18&&actor.realm!=='练气'&&(!site.ownerSectId||site.ownerSectId===actor.sectId)&&
    doctrineFoundingPhysicallyAt(world,actor,WATER_VEIN_SITE,tick)&&
    !(actor.guardAssignment&&actor.guardAssignment.expiresTick>tick);
}
function nextMovement(journey:UpperPassageJourney,move:'advance'|'turnback'){
  const from=upperPassageIndex(journey.steps.at(-1)?.nodeId??'');
  if(from<1||(move==='turnback'&&journey.direction==='inbound'))return undefined;
  const direction=move==='turnback'?'inbound':journey.direction;
  const to=from+(direction==='outbound'?1:-1);
  const nodeId=UPPER_PASSAGE_PATH[to];
  return nodeId?{nodeId,direction,crossing:upperPassageThroat(from,to)}:undefined;
}
function verifiedReading(world:WorldState,journey:UpperPassageJourney,tick:number):UpperPassageReading|undefined{
  const state=world.coldWaterVein, opening=state?.openings.find(row=>row.id===journey.openingId);
  if(!state||!opening||opening.wellProjectId!==journey.wellProjectId)return undefined;
  // An investigator may present their own consummated growing record. A lower site's private plot is not otherwise copied aboard.
  const plots=world.seedCulture.plots.filter(row=>row.ownerId===journey.actorId&&row.siteId===WATER_VEIN_SITE&&
    row.status==='harvested'&&(row.yield===0||row.yield===1)&&row.settledTick!==undefined&&row.settledTick<tick);
  for(const plot of plots){
    const sample=plot.weather.find(row=>row.tick>=opening.openedTick+2&&row.tick<opening.openedTick+6&&
      row.waterDeficit!==undefined&&row.waterDeficit>0&&row.waterDeficit===waterVeinPhase(opening,row.tick).fieldDeficit);
    if(sample?.waterDeficit!==undefined&&(plot.yield===0||plot.yield===1)&&plot.settledTick!==undefined){
      return {tick,openingId:opening.id,wellProjectId:opening.wellProjectId,veinId:WATER_VEIN_ID,siteId:WATER_VEIN_SITE,
        loss:{plotId:plot.id,sampleTick:sample.tick,fieldDeficit:sample.waterDeficit,harvestedTick:plot.settledTick,yield:plot.yield}};
    }
  }
  return {tick,openingId:opening.id,wellProjectId:opening.wellProjectId,veinId:WATER_VEIN_ID,siteId:WATER_VEIN_SITE};
}
const petitionCost=(reading:UpperPassageReading):4|10=>reading.loss?UPPER_PASSAGE_RELIEF_PETITION:UPPER_PASSAGE_STANDARD_PETITION;

export function availableUpperPassageActions(actor:Cultivator,world:WorldState,executionTick=world.tick):UpperPassageOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||!world.cultivators.includes(actor)||!alive(actor)||
    !onLowerPlane(actor)&&!onUpperPassagePlane(actor))return [];
  const journey=activeUpperPassage(world,actor.id);
  if(!actor.positionPlane){
    if(journey||!locallyQualified(actor,world,executionTick)||!wallet(actor,UPPER_PASSAGE_FEE)||!usableUpperPassageOpening(world,executionTick)||
      world.upperPassage?.journeys.some(row=>row.actorId===actor.id&&row.returnedTick===executionTick))return [];
    return [option('enter','realm-passage-lower-step')];
  }
  if(!journey||journey.steps.at(-1)?.nodeId!==actor.locationId||upperPassagePlane(journey.steps.at(-1)!.nodeId)!==actor.positionPlane||
    journey.steps.at(-1)!.tick>=executionTick||journey.reading?.tick===executionTick||journey.petition?.tick===executionTick)return [];
  const choices:UpperPassageOption[]=[];
  for(const move of ['advance','turnback'] as const){
    const target=nextMovement(journey,move);
    if(target&&(!target.crossing||usableUpperPassageOpening(world,executionTick)))choices.push(option(move,target.nodeId));
  }
  if(actor.locationId==='realm-upper-array'&&!journey.reading&&verifiedReading(world,journey,executionTick))choices.push(option('read','realm-upper-array'));
  if(actor.locationId==='realm-upper-council'&&journey.reading&&!journey.petition&&wallet(actor,petitionCost(journey.reading)))
    choices.push(option('petition','realm-upper-council'));
  return choices;
}
export function utilityUpperPassageDecision(actor:Cultivator,world:WorldState):UpperPassageOption|undefined{
  const choices=availableUpperPassageActions(actor,world);
  if(!actor.positionPlane){
    const gate=choices.length?usableUpperPassageOpening(world,world.tick):undefined;
    return gate?.openerId===actor.id&&gate.openedTick===world.tick-1&&
      actor.spiritStones>=UPPER_PASSAGE_FEE+UPPER_PASSAGE_STANDARD_PETITION+12&&
      world.playerAvatar.possessedId!==actor.id ? choices[0] : undefined;
  }
  return choices.find(row=>row.upperPassageMove==='read')??choices.find(row=>row.upperPassageMove==='petition')??choices[0];
}
function position(actor:Cultivator,nodeId:UpperPassageNodeId){
  actor.locationId=nodeId;
  const plane=upperPassagePlane(nodeId);
  if(plane)actor.positionPlane=plane;
  else delete actor.positionPlane;
}
export function resolveUpperPassageAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='UPPER_PASSAGE'||Object.keys(payload).some(key=>
    !['chosenAction','innerMonologue','spokenLine','upperPassageMove','targetUpperPassageNodeId'].includes(key)))return null;
  const selected=availableUpperPassageActions(actor,world).find(row=>row.upperPassageMove===payload.upperPassageMove&&
    row.targetUpperPassageNodeId===payload.targetUpperPassageNodeId);
  if(!selected)return null;
  const {upperPassageMove:move,targetUpperPassageNodeId:nodeId}=selected;
  const tick=world.tick, visibility={kind:'participants' as const,actorIds:[actor.id]};
  let journey=activeUpperPassage(world,actor.id);
  let title:string,description:string;
  if(move==='enter'){
    const opening=usableUpperPassageOpening(world,tick);
    if(!opening)return null;
    const id=upperPassageId(tick,actor.id);
    journey={id,actorId:actor.id,openingId:opening.id,wellProjectId:opening.wellProjectId,enteredTick:tick,
      paidStones:UPPER_PASSAGE_FEE,direction:'outbound',steps:[{tick,nodeId,direction:'outbound'}]};
    const state=world.upperPassage??={version:1,journeys:[],upperReserve:0};
    state.journeys.push(journey);actor.spiritStones-=UPPER_PASSAGE_FEE;
    recordResourceFlow(world,{kind:'consumption',mechanism:'upper_passage',reason:'realm_passage_paid',from:flowActor(actor.id),
      amount:UPPER_PASSAGE_FEE,good:'stone',refId:id,visibility});
    position(actor,nodeId);title='天门门槛验身';description='本人实付八灵石踏入第一阶，尚未抵达上界。';
  }else if(!journey)return null;
  else if(move==='advance'||move==='turnback'){
    const movement=nextMovement(journey,move);
    if(!movement)return null;
    const gate=movement.crossing?usableUpperPassageOpening(world,tick):undefined;
    if(movement.crossing&&!gate)return null;
    journey.direction=movement.direction;
    journey.steps.push({tick,nodeId,direction:journey.direction,...(gate?{crossingOpeningId:gate.id}:{})});
    position(actor,nodeId);
    if(nodeId===WATER_VEIN_SITE)journey.returnedTick=tick;
    title=nodeId===WATER_VEIN_SITE?'原身踏回寒玉井':move==='turnback'?'沿原阶折返':'天门行过一阶';
    description='本人只过相邻一阶，携物随原身，不在下界另留代身。';
  }else if(move==='read'){
    const reading=verifiedReading(world,journey,tick);
    if(!reading)return null;
    journey.reading=reading;
    title='观阵庭照见旧水线';description='阵纹指向本次过门所据的下界原井与实付开门，不把旧尺当作眼下水势。';
  }else{
    const state=world.upperPassage,reading=journey.reading;
    if(!state||!reading)return null;
    const cost=petitionCost(reading);
    actor.spiritStones-=cost;state.upperReserve+=cost;
    journey.petition={tick,paidStones:cost,readingTick:reading.tick,outcome:reading.loss?'lower_relief':'ordinary'};
    recordResourceFlow(world,{kind:'transfer',mechanism:'upper_passage',reason:'upper_array_fund_paid',from:flowActor(actor.id),
      to:{kind:'upper_passage',id:'realm-upper-council'},amount:cost,good:'stone',refId:journey.id,visibility});
    title=reading.loss?'议事廊据田册准减': '议事廊实收常例';description=reading.loss?
      '上界按见过干纹且实收不足的本人旧田册，只收四灵石入上界阵库；下界田收与水债仍按本账。':
      '无本人合格的旧田册，照常实付十灵石入上界阵库；不向下界扣款。';
  }
  return {id:`evt-${journey.id}-${move}-${tick}`,tick,year:world.year,month:world.month,category:'diplomacy',
    locationId:nodeId,actorIds:[actor.id],witnessScope:'participants',title,description};
}
/** Native mortality is independent of either realm being passable. */
export function recordUpperPassageDeath(world:WorldState,actor:Cultivator):void{
  if(!world.cultivators.includes(actor)||alive(actor)||!onUpperPassagePlane(actor))return;
  const journey=activeUpperPassage(world,actor.id);
  if(journey)journey.deceasedTick=world.tick;
}
export function settleUpperPassageMortality(world:WorldState):void{
  if(!world.upperPassage)return;
  for(const actor of world.cultivators)if(onUpperPassagePlane(actor)&&!alive(actor))recordUpperPassageDeath(world,actor);
}
export interface UpperPassageView {
  nodeId:UpperPassageNodeId;direction?:UpperPassageJourney['direction'];options:UpperPassageOption[];
  blocked?:'closed'|'fee'|'unqualified';entry?:{enteredTick:number;paidStones:number};
  reading?:UpperPassageReading;petition?:UpperPassagePetition;upperReserve?:number;
}
export function projectUpperPassage(world:WorldState,actor?:Cultivator):UpperPassageView|undefined{
  if(!actor||!world.cultivators.includes(actor)||!alive(actor)||
    !onLowerPlane(actor)&&!onUpperPassagePlane(actor))return undefined;
  const tick=world.tick+1,options=availableUpperPassageActions(actor,world,tick);
  if(!actor.positionPlane){
    if(actor.locationId!==WATER_VEIN_SITE||!northWaterAddress(world)||!world.coldWaterVein?.openings.length)return undefined;
    return {nodeId:WATER_VEIN_SITE,options,...(!options.length?
      {blocked:!locallyQualified(actor,world,tick)?'unqualified':!wallet(actor,UPPER_PASSAGE_FEE)?'fee':'closed'}:{})};
  }
  const journey=activeUpperPassage(world,actor.id),nodeId=journey?.steps.at(-1)?.nodeId;
  if(!journey||!nodeId||nodeId!==actor.locationId)return undefined;
  const gateBlocked=(['advance','turnback'] as const).some(move=>nextMovement(journey,move)?.crossing)&&!usableUpperPassageOpening(world,tick);
  const feeBlocked=actor.locationId==='realm-upper-council'&&journey.reading&&!journey.petition&&!wallet(actor,petitionCost(journey.reading));
  return {nodeId,direction:journey.direction,options,entry:{enteredTick:journey.enteredTick,paidStones:journey.paidStones},...(gateBlocked?{blocked:'closed'}:feeBlocked?{blocked:'fee'}:{}),
    ...(actor.positionPlane==='upper'?{reading:journey.reading?structuredClone(journey.reading):undefined,
      petition:journey.petition?{...journey.petition}:undefined,upperReserve:world.upperPassage?.upperReserve}:{})};
}
