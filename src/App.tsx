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
import { applyMapBrush } from './engine/mapBrushEngine';
import { GodBrushKind, LLMConfig, LLMDecisionPayload, MapPoint, WorldState } from './types/world';
import { WorldMapCanvas } from './components/WorldMapCanvas';
import { RelationshipGraph } from './components/RelationshipGraph';
import { GodConsole } from './components/GodConsole';
import { AgentInspector } from './components/AgentInspector';
import { ChronicleFeed } from './components/ChronicleFeed';
import { BountyBoard } from './components/BountyBoard';
import { SectCouncilModal } from './components/SectCouncilModal';
import { ChronicleLibraryPanel } from './components/ChronicleLibraryPanel';
import { LlmTelemetryPanel } from './components/LlmTelemetryPanel';
import { llmScheduler } from './engine/llmScheduler';
import { settleChronicleOnline } from './engine/chronicleRuntime';
import { availableCouncilPlans } from './engine/councilEngine';
import { commitCouncilSnapshot, settleAnnualCouncilOnline, settleCouncilSnapshot } from './engine/councilRuntime';
import type { AvatarInteractionRequest, CouncilPlan } from './types/world';
import { PossessionPanel } from './components/PossessionPanel';
import { isWorldSeed } from './engine/worldRandom';
import { TimelinePanel } from './components/TimelinePanel';
import { MentorshipPanel } from './components/MentorshipPanel';
import { OathContractsPanel } from './components/OathContractsPanel';
import { WeatherAtlasPanel } from './components/WeatherAtlasPanel';
import { MarketCaravansPanel } from './components/MarketCaravansPanel';
import { MortalVillagesPanel } from './components/MortalVillagesPanel';
import { createTimeline, forkTimeline, readTimelineHead, readTimelineSnapshot, recordTimelineWorld, selectTimelineBranch } from './engine/timelineEngine';
import type { WorldTimeline } from './engine/timelineEngine';
import { activeAvatar, possessAvatar, queueAvatarOrder } from './engine/avatarEngine';
import { resolveAvatarSnapshot } from './engine/avatarRuntime';

const WorldStoragePanel = React.lazy(async () => ({ default: (await import('./components/WorldStoragePanel')).WorldStoragePanel }));
const AnalyticsModal = React.lazy(async () => ({ default: (await import('./components/AnalyticsModal')).AnalyticsModal }));

