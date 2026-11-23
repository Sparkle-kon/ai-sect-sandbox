import type {LastRosterEntry,LastRosterMove,LastRosterPerson} from '../types/lastRoster';
import type {WorldEvent,WorldState} from '../types/world';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {SHARE_SAVE_REDACTED_TEXT} from './shareSaveRedactionText';

export function exactLastRosterRow<T>(rows:readonly T[],check:(row:T)=>boolean) {
  let match:T|undefined;
  for(const row of rows)if(check(row)){if(match!==undefined)return;match=row;}
  return match;
}
const only=exactLastRosterRow;
const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
export const lastRosterPerson=(world:WorldState,id:string)=>only(world.cultivators,actor=>actor.id===id);
export const lastRosterSect=(world:WorldState,id:string)=>only(world.sects,sect=>sect.id===id);
export const lastRosterSite=(world:WorldState,id:string)=>{
  const site=only(world.locations,row=>row.id===id);
  return site&&site.type!=='secret_realm'&&!isScopedExpeditionGate(site)?site:undefined;
};
export const lastRosterId=(foundingId:string)=>`last-roster-${foundingId}`;
export const lastRosterMergeId=(foundingId:string,tick:number)=>`evt-${tick}-${foundingId}-maturity-merged`;
export const lastRosterReceiptId=(entry:LastRosterEntry,actorId:string,move:LastRosterMove,tick:number)=>`evt-${entry.id}-${actorId}-${move}-${tick}`;
export const lastRosterCalendar=(world:WorldState,tick:number)=>{
  const months=world.year*12+world.month-1-(world.tick-tick);
  return {year:Math.floor(months/12),month:months%12+1,tick};
};
export const LAST_ROSTER_DECISION_TURNS=2;
const mergeTitle='已由全体逐一同意并宗';
const mergeDescription='只改变签名者的宗籍，不移动人的位置；旧名、在地设施、无关账目和旧宗门记录仍可核对。';
const words={
  new_gate:{title:'走到新宗门的山门',description:'这次是本人走到新宗门的山门。并宗早已发生，这一步不另授门籍或职位。'},
  home:{title:'亲身回到故乡',description:'这次走回自己的故乡。没有注销现有的宗籍，也没有将同行写给不在场的人。'},
  stay:{title:'在旧址多留一月',description:'这一月仍在旧址。旧宗的席位没有因此复设，其他人仍各有去处。'},
};
export const lastRosterWords=(move:LastRosterMove)=>words[move];
function scope(world:WorldState,event:WorldEvent,tick:number,siteId:string|undefined,ids:readonly string[]){
  const date=lastRosterCalendar(world,tick);
  return event.tick===tick&&event.month===date.month&&event.year===date.year&&
    event.locationId===siteId&&event.witnessScope==='participants'&&event.category==='diplomacy'&&same(event.actorIds,ids);
}
function prose(event:WorldEvent,title:string,description:string,redacted=false){
  return event.title===title&&event.description===description||
    redacted&&event.title===SHARE_SAVE_REDACTED_TEXT&&event.description===SHARE_SAVE_REDACTED_TEXT;
}
export function lastRosterMergeAuthority(world:WorldState,foundingId:string){
  const founding=only(world.doctrineFoundings.foundings,row=>row.id===foundingId);
  const maturity=founding?.maturity,terminal=maturity?.settlement,offer=maturity?.offers.at(-1);
  if(!founding||founding.status!=='established'||!terminal||terminal.kind!=='merged'||!offer||offer.status!=='merged'||
    terminal.tick<1||terminal.tick>world.tick||offer.closedTick!==terminal.tick||offer.closedById!==offer.outgoingLeaderId||
    (offer.acceptedTick??Infinity)>=terminal.tick||(offer.acceptedTick??0)<=offer.openedTick||terminal.tick>=offer.expiresTick||
    terminal.receivingSectId!==founding.parentSectId||terminal.siteId!==offer.support.siteId||
    terminal.memberIds.length===0||!same(terminal.memberIds,offer.memberIds)||
    !terminal.memberIds.includes(offer.outgoingLeaderId)||terminal.memberIds.includes(offer.receivingLeaderId)||
    !terminal.memberIds.every((id,index)=>!!lastRosterPerson(world,id)&&(!index||terminal.memberIds[index-1]<id))||
    !lastRosterPerson(world,offer.receivingLeaderId)||offer.consents.length!==terminal.memberIds.length-1||
    !terminal.memberIds.filter(id=>id!==offer.outgoingLeaderId).every(id=>!!only(offer.consents,row=>
      row.actorId===id&&row.tick>offer.openedTick&&row.tick<terminal.tick)))return;
  const closed=lastRosterSect(world,founding.independentSectId),receiving=lastRosterSect(world,founding.parentSectId);
  const oldSite=lastRosterSite(world,terminal.siteId),newSite=lastRosterSite(world,offer.receivingSiteId);
  if(!closed||!receiving||closed===receiving||closed.inactiveSinceTick!==terminal.tick||closed.leaderId!==undefined||
    closed.officeVacancy!==undefined||closed.headquartersId!==terminal.siteId||!oldSite||oldSite.ownerSectId===closed.id||
    !newSite||newSite===oldSite)return;
  return {founding,terminal,offer,closed,receiving,oldSite,newSite};
}
export function lastRosterMergeEventMatches(world:WorldState,event:WorldEvent,proof:NonNullable<ReturnType<typeof lastRosterMergeAuthority>>,redacted=false){
  const {founding,terminal,offer}=proof;
  return event.id===lastRosterMergeId(founding.id,terminal.tick)&&scope(world,event,terminal.tick,undefined,
    [...terminal.memberIds,offer.receivingLeaderId])&&prose(event,mergeTitle,mergeDescription,redacted);
}

