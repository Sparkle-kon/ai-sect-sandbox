import type { HouseholdCensus, HouseholdView } from '../engine/householdEngine';
import type { Cultivator, WorldState } from '../types/world';

const MEMBERSHIP: Record<NonNullable<HouseholdView['ownMembership']>['status'], string> = {
  resident: '在坊籍内', recruited: '自愿入门留档 · 不再计入该村凡人人口', retired: '已退出登记', deceased: '已故留档',
};
const GUARDIANSHIP: Record<HouseholdView['guardianContracts'][number]['status'], string> = {
  offered: '待受监护方回应', active: '双方已同意，监护有效', declined: '已拒绝', expired: '已过期', renounced: '已撤回', ended: '已终止',
};

export function HouseholdRegisterPanel({ world, census, view, cultivator }: {
  world: WorldState;
  census: HouseholdCensus;
  view: HouseholdView;
  cultivator: Cultivator;
}) {
  const own = view.ownMembership?.settlementId === census.settlementId ? view.ownMembership : undefined;
  const localGroups = new Set(census.groups.map(({ id }) => id));
  if (own) localGroups.add(own.householdId);
  const guardians = view.guardianContracts.filter(({ householdId, openedTick, guardianId, wardId }) =>
    localGroups.has(householdId) && openedTick <= world.tick && (guardianId === cultivator.id || wardId === cultivator.id));
  if (!census.groups.length && !own && !guardians.length) return null;
  const people = new Map(world.cultivators.map(({ id, name }) => [id, name]));

  return (
    <details className="min-w-0 rounded border border-emerald-400/20 bg-slate-950/55">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-emerald-200">家户谱系与代际坊籍</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>家户分支是聚合登记，不指认具体父母。以下均是同一批村民的统计，不在村镇总人口之外重复计数。监护是另行自愿结约，不是血亲、宗门品阶或自动收徒。</p>
        <dl aria-label="本村人口的同口径分解" className="grid grid-cols-2 gap-2 rounded border border-slate-800 p-2">
          <div><dt className="text-slate-400">村镇现有人口</dt><dd>{census.population} 人</dd></div>
          <div><dt className="text-slate-400">匿名成年／未成年</dt><dd>{census.adults}／{census.juveniles} 人</dd></div>
          <div><dt className="text-slate-400">具名在籍居民（子集）</dt><dd>{census.namedResidents} 人</dd></div>
          <div><dt className="text-slate-400">未归入分支</dt><dd>{census.unassigned} 人</dd></div>
        </dl>
        {census.groups.length > 0 && <ol aria-label="本村家户分支汇总" className="max-h-56 space-y-1.5 overflow-y-auto">
          {census.groups.map((group, index) => (
            <li key={group.id} className="min-w-0 space-y-0.5 break-words rounded bg-slate-900/80 p-2">
              <p className="font-semibold text-emerald-100">{group.branch === 'first' ? '家户甲' : '家户乙'} · 登记第 {index + 1} 支 · 当地匿名成年 {group.adults} · 未成年 {group.juveniles} · 具名居民 {group.namedResidents}</p>
              <p className="text-slate-400">此处分支实录：出生 {group.births}、成年 {group.matured}、迁入 {group.migratedIn}、迁出 {group.migratedOut}、死亡 {group.deaths}。</p>
            </li>
          ))}
        </ol>}
        {own && <p className="break-words">本人坊籍：{MEMBERSHIP[own.status]} · 登记 Tick #{own.registeredTick}
          {own.settledTick !== undefined && own.settledTick <= world.tick && ` · 结案 Tick #${own.settledTick}`}
        </p>}
        {guardians.length > 0 && <ol aria-label="仅本人监护结约" className="space-y-1.5">
          {guardians.map((row) => (
            <li key={row.id} className="break-words rounded border border-slate-800 p-2">
              <p>{row.guardianId === cultivator.id ? '本人拟／任监护人' : '本人为受监护方'} · 对方 {people.get(row.guardianId === cultivator.id ? row.wardId : row.guardianId) ?? '姓名未详'} · {GUARDIANSHIP[row.status]}</p>
              <p>结约发起 Tick #{row.openedTick} · {row.status === 'offered' ? `回应截止 Tick #${row.expiresTick}` : row.acceptedTick !== undefined && row.acceptedTick <= world.tick ? `同意 Tick #${row.acceptedTick}` : '未确认同意'}
                {row.settledTick !== undefined && row.settledTick <= world.tick && ` · 留档 Tick #${row.settledTick}`}
              </p>
            </li>
          ))}
        </ol>}
      </div>
    </details>
  );
}
