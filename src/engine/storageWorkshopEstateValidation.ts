import type {ResourceFlowAccount,WorldState,WorkshopOrder} from '../types/world';
import {RESOURCE_FLOW_MONTH_LIMIT} from './resourceFlowEngine';
import {WORKSHOP_ESTATE_OFFER_TICKS,WORKSHOP_ESTATE_REPLY_TICKS,WORKSHOP_ESTATE_WORK_TICKS} from './workshopEstateTerms';
import {workshopEstateBlank,workshopTerms} from './workshopEngine';

type Fail=(field:string)=>never;
type EventProof={tick:number;siteId:string;actorIds:readonly string[]};
type Bill={tick:number;amount:number;from:ResourceFlowAccount;to?:ResourceFlowAccount;actorIds:readonly string[]};
type Good='stone'|'earth_root';
const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const account=(a:ResourceFlowAccount,b:ResourceFlowAccount)=>a.kind===b.kind&&a.id===b.id;
const privateEstateId=/^evt-workshop-commission-[1-9][0-9]*-[1-9][0-9]*-estate-(?:hold|offer|accept|release)$/u;
const key=(id:string,tick:number,reason:string,good:string)=>[id,tick,reason,good].join('\u0000');

/** Historical heir authority comes from the same actual native probate, not a mutable character name or current wallet. */
export function validateWorkshopEstateContinuations(world:WorldState,fail:Fail):void{
  const staged=world.workshops.orders.filter(row=>row.estateContinuation||row.status==='probate_hold'||row.closeReason==='estate_returned');
  if(!staged.length&&!world.events.some(event=>privateEstateId.test(event.id)))return;
  const estates=new Map(world.estates.entries.map(row=>[row.id,row]));
  const people=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const sites=new Set(world.locations.map(site=>site.id));
  const deathDates=new Map(world.estates.entries.map(entry=>[entry.deceasedId,entry.openedTick]));
  for(const row of world.eraHistory.receipts)if(row.kind==='death')deathDates.set(row.actorId,row.tick);
  for(const row of [...world.upperPassage?.journeys??[],...world.frontier?.visits??[]])
    if(row.deceasedTick!==undefined)deathDates.set(row.actorId,row.deceasedTick);
  const hot=new Map<string,typeof world.events>();
  for(const event of world.events){const rows=hot.get(event.id)??[];rows.push(event);hot.set(event.id,rows);}
  const events=new Map<string,EventProof>(),bills=new Map<string,Bill>(),activeIds=new Set(staged.map(row=>row.id));
  const escrow=(id:string):ResourceFlowAccount=>({kind:'workshop',id});
  const actor=(id:string):ResourceFlowAccount=>({kind:'actor',id});
  const validDate=(tick:number)=>Number.isSafeInteger(tick)&&tick>=1&&tick<=world.tick;
  const deadAt=(id:string,tick:number)=>people.get(id)?.alive===false&&(deathDates.get(id)??Infinity)<=tick;
  const stamp=(order:WorkshopOrder,tick:number,phase:string,actorIds:readonly string[])=>{
    events.set(`evt-workshop-${order.id}-${tick}-${phase}`,{tick,siteId:order.siteId,actorIds});
  };
  const addBill=(order:WorkshopOrder,tick:number,reason:string,good:Good,amount:number,from:ResourceFlowAccount,to?:ResourceFlowAccount,
      actualParticipants:readonly string[]=[order.patronId,order.makerId])=>{
    if(!amount)return;
    bills.set(key(order.id,tick,reason,good),{tick,amount,from,to,actorIds:actualParticipants});
  };

  for(const order of staged){
    const extension=order.estateContinuation;
    const source=workshopEstateBlank(order);
    if(!extension||!source||order.acceptedTick===undefined||order.deadlineTick===undefined)
      return fail('workshops.estate.source');
    const {estateId,heldTick,heldStones,heldHerbs,phase,beneficiaryId,offeredTick,replyUntilTick,resumeTick,workUntilTick,closedTick,releaseReason}=extension;
    const estate=estates.get(estateId),patron=people.get(order.patronId);
    if(!estate||estateId!==`estate-${order.patronId}`||estate.deceasedId!==order.patronId||estate.openedTick!==heldTick||
      !patron||patron.alive||patron.hp!==0||patron.positionPlane!==undefined||
      !validDate(heldTick)||heldTick<source.blank.tick||heldTick>=order.deadlineTick)
      return fail('workshops.estate.probate');
    if(heldStones!==source.stones||heldHerbs!==source.herbs)return fail('workshops.estate.heldBalance');

    const adjudicated=estate.settledTick;
    if(estate.closesTick<=heldTick||(estate.status==='open'?(adjudicated!==undefined||estate.beneficiaryId!==undefined):
      (adjudicated===undefined||!validDate(adjudicated)||adjudicated<estate.closesTick||
        (estate.status==='settled')!==(estate.beneficiaryId!==undefined))))
      return fail('workshops.estate.probate');
    const adjudicate=(date:number)=>{
      if(estate.status!=='settled'||adjudicated===undefined||adjudicated<estate.closesTick||!validDate(adjudicated)||adjudicated>=date)return undefined;
      const historic=hot.get(`evt-${adjudicated}-${estate.id}-closed`);
      if(historic&&(historic.length!==1||historic[0].tick!==adjudicated||historic[0].category!=='diplomacy'||
        !same(historic[0].actorIds,[order.patronId,estate.beneficiaryId??''])))return undefined;
      const eligible=new Map(estate.eligibleHeirs.map(row=>[row.actorId,row]));
      const qualified=(id:string)=>people.has(id)&&eligible.has(id)&&!deadAt(id,adjudicated);
      const nominee=estate.namedHeirId;
      if(nominee&&qualified(nominee)&&eligible.get(nominee)?.basis==='nomination'&&eligible.get(nominee)?.strength===100&&patron.namedHeirId===nominee)
        return nominee;
      return estate.claims.filter(row=>{
        const origin=eligible.get(row.actorId);
        return qualified(row.actorId)&&!!origin&&origin.basis===row.basis&&origin.strength===row.strength&&
          row.tick>=estate.openedTick&&row.tick<estate.closesTick;
      }).sort((a,b)=>b.strength-a.strength||a.tick-b.tick||a.actorId.localeCompare(b.actorId))[0]?.actorId;
    };
    if(offeredTick===undefined){
      if(beneficiaryId!==undefined||replyUntilTick!==undefined||resumeTick!==undefined||workUntilTick!==undefined||
        (phase!=='held'&&phase!=='released'))return fail('workshops.estate.offer');
    }else{
      if(!validDate(offeredTick)||offeredTick<=heldTick||beneficiaryId===undefined||beneficiaryId===order.makerId||
        beneficiaryId===order.patronId||beneficiaryId!==estate.beneficiaryId||beneficiaryId!==adjudicate(offeredTick)||
        offeredTick>=(adjudicated??0)+WORKSHOP_ESTATE_OFFER_TICKS||replyUntilTick!==offeredTick+WORKSHOP_ESTATE_REPLY_TICKS||
        phase==='held')return fail('workshops.estate.offer');
      stamp(order,offeredTick,'estate-offer',[beneficiaryId,order.makerId]);
    }
    if(resumeTick===undefined){
      if(workUntilTick!==undefined||phase==='resumed'||phase==='completed')return fail('workshops.estate.resume');
    }else{
      if(!beneficiaryId||!validDate(resumeTick)||resumeTick<=(offeredTick??Infinity)||resumeTick>=(replyUntilTick??0)||
        workUntilTick!==resumeTick+WORKSHOP_ESTATE_WORK_TICKS||(phase!=='resumed'&&phase!=='released'&&phase!=='completed'))
        return fail('workshops.estate.resume');
      stamp(order,resumeTick,'estate-accept',[beneficiaryId,order.makerId]);
    }

    const linked=closedTick!==undefined;
    const terminal=phase==='released'||phase==='completed';
    if(linked!==terminal||closedTick!==undefined&&(!validDate(closedTick)||closedTick<(resumeTick??offeredTick??heldTick)||
      closedTick===heldTick||order.settledTick!==closedTick))return fail('workshops.estate.closure');
    if(!terminal){
      const effective=phase==='held'&&estate.status==='settled'&&adjudicated!==undefined?adjudicated+WORKSHOP_ESTATE_OFFER_TICKS:
        phase==='offered'?replyUntilTick:phase==='resumed'?workUntilTick:undefined;
      if(order.status!==(phase==='resumed'?'active':'probate_hold')||order.work.length!==1||
        order.escrowStones!==heldStones||order.escrowHerbs!==heldHerbs||order.refundedStones!==0||order.refundedHerbs!==0||
        releaseReason!==undefined||(effective!==undefined&&world.tick>=effective))
        return fail('workshops.estate.custody');
    }
    stamp(order,heldTick,'estate-hold',[order.makerId]);
    const terms=workshopTerms(order.tier,1),workAccount=escrow(order.id),payer=actor(order.patronId);
    addBill(order,order.acceptedTick,'workshop_deposit','stone',terms.totalStones,payer,workAccount);
    addBill(order,order.acceptedTick,'workshop_deposit','earth_root',terms.totalHerbs,payer,workAccount);
    addBill(order,source.blank.tick,'workshop_fuel','stone',source.blank.stonesUsed,workAccount);
    addBill(order,source.blank.tick,'workshop_material','earth_root',source.blank.herbsUsed,workAccount);

    if(phase==='released'){
      if(order.status!=='cancelled'||order.closeReason!=='estate_returned'||!releaseReason||closedTick===undefined||
        order.work.length!==1||order.refundedStones!==heldStones||order.refundedHerbs!==heldHerbs)
        return fail('workshops.estate.return');
      const lapse=workUntilTick??replyUntilTick??(adjudicated===undefined?undefined:adjudicated+WORKSHOP_ESTATE_OFFER_TICKS);
      const eligible=estate.beneficiaryId;
      if(releaseReason==='unclaimed'&&(offeredTick!==undefined||estate.status!=='unclaimed'||adjudicated===undefined||
          adjudicated<estate.closesTick||closedTick!==adjudicated+1)||
        releaseReason==='declined'&&(resumeTick!==undefined||closedTick<=(offeredTick??Infinity)||closedTick>=(replyUntilTick??0))||
        releaseReason==='lapsed'&&(closedTick!==lapse||estate.status!=='settled'||!eligible||
          eligible===order.makerId||adjudicate(closedTick)!==eligible||deadAt(eligible,closedTick))||
        releaseReason==='maker_unavailable'&&!deadAt(order.makerId,closedTick)||
        releaseReason==='heir_unavailable'&&(estate.status!=='settled'||adjudicated===undefined||closedTick<=adjudicated||
          !!eligible&&eligible!==order.makerId&&eligible!==order.patronId&&estate.eligibleHeirs.some(row=>row.actorId===eligible)&&
          !deadAt(eligible,closedTick))||
        releaseReason==='site_unavailable'&&sites.has(order.siteId))return fail('workshops.estate.returnReason');
      stamp(order,closedTick,'estate-release',beneficiaryId?[beneficiaryId,order.makerId]:[order.makerId]);
      addBill(order,closedTick,'workshop_refund','stone',heldStones,workAccount,payer);
      addBill(order,closedTick,'workshop_refund','earth_root',heldHerbs,workAccount,payer);
    }else if(phase==='completed'){
      const finish=order.work[1];
      if(order.status!=='completed'||order.closeReason!==undefined||releaseReason!==undefined||!beneficiaryId||!finish||
        order.work.length!==2||finish.tick!==closedTick||finish.tick<=(resumeTick??Infinity)||
        finish.tick>=(workUntilTick??0)||finish.toolUse!==undefined)
        return fail('workshops.estate.finish');
      const actualParticipants=[beneficiaryId,order.makerId];
      stamp(order,finish.tick,'finish-1',actualParticipants);
      addBill(order,finish.tick,'workshop_fuel','stone',finish.stonesUsed,workAccount,undefined,actualParticipants);
      addBill(order,finish.tick,'workshop_material','earth_root',finish.herbsUsed,workAccount,undefined,actualParticipants);
      addBill(order,finish.tick,'workshop_wage','stone',finish.feePaid??0,workAccount,actor(order.makerId),actualParticipants);
      addBill(order,finish.tick,'workshop_refund','stone',order.refundedStones,workAccount,payer);
      addBill(order,finish.tick,'workshop_refund','earth_root',order.refundedHerbs,workAccount,payer);
    }
  }
  for(const [eventId,originals] of hot){
    const expected=events.get(eventId);
    if(!expected&&!privateEstateId.test(eventId))continue;
    const [event]=originals;
    if(!expected||originals.length!==1||event.tick!==expected.tick||event.locationId!==expected.siteId||
      event.category!=='diplomacy'||event.witnessScope!=='participants'||!same(event.actorIds,expected.actorIds))
      return fail('workshops.estate.event');
  }
  const exposed=(rows:readonly {id:string}[])=>rows.some(row=>events.has(row.id)||privateEstateId.test(row.id));
  if(exposed(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(chapter=>exposed(chapter.anchors))||
    world.coldHistory.chapters.some(chapter=>exposed(chapter.anchors)))return fail('workshops.estate.privateArchive');
  const found=new Set<string>(),complete=new Map<number,boolean>();
  for(const month of world.resourceFlow.months){
    complete.set(month.tick,month.entries.length===month.totalEntries);
    for(const entry of month.entries){
      if(!activeIds.has(entry.refId))continue;
      const id=key(entry.refId,entry.tick,entry.reason,entry.good),expected=bills.get(id);
      if(!expected||found.has(id)||entry.mechanism!=='workshop'||entry.amount!==expected.amount||
        entry.visibility.kind!=='participants'||!same(entry.visibility.actorIds,expected.actorIds)||
        (expected.to?(entry.kind!=='transfer'||!account(entry.from,expected.from)||!account(entry.to,expected.to)):
          (entry.kind!=='consumption'||!account(entry.from,expected.from))))
        return fail('workshops.estate.journal');
      found.add(id);
    }
  }
  for(const [id,expected] of bills){
    if(!found.has(id)&&expected.tick>world.tick-RESOURCE_FLOW_MONTH_LIMIT&&complete.get(expected.tick)!==false)
      return fail('workshops.estate.journal');
  }
}