export function lastRosterHome(world:WorldState,actorId:string,closedTick:number):LastRosterPerson['home'] {
  const member=only(world.households.members,row=>row.recruitedId===actorId);
  const person=lastRosterPerson(world,actorId);
  if(!member||!person||member.registeredTick>=closedTick||
    (member.status!=='recruited'&&!(member.status==='deceased'&&!person.alive&&person.hp===0)))return;
  const village=only(world.settlements.villages,row=>row.id===member.settlementId);
  const site=village&&lastRosterSite(world,village.locationId);
  if(!village||!site)return;
  const record=only(world.settlements.records,row=>row.kind==='recruitment'&&row.settlementId===village.id&&
    row.volunteerId===member.volunteerId&&row.cultivatorId===actorId&&actorId===`recruit-${member.volunteerId}`&&
    row.tick>=member.registeredTick&&row.tick<closedTick&&row.people===1&&row.stones===25&&row.herbs===0&&
    (member.status==='recruited'?member.settledTick===row.tick:member.settledTick!==undefined&&member.settledTick>=row.tick)&&
    row.id===`settlement-${row.tick}-recruitment-${village.id}-${member.volunteerId}`);
  if(record)return {settlementId:village.id,siteId:site.id,recruitmentId:record.id};
}

export function lastRosterEntryAuthority(world:WorldState,entry:LastRosterEntry){
  const proof=lastRosterMergeAuthority(world,entry.foundingId);
  if(!proof)return;
  const {founding,terminal,offer,closed,receiving,oldSite,newSite}=proof;
  if(entry.id!==lastRosterId(founding.id)||entry.mergeEventId!==lastRosterMergeId(founding.id,terminal.tick)||
    entry.closedTick!==terminal.tick||entry.closedSectId!==closed.id||entry.closedLeaderId!==offer.outgoingLeaderId||
    entry.siteId!==oldSite.id||entry.receivingSectId!==receiving.id||entry.newGateSiteId!==newSite.id||
    !entry.people.length||!same(entry.people.map(row=>row.actorId),terminal.memberIds.filter(id=>entry.people.some(row=>row.actorId===id))))
    return;
  const events=world.events.filter(row=>row.id===entry.mergeEventId);
  if(events.length>1||events.length===1&&!lastRosterMergeEventMatches(world,events[0],proof,true))return;
  if(!events.length&&(world.events.length<120||world.events.some(row=>row.tick<entry.closedTick)))return;
  return proof;
}
export function lastRosterReceiptProof(world:WorldState,entry:LastRosterEntry,person:LastRosterPerson,redacted=false){
  const acted=person.resolution;
  if(!acted)return;
  const matches=world.events.filter(row=>row.id===acted.eventId);
  if(!matches.length)return;
  const moveWords=lastRosterWords(acted.move);
  return matches.length===1&&scope(world,matches[0],acted.tick,acted.destinationId??entry.siteId,[person.actorId])&&
    prose(matches[0],moveWords.title,moveWords.description,redacted);
}
export function validateLastRosterSave(world:WorldState,fail:(path:string)=>never){
  const entries=world.lastRosters?.entries;
  if(!entries)return;
  if(new Set(entries.map(row=>row.id)).size!==entries.length)fail('lastRosters.entries');
  const receiptIds=new Set<string>();
  for(const entry of entries){
    const verified=lastRosterEntryAuthority(world,entry);
    if(!verified)fail('lastRosters.closure');
    for(const person of entry.people){
      const original=lastRosterHome(world,person.actorId,entry.closedTick),home=person.home;
      if(home&&(!original||home.siteId!==original.siteId||home.settlementId!==original.settlementId||
        home.recruitmentId!==original.recruitmentId))fail('lastRosters.home');
      const action=person.resolution;
      if(!action)continue;
      const site=action.move==='new_gate'?entry.newGateSiteId:action.move==='home'?home?.siteId:undefined;
      if(action.tick<=entry.closedTick||action.tick>entry.closedTick+LAST_ROSTER_DECISION_TURNS||action.tick>world.tick||
        action.destinationId!==site||site===entry.siteId||action.move!=='stay'&&!site||
        action.eventId!==lastRosterReceiptId(entry,person.actorId,action.move,action.tick)||receiptIds.has(action.eventId))
        fail('lastRosters.resolution');
      const valid=lastRosterReceiptProof(world,entry,person,true);
      if(valid===false||valid!==true&&(world.events.length<120||world.events.some(row=>row.tick<action.tick)))
        fail('lastRosters.receipt');
      receiptIds.add(action.eventId);
    }
  }
  if(world.events.some(row=>row.id.startsWith('evt-last-roster-')&&!receiptIds.has(row.id)))fail('lastRosters.events');
}
