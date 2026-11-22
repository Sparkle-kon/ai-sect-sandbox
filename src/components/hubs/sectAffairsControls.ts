import type {useWorldSimulationController} from '../../controllers/useWorldSimulationController';
import type {Cultivator,WorldState} from '../../types/world';
import {activeAvatar,canQueueAvatarSalvage,queueAvatarCraftTraining,queueAvatarDanxiaMedicine,queueAvatarDanxiaReview,
  queueAvatarDoctrineFounding,queueAvatarDoctrineMaturity,queueAvatarWorkshopEstate,queueAvatarWorkshopRelease} from '../../engine/avatarEngine';
import {availableCraftTrainingActions} from '../../engine/craftTrainingEngine';
import {availableDanxiaMedicineActions,type DanxiaMedicineOption} from '../../engine/danxiaMedicineEngine';
import {availableDanxiaReviewActions,type DanxiaReviewOption} from '../../engine/danxiaSeasonReviewEngine';
import {availableDoctrineFoundingActions,type DoctrineFoundingOption} from '../../engine/doctrineFoundingEngine';
import {availableDoctrineMaturityActions,type DoctrineMaturityOption} from '../../engine/doctrineMaturityEngine';
import {availableWorkshopEstateActions,availableWorkshopReleaseActions,type WorkshopReleaseOption} from '../../engine/workshopEngine';
import type {CraftTrainingControls} from '../CraftTrainingRead';
import type {DanxiaMedicineControlsProps} from '../DanxiaMedicineControls';
import type {DanxiaSeasonReviewControlsProps} from '../DanxiaSeasonReviewControls';
import type {DoctrineFoundingControlsProps} from '../DoctrineFoundingControls';
import type {DoctrineMaturityControlsProps} from '../DoctrineMaturityControls';
import type {WorkshopEstateControls} from '../WorkshopEstateRead';
import type {WorkshopReleaseControls} from '../WorkshopReleaseRead';

export type SectAffairsSimulation=ReturnType<typeof useWorldSimulationController>;

