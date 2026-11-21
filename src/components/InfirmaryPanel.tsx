import {
  INFIRMARY_DETOX_MAX,
  INFIRMARY_HEAL_FRACTION,
  INFIRMARY_TREATMENT_HERBS,
  INFIRMARY_TREATMENT_STONES,
  visibleInfirmaries,
} from '../engine/infirmaryEngine';
import type { Cultivator, InfirmaryCase, WorldState } from '../types/world';

const STATUS: Record<InfirmaryCase['status'], string> = {
  waiting: '等待救治', treated: '已同意并接受救治', refused: '本人已拒绝', closed: '排队已结束',
};
const END: Record<NonNullable<InfirmaryCase['reason']>, string> = {
  expiry: '等候期满', ineligible: '此时已不具资格', recovered: '已无需救治', refused: '未同意救治',
};

export function InfirmaryPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator.id);
  const view = visibleInfirmaries(world, viewer);
  if (!view) return null;
  const { capacity, ownCases, ownShift, ownQueuePosition } = view;
  if (!capacity && !ownCases.length && !ownShift) return null;
  const sect = world.sects.find(({ id }) => id === view.sectId);
  const sites = new Map(world.locations.map(({ id, name }) => [id, name]));

  return (
    <details className="min-w-0 rounded border border-teal-400/25 bg-slate-950/55">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-teal-100">宗门静养院与救治调度</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p className="break-words">{sect?.name ?? '宗门未详'} · 静养院 · Tick #{world.tick}。此处只读，不显示其他病患资料。</p>
        {capacity ? (
          <dl className="grid grid-cols-2 gap-2 rounded border border-slate-800 p-2 sm:grid-cols-4" aria-label="当前诊台汇总">
            <div><dt className="text-slate-400">床位上限</dt><dd>{capacity.beds}</dd></div>
            <div><dt className="text-slate-400">本轮值守</dt><dd>{capacity.onDuty}</dd></div>
            <div><dt className="text-slate-400">耗材可供</dt><dd>{capacity.stocked} 份</dd></div>
            <div><dt className="text-slate-400">本轮可救治</dt><dd>{capacity.available} 人</dd></div>
          </dl>
        ) : <p className="text-slate-400">未在诊台现场，仅显示本人档案，不显示当前排队或耗材。</p>}
        <p className="text-slate-400">实际救治须由本人同意。规则每次用本宗 {INFIRMARY_TREATMENT_STONES} 灵石和院中翡翠灵叶 {INFIRMARY_TREATMENT_HERBS} 株，至多恢复最大气血的 {Math.round(100 * INFIRMARY_HEAL_FRACTION)}%，最多消解 {INFIRMARY_DETOX_MAX} 点丹毒。等待和拒绝不算救治，也不扣耗材。</p>
        {ownShift && <p>本人值守记录：{sites.get(ownShift.siteId) ?? '旧院地点未详'} · Tick #{ownShift.startedTick} 至 #{ownShift.expiresTick} 前
          {ownShift.lastServedTick !== undefined && ownShift.lastServedTick <= world.tick && ` · 最近救治 Tick #${ownShift.lastServedTick}`}
        </p>}
        <h5 className="font-semibold text-teal-100">本人救治记录</h5>
        {ownCases.length ? (
          <ol aria-label="仅本人诊疗档案" className="max-h-[25rem] space-y-2 overflow-y-auto">
            {[...ownCases].filter(({ queuedTick }) => queuedTick <= world.tick).sort((a, b) => b.queuedTick - a.queuedTick).map((entry) => {
              const receipt = entry.receipt && entry.receipt.tick <= world.tick ? entry.receipt : undefined;
              const waiting = entry.status === 'waiting' && world.tick < entry.expiresTick;
              const ended = entry.status === 'waiting' && !waiting;
              return (
                <li key={entry.id} className="min-w-0 space-y-1 break-words rounded border border-slate-800 bg-slate-900/65 p-2">
                  <p className="font-semibold text-slate-100">{ended ? '等候期已满' : STATUS[entry.status]} · {sites.get(entry.siteId) ?? '旧院地点未详'}</p>
                  <p>登记 Tick #{entry.queuedTick} · 等候截止 Tick #{entry.expiresTick}
                    {entry.settledTick !== undefined && ` · 结案 Tick #${entry.settledTick}`}
                  </p>
                  {waiting && capacity && ownQueuePosition !== undefined && <p>本人当前排位：第 {ownQueuePosition} 位</p>}
                  {entry.reason && <p>结案原因：{END[entry.reason]}</p>}
                  {receipt && <p className="text-emerald-200">Tick #{receipt.tick} 实际用药：{receipt.stonesSpent} 灵石、翡翠灵叶 {receipt.herbsSpent} 株 · 气血 +{receipt.hpRestored} · 丹毒 −{receipt.toxicityRemoved}</p>}
                </li>
              );
            })}
          </ol>
        ) : <p className="text-slate-400">暂无本人救治记录。</p>}
      </div>
    </details>
  );
}
