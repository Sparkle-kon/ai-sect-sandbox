import type { Cultivator, WorldState } from '../types/world';

type Occasion = WorldState['occasions'][number];

export const OCCASION_KIND: Record<Occasion['kind'], string> = {
  tournament: '宗门大比',
  expedition: '秘境远征',
};

export const OCCASION_STATUS: Record<Occasion['status'], string> = {
  registration: '报名中',
  running: '进行中',
  completed: '已结束',
  cancelled: '已取消',
};

const EXPEDITION_OUTCOMES: Record<Occasion['expeditions'][number]['outcome'], string> = {
  loot: '获得机缘',
  wounded: '负伤',
  death: '陨落',
  escaped: '撤离',
};

export function isOpenOccasion(occasion: Occasion): boolean {
  return occasion.status === 'registration' || occasion.status === 'running';
}

export function WorldOccasionsPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator }) {
  const names = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const places = new Map(world.locations.map(({ id, name }) => [id, name]));
  const named = (id: string) => names.get(id) ?? '修士未详';
  const open = world.occasions.filter(isOpenOccasion).sort((a, b) => b.startedTick - a.startedTick);
  const recent = world.occasions.filter((occasion) => !isOpenOccasion(occasion))
    .sort((a, b) => (b.lastResolvedTick ?? b.startedTick) - (a.lastResolvedTick ?? a.startedTick)).slice(0, 4);

  return (
    <section className="space-y-2 pt-2 border-t border-slate-800" aria-label="天下盛会与秘境">
      <h4 className="text-xs font-semibold text-slate-200">天下盛会与秘境</h4>
      {open.length + recent.length === 0 ? <p className="text-[11px] text-slate-400">尚无盛会或远征记录。</p> : (
        <details className="rounded border border-slate-800/80 bg-slate-950/50 px-2 py-1.5">
          <summary className="cursor-pointer text-xs text-slate-200">查看盛会 · 活跃 {open.length} 场 · 近期结案 {recent.length} 场</summary>
          <ul className="mt-2 space-y-2">
            {[...open, ...recent].map((occasion) => (
              <li key={occasion.id} className="space-y-1.5 rounded bg-slate-900/60 p-2 text-[11px] text-slate-300">
                <div className="flex flex-wrap items-center gap-x-2">
                  <h5 className="font-medium text-slate-100 break-words">{occasion.title}</h5>
                  <span className={isOpenOccasion(occasion) ? 'text-cyan-300' : 'text-slate-400'}>
                    {OCCASION_KIND[occasion.kind]} · {OCCASION_STATUS[occasion.status]}
                  </span>
                  {occasion.participantIds.includes(cultivator.id) && <span className="text-amber-200">选中修士参会</span>}
                </div>
                <p className="text-slate-400">
                  {places.get(occasion.locationId) ?? '地点未详'} · 始于 Tick #{occasion.startedTick}
                  {occasion.status === 'registration' ? ` · 报名截止 Tick #${occasion.registrationClosesTick}` : ''}
                  {isOpenOccasion(occasion) ? ` · 最晚结束 Tick #${occasion.expiresTick}` : ''}
                </p>
                <p>已登记者 {occasion.participantIds.length} 人
                  {occasion.status === 'running' ? ` · 仍在进行 ${occasion.remainingIds.length} 人` : ''}
                  {occasion.kind === 'tournament' && occasion.round > 0 ? ` · 轮次 ${occasion.round}` : ''}
                </p>
                {occasion.championId && <p className="text-amber-300">魁首：{named(occasion.championId)}</p>}
                {occasion.bouts.length > 0 && (
                  <ol className="max-h-32 overflow-y-auto space-y-0.5" aria-label="大比对阵结果">
                    {occasion.bouts.map((bout, index) => (
                      <li key={`${bout.round}-${bout.firstId}-${index}`}>
                        第 {bout.round} 轮：{named(bout.firstId)}
                        {bout.secondId ? ` 对 ${named(bout.secondId)} · 胜者 ${named(bout.winnerId)}` : ` · 轮空晋级（${named(bout.winnerId)}）`}
                      </li>
                    ))}
                  </ol>
                )}
                {occasion.expeditions.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto space-y-1" aria-label="秘境远征结果">
                    {occasion.expeditions.map((result, index) => (
                      <li key={`${result.cultivatorId}-${result.tick}-${index}`}>
                        <span className={result.outcome === 'death' ? 'text-rose-300' : 'text-cyan-200'}>
                          {named(result.cultivatorId)} · {EXPEDITION_OUTCOMES[result.outcome]} · Tick #{result.tick}
                        </span>
                        <p className="break-words">{result.description}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
