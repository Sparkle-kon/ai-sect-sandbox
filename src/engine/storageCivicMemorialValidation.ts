import type { CivicReliefDeed,WorldState } from '../types/world';
import { CIVIC_MEMORIAL_COST,CIVIC_MEMORIAL_OFFER_TICKS } from './civicMemorialEngine';
import { SETTLEMENT_RELIEF } from './settlementReliefTerms';
import { VILLAGE_GRANARY_RECEIPT_LIMIT } from './villageGranaryEngine';
import { CHRONICLE_ERRATA_WINDOW } from './chronicleErrataEngine';

export function validateCivicMemorialHistory(world:WorldState,people:ReadonlySet<string>,fail:(path:string)=>never):void {
  const {deeds,memorials,nextDeedId,nextMemorialId}=world.civicMemorials;
  if(!deeds.length&&!memorials.length){
    if(world.resourceFlow.months.some(month=>month.entries.some(row=>row.mechanism==='civic_memorial'||row.reason==='civic_memorial_supplies')))
      fail('civicMemorials.memorials.journal');
    return;
  }
  const byDeed=new Map<string,CivicReliefDeed>(), sourceIds=new Set<string>();
  const villages=new Map(world.settlements.villages.map((row)=>[row.id,row]));
  const sites=new Map(world.locations.map((row)=>[row.id,row]));
  const members=new Map(world.households.members.map((row)=>[row.volunteerId,row]));
  const actors=new Map(world.cultivators.map((row)=>[row.id,row]));
  const books=new Map(world.villageGranaries.granaries.map((row)=>[row.settlementId,row]));
  const sourceReceipts=new Map(world.settlements.records.map((row)=>[row.id,row]));
  const latestRelief=new Map(world.chronicleErrata.sources.map((row)=>[row.sourceEventId,row]));
  const rawRetellings=new Map(world.chronicleErrata.retellings.map((row)=>[row.id,row]));
  const rawCorrections=new Map(world.chronicleErrata.corrections.map((row)=>[row.id,row]));
  const serial=(id:string,shape:RegExp,next:number)=>{
    const number=Number(shape.exec(id)?.[1]);return Number.isSafeInteger(number) && number<next;
  };
  for(const deed of deeds) {
    const {id,reliefRecordId,settlementId,siteId,subjectId,volunteerId,householdId,enrolledTick,tick,name,stones,herbs,witnessIds}=deed;
    const member=members.get(volunteerId), actor=actors.get(subjectId), site=sites.get(siteId);
    if(!serial(id,/^civic-deed-([1-9]\d*)$/,nextDeedId)||byDeed.has(id)||sourceIds.has(reliefRecordId)||
        reliefRecordId!==`settlement-${tick}-relief-${settlementId}-${subjectId}`||
        !site||site.type==='secret_realm'||site.type==='abyss'||villages.get(settlementId)?.locationId!==siteId||
        subjectId!==`recruit-${volunteerId}`||actor?.name!==name||!member||member.householdId!==householdId||
        member.recruitedId!==subjectId||member.settlementId!==settlementId||member.registeredTick>enrolledTick||enrolledTick>=tick||
        (member.status==='recruited'?member.settledTick!==enrolledTick:
          member.status!=='deceased'||member.settledTick===undefined||member.settledTick<tick)||
        tick>world.tick||stones!==SETTLEMENT_RELIEF.stones||herbs!==SETTLEMENT_RELIEF.jade_leaf||
        !witnessIds.length||new Set(witnessIds).size!==witnessIds.length||
        witnessIds.some((witness)=>witness===subjectId||!people.has(witness)))
      return fail('civicMemorials.deeds.identity');
    const original=sourceReceipts.get(reliefRecordId);
    if(original ? original.kind!=='relief'||original.actorId!==subjectId||original.settlementId!==settlementId||
        original.tick!==tick||original.stones!==stones||original.herbs!==herbs||original.people!==0 :
        (world.settlements.records.length<96||(world.settlements.records[0]?.tick ?? Infinity)<tick))
      fail('civicMemorials.deeds.source');
    const eventId=`evt-${reliefRecordId}`;
    if(world.events.some(row=>row.id===eventId&&(row.category!=='diplomacy'||row.tick!==tick||row.locationId!==siteId||
        row.witnessScope==='participants'||row.actorIds.length!==1||row.actorIds[0]!==subjectId)))
      fail('civicMemorials.deeds.public');
    byDeed.set(id,deed);sourceIds.add(reliefRecordId);

    const {errata}=deed;
    if(!errata)continue;
    const native=latestRelief.get(eventId), ids=new Set<string>();
    if(site.type!=='market'||new Set(errata.retellings.map(row=>row.reading)).size<2||
        (native && (native.kind!=='relief'||native.actorId!==subjectId||native.settlementId!==settlementId||native.locationId!==siteId||
          native.tick!==tick||native.stones!==stones||native.herbs!==herbs))) fail('civicMemorials.errata.source');
    for(const row of errata.retellings){
      const raw=rawRetellings.get(row.id);
      if(!serial(row.id,/^chronicle-retelling-([1-9]\d*)$/,world.chronicleErrata.nextId)||ids.has(row.id)||
          row.tick<tick||row.tick>world.tick||row.tick-tick>=CHRONICLE_ERRATA_WINDOW||
          (raw && (raw.sourceEventId!==eventId||raw.tick!==row.tick||raw.reading.kind!=='relief'||raw.reading.delivery!==row.reading))||
          (!raw && native && world.tick-tick<CHRONICLE_ERRATA_WINDOW))
        fail('civicMemorials.errata.readings');
      ids.add(row.id);
    }
    if(errata.correction){
      const row=errata.correction, raw=rawCorrections.get(row.id);
      if(!serial(row.id,/^chronicle-correction-([1-9]\d*)$/,world.chronicleErrata.nextId)||
          row.tick>world.tick||row.tick-tick>=CHRONICLE_ERRATA_WINDOW||
          !errata.retellings.some(item=>item.tick<row.tick&&item.reading==='unfunded')||
          (raw && (raw.sourceEventId!==eventId||raw.tick!==row.tick||raw.reading.kind!=='relief'||raw.reading.delivery!=='full_supplies'))||
          (!raw && native && world.tick-tick<CHRONICLE_ERRATA_WINDOW))
        fail('civicMemorials.errata.correction');
    }
  }
  const memorialIds=new Set<string>(), currentSubjects=new Set<string>(),
    verificationById=new Map<string,{tick:number;proposerId:string;verifierId:string}>();
  for(const row of memorials) {
    const deed=byDeed.get(row.deedId);
    if(!deed||!serial(row.id,/^civic-memorial-([1-9]\d*)$/,nextMemorialId)||memorialIds.has(row.id)||
        row.proposerId===deed.subjectId||!people.has(row.proposerId)||row.openedTick<deed.tick||row.openedTick>world.tick||
        row.expiresTick!==row.openedTick+CIVIC_MEMORIAL_OFFER_TICKS||row.proposerDonationTick>row.openedTick||
        (row.status==='proposed'&&world.tick>=row.expiresTick)||(row.status==='expired'&&world.tick<row.expiresTick)||
        (row.status==='verified')!==Boolean(row.verification))
      return fail('civicMemorials.memorials.source');
    const donation=books.get(deed.settlementId)?.receipts;
    if(!donation||(!donation.some(item=>item.kind===row.proposerDonationKind&&item.actorId===row.proposerId&&item.tick===row.proposerDonationTick)&&
        !(donation.length===VILLAGE_GRANARY_RECEIPT_LIMIT&&row.proposerDonationTick<=donation[0].tick)))
      fail('civicMemorials.memorials.contribution');
    const identity=JSON.stringify([deed.settlementId,deed.subjectId]);
    if(row.status!=='expired'){
      if(currentSubjects.has(identity))fail('civicMemorials.memorials.identity');
      currentSubjects.add(identity);
    }
    memorialIds.add(row.id);
    if(!row.verification)continue;
    const {tick,verifierId,subjectStatus,stonesSpent,earthRootsSpent}=row.verification;
    const member=members.get(deed.volunteerId);
    const subject=actors.get(deed.subjectId);
    const recordedDeath=member?.status==='deceased'?member.settledTick:undefined;
    if(!deed.witnessIds.includes(verifierId)||row.proposerId===verifierId||tick<=row.openedTick||tick>=row.expiresTick||tick>world.tick||
        stonesSpent!==CIVIC_MEMORIAL_COST.stones||earthRootsSpent!==CIVIC_MEMORIAL_COST.earthRoots||
        (subjectStatus==='deceased'?(recordedDeath===undefined||recordedDeath>tick||subject?.alive):
          recordedDeath!==undefined&&recordedDeath<tick))
      fail('civicMemorials.memorials.verification');
    verificationById.set(row.id,{tick,proposerId:row.proposerId,verifierId});
  }
  const complete=new Set<number>(),journal=new Map<string,Set<string>>();
  for(const month of world.resourceFlow.months){
    if(month.totalEntries===month.entries.length)complete.add(month.tick);
    for(const row of month.entries){
      if(row.mechanism!=='civic_memorial'&&row.reason!=='civic_memorial_supplies')continue;
      const target=verificationById.get(row.refId), good=journal.get(row.refId)??new Set<string>();
      if(!target||row.mechanism!=='civic_memorial'||row.kind!=='consumption'||row.reason!=='civic_memorial_supplies'||row.tick!==target.tick||
          row.from.kind!=='actor'||row.from.id!==target.proposerId||good.has(row.good)||
          (row.good!=='stone'&&row.good!=='earth_root')||
          row.amount!==(row.good==='stone'?CIVIC_MEMORIAL_COST.stones:CIVIC_MEMORIAL_COST.earthRoots)||
          row.visibility.kind!=='participants'||row.visibility.actorIds.length!==2||
          !row.visibility.actorIds.includes(target.proposerId)||!row.visibility.actorIds.includes(target.verifierId))
        fail('civicMemorials.memorials.journal');
      good.add(row.good);journal.set(row.refId,good);
    }
  }
  for(const [id,row] of verificationById)if(complete.has(row.tick)&&journal.get(id)?.size!==2)fail('civicMemorials.memorials.journal');
}
