import type {Cultivator,WorldState} from '../types/world';
import {projectNorthWellRevisit} from '../engine/northWellRevisitEngine';
import type {NorthWellEvidenceView,RevisitDate} from './NorthWellRevisitPanel';

function offset(date:RevisitDate,months:number):RevisitDate {
  const total=date.month-1+months;
  return {year:date.year+Math.floor(total/12),month:((total%12)+12)%12+1};
}

/** First require the native local proof; optional detail is selected only by its exact IDs and own actor. */
export function northWellPanelEvidence(world:WorldState,viewer?:Cultivator):NorthWellEvidenceView|undefined {
  if(!viewer)return;
  const proof=projectNorthWellRevisit(world,viewer);
  if(!proof)return;
  const original=world.northMiningCharters?.charters.find(row=>row.id===proof.sourceCharterId&&row.wellProjectId===proof.wellProjectId);
  const site=original&&world.locations.find(row=>row.id===original.siteId);
  const village=site&&world.settlements.villages.find(row=>row.id===original?.settlementId&&row.locationId===site.id);
  if(!original||!site||!village)return;
  const currentStage=world.villageEvolution.villages.find(row=>row.siteId===site.id&&row.settlementId===village.id)?.status??'village';
  const survey=[...(world.coldWaterVein?.observations??[])].reverse().find(row=>row.actorId===viewer.id&&row.tick<=world.tick);
  const review=world.northWellRevisitReviews?.decisions.find(row=>row.actorId===viewer.id&&row.sourceCharterId===original.id);
  const law=proof.law&&world.northWellRevisitLaw;
  const ownReview=review&&proof.ownReview;
  const permit=ownReview?.permit;
  const permitState=permit&&(permit.spentTick!==undefined?'spent':world.tick>=permit.expiresTick?'expired':
    world.tick<permit.validFromTick?'waiting':'valid');
  return {scope:'local',siteName:site.name,wellName:'原公井',
    original:{date:{year:original.year,month:original.month},stance:original.stance,verifiedPassage:true},
    current:{date:{year:world.year,month:world.month},population:proof.population,status:currentStage,hereReader:viewer.name},
    ...(law?{law:{date:{year:law.year,month:law.month},retainedPopulation:law.retainedPopulation}}:{}),
    recentPaidSurvey:proof.recentPaidSurvey,
    ...(survey?{ownSurvey:{date:{year:survey.year,month:survey.month},paidStones:survey.paidStones,depth:survey.wellDepth}}:{}),
    ...(ownReview&&review?{ownReview:{date:{year:ownReview.year,month:ownReview.month},move:ownReview.move,paidStones:ownReview.paidStones,
      ...(permit?{expires:offset(ownReview,permit.expiresTick-1-review.tick),permitState}:{})}}:{}),
  };
}
