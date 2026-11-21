import type { Cultivator, DanxiaReviewMove, DanxiaReviewsState, DanxiaSeasonReview, DanxiaSeasonSource,
  DanxiaShortage, LLMDecisionPayload, WorldEvent, WorldState } from '../types/world';
import {danxiaMedicineActedThisTick,activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import { DANXIA_REVIEW_TERM_TICKS, danxiaNextSeasonTick, danxiaReviewId, matchesDanxiaReviewReliefReceipt,danxiaSeasonSource,exactDanxiaSeasonCommitment } from './danxiaSeasonTerms';
import { DANXIA_SECT_ID } from './danxiaShortageTerms';
import { isRetiredFromService } from './serviceRetirementEngine';
import { SETTLEMENT_RELIEF } from './settlementReliefTerms';
import { presentAtVillageGranary } from './villageGranaryEngine';
import { sameGeneratedWorld } from './worldIdentity';

export const createDanxiaReviewsState=():DanxiaReviewsState=>({reviews:[]});
export type DanxiaReviewOption =
  | {action:'DANXIA_REVIEW'; danxiaReviewMove:'propose_switch';targetDanxiaReviewId:string;targetSettlementRecordId:string}
  | {action:'DANXIA_REVIEW'; danxiaReviewMove:Exclude<DanxiaReviewMove,'propose_switch'>;targetDanxiaReviewId:string;targetSettlementRecordId?:never};

const alive = (actor:Cultivator|undefined):actor is Cultivator => !!actor?.alive && actor.hp>0;
const actorAt = (world:WorldState,id:string) => world.cultivators.find(row=>row.id===id);
const ascii=(a:string,b:string)=>a<b?-1:a>b?1:0;
const originalVillage=(world:WorldState,settlementId:string)=>world.settlements.villages.find(row=>row.id===settlementId&&row.population>0);
function atReviewVillage(world:WorldState,actor:Cultivator,settlementId:string,tick:number) {
  return alive(actor)&&presentAtVillageGranary(world,actor,tick)?.id===settlementId&&
    !activeDanxiaMedicineEscort(world,actor)&&(tick!==world.tick||!danxiaMedicineActedThisTick(world,actor));
}
function isHouseholdSignatory(world:WorldState,row:DanxiaSeasonReview,actor:Cultivator,tick:number) {
  return row.patientId===actor.id&&atReviewVillage(world,actor,row.settlementId,tick)&&
    world.households.members.some(item=>item.recruitedId===actor.id&&item.status==='recruited'&&
      item.householdId===row.householdId&&item.volunteerId===row.volunteerId&&item.settlementId===row.settlementId)&&
    world.households.groups.some(item=>item.id===row.householdId&&item.presences.some(place=>place.settlementId===row.settlementId));
}
function canRepresent(world:WorldState,row:DanxiaSeasonReview,actor:Cultivator|undefined,sectId:string,tick:number,kind:'renew'|'switch') {
  if(!alive(actor)||actor.id===row.patientId||!atReviewVillage(world,actor,row.settlementId,tick)||
    actor.sectId!==sectId||isRetiredFromService(actor))return false;
  const sect=world.sects.find(item=>item.id===sectId);
  if(!sect)return false;
  if(kind==='renew')return sectId===DANXIA_SECT_ID&&actor.id===row.discipleId&&
    (actor.sectRank==='内门弟子'||actor.sectRank==='真传弟子'||actor.sectRank==='长老'||actor.sectRank==='太上长老'||sect.leaderId===actor.id);
  return sectId!==DANXIA_SECT_ID&&actor.id!==row.discipleId&&
    (sect.leaderId===actor.id||actor.sectRank==='长老'||actor.sectRank==='太上长老');
}
function alternateReceipts(world:WorldState,row:DanxiaSeasonReview,tick:number) {
  const village=originalVillage(world,row.settlementId);
  if(!village||row.source.outcome!=='unfulfilled')return [];
  return world.settlements.records.flatMap(entry=>{
    if(!entry.actorId||!entry.sectId||entry.tick<=row.source.finalTick||entry.tick>=tick||
      !matchesDanxiaReviewReliefReceipt(entry,village.id,entry.actorId,entry.sectId)||
      !canRepresent(world,row,actorAt(world,entry.actorId),entry.sectId,tick,'switch'))return [];
    return [{entry,actorId:entry.actorId,sectId:entry.sectId,siteId:village.locationId}];
  }).sort((a,b)=>a.entry.tick-b.entry.tick||ascii(a.entry.id,b.entry.id));
}
function canSignPending(world:WorldState,row:DanxiaSeasonReview,tick:number) {
  const request=row.proposal;
  const patient=actorAt(world,row.patientId);
  const signatory=request&&actorAt(world,request.representativeId);
  if(!request||!patient||!isHouseholdSignatory(world,row,patient,tick)||
    tick<=request.proposedTick||!canRepresent(world,row,signatory,request.sectId,tick,request.kind))return false;
  if(request.kind==='renew')return row.source.outcome==='delivered';
  const proof=request.relief;
  return !!proof&&originalVillage(world,row.settlementId)?.locationId===proof.siteId&&
    alternateReceipts(world,row,tick).some(item=>item.entry.id===proof.id&&item.actorId===request.representativeId&&
      item.sectId===request.sectId&&matchesDanxiaReviewReliefReceipt(item.entry,row.settlementId,item.actorId,item.sectId,proof));
}

export function availableDanxiaReviewActions(actor:Cultivator,world:WorldState,executionTick=world.tick):DanxiaReviewOption[] {
  if(!world.cultivators.includes(actor)||!alive(actor)||(executionTick!==world.tick&&executionTick!==world.tick+1))return [];
  const result:DanxiaReviewOption[]=[];
  for(const row of world.danxiaReviews.reviews) {
    if((row.status!=='open'&&row.status!=='proposed')||executionTick<row.openedTick||executionTick>=row.expiresTick)continue;
    const base={action:'DANXIA_REVIEW' as const,targetDanxiaReviewId:row.id};
    if(isHouseholdSignatory(world,row,actor,executionTick)) {
      result.push({...base,danxiaReviewMove:'refuse'});
      if(row.status==='open'&&executionTick+1<row.expiresTick) {
        if(row.source.outcome==='delivered'&&canRepresent(world,row,actorAt(world,row.discipleId),DANXIA_SECT_ID,executionTick,'renew'))
          result.push({...base,danxiaReviewMove:'propose_renew'});
        for(const {entry} of alternateReceipts(world,row,executionTick))
          result.push({...base,danxiaReviewMove:'propose_switch',targetSettlementRecordId:entry.id});
      }
    }
    if(row.status==='proposed'&&row.proposal?.representativeId===actor.id&&canSignPending(world,row,executionTick))
      result.push({...base,danxiaReviewMove:'accept'},{...base,danxiaReviewMove:'decline'});
  }
  return result;
}

function event(world:WorldState,row:DanxiaSeasonReview,step:string,title:string,description:string):WorldEvent {
  const site=originalVillage(world,row.settlementId);
  return {id:`evt-${world.tick}-${row.id}-${step}`,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',
    title,description,actorIds:[...new Set([row.discipleId,row.patientId,...(row.proposal?[row.proposal.representativeId]:[])])],
    ...(site?{locationId:site.locationId}:{}),witnessScope:'participants'};
}

export function resolveDanxiaReviewAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null {
  const move=payload.danxiaReviewMove;
  const fields=['chosenAction','innerMonologue','spokenLine','danxiaReviewMove','targetDanxiaReviewId',
    ...(move==='propose_switch'?['targetSettlementRecordId']:[])];
  if(payload.chosenAction!=='DANXIA_REVIEW'||Object.entries(payload).some(([key,value])=>value!==undefined&&!fields.includes(key)&&
    !(key==='action'&&value==='DANXIA_REVIEW')))return null;
  const choice=availableDanxiaReviewActions(actor,world).find(option=>option.danxiaReviewMove===move&&
    option.targetDanxiaReviewId===payload.targetDanxiaReviewId&&option.targetSettlementRecordId===payload.targetSettlementRecordId);
  const row=choice&&world.danxiaReviews.reviews.find(item=>item.id===choice.targetDanxiaReviewId);
  if(!row||!choice)return null;
  if(choice.danxiaReviewMove==='propose_renew'||choice.danxiaReviewMove==='propose_switch') {
    const alternate=choice.danxiaReviewMove==='propose_switch'?alternateReceipts(world,row,world.tick)
      .find(item=>item.entry.id===choice.targetSettlementRecordId):undefined;
    if(choice.danxiaReviewMove==='propose_switch'&&!alternate)return null;
    row.proposal=alternate?{kind:'switch',representativeId:alternate.actorId,sectId:alternate.sectId,proposedTick:world.tick,
      relief:{id:alternate.entry.id,tick:alternate.entry.tick,siteId:alternate.siteId,stones:SETTLEMENT_RELIEF.stones,
        herbs:SETTLEMENT_RELIEF.jade_leaf}}:
      {kind:'renew',representativeId:row.discipleId,sectId:DANXIA_SECT_ID,proposedTick:world.tick};
    row.status='proposed';
    return event(world,row,'proposal',alternate?'本人提议与另一宗商谈':'本人提议续约',
      '求药人仅为原关系提出下季安排，尚无对方独立同意，没有划拨资源。');
  }
  if(choice.danxiaReviewMove==='accept'&&row.proposal) {
    row.status=row.proposal.kind==='renew'?'renewed':'switched';
    row.decision={tick:world.tick,actorId:actor.id,reason:'signed'};
    return event(world,row,row.status,row.status==='renewed'?'两方实际同意续约':'两方实际同意改约',
      '原求药人与真实对方当场分别同意；新药材和施治均未在此结算。');
  }
  if(choice.danxiaReviewMove==='decline') {
    row.status='no_agreement';row.decision={tick:world.tick,actorId:actor.id,reason:'declined'};
    return event(world,row,'declined','提议未获对方同意','没有续约、改约或推定已支出药材。');
  }
  if(choice.danxiaReviewMove==='refuse') {
    row.status='refused';row.decision={tick:world.tick,actorId:actor.id,reason:'refused'};
    return event(world,row,'refused','求药人明确拒绝这一合作','只记录本人拒绝该项下季关系，不代表全村，也不改写原交付。');
  }
  return null;
}

/** Native once-per-calendar-turn scheduler. Old imported evidence never backdates a nonexistent meeting. */
export function advanceDanxiaSeasonReviews(world:WorldState):WorldEvent[] {
  if(!world.danxiaShortages.cases.length&&!world.danxiaReviews.reviews.length)return [];
  const events:WorldEvent[]=[];
  for(const row of world.danxiaReviews.reviews) {
    if((row.status==='open'||row.status==='proposed')&&world.tick>=row.expiresTick) {
      row.status='no_agreement';row.decision={tick:world.tick,reason:'expired'};
      events.push(event(world,row,'expired','本季未形成新约','真实期限已过，没有替任何人拒绝、同意或消费药材。'));
    }
  }
  const seen=new Set(world.danxiaReviews.reviews.map(row=>row.shortageId));
  for(const shortage of world.danxiaShortages.cases) {
    if(seen.has(shortage.id)||!originalVillage(world,shortage.settlementId))continue;
    const source=danxiaSeasonSource(world,shortage);
    if(!source||world.tick!==danxiaNextSeasonTick(world,source.finalTick))continue;
    const commitment=exactDanxiaSeasonCommitment(world,shortage);
    const row:DanxiaSeasonReview={id:danxiaReviewId(shortage.id),shortageId:shortage.id,
      ...(commitment?{commitmentId:commitment.id}:{}),discipleId:shortage.discipleId,patientId:shortage.patientId,
      householdId:shortage.householdId,volunteerId:shortage.volunteerId,settlementId:shortage.settlementId,source,
      openedTick:world.tick,expiresTick:world.tick+DANXIA_REVIEW_TERM_TICKS,status:'open'};
    world.danxiaReviews.reviews.push(row);
    seen.add(shortage.id);
    events.push(event(world,row,'opened','次季核对原药约','核对原先承诺与真实签收；到站、炼丹和施治各自另计。'));
  }
  return events;
}

export interface DanxiaSeasonReviewView {
  id:string; shortageId:string; role:'patient'|'original_disciple'|'representative';
  openedTick:number; expiresTick:number; status:DanxiaSeasonReview['status']; source:DanxiaSeasonSource;
  proposal?:{kind:'renew'|'switch';proposedTick:number;reliefTick?:number};
  decision?:{tick:number;reason:NonNullable<DanxiaSeasonReview['decision']>['reason']};
}
export function projectDanxiaSeasonReviews(world:WorldState,viewer?:Cultivator):DanxiaSeasonReviewView[] {
  if(!viewer||!world.cultivators.includes(viewer))return [];
  return world.danxiaReviews.reviews.flatMap((row):DanxiaSeasonReviewView[]=>{
    const role=viewer.id===row.patientId?'patient':viewer.id===row.discipleId?'original_disciple':
      viewer.id===row.proposal?.representativeId?'representative':undefined;
    if(!role)return [];
    const now=row.decision, request=row.proposal;
    return [{id:row.id,shortageId:row.shortageId,role,openedTick:row.openedTick,expiresTick:row.expiresTick,status:row.status,
      source:{...row.source},...(request?{proposal:{kind:request.kind,proposedTick:request.proposedTick,
        ...(request.relief?{reliefTick:request.relief.tick}:{})}}:{}),
      ...(now?{decision:{tick:now.tick,reason:now.reason}}:{})}];
  });
}

/** For a caller that has already verified that baseline really is the siblings' stored shared origin. */
export function compareDanxiaSeasonReviews(origin:WorldState,first:WorldState,second:WorldState,shortageId:string,viewerId:string):
  {first:DanxiaSeasonReviewView;second:DanxiaSeasonReviewView}|undefined {
  const original=origin.danxiaShortages.cases.find(row=>row.id===shortageId);
  if(!original||(original.discipleId!==viewerId&&original.patientId!==viewerId))return undefined;
  const matches=(world:WorldState,row:DanxiaShortage|undefined)=>!!row&&row.discipleId===original.discipleId&&
    row.patientId===original.patientId&&row.householdId===original.householdId&&row.volunteerId===original.volunteerId&&
    row.settlementId===original.settlementId&&row.siteId===original.siteId&&row.appointmentId===original.appointmentId&&
    row.sourceCaseId===original.sourceCaseId&&row.openedTick===original.openedTick&&world.tick>=origin.tick&&
    row.requiredLeaves===original.requiredLeaves&&row.availableLeaves===original.availableLeaves&&
    row.demandIds.length===original.demandIds.length&&row.demandIds.every((id,index)=>id===original.demandIds[index])&&
    row.regrowth.tick===original.regrowth.tick&&row.regrowth.siteId===original.regrowth.siteId&&row.regrowth.kind===original.regrowth.kind&&
    row.regrowth.intensity===original.regrowth.intensity&&row.regrowth.before===original.regrowth.before&&
    row.regrowth.capacity===original.regrowth.capacity&&row.regrowth.grown===original.regrowth.grown&&
    sameGeneratedWorld(world,origin)&&origin.worldgen?.birthTick!==undefined&&world.worldgen?.birthTick===origin.worldgen.birthTick;
  const project=(world:WorldState)=>{
    const row=world.danxiaShortages.cases.find(item=>item.id===shortageId);
    return matches(world,row)?projectDanxiaSeasonReviews(world,actorAt(world,viewerId)).find(view=>view.shortageId===shortageId):undefined;
  };
  const a=project(first),b=project(second);
  return a&&b?{first:a,second:b}:undefined;
}


export function localDanxiaSeasonReviewSite(world:WorldState,viewer?:Cultivator):string|undefined {
  if(!viewer||!world.cultivators.includes(viewer))return undefined;
  const review=world.danxiaReviews.reviews.find(row=>(row.status==='open'||row.status==='proposed')&&
    (viewer.id===row.discipleId||viewer.id===row.patientId||viewer.id===row.proposal?.representativeId)&&
    row.openedTick<=world.tick&&world.tick<row.expiresTick&&atReviewVillage(world,viewer,row.settlementId,world.tick));
  return review&&originalVillage(world,review.settlementId)?.locationId;
}
