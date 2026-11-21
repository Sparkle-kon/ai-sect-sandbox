import type { SaveBranchSource } from './engine/storageEngine';
import { courierCheckpoint } from './engine/sealedCourierEngine';
import { applyWatchMutation, captureWatchDigests } from './engine/watchlistEngine';
import type { WatchlistCommand, WatchlistMutationResult } from './engine/watchlistEngine';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, FastForward, RotateCcw, Sparkles, BarChart3 } from 'lucide-react';
import { createInitialWorld } from './data/initialWorld';
import {
  advanceWorldTick,
  executeGodIntervention,
  GodInterventionCommand,
} from './engine/worldEngine';
import { queryCultivatorLLMDecision } from './engine/llmBrain';
import { enrichAnnualReflections } from './engine/reflectionEngine';
import { enrichTickDialogues } from './engine/dialogueEngine';
import { activeSiegeForActor } from './engine/diplomacyEngine';
import { activeOccasionForActor } from './engine/occasionEngine';
import { visiblePilgrimages } from './engine/pilgrimageEngine';
import { applyMapBrush } from './engine/mapBrushEngine';
import { GodBrushKind, LLMConfig, LLMDecisionPayload, MapPoint, WorldEvent, WorldState } from './types/world';
import { SandboxWorkspace, WorkspaceSections } from './components/SandboxWorkspace';
import type { WorkspaceId } from './components/SandboxWorkspace';
import { annotationWriteIsCurrent } from './components/annotationUi';
import type { NotebookStamp, NoteCommand, NoteStatus } from './components/annotationUi';
import { WorldMapCanvas } from './components/WorldMapCanvas';
import { llmScheduler } from './engine/llmScheduler';
import { settleChronicleOnline } from './engine/chronicleRuntime';
import { availableCouncilPlans } from './engine/councilEngine';
import { commitCouncilSnapshot, settleAnnualCouncilOnline, settleCouncilSnapshot } from './engine/councilRuntime';
import type { AvatarInteractionRequest, CouncilPlan, WorldgenProfileId } from './types/world';
import { isWorldSeed } from './engine/worldRandom';
import { isWorldgenProfileId } from './engine/worldgenProfiles';
import { createDecisionReplayTape, replayOneTurn } from './engine/decisionTraceEngine';
import type { DecisionReplayTape, DecisionReplayResult } from './engine/decisionTraceEngine';
import { createTimeline, forkTimeline, readTimelineHead, readTimelineSnapshot, recordTimelineWorld, selectTimelineBranch } from './engine/timelineEngine';
import type { WorldTimeline } from './engine/timelineEngine';
import { activeAvatar, possessAvatar, queueAvatarOrder } from './engine/avatarEngine';
import { resolveAvatarSnapshot } from './engine/avatarRuntime';

const AgentInspector = React.lazy(async () => ({ default: (await import('./components/AgentInspector')).AgentInspector }));
const AttestationPanel = React.lazy(async () => ({ default: (await import('./components/AttestationPanel')).AttestationPanel }));
const OathContractsPanel = React.lazy(async () => ({ default: (await import('./components/OathContractsPanel')).OathContractsPanel }));
const MentorshipPanel = React.lazy(async () => ({ default: (await import('./components/MentorshipPanel')).MentorshipPanel }));
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
const ChronicleLibraryPanel = React.lazy(async () => ({ default: (await import('./components/ChronicleLibraryPanel')).ChronicleLibraryPanel }));
const WorldOccasionsPanel = React.lazy(async () => ({ default: (await import('./components/WorldOccasionsPanel')).WorldOccasionsPanel }));
const WeatherAtlasPanel = React.lazy(async () => ({ default: (await import('./components/WeatherAtlasPanel')).WeatherAtlasPanel }));
const MarketCaravansPanel = React.lazy(async () => ({ default: (await import('./components/MarketCaravansPanel')).MarketCaravansPanel }));
const MortalVillagesPanel = React.lazy(async () => ({ default: (await import('./components/MortalVillagesPanel')).MortalVillagesPanel }));
const DecisionTracePanel = React.lazy(async () => ({ default: (await import('./components/DecisionTracePanel')).DecisionTracePanel }));
const PossessionPanel = React.lazy(async () => ({ default: (await import('./components/PossessionPanel')).PossessionPanel }));
const EstateMemorialPanel = React.lazy(async () => ({ default: (await import('./components/EstateMemorialPanel')).EstateMemorialPanel }));
const ScenarioPanel = React.lazy(async () => ({ default: (await import('./components/ScenarioPanel')).ScenarioPanel }));
const WorldStoragePanel = React.lazy(async () => ({ default: (await import('./components/WorldStoragePanel')).WorldStoragePanel }));
const SectCouncilModal = React.lazy(async () => ({ default: (await import('./components/SectCouncilModal')).SectCouncilModal }));
const AnalyticsModal = React.lazy(async () => ({ default: (await import('./components/AnalyticsModal')).AnalyticsModal }));

