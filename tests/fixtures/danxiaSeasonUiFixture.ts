import { DANXIA_FIXTURE, danxiaActor, danxiaPayload, danxiaTurn, preparedDanxiaAppointment } from './danxiaNativeFixture';
import { availableDanxiaReviewActions, compareDanxiaSeasonReviews } from '../../src/engine/danxiaSeasonReviewEngine';
import { createTimeline, forkTimeline, readTimelineHead, recordTimelineWorld, selectTimelineBranch } from '../../src/engine/timelineEngine';
import type { LLMDecisionPayload, WorldState } from '../../src/types/world';

const f=DANXIA_FIXTURE;
function assert(value:unknown,stage:string):asserts value { if(!value)throw Error(`native Danxia fixture: ${stage}`); }
const travel=(id:string)=>danxiaPayload('EXPLORE',{targetLocationId:id});
const custody=(move:'observe'|'offer_ship',id:string,escort?:string)=>danxiaPayload('DANXIA_MEDICINE',{
  danxiaMedicineMove:move,targetDanxiaShortageId:id,...(escort?{targetCultivatorId:escort}:{}),
});
const followup=(move:'accept'|'receive',id:string)=>danxiaPayload('DANXIA_MEDICINE',{
  danxiaMedicineMove:move,targetDanxiaMedicineId:id,
});
const season=(move:'refuse'|'propose_renew'|'accept',id:string)=>danxiaPayload('DANXIA_REVIEW',{
  danxiaReviewMove:move,targetDanxiaReviewId:id,
});

export function danxiaSeasonUiFixture() {
  const prep=preparedDanxiaAppointment();
  const patient=prep.patientId,disciple=f.discipleId,escort=f.staffId;
  const origin=danxiaTurn(prep.world,{[patient]:danxiaPayload('CARE_FOLLOWUP',{
    careFollowupMove:'attend',targetCareFollowupId:prep.appointmentId,
  })});
  const shortage=origin.danxiaShortages.cases[0];
  assert(shortage?.status==='open'&&shortage.patientId===patient,'original actual shortage');
  // Same bounded controlled fixture stock as E2-4 tests; all later native custody stages are executed.
  danxiaActor(origin,disciple).herbs.jade_leaf=2;
  let timeline=forkTimeline(createTimeline(origin),origin.tick,{type:'SPAWN_TREASURE',targetLocationId:'loc-vein-north'},'实交支');
  const deliveryId=timeline.activeBranchId;
  const mainId='main';
  const read=(id:string)=>{const world=readTimelineHead(timeline,id);assert(world,'branch head');return world;};
  const next=(id:string,choices:Record<string,LLMDecisionPayload>={})=>{
    timeline=selectTimelineBranch(timeline,id);
    const world=danxiaTurn(read(id),choices);
    timeline=recordTimelineWorld(timeline,world,id);
    return world;
  };
  const wait=(id:string,when:(world:WorldState)=>boolean,max=20)=>{
    let world=read(id);
    for(let i=0;i<max&&!when(world);i++) world=next(id);
    assert(when(world),`time-bounded native proof on ${id}`);
    return world;
  };
  const review=(world:WorldState)=>world.danxiaReviews.reviews.find(row=>row.shortageId===shortage.id);
  next(mainId,{[disciple]:custody('observe',shortage.id),[patient]:travel(f.villageSiteId)});
  const observed=wait(mainId,world=>review(world)?.status==='open');
  const observedReview=review(observed);
  assert(observedReview?.source.outcome==='observed','only original observation, no stock');
  const refused=next(mainId,{[patient]:season('refuse',observedReview.id)});
  assert(review(refused)?.status==='refused','real household party chooses refusal');

  const offered=next(deliveryId,{[disciple]:custody('offer_ship',shortage.id,escort)});
  const posted=offered.danxiaMedicine.commitments.find(row=>row.shortageId===shortage.id);
  assert(posted?.status==='offered','actual exact 2-leaf offer');
  const accepted=next(deliveryId,{[escort]:followup('accept',posted.id),[patient]:travel(f.villageSiteId)});
  assert(accepted.danxiaMedicine.commitments[0]?.acceptedTick===accepted.tick,'actual carrier assent');
  const arrived=wait(deliveryId,world=>world.danxiaMedicine.commitments[0]?.status==='arrived');
  assert(arrived.danxiaMedicine.commitments[0]?.escrow===2,'arrival not yet received');
  const received=next(deliveryId,{[patient]:followup('receive',posted.id),[disciple]:travel(f.villageSiteId)});
  assert(received.danxiaMedicine.commitments[0]?.status==='received','actual original person received stock');
  const reviewed=wait(deliveryId,world=>review(world)?.status==='open');
  const deliveredReview=review(reviewed);
  assert(deliveredReview?.source.outcome==='delivered','original signed delivery anchors review');
  assert(availableDanxiaReviewActions(danxiaActor(reviewed,patient),reviewed,reviewed.tick+1)
    .some(row=>row.targetDanxiaReviewId===deliveredReview.id&&row.danxiaReviewMove==='propose_renew'),'native renew eligibility');
  const proposed=next(deliveryId,{[patient]:season('propose_renew',deliveredReview.id)});
  assert(review(proposed)?.status==='proposed','proposal not agreement');
  const renewed=next(deliveryId,{[disciple]:season('accept',deliveredReview.id)});
  assert(review(renewed)?.status==='renewed','separate genuine assent');

  while(read(mainId).tick<read(deliveryId).tick)next(mainId);
  while(read(deliveryId).tick<read(mainId).tick)next(deliveryId);
  const left=read(mainId),right=read(deliveryId),throughTick=left.tick;
  const paired=compareDanxiaSeasonReviews(origin,left,right,shortage.id,disciple);
  assert(paired&&paired.first.status==='refused'&&paired.second.status==='renewed','same exact native case authorised both sides');
  const outsider=origin.cultivators.find(actor=>![patient,disciple,escort].includes(actor.id));
  assert(outsider,'actual unrelated selector');
  assert(!compareDanxiaSeasonReviews(origin,left,right,shortage.id,outsider.id),'outsider denied both branches');
  return { timeline,mainId,deliveryId,throughTick,origin,left,right,patientId:patient,discipleId:disciple,outsiderId:outsider.id,
    shortageId:shortage.id,settlementId:shortage.settlementId,paired };
}
