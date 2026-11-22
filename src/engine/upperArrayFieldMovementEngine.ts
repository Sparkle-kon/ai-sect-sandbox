import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {flowActor,recordResourceFlow} from './resourceFlowEngine';
import {latestUpperArrayFieldVisit,upperArrayFieldActedOutsideGeography,upperArrayFieldCouncilOffset,upperArrayFieldEdge,upperArrayFieldMovementEventId,
  upperArrayFieldResidenceId,upperArrayFieldSite,upperArrayFieldVisitId,UPPER_ARRAY_FIELD_CHART,UPPER_ARRAY_FIELD_COUNCIL,
  UPPER_ARRAY_FIELD_EDGES,UPPER_ARRAY_FIELD_ENTRY_STONES,UPPER_ARRAY_FIELD_GATE,UPPER_ARRAY_FIELD_HOME,
  UPPER_ARRAY_FIELD_HOME_ROOTS,UPPER_ARRAY_FIELD_HOME_STONES,UPPER_ARRAY_FIELD_REGION,UPPER_ARRAY_FIELD_SITES,
  type UpperArrayFieldMovementOption,type UpperArrayFieldResidence,type UpperArrayFieldSite,type UpperArrayFieldState} from './upperArrayFieldTerms';
import type {UpperPassageJourney} from './upperPassageTerms';

export type {UpperArrayFieldMovementOption} from './upperArrayFieldTerms';
const living=(actor:Cultivator)=>actor.alive&&actor.hp>0;
const represented=(world:WorldState,actor:Cultivator)=>world.cultivators.includes(actor)&&actor.positionPlane==='upper'&&living(actor)&&actor.age>=18;
const current=(world:WorldState,tick:number)=>tick===world.tick||tick===world.tick+1;
const wallet=(actor:Cultivator,stones:number)=>Number.isSafeInteger(actor.spiritStones)&&actor.spiritStones>=stones;
function ownSanctionedJourney(world:WorldState,actorId:string,tick:number):UpperPassageJourney|undefined{
  const rows=world.upperPassage?.journeys;
  if(rows)for(let i=rows.length-1;i>=0;i--){
    const row=rows[i],last=row.steps.at(-1);
    if(row.actorId!==actorId)continue;
    return row.returnedTick===undefined&&row.deceasedTick===undefined&&row.reading&&row.petition&&
      row.petition.readingTick===row.reading.tick&&row.petition.tick<tick&&
      last?.nodeId===UPPER_ARRAY_FIELD_COUNCIL&&last.tick<tick&&row.direction==='outbound'?row:undefined;
  }
  return undefined;
}
export function ensureUpperArrayFieldState(world:WorldState):UpperArrayFieldState{
  return world.upperArrayField??={version:1,visits:[],residences:[]};
}
export function activeUpperArrayFieldVisit(world:WorldState,actorId:string){
  const visit=latestUpperArrayFieldVisit(world.upperArrayField,actorId);
  return visit&&visit.exitedTick===undefined&&visit.deceasedTick===undefined?visit:undefined;
}
export function upperArrayFieldResidence(world:WorldState,actorId:string):UpperArrayFieldResidence|undefined{
  return world.upperArrayField?.residences.find(row=>row.actorId===actorId);
}
export function upperArrayFieldPhysicalSite(world:WorldState,actor:Cultivator,tick=world.tick):UpperArrayFieldSite|undefined{
  if(!represented(world,actor)||!current(world,tick))return undefined;
  const journey=ownSanctionedJourney(world,actor.id,tick);
  const visit=journey&&upperArrayFieldCouncilOffset(world.upperArrayField,actor.id,journey.id,actor.locationId);
  const last=visit?.steps.at(-1);
  return visit&&visit.deceasedTick===undefined&&last&&last.tick<=tick?upperArrayFieldSite(last.siteId):undefined;
}
export function upperArrayFieldActedOnGeography(world:WorldState,actorId:string,tick:number):boolean{
  const row=latestUpperArrayFieldVisit(world.upperArrayField,actorId);
  return row?.steps.at(-1)?.tick===tick||row?.exitedTick===tick||upperArrayFieldResidence(world,actorId)?.settledTick===tick;
}
const option=(upperArrayFieldMove:'enter'|'travel'|'settle',targetUpperArrayFieldSiteId:UpperArrayFieldSite['id']):UpperArrayFieldMovementOption=>
  ({action:'UPPER_ARRAY_FIELD',upperArrayFieldMove,targetUpperArrayFieldSiteId});