export const App: React.FC = () => {
  const [world, setWorld] = useState<WorldState>(() => createInitialWorld());
  const authority = useRef(world);
  const [timeline, setTimeline] = useState(() => createTimeline(world));
  const history = useRef(timeline);
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
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState<string>();
  const [lastManualCouncilId, setLastManualCouncilId] = useState<string>();
  const [tickIntervalMs, setTickIntervalMs] = useState(1800);
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
        const tick = advanceWorldTick(starting, decisions, undefined, 'deferred', (id, effective) => {
          if (effective && modelActors.has(id)) applied.add(id);
        });
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
        if (updateWorld((current) => commitCouncilSnapshot(current, starting, next)) === next) {
          llmScheduler.markDecision('applied', applied.size);
          llmScheduler.markDecision('simulation_rejected', modelActors.size - applied.size);
        } else {
          llmScheduler.markDecision('stale', modelActors.size);
        }
      } else {
        updateWorld((prev) => advanceWorldTick(prev));
      }
    } finally {
      stepInFlight.current = false;
      setIsStepping(false);
    }
  }, [llmConfig, updateWorld]);

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

  const replaceWorld = (next: WorldState, expected: WorldState): boolean => {
    if (stepInFlight.current || browsing.current || authority.current !== expected) return false;
    activateTimeline(createTimeline(next), next);
    return true;
  };

  const newWorldFromSeed = (seed: number, expected: WorldState): boolean =>
    isWorldSeed(seed) && replaceWorld(createInitialWorld(seed), expected);

  const handleReset = () => {
    if (browsing.current) return;
    const next = createInitialWorld(authority.current.random.seed);
    // Emergency reset invalidates an in-flight model tick, which cannot commit afterward.
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
  const visibleHistory = timeline.branches.find(({ id }) => id === timeline.activeBranchId)?.snapshots;
  const selectedCultivator =
    visibleWorld.cultivators.find((c) => c.id === selectedCultivatorId) ??
    visibleWorld.cultivators[0];
  const aliveCount = visibleWorld.cultivators.filter((c) => c.alive).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wide text-slate-100">
              天道沙盒：AI修仙宗门与群像模拟器
            </h1>
            <p className="text-xs text-slate-400">
              仙历 {visibleWorld.year}年{visibleWorld.month}月 (Tick #{visibleWorld.tick}) · 存活修士{' '}
              {aliveCount}/{visibleWorld.cultivators.length}{preview && ' · 历史只读'}
            </p>
          </div>
        </div>

        {/* Simulation Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <LlmTelemetryPanel scheduler={llmScheduler} configured={llmConfig.enabled}
            hasCredential={Boolean(llmConfig.apiKey.trim())} model={llmConfig.model || 'gpt-4o-mini'} />
          <button type="button" onClick={() => setAnalyticsOpen(true)}
            className="flex items-center gap-1 rounded-lg bg-sky-900/60 px-3 py-1.5 text-xs font-medium text-sky-100 hover:bg-sky-800">
            <BarChart3 aria-hidden="true" className="h-4 w-4" /> 天道观测
          </button>
          <button
            type="button"
            disabled={!!preview}
            onClick={() => setCouncilOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-violet-900/60 hover:bg-violet-800 text-violet-100 text-xs font-medium"
          >
            长老议事厅
          </button>
          <button
            type="button"
            disabled={!!preview}
            onClick={() => setIsRunning(!isRunning)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              isRunning
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" /> 暂停推演
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" /> 自动演化
              </>
            )}
          </button>

          <button
            type="button"
            disabled={isStepping || !!preview}
            onClick={() => void handleStepTick()}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            <FastForward className="w-3.5 h-3.5" />
            单步推演 (+1月)
          </button>

          <select
            value={tickIntervalMs}
            onChange={(e) => setTickIntervalMs(Number(e.target.value))}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300"
          >
            <option value={2500}>慢速 (2.5s/月)</option>
            <option value={1500}>标准 (1.5s/月)</option>
            <option value={600}>极速 (0.6s/月)</option>
          </select>

          <button
            type="button"
            disabled={!!preview}
            onClick={handleReset}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
            title="重置修仙纪元"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 7 Cols: 2D Map + God Console + Chronicle */}
        <div className="lg:col-span-7 space-y-4">
          <WorldMapCanvas
            world={visibleWorld}
            selectedCultivatorId={selectedCultivatorId}
            onSelectCultivator={setSelectedCultivatorId}
            onBrushStroke={preview ? undefined : handleBrushStroke}
          />
          <WeatherAtlasPanel world={visibleWorld} cultivator={selectedCultivator} />
          <MarketCaravansPanel world={visibleWorld} cultivator={selectedCultivator} />
          <MortalVillagesPanel world={visibleWorld} cultivator={selectedCultivator} />
          <BountyBoard world={visibleWorld} />
          {!preview && <GodConsole
            world={world}
            selectedCultivatorId={selectedCultivatorId}
            llmConfig={llmConfig}
            onUpdateLLMConfig={setLlmConfig}
            onIntervene={handleGodIntervene}
          />}
          <ChronicleFeed events={visibleWorld.events} />
          <ChronicleLibraryPanel world={visibleWorld} />
          {!preview && <PossessionPanel world={world} selectedCultivatorId={selectedCultivatorId} busy={isStepping}
            modelReady={llmConfig.enabled && Boolean(llmConfig.apiKey.trim())} notice={avatarNotice}
            onPossess={handlePossess} onOrder={handleAvatarOrder} onSpeak={(request) => void handleAvatarSpeak(request)} />}
        </div>

        {/* Right 5 Cols: Agent Inspector + Relationship Graph */}
        <div className="lg:col-span-5 space-y-4">
          <TimelinePanel timeline={timeline} previewTick={preview?.tick ?? null} busy={isStepping}
            onPreview={handleTimelinePreview} onSelectBranch={handleTimelineSelectBranch} onFork={handleTimelineFork} notice={timelineNotice} />
          <AgentInspector
            world={visibleWorld}
            cultivator={selectedCultivator}
            onSelectCultivator={setSelectedCultivatorId}
          />
          <MentorshipPanel world={visibleWorld} cultivator={selectedCultivator} />
          <OathContractsPanel world={visibleWorld} cultivator={selectedCultivator} />
          {!preview && <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <button type="button" aria-expanded={storageOpen} onClick={() => setStorageOpen((open) => !open)}
              className="w-full rounded-md bg-slate-800 px-3 py-2 text-left text-sm text-slate-100">存档与世界种子</button>
            {storageOpen && <React.Suspense fallback={<p className="py-2 text-sm text-slate-300" role="status">载入存档管理…</p>}>
              <WorldStoragePanel world={world} busy={isStepping} onRestore={replaceWorld} onNewWorld={newWorldFromSeed} />
            </React.Suspense>}
          </section>}
          <RelationshipGraph
            world={visibleWorld}
            selectedCultivatorId={selectedCultivatorId}
            onSelectCultivator={setSelectedCultivatorId}
          />
        </div>
      </main>
      {analyticsOpen && <React.Suspense fallback={<span role="status">载入天道观测…</span>}>
        <AnalyticsModal world={visibleWorld} history={visibleHistory} open onClose={() => setAnalyticsOpen(false)} />
      </React.Suspense>}
      <SectCouncilModal
        world={world}
        open={councilOpen && !preview}
        busy={isStepping}
        onClose={() => setCouncilOpen(false)}
        onConvene={(plan) => void handleConveneCouncil(plan)}
        notice={!isStepping && lastManualCouncilId && !world.councils.some((record) => record.id === lastManualCouncilId)
          ? '世界已发生变化，本次议事未结算。' : undefined}
      />
    </div>
  );
};

export default App;
