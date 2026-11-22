import React, { type ReactNode } from 'react';
import type { useWorldSimulationController } from '../../controllers/useWorldSimulationController';
import type { Cultivator } from '../../types/world';
import type { WorkspaceId } from '../SandboxWorkspace';
import {
  activeAvatar, AVATAR_POSSESSION_COST, canPossessFrontierAvatar, canPossessUpperPassageAvatar,
  canQueueAvatarSalvage, possessFrontierAvatar, possessUpperPassageAvatar, queueAvatarFrontier,
  queueAvatarNorthGateRenewal, queueAvatarNorthMiningCharter, queueAvatarNorthWellReview,
  queueAvatarUpperArrayField, queueAvatarUpperPassage, queueAvatarWaterVein,
} from '../../engine/avatarEngine';
import { availableWaterVeinActions, completedNorthWaterWell, northWaterAddress, projectWaterVein } from '../../engine/waterVeinEngine';
import {doctrineFoundingPhysicallyAt} from '../../engine/doctrineFoundingEngine';
import type {UpperArrayFieldControls} from '../UpperArrayFieldPanel';
import {availableUpperArrayFieldActions,type UpperArrayFieldOption} from '../../engine/upperArrayFieldActions';
import {projectUpperArrayFieldMovement} from '../../engine/upperArrayFieldMovementEngine';
import {projectUpperArrayFieldLocal} from '../../engine/upperArrayFieldLocalEngine';
import {projectUpperArrayFieldTrade} from '../../engine/upperArrayFieldTradeEngine';
import type { ColdWaterControls } from '../ColdWaterVeinPanel';
import type { MiningCharterControls } from '../NorthMiningCharterPanel';
import type {NorthWellRevisitControls} from '../NorthWellRevisitPanel';
import type {UpperPassageControls,UpperPassageHostControls} from '../UpperPassagePanel';
import {availableUpperPassageActions,projectUpperPassage} from '../../engine/upperPassageEngine';
import {upperPassagePlane} from '../../engine/upperPassageTerms';
import type {FrontierControls,FrontierHostControls} from '../FrontierPanel';
import type {FrontierPortControls} from '../FrontierPortPanel';
import type {FrontierDrylandControls} from '../FrontierDrylandPanel';
import {projectFrontierDrylandLocal} from '../../engine/frontierDrylandLocalEngine';
import {projectFrontierDrylandTrade} from '../../engine/frontierDrylandTradeEngine';
import {isFrontierDrylandRegion} from '../../engine/frontierDrylandTerms';
import {projectFrontierPort} from '../../engine/frontierPortLocalEngine';
import {projectFrontierPortTrade} from '../../engine/frontierPortTradeEngine';
import {projectFrontierMovement} from '../../engine/frontierMovementEngine';
import {projectFrontierProduction} from '../../engine/frontierProductionEngine';
import {projectFrontierTrade} from '../../engine/frontierTradeEngine';
import {availableFrontierActions,isFrontierDrylandOption,isFrontierLandOption,isFrontierSeaOption,type FrontierOption} from '../../engine/frontierActions';
import type {NorthGateRenewalControls} from '../NorthGateRenewalPanel';
import {availableNorthGateRenewalActions,projectNorthGateRenewal} from '../../engine/northGateRenewalEngine';
import {northWellPanelEvidence} from '../northWellRevisitView';
import {availableNorthWellReviewActions,projectNorthWellRevisit,type NorthWellReviewOption} from '../../engine/northWellRevisitEngine';
import {useNorthWellRevisitAuthor} from '../useNorthWellRevisitAuthor';
import {availableNorthMiningCharterActions,projectNorthMiningCharters} from '../../engine/northMiningCharterEngine';
import { readTimelineHead, TIMELINE_MAX_BRANCHES } from '../../engine/timelineEngine';

