import type { DanxiaMedicineCommitment, DanxiaSeasonReliefProof,DanxiaSeasonSource,DanxiaShortage,SettlementRecord,WorldState } from '../types/world';
import { SETTLEMENT_RELIEF } from './settlementReliefTerms';
import {DANXIA_MEDICINE_ACK_TICKS,DANXIA_MEDICINE_LEAVES,danxiaMedicineId} from './danxiaMedicineTerms';

export const DANXIA_REVIEW_TERM_TICKS=3;
export const danxiaReviewId=(shortageId:string)=>`danxia-review-${shortageId}`;
const mod=(value:number,modulus:number)=>((value%modulus)+modulus)%modulus;

export function danxiaNextSeasonTick(world:Pick<WorldState,'month'|'tick'>,finalTick:number):number {
  const finalMonthIndex=mod(world.month-1+finalTick-world.tick,12);
  return finalTick+3-finalMonthIndex%3;
}

/** Read only the exact native relief receipt, not its public prose. */
export function matchesDanxiaReviewReliefReceipt(row:SettlementRecord,settlementId:string,
  actorId:string,sectId:string,proof?:DanxiaSeasonReliefProof):boolean {
  return row.kind==='relief'&&row.actorId===actorId&&row.sectId===sectId&&row.settlementId===settlementId&&
    row.people===0&&row.stones===SETTLEMENT_RELIEF.stones&&row.herbs===SETTLEMENT_RELIEF.jade_leaf&&
    row.id===`settlement-${row.tick}-relief-${settlementId}-${actorId}`&&
    (!proof||row.id===proof.id&&row.tick===proof.tick&&row.stones===proof.stones&&row.herbs===proof.herbs);
}

export const danxiaReviewPinnedReliefIds=(world:WorldState):Set<string>=>new Set(world.danxiaReviews.reviews
  .flatMap(row=>row.proposal?.relief?[row.proposal.relief.id]:[]));
export const danxiaReviewPinnedShortageIds=(world:WorldState):Set<string>=>new Set(world.danxiaReviews.reviews.map(row=>row.shortageId));

const validTick=(tick:number|undefined,now:number):tick is number=>tick!==undefined&&Number.isSafeInteger(tick)&&tick>=0&&tick<=now;

export function exactDanxiaSeasonCommitment(world:WorldState,shortage:DanxiaShortage):DanxiaMedicineCommitment|undefined {
  const rows=world.danxiaMedicine.commitments.filter(row=>row.shortageId===shortage.id);
  const row=rows[0];
  if(rows.length!==1||row.id!==danxiaMedicineId(shortage.id)||row.appointmentId!==shortage.appointmentId||
    row.sourceCaseId!==shortage.sourceCaseId||row.discipleId!==shortage.discipleId||row.patientId!==shortage.patientId||
    row.householdId!==shortage.householdId||row.volunteerId!==shortage.volunteerId||row.settlementId!==shortage.settlementId||
    row.originId!==shortage.siteId||row.startedTick<shortage.openedTick||row.startedTick>shortage.openedTick+1)return undefined;
  return row;
}

export function danxiaSeasonSource(world:WorldState,shortage:DanxiaShortage):DanxiaSeasonSource|undefined {
  const exists=world.danxiaMedicine.commitments.some(row=>row.shortageId===shortage.id);
  const row=exactDanxiaSeasonCommitment(world,shortage);
  if (!row) {
    const deadline=shortage.openedTick+1;
    if(exists||shortage.status!=='closed'||!shortage.resolution||!validTick(shortage.resolution.tick,world.tick)||
      world.tick<=deadline)return undefined;
    return {outcome:'no_commitment',finalTick:Math.max(deadline,shortage.resolution.tick),deliveredLeaves:0};
  }
  const stamp=row.settlement;
  if (row.status==='observed'&&row.choice==='observe'&&row.escrow===0&&stamp?.kind==='observed'&&
    stamp.tick===row.startedTick&&stamp.actorId===row.discipleId&&validTick(stamp.tick,world.tick)) {
    return {outcome:'observed',finalTick:stamp.tick,deliveredLeaves:0};
  }
  const reserved=row.reservedTick===row.startedTick&&validTick(row.reservedTick,world.tick);
  if(!reserved||row.choice==='observe')return undefined;
  if (row.status==='received'&&row.choice==='offer_ship'&&row.escrow===0&&stamp?.kind==='received'&&
    stamp.actorId===row.patientId&&validTick(stamp.tick,world.tick)&&validTick(row.acceptedTick,world.tick)&&
    validTick(row.departedTick,world.tick)&&validTick(row.arrivedTick,world.tick)&&
    row.startedTick<row.acceptedTick&&row.acceptedTick<row.departedTick&&row.departedTick<=row.arrivedTick&&
    row.arrivedTick<stamp.tick&&row.receiveUntilTick===row.arrivedTick+DANXIA_MEDICINE_ACK_TICKS&&stamp.tick<row.receiveUntilTick&&
    !!row.escortId&&row.escortId!==row.patientId&&row.escortId!==row.discipleId&&!!row.path&&row.pathIndex===row.path.length-1&&
    !row.disposition&&!row.hazard&&!row.returnStartedTick) {
    return {outcome:'delivered',finalTick:stamp.tick,deliveredLeaves:DANXIA_MEDICINE_LEAVES};
  }
  if ((row.status==='brewed'||row.status==='brew_failed')&&row.choice==='retain'&&row.escrow===0&&
    stamp?.kind===row.status&&stamp.actorId===row.discipleId&&validTick(stamp.tick,world.tick)&&stamp.tick>row.startedTick&&
    !!stamp.artifactEventId) return {outcome:'unfulfilled',finalTick:stamp.tick,deliveredLeaves:0};
  if (row.status==='lost'&&row.choice==='offer_ship'&&row.escrow===0&&stamp?.kind==='lost'&&
    validTick(stamp.tick,world.tick)&&stamp.tick>row.startedTick&&!!row.disposition) {
    return {outcome:'unfulfilled',finalTick:stamp.tick,deliveredLeaves:0};
  }
  if ((row.status==='recoverable'||row.status==='recovered')&&row.disposition&&validTick(row.disposition.tick,world.tick)&&
    row.disposition.tick>row.startedTick) {
    const finalTick=row.returnedTick??row.disposition.tick;
    if (validTick(finalTick,world.tick)&&finalTick>=row.disposition.tick) return {outcome:'unfulfilled',finalTick,deliveredLeaves:0};
  }
  return undefined;
}