export function availableUpperArrayFieldMovementActions(actor:Cultivator,world:WorldState,executionTick=world.tick):UpperArrayFieldMovementOption[]{
  if(!current(world,executionTick)||!represented(world,actor)||upperArrayFieldActedOnGeography(world,actor.id,executionTick)||
    upperArrayFieldActedOutsideGeography(world,actor.id,executionTick))return [];
  const journey=ownSanctionedJourney(world,actor.id,executionTick);
  if(!journey)return [];
  const visit=latestUpperArrayFieldVisit(world.upperArrayField,actor.id);
  if(actor.locationId===UPPER_ARRAY_FIELD_COUNCIL){
    if(visit&&visit.exitedTick===undefined||!wallet(actor,UPPER_ARRAY_FIELD_ENTRY_STONES))return [];
    return [option('enter',UPPER_ARRAY_FIELD_GATE)];
  }
  const site=upperArrayFieldPhysicalSite(world,actor,executionTick);
  if(!site)return [];
  const choices=UPPER_ARRAY_FIELD_EDGES.flatMap(([a,b])=>a===site.id?[option('travel',b)]:b===site.id?[option('travel',a)]:[]);
  if(site.id===UPPER_ARRAY_FIELD_GATE)choices.push({action:'UPPER_ARRAY_FIELD',upperArrayFieldMove:'exit',targetUpperArrayFieldSiteId:UPPER_ARRAY_FIELD_COUNCIL});
  if(site.id===UPPER_ARRAY_FIELD_HOME&&!upperArrayFieldResidence(world,actor.id)&&wallet(actor,UPPER_ARRAY_FIELD_HOME_STONES)&&
    Number.isSafeInteger(actor.herbs.earth_root)&&actor.herbs.earth_root>=UPPER_ARRAY_FIELD_HOME_ROOTS)
    choices.push(option('settle',UPPER_ARRAY_FIELD_HOME));
  return choices;
}
function spend(world:WorldState,actor:Cultivator,refId:string,move:'enter'|'settle'){
  const amount=move==='enter'?UPPER_ARRAY_FIELD_ENTRY_STONES:UPPER_ARRAY_FIELD_HOME_STONES;
  const reason=move==='enter'?'upper_array_field_entry_paid':'upper_array_field_home_paid';
  const visibility={kind:'participants' as const,actorIds:[actor.id]};
  actor.spiritStones-=amount;
  recordResourceFlow(world,{kind:'consumption',mechanism:'upper_array_field',reason,from:flowActor(actor.id),amount,good:'stone',refId,visibility});
  if(move==='settle'){
    actor.herbs.earth_root-=UPPER_ARRAY_FIELD_HOME_ROOTS;
    recordResourceFlow(world,{kind:'consumption',mechanism:'upper_array_field',reason,from:flowActor(actor.id),
      amount:UPPER_ARRAY_FIELD_HOME_ROOTS,good:'earth_root',refId,visibility});
  }
}
export function resolveUpperArrayFieldMovementAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='UPPER_ARRAY_FIELD'||Object.keys(payload).some(key=>
    !['chosenAction','innerMonologue','spokenLine','upperArrayFieldMove','targetUpperArrayFieldSiteId'].includes(key)))return null;
  const selected=availableUpperArrayFieldMovementActions(actor,world).find(row=>row.upperArrayFieldMove===payload.upperArrayFieldMove&&
    row.targetUpperArrayFieldSiteId===payload.targetUpperArrayFieldSiteId);
  if(!selected)return null;
  const {upperArrayFieldMove:move,targetUpperArrayFieldSiteId:siteId}=selected,tick=world.tick;
  let ref:string,title:string,description:string;
  if(move==='enter'){
    const journey=ownSanctionedJourney(world,actor.id,tick);
    if(!journey||siteId!==UPPER_ARRAY_FIELD_GATE)return null;
    ref=upperArrayFieldVisitId(tick,actor.id);
    ensureUpperArrayFieldState(world).visits.push({id:ref,actorId:actor.id,journeyId:journey.id,enteredTick:tick,
      paidStones:UPPER_ARRAY_FIELD_ENTRY_STONES,steps:[{tick,siteId}]});
    spend(world,actor,ref,move);
    actor.locationId=siteId;
    title='议廊验令入阵原';description='原身从议廊进入阵原门，实付四灵石。旧界路仍在原处，不另立代身。';
  }else{
    const visit=latestUpperArrayFieldVisit(world.upperArrayField,actor.id);
    if(!visit||visit.exitedTick!==undefined||visit.deceasedTick!==undefined||!world.upperArrayField)return null;
    ref=visit.id;
    if(move==='travel'){
      visit.steps.push({tick,siteId});
      actor.locationId=siteId;
      title='踏阵原邻径';description='原身只按实通的阵原地边走过一格，随身物不留在旧址。';
    }else if(move==='exit'){
      visit.exitedTick=tick;actor.locationId=siteId;
      title='由阵原门回议廊';description='沿原门退回议廊。下界门槛仍按真实开闭，不因退场而重开。';
    }else{
      if(siteId!==UPPER_ARRAY_FIELD_HOME)return null;
      ref=upperArrayFieldResidenceId(tick,actor.id);
      world.upperArrayField.residences.push({id:ref,actorId:actor.id,visitId:visit.id,homeSiteId:siteId,settledTick:tick,
        paidStones:UPPER_ARRAY_FIELD_HOME_STONES,paidRoots:UPPER_ARRAY_FIELD_HOME_ROOTS});
      spend(world,actor,ref,move);
      title='在结庐台立住籍';description='本人携一株地根并付四灵石，为自己立一处可居住脚，不取得整片阵原。';
    }
  }
  return {id:upperArrayFieldMovementEventId(ref,move,tick),tick,year:world.year,month:world.month,category:'diplomacy',
    locationId:siteId,actorIds:[actor.id],witnessScope:'participants',title,description};
}
export function recordUpperArrayFieldDeath(world:WorldState,actor:Cultivator):void{
  if(actor.positionPlane!=='upper'||living(actor)||!world.cultivators.includes(actor))return;
  const visit=latestUpperArrayFieldVisit(world.upperArrayField,actor.id);
  if(visit&&visit.exitedTick===undefined&&visit.deceasedTick===undefined&&visit.steps.at(-1)?.siteId===actor.locationId)visit.deceasedTick=world.tick;
}
export interface UpperArrayFieldMovementView {
  scope:'council'|'field';chartId:typeof UPPER_ARRAY_FIELD_CHART;regionId:typeof UPPER_ARRAY_FIELD_REGION;
  options:UpperArrayFieldMovementOption[];visibleSites:UpperArrayFieldSite[];site?:UpperArrayFieldSite;
  visit?:{enteredTick:number;paidStones:4};residence?:UpperArrayFieldResidence;blocked?:'fee';
}
export function projectUpperArrayFieldMovement(world:WorldState,actor?:Cultivator):UpperArrayFieldMovementView|undefined{
  if(!actor||!represented(world,actor)||!ownSanctionedJourney(world,actor.id,world.tick+1))return undefined;
  const common={chartId:UPPER_ARRAY_FIELD_CHART,regionId:UPPER_ARRAY_FIELD_REGION,
    options:availableUpperArrayFieldMovementActions(actor,world,world.tick+1)};
  if(actor.locationId===UPPER_ARRAY_FIELD_COUNCIL)return {scope:'council',...common,visibleSites:[],
    ...(wallet(actor,UPPER_ARRAY_FIELD_ENTRY_STONES)?{}:{blocked:'fee'})};
  const site=upperArrayFieldPhysicalSite(world,actor),visit=latestUpperArrayFieldVisit(world.upperArrayField,actor.id);
  if(!site||!visit)return undefined;
  const residence=upperArrayFieldResidence(world,actor.id);
  return {scope:'field',...common,site:{...site},visit:{enteredTick:visit.enteredTick,paidStones:visit.paidStones},
    visibleSites:UPPER_ARRAY_FIELD_SITES.filter(row=>row.id===site.id||upperArrayFieldEdge(row.id,site.id)).map(row=>({...row})),
    ...(residence?{residence:{...residence}}:{})};
}
