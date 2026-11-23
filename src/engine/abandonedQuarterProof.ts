import type {AbandonedQuarterVisit} from '../types/abandonedQuarter';
import type {WorldEvent,WorldState} from '../types/world';
import {supplyLegEndpoints} from './villageSupplyAccounting';
import {isScopedExpeditionGate} from './expeditionOmenTerms';

export function exactQuarterRow<T>(rows:readonly T[],predicate:(value:T)=>boolean){
  let match:T|undefined;
  for(const row of rows)if(predicate(row)){if(match!==undefined)return;match=row;}
  return match;
}
const only=exactQuarterRow;
export const quarterPerson=(world:WorldState,id:string)=>only(world.cultivators,actor=>actor.id===id);
export const quarterSite=(world:WorldState,id:string)=>{
  const place=only(world.locations,row=>row.id===id);
  return place&&place.type!=='secret_realm'&&place.type!=='abyss'&&!isScopedExpeditionGate(place)?place:undefined;
};
const calendar=(world:WorldState,tick:number)=>{const n=world.year*12+world.month-1-(world.tick-tick);return {year:Math.floor(n/12),month:n%12+1};};
function date(world:WorldState,event:Pick<WorldEvent,'year'|'month'|'tick'>,tick:number){
  const expected=calendar(world,tick);
  return event.tick===tick&&event.year===expected.year&&event.month===expected.month;
}
export function civilianRuinAuthority(world:WorldState,settlementId:string,historicalMigrationId?:string){
  const village=only(world.settlements.villages,row=>row.id===settlementId);
  const native=only(world.villageEvolution.villages,row=>row.settlementId===settlementId);
  if(!village||!native||native.siteId!==village.locationId||!quarterSite(world,native.siteId)||
    historicalMigrationId===undefined&&(village.population!==0||native.status!=='ruin'))return;
  const change=historicalMigrationId===undefined?native.changes.at(-1):
    only(native.changes,row=>row.sourceRecordId===historicalMigrationId&&row.reason==='depopulated');
  if(!change||change.to!=='ruin'||change.from==='ruin'||change.reason!=='depopulated'||change.population!==0||
    !change.sourceRecordId||change.tick>world.tick)return;
  const migration=only(world.villageEvolution.migrations,row=>row.id===change.sourceRecordId);
  if(!migration||migration.fromSettlementId!==settlementId||migration.toSettlementId===settlementId||
    migration.tick>change.tick||migration.fromBefore<=0||migration.fromAfter!==0||migration.people!==migration.fromBefore||
    migration.toAfter-migration.toBefore!==migration.people||migration.leftJuveniles!==0||migration.leftNamed!==0||
    migration.path.length<2||migration.households.reduce((count,row)=>count+row.adults,0)!==migration.people||
    new Set(migration.households.map(row=>row.householdId)).size!==migration.households.length||
    migration.id!==`settlement-${migration.tick}-migration-${settlementId}-${migration.toSettlementId}`)return;
  const transaction=only(world.settlements.records,row=>row.id===migration.id);
  const receiving=only(world.settlements.villages,row=>row.id===migration.toSettlementId);
  if(!transaction||transaction.kind!=='migration'||transaction.tick!==migration.tick||transaction.settlementId!==settlementId||
    transaction.targetSettlementId!==migration.toSettlementId||transaction.people!==migration.people||transaction.stones!==0||
    transaction.herbs!==0||!receiving||receiving.locationId===village.locationId)return;
  const a=quarterSite(world,village.locationId),b=quarterSite(world,receiving.locationId);
  const publicMove=a?.type==='market'&&b?.type==='market';
  const sourceEvents=world.events.filter(event=>event.id===`evt-${migration.id}`);
  if(sourceEvents.length>1||sourceEvents[0]&&(!date(world,sourceEvents[0],migration.tick)||
    sourceEvents[0].category!=='diplomacy'||sourceEvents[0].title!=='循已证通路迁居'||
    sourceEvents[0].description!==transaction.description||
    (publicMove?sourceEvents[0].witnessScope!==undefined||sourceEvents[0].locationId!==village.locationId||sourceEvents[0].actorIds.length>0:
      sourceEvents[0].witnessScope!=='participants'||sourceEvents[0].locationId!==undefined)))return;
  const changed=world.events.filter(event=>event.id===`evt-village-evolution-${settlementId}-${change.tick}`);
  if(changed.length>1||changed[0]&&(!date(world,changed[0],change.tick)||changed[0].category!=='diplomacy'||
    changed[0].title!=='原址成为遗址'||changed[0].locationId!==village.locationId||
    (a?.type==='market'?changed[0].witnessScope!==undefined||changed[0].actorIds.length>0:changed[0].witnessScope!=='participants')))return;
  const agreement=only(world.villageSupply.agreements,row=>row.id===migration.agreementId);
  if(!agreement?.path||agreement.acceptedTick===undefined||!agreement.legs?.some(leg=>{
    const endpoints=supplyLegEndpoints(agreement,leg.good);
    const path=leg.good==='earth_root'?agreement.path!:[...agreement.path!].reverse();
    return leg.phase==='delivered'&&leg.settledTick!==undefined&&leg.settledTick<migration.tick&&leg.settledTick>agreement.acceptedTick!&&
      endpoints.source===settlementId&&endpoints.destination===receiving.id&&leg.checkpoint===path.length-1&&
      path.length===migration.path.length&&path.every((tile,index)=>tile===migration.path[index]);
  }))return;
  const census=world.villageCensuses.periods.filter(period=>period.tick===migration.tick);
  if(census.length>1)return;
  if(census.length){
    const period=census[0],out=only(period.movements,row=>row.id===migration.id);
    const starting=only(period.opening,row=>row.villageId===settlementId);
    const ending=only(period.closing??[],row=>row.villageId===settlementId);
    if(!out||out.kind!=='migration'||out.villageId!==settlementId||out.targetVillageId!==receiving.id||
      out.people!==migration.people||!starting||starting.population<1||!ending||ending.population!==0||ending.juveniles!==0)return;
  }else if(world.tick-migration.tick<6)return;
  return {settlementId,siteId:native.siteId,villageName:native.registeredName,ruinTick:change.tick,migrationId:migration.id};
}
export function projectCivilianRuin(world:WorldState,settlementId:string){
  const proof=civilianRuinAuthority(world,settlementId);
  if(!proof||quarterSite(world,proof.siteId)?.type!=='market')return;
  const {siteId,villageName,ruinTick}=proof;
  return {settlementId,siteId,villageName,ruinTick};
}

