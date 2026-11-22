import { useDungeonStoryFork } from './components/useDungeonStoryFork';
import {projectScopedPublicChronicle,projectScopedPersonalChronicle,projectScopedCausalChronicle} from './components/scopedChronicleRead';
import {MapSidebarDossier} from './components/MapSidebarDossier';
import {projectMapSidebarDossier} from './components/mapSidebarDossierModel';
import type {MapDossierFocusRequest} from './components/mapDossierFocus';
import {useCultivatorGuidancePanels} from './components/useCultivatorGuidancePanels';
import {CultivatorInspectorBridge} from './components/CultivatorInspectorBridge';
import {HighDramaPresetPicker} from './components/HighDramaPresetPicker';
import {useHighDramaOpening} from './components/useHighDramaOpening';
import {useRingAudienceControls} from './components/useRingAudienceControls';
import {DeferredGrandSiegeMapScene} from './components/DeferredGrandSiegeMapScene';
import {useAuthoredEraLaunch} from './components/useAuthoredEraLaunch';
import { activeAvatar } from './engine/avatarEngine';
import {ProtagonistFlightScene} from './components/ProtagonistFlightScene';
import {resolveProtagonistFlightViewer,useProtagonistFlightScene} from './components/useProtagonistFlightScene';
import { StoryFirstHome } from './components/StoryFirstHome';
import {useFeaturedStoryDecision} from './components/useFeaturedStoryDecision';
import { PlayerStoryEntry } from './components/PlayerStoryEntry';
import { enterStoryLead, enterStoryOpening, orderStoryAvatar, projectStoryPlayerRole, storyOrderOutcome } from './components/storyPlayerController';
import { CockpitModeSwitch, DesktopSandboxEntrance, PanoramicCockpitView } from './components/PanoramicCockpitView';
import { projectStoryHomepage } from './engine/storyHomepage';
import {ChronicleArchiveHub} from './components/hubs/ChronicleArchiveHub';
import {CivicWorldHub} from './components/hubs/CivicWorldHub';
import {SectAffairsHub} from './components/hubs/SectAffairsHub';
import {useTournamentBanquetScene} from './components/useTournamentBanquetScene';
import {useCivicRealmViews} from './components/hubs/useCivicRealmViews';
import { useWorldSimulationController } from './controllers/useWorldSimulationController';
import {findVisibleCampaignStopOption,visibleCampaignStopOptions} from './components/campaignStopOptions';
import { projectRosterFocalId, projectRosterStoryRead, resolveRosterStoryRead, sameRosterScene,
  type ActorRosterScene } from './components/rosterStoryRead';
import { applyWatchMutation } from './engine/watchlistEngine';
import type { WatchlistCommand, WatchlistMutationResult } from './engine/watchlistEngine';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, FastForward, Sparkles } from 'lucide-react';
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
import {WorldPulseBar} from './components/WorldPulseBar';
import {projectWorldPulse,type WorldPulseRisk} from './components/worldPulseModel';
import type {WorldPulseFocusRequest} from './components/mapPulseFocus';
import {applyScopedMapEntityIntervention,type MapEntityPopoverBinding} from './components/mapEntityPopoverWrite';
import type {MapEntityAction,MapEntityTarget} from './components/mapEntityPopoverModel';
import {createTerrainMapView} from './components/terrainMapView';
import { possessAvatar, queueAvatarOrder } from './engine/avatarEngine';
import {projectFrontierSupplyLinks} from './engine/frontierSupplyLinks';
import { resolveAvatarSnapshot } from './engine/avatarRuntime';
import { CHRONICLE_FOCUS_UNAVAILABLE, createChronicleFocusResolver } from './engine/chronicleFocusEngine';
import type { ChronicleFocusRequest } from './engine/chronicleFocusEngine';
import type { ChronicleCategoryFilter, ChronicleFeedPosition, ChronicleFeedReturn } from './components/ChronicleFeed';
import type { ChronicleReadingContext } from './engine/chronicleReadingMark';

