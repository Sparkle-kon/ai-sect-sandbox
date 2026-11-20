import type { Cultivator, WorldState } from '../types/world';

type Rumor = Cultivator['rumors'][number];

export const RUMOR_PROVENANCE: Record<Rumor['provenance'], { label: string; color: string }> = {
  witness: { label: '亲历见闻', color: 'text-emerald-300' },
  conversation: { label: '当面转述', color: 'text-sky-300' },
  flying_sword: { label: '飞剑传书', color: 'text-violet-300' },
  fabricated: { label: '自己编造', color: 'text-rose-300' },
};

interface RumorPanelProps {
  cultivator: Cultivator;
  locations: WorldState['locations'];
  cultivators: WorldState['cultivators'];
}

export function RumorPanel({ cultivator, locations, cultivators }: RumorPanelProps) {
  const locationNames = new Map(locations.map(({ id, name }) => [id, name]));
  const cultivatorNames = new Map(cultivators.map(({ id, name }) => [id, name]));
  const ordered = [...cultivator.rumors].sort(
    (a, b) => b.learnedTick - a.learnedTick || b.confidence - a.confidence || a.id.localeCompare(b.id)
  );
  return (
    <section className="space-y-2 pt-2 border-t border-slate-800" aria-label="见闻与流言">
      <h4 className="text-xs font-semibold text-slate-200">见闻与流言 · {ordered.length} 条</h4>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        {cultivator.alive ? '只显示此修士已获知的消息。' : '此处保留修士陨落时获知的消息。'}
        传闻不等于事实，信任度表示修士对消息的判断。
      </p>
      {ordered.length === 0 ? (
        <p className="rounded border border-dashed border-slate-700 p-2 text-xs text-slate-400">暂无见闻或流言。</p>
      ) : (
        <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
          {ordered.map((entry) => {
            const { label, color } = RUMOR_PROVENANCE[entry.provenance];
            const locationName = entry.locationId ? locationNames.get(entry.locationId) : undefined;
            const sourceName = entry.sourceCultivatorId ? cultivatorNames.get(entry.sourceCultivatorId) : undefined;
            return (
              <article key={entry.id} className="rounded border border-slate-800/80 bg-slate-950/70 p-2 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-x-2 text-[10px] text-slate-400">
                  <span className={`font-semibold ${color}`}>{label}</span>
                  <span>地点：{locationName ?? '未详'}</span>
                </div>
                <p className="text-xs text-slate-200 break-words leading-relaxed">{entry.subject}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                  <span>信任度 {entry.confidence}/100</span>
                  <span>经手 {entry.hops} 次</span>
                  <span>获知 Tick #{entry.learnedTick} · 消息起始 Tick #{entry.originTick}</span>
                  {entry.sourceCultivatorId && <span>传自：{sourceName ?? '身份未详'}</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
