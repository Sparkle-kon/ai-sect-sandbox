import type {BoundaryGapOption,BoundaryGapResponse,BoundaryGapView} from '../types/boundaryGap';
import type {BoundaryRelief,Cultivator,LLMDecisionPayload,MapHazard,WorldEvent,WorldState} from '../types/world';
import {getCurrentBoundaryCoverage} from './boundaryReliefEngine';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {terrainTileAt} from './terrainEngine';
import {GAP_HP_MAX,GAP_QI,GAP_WINDOW,gapActor,gapEventId,gapReceipt,gapRows,gapSite,gapTerminalSource,
  matchesGapReceipt,nativeRelief,onlyGap} from './boundaryGapProof';
export {isPrivateBoundaryGapEvent} from './boundaryGapProof';
export type {BoundaryGapMove,BoundaryGapOption,BoundaryGapView} from '../types/boundaryGap';

const at=(world:WorldState,actor:Cultivator,post:string)=>
  gapActor(world,actor.id)===actor&&actor.age>=18&&isGrandSiegeFighterPresent(world,actor,post);
const exactPost=(world:WorldState,row:BoundaryRelief)=>{
  const site=gapSite(world,row.postSiteId);
  return site?.type==='spirit_vein'&&site.ownerSectId===row.sectId?site:undefined;
};
function exactGap(world:WorldState,row:BoundaryRelief,observer:Cultivator,tick:number){
  const site=exactPost(world,row);
  if(!site||row.acceptedTick===undefined||row.firstGapTick===undefined||row.firstGapTick<=row.acceptedTick||
    row.firstGapTick>=tick||tick-row.firstGapTick>GAP_WINDOW||row.status==='completed'||observer.sectId!==row.sectId||
    observer.id===row.incomingId||!at(world,observer,site.id))return;
  if(getCurrentBoundaryCoverage(world,observer,site.id)?.kind!=='gap')return;
  // The chronology belongs to the real recorded gap, not a hypothetical future empty post.
  if(row.coverage.kind!=='gap'||row.coverage.tick<row.firstGapTick)return;
  return site;
}
export function availableBoundaryGapActions(actor:Cultivator,world:WorldState,tick=world.tick+1):BoundaryGapOption[]{
  if(tick!==world.tick&&tick!==world.tick+1||!actor.alive||actor.hp<=0||!world.boundaryReliefs.cases.length)return [];
  for(const row of [...world.boundaryReliefs.cases].reverse()){
    if(actor.locationId!==row.postSiteId||actor.sectId!==row.sectId||nativeRelief(world,row.id)!==row)continue;
    const site=exactGap(world,row,actor,tick);
    if(!site||gapRows(world).some(entry=>entry.reliefId===row.id&&entry.actorId===actor.id))continue;
    const base={action:'BOUNDARY_GAP',targetBoundaryGapId:row.id} as const;
    const choices:BoundaryGapOption[]=[{...base,boundaryGapMove:'refuse'},{...base,boundaryGapMove:'stay'}];
    if(actor.qiProgress>=GAP_QI){
      const target=world.cultivators.filter(candidate=>candidate.id!==actor.id&&candidate.id!==row.incomingId&&
        candidate.sectId===row.sectId&&at(world,candidate,site.id))
        .sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||(a.id<b.id?-1:1))[0]??actor;
      choices.push({...base,boundaryGapMove:'cover',targetCultivatorId:target.id});
    }
    return choices;
  }
  return [];
}
export function resolveBoundaryGapAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='BOUNDARY_GAP'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','boundaryGapMove','targetBoundaryGapId','targetCultivatorId'].includes(key)))return null;
  const option=availableBoundaryGapActions(actor,world,world.tick).find(row=>row.boundaryGapMove===decision.boundaryGapMove&&
    row.targetBoundaryGapId===decision.targetBoundaryGapId&&row.targetCultivatorId===decision.targetCultivatorId);
  const native=option&&nativeRelief(world,option.targetBoundaryGapId);
  if(!native||!option||native.firstGapTick===undefined)return null;
  const row:BoundaryGapResponse={reliefId:native.id,postSiteId:native.postSiteId,actorId:actor.id,gapTick:native.firstGapTick,
    tick:world.tick,move:option.boundaryGapMove,...(option.targetCultivatorId?{targetCultivatorId:option.targetCultivatorId}:{})};
  (world.boundaryGapResponses??={responses:[]}).responses.push(row);
  actor.currentAction='BOUNDARY_GAP';
  return gapReceipt(world,row,option.boundaryGapMove);
}
export function applyBoundaryGapCover(world:WorldState,hazard:MapHazard,target:Cultivator,nominal:number):number{
  if(!world.boundaryGapResponses||(hazard.kind!=='beast_tide'&&hazard.kind!=='cursed_miasma')||nominal<=1||
    !world.mapHazards.includes(hazard)||hazard.createdTick>=world.tick||hazard.expiresTick<=world.tick)return nominal;
  const candidates=gapRows(world).filter(row=>row.move==='cover'&&row.targetCultivatorId===target.id&&row.tick+1===world.tick)
    .sort((a,b)=>a.actorId<b.actorId?-1:1);
  if(candidates.some(row=>row.applied))return nominal;
  for(const row of candidates){
    const actor=gapActor(world,row.actorId),relief=nativeRelief(world,row.reliefId),site=actor&&relief&&exactGap(world,relief,actor,world.tick);
    if(!actor||!site||actor.qiProgress<GAP_QI||!at(world,target,site.id)||terrainTileAt(world,site.x,site.y)?.id!==hazard.tileId)continue;
    const mitigated=nominal-Math.min(GAP_HP_MAX,nominal-1);
    const cap=Math.max(0,target.hp-(hazard.kind==='beast_tide'?1:0)),delta=Math.min(nominal,cap)-Math.min(mitigated,cap);
    if(!Number.isSafeInteger(delta)||delta<=0)return nominal;
    actor.qiProgress-=GAP_QI;row.applied={tick:world.tick,hazardId:hazard.id,preventedHp:delta};return mitigated;
  }
  return nominal;
}
export function advanceBoundaryGapResponses(world:WorldState):WorldEvent[]{
  return gapRows(world).flatMap(row=>row.applied?.tick===world.tick?[gapReceipt(world,row,'applied')]:[]);
}
export function projectBoundaryGap(world:WorldState,actor:Cultivator):BoundaryGapView|undefined{
  if(gapActor(world,actor.id)!==actor||!actor.alive||actor.hp<=0||actor.positionPlane!==undefined)return;
  const options=availableBoundaryGapActions(actor,world);
  for(const row of [...world.boundaryReliefs.cases].reverse()){
    const site=exactPost(world,row);
    if(!site)continue;
    const own=gapRows(world).find(entry=>entry.reliefId===row.id&&
      (entry.actorId===actor.id||entry.applied&&entry.targetCultivatorId===actor.id));
    const appliedHere=own?.applied?.tick===world.tick;
    const selected=own?.actorId===actor.id&&own.tick===world.tick;
    const kind=appliedHere?'applied':selected?own?.move:undefined;
    if(at(world,actor,site.id)){
      const formal=getCurrentBoundaryCoverage(world,actor,site.id);
      const handover=row.status==='completed'&&row.closedTick===world.tick&&formal?.kind==='relief'&&gapTerminalSource(world,row,'handover');
      const actual=own&&kind&&onlyGap(world.events,event=>event.id===gapEventId(own,kind,world.tick));
      const receipt=actual&&own&&kind&&matchesGapReceipt(world,own,kind,world.tick,actual)?
        {title:actual.title,description:actual.description}:undefined;
      if(handover)return {siteId:site.id,siteName:site.name,status:'relieved',options:[],...(receipt?{receipt}:{})};
      if(formal?.kind==='gap'&&row.firstGapTick!==undefined&&(receipt||options.some(option=>option.targetBoundaryGapId===row.id)))
        return {siteId:site.id,siteName:site.name,status:'gap',options,...(receipt?{receipt}:{})};
    }
    if(row.closedTick===world.tick&&row.status!=='completed'&&row.firstGapTick!==undefined&&at(world,actor,row.originSiteId)){
      const returned=gapTerminalSource(world,row,'returned');
      if(returned?.actorIds.includes(actor.id))return {siteId:site.id,siteName:site.name,status:'returned',options:[],
        receipt:{title:'候补确已沿旧路退回',description:'只确认这次实际归返，没有换上另一面岗旗。'}};
    }
  }
}
