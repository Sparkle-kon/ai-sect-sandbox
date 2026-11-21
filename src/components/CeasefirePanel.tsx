import { CEASEFIRE_AID_DELAY, visibleCeasefires } from '../engine/ceasefireEngine';
import { knownMapLocations } from '../engine/terrainEngine';
import type { Cultivator, WorldState } from '../types/world';

type Agreement = WorldState['ceasefires']['agreements'][number];
const STATUS: Record<Agreement['status'], string> = {
  offered: '待双方签署', active: '停战生效', declined: '已拒绝', expired: '未署齐，已过期', fulfilled: '已履行', breached: '已违约',
};
const BREACH: Record<NonNullable<Agreement['breach']>['kind'], string> = { renounced: '单方撕毁停战', hostile_damage: '已核实的敌对伤害' };

export function CeasefirePanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator | undefined }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator?.id);
  const sect = world.sects.find(({ id }) => id === viewer?.sectId);
  const agreements = world.ceasefires && sect && viewer ? visibleCeasefires(world, viewer)
    .filter((row) => row.openedTick <= world.tick && (row.proposerSectId === sect.id || row.targetSectId === sect.id))
    .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.openedTick - a.openedTick) : [];
  const names = new Map(world.sects.map(({ id, name }) => [id, name]));
  const actors = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const sites = new Map((viewer ? knownMapLocations(world, viewer) : []).map(({ id, name }) => [id, name]));
  const sieges = new Map(world.sieges.map((row) => [row.id, row]));
  const sectName = (id: string) => names.get(id) ?? '宗门未详';
  const actorName = (id: string) => actors.get(id) ?? '姓名未详';

  return (
    <section aria-label="本宗停战与重建档案" className="min-w-0 space-y-2 rounded-xl border border-emerald-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <header className="space-y-1">
        <h4 className="text-sm font-semibold text-emerald-100">本宗停战与重建档案</h4>
        <p className="break-words text-xs text-slate-300">{sect ? `${sect.name} · Tick #${world.tick}` : viewer ? '散修无本宗协定。' : '选择修士后查看所属宗门的协定。'}</p>
        {sect && <p className="text-xs text-slate-400">协定与托管数据只读。已撤军不作战败计算，承诺的援助不等于已拨款。</p>}
      </header>
      {sect && !agreements.length && <p className="text-xs text-slate-400">本宗暂无可阅停战协定。</p>}
      <div className="max-h-[30rem] space-y-2 overflow-y-auto">
        {agreements.map((record) => {
          const terms = record.terms;
          const withdrawn = record.withdrawnSiegeIds.flatMap((id) => {
            const siege = sieges.get(id);
            return siege?.status === 'withdrawn' ? [siege] : [];
          });
          const released = record.aidReleasedTick !== undefined && record.aidReleasedTick <= world.tick;
          const breach = record.breach;
          return (
            <details key={record.id} className="min-w-0 rounded border border-slate-800 bg-slate-950/55">
              <summary className="min-h-11 cursor-pointer break-words px-3 py-2 text-xs font-semibold text-emerald-100">
                {sectName(record.proposerSectId)} ↔ {sectName(record.targetSectId)} · {STATUS[record.status]}
              </summary>
              <div className="space-y-2 border-t border-slate-800 p-3 text-xs text-slate-300">
                <p className="break-words">提出 Tick #{record.openedTick} · 拟议双方：{actorName(record.proposerId)}、{actorName(record.targetLeaderId)}
                  {record.status === 'offered' ? ` · 提案到期 Tick #${record.offerExpiresTick}` : ''}</p>
                {(record.signedTick !== undefined || record.settledTick !== undefined) && <p>
                  {record.signedTick !== undefined ? `实际签署 Tick #${record.signedTick}` : '未签署'}
                  {record.endsTick !== undefined ? ` · 原定结束 Tick #${record.endsTick}` : ''}
                  {record.settledTick !== undefined ? ` · 实际结案 Tick #${record.settledTick}` : ''}
                </p>}
                <div className="space-y-1 border-t border-slate-800 pt-2">
                  <h5 className="font-semibold text-emerald-100">停战条款与保证金</h5>
                  <p>约定停战 {terms.duration} 个月 · 双方各 {terms.bondPerSide} 灵石保证金</p>
                  <p className="break-words">实际托管保证金：{sectName(record.proposerSectId)} {record.escrow.proposerBond}，{sectName(record.targetSectId)} {record.escrow.targetBond} 灵石</p>
                  {record.status === 'fulfilled' && <p className="text-slate-400">守约期满，双方保证金已各自退还；不会自动复战。</p>}
                </div>
                <div className="space-y-1 border-t border-slate-800 pt-2">
                  <h5 className="font-semibold text-emerald-100">重建援助</h5>
                  <p className="break-words">约定 {sectName(terms.aidPayerSectId)} → {sectName(terms.aidRecipientSectId)} {terms.aidAmount} 灵石</p>
                  <p>当前托管援助 {record.escrow.aid} 灵石 · {released ? `实际拨付 ${terms.aidAmount} 灵石（Tick #${record.aidReleasedTick}）` : '尚无已拨付记录'}</p>
                  {record.status === 'active' && !released && terms.aidAmount > 0 && <p className="text-slate-400">签署至少 {CEASEFIRE_AID_DELAY} 个月，且停战维持、撤军核实后才拨款。</p>}
                </div>
                <div className="space-y-1 border-t border-slate-800 pt-2">
                  <h5 className="font-semibold text-emerald-100">停战撤军 · {record.withdrawnSiegeIds.length} 支</h5>
                  {withdrawn.length > 0 ? <ul className="space-y-1 text-slate-400">{withdrawn.map((army) => <li key={army.id} className="break-words">
                    {sectName(army.attackerSectId)}对{sectName(army.defenderSectId)}的战役 · 已撤军（非战败）
                    {sites.has(army.destinationId) ? ` · ${sites.get(army.destinationId)}` : ''}
                    {army.lastResolvedTick === undefined ? '' : ` · Tick #${army.lastResolvedTick}`}
                  </li>)}</ul> : <p className="text-slate-400">{record.withdrawnSiegeIds.length ? '保留撤军计数，详细战役已归档。' : '暂无实际撤军记录。'}</p>}
                </div>
                {breach && breach.tick <= world.tick && <div className="space-y-1 rounded border border-rose-800 bg-rose-950/30 p-2 text-rose-200">
                  <h5 className="font-semibold">已记录的违约</h5>
                  <p className="break-words">{sectName(breach.offenderSectId)} · {BREACH[breach.kind]} · Tick #{breach.tick} · 扣缴违约方保证金 {breach.forfeitedBond} 灵石</p>
                  <p className="break-words">扣缴款转交{sectName(breach.offenderSectId === record.proposerSectId ? record.targetSectId : record.proposerSectId)}；违约时恢复敌对，违约方声望下降。</p>
                </div>}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
