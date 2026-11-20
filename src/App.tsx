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
import { LLMConfig, LLMDecisionPayload, WorldState } from './types/world';
import { WorldMapCanvas } from './components/WorldMapCanvas';
import { RelationshipGraph } from './components/RelationshipGraph';
import { GodConsole } from './components/GodConsole';
import { AgentInspector } from './components/AgentInspector';
import { ChronicleFeed } from './components/ChronicleFeed';

export const App: React.FC = () => {
  const [world, setWorld] = useState<WorldState>(() => createInitialWorld());
  const [selectedCultivatorId, setSelectedCultivatorId] = useState<
    string | null
  >('npc-1');
  const [isRunning, setIsRunning] = useState(false);
  const [isStepping, setIsStepping] = useState(false);
  const stepInFlight = useRef(false);
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
      if (llmConfig.enabled && llmConfig.apiKey.trim()) {
        const alive = world.cultivators.filter((c) => c.alive && !activeSiegeForActor(world, c));
        const results = await Promise.all(
          alive.map(async (c) => {
            const dec = await queryCultivatorLLMDecision(c, world, llmConfig);
            return [c.id, dec] as const;
          })
        );
        const decisions: Record<string, LLMDecisionPayload> = Object.fromEntries(results);
        const tick = advanceWorldTick(world, decisions);
        const [reflected, dramatized] = await Promise.all([
          enrichAnnualReflections(tick, llmConfig), enrichTickDialogues(tick, llmConfig),
        ]);
        const next = { ...reflected, events: dramatized.events };
        // A reset or divine intervention during the request invalidates its snapshot.
        setWorld((prev) => prev === world ? next : prev);
      } else {
        setWorld((prev) => advanceWorldTick(prev));
      }
    } finally {
      stepInFlight.current = false;
      setIsStepping(false);
    }
  }, [llmConfig, world]);

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      void handleStepTick();
    }, tickIntervalMs);
    return () => clearInterval(timer);
  }, [isRunning, tickIntervalMs, handleStepTick]);

  const handleGodIntervene = (cmd: GodInterventionCommand) => {
    setWorld((prev) => executeGodIntervention(prev, cmd));
  };

  const handleReset = () => {
    setIsRunning(false);
    setWorld(createInitialWorld());
    setSelectedCultivatorId('npc-1');
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
              {aliveCount}/{world.cultivators.length} ·{' '}
              {llmConfig.enabled ? 'LLM 思维链驱动中' : '启发式规则脑驱动中'}
            </p>
          </div>
        </div>

        {/* Simulation Controls */}
        <div className="flex items-center gap-2">
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
          />
          <GodConsole
            world={world}
            selectedCultivatorId={selectedCultivatorId}
            llmConfig={llmConfig}
            onUpdateLLMConfig={setLlmConfig}
            onIntervene={handleGodIntervene}
          />
          <ChronicleFeed events={world.events} />
        </div>

        {/* Right 5 Cols: Agent Inspector + Relationship Graph */}
        <div className="lg:col-span-5 space-y-4">
          <AgentInspector
            world={world}
            cultivator={selectedCultivator}
            onSelectCultivator={setSelectedCultivatorId}
          />
          <RelationshipGraph
            world={world}
            selectedCultivatorId={selectedCultivatorId}
            onSelectCultivator={setSelectedCultivatorId}
          />
        </div>
      </main>
    </div>
  );
};

export default App;
