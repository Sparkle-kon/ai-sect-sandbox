import type { Cultivator } from '../types/world';

type Reflection = Cultivator['reflections'][number];

const KINDS: { kind: Reflection['kind']; label: string; color: string }[] = [
  { kind: 'belief', label: '信念', color: 'text-sky-300' },
  { kind: 'obsession', label: '执念', color: 'text-amber-300' },
  { kind: 'heart_demon', label: '心魔', color: 'text-rose-300' },
];

const THEME_LABELS: Record<Reflection['theme'], string> = {
  cultivation: '修行',
  conflict: '争斗',
  community: '宗门与人情',
  heavenly: '天道',
};

export function ReflectionPanel({ cultivator }: { cultivator: Cultivator }) {
  const memoryById = new Map([...cultivator.memories, ...cultivator.coreMemories].map((entry) => [entry.id, entry.content]));
  const ordered = [...cultivator.reflections].sort(
    (a, b) => b.intensity - a.intensity || b.tick - a.tick || a.id.localeCompare(b.id)
  );

  return (
    <section className="space-y-2 pt-2 border-t border-slate-800" aria-label="道心反思">
      <h4 className="text-xs font-semibold text-slate-200">道心反思</h4>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        {cultivator.alive ? '每12个月从重要记忆中总结信念、执念与心魔。' : '此处保留修士陨落时的道心记录。'}
      </p>
      {ordered.length === 0 ? (
        <p className="rounded border border-dashed border-slate-700 p-2 text-xs text-slate-400">
          尚无道心反思。
        </p>
      ) : (
        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
          {KINDS.map(({ kind, label, color }) => {
            const items = ordered.filter((entry) => entry.kind === kind);
            if (items.length === 0) return null;
            return (
              <section key={kind} aria-label={label} className="space-y-1">
                <h5 className={`text-[11px] font-semibold ${color}`}>{label} · {items.length} 条</h5>
                {items.map((entry) => {
                  const available = entry.sourceMemoryIds.flatMap((id) => {
                    const memory = memoryById.get(id);
                    return memory === undefined ? [] : [{ id, memory }];
                  });
                  const faded = entry.sourceMemoryIds.length - available.length;
                  return (
                    <article key={entry.id} className="rounded border border-slate-800/80 bg-slate-950/70 p-2 space-y-1">
                      <p className="text-xs text-slate-200 break-words leading-relaxed">{entry.statement}</p>
                      <p className="text-[10px] text-slate-400">
                        {THEME_LABELS[entry.theme]} · 强度 {entry.intensity}/10 · Tick #{entry.tick} · {entry.source === 'llm' ? '模型反思' : '离线推演'}
                      </p>
                      {entry.sourceMemoryIds.length > 0 && (
                        <details className="text-[10px] text-slate-400">
                          <summary className="cursor-pointer">记忆依据 · {entry.sourceMemoryIds.length} 条</summary>
                          {available.length > 0 && (
                            <ul className="mt-1 list-disc pl-4">
                              {available.map(({ id, memory }) => <li key={id} className="break-words">{memory}</li>)}
                            </ul>
                          )}
                          {faded > 0 && <p className="mt-1">{faded} 条来源记忆已不在当前记忆中。</p>}
                        </details>
                      )}
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
