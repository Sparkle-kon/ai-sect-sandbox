import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, FastForward, RotateCcw, Sparkles } from 'lucide-react';
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
import { WorldStoragePanel } from './components/WorldStoragePanel';
import { isWorldSeed } from './engine/worldRandom';
import { activeAvatar, possessAvatar, queueAvatarOrder } from './engine/avatarEngine';
import { resolveAvatarSnapshot } from './engine/avatarRuntime';

export const App: React.FC = () => {
  const [world, setWorld] = useState<WorldState>(() => createInitialWorld());
  const authority = useRef(world);
  const updateWorld = useCallback((change: (current: WorldState) => WorldState) => {
    const next = change(authority.current);
    authority.current = next;
    setWorld(next);
    return next;
  }, []);
  const [selectedCultivatorId, setSelectedCultivatorId] = useState<
    string | null
  >('npc-1');
  const [isRunning, setIsRunning] = useState(false);
  const [isStepping, setIsStepping] = useState(false);
  const stepInFlight = useRef(false);
  const [councilOpen, setCouncilOpen] = useState(false);
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
    if (stepInFlight.current) return;
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
    if (stepInFlight.current || !availableCouncilPlans(starting, plan.sectId).some((item) => item.id === plan.id)) return;
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
    if (stepInFlight.current) return;
    setAvatarNotice(undefined);
    updateWorld((current) => {
      const next = structuredClone(current);
      return possessAvatar(next, actorId) ? next : current;
    });
  };

  const handleAvatarOrder = (action: 'REST' | 'CULTIVATE') => {
    if (stepInFlight.current) return;
    setAvatarNotice(undefined);
    updateWorld((current) => {
      const next = structuredClone(current);
      return queueAvatarOrder(next, action) ? next : current;
    });
  };

  const handleAvatarSpeak = async (request: AvatarInteractionRequest) => {
    if (stepInFlight.current) return;
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
    updateWorld((prev) => executeGodIntervention(prev, cmd));
  };

  const handleBrushStroke = (kind: GodBrushKind, points: MapPoint[]) => {
    updateWorld((previous) => applyMapBrush(previous, kind, points));
  };

  const replaceWorld = (next: WorldState, expected: WorldState): boolean => {
    if (stepInFlight.current || authority.current !== expected) return false;
    setIsRunning(false);
    updateWorld(() => next);
    llmScheduler.resetTickBudget();
    setSelectedCultivatorId(next.cultivators.find(({ alive }) => alive)?.id ?? next.cultivators[0]?.id ?? null);
    setLastManualCouncilId(undefined);
    setAvatarNotice(undefined);
    return true;
  };

  const newWorldFromSeed = (seed: number, expected: WorldState): boolean =>
    isWorldSeed(seed) && replaceWorld(createInitialWorld(seed), expected);

  const handleReset = () => {
    const previous = authority.current;
    if (!replaceWorld(createInitialWorld(previous.random.seed), previous)) {
      // Emergency reset can still invalidate an in-flight model tick, which cannot commit afterward.
      setIsRunning(false);
      const reset = createInitialWorld(previous.random.seed);
      updateWorld(() => reset);
      llmScheduler.resetTickBudget();
      setSelectedCultivatorId(reset.cultivators[0]?.id ?? null);
      setLastManualCouncilId(undefined);
      setAvatarNotice(undefined);
    }
  };

  const selectedCultivator =
    world.cultivators.find((c) => c.id === selectedCultivatorId) ??
    world.cultivators[0];

  const aliveCount = world.cultivators.filter((c) => c.alive).length;

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
              仙历 {world.year}年{world.month}月 (Tick #{world.tick}) · 存活修士{' '}
              {aliveCount}/{world.cultivators.length}
            </p>
          </div>
        </div>

        {/* Simulation Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <LlmTelemetryPanel scheduler={llmScheduler} configured={llmConfig.enabled}
            hasCredential={Boolean(llmConfig.apiKey.trim())} model={llmConfig.model || 'gpt-4o-mini'} />
          <button
            type="button"
            onClick={() => setCouncilOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-violet-900/60 hover:bg-violet-800 text-violet-100 text-xs font-medium"
          >
            长老议事厅
          </button>
          <button
            type="button"
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
            disabled={isStepping}
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
            world={world}
            selectedCultivatorId={selectedCultivatorId}
            onSelectCultivator={setSelectedCultivatorId}
            onBrushStroke={handleBrushStroke}
          />
          <BountyBoard world={world} />
          <GodConsole
            world={world}
            selectedCultivatorId={selectedCultivatorId}
            llmConfig={llmConfig}
            onUpdateLLMConfig={setLlmConfig}
            onIntervene={handleGodIntervene}
          />
          <ChronicleFeed events={world.events} />
          <ChronicleLibraryPanel world={world} />
          <PossessionPanel world={world} selectedCultivatorId={selectedCultivatorId} busy={isStepping}
            modelReady={llmConfig.enabled && Boolean(llmConfig.apiKey.trim())} notice={avatarNotice}
            onPossess={handlePossess} onOrder={handleAvatarOrder} onSpeak={(request) => void handleAvatarSpeak(request)} />
        </div>

        {/* Right 5 Cols: Agent Inspector + Relationship Graph */}
        <div className="lg:col-span-5 space-y-4">
          <AgentInspector
            world={world}
            cultivator={selectedCultivator}
            onSelectCultivator={setSelectedCultivatorId}
          />
          <WorldStoragePanel world={world} busy={isStepping} onRestore={replaceWorld} onNewWorld={newWorldFromSeed} />
          <RelationshipGraph
            world={world}
            selectedCultivatorId={selectedCultivatorId}
            onSelectCultivator={setSelectedCultivatorId}
          />
        </div>
      </main>
      <SectCouncilModal
        world={world}
        open={councilOpen}
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
