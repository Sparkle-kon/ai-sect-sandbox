import type { WorldState } from '../types/world';

type Bounty = WorldState['bounties'][number];

export const BOUNTY_STATUS: Record<Bounty['status'], string> = {
  open: '悬赏中',
  claimed: '已领取',
  withdrawn: '已撤销',
};

export function relevantBounty(bounties: Bounty[], cultivatorId: string): Bounty | undefined {
  return bounties.reduce<Bounty | undefined>((best, entry) => {
    if (entry.targetCultivatorId !== cultivatorId) return best;
    if (!best) return entry;
    if (entry.status === 'open' && best.status !== 'open') return entry;
    if (entry.status !== 'open' && best.status === 'open') return best;
    return (entry.settledTick ?? entry.issuedTick) > (best.settledTick ?? best.issuedTick) ? entry : best;
  }, undefined);
}

export function BountyBoard({ world }: { world: WorldState }) {
  const names = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const sects = new Map(world.sects.map(({ id, name }) => [id, name]));
  const open = world.bounties.filter(({ status }) => status === 'open').sort((a, b) => b.issuedTick - a.issuedTick || b.reward - a.reward);
  const resolved = world.bounties.filter(({ status }) => status !== 'open')
    .sort((a, b) => (b.settledTick ?? b.issuedTick) - (a.settledTick ?? a.issuedTick));

  const renderEntry = (entry: Bounty) => (
    <li key={entry.id} className="space-y-1 rounded-lg border border-slate-800/80 bg-slate-950/70 p-2 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-semibold text-slate-100">{names.get(entry.targetCultivatorId) ?? '修士未详'}</span>
        <span className={entry.status === 'open' ? 'text-rose-300' : 'text-slate-400'}>{BOUNTY_STATUS[entry.status]}</span>
        <span className="text-amber-200">赏金 {entry.reward} 灵石</span>
      </div>
      <p className="text-slate-200 break-words">{entry.reason}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span>发布 Tick #{entry.issuedTick}</span>
        {entry.settledTick !== undefined && <span>结案 Tick #{entry.settledTick}</span>}
        {entry.hunterId && <span>领赏：{names.get(entry.hunterId) ?? '修士未详'}</span>}
      </div>
      <p className="text-[11px] text-slate-400">出资宗门：{entry.sponsorSectIds.length > 0
        ? entry.sponsorSectIds.map((id) => sects.get(id) ?? '宗门未详').join('、') : '无记录'}</p>
      {entry.escrow.length > 0 && (
        <p className="text-[11px] text-slate-400">
          {entry.status === 'open' ? '托管赏金' : '托管记录'}：{entry.escrow.map(({ sectId, amount }) => `${sects.get(sectId) ?? '宗门未详'} ${amount} 灵石`).join('、')}
        </p>
      )}
    </li>
  );

  return (
    <section aria-label="天机悬赏榜" className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="text-xs font-bold tracking-wider text-slate-200">天机悬赏榜</h3>
      <div className="space-y-1.5">
        <h4 className="text-[11px] font-semibold text-rose-200">公开悬赏 · {open.length} 条</h4>
        {open.length > 0 ? (
          <ul className="max-h-48 overflow-y-auto space-y-1.5">{open.map(renderEntry)}</ul>
        ) : <p className="text-xs text-slate-400">当前没有公开悬赏。</p>}
      </div>
      {resolved.length > 0 && (
        <details className="border-t border-slate-800/80 pt-2">
          <summary className="cursor-pointer text-[11px] text-slate-300">查看已结案悬赏 · {resolved.length} 条</summary>
          <ul className="mt-2 max-h-48 overflow-y-auto space-y-1.5">{resolved.map(renderEntry)}</ul>
        </details>
      )}
    </section>
  );
}
