import { relocationQuorum, visibleRelocations } from '../engine/relocationEngine';
import { FACILITY_RULES } from '../engine/sectEconomyEngine';
import type { Cultivator, FacilityKind, WorldState } from '../types/world';

type Plan = WorldState['relocations']['plans'][number];
const STATUS: Record<Plan['status'], string> = { voting: '表决中', in_transit: '迁移在途', settled: '已迁毕', aborted: '迁移中止' };

export function SectRelocationPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator | undefined }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  const sect = world.sects.find(({ id }) => id === viewer?.sectId);
  const scope = viewer && sect && world.relocations ? visibleRelocations(world, viewer) : undefined;
  const plans = (scope?.plans ?? []).filter((item) => item.sectId === sect?.id && item.openedTick <= world.tick)
    .sort((a, b) => Number(b.status === 'in_transit') - Number(a.status === 'in_transit') || b.openedTick - a.openedTick);
  const oldSites = (scope?.abandonedSites ?? []).filter((item) => item.sectId === sect?.id && item.tick <= world.tick).sort((a, b) => b.tick - a.tick);
  const people = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const sites = new Map(world.locations.map(({ id, name }) => [id, name]));
  const person = (id: string) => people.get(id) ?? '姓名未详';
  const node = (id: string) => sites.get(id) ?? '地点未详';

  return (
    <section aria-label="山门迁移与旧址档案" className="min-w-0 space-y-2 rounded-xl border border-amber-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <header className="space-y-1">
        <h4 className="text-sm font-semibold text-amber-100">山门迁移与旧址档案</h4>
        <p className="break-words text-xs text-slate-300">{sect ? `${sect.name} · 当前登记山门：${node(sect.headquartersId)}` : viewer ? '散修没有本宗迁移档案。' : '选择修士查看所属宗门的迁移档案。'}</p>
        {sect && <p className="text-xs text-slate-400">只读记录；抵达才变更登记山门。旧址固定设施不计入迁移托管。</p>}
      </header>
      {sect && <>
        <h5 className="text-xs font-semibold text-amber-100">迁移决议与在途交割</h5>
        {plans.length === 0 && <p className="text-xs text-slate-400">本宗尚无迁移决议。</p>}
        {plans.map((plan) => {
          const voters = new Set(plan.voterIds);
          const votes = [...new Map(plan.votes.filter(({ actorId, tick }) => voters.has(actorId) && tick <= world.tick)
            .sort((a, b) => a.tick - b.tick).map((item) => [item.actorId, item])).values()];
          const approvals = votes.filter((item) => item.approve).length;
          const former = plan.status === 'settled' && oldSites.find((old) => old.planId === plan.id && old.sectId === plan.sectId &&
            old.originId === plan.originId && old.destinationId === plan.destinationId && old.tick === plan.settledTick);
          const workshopClosed = former && world.workshopDisbandments.closures.some((closure) =>
            closure.planId === plan.id && closure.abandonedSiteId === former.id && closure.sectId === plan.sectId &&
            closure.originId === former.originId && closure.destinationId === former.destinationId && closure.tick === former.tick);
          return (
            <details key={plan.id} className="min-w-0 rounded border border-slate-800 bg-slate-950/60">
              <summary className="min-h-11 cursor-pointer break-words px-3 py-2 text-xs font-semibold text-slate-100">
                {node(plan.originId)} → {node(plan.destinationId)} · {STATUS[plan.status]}
              </summary>
              <div className="space-y-2 border-t border-slate-800 p-3 text-xs text-slate-300">
                <p className="break-words">提案：{person(plan.proposerId)} · Tick #{plan.openedTick} · 表决截止 Tick #{plan.deadlineTick}</p>
                <p>同意 {approvals} 票 · 反对 {votes.length - approvals} 票 · 邀请 {voters.size} 人 · 通过需 {relocationQuorum(plan)} 票</p>
                {votes.length > 0 && <ul className="max-h-36 space-y-1 overflow-y-auto text-slate-400" aria-label="出席表决记录">
                  {votes.map((vote) => <li className="break-words" key={vote.actorId}>{person(vote.actorId)}：{vote.approve ? '同意' : '反对'} · Tick #{vote.tick}</li>)}
                </ul>}
                <p>迁移补给：{plan.stoneCost} 灵石、玄土根 {plan.earthCost} 株 · {plan.spent ? '已支应' : '尚未支应'}</p>
                {plan.departedTick !== undefined && <p>启程 Tick #{plan.departedTick}{plan.settledTick !== undefined ? ` · 结案 Tick #${plan.settledTick}` : ''}</p>}
                {plan.status === 'in_transit' && <>
                  <p>实际路线进度：已行 {plan.pathIndex}/{Math.max(0, plan.path.length - 1)} 段</p>
                  {plan.path.length > 1 && <progress aria-label="迁移路线进度" className="h-2 w-full accent-amber-400" max={plan.path.length - 1} value={plan.pathIndex} />}
                  <p>在途托管：{plan.custody.stones} 灵石 · 功法 {plan.custody.pavilion.length} 部</p>
                  {plan.custody.pavilion.length > 0 && <p className="break-words text-slate-400">功法：{plan.custody.pavilion.map(({ name }) => name).join('、')}</p>}
                </>}
                {plan.garrisonIds.length > 0 && <p className="break-words">启程名册（非到达确认）：{plan.garrisonIds.map(person).join('、')}</p>}
                {plan.status === 'settled' && <p className="text-emerald-200">迁移已交割，托管财库与功法并入新址，不再计作在途资产。</p>}
                {workshopClosed && <p className="text-amber-200">旧址工坊章程随迁移终止。新址只接续山门，不接续旧委托，也不表示已开设新工坊。</p>}
              </div>
            </details>
          );
        })}
        <h5 className="text-xs font-semibold text-amber-100">已弃旧址</h5>
        {oldSites.length === 0 ? <p className="text-xs text-slate-400">本宗尚无弃置山门记录。</p> : <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {oldSites.map((old) => {
            const currentOwner = world.sects.find(({ headquartersId }) => headquartersId === old.originId);
            const structures = (Object.keys(FACILITY_RULES) as FacilityKind[]).filter((kind) => old.facilities[kind] > 0)
              .map((kind) => `${FACILITY_RULES[kind].name} ${old.facilities[kind]} 阶`);
            return <li key={old.id} className="break-words rounded bg-slate-950/60 p-2 text-xs text-slate-300">
              <p>{node(old.originId)} · {currentOwner ? `曾弃置，现为${currentOwner.name}山门` : '已弃置，非活动山门'} · Tick #{old.tick}</p>
              <p className="text-slate-400">迁往 {node(old.destinationId)} · 弃置时护山阵 {old.arrayHp}/{old.arrayMaxHp}{structures.length ? ` · 留存设施：${structures.join('、')}` : ''}</p>
            </li>;
          })}
        </ul>}
      </>}
    </section>
  );
}
