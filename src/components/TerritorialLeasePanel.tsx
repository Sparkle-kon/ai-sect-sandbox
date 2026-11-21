import {
  LEASE_DEPOSIT, LEASE_QUOTA, LEASE_TERM_TICKS, LEASE_UNIT_RENT,
  territorialLeaseAvailability, visibleTerritorialLeases,
} from '../engine/territorialLeaseEngine';
import type { Cultivator, TerritorialLease, WorldState } from '../types/world';
import { HERB_LABELS } from '../engine/alchemyEngine';

const STATUS: Record<TerritorialLease['status'], string> = {
  offered: '待签署 · 许可未生效', active: '许可生效', closed: '许可终止', declined: '已拒绝', expired: '报价过期',
};
const CLOSE: Record<NonNullable<TerritorialLease['endReason']>, string> = {
  expiry: '租期已满', title_change: '实际地权已变更，原许可失效', surrender: '承租方主动交还许可',
};

export function TerritorialLeasePanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator }) {
  const actor = world.cultivators.find(({ id }) => id === cultivator.id);
  const leases = visibleTerritorialLeases(world, actor).sort((a, b) => b.openedTick - a.openedTick);
  if (!actor || !leases.length) return null;
  const sects = new Map(world.sects.map(({ id, name }) => [id, name]));
  const sites = new Map(world.locations.map((site) => [site.id, site]));
  const people = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const sectName = (id?: string) => (id && sects.get(id)) || '地权未详';

  return (
    <details className="min-w-0 rounded border border-emerald-400/25 bg-slate-950/55">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-emerald-100">地契租赁与采集许可</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p className="text-slate-400">采集许可不是领土转让，地主仍可采集。签约预托管 {LEASE_DEPOSIT} 灵石，{LEASE_TERM_TICKS} 轮内承租方共可采 {LEASE_QUOTA} 株，每实际采一株才结付 {LEASE_UNIT_RENT} 灵石。此页只读。</p>
        <ul aria-label="本宗可查的采集租契" className="max-h-[27rem] space-y-2 overflow-y-auto">
          {leases.map((lease) => {
            const site = sites.get(lease.siteId);
            const proposed = lease.startsTick === undefined || lease.startsTick > world.tick;
            const gate = territorialLeaseAvailability(world, lease);
            const status = lease.status === 'active' ? {
              ready: STATUS.active, hostility: '敌对期间，采集暂停', title_change: '地权变更，原许可失效',
              expired: '租期已满，许可失效', exhausted: '承租配额已用尽', inactive: '许可当前无效', treasury_full: '地主库容不足，采集暂停',
            }[gate] : lease.status === 'offered' && world.tick >= lease.offerExpiresTick ? STATUS.expired : STATUS[lease.status];
            return (
              <li key={lease.id} className="min-w-0 space-y-1.5 break-words rounded border border-slate-800 p-2">
                <h5 className="font-semibold text-emerald-100">{site?.name ?? '旧址未详'} · {status}</h5>
                <p>实际地权：{site?.ownerSectId ? sectName(site.ownerSectId) : site ? '无宗门地权' : '旧址地权不可查'}</p>
                <p>签约地主 {sectName(lease.ownerSectId)} · 承租方 {sectName(lease.lesseeSectId)}
                  {lease.ownerSectId === actor.sectId ? ' · 本宗出租' : ' · 本宗承租'}
                </p>
                {proposed ? <p>拟预托管 {LEASE_DEPOSIT} 灵石，未预付、不授予采集权 · 回应截止 Tick #{lease.offerExpiresTick}</p> : <>
                  <p>实际签约 Tick #{lease.startsTick}{lease.endsTick !== undefined && ` · 到期 Tick #${lease.endsTick}（到期即失效）`} · 实际预托管 {lease.escrow + lease.rentPaid + lease.refunded} 灵石</p>
                  <p>实采 {lease.usedUnits}/{LEASE_QUOTA} 株 · 地主实收 {lease.rentPaid} 灵石 · 承租方实收退款 {lease.refunded} 灵石</p>
                  <p>{lease.status === 'closed' ? '待退未结的托管款' : '还在托管的余款'}：{lease.escrow} 灵石</p>
                  {lease.endReason && <p>结案：{CLOSE[lease.endReason]}{lease.settledTick !== undefined && ` · Tick #${lease.settledTick}`}</p>}
                </>}
                {lease.receipts.length > 0 && <ol aria-label="近期实际采集与退款流水" className="list-inside list-disc space-y-1">
                  {lease.receipts.filter(({ tick }) => tick <= world.tick).slice(-8).reverse().map((receipt, index) => (
                    <li key={index}>Tick #{receipt.tick} · {receipt.kind === 'harvest'
                      ? `${people.get(receipt.actorId ?? '') ?? '采集者姓名未详'}采集 ${receipt.herbId ? HERB_LABELS[receipt.herbId] : '灵草'} ${receipt.units ?? 0} 株，实付租金 ${receipt.amount} 灵石`
                      : `托管实退 ${receipt.amount} 灵石`}
                    </li>
                  ))}
                </ol>}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
