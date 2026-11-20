import React from 'react';
import { MemoryEntry } from '../types/world';
import { CORE_LIMIT, EPISODIC_LIMIT, memoryStrength } from '../engine/memoryEngine';

const CATEGORY_LABELS: Record<MemoryEntry['category'], string> = {
  cultivation: '修行',
  combat: '斗法',
  social: '交往',
  heavenly: '天道',
  whisper: '低语',
};

interface MemoryPanelProps {
  memories: MemoryEntry[];
  tick: number;
  core?: boolean;
}

export const MemoryPanel: React.FC<MemoryPanelProps> = ({
  memories,
  tick,
  core = false,
}) => (
  <section className="space-y-1.5" aria-label={core ? '核心记忆' : '情景记忆'}>
    <h4 className="text-xs font-semibold text-slate-200 flex items-center justify-between">
      <span>{core ? '核心记忆 · 长期留存' : '近期情景记忆'}</span>
      <span className={core ? 'text-amber-300' : 'text-sky-300'}>{memories.length}/{core ? CORE_LIMIT : EPISODIC_LIMIT} 条</span>
    </h4>
    {memories.length === 0 ? (
      <p className="rounded border border-dashed border-slate-700 p-2 text-xs text-slate-400">
        {core ? '尚无凝练的核心记忆，重大经历将在年度整理时留存。' : '暂无情景记忆，新的经历会在这里出现。'}
      </p>
    ) : (
      <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
        {memories.slice().sort((a, b) => b.tick - a.tick || a.id.localeCompare(b.id)).map((entry) => {
          const strength = memoryStrength(entry, tick);
          const age = Math.max(0, tick - entry.tick);
          const emotion = entry.emotionalValence > 0 ? `+${entry.emotionalValence}` : String(entry.emotionalValence);
          const emotionLabel = entry.emotionalValence > 0 ? '正向' : entry.emotionalValence < 0 ? '负向' : '中性';
          return (
            <article key={entry.id} className={`text-xs p-2 rounded bg-slate-950/70 border ${core ? 'border-amber-500/25' : 'border-slate-800/80'}`}>
              <div className="flex items-center justify-between gap-2 text-[10px] mb-1">
                <span className={core ? 'text-amber-300' : 'text-sky-300'}>{CATEGORY_LABELS[entry.category]}</span>
                <span className="text-slate-400">Tick #{entry.tick} · {age} 月前</span>
              </div>
              <p className="text-slate-200 leading-relaxed break-words">{entry.content}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px] text-slate-400">
                <span>重要度 {entry.importance}/10</span>
                <span className={entry.emotionalValence < 0 ? 'text-rose-300' : entry.emotionalValence > 0 ? 'text-emerald-300' : 'text-slate-400'}>
                  情绪 {emotion}（{emotionLabel}）
                </span>
                <span>衰减率 {entry.decayRate.toFixed(3)}/月</span>
                {entry.consolidatedAtTick !== undefined && <span>凝练于 Tick #{entry.consolidatedAtTick}</span>}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div role="meter" aria-label="当前记忆强度" aria-valuemin={0} aria-valuemax={10} aria-valuenow={strength} className="h-1 flex-1 rounded bg-slate-800 overflow-hidden">
                  <div className={`h-full ${core ? 'bg-amber-400' : 'bg-sky-400'}`} style={{ width: `${Math.min(100, Math.max(0, strength * 10))}%` }} />
                </div>
                <span className="text-[10px] text-slate-400 tabular-nums">强度 {strength.toFixed(1)}/10</span>
              </div>
            </article>
          );
        })}
      </div>
    )}
  </section>
);
