import type {WorldState,WorkshopOrder} from '../types/world';
import {RESOURCE_FLOW_MONTH_LIMIT} from './resourceFlowEngine';
import {WORKSHOP_RELEASE_OFFER_TICKS,workshopReleaseSource} from './workshopEngine';

type Fail=(path:string)=>never;
type EventProof={order:WorkshopOrder;tick:number};
type RefundProof=EventProof&{stone:number;earth_root:number};

export function validateWorkshopReleaseNegotiations(world:WorldState,fail:Fail):void {
  const events=new Map<string,EventProof>(), refunds=new Map<string,RefundProof>();
  const eraRows=new Map(world.eraHistory.receipts.filter(row=>row.kind==='workshop'&&row.eventId.endsWith('-release-accepted'))
    .map(row=>[row.eventId,row]));
  const stamp=(order:WorkshopOrder,tick:number,phase:'proposed'|'declined'|'accepted')=>{
    const eventId=`evt-workshop-${order.id}-${tick}-release-${phase}`;
    events.set(eventId,{order,tick});
    return eventId;
  };
  for(const order of world.workshops.orders){
    const rows=order.releaseNegotiations;
    if(!rows){
      if(order.closeReason==='mutual_release')return fail('workshops.release.missing');
      continue;
    }
    const proof=workshopReleaseSource(order);
    if(!rows.length||!proof||order.deadlineTick===undefined||order.disbandmentId!==undefined||
      proof.balanceStones<=0||proof.balanceHerbs<=0)return fail('workshops.release.source');
    const nextWork=order.work[2]?.tick, settled=order.settledTick;
    let priorOffered=-1, priorClosed=-1, accepted=false;
    for(const row of rows){
      const {offeredTick,closedTick,status}=row;
      const party=row.proposerId===order.patronId?order.makerId:row.proposerId===order.makerId?order.patronId:undefined;
      if(!party||accepted||offeredTick<=priorOffered||offeredTick<priorClosed||
        row.id!==`workshop-release-${order.id}-${offeredTick}`||offeredTick<=proof.firstFinishTick||offeredTick+1>=order.deadlineTick||
        offeredTick>world.tick||offeredTick>(nextWork??Infinity)||offeredTick>(settled??Infinity)||
        row.expiresTick!==Math.min(offeredTick+WORKSHOP_RELEASE_OFFER_TICKS,order.deadlineTick)||
        row.firstFinishTick!==proof.firstFinishTick||row.firstOutcome!==proof.firstOutcome||
        row.balanceStones!==proof.balanceStones||row.balanceHerbs!==proof.balanceHerbs)
        return fail('workshops.release.proof');
      priorOffered=offeredTick;
      priorClosed=closedTick??Infinity;
      stamp(order,offeredTick,'proposed');
      if(status==='offered'){
        if(closedTick!==undefined||world.tick>=row.expiresTick||order.status!=='active'||order.work.length!==2||
          order.escrowStones!==row.balanceStones||order.escrowHerbs!==row.balanceHerbs)
          return fail('workshops.release.open');
      }else if(closedTick===undefined||closedTick<offeredTick||closedTick>world.tick||closedTick>(settled??Infinity)){
        return fail('workshops.release.closed');
      }
      if(status==='accepted'||status==='declined'){
        if(closedTick===undefined||closedTick<=offeredTick||closedTick>=row.expiresTick||row.responderId!==party||
          row.supersededBy!==undefined||nextWork!==undefined&&closedTick>nextWork)
          return fail('workshops.release.reply');
        const eventId=stamp(order,closedTick,status);
        if(status==='accepted'){
          if(order.status!=='cancelled'||order.closeReason!=='mutual_release'||settled!==closedTick||order.work.length!==2||
            row.returnedStones!==row.balanceStones||row.returnedHerbs!==row.balanceHerbs||
            order.refundedStones!==row.returnedStones||order.refundedHerbs!==row.returnedHerbs)
            return fail('workshops.release.settlement');
          const durable=eraRows.get(eventId);
          if(!durable||durable.kind!=='workshop'||durable.tick!==closedTick||durable.locationId!==order.siteId||
            durable.orderId!==order.id||durable.patronId!==order.patronId||durable.makerId!==order.makerId||
            durable.status!=='cancelled'||durable.delivered!==Number(row.firstOutcome==='delivered'))
            return fail('workshops.release.historicalReceipt');
          eraRows.delete(eventId);
          refunds.set(order.id,{order,tick:closedTick,stone:row.returnedStones,earth_root:row.returnedHerbs});
          accepted=true;
        }
      }else if(row.responderId!==undefined)return fail('workshops.release.falseResponse');
      if(status!=='accepted'&&(row.returnedStones!==undefined||row.returnedHerbs!==undefined))
        return fail('workshops.release.falseRefund');
      if(status==='expired'&&(closedTick!==row.expiresTick||closedTick>(nextWork??Infinity)))
        return fail('workshops.release.expiry');
      if(status==='superseded'){
        if(closedTick===undefined||closedTick>=row.expiresTick||(
          row.supersededBy==='work_changed'?nextWork!==closedTick:
          row.supersededBy!=='contract_closed'||settled!==closedTick||(nextWork??Infinity)<=closedTick))
          return fail('workshops.release.superseded');
      }else if(row.supersededBy!==undefined)return fail('workshops.release.falseSupersession');
    }
    if(accepted!==(order.closeReason==='mutual_release'))return fail('workshops.release.reason');
  }
  if(eraRows.size)return fail('workshops.release.orphanHistory');
  const eventIds=new Set<string>();
  for(const event of world.events){
    if(!event.id.startsWith('evt-workshop-')||!/-release-(proposed|declined|accepted)$/.test(event.id))continue;
    const expected=events.get(event.id), order=expected?.order;
    if(!expected||!order||eventIds.has(event.id)||event.tick!==expected.tick||event.locationId!==order.siteId||
      event.category!=='diplomacy'||event.witnessScope!=='participants'||event.actorIds.length!==2||
      event.actorIds[0]!==order.patronId||event.actorIds[1]!==order.makerId)return fail('workshops.release.event');
    eventIds.add(event.id);
  }
  const present=new Map<number,boolean>(), seen=new Map<string,Set<string>>();
  for(const month of world.resourceFlow.months){
    present.set(month.tick,month.entries.length===month.totalEntries);
    for(const row of month.entries){
      if(row.reason!=='workshop_refund')continue;
      const expected=refunds.get(row.refId);
      if(!expected)continue;
      const got=seen.get(row.refId)??new Set<string>();
      if(row.mechanism!=='workshop'||row.kind!=='transfer'||row.tick!==expected.tick||
        row.from.kind!=='workshop'||row.from.id!==expected.order.id||row.to.kind!=='actor'||row.to.id!==expected.order.patronId||
        (row.good!=='stone'&&row.good!=='earth_root')||row.amount!==expected[row.good]||got.has(row.good)||
        row.visibility.kind!=='participants'||row.visibility.actorIds.length!==2||
        !row.visibility.actorIds.includes(expected.order.patronId)||!row.visibility.actorIds.includes(expected.order.makerId))
        return fail('workshops.release.refundJournal');
      got.add(row.good);
      seen.set(row.refId,got);
    }
  }
  for(const [id,expected] of refunds){
    if((present.get(expected.tick)===true||
      !present.has(expected.tick)&&expected.tick>world.tick-RESOURCE_FLOW_MONTH_LIMIT)&&seen.get(id)?.size!==2)
      return fail('workshops.release.refundJournal');
  }
}
