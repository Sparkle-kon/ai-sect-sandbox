import type { SectStipend,WorldState } from '../types/world';
import { INFIRMARY_TREATMENT_HERBS,INFIRMARY_TREATMENT_STONES } from './infirmaryEngine';
import { SECT_STIPEND_AMOUNT,SECT_STIPEND_OFFER_TICKS,SECT_STIPEND_PERIODS } from './sectStipendEngine';
import { SERVICE_RETIREMENT_HISTORY_LIMIT } from './serviceRetirementEngine';

export function validateSectStipendHistory(world:WorldState,people:ReadonlySet<string>,fail:(path:string)=>never):void {
  const {stipends,nextId}=world.sectStipends;
  if(!stipends.length){
    if(world.resourceFlow.months.some(month=>month.entries.some(row=>row.mechanism==='sect_stipend'||row.reason==='stipend_payment')))
      fail('sectStipends.journal.source');
    return;
  }
  const sects=new Map(world.sects.map(row=>[row.id,row])), sites=new Set(world.locations.map(row=>row.id));
  const residents=new Map(world.cultivators.map(row=>[row.id,row]));
  const retirements=new Map(world.serviceRetirement.history.map(row=>[row.id,row]));
  const treatments=new Map(world.infirmaries.cases.map(row=>[row.id,row]));
  const shifts=new Map(world.infirmaries.shifts.map(row=>[row.id,row]));
  const ids=new Set<string>(), authorizedEpochs=new Set<string>(), authorizedCases=new Set<string>();
  const byPeriod=new Map<string,{authorityId:string;recipientId:string;sectId:string;tick:number}>();
  const validId=(id:string,pattern:RegExp,bound:number)=>{
    const serial=Number(pattern.exec(id)?.[1]);return Number.isSafeInteger(serial)&&serial<bound;
  };
  const exactKey=(id:string,tick:number)=>JSON.stringify([id,tick]);
  const authorityAt=(row:SectStipend,tick:number)=>{
    let id=row.sponsorId;
    for(const handoff of row.handoffs)if(handoff.adoptedTick<=tick)id=handoff.toId;
    return id;
  };
  for(const row of stipends){
    const {id,sectId,siteId,recipientId,sponsorId,service,offeredTick,expiresTick,acceptedTick,closedTick,closedById,closure}=row;
    const sect=sects.get(sectId);
    const open=row.status==='offered'||row.status==='active';
    const voluntary=row.status==='withdrawn'||row.status==='declined';
    if(!validId(id,/^sect-stipend-([1-9]\d*)$/,nextId)||ids.has(id)||!sect||!sites.has(siteId)||
        sponsorId===recipientId||!people.has(recipientId)||!people.has(sponsorId)||offeredTick>world.tick||
        expiresTick!==offeredTick+SECT_STIPEND_OFFER_TICKS||
        (acceptedTick!==undefined&&(acceptedTick<=offeredTick||acceptedTick>=expiresTick||acceptedTick>world.tick))||
        ((row.status==='offered'||row.status==='declined'||row.status==='expired')&&acceptedTick!==undefined)||
        ((row.status==='active'||row.status==='completed')&&acceptedTick===undefined)||
        (open&&(closedTick!==undefined||closure!==undefined||closedById!==undefined))||
        (!open&&(closedTick===undefined||closedTick<(acceptedTick??offeredTick)||closedTick>world.tick))||
        Boolean(closure)!==(row.status==='closed')||voluntary!==Boolean(closedById)||
        (row.status==='declined'&&(closedById!==recipientId||(closedTick??Infinity)>=expiresTick))||
        (row.status==='withdrawn'&&closedById!==recipientId&&closedById!==authorityAt(row,closedTick??0))||
        (row.status==='expired'&&closedTick!==expiresTick)||
        (row.status==='offered'&&world.tick>=expiresTick)||
        (closure==='recipient_died'&&residents.get(recipientId)?.alive))
      return fail('sectStipends.source');
    ids.add(id);
    if(acceptedTick!==undefined||row.status==='offered'){
      const epoch=JSON.stringify([recipientId,sectId,service.retirementId]);
      if(authorizedEpochs.has(epoch)||authorizedCases.has(service.caseId))fail('sectStipends.qualification.repeat');
      authorizedEpochs.add(epoch);authorizedCases.add(service.caseId);
    }

    const retirement=retirements.get(service.retirementId), treatment=treatments.get(service.caseId),shift=shifts.get(service.shiftId);
    const receipt=treatment?.receipt;
    if(!validId(service.retirementId,/^service-record-([1-9]\d*)$/,world.serviceRetirement.nextId)||
        !validId(service.caseId,/^infirmary-case-([1-9]\d*)$/,world.infirmaries.nextId)||
        !validId(service.shiftId,/^infirmary-shift-([1-9]\d*)$/,world.infirmaries.nextId)||
        !people.has(service.patientId)||service.patientId===recipientId||service.servedTick>=service.retiredTick||service.retiredTick>=offeredTick||
        (!retirement&&(world.serviceRetirement.history.length<SERVICE_RETIREMENT_HISTORY_LIMIT ||
          (world.serviceRetirement.history[0]?.tick??Infinity)<service.retiredTick))||
        (retirement&&(retirement.kind!=='retire'||retirement.actorId!==recipientId||retirement.sectId!==sectId||
          retirement.tick!==service.retiredTick||!retirement.infirmaryShiftIds.includes(service.shiftId)))||
        (treatment&&(treatment.status!=='treated'||treatment.patientId!==service.patientId||treatment.sectId!==sectId||
          treatment.siteId!==siteId||!receipt||receipt.tick!==service.servedTick||receipt.guardId!==recipientId||
          receipt.shiftId!==service.shiftId||receipt.stonesSpent!==INFIRMARY_TREATMENT_STONES||
          receipt.herbsSpent!==INFIRMARY_TREATMENT_HERBS||(receipt.hpRestored<=0&&receipt.toxicityRemoved<=0)))||
        (shift&&(shift.guardId!==recipientId||shift.siteId!==siteId||shift.sectId!==sectId||
          shift.startedTick>=service.servedTick||shift.expiresTick<=service.retiredTick||
          (shift.lastServedTick??-1)<service.servedTick)))
      fail('sectStipends.qualification.source');

    let signer=sponsorId, previousAdoption=acceptedTick??Infinity;
    for(const handoff of row.handoffs){
      const latest=sect.succession;
      if(handoff.fromId!==signer||handoff.toId===signer||handoff.toId===recipientId||!people.has(handoff.toId)||
          handoff.successionTick<previousAdoption||handoff.adoptedTick<=handoff.successionTick||
          handoff.adoptedTick>world.tick||handoff.adoptedTick>(closedTick??Infinity)||
          !latest||latest.tick<handoff.successionTick||
          (latest.tick===handoff.successionTick&&(latest.method!=='election'||latest.previousLeaderId!==signer||latest.leaderId!==handoff.toId)))
        fail('sectStipends.handoff.source');
      signer=handoff.toId;previousAdoption=handoff.adoptedTick;
    }

    const periods=acceptedTick===undefined?0:Math.max(0,Math.min(SECT_STIPEND_PERIODS,
      row.status==='completed'?SECT_STIPEND_PERIODS:(closedTick===undefined?world.tick:closedTick-1)-acceptedTick));
    if(row.periods.length!==periods||(row.status==='active'&&periods>=SECT_STIPEND_PERIODS)||
        (row.status==='completed'&&closedTick!==(acceptedTick??0)+SECT_STIPEND_PERIODS))
      fail('sectStipends.periods.count');
    for(const [index,period] of row.periods.entries()){
      const {dueTick,settledTick,authorityId,status,reason,paidAmount,dueAmount}=period;
      const authority=authorityAt(row,dueTick);
      if(dueTick!==(acceptedTick??-1)+index+1||settledTick!==dueTick||dueTick>world.tick||dueAmount!==SECT_STIPEND_AMOUNT||
          (authorityId!==undefined&&authorityId!==authority)||
          (status==='paid'?(reason!==undefined||authorityId!==authority||paidAmount!==SECT_STIPEND_AMOUNT):
            (reason===undefined||paidAmount!==0)))
        fail('sectStipends.periods.source');
      if(status==='paid')byPeriod.set(exactKey(id,dueTick),{sectId,recipientId,authorityId:authority,tick:dueTick});
    }
  }

  const observed=new Set<string>(),completeMonths=new Set<number>();
  for(const month of world.resourceFlow.months){
    if(month.totalEntries===month.entries.length)completeMonths.add(month.tick);
    for(const entry of month.entries){
      if(entry.mechanism!=='sect_stipend'&&entry.reason!=='stipend_payment')continue;
      const key=exactKey(entry.refId,entry.tick), target=byPeriod.get(key);
      if(entry.mechanism!=='sect_stipend'||entry.reason!=='stipend_payment'||!target||observed.has(key)||
          entry.kind!=='transfer'||entry.good!=='stone'||entry.amount!==SECT_STIPEND_AMOUNT||
          entry.from.kind!=='sect'||entry.from.id!==target.sectId||entry.to.kind!=='actor'||entry.to.id!==target.recipientId||
          entry.visibility.kind!=='participants'||entry.visibility.actorIds.length!==2||
          !entry.visibility.actorIds.includes(target.authorityId)||!entry.visibility.actorIds.includes(target.recipientId))
        fail('sectStipends.journal.source');
      observed.add(key);
    }
  }
  for(const [key,row] of byPeriod)if(completeMonths.has(row.tick)&&!observed.has(key))fail('sectStipends.journal.missing');
}