export function buildSectAffairsControls(simulation:SectAffairsSimulation,active:boolean,selectedCultivator?:Cultivator){
  const {world,visibleWorld,preview,viewScopeKey,saveContextVersion,browsing,stepInFlight,fastForwardRun,campaignGuard,
    history,timeline,authority,setIsRunning,updateWorld,isStepping,fastForwardLocked}=simulation;
  const medicineContextVersion=saveContextVersion.current;
  const workshopAvatar=active&&!preview&&selectedCultivator&&activeAvatar(world)?.id===selectedCultivator.id?
    selectedCultivator:undefined;
  const medicineAvatar=workshopAvatar&&canQueueAvatarSalvage(world,workshopAvatar.id)?workshopAvatar:undefined;
  const current=()=>active&&!browsing.current&&!stepInFlight.current&&!fastForwardRun.current&&!campaignGuard.current&&
    history.current===timeline&&authority.current===world&&saveContextVersion.current===medicineContextVersion;
  function queue<T>(avatar:Cultivator|undefined,option:T,send:(next:WorldState,actorId:string,value:T)=>boolean,pauseBefore=false){
    if(!avatar||!current())return false;
    if(pauseBefore)setIsRunning(false);
    const updated=updateWorld(frame=>{
      const next=structuredClone(frame);
      return send(next,avatar.id,option)?next:frame;
    });
    if(!pauseBefore&&updated!==world)setIsRunning(false);
    return updated!==world;
  }
  const queueDanxiaMedicine=(option:DanxiaMedicineOption)=>queue(medicineAvatar,option,queueAvatarDanxiaMedicine,true);
  const medicineControls:DanxiaMedicineControlsProps|undefined=active&&selectedCultivator?{
    scopeKey:`${viewScopeKey}:${selectedCultivator.id}`,revisionKey:visibleWorld,
    choices:medicineAvatar?availableDanxiaMedicineActions(medicineAvatar,world,world.tick+1).map(option=>({
      option,...(option.targetCultivatorId?{label:world.cultivators.find(actor=>actor.id===option.targetCultivatorId)?.name}:{})
    })):[],
    disabled:isStepping||fastForwardLocked||!!preview,
    ...(medicineAvatar?{onQueue:queueDanxiaMedicine}:{}),
  }:undefined;
  const queueDanxiaReview=(option:DanxiaReviewOption)=>queue(medicineAvatar,option,queueAvatarDanxiaReview);
  const seasonReviewControls:DanxiaSeasonReviewControlsProps|undefined=medicineControls&&medicineAvatar?{
    scopeKey:medicineControls.scopeKey,revisionKey:visibleWorld,disabled:medicineControls.disabled,onQueue:queueDanxiaReview,
    choices:availableDanxiaReviewActions(medicineAvatar,world,world.tick+1).map(option=>{
      const review=world.danxiaReviews.reviews.find(row=>row.id===option.targetDanxiaReviewId);
      const village=review&&world.settlements.villages.find(row=>row.id===review.settlementId);
      const relief=option.targetSettlementRecordId&&world.settlements.records.find(row=>row.id===option.targetSettlementRecordId);
      const donor=relief?world.cultivators.find(row=>row.id===relief.actorId):undefined;
      return {option,label:[village?.name,review?`第 ${review.openedTick} 轮核约`:undefined,
        donor?`${donor.name}实赈`:undefined,relief?`第 ${relief.tick} 轮`:undefined].filter(Boolean).join(' · ')};
    }),
  }:undefined;
  const queueDoctrineFounding=(option:DoctrineFoundingOption)=>queue(medicineAvatar,option,queueAvatarDoctrineFounding);
  const foundingControls:DoctrineFoundingControlsProps|undefined=medicineControls&&medicineAvatar?{
    scopeKey:medicineControls.scopeKey,revisionKey:visibleWorld,disabled:medicineControls.disabled,onQueue:queueDoctrineFounding,
    choices:availableDoctrineFoundingActions(medicineAvatar,world,world.tick+1).map(option=>{
      const row=option.targetDoctrineFoundingId?world.doctrineFoundings.foundings.find(item=>item.id===option.targetDoctrineFoundingId):undefined;
      const plan=option.targetRelocationId?world.relocations.plans.find(item=>item.id===option.targetRelocationId):undefined;
      const place=world.locations.find(item=>item.id===(row?.oldSiteId??plan?.originId));
      return {option,label:[row?.independentName,place?.name].filter(Boolean).join(' · ')};
    }),
  }:undefined;
  const queueDoctrineMaturity=(option:DoctrineMaturityOption)=>queue(medicineAvatar,option,queueAvatarDoctrineMaturity);
  const maturityControls:DoctrineMaturityControlsProps|undefined=medicineControls&&medicineAvatar?{
    scopeKey:medicineControls.scopeKey,revisionKey:visibleWorld,disabled:medicineControls.disabled,onQueue:queueDoctrineMaturity,
    choices:availableDoctrineMaturityActions(medicineAvatar,world,world.tick+1).map(option=>{
      const charter=world.doctrineFoundings.foundings.find(item=>item.id===option.targetDoctrineFoundingId);
      const proof=charter?.maturity?.support;
      return {option,label:charter?.independentName,
        ...(proof?{proof:{kind:proof.kind,observedTick:proof.observedTick}}:{})};
    }),
  }:undefined;
  const workshopReleaseControls:WorkshopReleaseControls|undefined=workshopAvatar?{
    scopeKey:`${viewScopeKey}:${workshopAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,workshopAvatar.id)?availableWorkshopReleaseActions(workshopAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='WORKSHOP_RELEASE'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice:WorkshopReleaseOption,revision:object)=>revision===world&&queue(workshopAvatar,choice,queueAvatarWorkshopRelease)
  }:undefined;
  const workshopEstateControls:WorkshopEstateControls|undefined=workshopAvatar?{
    scopeKey:`${viewScopeKey}:${workshopAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,workshopAvatar.id)?availableWorkshopEstateActions(workshopAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='WORKSHOP_ESTATE'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>revision===world&&queue(workshopAvatar,choice,queueAvatarWorkshopEstate)
  }:undefined;
  const craftTrainingControls:CraftTrainingControls|undefined=workshopAvatar?{
    scopeKey:`${viewScopeKey}:${workshopAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,workshopAvatar.id)?availableCraftTrainingActions(workshopAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='CRAFT_TRAINING'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>revision===world&&queue(workshopAvatar,choice,queueAvatarCraftTraining)
  }:undefined;
  return {medicineControls,seasonReviewControls,foundingControls,maturityControls,workshopReleaseControls,
    workshopEstateControls,craftTrainingControls};
}
