import type {LastRosterEntry,LastRosterOption} from '../types/lastRoster';
import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {apprenticeshipPhysicallyAt} from './apprenticeshipPresence';
import {knownMapLocations} from './terrainEngine';
import {exactLastRosterRow,lastRosterCalendar,lastRosterEntryAuthority,lastRosterHome,lastRosterId,lastRosterMergeAuthority,
  lastRosterMergeEventMatches,lastRosterPerson,lastRosterReceiptId,lastRosterReceiptProof,lastRosterSite,lastRosterWords,
  LAST_ROSTER_DECISION_TURNS} from './lastRosterProof';

export {validateLastRosterSave} from './lastRosterProof';
export type {LastRosterOption} from '../types/lastRoster';
export interface LastRosterView {
  id:string; siteId:string; siteName:string; closedSectName:string; closedTick:number;
  options:readonly LastRosterOption[]; receipt?:{title:string;description:string;tick:number};
}
const physicallyAt=(world:WorldState,actor:Cultivator,siteId:string,tick:number)=>
  apprenticeshipPhysicallyAt(world,actor,siteId,tick)&&!world.ascension?.trials.some(row=>row.actorId===actor.id&&!row.terminal);
export const isPrivateLastRosterEvent=(event:WorldEvent)=>event.witnessScope==='participants'&&event.id.startsWith('evt-last-roster-');
export function recordLastRosterClosure(world:WorldState,event:WorldEvent):void{
  const prefix=`evt-${world.tick}-`,suffix='-maturity-merged';
  if(event.tick!==world.tick||event.witnessScope!=='participants'||!event.id.startsWith(prefix)||!event.id.endsWith(suffix))return;
  const foundingId=event.id.slice(prefix.length,-suffix.length);
  const proof=lastRosterMergeAuthority(world,foundingId);
  if(!proof||!lastRosterMergeEventMatches(world,event,proof)||proof.receiving.inactiveSinceTick!==undefined||
    proof.receiving.headquartersId!==proof.newSite.id)return;
  const id=lastRosterId(foundingId);
  if(world.lastRosters?.entries.some(row=>row.id===id))return;
  const people=proof.terminal.memberIds.flatMap(actorId=>{
    const actor=lastRosterPerson(world,actorId);
    if(!actor||actor.sectId!==proof.receiving.id||!physicallyAt(world,actor,proof.oldSite.id,world.tick))return [];
    const home=lastRosterHome(world,actorId,world.tick);
    return [{actorId,...(home?{home}:{})}];
  });
  if(!people.length)return;
  const entry:LastRosterEntry={id,foundingId,mergeEventId:event.id,closedTick:world.tick,closedSectId:proof.closed.id,
    closedLeaderId:proof.offer.outgoingLeaderId,siteId:proof.oldSite.id,receivingSectId:proof.receiving.id,
    newGateSiteId:proof.newSite.id,people};
  (world.lastRosters??={entries:[]}).entries.push(entry);
}
export function availableLastRosterActions(actor:Cultivator,world:WorldState,tick=world.tick+1):LastRosterOption[]{
  if(tick!==world.tick&&tick!==world.tick+1)return [];
  const due=world.lastRosters?.entries.filter(row=>row.siteId===actor.locationId&&tick>row.closedTick&&tick<=row.closedTick+LAST_ROSTER_DECISION_TURNS&&
    row.people.some(row=>row.actorId===actor.id&&!row.resolution));
  if(!due?.length||lastRosterPerson(world,actor.id)!==actor||!physicallyAt(world,actor,actor.locationId,tick))return [];
  const known=new Set(knownMapLocations(world,actor).map(site=>site.id));
  return due.flatMap(entry=>{
    const proof=lastRosterEntryAuthority(world,entry);
    if(!proof)return [];
    const targetLastRosterId=entry.id;
    const options:LastRosterOption[]=[{action:'LAST_ROSTER',lastRosterMove:'stay',targetLastRosterId}];
    if(actor.sectId===proof.receiving.id&&proof.receiving.inactiveSinceTick===undefined&&proof.receiving.headquartersId===proof.newSite.id&&
      known.has(proof.newSite.id))options.unshift({action:'LAST_ROSTER',lastRosterMove:'new_gate',targetLastRosterId,targetLocationId:proof.newSite.id});
    const own=entry.people.find(row=>row.actorId===actor.id), stored=own?.home;
    const home=stored&&lastRosterHome(world,actor.id,entry.closedTick);
    if(home&&stored&&home.siteId!==entry.siteId&&home.siteId===stored.siteId&&home.recruitmentId===stored.recruitmentId&&
      home.settlementId===stored.settlementId&&known.has(home.siteId))
      options.unshift({action:'LAST_ROSTER',lastRosterMove:'home',targetLastRosterId,targetLocationId:home.siteId});
    return options;
  });
}
export function resolveLastRosterAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload,
  arriveNative:(siteId:string)=>boolean):WorldEvent|null{
  if(decision.chosenAction!=='LAST_ROSTER')return null;
  const option=availableLastRosterActions(actor,world,world.tick).find(row=>row.lastRosterMove===decision.lastRosterMove&&
    row.targetLastRosterId===decision.targetLastRosterId&&('targetLocationId' in row?row.targetLocationId:undefined)===decision.targetLocationId);
  if(!option)return null;
  const entry=exactLastRosterRow(world.lastRosters?.entries??[],row=>row.id===option.targetLastRosterId);
  const person=entry&&exactLastRosterRow(entry.people,row=>row.actorId===actor.id);
  if(!entry||!person||person.resolution)return null;
  const destination=option.lastRosterMove==='stay'?undefined:option.targetLocationId;
  if(destination&&(!arriveNative(destination)||!physicallyAt(world,actor,destination,world.tick)))return null;
  const move=option.lastRosterMove,eventId=lastRosterReceiptId(entry,actor.id,move,world.tick);
  person.resolution={move,tick:world.tick,eventId,...(destination?{destinationId:destination}:{})};
  actor.currentAction='LAST_ROSTER';
  return {...lastRosterCalendar(world,world.tick),id:eventId,...lastRosterWords(move),locationId:destination??entry.siteId,
    category:'diplomacy',actorIds:[actor.id],witnessScope:'participants'};
}

const safe=(name:string)=>name.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,'').trim().slice(0,64);
export function projectLastRoster(world:WorldState,actor:Cultivator):LastRosterView|undefined{
  if(lastRosterPerson(world,actor.id)!==actor||!physicallyAt(world,actor,actor.locationId,world.tick))return;
  const options=availableLastRosterActions(actor,world);
  for(const entry of [...(world.lastRosters?.entries??[])].reverse()){
    const person=entry.people.find(row=>row.actorId===actor.id);
    if(!person)continue;
    const actions=options.filter(row=>row.targetLastRosterId===entry.id);
    const actual=person.resolution,arrival=actual?.destinationId??entry.siteId;
    const receipt=actual&&lastRosterSite(world,arrival)&&actor.locationId===arrival&&actual.tick>=world.tick-3&&
      lastRosterReceiptProof(world,entry,person)===true?{...lastRosterWords(actual.move),tick:actual.tick}:undefined;
    if(!actions.length&&!receipt)continue;
    const proof=lastRosterEntryAuthority(world,entry);
    if(!proof)continue;
    return {id:entry.id,siteId:proof.oldSite.id,siteName:safe(proof.oldSite.name),closedSectName:safe(proof.closed.name),
      closedTick:entry.closedTick,options:actions,...(receipt?{receipt}:{})};
  }
}
