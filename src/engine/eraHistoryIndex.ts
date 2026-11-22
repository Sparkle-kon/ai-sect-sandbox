import type {ChronicleAnchor,EraHistoryReceipt,EraHistoryState,Sect,SettlementRecord,WorkshopOrder,WorldEvent,WorldState} from '../types/world';
import {detectCampaignStop} from './campaignStopCondition';
import {isChronicleStoryFact} from './chronicleLead';

export const ERA_HISTORY_PAGE_SIZE=24;
export const createEraHistoryState=():EraHistoryState=>({receipts:[]});
export type EraHistoryQuery={kind:'actor'|'sect'|'settlement'|'workshop';id:string};
export type EraHistorySource='live_event'|'public_archive'|'native_receipt'|'source_lost';
export interface EraHistoryView {readonly receipt:EraHistoryReceipt;readonly source:EraHistorySource}
type DatedFact=ChronicleAnchor|WorldEvent;
const sameDate=(row:EraHistoryReceipt,event:DatedFact)=>row.eventId===event.id&&row.tick===event.tick&&row.year===event.year&&row.month===event.month;
const exactIds=(actual:readonly string[],expected:readonly string[])=>actual.length===expected.length&&actual.every((id,i)=>id===expected[i]);
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const safeAge=(value:number)=>Number.isSafeInteger(value)&&value>=0;
const eventDate=(event:WorldEvent)=>({eventId:event.id,tick:event.tick,year:event.year,month:event.month,
  ...(event.locationId?{locationId:event.locationId}:{})});
const realTurn=(world:WorldState,event:WorldEvent)=>event.tick===world.tick&&event.year===world.year&&event.month===world.month;
function add(world:WorldState,row:EraHistoryReceipt){
  if(!world.eraHistory.receipts.some(stored=>stored.eventId===row.eventId))world.eraHistory.receipts.push(row);
}
const publicFact=(event:DatedFact)=>isChronicleStoryFact(event,event.tick);
function visibleSite(world:WorldState,id:string|undefined){
  return id===undefined||world.locations.some(site=>site.id===id&&site.type!=='secret_realm'&&site.type!=='abyss');
}
function successionEvent(tick:number,sectId:string,leaderId:string,previousLeaderId:string|undefined,
    method:NonNullable<Sect['succession']>['method'],event:DatedFact):boolean{
  const prefix=`evt-${tick}-${sectId}-leadership-`;
  if(event.actorIds[0]!==leaderId)return false;
  if(method==='election')return event.id===`${prefix}vacancy-${leaderId}`&&event.category==='diplomacy';
  const stem=`${prefix}${leaderId}-`;
  return event.id.startsWith(stem)&&/^[1-9][0-9]*(?![\s\S])/.test(event.id.slice(stem.length))&&event.actorIds[1]===previousLeaderId&&
    (event.category==='intrigue'||event.category==='death');
}

/** Called by native monthly finalization with the full canonical producer batch, before any hot-feed loss. */
export function recordEraHistoryTurn(before:WorldState,world:WorldState,events:readonly WorldEvent[]):void{
  if(world.tick!==before.tick+1)return;
  const actual=events.filter(event=>realTurn(world,event));
  const counts=new Map<string,number>();
  for(const event of actual)counts.set(event.id,(counts.get(event.id)??0)+1);
  const current=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  for(const prior of before.cultivators){
    const actor=current.get(prior.id);
    if(!prior.alive||prior.hp<=0||!actor||actor.alive||actor.hp!==0)continue;
    const hit=detectCampaignStop({kind:'actor_died',actorId:actor.id},before,world,actual);
    const source=hit?.eventId&&actual.find(event=>event.id===hit.eventId&&counts.get(event.id)===1);
    if(!source)continue; // No public link: do not elevate an otherwise private demise.
    const {locationId,...date}=eventDate(source);
    add(world,{...date,...(locationId&&visibleSite(world,locationId)?{locationId}:{}),kind:'death',actorId:actor.id});
  }
  const former=new Map(before.sects.map(sect=>[sect.id,sect]));
  for(const sect of world.sects){
    const old=former.get(sect.id),signed=sect.succession;
    if(!old||!signed||signed.tick!==world.tick||sect.leaderId!==signed.leaderId||old.leaderId===sect.leaderId||
      signed.previousLeaderId!==old.leaderId||!current.get(signed.leaderId)?.alive)continue;
    const matches=actual.filter(event=>counts.get(event.id)===1&&publicFact(event)&&
      event.locationId===sect.headquartersId&&successionEvent(world.tick,sect.id,signed.leaderId,signed.previousLeaderId,signed.method,event));
    if(matches.length!==1)continue;
    const {locationId,...date}=eventDate(matches[0]);
    add(world,{...date,...(locationId&&visibleSite(world,locationId)?{locationId}:{}),kind:'succession',
      sectId:sect.id,leaderId:signed.leaderId,method:signed.method,
      ...(signed.previousLeaderId?{previousLeaderId:signed.previousLeaderId}:{})});
  }
}

