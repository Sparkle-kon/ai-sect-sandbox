import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import type {AbandonedQuarterOption,AbandonedQuarterView,AbandonedQuarterVisit} from '../types/abandonedQuarter';
import {civilianRuinAuthority,exactQuarterRow,isPrivateAbandonedQuarterEvent,originalQuarterResident,projectCivilianRuin,
  quarterId,quarterPerson,quarterReceipt,quarterReceiptAt,quarterSite} from './abandonedQuarterProof';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {knownMapLocations,terrainTileAt} from './terrainEngine';
export {isPrivateAbandonedQuarterEvent,projectCivilianRuin};
export type {AbandonedQuarterMove,AbandonedQuarterOption,AbandonedQuarterView} from '../types/abandonedQuarter';
const records=(world:WorldState)=>world.abandonedQuarters?.visits??[];
const open=(visit:AbandonedQuarterVisit)=>!visit.left&&visit.supersededTick===undefined;
const sameBody=(world:WorldState,actor:Cultivator)=>quarterPerson(world,actor.id)===actor&&actor.alive&&actor.hp>0&&actor.positionPlane===undefined;
const inPlace=(world:WorldState,actor:Cultivator,id:string)=>sameBody(world,actor)&&isGrandSiegeFighterPresent(world,actor,id);
function byPlace(world:WorldState,siteId:string){
  const village=exactQuarterRow(world.settlements.villages,row=>row.locationId===siteId);
  return village&&civilianRuinAuthority(world,village.id);
}
export function recordAbandonedQuarterMovement(world:WorldState,actor:Cultivator,fromSiteId:string):WorldEvent|undefined{
  if(actor.currentAction!=='EXPLORE'||fromSiteId===actor.locationId||!sameBody(world,actor))return;
  for(const visit of records(world))if(visit.actorId===actor.id&&open(visit)&&visit.siteId===fromSiteId&&visit.enteredTick<world.tick)
    visit.left={tick:world.tick,destinationId:actor.locationId,byChoice:false};
  if(!quarterSite(world,fromSiteId)||!inPlace(world,actor,actor.locationId))return;
  const proof=byPlace(world,actor.locationId);
  if(!proof||proof.ruinTick>=world.tick)return;
  // A later outside arrival can supersede a stale local visit but cannot date or locate its earlier departure.
  for(const prior of records(world))if(prior.actorId===actor.id&&open(prior)&&prior.enteredTick<world.tick)
    prior.supersededTick=world.tick;
  if(records(world).some(row=>row.actorId===actor.id&&open(row)))return;
  const old=originalQuarterResident(world,actor.id,proof.settlementId,proof.ruinTick);
  const visit:AbandonedQuarterVisit={id:quarterId(actor.id,proof.settlementId,world.tick),actorId:actor.id,settlementId:proof.settlementId,
    siteId:proof.siteId,enteredTick:world.tick,fromSiteId,migrationId:proof.migrationId,...(old?{formerRecruitmentId:old.id}:{})};
  (world.abandonedQuarters??={visits:[]}).visits.push(visit);
  return quarterReceipt(world,visit,'entered');
}
function nativeVisit(world:WorldState,actor:Cultivator){
  if(!sameBody(world,actor))return;
  const visit=exactQuarterRow(records(world),row=>row.actorId===actor.id&&open(row)&&row.siteId===actor.locationId);
  const source=visit&&civilianRuinAuthority(world,visit.settlementId);
  if(visit&&source?.migrationId===visit.migrationId&&inPlace(world,actor,visit.siteId))return {visit,source};
}
function leaveQuote(world:WorldState,actor:Cultivator,visit:AbandonedQuarterVisit,tick:number){
  const from=quarterSite(world,visit.siteId);
  if(!from)return;
  const eligible=knownMapLocations(world,actor).filter(to=>{
    const other=quarterSite(world,to.id),tile=terrainTileAt(world,to.x,to.y);
    return to.id!==from.id&&other===to&&!!tile&&!world.villageEvolution.villages.some(row=>row.siteId===to.id&&row.status==='ruin')&&
      !world.mapHazards.some(hazard=>hazard.tileId===tile.id&&hazard.createdTick<=tick&&hazard.expiresTick>tick);
  });
  return eligible.find(row=>row.id===visit.fromSiteId)??eligible.sort((a,b)=>Math.hypot(a.x-from.x,a.y-from.y)-Math.hypot(b.x-from.x,b.y-from.y)||
    (a.id<b.id?-1:1))[0];
}
export function availableAbandonedQuarterActions(actor:Cultivator,world:WorldState,tick=world.tick+1):AbandonedQuarterOption[]{
  if(tick!==world.tick&&tick!==world.tick+1||!world.abandonedQuarters)return [];
  const current=nativeVisit(world,actor);
  if(!current||current.visit.enteredTick>=tick||current.visit.inspectedTick===tick||current.visit.stayedTick===tick)return [];
  const {visit}=current;
  const common={action:'ABANDONED_QUARTER',targetAbandonedQuarterId:visit.id} as const;
  const choices:AbandonedQuarterOption[]=[];
  if(visit.inspectedTick===undefined)choices.push({...common,abandonedQuarterMove:'inspect'});
  if(visit.stayedTick===undefined)choices.push({...common,abandonedQuarterMove:'stay'});
  const dest=leaveQuote(world,actor,visit,tick);
  if(dest)choices.push({...common,abandonedQuarterMove:'leave',targetLocationId:dest.id});
  return choices;
}
export function resolveAbandonedQuarterAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload,
  leaveNative:(siteId:string)=>boolean):WorldEvent|null{
  if(decision.chosenAction!=='ABANDONED_QUARTER'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','abandonedQuarterMove','targetAbandonedQuarterId','targetLocationId'].includes(key)))return null;
  const option=availableAbandonedQuarterActions(actor,world,world.tick).find(row=>row.targetAbandonedQuarterId===decision.targetAbandonedQuarterId&&
    row.abandonedQuarterMove===decision.abandonedQuarterMove&&row.targetLocationId===decision.targetLocationId);
  const current=option&&nativeVisit(world,actor);
  if(!current||!option)return null;
  const {visit}=current,move=option.abandonedQuarterMove;
  if(move==='inspect')visit.inspectedTick=world.tick;
  else if(move==='stay')visit.stayedTick=world.tick;
  else{
    const target=option.targetLocationId;
    if(!target||!leaveNative(target)||actor.locationId!==target||actor.locationId===visit.siteId)return null;
    visit.left={tick:world.tick,destinationId:target,byChoice:true};
  }
  actor.currentAction='ABANDONED_QUARTER';
  return quarterReceipt(world,visit,move);
}
export function projectAbandonedQuarter(world:WorldState,actor:Cultivator):AbandonedQuarterView|undefined{
  if(!sameBody(world,actor))return;
  const options=availableAbandonedQuarterActions(actor,world);
  for(const visit of [...records(world)].reverse()){
    if(visit.actorId!==actor.id)continue;
    const site=quarterSite(world,visit.siteId),source=civilianRuinAuthority(world,visit.settlementId,visit.migrationId);
    if(!site||!source)continue;
    const base={siteId:site.id,siteName:site.name,villageName:source.villageName,
      standing:visit.formerRecruitmentId&&originalQuarterResident(world,actor.id,visit.settlementId,source.ruinTick,visit.formerRecruitmentId)
        ?'former_resident' as const:'visitor' as const,options};
    const mine=visit.left?.byChoice&&visit.left.tick===world.tick&&visit.left.destinationId===actor.locationId?'leave':
      open(visit)&&inPlace(world,actor,visit.siteId)?visit.inspectedTick===world.tick?'inspect':
        visit.stayedTick===world.tick?'stay':visit.enteredTick===world.tick?'entered':undefined:undefined;
    const receipt=mine&&quarterReceiptAt(world,visit,mine,world.tick);
    if(receipt&&(mine==='leave'||byPlace(world,visit.siteId)?.migrationId===visit.migrationId))
      return {...base,receipt:{title:receipt.title,description:receipt.description}};
    if(options.some(option=>option.targetAbandonedQuarterId===visit.id))return base;
  }
}
