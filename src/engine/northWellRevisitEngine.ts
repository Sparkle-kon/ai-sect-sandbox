import type { Cultivator, LLMDecisionPayload, NorthWellReviewDecision, NorthWellReviewMove, WorldEvent, WorldState } from '../types/world';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { routeWarningHazardValid } from './routeWarningProof';
import { flowActor,recordResourceFlow } from './resourceFlowEngine';
import { NORTH_MINING_SITE,northMiningIsSealed } from './northMiningCharterTerms';
import { findNorthWellRevisitEvidence } from './northWellRevisitEvidence';
import { NORTH_WELL_PERMIT_LIFE,NORTH_WELL_REVIEW_FEE,NORTH_WELL_SURVEY_RECENCY,
  northWellPrecinctRestricted,northWellReviewId } from './northWellRevisitTerms';

export interface NorthWellReviewOption {action:'NORTH_WELL_REVIEW';northWellReviewMove:NorthWellReviewMove;targetNorthMiningCharterId:string}
const moves:readonly NorthWellReviewMove[]=['keep','permit'];
const onSite=(world:WorldState,actor:Cultivator,tick:number)=>world.cultivators.includes(actor)&&actor.age>=18&&
  doctrineFoundingPhysicallyAt(world,actor,NORTH_MINING_SITE,tick);
const matureSurvey=(world:WorldState,actorId:string,tick:number)=>
  world.coldWaterVein?.observations.slice().reverse().find(row=>row.actorId===actorId&&row.tick<tick&&row.tick>=tick-NORTH_WELL_SURVEY_RECENCY);

function keeper(world:WorldState,actor:Cultivator,ownerSectId:string|undefined,tick:number){
  return !northMiningIsSealed(world,tick)&&(!ownerSectId||ownerSectId===actor.sectId)&&
    (world.coldWaterVein?.oreRemaining??0)>0&&actor.spiritStones>=NORTH_WELL_REVIEW_FEE&&actor.spiritStones<=9999&&
    !world.mapHazards.some(row=>row.tileId===world.coldWaterVein?.tileIds[0]&&row.intensity>=2&&routeWarningHazardValid(world,row,tick));
}
export function availableNorthWellReviewActions(actor:Cultivator,world:WorldState,executionTick=world.tick):NorthWellReviewOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||!onSite(world,actor,executionTick)||
    !Number.isFinite(actor.spiritStones)||actor.spiritStones<NORTH_WELL_REVIEW_FEE||!matureSurvey(world,actor.id,executionTick))return [];
  const law=world.northWellRevisitLaw;
  const evidence=findNorthWellRevisitEvidence(world,law?.sourceCharterId,executionTick);
  if(!evidence||world.northWellRevisitReviews?.decisions.some(row=>row.actorId===actor.id&&row.sourceCharterId===evidence.charter.id))return [];
  const canPermit=northWellPrecinctRestricted(world,executionTick)&&keeper(world,actor,evidence.site.ownerSectId,executionTick);
  return moves.filter(move=>move==='keep'||canPermit).map(northWellReviewMove=>
    ({action:'NORTH_WELL_REVIEW',northWellReviewMove,targetNorthMiningCharterId:evidence.charter.id}));
}
export function utilityNorthWellReviewDecision(actor:Cultivator,world:WorldState):NorthWellReviewOption|undefined{
  if(actor.locationId!==NORTH_MINING_SITE)return undefined;
  const options=availableNorthWellReviewActions(actor,world);
  return actor.spiritStones<80?options.find(row=>row.northWellReviewMove==='permit')??options[0]:options[0];
}
export function resolveNorthWellReviewAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='NORTH_WELL_REVIEW'||Object.keys(payload).some(key=>!['chosenAction','innerMonologue','spokenLine','northWellReviewMove',
    'targetNorthMiningCharterId'].includes(key)))return null;
  const option=availableNorthWellReviewActions(actor,world).find(row=>row.targetNorthMiningCharterId===payload.targetNorthMiningCharterId&&
    row.northWellReviewMove===payload.northWellReviewMove);
  const survey=matureSurvey(world,actor.id,world.tick);
  if(!option||!survey)return null;
  const {northWellReviewMove:move,targetNorthMiningCharterId:sourceCharterId}=option;
  const law=world.northWellRevisitLaw;
  if(move==='permit'&&!law)return null;
  const proof=findNorthWellRevisitEvidence(world,sourceCharterId);
  if(!proof)return null;
  const id=northWellReviewId(world.tick,actor.id);
  const row:NorthWellReviewDecision={id,actorId:actor.id,sourceCharterId,freightClosedTick:proof.freightClosedTick,surveyId:survey.id,
    tick:world.tick,year:world.year,month:world.month,move,paidStones:NORTH_WELL_REVIEW_FEE,
    ...(law?{lawId:law.id}:{}),...(move==='permit'?{permit:{validFromTick:world.tick+1,expiresTick:world.tick+NORTH_WELL_PERMIT_LIFE+1}}:{})};
  actor.spiritStones-=NORTH_WELL_REVIEW_FEE;
  (world.northWellRevisitReviews??={version:1,decisions:[]}).decisions.push(row);
  recordResourceFlow(world,{kind:'consumption',mechanism:'north_well_review',reason:'old_well_review_paid',
    from:flowActor(actor.id),amount:NORTH_WELL_REVIEW_FEE,good:'stone',refId:id,
    visibility:{kind:'participants',actorIds:[actor.id]}});
  return {id:`evt-${id}`,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',locationId:NORTH_MINING_SITE,
    actorIds:[actor.id],witnessScope:'participants',title:move==='permit'?'旧井实批本人一次窄许':'旧井正册留存此人复核',
    description:move==='permit'?'本人实付四枚灵石，凭真实水尺领取从下月起三月内一次现场采矿许可。不开天门，不替别人发证。':
      '本人实付四枚灵石，核阅原井、同一旧契与真实过境记录；保留本线当前通行规定，没有解封或扣动作料。'};
}

export interface NorthWellRevisitView {
  sourceCharterId:string;wellProjectId:string;oldPassageTick:number;population:number;townTick?:number;
  law?:{year:number;month:number};recentPaidSurvey:boolean;
  ownReview?:{year:number;month:number;move:NorthWellReviewMove;paidStones:number;
    permit?:{validFromTick:number;expiresTick:number;spentTick?:number}};
}
/** Current inhabitants and any author's late legal change are intentionally shown as separate facts. */
export function projectNorthWellRevisit(world:WorldState,viewer?:Cultivator):NorthWellRevisitView|undefined{
  if(!viewer||!onSite(world,viewer,world.tick))return undefined;
  const law=world.northWellRevisitLaw, evidence=findNorthWellRevisitEvidence(world,law?.sourceCharterId);
  if(!evidence)return undefined;
  const own=world.northWellRevisitReviews?.decisions.find(row=>row.actorId===viewer.id&&row.sourceCharterId===evidence.charter.id);
  return {sourceCharterId:evidence.charter.id,wellProjectId:evidence.well.id,oldPassageTick:evidence.walked.tick,
    population:evidence.village.population,townTick:evidence.town?.tick,
    ...(law?{law:{year:law.year,month:law.month}}:{}),recentPaidSurvey:!!matureSurvey(world,viewer.id,world.tick+1),
    ...(own?{ownReview:{year:own.year,month:own.month,move:own.move,paidStones:own.paidStones,
      ...(own.permit?{permit:{validFromTick:own.permit.validFromTick,expiresTick:own.permit.expiresTick,spentTick:own.permit.spentTick}}:{})}}:{})};
}