interface AppProps { initialWorkspace?: WorkspaceId; initialSection?: string }
const saveTimelineIdentity = (): string | undefined => {
  try { return globalThis.crypto?.randomUUID?.(); }
  catch { return undefined; }
};
const action = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40';
const panel = 'space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-3';

export const App: React.FC<AppProps> = ({ initialWorkspace = 'map', initialSection }) => {
  const [workspace, setWorkspace] = useState<WorkspaceId>(initialWorkspace);
  const [world, setWorld] = useState<WorldState>(() => createInitialWorld());
  const [viewEpoch, setViewEpoch] = useState(0);
  const saveContextVersion = useRef(0);
  const [saveTimelineId, setSaveTimelineId] = useState(saveTimelineIdentity);
  const authority = useRef(world);
  const [timeline, setTimeline] = useState(() => createTimeline(world));
  const history = useRef(timeline);
  const replayTapes = useRef(new Map<string, Map<number, { tape: DecisionReplayTape; committed: WorldState }>>());
  const retainReplay = useCallback((branchId: string, tape: DecisionReplayTape, committed: WorldState) => {
    const byTick = replayTapes.current.get(branchId) ?? new Map<number, { tape: DecisionReplayTape; committed: WorldState }>();
    byTick.set(committed.tick, { tape, committed });
    while (byTick.size > 12) {
      const oldest = byTick.keys().next().value;
      if (oldest === undefined) break;
      byTick.delete(oldest);
    }
    replayTapes.current.set(branchId, byTick);
  }, []);
  const [preview, setPreview] = useState<{ tick: number; world: WorldState }>();
  const browsing = useRef(false);
  const [timelineNotice, setTimelineNotice] = useState<string>();
  const updateTimeline = useCallback((next: WorldTimeline) => {
    history.current = next;
    setTimeline(next);
  }, []);
  const updateWorld = useCallback((change: (current: WorldState) => WorldState, record = true) => {
    const current = authority.current;
    const next = change(current);
    if (next !== current) {
      authority.current = next;
      if (record) updateTimeline(recordTimelineWorld(history.current, next));
      setWorld(next);
    }
    return next;
  }, [updateTimeline]);
  const [selectedCultivatorId, setSelectedCultivatorId] = useState<
    string | null
  >('npc-1');
  const [isRunning, setIsRunning] = useState(false);
  const [isStepping, setIsStepping] = useState(false);
  const stepInFlight = useRef(false);
  const [councilOpen, setCouncilOpen] = useState(false);
  const [councilOpenedBefore, setCouncilOpenedBefore] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState<string>();
  const [lastManualCouncilId, setLastManualCouncilId] = useState<string>();
  const [tickIntervalMs, setTickIntervalMs] = useState(1500);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    enabled: false,
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  });

  const handleStepTick = useCallback(async () => {
    if (stepInFlight.current || browsing.current) return;
    stepInFlight.current = true;
    setIsStepping(true);
    try {
      const starting = authority.current;
      const branchId = history.current.activeBranchId;
      if (llmConfig.enabled && llmConfig.apiKey.trim()) {
        llmScheduler.beginTick(starting.tick + 1);
        const activeHost = activeAvatar(starting);
        const orderedActorId = activeHost && starting.playerAvatar.pendingOrder?.actorId === activeHost.id ? activeHost.id : undefined;
        const alive = starting.cultivators.filter((c) => c.alive && c.id !== orderedActorId && !activeSiegeForActor(starting, c) && !activeOccasionForActor(starting, c));
        const modelActors = new Set<string>();
        const results = await Promise.all(
          alive.map(async (c) => {
            const dec = await queryCultivatorLLMDecision(c, starting, llmConfig, (source) => {
              if (source === 'llm') modelActors.add(c.id);
              else llmScheduler.markDecision('local_fallback');
            }, starting.tick + 1);
            return [c.id, dec] as const;
          })
        );
        llmScheduler.markDecision('validated', modelActors.size);
        if (authority.current !== starting) {
          llmScheduler.markDecision('stale', modelActors.size);
          return;
        }
        const decisions: Record<string, LLMDecisionPayload> = Object.fromEntries(results);
        const applied = new Set<string>();
        const tape = createDecisionReplayTape(starting, 'deferred');
        let canonicalWatchBatch: readonly WorldEvent[] = [];
        const tick = advanceWorldTick(starting, decisions, undefined, 'deferred', (id, effective) => {
          if (effective && modelActors.has(id)) applied.add(id);
        }, { tape, modelActors, onWatchBatch: (events) => { canonicalWatchBatch = events; } });
        const [reflected, dramatized] = await Promise.all([
          enrichAnnualReflections(tick, llmConfig), enrichTickDialogues(tick, llmConfig),
        ]);
        if (authority.current !== starting) {
          llmScheduler.markDecision('stale', modelActors.size);
          return;
        }
        const withCouncil = await settleAnnualCouncilOnline({ ...reflected, events: dramatized.events }, llmConfig);
        if (authority.current !== starting) {
          llmScheduler.markDecision('stale', modelActors.size);
          return;
        }
        const next = await settleChronicleOnline(withCouncil, llmConfig);
        if (next.watchlists.watches.length && authority.current === starting) {
          const beforeCouncil = new Set(dramatized.events.map(({ id }) => id));
          const endingCouncil = withCouncil.events.filter(({ id, tick: at }) => at === next.tick && !beforeCouncil.has(id));
          captureWatchDigests(next, [...canonicalWatchBatch, ...endingCouncil]);
        }
        if (updateWorld((current) => commitCouncilSnapshot(current, starting, next)) === next) {
          retainReplay(branchId, tape, next);
          llmScheduler.markDecision('applied', applied.size);
          llmScheduler.markDecision('simulation_rejected', modelActors.size - applied.size);
        } else {
          llmScheduler.markDecision('stale', modelActors.size);
        }
      } else {
        const tape = createDecisionReplayTape(starting, 'utility');
        const next = updateWorld((prev) => advanceWorldTick(prev, undefined, undefined, 'utility', undefined, { tape }));
        retainReplay(branchId, tape, next);
      }
    } finally {
      stepInFlight.current = false;
      setIsStepping(false);
    }
  }, [llmConfig, updateWorld, retainReplay]);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      void handleStepTick();
    }, tickIntervalMs);
    return () => clearInterval(timer);
  }, [isRunning, tickIntervalMs, handleStepTick]);

  const handleConveneCouncil = useCallback(async (plan: CouncilPlan) => {
    const starting = authority.current;
    if (stepInFlight.current || browsing.current || !availableCouncilPlans(starting, plan.sectId).some((item) => item.id === plan.id)) return;
    stepInFlight.current = true;
    setIsStepping(true);
    setLastManualCouncilId(plan.id);
    try {
      llmScheduler.beginTick(starting.tick);
      const next = await settleCouncilSnapshot(starting, plan, llmConfig);
      updateWorld((previous) => commitCouncilSnapshot(previous, starting, next));
    } finally {
      stepInFlight.current = false;
      setIsStepping(false);
    }
  }, [llmConfig, updateWorld]);

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
    if (stepInFlight.current || browsing.current) return;
    const current = authority.current;
    stepInFlight.current = true;
    setIsStepping(true);
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
      stepInFlight.current = false;
      setIsStepping(false);
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

  const clearPreview = () => {
    browsing.current = false;
    setPreview(undefined);
  };

  const activateTimeline = (next: WorldTimeline, incoming: WorldState) => {
    saveContextVersion.current += 1;
    setIsRunning(false);
    clearPreview();
    updateTimeline(next);
    updateWorld(() => incoming, false);
    llmScheduler.resetTickBudget();
    setSelectedCultivatorId(incoming.cultivators.find(({ alive }) => alive)?.id ?? incoming.cultivators[0]?.id ?? null);
    setLastManualCouncilId(undefined);
    setCouncilOpen(false);
    setAvatarNotice(undefined);
  };

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

  const canUseSaveContext = (expected: WorldState, contextVersion?: number): boolean =>
    !stepInFlight.current && !browsing.current && authority.current === expected &&
    (contextVersion === undefined || contextVersion === saveContextVersion.current);

  const replaceWorld = (next: WorldState, expected: WorldState, expectedContextVersion?: number): boolean => {
    if (!canUseSaveContext(expected, expectedContextVersion)) return false;
    replayTapes.current.clear();
    setSaveTimelineId(saveTimelineIdentity());
    setViewEpoch((previous) => previous + 1);
    activateTimeline(createTimeline(next), next);
    return true;
  };

  const newWorldFromSeed = (seed: number, profileId: WorldgenProfileId, expected: WorldState, expectedContextVersion?: number): boolean =>
    isWorldSeed(seed) && isWorldgenProfileId(profileId) && canUseSaveContext(expected, expectedContextVersion) &&
    replaceWorld(createInitialWorld(seed, profileId), expected, expectedContextVersion);

  const handleReset = () => {
    if (browsing.current) return;
    const active = authority.current;
    const next = createInitialWorld(active.random.seed, active.worldgen?.profileId ?? 'classic');
    replayTapes.current.clear();
    // Emergency reset invalidates an in-flight model tick, which cannot commit afterward.
    setSaveTimelineId(saveTimelineIdentity());
    setViewEpoch((previous) => previous + 1);
    activateTimeline(createTimeline(next), next);
  };

  const handleTimelinePreview = (tick: number | null) => {
    if (stepInFlight.current) return;
    setTimelineNotice(undefined);
    if (tick === null) { clearPreview(); return; }
    const snapshot = readTimelineSnapshot(history.current, tick);
    if (!snapshot) { setTimelineNotice('此快照不在当前分支保留的范围内。'); return; }
    setIsRunning(false);
    setCouncilOpen(false);
    saveContextVersion.current += 1;
    browsing.current = true;
    setPreview({ tick, world: snapshot });
  };

  const handleTimelineSelectBranch = (branchId: string) => {
    if (stepInFlight.current) return;
    setTimelineNotice(undefined);
    try {
      const next = selectTimelineBranch(history.current, branchId);
      const incoming = next.activeBranchId === branchId ? readTimelineHead(next) : undefined;
      if (incoming) activateTimeline(next, incoming);
      else setTimelineNotice('未找到这个分支，当前世界不变。');
    } catch {
      setTimelineNotice('未找到这个分支，当前世界不变。');
    }
  };

  const handleTimelineFork = (sourceBranchId: string, tick: number, command: GodInterventionCommand) => {
    if (stepInFlight.current || !browsing.current || preview?.tick !== tick || sourceBranchId !== history.current.activeBranchId) return;
    try {
      const next = forkTimeline(history.current, tick, command);
      const incoming = readTimelineSnapshot(next, tick);
      if (!incoming) throw new Error('无法读取分支首个快照。');
      activateTimeline(next, incoming);
      setTimelineNotice('已开启新分支并施加所选干预，原时间线完整保留。');
    } catch (error) {
      setTimelineNotice(error instanceof Error ? error.message : '分支未建立，当前世界不变。');
    }
  };

  const visibleWorld = preview?.world ?? world;
  const activeSaveBranch = timeline.branches.find(({ id }) => id === timeline.activeBranchId);
  const sourceBranch: SaveBranchSource | undefined = activeSaveBranch ? {
    branchId: activeSaveBranch.id, label: activeSaveBranch.label, ...(saveTimelineId ? { timelineId: saveTimelineId } : {}),
  } : undefined;
  const viewScopeKey = `${viewEpoch}:${timeline.activeBranchId}:${preview?.tick ?? 'live'}`;
  const compareDecision = (traceId: string, candidateId: string): DecisionReplayResult => {
    const trace = visibleWorld.decisionTrace.records.find(({ id }) => id === traceId);
    const saved = trace && replayTapes.current.get(history.current.activeBranchId)?.get(trace.tick);
    if (!saved) return { ok: false, reason: '原始决策快照不在本分支最近 12 轮的复演缓存中。' };
    return replayOneTurn(saved.tape, saved.committed, traceId, candidateId,
      (base, orders, mode, onActor, replayDraws) => advanceWorldTick(base, orders, undefined, mode, undefined, { captureTrace: false, onActor, replayDraws }));
  };
  const visibleHistory = timeline.branches.find(({ id }) => id === timeline.activeBranchId)?.snapshots;
  const selectedCultivator =
    visibleWorld.cultivators.find((c) => c.id === selectedCultivatorId) ??
    visibleWorld.cultivators[0];
  const aliveCount = visibleWorld.cultivators.filter((c) => c.alive).length;
  const activeActorId = selectedCultivator?.id ?? null;
  const characterLocation = visibleWorld.locations.find((site) => site.id === selectedCultivator?.locationId);
  const inspect = (workspaceSection: 'profile' | 'cultivation' | 'mind' | 'sect') => <React.Suspense fallback={<p role="status">载入修士档案…</p>}>
    <AgentInspector world={visibleWorld} cultivator={selectedCultivator} onSelectCultivator={setSelectedCultivatorId} workspaceSection={workspaceSection} />
  </React.Suspense>;
  const openWorkspace = (next: WorkspaceId) => {
    if (workspace !== next && typeof window !== 'undefined') window.scrollTo({ top: 0 });
    setWorkspace(next);
  };
  const opened = (view: WorkspaceId, fallback?: string) => initialWorkspace === view ? initialSection ?? fallback : fallback;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80">
        <div className="mx-auto flex w-full max-w-[76rem] flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-amber-500/40 bg-amber-500/20">
              <Sparkles aria-hidden="true" className="h-5 w-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-wide text-slate-100">天道沙盒<span className="hidden sm:inline"> · AI修仙宗门与群像模拟器</span></h1>
              <p className="break-words text-xs text-slate-300">仙历 {visibleWorld.year}年{visibleWorld.month}月 · 在世 {aliveCount} · 已陨落 {visibleWorld.cultivators.length - aliveCount}</p>
            </div>
          </div>
          <div aria-label="推演控制" className="flex flex-wrap items-center gap-1.5">
            {preview ? (
              <><span className="text-xs text-amber-200">历史只读 · Tick #{preview.tick}</span>
                <button type="button" onClick={() => handleTimelinePreview(null)} className={`${action} bg-amber-400/15 text-amber-100`}>回到当前</button></>
            ) : (
              <>
                <button type="button" onClick={() => setIsRunning((current) => !current)}
                  className={`${action} ${isRunning ? 'bg-amber-500 text-slate-950' : 'bg-emerald-500 text-slate-950'}`}>
                  {isRunning ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
                  {isRunning ? '暂停推演' : '自动推演'}
                </button>
                <button type="button" disabled={isStepping} onClick={() => void handleStepTick()} className={`${action} bg-slate-800 text-slate-100 hover:bg-slate-700`}>
                  <FastForward aria-hidden="true" className="h-4 w-4" />{isStepping ? '推演中…' : '单步推演'}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <SandboxWorkspace active={workspace} onChange={openWorkspace} views={{
        map: <div className="grid min-w-0 items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-4">
          <div className="min-w-0"><WorldMapCanvas compact scopeKey={viewScopeKey} world={visibleWorld} selectedCultivatorId={activeActorId}
            onSelectCultivator={setSelectedCultivatorId} onBrushStroke={preview ? undefined : handleBrushStroke} /></div>
          <aside className={`${panel} min-w-0`} aria-label="当前修士">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="min-w-0 break-words">
                <p className="text-xs text-slate-400">当前修士</p>
                <h2 className="text-base font-semibold text-amber-100">{selectedCultivator?.name ?? '未选中人物'}</h2>
              </div>
              <button type="button" onClick={() => openWorkspace('people')} className={`${action} bg-slate-800 text-slate-100 hover:bg-slate-700`}>人物详情</button>
            </div>
            {selectedCultivator && <p className="break-words text-xs leading-relaxed text-slate-300">
              {selectedCultivator.realm} {selectedCultivator.realmStage}层 · {selectedCultivator.alive ? `气血 ${selectedCultivator.hp}/${selectedCultivator.maxHp}` : '已陨落'} · {courierCheckpoint(visibleWorld, selectedCultivator) ? '信使途中' : characterLocation?.name ?? '所在地点未详'}
            </p>}
          </aside>
        </div>,
        people: <div className="grid min-w-0 items-start gap-3 md:grid-cols-[17rem_minmax(0,1fr)]">
          <React.Suspense fallback={<p role="status">载入修士名册…</p>}><ActorRoster world={visibleWorld} selected={selectedCultivator} onSelect={setSelectedCultivatorId} /></React.Suspense>
          <WorkspaceSections label={`${selectedCultivator?.name ?? '修士'} · 人物档案`} initialOpen={opened('people', 'profile')} sections={[
            { id: 'profile', label: '人物概况', content: inspect('profile') },
            { id: 'cultivation', label: '修为、法宝与丹药', content: inspect('cultivation') },
            { id: 'mind', label: '心声、记忆与流言', content: inspect('mind') },
            { id: 'relationships', label: '关系与师承', content: <div className="space-y-2.5">
              <React.Suspense fallback={<p role="status">载入师承记录…</p>}><MentorshipPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense>
              <React.Suspense fallback={<p role="status">载入关系图…</p>}><RelationshipGraph key={viewScopeKey} world={visibleWorld} selectedCultivatorId={activeActorId} onSelectCultivator={setSelectedCultivatorId} /></React.Suspense>
            </div> },
            ...(workspace === 'people' && selectedCultivator && visiblePilgrimages(visibleWorld, selectedCultivator).length > 0 ? [{
              id: 'pilgrimage', label: '朝山巡礼与共愿', content: <React.Suspense fallback={<p role="status">载入巡礼记录…</p>}>
                <PilgrimagePanel world={visibleWorld} cultivator={selectedCultivator} />
              </React.Suspense>,
            }] : []),
            { id: 'trace', label: '天机溯因与单回合复盘', content: <React.Suspense fallback={<p role="status">载入决策纪要…</p>}>
              <DecisionTracePanel world={visibleWorld} cultivator={selectedCultivator} busy={isStepping} historical={!!preview} onReplay={compareDecision} />
            </React.Suspense> },
            ...(preview ? [] : [{ id: 'possession', label: '化身临世与古戒', content: <React.Suspense fallback={<p role="status">载入化身面板…</p>}>
              <PossessionPanel world={world} selectedCultivatorId={activeActorId} busy={isStepping}
                modelReady={llmConfig.enabled && Boolean(llmConfig.apiKey.trim())} notice={avatarNotice}
                onPossess={handlePossess} onOrder={handleAvatarOrder} onSpeak={(request) => void handleAvatarSpeak(request)} />
            </React.Suspense> }]),
          ]} />
        </div>,
        chronicle: <WorkspaceSections label="纪事与历史" initialOpen={opened('chronicle', 'feed')} sections={[
          { id: 'feed', label: '当世纪事', content: <React.Suspense fallback={<p role="status">载入当世纪事…</p>}><ChronicleFeed events={visibleWorld.events.filter((entry) => !entry.id.startsWith('evt-sealed-dispatch-'))} /></React.Suspense> },
          { id: 'library', label: '藏书阁与史书', content: <React.Suspense fallback={<p role="status">载入藏书阁…</p>}><ChronicleLibraryPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense> },
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
              onPreview={handleTimelinePreview} onSelectBranch={handleTimelineSelectBranch} onFork={handleTimelineFork} notice={timelineNotice} />
          </React.Suspense> },
          { id: 'witness', label: '证词与名誉复核', content: <React.Suspense fallback={<p role="status">载入证词记录…</p>}><AttestationPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense> },
          { id: 'estate', label: '归葬与遗产', content: <React.Suspense fallback={<p role="status">载入遗产账簿…</p>}>
            <EstateMemorialPanel world={visibleWorld} cultivator={selectedCultivator} />
          </React.Suspense> },
        ]} />,
        sect: <WorkspaceSections label="宗门事务" initialOpen={opened('sect', 'governance')} sections={[
          { id: 'governance', label: '宗门地位、库账与外交', content: inspect('sect') },
          { id: 'oaths', label: '天道契书与宗门仲裁', content: <React.Suspense fallback={<p role="status">载入契书记录…</p>}><OathContractsPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense> },
          { id: 'doctrine', label: '道统与分合', content: <React.Suspense fallback={<p role="status">载入道统记录…</p>}>
            <SectDoctrinePanel world={visibleWorld} cultivator={selectedCultivator} />
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
        world: <WorkspaceSections label="世界与设置" initialOpen={opened('world')} sections={[
          { id: 'weather', label: '灵候图与观测', content: <React.Suspense fallback={<p role="status">载入世界记录…</p>}><WeatherAtlasPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense> },
          { id: 'markets', label: '坊市与商队', content: <React.Suspense fallback={<p role="status">载入世界记录…</p>}><MarketCaravansPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense> },
          { id: 'villages', label: '凡人村镇与赈济', content: <React.Suspense fallback={<p role="status">载入世界记录…</p>}><MortalVillagesPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense> },
          { id: 'occasions', label: '比武与秘境盛会', content: <React.Suspense fallback={<p role="status">载入盛会记录…</p>}><WorldOccasionsPanel world={visibleWorld} cultivator={selectedCultivator} /></React.Suspense> },
          { id: 'bounties', label: '天机悬赏榜', content: <React.Suspense fallback={<p role="status">载入悬赏榜…</p>}><BountyBoard world={visibleWorld} /></React.Suspense> },
          { id: 'analytics', label: '天道观测与演化统计', content: <button type="button" onClick={() => setAnalyticsOpen(true)}
            className={`${action} bg-sky-900/60 text-sky-100 hover:bg-sky-800`}><BarChart3 aria-hidden="true" className="h-4 w-4" />打开天道观测</button> },
          ...(preview ? [] : [
            { id: 'god', label: '天道干预与模型设置', content: <div className="space-y-2.5">
              <React.Suspense fallback={<p role="status">载入模型状态…</p>}><LlmTelemetryPanel scheduler={llmScheduler}
                configured={llmConfig.enabled} hasCredential={Boolean(llmConfig.apiKey.trim())} model={llmConfig.model || 'gpt-4o-mini'} /></React.Suspense>
              <React.Suspense fallback={<p role="status">载入天道控制台…</p>}><GodConsole world={world} selectedCultivatorId={activeActorId} llmConfig={llmConfig}
                onUpdateLLMConfig={setLlmConfig} onIntervene={handleGodIntervene} /></React.Suspense>
            </div> },
            { id: 'scenario', label: '剧本编辑与复演', content: <React.Suspense fallback={<p role="status">载入剧本编辑器…</p>}>
              <ScenarioPanel world={world} busy={isStepping} onApply={replaceWorld} />
            </React.Suspense> },
            { id: 'settings', label: '存档、世界种子与推演速度', content: <div className="space-y-2.5">
              <div className={`${panel} flex flex-wrap items-center gap-x-2 gap-y-1.5`}>
                <label htmlFor="world-tick-interval" className="text-xs font-semibold">推演速度</label>
                <select id="world-tick-interval" value={tickIntervalMs} onChange={(e) => setTickIntervalMs(Number(e.target.value))}
                  className="min-h-11 max-w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100">
                  <option value={2500}>慢速 (2.5 秒/月)</option><option value={1500}>标准 (1.5 秒/月)</option><option value={600}>极速 (0.6 秒/月)</option>
                </select>
                <button type="button" disabled={isStepping} onClick={handleReset} className={`${action} bg-slate-800 text-slate-200 hover:bg-slate-700`}>
                  <RotateCcw aria-hidden="true" className="h-4 w-4" />重置修仙纪元</button>
              </div>
              <React.Suspense fallback={<p role="status">载入存档管理…</p>}>
                <WorldStoragePanel world={world} busy={isStepping} contextVersion={saveContextVersion.current}
                  canUseContext={canUseSaveContext} sourceBranch={sourceBranch} onRestore={replaceWorld} onNewWorld={newWorldFromSeed} />
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