const NorthGateRenewalPanel = React.lazy(async()=>({default:(await import('../NorthGateRenewalPanel')).NorthGateRenewalPanel}));
const FrontierPortPanel=React.lazy(async()=>({default:(await import('../FrontierPortPanel')).FrontierPortPanel}));
const FrontierDrylandPanel=React.lazy(async()=>({default:(await import('../FrontierDrylandPanel')).FrontierDrylandPanel}));
const FrontierPanel=React.lazy(async()=>({default:(await import('../FrontierPanel')).FrontierPanel}));
const UpperArrayFieldPanel=React.lazy(async()=>({default:(await import('../UpperArrayFieldPanel')).UpperArrayFieldPanel}));
const UpperArrayFieldWellPanel=React.lazy(async()=>({default:(await import('../UpperArrayFieldPanel')).UpperArrayFieldWellPanel}));
const UpperArrayFieldCarrierRead=React.lazy(async()=>({default:(await import('../UpperArrayFieldPanel')).UpperArrayFieldCarrierRead}));
const UpperPassagePanel = React.lazy(async () => ({default:(await import('../UpperPassagePanel')).UpperPassagePanel}));
const NorthWellRevisitPanel = React.lazy(async () => ({default:(await import('../NorthWellRevisitPanel')).NorthWellRevisitPanel}));
const NorthMiningCharterPanel = React.lazy(async () => ({ default: (await import('../NorthMiningCharterPanel')).NorthMiningCharterPanel }));
const ColdWaterVeinPanel = React.lazy(async () => ({ default: (await import('../ColdWaterVeinPanel')).ColdWaterVeinPanel }));

interface CivicRealmViewOptions {
  simulation: Pick<ReturnType<typeof useWorldSimulationController>,
    'world' | 'visibleWorld' | 'timeline' | 'preview' | 'viewScopeKey' | 'saveContextVersion' |
    'isRunning' | 'isStepping' | 'fastForwardLocked' | 'browsing' | 'stepInFlight' |
    'fastForwardRun' | 'campaignGuard' | 'history' | 'authority' | 'updateWorld' |
    'canUseSaveContext' | 'activateTimeline'>;
  selectedCultivator?: Cultivator;
  cockpitOpen: boolean;
  dashboardOpen: boolean;
  workspace: WorkspaceId;
  onSelectCultivator: (actorId: string) => void;
  onClearAvatarNotice?: () => void;
}

