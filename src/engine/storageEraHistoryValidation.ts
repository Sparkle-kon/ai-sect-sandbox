import type { ChronicleAnchor, EraHistoryReceipt, WorldEvent, WorldState } from '../types/world';
import { eraHistoryCompatibleArchiveAnchor, eraHistoryMatchesLiveEvent, eraMigrationRecordMatches, eraWorkshopOrderMatches } from './eraHistoryIndex';

const MAX_ROWS = 8 * 1024 * 1024; // File budgets bound how many compact rows can actually be imported.
const MAX_TICK = 100_000_000;
type Fail = (path:string)=>never;
const object = (value:unknown):value is Record<string,unknown> => !!value&&typeof value==='object'&&!Array.isArray(value);
const integer = (x:unknown,min=0,max=MAX_TICK):x is number => typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
const id = (x:unknown):x is string => typeof x==='string'&&x.length>0&&x.length<=240&&!/[\u0000-\u001f\u007f]/.test(x);
const optionalId = (x:unknown):boolean => x===undefined||id(x);
function keys(row:Record<string,unknown>,required:readonly string[],optional:readonly string[]=[]): boolean {
  return required.every(key=>Object.hasOwn(row,key))&&Object.keys(row).every(key=>required.includes(key)||optional.includes(key));
}
const common=['kind','eventId','tick','year','month'];
const location=['locationId'];
type ReceiptCategory = EraHistoryReceipt['kind'];
function receiptShape(row:unknown):boolean {
  if(!object(row)||!id(row.eventId)||!integer(row.tick,1)||!integer(row.year)||!integer(row.month,1,12)||!optionalId(row.locationId))return false;
  if(row.kind==='death')return keys(row,[...common,'actorId'],location)&&id(row.actorId);
  if(row.kind==='succession')return keys(row,[...common,'sectId','leaderId','method'],[...location,'previousLeaderId'])&&
    id(row.sectId)&&id(row.leaderId)&&optionalId(row.previousLeaderId)&&row.previousLeaderId!==row.leaderId&&
    (row.method==='election'||row.method==='challenge'||row.method==='coup')&&(row.method==='election'||id(row.previousLeaderId));
  if(row.kind==='migration')return keys(row,[...common,'locationId','recordId','fromSettlementId','toSettlementId','people'])&&
    id(row.locationId)&&id(row.recordId)&&id(row.fromSettlementId)&&id(row.toSettlementId)&&row.fromSettlementId!==row.toSettlementId&&integer(row.people,1,4);
  return row.kind==='workshop'&&keys(row,[...common,'locationId','orderId','patronId','makerId','status','delivered'])&&
    id(row.locationId)&&id(row.orderId)&&id(row.patronId)&&id(row.makerId)&&row.patronId!==row.makerId&&
    (row.status==='completed'||row.status==='expired'||row.status==='cancelled')&&
    integer(row.delivered,0,2);
}
export function validateEraHistoryShape(value:unknown,path:string,fail:Fail):void {
  if(!object(value)||!keys(value,['receipts'])||!Array.isArray(value.receipts)||value.receipts.length>MAX_ROWS)return fail(path);
  value.receipts.forEach((row:unknown,i:number)=>{
    if(!receiptShape(row))fail(`${path}.receipts[${i}]`);
  });
}
function datedIdentity(row:EraHistoryReceipt):boolean {
  switch(row.kind){
    case 'death':return row.eventId.startsWith(`evt-${row.tick}-`);
    case 'succession':{
      const prefix=`evt-${row.tick}-${row.sectId}-leadership-`;
      if(row.method==='election')return row.eventId===`${prefix}vacancy-${row.leaderId}`;
      const exact=`${prefix}${row.leaderId}-`;
      return row.eventId.startsWith(exact)&&/^[1-9][0-9]*$/.test(row.eventId.slice(exact.length));
    }
    case 'migration':return row.recordId===`settlement-${row.tick}-migration-${row.fromSettlementId}-${row.toSettlementId}`&&
      row.eventId===`evt-${row.recordId}`;
    case 'workshop':{
      const prefix=`evt-workshop-${row.orderId}-${row.tick}-`;
      if(!row.eventId.startsWith(prefix))return false;
      const phase=row.eventId.slice(prefix.length);
      if(row.status==='completed')return phase==='finish-1'||phase==='finish-2';
      if(row.status==='expired')return phase==='close';
      return phase==='close'||phase==='cancel'||phase==='institution-return'||phase==='release-accepted';
    }
  }
}
function grouped<T>(rows:Iterable<T>,wanted:ReadonlySet<string>,key:(row:T)=>string): Map<string,T[]> {
  const result=new Map<string,T[]>();
  for(const value of rows){
    const id=key(value);
    if(!wanted.has(id))continue;
    const existing=result.get(id);
    if(existing)existing.push(value);else result.set(id,[value]);
  }
  return result;
}
const siteIsPublic=(site:WorldState['locations'][number]|undefined):boolean =>
  !!site&&site.type!=='secret_realm'&&site.type!=='abyss';

