import {availableCivicMemorialActions} from './engine/civicMemorialEngine';
import type {CivicMemorialAppendControls} from './components/CivicMemorialAppendRead';
import {availableMarketFreightActions} from './engine/escortEngine';
import type {MarketFreightControls} from './components/MarketFreightRead';
import {availableDisasterShelterActions} from './engine/disasterShelterEngine';
import type {DisasterShelterControls} from './components/DisasterShelterRead';
import {availableCraftTrainingActions} from './engine/craftTrainingEngine';
import type {CraftTrainingControls} from './components/CraftTrainingRead';
import {availableWaypostMealActions} from './engine/waypostMealEngine';
import type {WaypostMealControls} from './components/WaypostMealRead';
import type {WorkshopEstateControls} from './components/WorkshopEstateRead';
import {availableScribeCommissionActions} from './engine/scribeCommissionEngine';
import type {ScribeCommissionControls} from './components/ScribeCommissionRead';
import {availableWorkshopReleaseActions,availableWorkshopEstateActions,type WorkshopReleaseOption} from './engine/workshopEngine';
import type {WorkshopReleaseControls} from './components/WorkshopReleaseRead';
import {AuthoredEraChronicle} from './components/AuthoredEraChronicle';
import {useAuthoredEraLaunch} from './components/useAuthoredEraLaunch';
import {activeAvatar,canQueueAvatarSalvage,queueAvatarDanxiaMedicine,queueAvatarDanxiaReview,queueAvatarDoctrineFounding,queueAvatarDoctrineMaturity,queueAvatarWorkshopRelease,queueAvatarWorkshopEstate,queueAvatarScribeCommission,queueAvatarWaypostMeal,queueAvatarCraftTraining,queueAvatarDisasterShelter,queueAvatarMarketFreight,queueAvatarCivicMemorialAppend} from './engine/avatarEngine';
import {availableDanxiaMedicineActions,type DanxiaMedicineOption} from './engine/danxiaMedicineEngine';
import type {DanxiaMedicineControlsProps} from './components/DanxiaMedicineControls';
import {availableDanxiaReviewActions,type DanxiaReviewOption} from './engine/danxiaSeasonReviewEngine';
import {availableDoctrineFoundingActions,type DoctrineFoundingOption} from './engine/doctrineFoundingEngine';
import {availableDoctrineMaturityActions,type DoctrineMaturityOption} from './engine/doctrineMaturityEngine';
import type {DoctrineMaturityControlsProps} from './components/DoctrineMaturityControls';
import type {DoctrineFoundingControlsProps} from './components/DoctrineFoundingControls';
import type {DanxiaSeasonReviewControlsProps} from './components/DanxiaSeasonReviewControls';
import { StoryFirstHome } from './components/StoryFirstHome';
import { PlayerStoryEntry } from './components/PlayerStoryEntry';
import { enterStoryLead, orderStoryAvatar, projectStoryPlayerRole, storyOrderOutcome } from './components/storyPlayerController';
import { CockpitModeSwitch, PanoramicCockpitView } from './components/PanoramicCockpitView';
import { projectStoryHomepage } from './engine/storyHomepage';
import { useWorldSimulationController } from './controllers/useWorldSimulationController';
import { CampaignResumeNotice } from './components/CampaignResumeNotice';
import {findVisibleCampaignStopOption,visibleCampaignStopOptions} from './components/campaignStopOptions';
import { projectRosterFocalId, projectRosterStoryRead, readSelectedRosterScene, resolveRosterStoryRead, sameRosterScene,
  type ActorRosterScene } from './components/rosterStoryRead';
import { projectWitnessedPersonalStory } from './engine/witnessedPersonalStory';
import { WitnessedPersonalStory, WitnessedStoryScopeToggle } from './components/WitnessedPersonalStory';
import { createPublicDialogueResolver } from './engine/publicDialogueProvenance';
import { projectEarnedChronicleLead, projectProtagonistSuccession } from './engine/protagonistSuccession';
import { projectChronicleLead, publicChronicleSceneEvents } from './engine/chronicleLead';
import { courierCheckpoint } from './engine/sealedCourierEngine';
import { expeditionRescueCheckpoint } from './engine/expeditionRescueCheckpoint';
import { boundaryReliefCheckpoint } from './engine/boundaryReliefCheckpoint';
import { applyWatchMutation } from './engine/watchlistEngine';
import type { WatchlistCommand, WatchlistMutationResult } from './engine/watchlistEngine';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, FastForward, RotateCcw, Sparkles, BarChart3 } from 'lucide-react';
import {
  executeGodIntervention,
  GodInterventionCommand,
} from './engine/worldEngine';
import { visiblePilgrimages } from './engine/pilgrimageEngine';
import { applyMapBrush } from './engine/mapBrushEngine';
import { GodBrushKind, MapPoint, WorldState } from './types/world';
import { SandboxWorkspace, WorkspaceSections } from './components/SandboxWorkspace';
import type { WorkspaceId } from './components/SandboxWorkspace';
import { readHandednessPreference, writeHandednessPreference, type HandednessPreference } from './components/handednessPreference';
import { readWorkspaceFoldPreferences, resolveWorkspaceActor, writeWorkspaceFoldPreferences } from './components/workspacePreferences';
import { annotationWriteIsCurrent } from './components/annotationUi';
import type { NotebookStamp, NoteCommand, NoteStatus } from './components/annotationUi';
import { llmScheduler } from './engine/llmScheduler';
import { availableCouncilPlans } from './engine/councilEngine';
import { commitCouncilSnapshot, settleCouncilSnapshot } from './engine/councilRuntime';
import type { AvatarInteractionRequest, CouncilPlan } from './types/world';
import { readTimelineHead, readTimelineSnapshot, selectTimelineBranch, forkTimelineAvatarEntry, appendAuthoredTimelineRoot, TIMELINE_MAX_BRANCHES } from './engine/timelineEngine';
import type { TimelineSnapshot } from './engine/timelineEngine';
import {findEraEntryCandidate,projectEraEntryCandidates} from './engine/eraEntryCandidates';
import {createTerrainMapView} from './components/terrainMapView';
import {configureRegionalSimulation,projectRegionalSimulation,regionForPoint} from './engine/regionalSimulationEngine';
import {projectRegionalPromotions} from './engine/regionalPromotionEngine';
import {isScopedExpeditionGate} from './engine/expeditionOmenTerms';
import {REGIONAL_BENCHMARK} from './components/regionalBenchmark';
import type {RegionalFocusOption,RegionalSimulationControls} from './components/RegionalSimulationPanel';
import { possessAvatar, queueAvatarOrder, queueAvatarSalvage, queueAvatarWaterVein, queueAvatarNorthMiningCharter, queueAvatarNorthWellReview, queueAvatarUpperPassage, queueAvatarUpperArrayField, queueAvatarNorthGateRenewal,
  AVATAR_POSSESSION_COST, canPossessUpperPassageAvatar, possessUpperPassageAvatar, queueAvatarFrontier, canPossessFrontierAvatar, possessFrontierAvatar } from './engine/avatarEngine';
import { availableWaterVeinActions, completedNorthWaterWell, northWaterAddress, projectWaterVein } from './engine/waterVeinEngine';
import {doctrineFoundingPhysicallyAt} from './engine/doctrineFoundingEngine';
import type {UpperArrayFieldControls} from './components/UpperArrayFieldPanel';
import {availableUpperArrayFieldActions,type UpperArrayFieldOption} from './engine/upperArrayFieldActions';
import {projectUpperArrayFieldMovement} from './engine/upperArrayFieldMovementEngine';
import {projectUpperArrayFieldLocal} from './engine/upperArrayFieldLocalEngine';
import {projectUpperArrayFieldTrade} from './engine/upperArrayFieldTradeEngine';
import type { ColdWaterControls } from './components/ColdWaterVeinPanel';
import type { MiningCharterControls } from './components/NorthMiningCharterPanel';
import type {NorthWellRevisitControls} from './components/NorthWellRevisitPanel';
import type {UpperPassageControls,UpperPassageHostControls} from './components/UpperPassagePanel';
import {availableUpperPassageActions,projectUpperPassage} from './engine/upperPassageEngine';
import {upperPassagePlane} from './engine/upperPassageTerms';
import type {FrontierControls,FrontierHostControls} from './components/FrontierPanel';
import type {FrontierPortControls} from './components/FrontierPortPanel';
import type {FrontierDrylandControls} from './components/FrontierDrylandPanel';
import {projectFrontierDrylandLocal} from './engine/frontierDrylandLocalEngine';
import {projectFrontierDrylandTrade} from './engine/frontierDrylandTradeEngine';
import {isFrontierDrylandRegion} from './engine/frontierDrylandTerms';
import {projectFrontierPort} from './engine/frontierPortLocalEngine';
import {projectFrontierPortTrade} from './engine/frontierPortTradeEngine';
import {projectFrontierMovement} from './engine/frontierMovementEngine';
import {projectFrontierProduction} from './engine/frontierProductionEngine';
import {projectFrontierTrade} from './engine/frontierTradeEngine';
import {availableFrontierActions,isFrontierDrylandOption,isFrontierLandOption,isFrontierSeaOption,type FrontierOption} from './engine/frontierActions';
import {projectFrontierSupplyLinks} from './engine/frontierSupplyLinks';
import type {NorthGateRenewalControls} from './components/NorthGateRenewalPanel';
import {availableNorthGateRenewalActions,projectNorthGateRenewal} from './engine/northGateRenewalEngine';
import {northWellPanelEvidence} from './components/northWellRevisitView';
import {availableNorthWellReviewActions,projectNorthWellRevisit,type NorthWellReviewOption} from './engine/northWellRevisitEngine';
import {useNorthWellRevisitAuthor} from './components/useNorthWellRevisitAuthor';
import {availableNorthMiningCharterActions,projectNorthMiningCharters} from './engine/northMiningCharterEngine';
import type { ArtifactSalvageControls } from './components/ArtifactPanel';
import { resolveAvatarSnapshot } from './engine/avatarRuntime';
import { CHRONICLE_FOCUS_UNAVAILABLE, createChronicleFocusResolver } from './engine/chronicleFocusEngine';
import type { ChronicleFocusRequest } from './engine/chronicleFocusEngine';
import type { ChronicleCategoryFilter, ChronicleFeedPosition, ChronicleFeedReturn } from './components/ChronicleFeed';
import type { ChronicleReadingContext } from './engine/chronicleReadingMark';
import { FocusedSectSummary } from './components/FocusedSectSummary';
import { visibleCausalChronicle } from './engine/chronicleCausalityEngine';