/** One realm projection supplies the World hub and both map surfaces. */
export function useCivicRealmViews({
  simulation, selectedCultivator, cockpitOpen, dashboardOpen, workspace, onSelectCultivator, onClearAvatarNotice,
}: CivicRealmViewOptions): { immersive: ReactNode; atlasExtras: ReactNode } {
  const {
    world, visibleWorld, timeline, preview, viewScopeKey, saveContextVersion,
    isRunning, isStepping, fastForwardLocked, browsing, stepInFlight, fastForwardRun, campaignGuard,
    history, authority, updateWorld, canUseSaveContext, activateTimeline,
  } = simulation;
  const waterVeinContextVersion=saveContextVersion.current;
  const waterVeinActive=dashboardOpen&&workspace==='world';
  const waterVeinView=waterVeinActive?projectWaterVein(visibleWorld,selectedCultivator):undefined;
  const waterVeinAvatar=waterVeinView?.scope==='local'&&!preview&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const waterVeinPending=world.playerAvatar.pendingOrder;
  const waterVeinControls:ColdWaterControls|undefined=waterVeinAvatar?{
    scopeKey:`${viewScopeKey}:${waterVeinAvatar.id}`,revisionKey:visibleWorld,
    choices:canQueueAvatarSalvage(world,waterVeinAvatar.id)?availableWaterVeinActions(waterVeinAvatar,world,world.tick+1):[],
    pending:waterVeinPending?.actorId===waterVeinAvatar.id&&waterVeinPending.action==='WATER_VEIN'
      ?waterVeinPending.waterVeinMove:undefined,
    disabled:isRunning||isStepping||fastForwardLocked,
    onQueue:(choice,revision)=>{
      if(revision!==world||isRunning||isStepping||fastForwardLocked||browsing.current||stepInFlight.current||
        fastForwardRun.current||campaignGuard.current||history.current!==timeline||authority.current!==world||
        saveContextVersion.current!==waterVeinContextVersion)return false;
      const updated=updateWorld(current=>{
        if(current!==world)return current;
        const next=structuredClone(current);
        return queueAvatarWaterVein(next,waterVeinAvatar.id,choice)?next:current;
      });
      return updated!==world;
    },
  }:undefined;
  const miningCharterView=waterVeinActive?projectNorthMiningCharters(visibleWorld,selectedCultivator):undefined;
  const miningCharterAvatar=miningCharterView?.scope==='local'&&!preview&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const miningCharterControls:MiningCharterControls|undefined=miningCharterAvatar?{
    scopeKey:`${viewScopeKey}:${miningCharterAvatar.id}`,revisionKey:visibleWorld,
    choices:canQueueAvatarSalvage(world,miningCharterAvatar.id)?availableNorthMiningCharterActions(miningCharterAvatar,world,world.tick+1):[],
    pending:waterVeinPending?.actorId===miningCharterAvatar.id&&waterVeinPending.action==='NORTH_MINING_CHARTER',
    disabled:isRunning||isStepping||fastForwardLocked,
    onQueue:(choice,revision)=>{
      if(revision!==world||isRunning||isStepping||fastForwardLocked||browsing.current||stepInFlight.current||
        fastForwardRun.current||campaignGuard.current||history.current!==timeline||authority.current!==world||
        saveContextVersion.current!==waterVeinContextVersion)return false;
      const updated=updateWorld(current=>{
        if(current!==world)return current;
        const next=structuredClone(current);
        return queueAvatarNorthMiningCharter(next,miningCharterAvatar.id,choice)?next:current;
      });
      return updated!==world;
    },
  }:undefined;
  const showMiningCharter=Boolean(miningCharterView&&(miningCharterView.rows.length||
    miningCharterControls?.pending||miningCharterControls?.choices.length));
  const northWellView=waterVeinActive?northWellPanelEvidence(visibleWorld,selectedCultivator):undefined;
  const northWellAvatar=northWellView?.scope==='local'&&!preview&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const northWellControls:NorthWellRevisitControls<NorthWellReviewOption>|undefined=northWellAvatar?{
    scopeKey:`${viewScopeKey}:${northWellAvatar.id}`,revisionKey:visibleWorld,
    choices:canQueueAvatarSalvage(world,northWellAvatar.id)?availableNorthWellReviewActions(northWellAvatar,world,world.tick+1).map(order=>({
      key:`${order.northWellReviewMove}:${order.targetNorthMiningCharterId}`,move:order.northWellReviewMove,order,
    })):[],
    pending:waterVeinPending?.actorId===northWellAvatar.id&&waterVeinPending.action==='NORTH_WELL_REVIEW'
      ?waterVeinPending.northWellReviewMove:undefined,
    disabled:isRunning||isStepping||fastForwardLocked,
    onQueue:(choice,revision)=>{
      if(revision!==world||isRunning||isStepping||fastForwardLocked||browsing.current||stepInFlight.current||
        fastForwardRun.current||campaignGuard.current||history.current!==timeline||authority.current!==world||
        saveContextVersion.current!==waterVeinContextVersion)return false;
      const updated=updateWorld(current=>{
        if(current!==world)return current;
        const next=structuredClone(current);
        return queueAvatarNorthWellReview(next,northWellAvatar.id,choice)?next:current;
      });
      return updated!==world;
    },
  }:undefined;
  const oldWellAuthorSource=northWellView?.scope==='local'&&!preview?projectNorthWellRevisit(world,selectedCultivator):undefined;
  const mayDeclareWellLaw=Boolean(oldWellAuthorSource&&!world.northWellRevisitLaw&&!world.northWellRevisitReviews&&
    !world.authoredEraOrigin&&!world.scenarioOrigin&&!world.playerAvatar.possessedId&&!world.playerAvatar.pendingOrder);
  const confirmWellLawContext=()=>mayDeclareWellLaw&&!isRunning&&!isStepping&&!fastForwardLocked&&
    canUseSaveContext(world,waterVeinContextVersion)&&history.current===timeline&&!fastForwardRun.current&&!campaignGuard.current;
  const northWellLawControls=useNorthWellRevisitAuthor({world,timeline,scopeKey:`${viewScopeKey}:${selectedCultivator?.id??''}`,
    siteName:world.locations.find(row=>row.id==='loc-vein-north')?.name??'原寒玉井',
    sourceCharterId:oldWellAuthorSource?.sourceCharterId??'',
    disabled:!mayDeclareWellLaw||isRunning||isStepping||fastForwardLocked||timeline.branches.length>=TIMELINE_MAX_BRANCHES,
    isCurrent:confirmWellLawContext,
    commit:next=>{
      if(!confirmWellLawContext())return false;
      const chosen=readTimelineHead(next);
      if(!chosen?.northWellRevisitLaw)return false;
      activateTimeline(next,chosen);
      if(selectedCultivator&&chosen.cultivators.some(actor=>actor.id===selectedCultivator.id&&actor.alive&&actor.hp>0))
        onSelectCultivator(selectedCultivator.id);
      return true;
    }});
  const northWellRevisitAuthor=mayDeclareWellLaw?northWellLawControls:undefined;
  const upperPassageActive=cockpitOpen||dashboardOpen&&(workspace==='map'||workspace==='world');
  const upperPassageView=upperPassageActive?projectUpperPassage(visibleWorld,selectedCultivator):undefined;
  const upperPassageAway=upperPassageView&&upperPassagePlane(upperPassageView.nodeId);
  const upperPassageAtWell=workspace==='world'&&upperPassageView&&!upperPassageAway;
  const upperPassageAvatar=upperPassageView&&!preview&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const upperPassageControls:UpperPassageControls|undefined=upperPassageAvatar&&upperPassageView?{
    scopeKey:`${viewScopeKey}:${upperPassageAvatar.id}:${upperPassageView.nodeId}`,revisionKey:visibleWorld,
    choices:canQueueAvatarSalvage(world,upperPassageAvatar.id)?availableUpperPassageActions(upperPassageAvatar,world,world.tick+1):[],
    pending:waterVeinPending?.actorId===upperPassageAvatar.id&&waterVeinPending.action==='UPPER_PASSAGE'
      ?waterVeinPending.upperPassageMove:undefined,
    disabled:isRunning||isStepping||fastForwardLocked,
    onQueue:(choice,revision)=>{
      if(revision!==world||isRunning||isStepping||fastForwardLocked||browsing.current||stepInFlight.current||
        fastForwardRun.current||campaignGuard.current||history.current!==timeline||authority.current!==world||
        saveContextVersion.current!==waterVeinContextVersion)return false;
      const updated=updateWorld(current=>{
        if(current!==world)return current;
        const next=structuredClone(current);
        return queueAvatarUpperPassage(next,upperPassageAvatar.id,choice)?next:current;
      });
      return updated!==world;
    },
  }:undefined;
  const upperPassageHostActor=upperPassageAway&&upperPassageView&&!preview&&selectedCultivator&&
    canPossessUpperPassageAvatar(world,selectedCultivator.id)?selectedCultivator:undefined;
  const upperPassageHost:UpperPassageHostControls|undefined=upperPassageHostActor&&upperPassageView?{
    scopeKey:`${viewScopeKey}:${upperPassageHostActor.id}:${upperPassageView.nodeId}`,revisionKey:visibleWorld,
    actorName:upperPassageHostActor.name,essenceCost:AVATAR_POSSESSION_COST,
    disabled:isRunning||isStepping||fastForwardLocked,
    onConfirm:revision=>{
      if(revision!==world||isRunning||isStepping||fastForwardLocked||browsing.current||stepInFlight.current||
        fastForwardRun.current||campaignGuard.current||history.current!==timeline||authority.current!==world||
        saveContextVersion.current!==waterVeinContextVersion)return false;
      const next=updateWorld(current=>{
        if(current!==world)return current;
        const candidate=structuredClone(current);
        const exact=candidate.cultivators.find(actor=>actor.id===upperPassageHostActor.id);
        if(!exact||projectUpperPassage(candidate,exact)?.nodeId!==upperPassageView.nodeId)return current;
        return possessUpperPassageAvatar(candidate,exact.id)?candidate:current;
      });
      if(next!==world)onClearAvatarNotice?.();
      return next!==world;
    },
  }:undefined;
  const arrayFieldView=upperPassageActive?projectUpperArrayFieldMovement(visibleWorld,selectedCultivator):undefined;
  const arrayFieldAway=arrayFieldView?.scope==='field';
  const arrayWell=upperPassageActive&&workspace==='world'&&selectedCultivator?.positionPlane===undefined?
    northWaterAddress(visibleWorld):undefined;
  const atArrayWell=Boolean(arrayWell&&selectedCultivator&&selectedCultivator.alive&&selectedCultivator.hp>0&&
    doctrineFoundingPhysicallyAt(visibleWorld,selectedCultivator,arrayWell.site.id,visibleWorld.tick)&&
    completedNorthWaterWell(visibleWorld,arrayWell.village.id,visibleWorld.tick));
  const arrayFieldLocal=arrayFieldAway&&selectedCultivator?projectUpperArrayFieldLocal(visibleWorld,selectedCultivator):undefined;
  const arrayFieldTrades=arrayFieldView||upperPassageAway||atArrayWell?
    projectUpperArrayFieldTrade(visibleWorld,selectedCultivator):[];
  const arrayFieldActor=(arrayFieldView||atArrayWell)&&!preview&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const arrayFieldDisabled=isRunning||isStepping||fastForwardLocked;
  const arrayFieldCurrent=(revision:object)=>revision===world&&!arrayFieldDisabled&&!browsing.current&&!stepInFlight.current&&
    !fastForwardRun.current&&!campaignGuard.current&&history.current===timeline&&authority.current===world&&
    saveContextVersion.current===waterVeinContextVersion;
  const arrayFieldChoices=arrayFieldActor&&canQueueAvatarSalvage(world,arrayFieldActor.id)?
    availableUpperArrayFieldActions(arrayFieldActor,world,world.tick+1):[];
  const arrayFieldPending=arrayFieldActor&&waterVeinPending?.actorId===arrayFieldActor.id&&(
    waterVeinPending.action==='UPPER_ARRAY_FIELD'||waterVeinPending.action==='UPPER_ARRAY_FIELD_LOCAL'||
    waterVeinPending.action==='UPPER_ARRAY_FIELD_TRADE')?waterVeinPending:undefined;
  const arrayFieldControls:UpperArrayFieldControls|undefined=arrayFieldActor?{
    scopeKey:`${viewScopeKey}:${arrayFieldActor.id}:${arrayFieldActor.locationId}`,revisionKey:visibleWorld,
    choices:arrayFieldChoices,pending:arrayFieldPending,disabled:arrayFieldDisabled,
    onQueue:(choice:UpperArrayFieldOption,revision:object)=>{
      if(!arrayFieldCurrent(revision))return false;
      return updateWorld(current=>{
        if(current!==world)return current;
        const next=structuredClone(current);
        return queueAvatarUpperArrayField(next,arrayFieldActor.id,choice)?next:current;
      })!==world;
    },
  }:undefined;
  const arrayFieldCandidates=Object.fromEntries(arrayFieldChoices.flatMap(option=>{
    if(option.action!=='UPPER_ARRAY_FIELD_TRADE'||option.upperArrayFieldTradeMove!=='propose')return [];
    const actor=visibleWorld.cultivators.find(row=>row.id===option.targetCultivatorId);
    return actor?[[actor.id,actor.name]]:[];
  }));
  const arrayFieldHostActor=arrayFieldAway&&!preview&&selectedCultivator&&
    canPossessUpperPassageAvatar(world,selectedCultivator.id)?selectedCultivator:undefined;
  const arrayFieldHost:UpperPassageHostControls|undefined=arrayFieldHostActor&&arrayFieldView?.site?{
    scopeKey:`${viewScopeKey}:${arrayFieldHostActor.id}:${arrayFieldView.site.id}`,revisionKey:visibleWorld,
    actorName:arrayFieldHostActor.name,essenceCost:AVATAR_POSSESSION_COST,disabled:arrayFieldDisabled,
    onConfirm:revision=>{
      if(!arrayFieldCurrent(revision))return false;
      const next=updateWorld(current=>{
        if(current!==world)return current;
        const candidate=structuredClone(current),actor=candidate.cultivators.find(row=>row.id===arrayFieldHostActor.id);
        if(projectUpperArrayFieldMovement(candidate,actor)?.site?.id!==arrayFieldView.site?.id)return current;
        return possessUpperPassageAvatar(candidate,arrayFieldHostActor.id)?candidate:current;
      });
      if(next!==world)onClearAvatarNotice?.();
      return next!==world;
    },
  }:undefined;
  const arrayFieldAtWell=atArrayWell&&(arrayFieldChoices.length>0||arrayFieldTrades.length>0);
  const northGateRenewalView=upperPassageActive?projectNorthGateRenewal(visibleWorld,selectedCultivator):undefined;
  const northGateRenewalAtWell=workspace==='world'&&northGateRenewalView?.scope==='lower'?northGateRenewalView:undefined;
  const northGateRenewalAvatar=northGateRenewalAtWell&&!preview&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const northGateRenewalControls:NorthGateRenewalControls|undefined=northGateRenewalAvatar&&northGateRenewalAtWell?{
    scopeKey:`${viewScopeKey}:${northGateRenewalAvatar.id}:${northGateRenewalAtWell.id}`,revisionKey:visibleWorld,
    choices:canQueueAvatarSalvage(world,northGateRenewalAvatar.id)?
      availableNorthGateRenewalActions(northGateRenewalAvatar,world,world.tick+1):[],
    pending:waterVeinPending?.actorId===northGateRenewalAvatar.id&&waterVeinPending.action==='NORTH_GATE_RENEWAL'?
      waterVeinPending:undefined,
    disabled:isRunning||isStepping||fastForwardLocked,
    onQueue:(choice,revision)=>{
      if(revision!==world||isRunning||isStepping||fastForwardLocked||browsing.current||stepInFlight.current||
        fastForwardRun.current||campaignGuard.current||history.current!==timeline||authority.current!==world||
        saveContextVersion.current!==waterVeinContextVersion)return false;
      const updated=updateWorld(current=>{
        if(current!==world)return current;
        const next=structuredClone(current);
        return queueAvatarNorthGateRenewal(next,northGateRenewalAvatar.id,choice)?next:current;
      });
      return updated!==world;
    },
  }:undefined;
  const frontierView=upperPassageActive?projectFrontierMovement(visibleWorld,selectedCultivator):undefined;
  const frontierProduction=frontierView?.scope==='frontier'?projectFrontierProduction(visibleWorld,selectedCultivator):undefined;
  const frontierTrade=frontierView?projectFrontierTrade(visibleWorld,selectedCultivator):[];
  const frontierActor=frontierView&&!preview&&selectedCultivator&&activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const frontierDisabled=isRunning||isStepping||fastForwardLocked;
  const frontierCurrent=(revision:object)=>revision===world&&!frontierDisabled&&!browsing.current&&!stepInFlight.current&&
    !fastForwardRun.current&&!campaignGuard.current&&history.current===timeline&&authority.current===world&&
    saveContextVersion.current===waterVeinContextVersion;
  const allFrontierChoices=frontierActor&&canQueueAvatarSalvage(world,frontierActor.id)?
    availableFrontierActions(frontierActor,world,world.tick+1):[];
  const frontierPending=frontierActor&&waterVeinPending?.actorId===frontierActor.id&&(
    waterVeinPending.action==='FRONTIER'||waterVeinPending.action==='FRONTIER_PRODUCTION'||waterVeinPending.action==='FRONTIER_TRADE'||
    waterVeinPending.action==='FRONTIER_PORT'||waterVeinPending.action==='FRONTIER_PORT_TRADE'||
    waterVeinPending.action==='FRONTIER_DRYLAND'||waterVeinPending.action==='FRONTIER_DRYLAND_TRADE')?waterVeinPending:undefined;
  const queueFrontierChoice=(option:FrontierOption,revision:object)=>{
    if(!frontierActor||!frontierCurrent(revision))return false;
    return updateWorld(current=>{
      if(current!==world)return current;
      const next=structuredClone(current);
      return queueAvatarFrontier(next,frontierActor.id,option)?next:current;
    })!==world;
  };
  const frontierControls:FrontierControls|undefined=frontierActor&&frontierView?{
    scopeKey:`${viewScopeKey}:${frontierActor.id}:${frontierView.chartId}:${frontierView.site?.id??frontierView.anchorId}`,
    revisionKey:visibleWorld,choices:allFrontierChoices.filter(isFrontierLandOption),
    pending:frontierPending&&isFrontierLandOption(frontierPending)?frontierPending:undefined,
    disabled:frontierDisabled,onQueue:queueFrontierChoice,
  }:undefined;
  const portLocal=frontierView?.scope==='frontier'&&frontierView.regionId==='east-offshore'?
    projectFrontierPort(visibleWorld,selectedCultivator):undefined;
  const portTrades=frontierView?projectFrontierPortTrade(visibleWorld,selectedCultivator):[];
  const portChoices=allFrontierChoices.filter(isFrontierSeaOption);
  const portControls:FrontierPortControls|undefined=frontierControls?{
    scopeKey:frontierControls.scopeKey,revisionKey:visibleWorld,choices:portChoices,
    pending:frontierPending&&isFrontierSeaOption(frontierPending)?frontierPending:undefined,
    disabled:frontierDisabled,onQueue:queueFrontierChoice,
  }:undefined;
  const portCandidates=Object.fromEntries(portChoices.flatMap(option=>{
    if(option.action!=='FRONTIER_PORT_TRADE'||option.frontierPortTradeMove!=='propose')return [];
    const actor=visibleWorld.cultivators.find(row=>row.id===option.targetCultivatorId);
    return actor?[[actor.id,actor.name]]:[];
  }));
  const drylandLocal=frontierView?.scope==='frontier'&&isFrontierDrylandRegion(frontierView.regionId)?
    projectFrontierDrylandLocal(visibleWorld,selectedCultivator):undefined;
  const drylandTrades=frontierView&&(isFrontierDrylandRegion(frontierView.regionId)||
    frontierView.scope==='anchor'&&frontierView.anchorId==='loc-market')?
    projectFrontierDrylandTrade(visibleWorld,selectedCultivator):[];
  const drylandChoices=allFrontierChoices.filter(isFrontierDrylandOption);
  const drylandControls:FrontierDrylandControls|undefined=frontierControls?{
    scopeKey:frontierControls.scopeKey,revisionKey:visibleWorld,choices:drylandChoices,
    pending:frontierPending&&isFrontierDrylandOption(frontierPending)?frontierPending:undefined,
    disabled:frontierDisabled,onQueue:queueFrontierChoice,
  }:undefined;
  const drylandCandidates=Object.fromEntries(drylandChoices.flatMap(option=>{
    if(option.action!=='FRONTIER_DRYLAND_TRADE'||option.frontierDrylandTradeMove!=='propose')return [];
    const actor=visibleWorld.cultivators.find(row=>row.id===option.targetCultivatorId);
    return actor?[[actor.id,actor.name]]:[];
  }));
  const frontierHostActor=frontierView?.scope==='frontier'&&!preview&&selectedCultivator&&
    canPossessFrontierAvatar(world,selectedCultivator.id)?selectedCultivator:undefined;
  const frontierHost:FrontierHostControls|undefined=frontierHostActor&&frontierView?{
    scopeKey:`${viewScopeKey}:${frontierHostActor.id}:${frontierView.site?.id??''}`,revisionKey:visibleWorld,
    actorName:frontierHostActor.name,essenceCost:AVATAR_POSSESSION_COST,disabled:frontierDisabled,onConfirm:revision=>{
      if(!frontierCurrent(revision))return false;
      return updateWorld(current=>{
        if(current!==world)return current;
        const next=structuredClone(current),actor=next.cultivators.find(row=>row.id===frontierHostActor.id);
        if(projectFrontierMovement(next,actor)?.site?.id!==frontierView.site?.id)return current;
        return possessFrontierAvatar(next,frontierHostActor.id)?next:current;
      })!==world;
    },
  }:undefined;
  const frontierCandidates=Object.fromEntries((frontierControls?.choices??[]).flatMap(option=>{
    if(option.action!=='FRONTIER_TRADE'||option.frontierTradeMove!=='propose')return [];
    const actor=visibleWorld.cultivators.find(row=>row.id===option.targetCultivatorId);
    return actor?[[actor.id,actor.name]]:[];
  }));
  const frontierRealmView=frontierView&&<React.Suspense fallback={<p role="status">查验亲到的地界…</p>}>
    <FrontierPanel view={frontierView} production={frontierProduction} trade={frontierTrade} controls={frontierControls}
      host={frontierHost} tradeCandidates={frontierCandidates}
      portPanel={portLocal||portTrades.length||portChoices.length?
        <FrontierPortPanel movement={frontierView} local={portLocal} trades={portTrades}
          controls={portControls} tradeCandidates={portCandidates}/>:undefined}
      drylandPanel={drylandLocal||drylandTrades.length||drylandChoices.length?
        <FrontierDrylandPanel movement={frontierView} local={drylandLocal} trades={drylandTrades}
          controls={drylandControls} tradeCandidates={drylandCandidates} nowTick={visibleWorld.tick}/>:undefined}/>
  </React.Suspense>;
  const realmView=(upperPassageView||arrayFieldView)&&<React.Suspense fallback={<p role="status">查验脚下界路…</p>}>
    {!arrayFieldAway&&upperPassageView&&<UpperPassagePanel view={upperPassageView} controls={upperPassageControls} host={upperPassageHost}/>}
    {arrayFieldView&&<UpperArrayFieldPanel movement={arrayFieldView} local={arrayFieldLocal} trades={arrayFieldTrades}
      controls={arrayFieldControls} host={arrayFieldHost} tradeCandidates={arrayFieldCandidates} nowTick={visibleWorld.tick}/>}
    {!arrayFieldAway&&upperPassageAway&&arrayFieldTrades.length>0&&
      <UpperArrayFieldCarrierRead atOldPassage={true} trades={arrayFieldTrades}/>}
    {!arrayFieldAway&&northGateRenewalView?.scope==='upper'&&
      <NorthGateRenewalPanel view={northGateRenewalView} nowTick={visibleWorld.tick} now={visibleWorld}/>}
  </React.Suspense>;
  const immersive = frontierView?.scope === 'frontier' ? frontierRealmView
    : arrayFieldAway || upperPassageAway ? realmView : null;
  const atlasExtras = <>
    {(waterVeinView||showMiningCharter||northWellView||upperPassageAtWell||northGateRenewalAtWell||arrayFieldAtWell)&&<React.Suspense fallback={null}><ColdWaterVeinPanel view={waterVeinView} controls={waterVeinControls}>
      {showMiningCharter&&miningCharterView&&<NorthMiningCharterPanel view={miningCharterView} controls={miningCharterControls}/>}
      {northWellView&&<NorthWellRevisitPanel view={northWellView} controls={northWellControls} author={northWellRevisitAuthor}/>}
      {northGateRenewalAtWell&&<NorthGateRenewalPanel view={northGateRenewalAtWell} nowTick={visibleWorld.tick} now={visibleWorld} controls={northGateRenewalControls}/>}
      {upperPassageAtWell&&realmView}
      {arrayFieldAtWell&&<UpperArrayFieldWellPanel atWell={atArrayWell} trades={arrayFieldTrades}
        controls={arrayFieldControls} tradeCandidates={arrayFieldCandidates} nowTick={visibleWorld.tick}/>}
    </ColdWaterVeinPanel></React.Suspense>}
    {frontierView?.scope==='anchor'&&frontierRealmView}
  </>;
  return { immersive, atlasExtras };
}