export function eraMigrationRecordMatches(row:Extract<EraHistoryReceipt,{kind:'migration'}>,record:SettlementRecord):boolean{
  return row.recordId===record.id&&row.tick===record.tick&&record.kind==='migration'&&row.fromSettlementId===record.settlementId&&
    row.toSettlementId===record.targetSettlementId&&row.people===record.people&&record.stones===0&&record.herbs===0;
}
/** Native settlement log calls only after the actual headcount transfer was credited. */
export function recordEraMigration(world:WorldState,record:SettlementRecord,event:WorldEvent):void{
  if(record.kind!=='migration'||!record.targetSettlementId||record.targetSettlementId===record.settlementId||
    !world.settlements.records.includes(record)||!realTurn(world,event)||!publicFact(event)||event.category!=='diplomacy'||
    event.id!==`evt-${record.id}`||record.id!==`settlement-${record.tick}-migration-${record.settlementId}-${record.targetSettlementId}`||
    record.tick!==world.tick||!safeAge(record.people)||record.people<1||record.people>4||event.actorIds.length!==0||
    record.stones!==0||record.herbs!==0)return;
  const from=world.settlements.villages.find(row=>row.id===record.settlementId);
  if(!from||event.locationId!==from.locationId||!visibleSite(world,from.locationId)||
      !world.settlements.villages.some(row=>row.id===record.targetSettlementId&&visibleSite(world,row.locationId)))return;
  add(world,{...eventDate(event),kind:'migration',recordId:record.id,fromSettlementId:record.settlementId,
    toSettlementId:record.targetSettlementId,people:record.people});
}
type WorkshopHistory=Extract<EraHistoryReceipt,{kind:'workshop'}>;
function terminalWorkshop(eventId:string,id:string,tick:number,status:WorkshopHistory['status']):boolean{
  const prefix=`evt-workshop-${id}-${tick}-`;
  if(!eventId.startsWith(prefix))return false;
  const phase=eventId.slice(prefix.length);
  if(status==='completed')return phase==='finish-1'||phase==='finish-2';
  if(status==='expired')return phase==='close';
  return phase==='close'||phase==='cancel'||phase==='institution-return'||phase==='release-accepted';
}
export function eraWorkshopOrderMatches(row:WorkshopHistory,order:WorkshopOrder):boolean{
  const release=row.eventId===`evt-workshop-${order.id}-${row.tick}-release-accepted`;
  if(release!==(order.closeReason==='mutual_release')||
      release&&!order.releaseNegotiations?.some(proof=>proof.status==='accepted'&&proof.closedTick===row.tick&&
        (proof.proposerId===order.patronId&&proof.responderId===order.makerId||
          proof.proposerId===order.makerId&&proof.responderId===order.patronId)))return false;
  return row.orderId===order.id&&row.patronId===order.patronId&&row.makerId===order.makerId&&
    order.acceptedTick!==undefined&&order.acceptedTick<=row.tick&&order.settledTick===row.tick&&order.status===row.status&&
    order.siteId===row.locationId&&order.escrowStones===0&&order.escrowHerbs===0&&
    order.work.filter(work=>work.stage==='finish'&&!!work.artifactId&&!!work.feePaid).length===row.delivered&&
    terminalWorkshop(row.eventId,order.id,row.tick,row.status);
}
/** Called by the actual native terminal event producer before ordinary workshop compaction. */
export function recordEraWorkshopSettlement(world:WorldState,order:WorkshopOrder,event:WorldEvent):void{
  if(!world.workshops.orders.includes(order)||!realTurn(world,event)||event.category!=='diplomacy'||
    event.witnessScope!=='participants'||order.patronId===order.makerId||!exactIds(event.actorIds,[order.patronId,order.makerId])||
    (order.status!=='completed'&&order.status!=='expired'&&order.status!=='cancelled'))return;
  const row:WorkshopHistory={...eventDate(event),kind:'workshop',orderId:order.id,patronId:order.patronId,makerId:order.makerId,
    status:order.status,delivered:order.work.filter(work=>work.stage==='finish'&&!!work.artifactId&&!!work.feePaid).length};
  if(eraWorkshopOrderMatches(row,order))add(world,row);
}