const WorldMapCanvas = React.lazy(async () => ({ default: (await import('./components/WorldMapCanvas')).WorldMapCanvas }));
const MentorshipPanel = React.lazy(async () => ({ default: (await import('./components/MentorshipPanel')).MentorshipPanel }));
const ApprenticeCohortPanel = React.lazy(async () => ({ default: (await import('./components/ApprenticeCohortPanel')).ApprenticeCohortPanel }));
const SparringPanel = React.lazy(async () => ({ default: (await import('./components/SparringPanel')).SparringPanel }));
const ActorRoster = React.lazy(async () => ({ default: (await import('./components/ActorRoster')).ActorRoster }));
const RelationshipGraph = React.lazy(async () => ({ default: (await import('./components/RelationshipGraph')).RelationshipGraph }));
const PilgrimagePanel = React.lazy(async () => ({ default: (await import('./components/PilgrimagePanel')).PilgrimagePanel }));
const ChronicleFeed = React.lazy(async () => ({ default: (await import('./components/ChronicleFeed')).ChronicleFeed }));
const ExpeditionRescuePanel = React.lazy(async () => ({ default: (await import('./components/ExpeditionRescuePanel')).ExpeditionRescuePanel }));
const DecisionTracePanel = React.lazy(async () => ({ default: (await import('./components/DecisionTracePanel')).DecisionTracePanel }));
const PossessionPanel = React.lazy(async () => ({ default: (await import('./components/PossessionPanel')).PossessionPanel }));
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

