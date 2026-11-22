import type {ResourceFlowAccount,WorldState} from '../types/world';
import {SCRIBE_COMMISSION_DEPOSIT as DEPOSIT,SCRIBE_COMMISSION_INK as INK,SCRIBE_COMMISSION_WAGE as WAGE,
  SCRIBE_COMMISSION_OFFER_TICKS as OFFER,SCRIBE_COMMISSION_WORK_TICKS as WORK,
  scribeCommissionEventId,scribeManuscriptId} from '../types/scribeCommission';
import {RESOURCE_FLOW_MONTH_LIMIT} from './resourceFlowEngine';
import {scribeCommissionFact,scribeCommissionHistoricalHub,scribeCommissionVerification} from './scribeCommissionEngine';

type Commission=NonNullable<WorldState['scribeCommissions']>['commissions'][number];
type Phase='offer'|'accept'|'verify'|'deliver'|'decline'|'withdraw'|'expired'|'unavailable';
type Reason='scribe_deposit'|'scribe_ink'|'scribe_wage'|'scribe_refund';
type Bill={commission:Commission;tick:number;amount:number;from:ResourceFlowAccount;to?:ResourceFlowAccount};
const key=(id:string,phase:string)=>id+'\u0000'+phase;
const privateEvent=/^evt-scribe-commission-[1-9][0-9]*-[1-9][0-9]*-(?:offer|accept|verify|deliver|decline|withdraw|expired|unavailable)$/u;
const parties=(row:Commission)=>[row.patronId,row.scribeId];
const eq=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((item,i)=>item===b[i]);
const same=(a:ResourceFlowAccount,b:ResourceFlowAccount)=>a.kind===b.kind&&a.id===b.id;