export function originalQuarterResident(world:WorldState,actorId:string,settlementId:string,quietBefore:number,recordId?:string){
  const member=only(world.households.members,row=>row.recruitedId===actorId);
  const actor=quarterPerson(world,actorId);
  if(!member||!actor||member.settlementId!==settlementId||member.registeredTick>=quietBefore||
    (member.status!=='recruited'&&!(member.status==='deceased'&&!actor.alive&&actor.hp===0)))return;
  return only(world.settlements.records,row=>row.kind==='recruitment'&&row.settlementId===settlementId&&
    row.volunteerId===member.volunteerId&&row.cultivatorId===actorId&&actorId===`recruit-${member.volunteerId}`&&
    row.tick>=member.registeredTick&&row.tick<quietBefore&&row.people===1&&row.stones===25&&row.herbs===0&&
    (member.status==='recruited'?member.settledTick===row.tick:member.settledTick!==undefined&&member.settledTick>=row.tick)&&
    row.id===`settlement-${row.tick}-recruitment-${settlementId}-${member.volunteerId}`&&(!recordId||row.id===recordId));
}

const copy={
  entered:{title:'亲到迁空的旧村原址',description:'亲自来到旧村原址。有据可查的是民户循实路迁出，村册已空；坊市与村册并非一回事。'},
  inspect:{title:'翻看尚有凭据的旧村册',description:'本人核对迁居账目，知道旧村已空；没有把账上人名写成仍在此生活。'},
  stay:{title:'本人在旧村原址暂留',description:'只停这一月，不把驻足算作归籍，不改变原址的村册人口。'},
  leave:{title:'本人确实离开旧村原址',description:'循眼下认得的路真正离开；不替迁走的民户定下去向。'},
} as const;
type Phase=keyof typeof copy;
const idAt=(visit:AbandonedQuarterVisit,phase:Phase,tick:number)=>`evt-${visit.id}-${phase}-${tick}`;
export const quarterId=(actorId:string,settlementId:string,tick:number)=>`abandoned-quarter-${tick}-${actorId}-${settlementId}`;
export const isPrivateAbandonedQuarterEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&event.id.startsWith('evt-abandoned-quarter-');
export function quarterReceipt(world:WorldState,visit:AbandonedQuarterVisit,phase:Phase,tick=world.tick):WorldEvent{
  return {id:idAt(visit,phase,tick),tick,...calendar(world,tick),category:'diplomacy',witnessScope:'participants',
    actorIds:[visit.actorId],locationId:phase==='leave'?visit.left?.destinationId:visit.siteId,...copy[phase]};
}
function exactReceipt(world:WorldState,visit:AbandonedQuarterVisit,phase:Phase,tick:number,source:WorldEvent){
  const wanted=quarterReceipt(world,visit,phase,tick);
  return source.id===wanted.id&&date(world,source,tick)&&source.category===wanted.category&&source.witnessScope==='participants'&&
    source.actorIds.length===1&&source.actorIds[0]===visit.actorId&&source.locationId===wanted.locationId&&
    source.title===wanted.title&&source.description===wanted.description;
}
export function quarterReceiptAt(world:WorldState,visit:AbandonedQuarterVisit,phase:Phase,tick:number){
  const source=only(world.events,event=>event.id===idAt(visit,phase,tick));
  return source&&exactReceipt(world,visit,phase,tick,source)?source:undefined;
}
export function validateAbandonedQuarterSave(world:WorldState,fail:(path:string)=>never){
  const state=world.abandonedQuarters;
  if(!state)return;
  if(!state.visits.length)fail('abandonedQuarters.empty');
  const ids=new Set<string>(),known=new Set<string>();
  const lastByActor=new Map<string,AbandonedQuarterVisit>();
  const dateWithin=(tick:number,minimum:number)=>Number.isSafeInteger(tick)&&tick>=minimum&&tick<=world.tick;
  const shouldBeHot=(tick:number)=>world.events.length<120||world.events.some(row=>row.tick<tick);
  for(const visit of state.visits){
    const source=civilianRuinAuthority(world,visit.settlementId,visit.migrationId);
    const last=lastByActor.get(visit.actorId);
    if(ids.has(visit.id)||visit.id!==quarterId(visit.actorId,visit.settlementId,visit.enteredTick)||
      !quarterPerson(world,visit.actorId)||!dateWithin(visit.enteredTick,1)||!source||visit.siteId!==source.siteId||
      visit.enteredTick<=source.ruinTick||visit.siteId===visit.fromSiteId||!quarterSite(world,visit.fromSiteId)||
      last&&((last.left?.tick??last.supersededTick??Infinity)>visit.enteredTick||last.enteredTick>=visit.enteredTick||last.supersededTick!==undefined&&last.supersededTick!==visit.enteredTick)||
      visit.supersededTick!==undefined&&(!dateWithin(visit.supersededTick,visit.enteredTick+1)||!!visit.left)||
      visit.formerRecruitmentId&&!originalQuarterResident(world,visit.actorId,visit.settlementId,source.ruinTick,visit.formerRecruitmentId))
      fail('abandonedQuarters.origin');
    ids.add(visit.id);lastByActor.set(visit.actorId,visit);
    const check=(phase:Phase,tick:number)=>{
      const id=idAt(visit,phase,tick),raw=world.events.filter(row=>row.id===id);
      if(raw.length>1||!raw.length&&shouldBeHot(tick)||raw[0]&&!exactReceipt(world,visit,phase,tick,raw[0]))
        fail('abandonedQuarters.receipt');
      known.add(id);
    };
    check('entered',visit.enteredTick);
    for(const [phase,tick] of [['inspect',visit.inspectedTick],['stay',visit.stayedTick]] as const){
      if(tick===undefined)continue;
      if(!dateWithin(tick,visit.enteredTick+1)||tick>=(visit.left?.tick??visit.supersededTick??Infinity))fail('abandonedQuarters.stay');
      check(phase,tick);
    }
    if(visit.inspectedTick!==undefined&&visit.inspectedTick===visit.stayedTick)fail('abandonedQuarters.month');
    if(visit.left){
      if(!dateWithin(visit.left.tick,visit.enteredTick+1)||visit.left.destinationId===visit.siteId||
        !only(world.locations,row=>row.id===visit.left?.destinationId))fail('abandonedQuarters.departure');
      if(visit.left.byChoice)check('leave',visit.left.tick);
    }
  }
  for(const row of lastByActor.values())if(row.supersededTick!==undefined)fail('abandonedQuarters.succession');
  for(const event of world.events)if(event.id.startsWith('evt-abandoned-quarter-')&&!known.has(event.id))fail('abandonedQuarters.orphan');
}
