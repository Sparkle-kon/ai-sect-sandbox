import { MARKET_GOODS } from '../engine/marketEngine';
import { projectLocalVillageFair, projectVillageFairs, VILLAGE_FAIR_FEE } from '../engine/villageFairEngine';
import type { Cultivator, VillageFair, VillageFairStall, WorldState } from '../types/world';

const CLOSURE: Record<NonNullable<VillageFair['closure']>, string> = {
  site_hazard: '场地有实际灾险', sponsor_absent: '发起人未到场', venue_missing: '场地已不符合开市条件',
};

const RELEASE: Record<NonNullable<VillageFairStall['releaseReason']>, string> = {
  fair_cancelled: '乡集取消', merchant_absent: '开市时未到场', order_unavailable: '开市时原挂单无可用实货',
};

const offeringText = (offering: NonNullable<VillageFairStall['offering']>) =>
  `${MARKET_GOODS[offering.good]?.label ?? '货品未记名'} ${offering.quantity} 份 · 每份 ${offering.unitPrice} 灵石`;

export function VillageFairPanel({ world, cultivator, villageId }: {
  world: WorldState; cultivator: Cultivator; villageId: string;
}) {
  const fair = projectVillageFairs(world, cultivator);
  if (!fair || fair.settlementId !== villageId) return null;
  const { ownStall, status } = fair;
  const open = status === 'open' && !!projectLocalVillageFair(world, cultivator);
  return <details className="min-w-0 rounded border border-amber-400/20 bg-slate-950/60">
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-amber-100">乡集与摊位</summary>
    <div className="min-w-0 space-y-2 break-words px-3 pb-3 text-xs leading-relaxed text-slate-300">
      <p className="font-medium text-amber-100">{status === 'cancelled' ? '本次乡集已取消' : status === 'ended' ? '本次乡集已收市'
        : status === 'open' ? open ? '乡集正在开市' : '已开市，现场当前不列售' : '本次乡集已排期，尚未开市'}</p>
      {fair.closedTick !== undefined && <p>第 {fair.closedTick} 轮{status === 'cancelled' ? '取消' : '收市'}。
        {status === 'cancelled' && fair.closure && `未能开市：${CLOSURE[fair.closure]}。`}</p>}
      <p>第 {fair.announcedTick} 轮公布 · 仅第 {fair.claimTick} 轮可预留 ·
        {status === 'open' || status === 'ended' ? '开市' : '原定开市'}第 {fair.opensTick} 轮 · 第 {fair.endsTick} 轮起不再开市。</p>
      <p>本期曾预留 {fair.reserved}/{fair.capacity} 席。摊位不是访客数，也不计入村籍。</p>
      {open && <div className="space-y-1">
        <h5 className="font-semibold text-slate-200">现有挂售</h5>
        {fair.offerings.length ? <ul aria-label="本地匿名在售货品" className="space-y-1">
          {fair.offerings.map((offering, index) => <li key={index}>{offeringText(offering)}</li>)}
        </ul> : <p>当前没有仍在挂售的摊位货品。</p>}
        <p className="text-slate-400">这里列的是坊市挂单的实际余货，不是成交记录。</p>
      </div>}
      {ownStall && <div aria-label="本人摊位凭据" className="space-y-1 rounded border border-slate-800 p-2">
        <h5 className="font-semibold text-slate-200">本人摊位 · 第 {ownStall.reservedTick} 轮预留</h5>
        {ownStall.status === 'reserved' && <p>摊费托管 {ownStall.feeEscrow} 灵石，尚未支付。</p>}
        {ownStall.status === 'refund_due' && <p>应退 {ownStall.feeEscrow} 灵石，仍在托管，尚未实退。</p>}
        {ownStall.status === 'paid' && ownStall.settledTick !== undefined &&
          <p>第 {ownStall.settledTick} 轮实付本地摊费 {VILLAGE_FAIR_FEE} 灵石。</p>}
        {ownStall.status === 'refunded' && ownStall.settledTick !== undefined &&
          <p>第 {ownStall.settledTick} 轮摊费已实退 {VILLAGE_FAIR_FEE} 灵石。</p>}
        {ownStall.releaseReason && <p>释放原因：{RELEASE[ownStall.releaseReason]}。</p>}
        {ownStall.offering && <p>开市时的原挂售：{offeringText(ownStall.offering)}。此凭据不是当前余货。</p>}
      </div>}
    </div>
  </details>;
}