export const App: React.FC<AppProps> = ({ initialWorkspace, initialSection, initialCockpit = false }) => {
  const [cockpitOpen,setCockpitOpen]=useState(initialCockpit);
  const [mapFog,setMapFog]=useState(false);
  const [pulseFocus,setPulseFocus]=useState<WorldPulseFocusRequest>();
  const [dossierFocus,setDossierFocus]=useState<MapDossierFocusRequest>();
  const pulseSerial=useRef(0);
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
  const simulation=useWorldSimulationController({
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

  const getAudience=useRingAudienceControls(simulation);
  const dramaticOpening=useHighDramaOpening(simulation,id=>{setSelectedCultivatorId(id);setStoryEntryOpen(false);});

  const {
    world,visibleWorld,authority,timeline,history,saveTimelineId,saveContextVersion,restoredReadingOrigin,
    viewEpoch,viewScopeKey,preview,browsing,activateTimeline,restoreHistoricalFrame,clearPreview,
    updateWorld,
    isRunning,setIsRunning,isStepping,stepInFlight,tryBeginInteraction,endInteraction,
    llmConfig,handleStepTick,toggleAutoplay,compareDecision,
    handleTimelinePreview,
    fastForwardRun,campaignGuard,fastForwardLocked,
    campaign,
  }=simulation;

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

  const visibleHistory = timeline.branches.find(({ id }) => id === timeline.activeBranchId)?.snapshots;
  const previousMapWorld=visibleHistory?.find(frame=>frame.tick===visibleWorld.tick-1)?.world;
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
  const publicRead=useMemo(()=>showingChronicle?projectScopedPublicChronicle(visibleWorld):undefined,[showingChronicle,visibleWorld]);
  const selectedCultivator = resolveWorkspaceActor(visibleWorld, selectedCultivatorId);
  const campaignStopOptions=useMemo(()=>readingChronicle&&campaign.available&&!preview?
    visibleCampaignStopOptions(visibleWorld,selectedCultivator):[],[readingChronicle,campaign.available,preview,visibleWorld,selectedCultivator]);
  const campaignSelectedStop=campaign.active&&campaign.record?.stopCondition?{
    condition:campaign.record.stopCondition,label:findVisibleCampaignStopOption(campaignStopOptions,campaign.record.stopCondition)?.label,
  }:undefined;
  const aliveCount = visibleWorld.cultivators.filter((c) => c.alive).length;
  const activeActorId = selectedCultivator?.id ?? null;
  const guidance=useCultivatorGuidancePanels(simulation,selectedCultivator,{
    fog:mapFog,story:cockpitOpen||!dashboardOpen&&!storyEntryOpen,dossier:cockpitOpen||dashboardOpen&&workspace==='people',
    showPilgrimage:dashboardOpen&&workspace==='people'&&foldPreferences.sections.people==='pilgrimage',
    onClearAvatarNotice:()=>setAvatarNotice(undefined),
  });
  const {card:featuredStoryCard,pending:storyDecisionPending}=useFeaturedStoryDecision(simulation);
  const dungeonFork=useDungeonStoryFork(simulation,!dashboardOpen&&!cockpitOpen&&!storyEntryOpen,selectedCultivator);
  const flight=useProtagonistFlightScene(simulation,
    resolveProtagonistFlightViewer(visibleWorld,cockpitOpen||dashboardOpen,selectedCultivator));
  const flightPlace=(id:string)=>visibleWorld.locations.find(site=>site.id===id)?.name;
  const flightRoad=(id:string)=>{
    const road=visibleWorld.roads.links.find(row=>row.id===id);
    if(!road)return undefined;
    const left=flightPlace(road.anchorSiteId),right=flightPlace(road.otherSiteId);
    return left&&right?`${left}至${right}`:undefined;
  };
  const flightCard=flight.view&&<ProtagonistFlightScene key={`${viewScopeKey}:${flight.view.id}`} view={flight.view}
    controls={flight.controls} options={flight.options} placeName={flightPlace} roadName={flightRoad}/>;
  const toggleStoryAutoplay=()=>{if(!storyDecisionPending||isRunning)toggleAutoplay();};
  const worldPulse=useMemo(()=>dashboardOpen||cockpitOpen?projectWorldPulse(visibleWorld,activeActorId,mapFog):undefined,
    [dashboardOpen,cockpitOpen,visibleWorld,activeActorId,mapFog]);
  const inspectionRevision=saveContextVersion.current;
  const canInspectMap=cockpitOpen||dashboardOpen&&workspace==='map';
  const canMapWrite=canInspectMap&&!mapFog&&!preview&&!isRunning&&!isStepping&&!fastForwardLocked;
  const handleMapEntityIntervention=(binding:MapEntityPopoverBinding,action:MapEntityAction,whisperText?:string)=>{
    const starting=authority.current;
    return updateWorld(current=>applyScopedMapEntityIntervention({
      world:current,scopeKey:viewScopeKey,revision:saveContextVersion.current,viewerId:activeActorId,
      canWrite:canMapWrite&&current===world&&history.current===timeline&&!browsing.current&&
        !stepInFlight.current&&!fastForwardRun.current&&!campaignGuard.current,
    },binding,action,whisperText))!==starting;
  };

  const mapDossier=useMemo(()=>dashboardOpen&&workspace==='map'?projectMapSidebarDossier(visibleWorld,selectedCultivator,
    createTerrainMapView(visibleWorld,selectedCultivator,mapFog),!preview):undefined,
    [dashboardOpen,workspace,visibleWorld,selectedCultivator,mapFog,preview]);
  const actFromMapDossier=(target:MapEntityTarget,move:MapEntityAction,text?:string)=>{
    if(!canMapWrite||!mapDossier?.actions.some(row=>row.action===move&&row.target.id===target.id&&row.target.kind===target.kind))return false;
    return handleMapEntityIntervention({world:visibleWorld,scopeKey:viewScopeKey,revision:inspectionRevision,
      viewerId:activeActorId,fog:mapFog,target},move,text);
  };

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
  const personalStory=useMemo(()=>readingChronicle&&personalStoryActive?
    projectScopedPersonalChronicle(visibleWorld,selectedCultivator,selectedRosterEvent):undefined,
    [readingChronicle,personalStoryActive,selectedCultivator,selectedRosterEvent,visibleWorld]);
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
  const chronicleCauses=useMemo(()=>workspace==='chronicle'?projectScopedCausalChronicle(visibleWorld,activeActorId):undefined,
    [visibleWorld,activeActorId,workspace]);
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
  const {card:banquetCard,story:banquetStory}=useTournamentBanquetScene(visibleWorld,viewScopeKey,
    cockpitOpen||!dashboardOpen&&!storyEntryOpen||dashboardOpen&&workspace==='world',Boolean(preview));
  const {immersive,atlasExtras,passageScene}=useCivicRealmViews({
    simulation,selectedCultivator,cockpitOpen,dashboardOpen,storyEntryOpen,workspace,onSelectCultivator:setSelectedCultivatorId,
    onClearAvatarNotice:()=>setAvatarNotice(undefined),
  });
  const inspect=(section:'profile'|'cultivation'|'mind')=><CultivatorInspectorBridge world={visibleWorld}
    cultivator={selectedCultivator} onSelectCultivator={setSelectedCultivatorId} section={section} panels={guidance.inspector}/>;
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
  const storyWorkspaceCurrent=()=>!dashboardOpen&&!cockpitOpen&&!stepInFlight.current&&!browsing.current&&
    !fastForwardRun.current&&!campaignGuard.current&&history.current===timeline&&authority.current===world&&
    saveContextVersion.current===storyEntryRevision;
  const storyEntryCurrent=()=>storyEntryOpen&&storyWorkspaceCurrent();
  const openStoryEntry=()=>{
    if(dashboardOpen||stepInFlight.current||browsing.current||fastForwardRun.current||campaignGuard.current)return;
    setStoryNotice(undefined);
    setStoryEntryOpen(true);
  };
  const openDashboard=()=>{
    if(!storyWorkspaceCurrent())return;
    setIsRunning(false);
    setStoryEntryOpen(false);
    setDashboardOpen(true);
  };
  const enterCurrentLead=()=>{
    const lead=storyHome?.lead;
    return storyEntryCurrent()&&updateWorld(current=>lead?enterStoryLead(current,lead):enterStoryOpening(current))!==world;
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
    if (storyDecisionPending || dashboardOpen || storyEntryOpen || stepInFlight.current || browsing.current || fastForwardRun.current||campaignGuard.current) return;
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
  const focusWorldPulse=(risk:WorldPulseRisk)=>{
    const current=browsing.current?preview?.world:authority.current;
    if(!worldPulse||immersive||current!==visibleWorld||history.current!==timeline||!worldPulse.risks.includes(risk))return;
    if(!cockpitOpen)openWorkspace('map');
    setPulseFocus({world:visibleWorld,scopeKey:viewScopeKey,viewerId:activeActorId,fog:mapFog,riskId:risk.id,token:++pulseSerial.current});
  };
  const clearWorldPulse=(token:number)=>setPulseFocus(current=>current?.token===token?undefined:current);
  const pulseStrip=worldPulse&&<WorldPulseBar view={worldPulse} historical={Boolean(preview)}
    canFocus={!immersive} onFocusAlert={focusWorldPulse}/>;
  if(cockpitOpen)return <PanoramicCockpitView world={visibleWorld} titleRef={cockpitHeading} exit={cockpitSwitch} statusStrip={pulseStrip} stageOverride={featuredStoryCard} subplot={guidance.subplot} branchScene={flightCard??passageScene??banquetStory}
    time={{historical:Boolean(preview),running:isRunning,busy:cockpitBusy||storyDecisionPending,onStep:()=>void handleStepTick(),
      onToggleAutoplay:toggleStoryAutoplay,onReturnLive:()=>handleTimelinePreview(null),onOpenTimeline:()=>{
        openWorkspace('chronicle');rememberFold('chronicle','timeline');setStoryEntryOpen(false);
        setDashboardOpen(true);setCockpitOpen(false);
      }}}
    map={immersive??
      <React.Suspense fallback={<p role="status">载入舆图…</p>}>
        <WorldMapCanvas compact scopeKey={viewScopeKey} world={visibleWorld} selectedCultivatorId={activeActorId} previousWorld={previousMapWorld} historical={Boolean(preview)}
          inspectionEnabled={canInspectMap} inspectionRevision={inspectionRevision} onEntityIntervention={canMapWrite?handleMapEntityIntervention:undefined}
          fogEnabled={mapFog} onFogChange={setMapFog} pulseFocus={pulseFocus} pulseFocusActive={canInspectMap}
          onPulseFocusHandled={clearWorldPulse}
          onSelectCultivator={setSelectedCultivatorId} onBrushStroke={preview?undefined:handleBrushStroke}/>
        <DeferredGrandSiegeMapScene world={visibleWorld} viewer={selectedCultivator} fog={mapFog} witnessScopeKey={viewScopeKey} visible={!featuredStoryCard}/>
      </React.Suspense>}
    inspector={<>{inspect('profile')}{inspect('mind')}</>}
    relationships={<React.Suspense fallback={<p role="status">载入关系图…</p>}>
      <RelationshipGraph key={viewScopeKey} world={visibleWorld} selectedCultivatorId={activeActorId}
        onSelectCultivator={setSelectedCultivatorId}/>
    </React.Suspense>}
    chronicle={<React.Suspense fallback={<p role="status">载入纪事…</p>}>
      <ChronicleFeed events={publicRead?.events??[]} lead={publicRead?.lead} succession={publicRead?.succession}
        resolvePublicDialogue={publicRead?.dialogue.event} category={chronicleFilter} onCategoryChange={setChronicleFilter}/>
    </React.Suspense>}/>;

  if (storyHome) return <main data-story-home data-story-turn={storyHome.calendar.tick} className="min-h-dvh bg-slate-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
    <div className="mx-auto flex max-w-[76rem] flex-wrap justify-end gap-2 px-4 empty:hidden">
      {cockpitSwitch}
      {!storyEntryOpen&&<DesktopSandboxEntrance onOpen={openDashboard} disabled={isStepping||fastForwardLocked}/>}
    </div>
    {featuredStoryCard??(storyEntryOpen?<PlayerStoryEntry titleRef={storyEntryHeading} role={projectStoryPlayerRole(world,storyHome.lead)}
      revision={world} busy={isStepping||fastForwardLocked} onBack={()=>setStoryEntryOpen(false)} onTools={openDashboard}
      openings={<HighDramaPresetPicker scopeKey={viewScopeKey} revision={world} disabled={dramaticOpening.disabled} onStart={dramaticOpening.start}/>}
      onFollow={storyHome.lead?followCurrentLead:undefined} onEnter={enterCurrentLead} onOrder={orderCurrentStoryAvatar} />:
      <StoryFirstHome recapContext={world.chronicleArchive.chapters.length||world.coldHistory?.chapters.length?
        {world,scopeKey:viewScopeKey,viewer:activeAvatar(world)}:undefined} scene={storyHome.scene} subplot={guidance.subplot} branchScene={dungeonFork??flightCard??passageScene??banquetStory??<DeferredGrandSiegeMapScene world={world} viewer={activeAvatar(world)} fog personalOnly visible witnessScopeKey={viewScopeKey}/>} leadName={storyHome.lead?.name} playerName={activeAvatar(world)?.name}
        busy={isStepping} moreRef={storyMoreRef} notice={storyNotice} calendar={storyHome.calendar} opening={dramaticOpening.opening}
        outcome={storyOutcome?.world===world?storyOutcome.text:undefined} onContinue={advanceStory} onMore={openStoryEntry} />)}
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
                <button type="button" disabled={fastForwardLocked||storyDecisionPending&&!isRunning} onClick={toggleStoryAutoplay}
                  className={`${action} ${isRunning ? 'bg-amber-500 text-slate-950' :
                    handedness === 'default' ? 'max-sm:hidden bg-emerald-500 text-slate-950' : 'bg-slate-800 text-emerald-100 sm:bg-emerald-500 sm:text-slate-950'}`}>
                  {isRunning ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
                  {isRunning ? '暂停推演' : '自动推演'}
                </button>
                <button type="button" disabled={isStepping || fastForwardLocked || storyDecisionPending} onClick={() => void handleStepTick()}
                  className={`${action} ${isRunning ? 'max-sm:hidden bg-slate-800 text-slate-100' : 'bg-emerald-500 text-slate-950'}`}>
                  <FastForward aria-hidden="true" className="h-4 w-4" />{isStepping ? '推演中…' : '单步推演'}
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      {pulseStrip&&<div className="mx-auto w-full max-w-[76rem] px-2.5 pt-2 sm:px-4">{pulseStrip}</div>}

      {(featuredStoryCard??flightCard??passageScene)&&<div className="mx-auto w-full max-w-2xl px-3 pt-3">{featuredStoryCard??flightCard??passageScene}</div>}
      <SandboxWorkspace active={workspace} onChange={openWorkspace} autoFocusTab={!(trail || chronicleReturn)}
        hideActiveContent={Boolean(trail && !focusTarget)} panelLead={trail && <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
          <button type="button" data-control-dock="back" ref={backRef} onClick={returnToChronicle} className={`${action} bg-slate-800 text-amber-100`}>返回原纪事</button>
          {!focusTarget && <p role="status" className="break-words text-xs text-amber-200">{CHRONICLE_FOCUS_UNAVAILABLE}</p>}
        </div>} views={{
        map: immersive??<div className="grid min-w-0 items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_23rem] lg:gap-4">
          <div className="min-w-0"><React.Suspense fallback={<div role="status" className="grid min-h-64 place-items-center rounded-xl border border-slate-800 text-sm text-slate-300">载入舆图…</div>}>
            <WorldMapCanvas compact scopeKey={viewScopeKey} world={visibleWorld} selectedCultivatorId={activeActorId} previousWorld={previousMapWorld} historical={Boolean(preview)}
          inspectionEnabled={canInspectMap} inspectionRevision={inspectionRevision} onEntityIntervention={canMapWrite?handleMapEntityIntervention:undefined}
          fogEnabled={mapFog} onFogChange={setMapFog} pulseFocus={pulseFocus} pulseFocusActive={canInspectMap}
          onPulseFocusHandled={clearWorldPulse} dossierFocus={dossierFocus}
            toolsOpen={workspace === 'map' && (foldPreferences.mapTools ?? false)} onToolsOpenChange={(mapTools) =>
              setFoldPreferences((previous) => (previous.mapTools ?? false) === mapTools ? previous : { ...previous, mapTools })}
            additionalTools={handedness === 'default' && !preview && !isRunning ? <button type="button" disabled={fastForwardLocked||storyDecisionPending&&!isRunning} onClick={toggleStoryAutoplay}
              className={`${action} bg-slate-800 text-emerald-100 sm:hidden`}><Play aria-hidden="true" className="h-4 w-4" />自动推演</button> : undefined}
            chronicleFocus={trail?.request.kind === 'site' && focusTarget ? trail : undefined} onChronicleFocusUnavailable={reportMapFocusFailure}
            onSelectCultivator={setSelectedCultivatorId} onBrushStroke={preview ? undefined : handleBrushStroke} />
            <DeferredGrandSiegeMapScene world={visibleWorld} viewer={selectedCultivator} fog={mapFog} witnessScopeKey={viewScopeKey}
              visible={workspace==='map'&&!featuredStoryCard}/>
          </React.Suspense></div>
          {mapDossier&&<MapSidebarDossier key={`${viewScopeKey}:${inspectionRevision}:${activeActorId}:${visibleWorld.tick}:${visibleWorld.interventionSequence}:${mapFog}`}
            data={mapDossier} onReadActor={mapDossier.actor?()=>openWorkspace('people'):undefined}
            onFocus={mapDossier.actor?()=>setDossierFocus({world:visibleWorld,scopeKey:viewScopeKey,revision:inspectionRevision,
              fog:mapFog,actorId:mapDossier.actor!.target.id}):undefined}
            onCommit={canMapWrite?actFromMapDossier:undefined}/>}
        </div>,
        people: <div className="grid min-w-0 items-start gap-3 md:grid-cols-[17rem_minmax(0,1fr)]">
          <React.Suspense fallback={<p role="status">载入修士名册…</p>}><ActorRoster world={visibleWorld} selected={selectedCultivator} dismissOnSelect onSelect={selectRosterActor}
            scopeKey={viewScopeKey} focalId={rosterFocalId} scene={rosterStoryStamp?.scene} onReadScene={openRosterStoryScene}
            desktopOpen={foldPreferences.rosterDesktop} onDesktopOpenChange={(rosterDesktop)=>
              setFoldPreferences(previous=>previous.rosterDesktop===rosterDesktop?previous:{...previous,rosterDesktop})}/></React.Suspense>
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
                <PilgrimagePanel world={visibleWorld} cultivator={selectedCultivator} mealControls={guidance.waypostMealControls} />
              </React.Suspense>,
            }] : []),
            { id: 'trace', label: '天机溯因与单回合复盘', content: <React.Suspense fallback={<p role="status">载入决策纪要…</p>}>
              <DecisionTracePanel world={visibleWorld} cultivator={selectedCultivator} busy={isStepping} historical={!!preview} onReplay={compareDecision} />
            </React.Suspense> },
            ...(preview ? [] : [{ id: 'possession', label: '化身临世与古戒', content: <React.Suspense fallback={<p role="status">载入化身面板…</p>}>
              {canReturnEraEntry && <button type="button" disabled={isStepping||fastForwardLocked} onClick={returnEraEntry}
                className={`${action} bg-slate-800 text-amber-100`}>返回入世前的年代</button>}
              <PossessionPanel world={world} selectedCultivatorId={activeActorId} busy={isStepping}
                audience={getAudience('ring',activeActorId??undefined)} audienceScope={viewScopeKey}
                modelReady={llmConfig.enabled && Boolean(llmConfig.apiKey.trim())} notice={avatarNotice}
                onPossess={handlePossess} onOrder={handleAvatarOrder} onSpeak={(request) => void handleAvatarSpeak(request)} />
            </React.Suspense> }]),
          ]} />
        </div>,
        chronicle:<ChronicleArchiveHub simulation={simulation} selectedCultivator={selectedCultivator}
          active={readingChronicle} initialOpen={opened('chronicle','feed')} {...fold('chronicle')}
          feed={{events:publicRead?.events??[],lead:publicRead?.lead,succession:publicRead?.succession,resolvePublicDialogue:publicRead?.dialogue.event,
            category:chronicleFilter,onCategoryChange:setChronicleFilter,focusOptions:resolver?.build,
            causality:eventId=>chronicleCauses?.get(eventId),
            reading:readingContext&&!chronicleReturn?{context:readingContext,saveOrigin:readingSaveOrigin,
              scopeKey:`${viewScopeKey}:${activeActorId??''}`,
              isCurrent:()=>saveContextVersion.current===readingRevision&&history.current.activeBranchId===timeline.activeBranchId&&
                (preview?browsing.current:!browsing.current&&authority.current===world)}:undefined,
            onJump:followChronicle,returnPosition:chronicleReturn,onReturnHandled:clearChronicleReturn,focusNotice}}
          personal={selectedCultivator?{available:mayReadPersonal,active:personalStoryActive,story:personalStory,focusEventId:selectedRosterEvent,
            onToggle:()=>setPersonalStoryChoice(personalStoryActive?undefined:{actorId:selectedCultivator.id,scope:viewScopeKey})}:undefined}
          scopedSupplyLinks={scopedSupplyLinks} writeAnnotation={writeAnnotation} writeWatchlist={writeWatchlist}
          eraEntry={eraFrame?{date:visibleWorld,scopeKey:`${viewScopeKey}:${activeActorId??''}`,snapshotKey:eraFrame,
            sites:eraEntrySites,readCandidates:siteId=>projectEraEntryCandidates(visibleWorld,siteId,activeActorId??undefined),
            disabled:isStepping||fastForwardLocked,canPossess:!preview||timeline.branches.length<TIMELINE_MAX_BRANCHES,
            historical:Boolean(preview),notice:eraEntryNotice?.scope===viewScopeKey?eraEntryNotice.text:undefined,
            onObserve:eraObserve,onFollow:eraFollow,onPossess:eraPossess}:undefined}
          campaignStopOptions={campaignStopOptions} campaignSelectedStop={campaignSelectedStop}/>,
        sect:<SectAffairsHub simulation={simulation} active={dashboardOpen&&workspace==='sect'}
          selectedCultivator={selectedCultivator} onSelectCultivator={setSelectedCultivatorId} focusSect={focusSect}
          initialOpen={opened('sect','governance')} {...fold('sect')}
          onCouncil={()=>{setCouncilOpenedBefore(true);setCouncilOpen(true);}}/>,
        world:immersive??<CivicWorldHub simulation={simulation} active={dashboardOpen&&workspace==='world'}
          selectedCultivator={selectedCultivator} atlasExtras={atlasExtras} banquetScene={banquetCard}
          audience={getAudience('heaven',activeActorId??undefined)}
          initialOpen={opened('world','weather')} {...fold('world')} authoredEra={authoredEra}
          handedness={handedness} onChangeHandedness={changeHandedness} onIntervene={handleGodIntervene}
          onAnalytics={()=>setAnalyticsOpen(true)}/>,
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
