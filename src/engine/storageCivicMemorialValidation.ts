import type { CivicMemorial,CivicReliefDeed,WorldEvent,WorldState } from '../types/world';
import { CIVIC_MEMORIAL_COST,CIVIC_MEMORIAL_OFFER_TICKS,civicMemorialAdditionId } from './civicMemorialEngine';
import { SETTLEMENT_RELIEF } from './settlementReliefTerms';
import { VILLAGE_GRANARY_RECEIPT_LIMIT } from './villageGranaryEngine';
import { CHRONICLE_ERRATA_WINDOW } from './chronicleErrataEngine';

export function validateCivicMemorialHistory(world:WorldState,people:ReadonlySet<string>,fail:(path:string)=>never):void {
  const {deeds,memorials,nextDeedId,nextMemorialId}=world.civicMemorials;
  const validateAdditions=()=>validateCivicMemorialAdditions(world,memorials,people,fail);
  if(!deeds.length&&!memorials.length){
    if(world.resourceFlow.months.some(month=>month.entries.some(row=>row.mechanism==='civic_memorial'||row.reason==='civic_memorial_supplies')))
      fail('civicMemorials.memorials.journal');
    return validateAdditions();
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
  validateAdditions();
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


const overlayId=/^civic-memorial-[1-9][0-9]*-addendum-/u;
const overlayEvent=(id:string)=>id.startsWith('evt-')&&overlayId.test(id.slice(4));

/** Rebind each signed overlay to both independent paid documents. Historic participants need
 * not still be alive or on site. A retained death strictly before signing contradicts it. */
function validateCivicMemorialAdditions(world:WorldState,memorials:readonly CivicMemorial[],people:ReadonlySet<string>,
  fail:(path:string)=>never):void{
  const history=world.eraHistory?.receipts??[];
  const turn=world.tick;
  const expected=new Map<string,{tick:number;siteId:string;witnessId:string}>();
  const acts=new Set<string>(),cited=new Set<string>();
  const stamp=(actorId:string,tick:number)=>JSON.stringify([actorId,tick]);
  const chapters=[...world.chronicleArchive.chapters,...world.coldHistory.chapters];
  const exposed=(rows:readonly {id:string}[])=>rows.some(row=>overlayEvent(row.id));
  if(exposed(world.chronicleArchive.anchors)||chapters.some(row=>exposed(row.anchors))||
    history.some(row=>overlayEvent(row.eventId))||world.chronicleErrata.sources.some(row=>overlayEvent(row.sourceEventId))||
    world.eraHeritage?.facts.some(row=>overlayEvent(row.source.sourceEventId))||
    world.chronicleCausality.nodes.some(row=>overlayEvent(row.eventId)||row.predecessors.some(item=>overlayEvent(item.eventId))))
    return fail('civicMemorials.additions.archive');
  if(world.resourceFlow.months.some(month=>month.entries.some(row=>overlayId.test(row.refId))))
    return fail('civicMemorials.additions.journal');

  if(memorials.some(row=>row.additions!==undefined)){
    const deeds=new Map(world.civicMemorials.deeds.map(row=>[row.id,row]));
    const source=new Map(world.settlements.records.map(row=>[row.id,row]));
    const deaths=new Map(world.estates.entries.map(row=>[row.deceasedId,row.openedTick]));
    const events=new Map<string,WorldEvent[]>();
    for(const row of world.events){
      const rows=events.get(row.id);
      if(rows)rows.push(row);else events.set(row.id,[row]);
    }
    const sourceConfirmed=(deed:CivicReliefDeed)=>{
      const receipt=source.get(deed.reliefRecordId);
      if(!receipt||receipt.id!==`settlement-${deed.tick}-relief-${deed.settlementId}-${deed.subjectId}`||
        receipt.kind!=='relief'||receipt.tick!==deed.tick||receipt.actorId!==deed.subjectId||receipt.settlementId!==deed.settlementId||
        receipt.people!==0||receipt.targetSettlementId!==undefined||receipt.volunteerId!==undefined||receipt.cultivatorId!==undefined||
        receipt.stones!==SETTLEMENT_RELIEF.stones||receipt.herbs!==SETTLEMENT_RELIEF.jade_leaf)return false;
      const originals=events.get(`evt-${receipt.id}`)??[],[event]=originals;
      return originals.length===0||originals.length===1&&event.witnessScope===undefined&&event.tick===receipt.tick&&
        event.locationId===deed.siteId&&event.category==='diplomacy'&&event.title==='凡村赈济'&&event.description===receipt.description&&
        event.actorIds.length===1&&event.actorIds[0]===deed.subjectId;
    };
    const samePerson=(a:CivicReliefDeed,b:CivicReliefDeed)=>
      a.subjectId===b.subjectId&&a.volunteerId===b.volunteerId&&a.householdId===b.householdId&&a.settlementId===b.settlementId&&
      a.siteId===b.siteId&&a.name===b.name&&a.enrolledTick===b.enrolledTick;
    for(const row of memorials){
      acts.add(stamp(row.proposerId,row.openedTick));
      if(row.verification)acts.add(stamp(row.verification.verifierId,row.verification.tick));
    }
    for(const row of memorials){
      if(row.additions===undefined)continue;
      const original=deeds.get(row.deedId),verify=row.verification;
      if(!row.additions.length||row.status!=='verified'||!verify||!original||original.tick>=verify.tick||!sourceConfirmed(original))
        return fail('civicMemorials.additions.source');
      let previous=verify.tick;
      for(const addition of row.additions){
        const later=deeds.get(addition.deedId),{witnessId,appendedTick}=addition;
        if(!later||later.id===original.id||later.reliefRecordId===original.reliefRecordId||!samePerson(later,original)||
          addition.id!==civicMemorialAdditionId(row.id,later.id)||cited.has(later.id)||
          later.tick<=verify.tick||appendedTick<=later.tick||appendedTick<previous||appendedTick>turn||!sourceConfirmed(later))
          return fail('civicMemorials.additions.source');
        const action=stamp(witnessId,appendedTick);
        if(witnessId===row.proposerId||witnessId===verify.verifierId||witnessId===original.subjectId||
          !people.has(witnessId)||!later.witnessIds.includes(witnessId)||(deaths.get(witnessId)??Infinity)<appendedTick||
          history.some(event=>event.kind==='death'&&event.actorId===witnessId&&event.tick<appendedTick)||acts.has(action))
          return fail('civicMemorials.additions.witness');
        acts.add(action);
        cited.add(later.id);
        previous=appendedTick;
        expected.set(`evt-${addition.id}-${appendedTick}`,{tick:appendedTick,siteId:later.siteId,witnessId});
      }
    }
  }
  const seen=new Set<string>();
  let oldest=Infinity;
  for(const event of world.events){
    oldest=Math.min(oldest,event.tick);
    if(!overlayEvent(event.id))continue;
    const proof=expected.get(event.id);
    if(!proof||seen.has(event.id)||event.category!=='diplomacy'||event.witnessScope!=='participants'||
      event.tick!==proof.tick||event.locationId!==proof.siteId||event.actorIds.length!==1||event.actorIds[0]!==proof.witnessId||
      event.dialogue!==undefined||event.duelWinnerId!==undefined||event.damage!==undefined)
      return fail('civicMemorials.additions.event');
    seen.add(event.id);
  }
  // The oldest retained month may be only half represented; later ones have not rotated.
  for(const [id,proof] of expected)if(proof.tick>oldest&&!seen.has(id))return fail('civicMemorials.additions.event');
}
