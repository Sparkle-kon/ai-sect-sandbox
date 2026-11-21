import type {ScenarioObjective,WorldState} from '../types/world';
import {danxiaNextSeasonTick,danxiaReviewId,matchesDanxiaReviewReliefReceipt,danxiaSeasonSource,exactDanxiaSeasonCommitment} from './danxiaSeasonTerms';
import {DANXIA_SECT_ID} from './danxiaShortageTerms';

type ProcessObjective=Extract<ScenarioObjective,{kind:'danxia_medicine_outcome'}>;

/** Prove only the explicitly requested result of this branch at its horizon.
 * Private participants, routes, house records and unrelated outcomes never leave this function. */
export function verifiableDanxiaScenarioOutcome(world:WorldState,goal:ProcessObjective,throughTick=world.tick):boolean{
  if(!Number.isSafeInteger(throughTick)||throughTick<1||throughTick>world.tick)return false;
  for(const review of world.danxiaReviews.reviews){
    if(review.discipleId!==goal.actorId||review.settlementId!==goal.settlementId||review.openedTick>throughTick)continue;
    const originals=world.danxiaShortages.cases.filter(row=>row.id===review.shortageId);
    const original=originals[0];
    if(originals.length!==1||review.id!==danxiaReviewId(original.id)||
       original.discipleId!==review.discipleId||original.patientId!==review.patientId||original.settlementId!==review.settlementId||
       original.householdId!==review.householdId||original.volunteerId!==review.volunteerId||
       world.danxiaReviews.reviews.filter(row=>row.shortageId===original.id).length!==1)continue;
    const source=danxiaSeasonSource(world,original);
    const commitment=exactDanxiaSeasonCommitment(world,original);
    if(!source||review.commitmentId!==commitment?.id||!commitment&&source.outcome!=='no_commitment'||
        source.finalTick>=review.openedTick||review.openedTick!==danxiaNextSeasonTick(world,source.finalTick)||
        source.outcome!==review.source.outcome||source.finalTick!==review.source.finalTick||source.deliveredLeaves!==review.source.deliveredLeaves)continue;
    if(goal.required==='delivered'){
      if(source.outcome==='delivered'&&source.deliveredLeaves===2)return true;
      continue;
    }
    const decision=review.decision;
    if(review.status!==goal.required||!decision||decision.tick<review.openedTick||decision.tick>=review.expiresTick||
       decision.tick>throughTick)continue;
    if(goal.required==='refused'){
      if(decision.reason==='refused'&&decision.actorId===review.patientId)return true;
      continue;
    }
    const proposal=review.proposal;
    if(!proposal||decision.reason!=='signed'||decision.actorId!==proposal.representativeId||
       proposal.representativeId===review.patientId||proposal.proposedTick<review.openedTick||proposal.proposedTick>=decision.tick)continue;
    if(goal.required==='renewed'&&proposal.kind==='renew'&&source.outcome==='delivered'&&source.deliveredLeaves===2&&
       proposal.sectId===DANXIA_SECT_ID&&proposal.representativeId===review.discipleId&&!proposal.relief)return true;
    if(goal.required==='switched'&&proposal.kind==='switch'&&source.outcome==='unfulfilled'&&proposal.sectId!==DANXIA_SECT_ID&&
       proposal.representativeId!==review.discipleId&&proposal.relief&&proposal.relief.tick>source.finalTick&&
       proposal.relief.tick<proposal.proposedTick&&world.settlements.villages.some(village=>
         village.id===review.settlementId&&village.locationId===proposal.relief?.siteId)&&world.settlements.records.some(receipt=>
         matchesDanxiaReviewReliefReceipt(receipt,review.settlementId,proposal.representativeId,proposal.sectId,proposal.relief)))return true;
  }
  return false;
}