const RegionalSimulationPanel=React.lazy(async()=>({default:(await import('./components/RegionalSimulationPanel')).RegionalSimulationPanel}));
const AgentInspector = React.lazy(async () => ({ default: (await import('./components/AgentInspector')).AgentInspector }));
const WorldMapCanvas = React.lazy(async () => ({ default: (await import('./components/WorldMapCanvas')).WorldMapCanvas }));
const AttestationPanel = React.lazy(async () => ({ default: (await import('./components/AttestationPanel')).AttestationPanel }));
const OathContractsPanel = React.lazy(async () => ({ default: (await import('./components/OathContractsPanel')).OathContractsPanel }));
const MentorshipPanel = React.lazy(async () => ({ default: (await import('./components/MentorshipPanel')).MentorshipPanel }));
const ApprenticeCohortPanel = React.lazy(async () => ({ default: (await import('./components/ApprenticeCohortPanel')).ApprenticeCohortPanel }));
const SparringPanel = React.lazy(async () => ({ default: (await import('./components/SparringPanel')).SparringPanel }));
const WatchlistsPanel = React.lazy(async () => ({ default: (await import('./components/WatchlistsPanel')).WatchlistsPanel }));
const TimelinePanel = React.lazy(async () => ({ default: (await import('./components/TimelinePanel')).TimelinePanel }));
const ActorRoster = React.lazy(async () => ({ default: (await import('./components/ActorRoster')).ActorRoster }));
const RelationshipGraph = React.lazy(async () => ({ default: (await import('./components/RelationshipGraph')).RelationshipGraph }));
const GodConsole = React.lazy(async () => ({ default: (await import('./components/GodConsole')).GodConsole }));
const SectResearchPanel = React.lazy(async () => ({ default: (await import('./components/SectResearchPanel')).SectResearchPanel }));
const SanctuaryPanel = React.lazy(async () => ({ default: (await import('./components/SanctuaryPanel')).SanctuaryPanel }));
const PilgrimagePanel = React.lazy(async () => ({ default: (await import('./components/PilgrimagePanel')).PilgrimagePanel }));
const SectCreditPanel = React.lazy(async () => ({ default: (await import('./components/SectCreditPanel')).SectCreditPanel }));
const CeasefirePanel = React.lazy(async () => ({ default: (await import('./components/CeasefirePanel')).CeasefirePanel }));
const SectRelocationPanel = React.lazy(async () => ({ default: (await import('./components/SectRelocationPanel')).SectRelocationPanel }));
const SectDoctrinePanel = React.lazy(async () => ({ default: (await import('./components/SectDoctrinePanel')).SectDoctrinePanel }));
const LlmTelemetryPanel = React.lazy(async () => ({ default: (await import('./components/LlmTelemetryPanel')).LlmTelemetryPanel }));
const BountyBoard = React.lazy(async () => ({ default: (await import('./components/BountyBoard')).BountyBoard }));
const ChronicleNotebookPanel = React.lazy(async () => ({ default: (await import('./components/ChronicleNotebookPanel')).ChronicleNotebookPanel }));
const RankSeasonPanel = React.lazy(async () => ({ default: (await import('./components/RankSeasonPanel')).RankSeasonPanel }));
const ChronicleFeed = React.lazy(async () => ({ default: (await import('./components/ChronicleFeed')).ChronicleFeed }));
const CrossRegionConsequenceRead=React.lazy(async()=>({default:(await import('./components/CrossRegionConsequenceRead')).CrossRegionConsequenceRead}));
const ChronicleLibraryPanel = React.lazy(async () => ({ default: (await import('./components/ChronicleLibraryPanel')).ChronicleLibraryPanel }));
const WorldOccasionsPanel = React.lazy(async () => ({ default: (await import('./components/WorldOccasionsPanel')).WorldOccasionsPanel }));
const ExpeditionRescuePanel = React.lazy(async () => ({ default: (await import('./components/ExpeditionRescuePanel')).ExpeditionRescuePanel }));
const BoundaryReliefPanel = React.lazy(async () => ({ default: (await import('./components/BoundaryReliefPanel')).BoundaryReliefPanel }));
const NorthGateRenewalPanel = React.lazy(async()=>({default:(await import('./components/NorthGateRenewalPanel')).NorthGateRenewalPanel}));
const FrontierPortPanel=React.lazy(async()=>({default:(await import('./components/FrontierPortPanel')).FrontierPortPanel}));
const FrontierDrylandPanel=React.lazy(async()=>({default:(await import('./components/FrontierDrylandPanel')).FrontierDrylandPanel}));
const FrontierPanel=React.lazy(async()=>({default:(await import('./components/FrontierPanel')).FrontierPanel}));
const UpperArrayFieldPanel=React.lazy(async()=>({default:(await import('./components/UpperArrayFieldPanel')).UpperArrayFieldPanel}));
const UpperArrayFieldWellPanel=React.lazy(async()=>({default:(await import('./components/UpperArrayFieldPanel')).UpperArrayFieldWellPanel}));
const UpperArrayFieldCarrierRead=React.lazy(async()=>({default:(await import('./components/UpperArrayFieldPanel')).UpperArrayFieldCarrierRead}));
const UpperPassagePanel = React.lazy(async () => ({default:(await import('./components/UpperPassagePanel')).UpperPassagePanel}));
const NorthWellRevisitPanel = React.lazy(async () => ({default:(await import('./components/NorthWellRevisitPanel')).NorthWellRevisitPanel}));
const NorthMiningCharterPanel = React.lazy(async () => ({ default: (await import('./components/NorthMiningCharterPanel')).NorthMiningCharterPanel }));
const ColdWaterVeinPanel = React.lazy(async () => ({ default: (await import('./components/ColdWaterVeinPanel')).ColdWaterVeinPanel }));
const WeatherAtlasPanel = React.lazy(async () => ({ default: (await import('./components/WeatherAtlasPanel')).WeatherAtlasPanel }));
const ShortShiftPanel = React.lazy(async () => ({ default: (await import('./components/ShortShiftPanel')).ShortShiftPanel }));
const MarketCaravansPanel = React.lazy(async () => ({ default: (await import('./components/MarketCaravansPanel')).MarketCaravansPanel }));
const VillageGranaryPanel = React.lazy(async () => ({ default: (await import('./components/VillageGranaryPanel')).VillageGranaryPanel }));
const CaravanRestitutionPanel = React.lazy(async () => ({ default: (await import('./components/CaravanRestitutionPanel')).CaravanRestitutionPanel }));
const MortalVillagesPanel = React.lazy(async () => ({ default: (await import('./components/MortalVillagesPanel')).MortalVillagesPanel }));
const HouseholdNamePanel = React.lazy(async () => ({ default: (await import('./components/HouseholdNamePanel')).HouseholdNamePanel }));
const DecisionTracePanel = React.lazy(async () => ({ default: (await import('./components/DecisionTracePanel')).DecisionTracePanel }));
const EraEntryPanel = React.lazy(async()=>({default:(await import('./components/EraEntryPanel')).EraEntryPanel}));
const PossessionPanel = React.lazy(async () => ({ default: (await import('./components/PossessionPanel')).PossessionPanel }));
const EstateMemorialPanel = React.lazy(async () => ({ default: (await import('./components/EstateMemorialPanel')).EstateMemorialPanel }));
const ScenarioPanel = React.lazy(async () => ({ default: (await import('./components/ScenarioPanel')).ScenarioPanel }));
const WorldStoragePanel = React.lazy(async () => ({ default: (await import('./components/WorldStoragePanel')).WorldStoragePanel }));
const SectCouncilModal = React.lazy(async () => ({ default: (await import('./components/SectCouncilModal')).SectCouncilModal }));
const AnalyticsModal = React.lazy(async () => ({ default: (await import('./components/AnalyticsModal')).AnalyticsModal }));

interface AppProps { initialWorkspace?: WorkspaceId; initialSection?: string; initialCockpit?: boolean }
interface ChronicleTrail extends ChronicleFeedReturn {
  viewerId: string;
  category: ChronicleCategoryFilter;
  scope: string;
  revision: number;
}
const chronicleWorkspace = { site: 'map', actor: 'people', sect: 'sect' } as const;
const action = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40';
const panel = 'space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-3';