/** Durable receipts reference immutable identities, not a later holder or current order status inferred from prose. */
export function validateEraHistory(world:WorldState,fail:Fail):void {
  const receipts=world.eraHistory.receipts;
  if(!receipts.length)return;
  const actors=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const sects=new Set(world.sects.map(sect=>sect.id));
  const sites=new Map(world.locations.map(site=>[site.id,site]));
  const villages=new Map(world.settlements.villages.map(village=>[village.id,village]));
  const eventIds=new Set(receipts.map(row=>row.eventId));
  const migrationIds=new Set(receipts.flatMap(row=>row.kind==='migration'?[row.recordId]:[]));
  const orderIds=new Set(receipts.flatMap(row=>row.kind==='workshop'?[row.orderId]:[]));
  if(eventIds.size!==receipts.length)return fail('eraHistory.receipts.eventId');
  const originals=grouped<WorldEvent>(world.events,eventIds,event=>event.id);
  const shelf:ChronicleAnchor[]=[...world.chronicleArchive.anchors];
  for(const chapter of [...world.chronicleArchive.chapters,...world.coldHistory.chapters]){
    for(const row of chapter.anchors)if(row.tick>=chapter.startTick&&row.tick<=chapter.endTick)shelf.push(row);
  }
  const anchors=grouped(shelf,eventIds,event=>event.id);
  const nativeMigrations=grouped(world.settlements.records,migrationIds,row=>row.id);
  const nativeOrders=grouped(world.workshops.orders,orderIds,row=>row.id);
  const semantic=new Map<ReceiptCategory,Set<string>>();
  const serial=(kind:ReceiptCategory,key:string)=>{
    const set=semantic.get(kind)??new Set<string>();
    if(set.has(key))return false;
    set.add(key);semantic.set(kind,set);return true;
  };
  let previousTick=0;
  for(const row of receipts){
    // Native receipts keep their action-era date. A retained or explicitly
    // sought frame may advance its tick without using the monthly calendar.
    const future=row.year>world.year||row.year===world.year&&row.month>world.month;
    if(row.tick<previousTick||row.tick>world.tick||future||!datedIdentity(row))return fail('eraHistory.receipts.date');
    previousTick=row.tick;
    const at=row.locationId===undefined?undefined:sites.get(row.locationId);
    // Old proof will not invent coordinates for a vanished archived site. If a retained site
    // still exists, public receipt types may not label an actually secret location.
    if(row.kind!=='workshop'&&at&&!siteIsPublic(at))return fail('eraHistory.receipts.sitePrivacy');
    const current=originals.get(row.eventId)??[], archived=anchors.get(row.eventId)??[];
    if(current.length>1||current.some(event=>!eraHistoryMatchesLiveEvent(row,event))||
      row.kind!=='workshop'&&archived.some(event=>!eraHistoryCompatibleArchiveAnchor(row,event)))
      return fail('eraHistory.receipts.original');
    if(row.kind==='death'){
      const actor=actors.get(row.actorId);
      if(!actor||actor.alive||actor.hp!==0||!serial(row.kind,row.actorId))return fail('eraHistory.receipts.death');
    }else if(row.kind==='succession'){
      if(!sects.has(row.sectId)||!actors.has(row.leaderId)||row.previousLeaderId!==undefined&&!actors.has(row.previousLeaderId)||
        !serial(row.kind,JSON.stringify([row.sectId,row.tick,row.leaderId,row.method])))
        return fail('eraHistory.receipts.succession');
    }else if(row.kind==='migration'){
      const origin=villages.get(row.fromSettlementId),destination=villages.get(row.toSettlementId);
      const records=nativeMigrations.get(row.recordId)??[];
      if(!origin||!destination||origin.locationId!==row.locationId||!siteIsPublic(sites.get(origin.locationId))||
        !siteIsPublic(sites.get(destination.locationId))||!serial(row.kind,row.recordId)||
        records.length>1||records.some(value=>!eraMigrationRecordMatches(row,value)))return fail('eraHistory.receipts.migration');
    }else{
      const orders=nativeOrders.get(row.orderId)??[];
      if(!actors.has(row.patronId)||!actors.has(row.makerId)||!serial(row.kind,row.orderId)||
        // When retained, the actual terminal order must verify paid work, zero escrow, parties/site/date and status.
        row.eventId.endsWith('-release-accepted')&&orders.length!==1||
        orders.length>1||orders.some(order=>!eraWorkshopOrderMatches(row,order)))return fail('eraHistory.receipts.workshop');
    }
  }
}
