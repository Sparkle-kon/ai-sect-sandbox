import { formationLinkAvailability, FORMATION_BUFFER_CAP, FORMATION_DRAW_CAP, FORMATION_MAX_THROUGHPUT, FORMATION_SETUP_COST, visibleFormationLinks } from '../engine/formationNetworkEngine';
import type { Cultivator, FormationLink, FormationReceipt, WorldState } from '../types/world';

const STATUS: Record<FormationLink['status'], string> = {
  offered: '待对方同意', active: '阵网已连通', broken: '灵路断开', ended: '阵网已终止', declined: '已拒绝', expired: '邀约已过期',
};

function describeReceipt(row: FormationReceipt, site: (id?: string) => string) {
  if (row.kind === 'draw') return `从${site(row.fromSiteId)}实际取用 ${row.drawn ?? 0} 灵气`;
  if (row.kind === 'repair') return `实付 ${row.stonesSpent ?? 0} 灵石修复阵网`;
  if (row.kind === 'dissipate') return `已自然散失 ${row.dissipated ?? 0} 灵气`;
  return `${site(row.fromSiteId)} → ${site(row.toSiteId)} · 发出 ${row.sent ?? 0}、实收 ${row.delivered ?? 0}、损耗 ${row.lost ?? 0}${row.kind === 'overload' ? ' · 调拨过载断链' : ''}`;
}

export function FormationNetworkPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator }) {
  const actor = world.cultivators.find(({ id }) => id === cultivator.id);
  const links = actor ? visibleFormationLinks(world, actor).filter((link) =>
    link.sectAId === actor.sectId || link.sectBId === actor.sectId) : [];
  if (!links.length) return null;
  const sites = new Map(world.locations.map(({ id, name }) => [id, name]));
  const names = new Map(world.sects.map(({ id, name }) => [id, name]));
  const site = (id?: string) => (id && sites.get(id)) || '旧阵址未详';

  return (
    <details className="min-w-0 rounded border border-teal-400/25 bg-slate-950/55">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-teal-100">阵网连通与灵气调拨</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p className="text-slate-400">只读账簿。灵气在两处实有阵法之间调拨，每端至多存 {FORMATION_BUFFER_CAP} 灵气，一次可传输至多 {FORMATION_MAX_THROUGHPUT}、取用至多 {FORMATION_DRAW_CAP} 灵气。过载仅断链，不造成爆炸伤害。</p>
        <ul aria-label="本宗有权查看的阵网" className="max-h-[28rem] space-y-2 overflow-y-auto">
          {[...links].sort((a, b) => (b.fundedTick ?? b.openedTick) - (a.fundedTick ?? a.openedTick)).map((link) => {
            const funded = link.fundedTick !== undefined && link.fundedTick <= world.tick;
            const receipts = link.receipts.filter(({ tick }) => tick <= world.tick).slice(-6).reverse();
            const expired = link.status === 'offered' && world.tick >= link.offerExpiresTick;
            const availability = funded && (link.status === 'active' || link.status === 'broken') ? formationLinkAvailability(world, link) : 'ready';
            const status = {
              ready: expired ? STATUS.expired : STATUS[link.status], hostility: '宗门敌对，调拨暂停',
              relocating: '阵端迁移，调拨暂停', site_lost: '原阵址已失效',
            }[availability];
            return (
              <li key={link.id} className="min-w-0 space-y-1.5 break-words rounded border border-slate-800 p-2">
                <h5 className="font-semibold text-teal-100">{site(link.siteAId)} ↔ {site(link.siteBId)} · {status}</h5>
                <p>{names.get(link.sectAId) ?? '宗门未详'}与{names.get(link.sectBId) ?? '宗门未详'} · 距离 {link.steps} 格</p>
                {funded ? <>
                  <p>两宗已各付 {link.openedPaymentEach} 灵石 · 建成 Tick #{link.fundedTick}</p>
                  <p>两端当前存量：{site(link.siteAId)} {link.heldA}、{site(link.siteBId)} {link.heldB} 灵气</p>
                  <p>累计调拨：发出 {link.sentTotal}、实收 {link.deliveredTotal}、途中损耗 {link.transmissionLoss} 灵气</p>
                  <p>累计取用 {link.drawnTotal}、存量散失 {link.dissipatedTotal} 灵气 · 累计修复支出 {link.repairTotal} 灵石</p>
                  {link.status === 'broken' && link.brokenTick !== undefined && <p className="text-rose-200">断链始于 Tick #{link.brokenTick}，未修复前不可发出。</p>}
                  {link.lastRepairTick !== undefined && <p>最近修复 Tick #{link.lastRepairTick}</p>}
                  {link.endReason && <p>终止原因：{link.endReason === 'site_lost' ? '原阵址已失效' : '宗门进入敌对状态'}</p>}
                </> : <p>拟每宗支付 {FORMATION_SETUP_COST} 灵石，尚未建成或付款 · 实付 {link.openedPaymentEach} 灵石 · 回应截止 Tick #{link.offerExpiresTick}</p>}
                {!!receipts.length && <ol aria-label="近期实际灵气或修复流水" className="list-inside list-disc space-y-1 text-slate-300">
                  {receipts.map((row, index) => <li key={index}>Tick #{row.tick} · {describeReceipt(row, site)}</li>)}
                </ol>}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