export const App: React.FC<AppProps> = ({ initialWorkspace, initialSection, initialCockpit = false }) => {
  const [cockpitOpen,setCockpitOpen]=useState(initialCockpit);
  const cockpitHeading=useRef<HTMLHeadingElement>(null);
  const [dashboardOpen, setDashboardOpen] = useState(initialWorkspace !== undefined);
  const [workspace, setWorkspace] = useState<WorkspaceId>(initialWorkspace ?? 'map');
  const [storyEntryOpen,setStoryEntryOpen]=useState(false);
  const storyMoreRef = useRef<HTMLButtonElement>(null);
  const storyEntryHeading=useRef<HTMLHeadingElement>(null);
  const dashboardHeading = useRef<HTMLHeadingElement>(null);
  const storySurface=cockpitOpen?'cockpit':dashboardOpen?'tools':storyEntryOpen?'entry':'home';
  const renderedStorySurface=useRef(storySurface);
  const [storyNotice, setStoryNotice] = useState<string>();
  const [storyOutcome,setStoryOutcome]=useState<{world:WorldState;text:string}>();
  useEffect(() => {
    if (renderedStorySurface.current === storySurface) return;
    renderedStorySurface.current=storySurface;
    window.scrollTo({top:0,behavior:'instant'});
    (storySurface==='cockpit'?cockpitHeading.current:storySurface==='tools'?dashboardHeading.current:storySurface==='entry'?storyEntryHeading.current:
      storyMoreRef.current)?.focus({preventScroll:true});
  }, [storySurface]);
  const [foldPreferences, setFoldPreferences] = useState(readWorkspaceFoldPreferences);
  const [handedness, setHandedness] = useState(readHandednessPreference);
  const [rosterFocus, setRosterFocus] = useState<{ id: string; scope: string }>();
  const actorHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => writeWorkspaceFoldPreferences(foldPreferences), [foldPreferences]);
  const [chronicleFilter, setChronicleFilter] = useState<ChronicleCategoryFilter>('all');
  const [personalStoryChoice, setPersonalStoryChoice] = useState<{actorId:string;scope:string;eventId?:string}>();
  const [focusTrail, setFocusTrail] = useState<ChronicleTrail>();
  const [chronicleReturn, setChronicleReturn] = useState<ChronicleFeedReturn>();
  const [focusNotice, setFocusNotice] = useState<string>();
  const [mapFocusFailed, setMapFocusFailed] = useState<number>();
  const focusSerial = useRef(0);
  const backRef = useRef<HTMLButtonElement>(null);
  const [selectedCultivatorId, setSelectedCultivatorId] = useState<
    string | null
  >('npc-1');
  const [councilOpen, setCouncilOpen] = useState(false);
  const [councilOpenedBefore, setCouncilOpenedBefore] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState<string>();
  const [eraEntryNotice,setEraEntryNotice]=useState<{scope:string;text:string}>();
  const [eraEntryReturn,setEraEntryReturn]=useState<{from:string;entered:string;epoch:number;sourceFrame:TimelineSnapshot}>();

  const [lastManualCouncilId, setLastManualCouncilId] = useState<string>();
  const {
    world,visibleWorld,authority,timeline,history,saveTimelineId,saveContextVersion,restoredReadingOrigin,
    viewEpoch,viewScopeKey,sourceBranch,preview,browsing,activateTimeline,restoreHistoricalFrame,clearPreview,
    updateWorld,replaceWorld,newWorldFromSeed,canUseSaveContext,archiveCurrentNarrative,handleReset,
    isRunning,setIsRunning,isStepping,stepInFlight,tryBeginInteraction,endInteraction,tickIntervalMs,setTickIntervalMs,
    llmConfig,changeLlmConfig,handleStepTick,toggleAutoplay,compareDecision,fairModelCoverage,
    handleTimelinePreview,handleTimelineSelectBranch,handleTimelineFork,timelineNotice,
    fastForwardRun,campaignGuard,fastForwardView,fastForwardLocked,startFastForward,stopFastForward,
    commandFastForward,applyFastForward,campaign,campaignPhase,
  }=useWorldSimulationController({
    playbackEnabled:dashboardOpen||cockpitOpen,
    inspectCampaign:dashboardOpen&&workspace==='chronicle',
    onPreviewContextChange:discardChronicleContext,
    onHistoricalPreview:()=>setCouncilOpen(false),
    onActivate:incoming=>{
      setSelectedCultivatorId(incoming.cultivators.find(({alive})=>alive)?.id??incoming.cultivators[0]?.id??null);
      setLastManualCouncilId(undefined);
      setCouncilOpen(false);
      setAvatarNotice(undefined);
    },
  });

  const handleConveneCouncil = useCallback(async (plan: CouncilPlan) => {
    const starting = authority.current;
    if (stepInFlight.current || browsing.current || !availableCouncilPlans(starting, plan.sectId).some((item) => item.id === plan.id) || !tryBeginInteraction()) return;
    setLastManualCouncilId(plan.id);
    try {
      llmScheduler.beginTick(starting.tick);
      const next = await settleCouncilSnapshot(starting, plan, llmConfig);
      updateWorld((previous) => commitCouncilSnapshot(previous, starting, next));
    } finally {
      endInteraction();
    }
  }, [llmConfig, updateWorld, authority, stepInFlight, browsing, tryBeginInteraction, endInteraction]);

  const handlePossess = (actorId: string | null) => {
    if (stepInFlight.current || browsing.current) return;
    setAvatarNotice(undefined);
    updateWorld((current) => {
      const next = structuredClone(current);
      return possessAvatar(next, actorId) ? next : current;
    });
  };

  const handleAvatarOrder = (action: 'REST' | 'CULTIVATE') => {
    if (stepInFlight.current || browsing.current) return;
    setAvatarNotice(undefined);
    updateWorld((current) => {
      const next = structuredClone(current);
      return queueAvatarOrder(next, action) ? next : current;
    });
  };

  const handleAvatarSpeak = async (request: AvatarInteractionRequest) => {
    if (!tryBeginInteraction()) return;
    const current = authority.current;
    setAvatarNotice(undefined);
    try {
      const proposed = await resolveAvatarSnapshot(current, request, llmConfig);
      if (!proposed.entry) {
        setAvatarNotice('这项交互已不适用，未消耗元神。');
        return;
      }
      if (updateWorld((latest) => commitCouncilSnapshot(latest, current, proposed.world)) !== proposed.world) {
        setAvatarNotice('世界已变化，对话和效果均未写入。');
      }
    } finally {
      endInteraction();
    }
  };

  const handleGodIntervene = (cmd: GodInterventionCommand) => {
    if (browsing.current) return;
    updateWorld((prev) => executeGodIntervention(prev, cmd));
  };

  const handleBrushStroke = (kind: GodBrushKind, points: MapPoint[]) => {
    if (browsing.current) return;
    updateWorld((previous) => applyMapBrush(previous, kind, points));
  };

  function discardChronicleContext() {
    setFocusTrail(undefined);
    setChronicleReturn(undefined);
    setFocusNotice(focusTrail || chronicleReturn ? CHRONICLE_FOCUS_UNAVAILABLE : undefined);
  }

  const writeAnnotation = async (command: NoteCommand, stamp: NotebookStamp, signal: AbortSignal): Promise<NoteStatus> => {
    const review = () => signal.aborted ? 'interrupted' : browsing.current || stepInFlight.current ? 'readonly' :
      annotationWriteIsCurrent(stamp, authority.current, history.current.activeBranchId, false) ? undefined : 'stale';
    const first = review();
    if (first) return first;
    const { applyAnnotation } = await import('./engine/annotationsEngine');
    const recheck = review();
    if (recheck) return recheck;
    const proposed = applyAnnotation(stamp.world, stamp.actorId, command);
    if (!proposed.ok) return proposed.code;
    return updateWorld((current) => current === stamp.world && !review() ? proposed.world : current) === proposed.world ? 'saved' : 'stale';
  };

  const writeWatchlist = async (command: WatchlistCommand, stamp: NotebookStamp, signal: AbortSignal): Promise<
    'saved' | 'stale' | 'readonly' | 'interrupted' | Extract<WatchlistMutationResult, { ok: false }>['code']> => {
    const review = () => signal.aborted ? 'interrupted' : browsing.current || stepInFlight.current ? 'readonly' :
      annotationWriteIsCurrent(stamp, authority.current, history.current.activeBranchId, false) ? undefined : 'stale';
    const first = review();
    if (first) return first;
    if (!stamp.actorId) return 'unknown_target';
    const proposed = applyWatchMutation(stamp.world, stamp.actorId, command);
    if (!proposed.ok) return proposed.code;
    const applied = updateWorld((current) => current === stamp.world && !review() ? proposed.world : current);
    return applied === proposed.world ? 'saved' : 'stale';
  };

  const pendingCampaign = campaign.pending ? campaign.pending.status==='cancelled' ?
    <div className="space-y-1"><p>这次长局已取消，不可再续跑。</p><button type="button" className={action} disabled={campaign.working} onClick={campaign.discard}>清除已取消记录</button></div> :
    <CampaignResumeNotice receipt={{source:campaign.pending.source,target:campaign.pending.target,
      verified:campaign.pending.completedTicks?campaign.pendingDate:undefined,completedMonths:campaign.pending.completedTicks,
      requestedMonths:campaign.pending.requestedTicks}} scope={campaign.sameSource?'same_source':'different_context'}
      confirmedResult={campaign.pending.status==='finalized'} confirmingRestore={campaign.reviewing}
      restoringOnlyOriginal={campaign.reviewingOriginal} onReviewOriginal={campaign.showOriginalOnly?campaign.reviewOriginal:undefined}
      disabled={campaign.working||Boolean(preview)||isStepping}
      onResume={campaign.resumePending} onReviewRestore={campaign.review} onConfirmRestore={campaign.restore}
      onCancelRestore={campaign.cancelReview} onDiscard={campaign.discard} /> : undefined;
  const visibleHistory = timeline.branches.find(({ id }) => id === timeline.activeBranchId)?.snapshots;
  const readingChronicle = !cockpitOpen && dashboardOpen && workspace === 'chronicle';
  const showingChronicle = cockpitOpen || readingChronicle;
  const authoredHead=timeline.branches.find(branch=>branch.id===timeline.activeBranchId)?.snapshots.at(-1);
  const authoredRevision=saveContextVersion.current;
  const authoredDisabled=!dashboardOpen||workspace!=='world'||Boolean(preview)||isStepping||isRunning||fastForwardLocked||
    !authoredHead||timeline.branches.length>=TIMELINE_MAX_BRANCHES;
  const canPublishAuthored=()=>!authoredDisabled&&!browsing.current&&!stepInFlight.current&&!fastForwardRun.current&&
    !campaignGuard.current&&authority.current===world&&history.current===timeline&&
    saveContextVersion.current===authoredRevision;
  const authoredEra=useAuthoredEraLaunch({
    world,timeline,scopeKey:`${viewScopeKey}:${authoredRevision}`,disabled:authoredDisabled,
    unavailable:timeline.branches.length>=TIMELINE_MAX_BRANCHES?'分支位已满，不会删除原有分支。':
      isRunning||isStepping||fastForwardLocked?'当前世界正在运行。请先暂停，再准备作者纪元。':undefined,
    isCurrent:canPublishAuthored,
    commit:incoming=>{
      if(!authoredHead||!canPublishAuthored()||
        incoming.year<world.year||incoming.year===world.year&&incoming.month<=world.month)return false;
      try{
        const next=appendAuthoredTimelineRoot(timeline,timeline.activeBranchId,authoredHead,incoming,
          `作者纪元 · ${incoming.year} 年 ${incoming.month} 月`);
        const approved=readTimelineHead(next);
        if(!approved||!approved.authoredEraOrigin)return false;
        activateTimeline(next,approved);
        setStoryEntryOpen(false);setDashboardOpen(false);
        return true;
      }catch{return false;}
    },
  });
  const storyHome = React.useMemo(() => dashboardOpen ? undefined : projectStoryHomepage(world), [dashboardOpen,world]);
  const chronicleScenes = React.useMemo(() => showingChronicle ? publicChronicleSceneEvents(visibleWorld) : [], [showingChronicle,visibleWorld]);
  const publicDialogue = React.useMemo(() => showingChronicle ? createPublicDialogueResolver(visibleWorld) : undefined, [showingChronicle,visibleWorld]);
  const succession = React.useMemo(() => showingChronicle &&
    visibleWorld.protagonistSuccession.lastEvaluatedTick !== undefined ? projectProtagonistSuccession(visibleWorld) : undefined,
    [showingChronicle,visibleWorld]);
  const chronicleLead = React.useMemo(() => showingChronicle ?
    visibleWorld.protagonistSuccession.lastEvaluatedTick === undefined ? projectChronicleLead(visibleWorld) :
      projectEarnedChronicleLead(visibleWorld,chronicleScenes,visibleWorld.tick) : undefined,
    [showingChronicle,visibleWorld,chronicleScenes]);
  const selectedCultivator = resolveWorkspaceActor(visibleWorld, selectedCultivatorId);
  const regionalReadActive=dashboardOpen&&workspace==='world'&&!preview;
  const regionalAvatar=regionalReadActive?activeAvatar(world):undefined;
  const regionalViewer=regionalAvatar??selectedCultivator;
  const regionalSites=useMemo<RegionalFocusOption[]>(()=>{
    if(!regionalReadActive||!regionalViewer?.alive)return [];
    const map=createTerrainMapView(world,regionalViewer,true);
    return map.seenLocations.flatMap(site=>{
      const region=regionForPoint(world,site);
      return region&&site.type!=='secret_realm'&&site.type!=='abyss'&&!isScopedExpeditionGate(site)?
        [{siteId:site.id,name:site.name,region}]:[];
    });
  },[regionalReadActive,regionalViewer,world]);
  const regionalView=regionalReadActive?projectRegionalSimulation(world):undefined;
  const regionalRevision=saveContextVersion.current;
  const regionalDisabled=isRunning||isStepping||fastForwardLocked;
  const regionalControls:RegionalSimulationControls={
    scopeKey:`${viewScopeKey}:${regionalRevision}:${regionalViewer?.id??''}`,
    revisionKey:world,availableSites:regionalSites,comparison:REGIONAL_BENCHMARK,
    mode:{enabled:!!world.regionalSimulation,version:regionalView?.version,
      focus:regionalSites.find(row=>row.siteId===world.regionalSimulation?.focusSiteId),
      effective:regionalView&&{region:regionalView.focus,avatarDriven:!!regionalAvatar},
      registeredRegions:regionalView?.registeredRegions,annual:regionalView?.annual,
      recentOpenings:regionalView?{clock:{tick:world.tick,year:world.year,month:world.month},
        rows:projectRegionalPromotions(world,regionalViewer)}:undefined},
    disabled:regionalDisabled,disabledReason:regionalDisabled?'先暂停推演或长局，再调整本分支。':undefined,
    onChange:change=>{
      if(change.kind!=='set_focus'||!regionalReadActive||regionalDisabled||
        !canUseSaveContext(world,regionalRevision)||history.current!==timeline||
        !!fastForwardRun.current||campaignGuard.current||
        !regionalSites.some(row=>row.siteId===change.siteId))return false;
      const changed=updateWorld(current=>{
        if(current!==world||current.regionalSimulation?.focusSiteId===change.siteId)return current;
        const draft={...current,regionalSimulation:current.regionalSimulation&&structuredClone(current.regionalSimulation)};
        return configureRegionalSimulation(draft,change.siteId)?draft:current;
      });
      return changed!==world;
    },
  };
  const campaignStopOptions=useMemo(()=>readingChronicle&&campaign.available&&!preview?
    visibleCampaignStopOptions(visibleWorld,selectedCultivator):[],[readingChronicle,campaign.available,preview,visibleWorld,selectedCultivator]);
  const campaignSelectedStop=campaign.active&&campaign.record?.stopCondition?{
    condition:campaign.record.stopCondition,label:findVisibleCampaignStopOption(campaignStopOptions,campaign.record.stopCondition)?.label,
  }:undefined;
  const aliveCount = visibleWorld.cultivators.filter((c) => c.alive).length;
  const activeActorId = selectedCultivator?.id ?? null;
  const mayReadPersonal = Boolean(selectedCultivator?.alive && selectedCultivator.hp > 0);
  const readingRoster = dashboardOpen && workspace === 'people';
  const rosterFocalId = useMemo(() => readingRoster ? projectRosterFocalId(visibleWorld) : undefined,
    [readingRoster, visibleWorld]);
  const rosterStoryStamp = useMemo(() => readingRoster ?
    projectRosterStoryRead(visibleWorld, viewScopeKey, activeActorId) ??
    (rosterFocalId !== activeActorId ? projectRosterStoryRead(visibleWorld, viewScopeKey, rosterFocalId) : undefined) :
    undefined, [readingRoster, visibleWorld, viewScopeKey, activeActorId, rosterFocalId]);
  const rosterRevision = saveContextVersion.current;
  const personalStoryActive = mayReadPersonal && personalStoryChoice?.actorId === activeActorId &&
    personalStoryChoice?.scope === viewScopeKey;
  const selectedRosterEvent = personalStoryActive ? personalStoryChoice?.eventId : undefined;
  const personalStory = React.useMemo(() => readingChronicle && personalStoryActive && activeActorId ?
    (selectedRosterEvent ? readSelectedRosterScene(visibleWorld, activeActorId, selectedRosterEvent) :
      projectWitnessedPersonalStory(visibleWorld,activeActorId)) : undefined,
    [readingChronicle,personalStoryActive,activeActorId,selectedRosterEvent,visibleWorld]);
  useEffect(() => {
    setPersonalStoryChoice((previous) => previous && mayReadPersonal && previous.actorId === activeActorId &&
      previous.scope === viewScopeKey ? previous : undefined);
  }, [activeActorId,viewScopeKey,mayReadPersonal]);
  const readingContext: ChronicleReadingContext | undefined = saveTimelineId ? {
    world:visibleWorld,scope:{ timelineId:saveTimelineId,branchId:timeline.activeBranchId,viewerId:activeActorId,
      previewTick:preview?.tick ?? null },
  } : undefined;
  const readingRevision = saveContextVersion.current;
  // Only the freshly opened exact native saved frame may try its verified origin; new writes always use the new timeline.
  const readingSaveOrigin: ChronicleReadingContext | undefined = restoredReadingOrigin && !preview &&
    restoredReadingOrigin.restoredBranchId === timeline.activeBranchId && restoredReadingOrigin.world === visibleWorld ? {
      world:visibleWorld,scope:{timelineId:restoredReadingOrigin.timelineId,branchId:restoredReadingOrigin.branchId,
        viewerId:activeActorId,previewTick:null},
    } : undefined;
  const selectedSettlementId = visibleWorld.settlements.villages.find((village) => village.locationId === selectedCultivator?.locationId)?.id;
  useEffect(() => {
    if (selectedCultivatorId !== activeActorId) setSelectedCultivatorId(activeActorId);
  }, [activeActorId, selectedCultivatorId]);
  useEffect(() => {
    if (!rosterFocus) return;
    if (workspace === 'people' && rosterFocus.id === activeActorId && rosterFocus.scope === viewScopeKey)
      actorHeading.current?.focus();
    setRosterFocus(undefined);
  }, [activeActorId, rosterFocus, viewScopeKey, workspace]);
  const scopedSupplyLinks=useMemo(()=>readingChronicle&&!chronicleReturn&&selectedCultivator?
    projectFrontierSupplyLinks(visibleWorld,selectedCultivator,{limit:3}):[],
  [readingChronicle,chronicleReturn,visibleWorld,selectedCultivator]);
  const chronicleCauses = useMemo(() => workspace === 'chronicle'
    ? new Map(visibleCausalChronicle(visibleWorld, activeActorId, 120).map((row) => [row.entry.eventId, row]))
    : undefined, [visibleWorld, activeActorId, workspace]);
  const currentFocusScope = focusTrail?.scope === viewScopeKey && focusTrail.revision === saveContextVersion.current;
  const trail = currentFocusScope ? focusTrail : undefined;
  const resolver = useMemo(() => workspace === 'chronicle' || trail
    ? createChronicleFocusResolver(visibleWorld, trail?.viewerId ?? activeActorId) : undefined,
  [visibleWorld, trail, activeActorId, workspace]);
  const focusProof = trail && resolver?.resolve(trail.request);
  const focusTarget = focusProof?.ok && trail?.token !== mapFocusFailed ? focusProof.target : undefined;
  const focusSect = focusTarget?.kind === 'sect' ? visibleWorld.sects.find(({ id }) => id === focusTarget.targetId) : undefined;
  const focusProfile = focusTarget?.kind === 'actor' && activeActorId === focusTarget.targetId;
  const reportMapFocusFailure = useCallback(() => setMapFocusFailed(trail?.token), [trail?.token]);
  useEffect(() => {
    if (focusTrail && !currentFocusScope) {
      setFocusTrail(undefined);
      setFocusNotice(CHRONICLE_FOCUS_UNAVAILABLE);
    }
  }, [focusTrail, currentFocusScope]);
  useEffect(() => {
    if (trail) backRef.current?.focus({ preventScroll: true });
  }, [trail]);
  const characterLocation = visibleWorld.locations.find((site) => site.id === selectedCultivator?.locationId);
  const queueSelectedSalvage: ArtifactSalvageControls['onConfirm'] = (command, stamp) => {
    if (browsing.current || stepInFlight.current || fastForwardRun.current ||
        history.current.activeBranchId !== timeline.activeBranchId || stamp.scopeKey !== viewScopeKey ||
        stamp.actorId !== activeActorId || stamp.world !== authority.current) return false;
    const next = updateWorld((current) => {
      const candidate = structuredClone(current);
      return queueAvatarSalvage(candidate, stamp.actorId, command.targetArtifactId, command.targetLocationId) ? candidate : current;
    });
    if (next === stamp.world) return false;
    setIsRunning(false);
    setAvatarNotice(undefined);
    return true;
  };
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
        setSelectedCultivatorId(selectedCultivator.id);
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
      if(next!==world)setAvatarNotice(undefined);
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
      if(next!==world)setAvatarNotice(undefined);
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
  const medicineContextVersion=saveContextVersion.current;
  const medicineAvatar=!preview&&selectedCultivator&&activeAvatar(world)?.id===selectedCultivator.id&&
    canQueueAvatarSalvage(world,selectedCultivator.id)?selectedCultivator:undefined;
  const queueDanxiaMedicine=(option:DanxiaMedicineOption)=>{
    if(!medicineAvatar||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
      history.current!==timeline||authority.current!==world||saveContextVersion.current!==medicineContextVersion)return false;
    setIsRunning(false);
    const updated=updateWorld(current=>{
      const next=structuredClone(current);
      return queueAvatarDanxiaMedicine(next,medicineAvatar.id,option)?next:current;
    });
    return updated!==world;
  };
  const medicineControls:DanxiaMedicineControlsProps|undefined=dashboardOpen&&workspace==='sect'&&selectedCultivator?{
    scopeKey:`${viewScopeKey}:${selectedCultivator.id}`,revisionKey:visibleWorld,
    choices:medicineAvatar?availableDanxiaMedicineActions(medicineAvatar,world,world.tick+1).map(option=>({
      option,...(option.targetCultivatorId?{label:world.cultivators.find(actor=>actor.id===option.targetCultivatorId)?.name}:{})
    })):[],
    disabled:isStepping||fastForwardLocked||!!preview,
    ...(medicineAvatar?{onQueue:queueDanxiaMedicine}:{}),
  }:undefined;
  const queueDanxiaReview=(option:DanxiaReviewOption)=>{
    if(!medicineAvatar||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
      history.current!==timeline||authority.current!==world||saveContextVersion.current!==medicineContextVersion)return false;
    const updated=updateWorld(current=>{
      const next=structuredClone(current);
      return queueAvatarDanxiaReview(next,medicineAvatar.id,option)?next:current;
    });
    if(updated!==world)setIsRunning(false);
    return updated!==world;
  };
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
  const queueDoctrineFounding=(option:DoctrineFoundingOption)=>{
    if(!medicineAvatar||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
      history.current!==timeline||authority.current!==world||saveContextVersion.current!==medicineContextVersion)return false;
    const updated=updateWorld(current=>{
      const next=structuredClone(current);
      return queueAvatarDoctrineFounding(next,medicineAvatar.id,option)?next:current;
    });
    if(updated!==world)setIsRunning(false);
    return updated!==world;
  };
  const foundingControls:DoctrineFoundingControlsProps|undefined=medicineControls&&medicineAvatar?{
    scopeKey:medicineControls.scopeKey,revisionKey:visibleWorld,disabled:medicineControls.disabled,onQueue:queueDoctrineFounding,
    choices:availableDoctrineFoundingActions(medicineAvatar,world,world.tick+1).map(option=>{
      const row=option.targetDoctrineFoundingId?world.doctrineFoundings.foundings.find(item=>item.id===option.targetDoctrineFoundingId):undefined;
      const plan=option.targetRelocationId?world.relocations.plans.find(item=>item.id===option.targetRelocationId):undefined;
      const place=world.locations.find(item=>item.id===(row?.oldSiteId??plan?.originId));
      return {option,label:[row?.independentName,place?.name].filter(Boolean).join(' · ')};
    }),
  }:undefined;
  const queueDoctrineMaturity=(option:DoctrineMaturityOption)=>{
    if(!medicineAvatar||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
      history.current!==timeline||authority.current!==world||saveContextVersion.current!==medicineContextVersion)return false;
    const updated=updateWorld(current=>{
      const next=structuredClone(current);
      return queueAvatarDoctrineMaturity(next,medicineAvatar.id,option)?next:current;
    });
    if(updated!==world)setIsRunning(false);
    return updated!==world;
  };
  const maturityControls:DoctrineMaturityControlsProps|undefined=medicineControls&&medicineAvatar?{
    scopeKey:medicineControls.scopeKey,revisionKey:visibleWorld,disabled:medicineControls.disabled,onQueue:queueDoctrineMaturity,
    choices:availableDoctrineMaturityActions(medicineAvatar,world,world.tick+1).map(option=>{
      const charter=world.doctrineFoundings.foundings.find(item=>item.id===option.targetDoctrineFoundingId);
      const proof=charter?.maturity?.support;
      return {option,label:charter?.independentName,
        ...(proof?{proof:{kind:proof.kind,observedTick:proof.observedTick}}:{})};
    }),
  }:undefined;
  const workshopAvatar=!preview&&dashboardOpen&&workspace==='sect'&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const workshopReleaseControls:WorkshopReleaseControls|undefined=workshopAvatar?{
    scopeKey:`${viewScopeKey}:${workshopAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,workshopAvatar.id)?availableWorkshopReleaseActions(workshopAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='WORKSHOP_RELEASE'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice:WorkshopReleaseOption,revision:object)=>{
      if(revision!==world||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
        history.current!==timeline||authority.current!==world||saveContextVersion.current!==medicineContextVersion)return false;
      const updated=updateWorld(current=>{
        const clone=structuredClone(current);
        return queueAvatarWorkshopRelease(clone,workshopAvatar.id,choice)?clone:current;
      });
      if(updated!==world)setIsRunning(false);
      return updated!==world;
    }
  }:undefined;
  const workshopEstateControls:WorkshopEstateControls|undefined=workshopAvatar?{
    scopeKey:`${viewScopeKey}:${workshopAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,workshopAvatar.id)?availableWorkshopEstateActions(workshopAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='WORKSHOP_ESTATE'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>{
      if(revision!==world||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
        history.current!==timeline||authority.current!==world||saveContextVersion.current!==medicineContextVersion)return false;
      const updated=updateWorld(current=>{
        const clone=structuredClone(current);
        return queueAvatarWorkshopEstate(clone,workshopAvatar.id,choice)?clone:current;
      });
      if(updated!==world)setIsRunning(false);
      return updated!==world;
    }
  }:undefined;
  const mealAvatar=!preview&&dashboardOpen&&workspace==='people'&&foldPreferences.sections.people==='pilgrimage'&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const waypostMealControls:WaypostMealControls|undefined=mealAvatar?{
    scopeKey:`${viewScopeKey}:${mealAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,mealAvatar.id)?availableWaypostMealActions(mealAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='WAYPOST_MEAL'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>{
      if(revision!==world||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
        history.current!==timeline||authority.current!==world||saveContextVersion.current!==medicineContextVersion)return false;
      const updated=updateWorld(current=>{
        const clone=structuredClone(current);
        return queueAvatarWaypostMeal(clone,mealAvatar.id,choice)?clone:current;
      });
      if(updated!==world)setIsRunning(false);
      return updated!==world;
    }
  }:undefined;
  const craftTrainingControls:CraftTrainingControls|undefined=workshopAvatar?{
    scopeKey:`${viewScopeKey}:${workshopAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,workshopAvatar.id)?availableCraftTrainingActions(workshopAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='CRAFT_TRAINING'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>{
      if(revision!==world||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
        history.current!==timeline||authority.current!==world||saveContextVersion.current!==medicineContextVersion)return false;
      const updated=updateWorld(current=>{
        const clone=structuredClone(current);
        return queueAvatarCraftTraining(clone,workshopAvatar.id,choice)?clone:current;
      });
      if(updated!==world)setIsRunning(false);
      return updated!==world;
    }
  }:undefined;
  const shelterAvatar=!preview&&dashboardOpen&&workspace==='world'&&foldPreferences.sections.world==='villages'&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const disasterShelterControls:DisasterShelterControls|undefined=shelterAvatar?{
    scopeKey:`${viewScopeKey}:${shelterAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,shelterAvatar.id)?availableDisasterShelterActions(shelterAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='DISASTER_SHELTER'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>{
      if(revision!==world||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
        history.current!==timeline||authority.current!==world||saveContextVersion.current!==medicineContextVersion)return false;
      const updated=updateWorld(current=>{
        const clone=structuredClone(current);
        return queueAvatarDisasterShelter(clone,shelterAvatar.id,choice)?clone:current;
      });
      if(updated!==world)setIsRunning(false);
      return updated!==world;
    }
  }:undefined;
  const freightAvatar=!preview&&dashboardOpen&&workspace==='world'&&foldPreferences.sections.world==='markets'&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const marketFreightControls:MarketFreightControls|undefined=freightAvatar?{
    scopeKey:`${viewScopeKey}:${freightAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,freightAvatar.id)?availableMarketFreightActions(freightAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='MARKET_FREIGHT'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>{
      if(revision!==world||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
        history.current!==timeline||authority.current!==world||saveContextVersion.current!==medicineContextVersion)return false;
      const updated=updateWorld(current=>{
        const clone=structuredClone(current);
        return queueAvatarMarketFreight(clone,freightAvatar.id,choice)?clone:current;
      });
      if(updated!==world)setIsRunning(false);
      return updated!==world;
    }
  }:undefined;
  const memorialControls:CivicMemorialAppendControls|undefined=shelterAvatar?{
    scopeKey:`${viewScopeKey}:${shelterAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,shelterAvatar.id)?availableCivicMemorialActions(shelterAvatar,world,world.tick+1)
      .filter(option=>option.civicMemorialMove==='append_relief'):[],
    pending:world.playerAvatar.pendingOrder?.action==='CIVIC_MEMORIAL'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>{
      if(revision!==world||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
        history.current!==timeline||authority.current!==world||saveContextVersion.current!==medicineContextVersion)return false;
      const updated=updateWorld(current=>{
        const clone=structuredClone(current);
        return queueAvatarCivicMemorialAppend(clone,shelterAvatar.id,choice)?clone:current;
      });
      if(updated!==world)setIsRunning(false);
      return updated!==world;
    }
  }:undefined;
  const inspect = (workspaceSection: 'profile' | 'cultivation' | 'mind' | 'sect') => <React.Suspense fallback={<p role="status">载入修士档案…</p>}>
    <AgentInspector world={visibleWorld} cultivator={selectedCultivator} onSelectCultivator={setSelectedCultivatorId} workspaceSection={workspaceSection} medicineControls={workspaceSection==='sect'?medicineControls:undefined}
      seasonReviewControls={workspaceSection==='sect'?seasonReviewControls:undefined}
      workshopReleaseControls={workspaceSection==='sect'?workshopReleaseControls:undefined}
      workshopEstateControls={workspaceSection==='sect'?workshopEstateControls:undefined}
      craftTrainingControls={workspaceSection==='sect'?craftTrainingControls:undefined}
      artifactSalvage={{ scopeKey:viewScopeKey, busy:isStepping || fastForwardLocked, readOnly:!!preview, onConfirm:queueSelectedSalvage }} />
  </React.Suspense>;
  const openWorkspace = (next: WorkspaceId) => {
    if (workspace !== next) {
      setFocusTrail(undefined);
      setChronicleReturn(undefined);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    setWorkspace(next);
  };
  const followChronicle = (request: ChronicleFocusRequest, position: ChronicleFeedPosition) => {
    const currentView = browsing.current ? preview?.world : authority.current;
    if (workspace !== 'chronicle' || !activeActorId || currentView !== visibleWorld ||
        history.current.activeBranchId !== timeline.activeBranchId || stepInFlight.current || fastForwardRun.current ||
        !resolver?.resolve(request).ok) {
      setFocusNotice(CHRONICLE_FOCUS_UNAVAILABLE);
      return;
    }
    setIsRunning(false);
    setFocusNotice(undefined);
    setChronicleReturn(undefined);
    setFocusTrail({ ...position, token: ++focusSerial.current, request, viewerId: activeActorId,
      category: chronicleFilter, scope: viewScopeKey, revision: saveContextVersion.current });
    if (request.kind === 'actor') setSelectedCultivatorId(request.targetId);
    setWorkspace(chronicleWorkspace[request.kind]);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const returnToChronicle = () => {
    if (!trail || history.current.activeBranchId !== timeline.activeBranchId ||
        browsing.current !== Boolean(preview) || trail.revision !== saveContextVersion.current) return;
    setFocusTrail(undefined);
    setSelectedCultivatorId(trail.viewerId);
    setChronicleFilter(trail.category);
    setChronicleReturn(trail);
    setFocusNotice(focusTarget ? undefined : CHRONICLE_FOCUS_UNAVAILABLE);
    setWorkspace('chronicle');
  };
  const clearChronicleReturn = (token: number) => setChronicleReturn((previous) => previous?.token === token ? undefined : previous);
  const opened = (view: WorkspaceId, fallback?: string) => (initialWorkspace ?? 'map') === view ? initialSection ?? fallback : fallback;
  const eraFrame=timeline.branches.find(branch=>branch.id===timeline.activeBranchId)?.snapshots
    .find(({tick})=>tick===visibleWorld.tick);
  const eraRevision=saveContextVersion.current;
  const eraEntrySites=useMemo(()=>{
    if(!readingChronicle||!selectedCultivator?.alive)return [];
    const map=createTerrainMapView(visibleWorld,selectedCultivator,true);
    return map.seenLocations.filter(site=>site.type!=='secret_realm'&&site.type!=='abyss'&&map.isCurrentLocation(site.id))
      .map(({id,name})=>({id,name}));
  },[readingChronicle,visibleWorld,selectedCultivator]);
  const eraViewingAuthority=(actorId?:string,siteId?:string)=>{
    if(!eraFrame||history.current!==timeline||saveContextVersion.current!==eraRevision||stepInFlight.current||
        fastForwardRun.current||campaignGuard.current||Boolean(preview)!==browsing.current||
        (preview?preview.world!==visibleWorld||preview.tick!==eraFrame.tick:authority.current!==visibleWorld))return false;
    return !actorId || !!siteId&&eraEntrySites.some(({id})=>id===siteId)&&
      Boolean(findEraEntryCandidate(visibleWorld,siteId,activeActorId??undefined,actorId));
  };
  const eraEntryFeedback=(text:string)=>setEraEntryNotice({scope:viewScopeKey,text});
  const eraObserve=()=>{
    if(!eraViewingAuthority()){eraEntryFeedback('所选年代已变化，请重新选择。');return;}
    setIsRunning(false);setPersonalStoryChoice(undefined);
    rememberFold('chronicle','feed');setWorkspace('chronicle');
  };
  const eraFollow=(siteId:string,actorId:string)=>{
    if(!eraViewingAuthority(actorId,siteId)){eraEntryFeedback('所选人物已不在这个见闻范围内。');return;}
    setIsRunning(false);setSelectedCultivatorId(actorId);
    setPersonalStoryChoice({actorId,scope:viewScopeKey});
    rememberFold('chronicle','feed');setWorkspace('chronicle');
  };
  const eraPossess=(siteId:string,actorId:string)=>{
    if(!activeActorId||!eraFrame||!eraViewingAuthority(actorId,siteId)){
      eraEntryFeedback('所选年代或人物已变化，没有附身。');return;
    }
    const exact={siteId,viewerId:activeActorId,actorId};
    try {
      if(preview){
        const next=forkTimelineAvatarEntry(timeline,timeline.activeBranchId,eraFrame.tick,eraFrame,exact);
        const incoming=readTimelineHead(next);
        if(!incoming)throw Error('未找到新分支的实际人物状态。');
        setEraEntryReturn({from:timeline.activeBranchId,entered:next.activeBranchId,epoch:viewEpoch,sourceFrame:eraFrame});
        activateTimeline(next,incoming);
      }else{
        setIsRunning(false);
        const changed=updateWorld(current=>{
          if(current!==visibleWorld||findEraEntryCandidate(current,siteId,activeActorId,actorId)?.decision.kind!=='rest_or_cultivate')
            return current;
          const copy=structuredClone(current);
          return possessAvatar(copy,actorId)?copy:current;
        });
        if(changed===visibleWorld)throw Error('当事人已不能在此时附身，原状态未改变。');
        setEraEntryReturn(undefined);
      }
      setSelectedCultivatorId(actorId);setAvatarNotice('已按实际资格附身，尚未排定修炼或休整。');
      rememberFold('people','possession');setWorkspace('people');
    }catch(error){eraEntryFeedback(error instanceof Error?error.message:'这次无法附身，原线不变。');}
  };
  const canReturnEraEntry=eraEntryReturn?.entered===timeline.activeBranchId&&eraEntryReturn.epoch===viewEpoch&&
    timeline.branches.some(branch=>branch.id===eraEntryReturn.from&&branch.snapshots.includes(eraEntryReturn.sourceFrame));
  const returnEraEntry=()=>{
    if(!canReturnEraEntry||!eraEntryReturn||stepInFlight.current||campaignGuard.current||fastForwardRun.current||
        history.current!==timeline)return;
    const {from,sourceFrame}=eraEntryReturn;
    const next=selectTimelineBranch(timeline,from),incoming=readTimelineHead(next);
    const former=readTimelineSnapshot(next,sourceFrame.tick,from);
    if(!incoming||!former||next.activeBranchId!==from)return;
    restoreHistoricalFrame(next,incoming,sourceFrame.tick,former);
    setEraEntryReturn(undefined);
    rememberFold('chronicle','timeline');setWorkspace('chronicle');
  };
  const ordinaryChronicleFold = foldPreferences.sections.chronicle === undefined
    ? opened('chronicle', 'feed') : foldPreferences.sections.chronicle;
  const scribeAvatar=!preview&&!chronicleReturn&&dashboardOpen&&workspace==='chronicle'&&ordinaryChronicleFold==='library'&&selectedCultivator&&
    activeAvatar(world)?.id===selectedCultivator.id?selectedCultivator:undefined;
  const scribeControls:ScribeCommissionControls|undefined=scribeAvatar?{
    scopeKey:`${viewScopeKey}:${scribeAvatar.id}`,revisionKey:world,disabled:isStepping||fastForwardLocked,
    choices:canQueueAvatarSalvage(world,scribeAvatar.id)?availableScribeCommissionActions(scribeAvatar,world,world.tick+1):[],
    pending:world.playerAvatar.pendingOrder?.action==='SCRIBE_COMMISSION'?world.playerAvatar.pendingOrder:undefined,
    onQueue:(choice,revision)=>{
      if(revision!==world||browsing.current||stepInFlight.current||fastForwardRun.current||campaignGuard.current||
        history.current!==timeline||authority.current!==world||saveContextVersion.current!==medicineContextVersion)return false;
      const updated=updateWorld(current=>{
        const clone=structuredClone(current);
        return queueAvatarScribeCommission(clone,scribeAvatar.id,choice)?clone:current;
      });
      if(updated!==world)setIsRunning(false);
      return updated!==world;
    }
  }:undefined;
  const rememberFold = (view: Exclude<WorkspaceId, 'map'>, id: string | null) => {
    setFoldPreferences((previous) => previous.sections[view] === id ? previous :
      { ...previous, sections: { ...previous.sections, [view]: id } });
  };
  const fold = (view: Exclude<WorkspaceId, 'map'>) => ({
    rememberedOpen: foldPreferences.sections[view],
    onOpenChange: (id: string | null) => rememberFold(view, id),
  });
  const selectRosterActor = (id: string) => {
    if (!readingRoster || history.current !== timeline || saveContextVersion.current !== rosterRevision ||
        browsing.current !== Boolean(preview) || (browsing.current ? preview?.world : authority.current) !== visibleWorld ||
        visibleWorld.cultivators.filter((person) => person.id === id).length !== 1) return;
    setSelectedCultivatorId(id);
    rememberFold('people', 'profile');
    setRosterFocus({ id, scope: viewScopeKey });
  };
  const openRosterStoryScene = (scene: ActorRosterScene) => {
    const current = browsing.current ? preview?.world : authority.current;
    if (!readingRoster || browsing.current !== Boolean(preview) || current !== visibleWorld ||
        history.current !== timeline || saveContextVersion.current !== rosterRevision ||
        stepInFlight.current || fastForwardRun.current || campaignGuard.current ||
        !rosterStoryStamp || !sameRosterScene(scene, rosterStoryStamp.scene) ||
        !resolveRosterStoryRead(visibleWorld, viewScopeKey, rosterStoryStamp)) return;
    setIsRunning(false);
    setFocusTrail(undefined);
    setFocusNotice(undefined);
    setChronicleReturn(undefined);
    setSelectedCultivatorId(scene.actorId);
    setPersonalStoryChoice({actorId:scene.actorId,scope:viewScopeKey,eventId:scene.eventId});
    rememberFold('chronicle','feed');
    setWorkspace('chronicle');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const changeHandedness = (value: string) => {
    if (value !== 'default' && value !== 'left' && value !== 'right') return;
    const next: HandednessPreference = value;
    setHandedness(next);
    writeHandednessPreference(next);
  };

  const storyEntryRevision=saveContextVersion.current;
  const storyEntryCurrent=()=>!dashboardOpen&&storyEntryOpen&&!stepInFlight.current&&!browsing.current&&
    !fastForwardRun.current&&!campaignGuard.current&&history.current===timeline&&authority.current===world&&
    saveContextVersion.current===storyEntryRevision;
  const openStoryEntry=()=>{
    if(dashboardOpen||stepInFlight.current||browsing.current||fastForwardRun.current||campaignGuard.current)return;
    setStoryNotice(undefined);
    setStoryEntryOpen(true);
  };
  const openDashboard=()=>{
    if(!storyEntryCurrent())return;
    setIsRunning(false);
    setStoryEntryOpen(false);
    setDashboardOpen(true);
  };
  const enterCurrentLead=()=>{
    const lead=storyHome?.lead;
    if(!storyEntryCurrent()||!lead)return false;
    return updateWorld((current)=>enterStoryLead(current,lead))!==world;
  };
  const orderCurrentStoryAvatar=(action:'REST'|'CULTIVATE')=>{
    if(!storyEntryCurrent())return false;
    return updateWorld((current)=>orderStoryAvatar(current,action))!==world;
  };
  const followCurrentLead=()=>{
    const lead=storyHome?.lead;
    if(!storyEntryCurrent()||!lead)return false;
    setIsRunning(false);
    discardChronicleContext();
    setSelectedCultivatorId(lead.id);
    setPersonalStoryChoice({actorId:lead.id,scope:viewScopeKey});
    rememberFold('chronicle','feed');
    setWorkspace('chronicle');
    setStoryEntryOpen(false);
    setDashboardOpen(true);
    return true;
  };
  const backToStory = () => {
    if (stepInFlight.current || fastForwardRun.current || campaignGuard.current) return;
    setIsRunning(false);
    if (browsing.current) clearPreview();
    else discardChronicleContext();
    setFocusNotice(undefined);
    setAnalyticsOpen(false);
    setCouncilOpen(false);
    setStoryNotice(undefined);
    setStoryEntryOpen(false);
    setDashboardOpen(false);
  };
  const advanceStory = () => {
    if (dashboardOpen || storyEntryOpen || stepInFlight.current || browsing.current || fastForwardRun.current||campaignGuard.current) return;
    setStoryNotice(undefined);
    setStoryOutcome(undefined);
    const before=authority.current,branch=history.current.activeBranchId,revision=saveContextVersion.current;
    void handleStepTick().then(()=>{
      const after=authority.current;
      if(history.current.activeBranchId!==branch||saveContextVersion.current!==revision||browsing.current)return;
      const text=storyOrderOutcome(before,after);
      if(text)setStoryOutcome({world:after,text});
    }).catch(()=>setStoryNotice('未能翻到下一幕，请重试。'));
  };

  const cockpitBusy=isStepping||fastForwardLocked;
  const cockpitSwitch=<CockpitModeSwitch active={cockpitOpen} disabled={cockpitBusy} onSwitch={()=>{
    if(stepInFlight.current||fastForwardRun.current||campaignGuard.current)return;
    if(cockpitOpen)backToStory();
    setCockpitOpen(!cockpitOpen);
  }}/>;
  if(cockpitOpen)return <PanoramicCockpitView world={visibleWorld} titleRef={cockpitHeading} exit={cockpitSwitch}
    time={{historical:Boolean(preview),running:isRunning,busy:cockpitBusy,onStep:()=>void handleStepTick(),
      onToggleAutoplay:toggleAutoplay,onReturnLive:()=>handleTimelinePreview(null),onOpenTimeline:()=>{
        openWorkspace('chronicle');rememberFold('chronicle','timeline');setStoryEntryOpen(false);
        setDashboardOpen(true);setCockpitOpen(false);
      }}}
    map={frontierView?.scope==='frontier'?frontierRealmView:arrayFieldAway||upperPassageAway?realmView:
      <React.Suspense fallback={<p role="status">载入舆图…</p>}>
        <WorldMapCanvas compact scopeKey={viewScopeKey} world={visibleWorld} selectedCultivatorId={activeActorId}
          onSelectCultivator={setSelectedCultivatorId} onBrushStroke={preview?undefined:handleBrushStroke}/>
      </React.Suspense>}
    inspector={<>{inspect('profile')}{inspect('mind')}</>}
    relationships={<React.Suspense fallback={<p role="status">载入关系图…</p>}>
      <RelationshipGraph key={viewScopeKey} world={visibleWorld} selectedCultivatorId={activeActorId}
        onSelectCultivator={setSelectedCultivatorId}/>
    </React.Suspense>}
    chronicle={<React.Suspense fallback={<p role="status">载入纪事…</p>}>
      <ChronicleFeed events={chronicleScenes} lead={chronicleLead} succession={succession}
        resolvePublicDialogue={publicDialogue?.event} category={chronicleFilter} onCategoryChange={setChronicleFilter}/>
    </React.Suspense>}/>;

  if (storyHome) return <main data-story-home data-story-turn={storyHome.calendar.tick} className="min-h-dvh bg-slate-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
    <div className="mx-auto flex max-w-[76rem] justify-end px-4 empty:hidden">{cockpitSwitch}</div>
    {storyEntryOpen?<PlayerStoryEntry titleRef={storyEntryHeading} role={projectStoryPlayerRole(world,storyHome.lead)}
      revision={world} busy={isStepping||fastForwardLocked} onBack={()=>setStoryEntryOpen(false)} onTools={openDashboard}
      onFollow={storyHome.lead?followCurrentLead:undefined} onEnter={enterCurrentLead} onOrder={orderCurrentStoryAvatar} />:
      <StoryFirstHome scene={storyHome.scene} leadName={storyHome.lead?.name} playerName={activeAvatar(world)?.name}
        busy={isStepping} moreRef={storyMoreRef} notice={storyNotice} calendar={storyHome.calendar}
        outcome={storyOutcome?.world===world?storyOutcome.text:undefined} onContinue={advanceStory} onMore={openStoryEntry} />}
  </main>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pt-[env(safe-area-inset-top)]"
      data-controls-hand={handedness} data-controls-workspace={workspace}
      data-controls-repeat={handedness !== 'default' || workspace === 'map' || Boolean(preview) || isRunning}
      data-controls-map-tools={workspace === 'map' && !(trail && !focusTarget)} data-controls-back={Boolean(trail)}>
      <header className="border-b border-slate-800 bg-slate-900/80">
        <div className="mx-auto flex w-full max-w-[76rem] flex-wrap items-center justify-between gap-2 py-2 pl-[max(.75rem,env(safe-area-inset-left))] pr-[max(.75rem,env(safe-area-inset-right))] sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-[max(1rem,env(safe-area-inset-right))]">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-amber-500/40 bg-amber-500/20">
              <Sparkles aria-hidden="true" className="h-5 w-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 ref={dashboardHeading} tabIndex={-1} className="text-base font-bold tracking-wide text-slate-100">天道沙盒<span className="hidden sm:inline"> · AI修仙宗门与群像模拟器</span></h1>
              <p className="break-words text-xs text-slate-300">仙历 {visibleWorld.year}年{visibleWorld.month}月 · 在世 {aliveCount} · 已陨落 {visibleWorld.cultivators.length - aliveCount}</p>
            </div>
          </div>
          {cockpitSwitch}
          <button type="button" disabled={isStepping || fastForwardLocked} onClick={backToStory}
            className={`${action} bg-slate-800 text-amber-100`}>回到故事</button>
          <div aria-label="推演控制" data-control-dock="repeat" className={`flex flex-wrap items-center gap-1.5 ${handedness === 'default' && workspace !== 'map' && !preview && !isRunning ? 'max-sm:hidden' : ''}`}>
            {preview ? (
              <><span className="text-xs text-amber-200">历史只读 · Tick #{preview.tick}</span>
                <button type="button" onClick={() => handleTimelinePreview(null)} className={`${action} bg-amber-400/15 text-amber-100`}>回到当前</button></>
            ) : (
              <>
                <button type="button" disabled={fastForwardLocked} onClick={toggleAutoplay}
                  className={`${action} ${isRunning ? 'bg-amber-500 text-slate-950' :
                    handedness === 'default' ? 'max-sm:hidden bg-emerald-500 text-slate-950' : 'bg-slate-800 text-emerald-100 sm:bg-emerald-500 sm:text-slate-950'}`}>
                  {isRunning ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
                  {isRunning ? '暂停推演' : '自动推演'}
                </button>
                <button type="button" disabled={isStepping || fastForwardLocked} onClick={() => void handleStepTick()}
                  className={`${action} ${isRunning ? 'max-sm:hidden bg-slate-800 text-slate-100' : 'bg-emerald-500 text-slate-950'}`}>
                  <FastForward aria-hidden="true" className="h-4 w-4" />{isStepping ? '推演中…' : '单步推演'}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <SandboxWorkspace active={workspace} onChange={openWorkspace} autoFocusTab={!(trail || chronicleReturn)}
        hideActiveContent={Boolean(trail && !focusTarget)} panelLead={trail && <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
          <button type="button" data-control-dock="back" ref={backRef} onClick={returnToChronicle} className={`${action} bg-slate-800 text-amber-100`}>返回原纪事</button>
          {!focusTarget && <p role="status" className="break-words text-xs text-amber-200">{CHRONICLE_FOCUS_UNAVAILABLE}</p>}
        </div>} views={{
        map: frontierView?.scope==='frontier'?frontierRealmView:arrayFieldAway||upperPassageAway?realmView:<div className="grid min-w-0 items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-4">
          <div className="min-w-0"><React.Suspense fallback={<div role="status" className="grid min-h-64 place-items-center rounded-xl border border-slate-800 text-sm text-slate-300">载入舆图…</div>}>
            <WorldMapCanvas compact scopeKey={viewScopeKey} world={visibleWorld} selectedCultivatorId={activeActorId}
            toolsOpen={workspace === 'map' && (foldPreferences.mapTools ?? false)} onToolsOpenChange={(mapTools) =>
              setFoldPreferences((previous) => (previous.mapTools ?? false) === mapTools ? previous : { ...previous, mapTools })}
            additionalTools={handedness === 'default' && !preview && !isRunning ? <button type="button" disabled={fastForwardLocked} onClick={toggleAutoplay}
              className={`${action} bg-slate-800 text-emerald-100 sm:hidden`}><Play aria-hidden="true" className="h-4 w-4" />自动推演</button> : undefined}
            chronicleFocus={trail?.request.kind === 'site' && focusTarget ? trail : undefined} onChronicleFocusUnavailable={reportMapFocusFailure}
            onSelectCultivator={setSelectedCultivatorId} onBrushStroke={preview ? undefined : handleBrushStroke} />
          </React.Suspense></div>
          <aside className={`${panel} min-w-0`} aria-label="当前修士">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="min-w-0 break-words">
                <p className="text-xs text-slate-400">当前修士</p>
                <h2 className="text-base font-semibold text-amber-100">{selectedCultivator?.name ?? '未选中人物'}</h2>
              </div>
              <button type="button" onClick={() => openWorkspace('people')} className={`${action} max-sm:hidden bg-slate-800 text-slate-100 hover:bg-slate-700`}>人物详情</button>
            </div>
            {selectedCultivator && <p className="break-words text-xs leading-relaxed text-slate-300">
              {selectedCultivator.realm} {selectedCultivator.realmStage}层 · {selectedCultivator.alive ? `气血 ${selectedCultivator.hp}/${selectedCultivator.maxHp}` : '已陨落'} · {expeditionRescueCheckpoint(visibleWorld, selectedCultivator) ? '位于实际撤离关口' :
                boundaryReliefCheckpoint(visibleWorld, selectedCultivator) ? '位于实际换防关口' :
                  courierCheckpoint(visibleWorld, selectedCultivator) ? '信使途中' : characterLocation?.name ?? '所在地点未详'}
            </p>}
          </aside>
        </div>,
        people: <div className="grid min-w-0 items-start gap-3 md:grid-cols-[17rem_minmax(0,1fr)]">
          <React.Suspense fallback={<p role="status">载入修士名册…</p>}><ActorRoster world={visibleWorld} selected={selectedCultivator} dismissOnSelect onSelect={selectRosterActor}
            scopeKey={viewScopeKey} focalId={rosterFocalId} scene={rosterStoryStamp?.scene} onReadScene={openRosterStoryScene} /></React.Suspense>
          <WorkspaceSections label={`${selectedCultivator?.name ?? '修士'} · 人物档案`} initialOpen={opened('people', 'profile')}
            {...fold('people')} moreAfterContent headingRef={actorHeading} forcedOpen={focusProfile ? 'profile' : undefined} sections={[
            { id: 'profile', label: '人物概况', content: <>
              {inspect('profile')}
              {activeActorId && visibleWorld.expeditionRescues.requests.some(({ explorerId, rescuerId, witnessIds }) =>
                activeActorId === explorerId || activeActorId === rescuerId || witnessIds.includes(activeActorId)) &&
                <React.Suspense fallback={<p role="status">载入求援凭证…</p>}><ExpeditionRescuePanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense>}
            </> },
            { id: 'cultivation', label: '修为、法宝与丹药', content: inspect('cultivation') },
            { id: 'mind', label: '心声、记忆与流言', content: inspect('mind') },
            { id: 'relationships', label: '关系与师承', content: <div className="space-y-2.5">
              <React.Suspense fallback={<p role="status">载入师承记录…</p>}><MentorshipPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense>
              {activeActorId && visibleWorld.apprenticeCohorts.cohorts.some(({ mentorId, seats }) =>
                mentorId === activeActorId || seats.some(({ studentId }) => studentId === activeActorId)) &&
                <React.Suspense fallback={null}><ApprenticeCohortPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense>}
              {activeActorId && visibleWorld.sparring.agreements.some(({ proposerId, partnerId }) =>
                proposerId === activeActorId || partnerId === activeActorId) &&
                <React.Suspense fallback={<p role="status">载入切磋凭证…</p>}><SparringPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense>}
              <React.Suspense fallback={<p role="status">载入关系图…</p>}><RelationshipGraph key={viewScopeKey} world={visibleWorld} selectedCultivatorId={activeActorId} onSelectCultivator={setSelectedCultivatorId} /></React.Suspense>
            </div> },
            ...(workspace === 'people' && selectedCultivator && visiblePilgrimages(visibleWorld, selectedCultivator).length > 0 ? [{
              id: 'pilgrimage', label: '朝山巡礼与共愿', content: <React.Suspense fallback={<p role="status">载入巡礼记录…</p>}>
                <PilgrimagePanel world={visibleWorld} cultivator={selectedCultivator} mealControls={waypostMealControls} />
              </React.Suspense>,
            }] : []),
            { id: 'trace', label: '天机溯因与单回合复盘', content: <React.Suspense fallback={<p role="status">载入决策纪要…</p>}>
              <DecisionTracePanel world={visibleWorld} cultivator={selectedCultivator} busy={isStepping} historical={!!preview} onReplay={compareDecision} />
            </React.Suspense> },
            ...(preview ? [] : [{ id: 'possession', label: '化身临世与古戒', content: <React.Suspense fallback={<p role="status">载入化身面板…</p>}>
              {canReturnEraEntry && <button type="button" disabled={isStepping||fastForwardLocked} onClick={returnEraEntry}
                className={`${action} bg-slate-800 text-amber-100`}>返回入世前的年代</button>}
              <PossessionPanel world={world} selectedCultivatorId={activeActorId} busy={isStepping}
                modelReady={llmConfig.enabled && Boolean(llmConfig.apiKey.trim())} notice={avatarNotice}
                onPossess={handlePossess} onOrder={handleAvatarOrder} onSpeak={(request) => void handleAvatarSpeak(request)} />
            </React.Suspense> }]),
          ]} />
        </div>,
        chronicle: <WorkspaceSections label="纪事与历史" initialOpen={opened('chronicle', 'feed')}
          {...fold('chronicle')} forcedOpen={chronicleReturn && ordinaryChronicleFold !== 'feed' ? 'feed' : undefined} sections={[
          { id: 'feed', label: '山河见闻', content: <React.Suspense fallback={<p role="status">载入山河见闻…</p>}>
            <AuthoredEraChronicle world={visibleWorld} visible={chronicleScenes} />
            {scopedSupplyLinks.length>0&&<CrossRegionConsequenceRead key={viewScopeKey} consequences={scopedSupplyLinks}
              viewerName={selectedCultivator?.name} frame={visibleWorld.authoredEraOrigin?undefined:visibleWorld}/>}
            {selectedCultivator && mayReadPersonal && !chronicleReturn && <WitnessedStoryScopeToggle selectedName={selectedCultivator.name}
              active={personalStoryActive}
              onToggle={() => setPersonalStoryChoice(personalStoryActive ? undefined : {actorId:selectedCultivator.id,scope:viewScopeKey})} />}
            {personalStory && !chronicleReturn ? <WitnessedPersonalStory story={personalStory} focusEventId={selectedRosterEvent} /> : <ChronicleFeed
              events={chronicleScenes} lead={chronicleLead} succession={succession} resolvePublicDialogue={publicDialogue?.event}
              category={chronicleFilter} onCategoryChange={setChronicleFilter} focusOptions={resolver?.build}
              causality={(eventId) => chronicleCauses?.get(eventId)}
              reading={readingContext && !chronicleReturn ? {context:readingContext,saveOrigin:readingSaveOrigin,
                scopeKey:`${viewScopeKey}:${activeActorId ?? ''}`,
                isCurrent:() => saveContextVersion.current === readingRevision && history.current.activeBranchId === timeline.activeBranchId &&
                  (preview ? browsing.current : !browsing.current && authority.current === world) } : undefined}
              onJump={followChronicle} returnPosition={chronicleReturn} onReturnHandled={clearChronicleReturn} focusNotice={focusNotice} />}
          </React.Suspense> },
          { id: 'library', label: '藏书阁与故事', content: <React.Suspense fallback={<p role="status">载入藏书阁…</p>}><ChronicleLibraryPanel world={visibleWorld} cultivator={selectedCultivator} scopeKey={viewScopeKey} scribeControls={scribeControls} /></React.Suspense> },
          { id: 'notebook', label: '书签与地图批注', content: <React.Suspense fallback={<p role="status">载入分支记录…</p>}>
            <ChronicleNotebookPanel key={`${timeline.activeBranchId}:${preview?.tick ?? 'live'}:${activeActorId ?? ''}`}
              world={visibleWorld} actorId={activeActorId} branchId={timeline.activeBranchId} readOnly={!!preview} busy={isStepping} onWrite={writeAnnotation} />
            <WatchlistsPanel key={`${viewScopeKey}:${activeActorId ?? ''}`}
              world={visibleWorld} actorId={activeActorId} branchId={timeline.activeBranchId} readOnly={!!preview} busy={isStepping} onWrite={writeWatchlist} />
          </React.Suspense> },
          { id: 'rank-season', label: '赛季榜与荣誉', content: <React.Suspense fallback={<p role="status">载入赛季榜…</p>}>
            <RankSeasonPanel world={visibleWorld} cultivator={selectedCultivator} />
          </React.Suspense> },
          { id: 'timeline', label: '原始时间线与分支', content: <React.Suspense fallback={<p role="status">载入时间线…</p>}>
            <TimelinePanel timeline={timeline} previewTick={preview?.tick ?? null} busy={isStepping}
              eraEntry={eraFrame && <React.Suspense fallback={null}><EraEntryPanel
                date={visibleWorld} scopeKey={`${viewScopeKey}:${activeActorId??''}`} snapshotKey={eraFrame}
                sites={eraEntrySites} readCandidates={siteId=>projectEraEntryCandidates(visibleWorld,siteId,activeActorId??undefined)}
                disabled={isStepping||fastForwardLocked} canPossess={!preview||timeline.branches.length<TIMELINE_MAX_BRANCHES}
                historical={Boolean(preview)} notice={eraEntryNotice?.scope===viewScopeKey?eraEntryNotice.text:undefined}
                onObserve={eraObserve} onFollow={eraFollow} onPossess={eraPossess} /></React.Suspense>}
              comparisonViewerId={activeActorId ?? undefined} comparisonScopeKey={viewScopeKey}
              verificationSource={{world:visibleWorld,branchId:timeline.activeBranchId,scopeKey:viewScopeKey,sessionEpoch:viewEpoch,
                busy:isStepping || isRunning || fastForwardLocked}}
              onPreview={handleTimelinePreview} onSelectBranch={handleTimelineSelectBranch} onFork={handleTimelineFork} notice={timelineNotice}
              fastForward={{ ...(campaign.active||campaign.working?{phase:campaignPhase}:fastForwardView),
                available: typeof Worker === 'function' && !preview && !isStepping && timeline.branches.length < TIMELINE_MAX_BRANCHES,
                capacitySource: {world,contextVersion:saveContextVersion.current,scopeKey:viewScopeKey},
                campaignAvailable:campaign.available,campaignState:campaign.state,campaignPreparing:campaign.working,
                pendingCampaign,campaignNotice:campaign.notice,campaignStopOptions:campaign.available?campaignStopOptions:undefined,
                campaignSelectedStop,
                onStart: (months,binding)=>startFastForward(months,binding,stop=>Boolean(findVisibleCampaignStopOption(campaignStopOptions,stop))), onPause: campaign.active?campaign.pause:() => commandFastForward('pause'),
                onResume: campaign.active?campaign.resume:() => commandFastForward('resume'),
                onStage: () => commandFastForward('stage'),
                onCancel: campaign.active?campaign.cancel:campaign.working?campaign.abortOperation:() => stopFastForward('已取消并丢弃暂存结果，原分支不变。'),
                onApply: campaign.active?campaign.apply:applyFastForward }} />
          </React.Suspense> },
          { id: 'witness', label: '证词与名誉复核', content: <React.Suspense fallback={<p role="status">载入证词记录…</p>}><AttestationPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense> },
          { id: 'estate', label: '归葬与遗产', content: <React.Suspense fallback={<p role="status">载入遗产账簿…</p>}>
            <EstateMemorialPanel world={visibleWorld} cultivator={selectedCultivator} />
          </React.Suspense> },
        ]} />,
        sect: <WorkspaceSections label="宗门事务" initialOpen={opened('sect', 'governance')}
          {...fold('sect')} forcedOpen={focusSect ? 'governance' : undefined} sections={[
          { id: 'governance', label: '宗门地位、库账与外交', content: focusSect
            ? <FocusedSectSummary name={focusSect.name} alignment={focusSect.alignment} />
            : <div className="space-y-2.5">{inspect('sect')}
              {activeActorId && visibleWorld.boundaryReliefs.cases.length > 0 &&
                <React.Suspense fallback={null}><BoundaryReliefPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense>}
            </div> },
          { id: 'oaths', label: '天道契书与宗门仲裁', content: <React.Suspense fallback={<p role="status">载入契书记录…</p>}><OathContractsPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense> },
          { id: 'doctrine', label: '道统与分合', content: <React.Suspense fallback={<p role="status">载入道统记录…</p>}>
            <SectDoctrinePanel world={visibleWorld} cultivator={selectedCultivator} foundingControls={foundingControls} maturityControls={maturityControls} />
          </React.Suspense> },
          { id: 'relocation', label: '山门迁移与旧址', content: <React.Suspense fallback={<p role="status">载入迁移记录…</p>}>
            <SectRelocationPanel world={visibleWorld} cultivator={selectedCultivator} />
          </React.Suspense> },
          { id: 'ceasefire', label: '停战与重建', content: <React.Suspense fallback={<p role="status">载入停战记录…</p>}>
            <CeasefirePanel world={visibleWorld} cultivator={selectedCultivator} />
          </React.Suspense> },
          { id: 'research', label: '论道会与共研创法', content: <React.Suspense fallback={<p role="status">载入论道记录…</p>}>
            <SectResearchPanel world={visibleWorld} cultivator={selectedCultivator} />
          </React.Suspense> },
          { id: 'sanctuary', label: '避难所与通行敕令', content: <React.Suspense fallback={<p role="status">载入避难所记录…</p>}>
            <SanctuaryPanel world={visibleWorld} cultivator={selectedCultivator} />
          </React.Suspense> },
          { id: 'credit', label: '宗门信贷与清算', content: <React.Suspense fallback={<p role="status">载入宗门信贷记录…</p>}>
            <SectCreditPanel world={visibleWorld} cultivator={selectedCultivator} />
          </React.Suspense> },
          ...(preview ? [] : [{ id: 'council', label: '长老议事厅', content: <button type="button" disabled={isStepping} onClick={() => { setCouncilOpenedBefore(true); setCouncilOpen(true); }}
            className={`${action} bg-violet-900/60 text-violet-100 hover:bg-violet-800`}>打开长老议事厅</button> }]),
        ]} />,
        world: frontierView?.scope==='frontier'?frontierRealmView:arrayFieldAway||upperPassageAway?realmView:<WorkspaceSections label="世界与设置" initialOpen={opened('world', 'weather')} {...fold('world')} sections={[
          { id: 'weather', label: '灵候图与观测', content: <div className="space-y-2.5">
            <React.Suspense fallback={<p role="status">载入世界记录…</p>}><WeatherAtlasPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense>
            {(waterVeinView||showMiningCharter||northWellView||upperPassageAtWell||northGateRenewalAtWell||arrayFieldAtWell)&&<React.Suspense fallback={null}><ColdWaterVeinPanel view={waterVeinView} controls={waterVeinControls}>
              {showMiningCharter&&miningCharterView&&<NorthMiningCharterPanel view={miningCharterView} controls={miningCharterControls}/>}
              {northWellView&&<NorthWellRevisitPanel view={northWellView} controls={northWellControls} author={northWellRevisitAuthor}/>}
              {northGateRenewalAtWell&&<NorthGateRenewalPanel view={northGateRenewalAtWell} nowTick={visibleWorld.tick} now={visibleWorld} controls={northGateRenewalControls}/>}
              {upperPassageAtWell&&realmView}
              {arrayFieldAtWell&&<UpperArrayFieldWellPanel atWell={atArrayWell} trades={arrayFieldTrades}
                controls={arrayFieldControls} tradeCandidates={arrayFieldCandidates} nowTick={visibleWorld.tick}/>}
            </ColdWaterVeinPanel></React.Suspense>}
            {frontierView?.scope==='anchor'&&frontierRealmView}
            {activeActorId && visibleWorld.shortShifts.shifts.some(({ hostId, workerId }) => activeActorId === hostId || activeActorId === workerId) &&
              <React.Suspense fallback={<p role="status">载入短聘凭证…</p>}><ShortShiftPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense>}
          </div> },
          { id: 'markets', label: '坊市与商队', content: selectedCultivator
            ? <div className="space-y-2.5">
              <React.Suspense fallback={<p role="status">载入世界记录…</p>}><MarketCaravansPanel world={visibleWorld} cultivator={selectedCultivator} freightControls={marketFreightControls} /></React.Suspense>
              {visibleWorld.caravanRestitution.lots.length > 0 &&
                <React.Suspense fallback={null}><CaravanRestitutionPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense>}
            </div>
            : <p className="text-xs text-slate-300">从人物名册选择实际修士后查看坊市。</p> },
          { id: 'villages', label: '凡人村镇与赈济', content: <div className="space-y-2.5">
            <React.Suspense fallback={<p role="status">载入世界记录…</p>}><MortalVillagesPanel world={visibleWorld} cultivator={selectedCultivator} shelterControls={disasterShelterControls} memorialControls={memorialControls} /></React.Suspense>
            {selectedCultivator && selectedSettlementId &&
              <>
                <React.Suspense fallback={null}><HouseholdNamePanel world={visibleWorld} cultivator={selectedCultivator} settlementId={selectedSettlementId} /></React.Suspense>
                <React.Suspense fallback={null}><VillageGranaryPanel world={visibleWorld} cultivator={selectedCultivator} settlementId={selectedSettlementId} /></React.Suspense>
              </>}
          </div> },
          { id: 'occasions', label: '比武与秘境盛会', content: selectedCultivator
            ? <React.Suspense fallback={<p role="status">载入盛会记录…</p>}><WorldOccasionsPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense>
            : <p className="text-xs text-slate-300">从人物名册选择实际修士后查看盛会。</p> },
          { id: 'bounties', label: '天机悬赏榜', content: <React.Suspense fallback={<p role="status">载入悬赏榜…</p>}><BountyBoard world={visibleWorld} /></React.Suspense> },
          { id: 'analytics', label: '天道观测与演化统计', content: <button type="button" onClick={() => setAnalyticsOpen(true)}
            className={`${action} bg-sky-900/60 text-sky-100 hover:bg-sky-800`}><BarChart3 aria-hidden="true" className="h-4 w-4" />打开天道观测</button> },
          ...(preview ? [] : [
            { id: 'god', label: '天道干预与模型设置', content: <div className="space-y-2.5">
              <React.Suspense fallback={<p role="status">载入模型状态…</p>}><LlmTelemetryPanel scheduler={llmScheduler}
                coverage={fairModelCoverage}
                configured={llmConfig.enabled} hasCredential={Boolean(llmConfig.apiKey.trim())} model={llmConfig.model || 'gpt-4o-mini'} /></React.Suspense>
              <React.Suspense fallback={<p role="status">载入天道控制台…</p>}><GodConsole world={world} selectedCultivatorId={activeActorId} llmConfig={llmConfig}
                onUpdateLLMConfig={changeLlmConfig} onIntervene={handleGodIntervene} /></React.Suspense>
            </div> },
            { id: 'scenario', label: '剧本编辑与复演', content: <React.Suspense fallback={<p role="status">载入剧本编辑器…</p>}>
              <ScenarioPanel world={world} busy={isStepping} onApply={replaceWorld} authoredEra={authoredEra} />
            </React.Suspense> },
            { id: 'settings', label: '存档、世界种子与推演速度', content: <div className="space-y-2.5">
              <div className={`${panel} flex flex-wrap items-center gap-x-2 gap-y-1.5`}>
                <label htmlFor="world-tick-interval" className="text-xs font-semibold">推演速度</label>
                <select id="world-tick-interval" value={tickIntervalMs} onChange={(e) => setTickIntervalMs(Number(e.target.value))}
                  className="min-h-11 max-w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100">
                  <option value={2500}>慢速 (2.5 秒/月)</option><option value={1500}>标准 (1.5 秒/月)</option><option value={600}>极速 (0.6 秒/月)</option>
                </select>
                <label htmlFor="one-hand-control" className="text-xs font-semibold">单手操作</label>
                <select id="one-hand-control" value={handedness} onChange={(event) => changeHandedness(event.currentTarget.value)}
                  aria-describedby="one-hand-control-help"
                  className="min-h-11 max-w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-base text-slate-100 sm:text-sm">
                  <option value="default">默认布局</option><option value="left">左手靠左</option><option value="right">右手靠右</option>
                </select>
                <p id="one-hand-control-help" className="sr-only">仅将窄屏的推演、返回和地图工具移到同一侧。本机保存；不改变人物、分支或键盘顺序。</p>
                <button type="button" disabled={isStepping} onClick={handleReset} className={`${action} bg-slate-800 text-slate-200 hover:bg-slate-700`}>
                  <RotateCcw aria-hidden="true" className="h-4 w-4" />重置修仙纪元</button>
              </div>
              <React.Suspense fallback={null}><RegionalSimulationPanel {...regionalControls}/></React.Suspense>
              <React.Suspense fallback={<p role="status">载入存档管理…</p>}>
                <WorldStoragePanel world={world} busy={isStepping} eraBlocked={fastForwardLocked || isRunning} canUseEraContext={(candidate,version)=>!fastForwardRun.current && canUseSaveContext(candidate,version)} contextVersion={saveContextVersion.current}
                  canUseContext={canUseSaveContext} sourceBranch={sourceBranch} timeline={timeline}
                  onArchiveNarrative={archiveCurrentNarrative} onRestore={replaceWorld} onNewWorld={newWorldFromSeed} />
              </React.Suspense>
            </div> },
          ]),
        ]} />,
      }} />
      {analyticsOpen && <React.Suspense fallback={<span role="status">载入天道观测…</span>}>
        <AnalyticsModal world={visibleWorld} history={visibleHistory} open onClose={() => setAnalyticsOpen(false)} />
      </React.Suspense>}
      {councilOpenedBefore && <React.Suspense fallback={<span role="status">载入议事厅…</span>}><SectCouncilModal
        world={world}
        open={councilOpen && !preview}
        busy={isStepping}
        onClose={() => setCouncilOpen(false)}
        onConvene={(plan) => void handleConveneCouncil(plan)}
        notice={!isStepping && lastManualCouncilId && !world.councils.some((record) => record.id === lastManualCouncilId)
          ? '世界已发生变化，本次议事未结算。' : undefined}
      /></React.Suspense>}
    </div>
  );
};

export default App;
