import type {WorldState,WorldEvent} from '../types/world';
import {availableDanxiaReviewActions} from './danxiaSeasonReviewEngine';
import {DANXIA_REVIEW_TERM_TICKS,danxiaNextSeasonTick,danxiaReviewId,matchesDanxiaReviewReliefReceipt,danxiaSeasonSource,exactDanxiaSeasonCommitment} from './danxiaSeasonTerms';
import {DANXIA_SECT_ID} from './danxiaShortageTerms';

export function validateDanxiaSeasonReviewHistory(world:WorldState,actors:ReadonlySet<string>,fail:(path:string)=>never):void {
  const order=world.playerAvatar.pendingOrder;
  if(order?.action==='DANXIA_REVIEW'){
    const state=world.playerAvatar;
    const host=world.cultivators.find(row=>row.id===order.actorId&&row.alive&&row.hp>0);
    if(!host||order.actorId!==state.possessedId||order.queuedTick!==world.tick||(state.possessionUntilTick??0)<=world.tick+1||
      !availableDanxiaReviewActions(host,world,world.tick+1).some(option=>option.danxiaReviewMove===order.danxiaReviewMove&&
        option.targetDanxiaReviewId===order.targetDanxiaReviewId&&option.targetSettlementRecordId===order.targetSettlementRecordId))
      fail('playerAvatar.pendingOrder.danxiaReview');
  }
  if(!world.danxiaReviews.reviews.length)return;
  const originals=new Map(world.danxiaShortages.cases.map(row=>[row.id,row]));
  const villages=new Map(world.settlements.villages.map(row=>[row.id,row]));
  const reliefRecords=new Map(world.settlements.records.map(row=>[row.id,row]));
  const sects=new Set(world.sects.map(row=>row.id));
  const sources=new Set<string>();
  const events=new Map<string,{tick:number;characters:string[];site:string}>();
  for(const row of world.danxiaReviews.reviews){
    const {id,shortageId,openedTick,expiresTick,proposal,decision,source,status}=row;
    const original=originals.get(shortageId), village=villages.get(row.settlementId);
    const verified=original&&danxiaSeasonSource(world,original);
    const commitment=original&&exactDanxiaSeasonCommitment(world,original);
    if(!original||!verified||!village||sources.has(shortageId)||id!==danxiaReviewId(shortageId)||
      !actors.has(row.discipleId)||!actors.has(row.patientId)||row.discipleId===row.patientId||
      row.patientId!==original.patientId||row.discipleId!==original.discipleId||row.settlementId!==original.settlementId||
      row.householdId!==original.householdId||row.volunteerId!==original.volunteerId||row.commitmentId!==commitment?.id||
      verified.outcome!==source.outcome||verified.finalTick!==source.finalTick||verified.deliveredLeaves!==source.deliveredLeaves||
      source.finalTick>=openedTick||openedTick>world.tick||openedTick!==danxiaNextSeasonTick(world,source.finalTick)||
      expiresTick!==openedTick+DANXIA_REVIEW_TERM_TICKS)fail('danxiaReviews.reviews.source');
    sources.add(shortageId);

    if(proposal){
      const {kind,representativeId,sectId,proposedTick,relief}=proposal;
      const native=relief&&reliefRecords.get(relief.id);
      if(!actors.has(representativeId)||representativeId===row.patientId||!sects.has(sectId)||
        proposedTick<openedTick||proposedTick>world.tick||proposedTick+1>=expiresTick||
        (kind==='renew' ? source.outcome!=='delivered'||sectId!==DANXIA_SECT_ID||representativeId!==row.discipleId||!!relief :
          source.outcome!=='unfulfilled'||sectId===DANXIA_SECT_ID||representativeId===row.discipleId||!relief||
          !native||relief.siteId!==village.locationId||relief.tick<=source.finalTick||relief.tick>=proposedTick||
          !matchesDanxiaReviewReliefReceipt(native,row.settlementId,representativeId,sectId,relief)))
        fail('danxiaReviews.reviews.proposal');
    }
    const live=status==='open'||status==='proposed';
    if(live ? !!decision||world.tick>=expiresTick||(status==='proposed')!==!!proposal :
      !decision||decision.tick>world.tick||decision.tick<openedTick||
      (!!proposal&&decision.tick<proposal.proposedTick)||
      ((status==='renewed'||status==='switched') ?
        !proposal||decision.reason!=='signed'||decision.actorId!==proposal.representativeId||
        decision.tick<=proposal.proposedTick||decision.tick>=expiresTick||proposal.kind!==(status==='renewed'?'renew':'switch') :
        status==='refused' ? decision.reason!=='refused'||decision.actorId!==row.patientId||decision.tick>=expiresTick :
        decision.reason==='expired' ? decision.actorId!==undefined||decision.tick!==expiresTick :
        decision.reason!=='declined'||!proposal||decision.actorId!==proposal.representativeId||
        decision.tick<=proposal.proposedTick||decision.tick>=expiresTick))
      fail('danxiaReviews.reviews.decision');

    const event=(token:string,tick:number,hasProposal:boolean)=>{
      const idKey=`evt-${tick}-${id}-${token}`;
      events.set(idKey,{tick,characters:[...new Set([row.discipleId,row.patientId,
        ...(hasProposal&&proposal?[proposal.representativeId]:[])])],site:village.locationId});
    };
    event('opened',openedTick,false);
    if(proposal)event('proposal',proposal.proposedTick,true);
    if(decision)event(decision.reason==='signed'?status:decision.reason,decision.tick,!!proposal);
  }
  const prefix=/^evt-\d+-(danxia-review-danxia-shortage-care-followup-[1-9]\d*)-/;
  const nativeIds=new Set(world.danxiaReviews.reviews.map(item=>item.id));
  const seen=new Set<string>();
  const eventCheck=(event:WorldEvent)=>{
    const match=prefix.exec(event.id);
    if(!match||!nativeIds.has(match[1]))return;
    const evidence=events.get(event.id);
    if(!evidence||seen.has(event.id)||event.tick!==evidence.tick||event.category!=='diplomacy'||
      event.witnessScope!=='participants'||event.locationId!==undefined&&event.locationId!==evidence.site||
      event.actorIds.length!==evidence.characters.length||event.actorIds.some((id,i)=>id!==evidence.characters[i]))
      fail('danxiaReviews.events.private');
    seen.add(event.id);
  };
  world.events.forEach(eventCheck);
  const privateAnchor=({id}:{id:string})=>nativeIds.has(prefix.exec(id)?.[1]??'');
  if(world.chronicleArchive.anchors.some(privateAnchor)||world.chronicleArchive.chapters.some(chapter=>chapter.anchors.some(privateAnchor))||
    world.coldHistory.chapters.some(chapter=>chapter.anchors.some(privateAnchor)))fail('danxiaReviews.publicArchive');
}
