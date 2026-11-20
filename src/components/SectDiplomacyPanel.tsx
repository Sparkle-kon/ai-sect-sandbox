import type { Sect, WorldState } from '../types/world';

type Relation = WorldState['diplomacy'][number];
type Siege = WorldState['sieges'][number];
type Tribute = WorldState['tributeDemands'][number];

const PACT_LABELS: Record<Relation['pact'], string> = { neutral: '中立', alliance: '盟友', war: '交战' };
export const SIEGE_LABELS: Record<Siege['status'], string> = {
  marching: '行军', sieging: '围攻', victory: '攻方胜利', repelled: '攻方遭击退',
};
const TRIBUTE_LABELS: Record<Tribute['status'], string> = { pending: '待答复', paid: '已缴纳', rejected: '已拒绝' };

export function isActiveCampaign(siege: Siege): boolean {
  return siege.status === 'marching' || siege.status === 'sieging';
}

export function SectDiplomacyPanel({ sect, world }: { sect: Sect | undefined; world: WorldState }) {
  const sectName = (id: string) => world.sects.find((entry) => entry.id === id)?.name ?? '宗门未详';
  const locationName = (id: string) => world.locations.find((entry) => entry.id === id)?.name ?? '地点未详';
  const rivals = sect ? world.sects.filter(({ id }) => id !== sect.id) : [];
  const sieges = sect ? world.sieges.filter(({ attackerSectId, defenderSectId }) => attackerSectId === sect.id || defenderSectId === sect.id)
    .sort((a, b) => Number(isActiveCampaign(b)) - Number(isActiveCampaign(a)) || b.startedTick - a.startedTick) : [];
  const demands = sect ? world.tributeDemands.filter(({ demanderSectId, targetSectId }) => demanderSectId === sect.id || targetSectId === sect.id)
    .sort((a, b) => b.startedTick - a.startedTick) : [];

  return (
    <section className="space-y-2 pt-2 border-t border-slate-800" aria-label="宗门外交与战事">
      <h4 className="text-xs font-semibold text-slate-200">宗门外交与战事</h4>
      {!sect ? <p className="text-[11px] text-slate-400">散修，无本宗外交记录。</p> : (
        <details className="rounded border border-slate-800/80 bg-slate-950/50 px-2 py-1.5">
          <summary className="cursor-pointer text-xs text-slate-200">
            查看{sect.name}外情 · 进行中战役 {sieges.filter(isActiveCampaign).length} 场
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[260px] text-left text-[11px] text-slate-300">
              <caption className="caption-top pb-1 text-left text-slate-400">双向关系 · 亲疏 −100 至 +100</caption>
              <thead>
                <tr><th scope="col">对方宗门</th><th scope="col">状态</th><th scope="col">亲疏</th><th scope="col">始于 Tick</th></tr>
              </thead>
              <tbody>
                {rivals.map((rival) => {
                  const relation = world.diplomacy.find(({ sectAId, sectBId }) =>
                    (sectAId === sect.id && sectBId === rival.id) || (sectBId === sect.id && sectAId === rival.id));
                  return (
                    <tr key={rival.id} className="border-t border-slate-800/70">
                      <th scope="row" className="py-1 font-normal">↔ {rival.name}</th>
                      <td>{relation ? PACT_LABELS[relation.pact] : '未记录'}</td>
                      <td>{relation ? (relation.affinity > 0 ? `+${relation.affinity}` : relation.affinity) : '—'}</td>
                      <td>{relation?.sinceTick ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <section className="mt-2 border-t border-slate-800/80 pt-2" aria-label="本宗围攻记录">
            <h5 className="text-[11px] font-medium text-slate-300">围攻记录</h5>
            {sieges.length === 0 ? <p className="text-[11px] text-slate-400">暂无战役。</p> : (
              <ul className="max-h-36 overflow-y-auto space-y-1">
                {sieges.map((siege) => (
                  <li key={siege.id} className="rounded bg-slate-900/60 p-1.5 text-[11px] text-slate-300">
                    <p>{sectName(siege.attackerSectId)} → {sectName(siege.defenderSectId)} · {locationName(siege.destinationId)}</p>
                    <p className="text-slate-400">
                      {SIEGE_LABELS[siege.status]} · {siege.participantIds.length} 人列入 · 已推进 {siege.rounds} 轮 · 始于 Tick #{siege.startedTick}
                      {siege.lastResolvedTick !== undefined ? ` · 最近推进 Tick #${siege.lastResolvedTick}` : ''}
                    </p>
                    {siege.outcome && <p className="break-words text-amber-200">{siege.outcome}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="mt-2 border-t border-slate-800/80 pt-2" aria-label="本宗贡赋记录">
            <h5 className="text-[11px] font-medium text-slate-300">贡赋记录</h5>
            {demands.length === 0 ? <p className="text-[11px] text-slate-400">暂无索贡记录。</p> : (
              <ul className="max-h-32 overflow-y-auto space-y-1">
                {demands.map((demand) => (
                  <li key={demand.id} className="rounded bg-slate-900/60 p-1.5 text-[11px] text-slate-300">
                    {sectName(demand.demanderSectId)} 向 {sectName(demand.targetSectId)} 索贡 {demand.amount} 灵石 · {TRIBUTE_LABELS[demand.status]} · Tick #{demand.startedTick}
                    {demand.resolvedTick !== undefined ? ` · 结于 Tick #${demand.resolvedTick}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </details>
      )}
    </section>
  );
}
