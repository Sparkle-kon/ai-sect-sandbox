import React, { useState } from 'react';
import { Sparkles, Zap, Skull, MessageSquarePlus, Cpu } from 'lucide-react';
import { GodInterventionCommand } from '../engine/worldEngine';
import { LLMConfig, WorldState } from '../types/world';

interface GodConsoleProps {
  world: WorldState;
  selectedCultivatorId: string | null;
  llmConfig: LLMConfig;
  onUpdateLLMConfig: (cfg: LLMConfig) => void;
  onIntervene: (cmd: GodInterventionCommand) => void;
}

export const GodConsole: React.FC<GodConsoleProps> = ({
  world,
  selectedCultivatorId,
  llmConfig,
  onUpdateLLMConfig,
  onIntervene,
}) => {
  const [whisperText, setWhisperText] = useState(
    '立刻前往上古陨仙墟夺取机缘，顺便刺杀血月老祖！'
  );
  const [targetLocId, setTargetLocId] = useState(
    world.locations[0]?.id ?? 'loc-secret-1'
  );
  const [showLLMConfig, setShowLLMConfig] = useState(false);

  const selectedCultivator =
    world.cultivators.find((c) => c.id === selectedCultivatorId) ??
    world.cultivators[0];

  return (
    <div className="rounded-xl border border-amber-500/30 bg-slate-900/70 p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
            天道干预控制台 (Heavenly Dao Console)
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setShowLLMConfig(!showLLMConfig)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
            llmConfig.enabled
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          {llmConfig.enabled ? (llmConfig.apiKey.trim() ? 'LLM 已配置' : 'LLM 缺少密钥') : '配置 LLM API'}
        </button>
      </div>

      {showLLMConfig && (
        <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-medium">
              启用实时大模型推理驱动 (OpenAI 兼容接口)
            </span>
            <input
              type="checkbox"
              checked={llmConfig.enabled}
              onChange={(e) =>
                onUpdateLLMConfig({ ...llmConfig, enabled: e.target.checked })
              }
              className="rounded accent-amber-400"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="API Base URL (如 https://api.openai.com/v1)"
              value={llmConfig.apiBaseUrl}
              onChange={(e) =>
                onUpdateLLMConfig({ ...llmConfig, apiBaseUrl: e.target.value })
              }
              className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200"
            />
            <input
              type="password"
              placeholder="Bearer API Key (sk-...)"
              value={llmConfig.apiKey}
              onChange={(e) =>
                onUpdateLLMConfig({ ...llmConfig, apiKey: e.target.value })
              }
              className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200"
            />
            <input
              type="text"
              placeholder="Model (如 gpt-4o-mini / deepseek-chat)"
              value={llmConfig.model}
              onChange={(e) =>
                onUpdateLLMConfig({ ...llmConfig, model: e.target.value })
              }
              className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200"
            />
          </div>
        </div>
      )}

      {/* Quick God Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="flex items-center gap-1.5 bg-slate-950/70 p-1.5 rounded-lg border border-slate-800">
          <select
            value={targetLocId}
            onChange={(e) => setTargetLocId(e.target.value)}
            className="bg-slate-900 text-slate-200 text-xs px-2 py-1 rounded border border-slate-700 flex-1"
          >
            {world.locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              onIntervene({
                type: 'SPAWN_TREASURE',
                targetLocationId: targetLocId,
              })
            }
            className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-medium whitespace-nowrap flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            天降仙宝
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            onIntervene({
              type: 'TRIBULATION_STRIKE',
              targetCultivatorId: selectedCultivator?.id,
            })
          }
          className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-medium flex items-center justify-center gap-1.5"
        >
          <Zap className="w-3.5 h-3.5" />
          降雷惩戒【{selectedCultivator?.name ?? '目标'}】
        </button>

        <button
          type="button"
          onClick={() => onIntervene({ type: 'DEMONIC_TIDE' })}
          className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-medium flex items-center justify-center gap-1.5"
        >
          <Skull className="w-3.5 h-3.5" />
          发动域外血月魔劫
        </button>
      </div>

      {/* Whisper into selected NPC's mind */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          type="text"
          value={whisperText}
          onChange={(e) => setWhisperText(e.target.value)}
          aria-label="天道传音内容"
          placeholder={`向【${selectedCultivator?.name ?? '修士'}】识海灌输天道传音/执念...`}
          className="min-h-11 min-w-0 w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
        />
        <button
          type="button"
          onClick={() =>
            onIntervene({
              type: 'WHISPER_MIND',
              targetCultivatorId: selectedCultivator?.id,
              whisperText,
            })
          }
          className="flex min-h-11 min-w-0 max-w-full items-center justify-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-500/30 sm:max-w-60"
        >
          <MessageSquarePlus aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-all">神念传音【{selectedCultivator?.name}】</span>
        </button>
      </div>
    </div>
  );
};