/** Identity/contract scoping before source inspection prevents outsider counts and probe side channels. */
function related(row:EraHistoryReceipt,query:EraHistoryQuery):boolean{
  if(query.kind==='actor')return row.kind==='death'&&row.actorId===query.id||
    row.kind==='succession'&&(row.leaderId===query.id||row.previousLeaderId===query.id)||
    row.kind==='workshop'&&(row.patronId===query.id||row.makerId===query.id);
  if(query.kind==='sect')return row.kind==='succession'&&row.sectId===query.id;
  if(query.kind==='settlement')return row.kind==='migration'&&(row.fromSettlementId===query.id||row.toSettlementId===query.id);
  return row.kind==='workshop'&&row.orderId===query.id;
}
function matchesReceipt(row:EraHistoryReceipt,event:DatedFact):boolean{
  if(!sameDate(row,event)||row.locationId!==undefined&&row.locationId!==event.locationId)return false;
  if(row.kind==='death'){
    if(event.category!=='death'||!event.actorIds.includes(row.actorId))return false;
    const [first,second]=event.actorIds,prefix=`evt-${row.tick}-`;
    if(event.actorIds.length===1)return event.id===`${prefix}${row.actorId}-oldage`||
      event.id===`${prefix}${row.actorId}-tribulation-failure`||event.id.startsWith(`${prefix}beast-attack-`)||
      event.id.startsWith(prefix)&&event.id.endsWith(`-expedition-${row.actorId}`);
    if(event.actorIds.length!==2||first===second||event.id!==`${prefix}${first}-kill`)return false;
    const winner='duelWinnerId' in event?event.duelWinnerId:undefined;
    return !('duelWinnerId' in event)||((winner===first||winner===second)&&winner!==row.actorId);
  }
  if(row.kind==='succession')return successionEvent(row.tick,row.sectId,row.leaderId,row.previousLeaderId,row.method,event);
  if(row.kind==='migration')return event.category==='diplomacy'&&event.actorIds.length===0&&event.id===`evt-${row.recordId}`;
  return event.category==='diplomacy'&&exactIds(event.actorIds,[row.patronId,row.makerId])&&
    'witnessScope' in event&&event.witnessScope==='participants'&&terminalWorkshop(event.id,row.orderId,row.tick,row.status);
}
export function eraHistoryMatchesLiveEvent(row:EraHistoryReceipt,event:WorldEvent):boolean{
  if(!matchesReceipt(row,event)||(row.kind!=='workshop'&&!publicFact(event)))return false;
  if(row.kind!=='death'||event.actorIds.length!==2)return true;
  const [first,second]=event.actorIds,winner=event.duelWinnerId;
  return (winner===first||winner===second)&&winner!==row.actorId;
}
export function eraHistoryCompatibleArchiveAnchor(row:EraHistoryReceipt,event:ChronicleAnchor):boolean{
  return row.kind!=='workshop'&&publicFact(event)&&matchesReceipt(row,event);
}
export function eraHistoryMatchesArchiveAnchor(row:EraHistoryReceipt,event:ChronicleAnchor):boolean{
  return row.kind!=='workshop'&&publicFact(event)&&matchesReceipt(row,event)&&
    !(row.kind==='death'&&event.actorIds.length!==1);
}
function checksOwnNative(row:EraHistoryReceipt,world:WorldState):true|false|undefined{
  if(row.kind==='migration'){
    const native=world.settlements.records.filter(item=>item.id===row.recordId);
    return native.length===0?undefined:native.length===1&&eraMigrationRecordMatches(row,native[0]);
  }
  if(row.kind==='workshop'){
    const native=world.workshops.orders.filter(item=>item.id===row.orderId);
    return native.length===0?undefined:native.length===1&&eraWorkshopOrderMatches(row,native[0]);
  }
  return undefined;
}
function eligibleAnchors(world:WorldState,tick:number):ChronicleAnchor[]{
  const chapters=[...world.chronicleArchive.chapters,...world.coldHistory.chapters];
  return [...world.chronicleArchive.anchors,...chapters.flatMap(chapter=>chapter.endTick<=tick?
    chapter.anchors.filter(anchor=>anchor.tick>=chapter.startTick&&anchor.tick<=chapter.endTick):[])];
}