/** Check durable ledgers against already verified typed original evidence and retained actual private receipts. */
export function validateScribeCommissions(world:WorldState,fail:(field:string)=>never):void{
  const state=world.scribeCommissions;
  const actors=new Map((state?world.cultivators:[]).map(actor=>[actor.id,actor]));
  const estateDeaths=new Map((state?world.estates.entries:[]).map(entry=>[entry.deceasedId,entry.openedTick]));
  const datedDeaths=new Set((state?world.eraHistory.receipts:[]).flatMap(row=>row.kind==='death'?[key(row.actorId,String(row.tick))]:[]));
  const elsewhereDeaths=new Set((state?[...(world.upperPassage?.journeys??[]),...(world.frontier?.visits??[])]:[]).flatMap(row=>
    row.deceasedTick===undefined?[]:[key(row.actorId,String(row.deceasedTick))]));
  const events=new Map<string,{commission:Commission;tick:number}>();
  const bills=new Map<string,Bill>();
  const reservedUntil=new Map<string,number>();
  const actions=new Set<string>();
  const once=(id:string,tick:number)=>{
    const action=key(id,String(tick));
    if(actions.has(action))return fail('scribeCommissions.actorTurn');
    actions.add(action);
  };
  let previousSerial=0,previousOffer=0;
  const current=(tick:number)=>tick>0&&tick<=world.tick;
  const stamp=(commission:Commission,tick:number,phase:Phase)=>{
    const eventId=scribeCommissionEventId(commission.id,tick,phase);
    events.set(eventId,{commission,tick});
  };
  const addBill=(commission:Commission,tick:number,reason:Reason,amount:number)=>{
    const escrow:ResourceFlowAccount={kind:'scribe_commission',id:commission.id};
    const patron:ResourceFlowAccount={kind:'actor',id:commission.patronId};
    const scribe:ResourceFlowAccount={kind:'actor',id:commission.scribeId};
    const atPatron=reason==='scribe_deposit';
    bills.set(key(commission.id,reason),{commission,tick,amount,from:atPatron?patron:escrow,
      ...(reason==='scribe_ink'?{}:{to:atPatron?escrow:reason==='scribe_wage'?scribe:patron})});
  };
  if(state&&!state.commissions.length)return fail('scribeCommissions.empty');
  for(const row of state?.commissions??[]){
    const serial=Number(row.id.match(/^scribe-commission-([1-9][0-9]*)$/u)?.[1]);
    const {offeredTick,acceptedTick,closedTick,verification,manuscript,workExpiresTick,status}=row;
    if(!Number.isSafeInteger(serial)||serial!==previousSerial+1||serial>=state!.nextId||
      row.patronId===row.scribeId||!actors.has(row.patronId)||!actors.has(row.scribeId)||
      !current(offeredTick)||offeredTick<previousOffer||row.offerExpiresTick!==offeredTick+OFFER)
      return fail('scribeCommissions.references');
    previousSerial=serial;previousOffer=offeredTick;

    const fact=scribeCommissionFact(world,row.sourceEventId,row.siteId,offeredTick);
    if(!fact||fact.tick!==row.sourceTick||row.sourceTick>=offeredTick||!scribeCommissionHistoricalHub(world,row.siteId,offeredTick))return fail('scribeCommissions.source');

    const open=status==='offered'||status==='accepted'||status==='verified';
    if(open!==(closedTick===undefined)||status==='offered'&&acceptedTick!==undefined||
      (acceptedTick===undefined?(workExpiresTick!==undefined||verification!==undefined||status==='accepted'||status==='verified'||status==='delivered'):
        (!current(acceptedTick)||acceptedTick<=offeredTick||acceptedTick>=row.offerExpiresTick||workExpiresTick!==acceptedTick+WORK)))
      return fail('scribeCommissions.sequence');
    const deadline=workExpiresTick??row.offerExpiresTick;
    const mostRecent=verification?.tick??acceptedTick??offeredTick;
    if(open&&world.tick>=deadline||closedTick!==undefined&&(!current(closedTick)||(status==='unavailable'?closedTick<mostRecent:closedTick<=mostRecent)||
      (status==='expired'?closedTick!==deadline:closedTick>=deadline)))
      return fail('scribeCommissions.deadline');
    if(status==='unavailable'){
      const lost=row.unavailableActorId&&actors.get(row.unavailableActorId);
      if(!lost||closedTick===undefined||!parties(row).includes(lost.id)||lost.alive||lost.hp!==0||
        (estateDeaths.get(lost.id)!==closedTick&&!datedDeaths.has(key(lost.id,String(closedTick)))&&!elsewhereDeaths.has(key(lost.id,String(closedTick)))))
        return fail('scribeCommissions.unavailable');
    }else if(row.unavailableActorId!==undefined)return fail('scribeCommissions.unavailable');
    if((status==='accepted'&&verification!==undefined)||(status==='verified'||status==='delivered')&&verification===undefined||
      (status==='delivered')!==(manuscript!==undefined))
      return fail('scribeCommissions.sequence');
    for(const id of parties(row)){
      if((reservedUntil.get(id)??0)>offeredTick)return fail('scribeCommissions.concurrent');
      reservedUntil.set(id,closedTick??Infinity);
    }
    once(row.patronId,offeredTick);stamp(row,offeredTick,'offer');
    if(acceptedTick!==undefined){once(row.scribeId,acceptedTick);stamp(row,acceptedTick,'accept');addBill(row,acceptedTick,'scribe_deposit',DEPOSIT);}
    if(verification){
      if(!current(verification.tick)||verification.tick<=(acceptedTick??Infinity)||verification.tick>=deadline||
        verification.inkPaid!==INK)return fail('scribeCommissions.verification');
      const proof=scribeCommissionVerification(world,row,verification.tick);
      if(!proof||!eq(verification.retellingIds,proof.retellingIds)||verification.correctionId!==proof.correctionId)
        return fail('scribeCommissions.verification');
      once(row.scribeId,verification.tick);stamp(row,verification.tick,'verify');addBill(row,verification.tick,'scribe_ink',INK);
    }
    const remaining=acceptedTick===undefined?0:verification?WAGE:DEPOSIT;
    if(row.escrowStones!==(open?remaining:0)||row.refundedStones!==(open||manuscript?0:remaining))
      return fail('scribeCommissions.custody');
    if(manuscript){
      if(manuscript.id!==scribeManuscriptId(row.id)||manuscript.tick!==closedTick||manuscript.wagePaid!==WAGE)
        return fail('scribeCommissions.manuscript');
      once(row.scribeId,manuscript.tick);stamp(row,manuscript.tick,'deliver');addBill(row,manuscript.tick,'scribe_wage',WAGE);
    }else if(closedTick!==undefined){
      if(status!=='declined'&&status!=='withdrawn'&&status!=='expired'&&status!=='unavailable')return fail('scribeCommissions.sequence');
      if(status!=='expired'&&status!=='unavailable')once(status==='declined'?row.scribeId:row.patronId,closedTick);
      stamp(row,closedTick,status==='declined'?'decline':status==='withdrawn'?'withdraw':status);
      if(remaining)addBill(row,closedTick,'scribe_refund',remaining);
    }
  }
  if(state&&state.nextId!==previousSerial+1)return fail('scribeCommissions.serial');

  const eventIds=new Set<string>();
  for(const news of world.events){
    if(!privateEvent.test(news.id))continue;
    const expected=events.get(news.id);
    if(!expected||eventIds.has(news.id)||news.locationId!==expected.commission.siteId||news.tick!==expected.tick||
      news.category!=='diplomacy'||news.witnessScope!=='participants'||!eq(news.actorIds,parties(expected.commission)))
      return fail('scribeCommissions.event');
    eventIds.add(news.id);
  }
  const hasPrivateAnchor=(anchors:readonly {id:string}[])=>anchors.some(row=>privateEvent.test(row.id));
  if(hasPrivateAnchor(world.chronicleArchive.anchors)||
    world.chronicleArchive.chapters.some(chapter=>hasPrivateAnchor(chapter.anchors))||
    world.coldHistory.chapters.some(chapter=>hasPrivateAnchor(chapter.anchors)))return fail('scribeCommissions.privateArchive');

  const found=new Set<string>(),monthComplete=new Map<number,boolean>();
  for(const month of world.resourceFlow.months){
    monthComplete.set(month.tick,month.totalEntries===month.entries.length);
    for(const entry of month.entries){
      const usesAccount=(('from'in entry&&entry.from.kind==='scribe_commission')||('to'in entry&&entry.to.kind==='scribe_commission'));
      if(entry.mechanism!=='scribe_commission'&&!usesAccount&&!entry.reason.startsWith('scribe_'))continue;
      const id=key(entry.refId,entry.reason),expected=bills.get(id);
      if(!expected||found.has(id)||entry.mechanism!=='scribe_commission'||entry.tick!==expected.tick||
        entry.amount!==expected.amount||entry.good!=='stone'||entry.visibility.kind!=='participants'||
        !eq(entry.visibility.actorIds,parties(expected.commission))||
        (expected.to?(entry.kind!=='transfer'||!same(entry.from,expected.from)||!same(entry.to,expected.to)):
          (entry.kind!=='consumption'||!same(entry.from,expected.from))))
        return fail('scribeCommissions.resourceJournal');
      found.add(id);
    }
  }
  for(const [id,expected] of bills){
    // Whole retained books (or an absent but still in-range book) cannot omit a payment.
    if(!found.has(id)&&expected.tick>world.tick-RESOURCE_FLOW_MONTH_LIMIT&&monthComplete.get(expected.tick)!==false)
      return fail('scribeCommissions.resourceJournal');
  }
}