/** Only the projected status is source provenance; never exposes raw event prose or archive dialogue. */
export function projectEraHistory(world:WorldState,query:EraHistoryQuery,viewerId?:string|null,throughTick=world.tick,
    {beforeTick,before,limit=ERA_HISTORY_PAGE_SIZE}:{beforeTick?:number;before?:{tick:number;eventId:string};limit?:number}={}):EraHistoryView[]{
  if(!safeAge(throughTick)||throughTick>world.tick||beforeTick!==undefined&&!safeAge(beforeTick)||
      before!==undefined&&(!safeAge(before.tick)||!before.eventId)||!safeAge(limit)||limit<1||limit>100)return [];
  const viewers=viewerId?world.cultivators.filter(row=>row.id===viewerId):[];
  const authorized= viewers.length===1?viewers[0].id:undefined;
  const rows=world.eraHistory.receipts.filter(row=>row.tick<=throughTick&&(beforeTick===undefined||row.tick<beforeTick)&&
    (!before||row.tick<before.tick||row.tick===before.tick&&compare(row.eventId,before.eventId)>0)&&related(row,query)&&
    (row.kind!=='workshop'||authorized===row.patronId||authorized===row.makerId));
  const idSet=new Set(rows.map(row=>row.eventId));
  const native=new Map<string,WorldEvent[]>(),archived=new Map<string,ChronicleAnchor[]>();
  for(const event of world.events)if(idSet.has(event.id))native.set(event.id,[...(native.get(event.id)??[]),event]);
  for(const event of eligibleAnchors(world,throughTick))if(idSet.has(event.id))archived.set(event.id,[...(archived.get(event.id)??[]),event]);
  return rows.sort((a,b)=>b.tick-a.tick||compare(a.eventId,b.eventId)).flatMap((row):EraHistoryView[]=>{
    const original=native.get(row.eventId)??[],anchor=archived.get(row.eventId)??[];
    const structured=checksOwnNative(row,world);
    const sourceFingerprint=(event:ChronicleAnchor)=>JSON.stringify([event.id,event.tick,event.year,event.month,
      event.category,event.locationId,event.actorIds,event.title,event.description]);
    const conflictingArchive=anchor.length>1&&new Set(anchor.map(sourceFingerprint)).size>1;
    if(structured===false||conflictingArchive||original.length>1||original.some(event=>!eraHistoryMatchesLiveEvent(row,event))||
      row.kind!=='workshop'&&anchor.some(event=>!matchesReceipt(row,event)||!publicFact(event)))return [];
    const source:EraHistorySource=original.length?'live_event':anchor.some(event=>eraHistoryMatchesArchiveAnchor(row,event))?'public_archive':
      structured?'native_receipt':'source_lost';
    return [{receipt:{...row},source}];
  }).slice(0,limit);
}
