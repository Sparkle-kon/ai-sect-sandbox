import { visibleWorkshopOrders, workshopTerms } from '../engine/workshopEngine';
import { WORKSHOP_CAPACITY_RECOVERY_TICKS } from '../engine/workshopCapacityTerms';
import { knownMapLocations } from '../engine/terrainEngine';
import type { Cultivator, WorldState } from '../types/world';

type Order = ReturnType<typeof visibleWorkshopOrders>[number];
const STATUS: Record<Order['status'], string> = {
  offered: '等待工匠同意', active: '工期内', completed: '已完成工序并结算',
  cancelled: '已终止', declined: '工匠未同意', expired: '已过期',
};
const CLOSE: Record<NonNullable<Order['closeReason']>, string> = {
  patron_cancelled: '委托方取消', maker_cancelled: '工匠取消', offer_expired: '邀约过期',
  work_expired: '工期已满', patron_unavailable: '委托方无法交接', maker_unavailable: '工匠无法继续', site_unavailable: '工坊地点已失效',
  institution_closed: '原山门工坊章程终止',
};
const QUALITY = { failed: '未成品', standard: '合格', fine: '精良' } as const;

function ClosureReceipt({ world, order, patron }: { world: WorldState; order: Order; patron: boolean }) {
  const closure = world.workshopDisbandments.closures.find((row) => row.id === order.disbandmentId &&
    row.originId === order.siteId && row.sectId === order.institution?.sectId && row.tick === order.settledTick && row.tick <= world.tick);
  const returned = closure?.returns.find((row) => row.orderId === order.id && row.patronId === order.patronId &&
    row.makerId === order.makerId && row.acceptedTick === order.acceptedTick && row.tier === order.tier && row.quantity === order.quantity &&
    row.refundedStones === order.refundedStones && row.refundedHerbs === order.refundedHerbs);
  const voided = order.acceptedTick === undefined && closure?.voidedOfferIds.includes(order.id);
  return <div aria-label="旧工坊撤并凭据" className="space-y-1 rounded border border-slate-800 p-2">
    <p>新山门不自动接续这份旧委托。</p>
    {voided ? <p>未付款邀约已作废；没有托管或退款。</p> : returned ? <>
      {patron ? <p className="text-emerald-200">已实退至本人：{returned.refundedStones} 灵石、玄土根 {returned.refundedHerbs} 株，仅退未耗余料。</p>
        : <p>未耗余料退给原委托方，不归承制人。</p>}
      <p>已实际完成的工序、已付工钱与已交割器物保留，不重复结算。</p>
    </> : <p className="text-slate-400">目前没有可核验的本单撤并款物凭据。</p>}
  </div>;
}

function CapacityReceipt({ order, tick, patron, receipts }: {
  order: Order; tick: number; patron: boolean; receipts: Order['work'];
}) {
  const { capacityOffer: offer, capacityAmendment: amendment, acceptedTick, deadlineTick } = order;
  if (order.institution || order.quantity !== 2 || acceptedTick === undefined || deadlineTick === undefined ||
      !offer || offer.makerId !== order.makerId || offer.offeredTick > tick || offer.offeredTick >= deadlineTick ||
      offer.damagedTick <= offer.blankTick || offer.damagedTick > offer.offeredTick || offer.blankTick <= acceptedTick ||
      !receipts.some(({ stage, piece, makerId, tick: blankTick }) =>
        stage === 'blank' && piece === 1 && makerId === offer.makerId && blankTick === offer.blankTick)) return null;

  const amended = amendment && amendment.patronId === order.patronId &&
    amendment.acceptedTick > offer.offeredTick && amendment.acceptedTick < deadlineTick && amendment.acceptedTick <= tick;
  const closed = order.settledTick !== undefined && order.settledTick <= tick;
  const delivered = receipts.some(({ stage, piece, artifactId }) =>
    stage === 'finish' && piece === 1 && artifactId !== undefined);

  return <div aria-label="停炉改约凭据" className="space-y-1 rounded border border-amber-400/25 p-2">
    <h6 className="font-semibold text-amber-200">停炉改约</h6>
    <p>原约 2 件 · 原截止 Tick #{deadlineTick}（该轮起不再按原约开工）。</p>
    <p>先于 Tick #{offer.blankTick} 实制首坯；炉位于 Tick #{offer.damagedTick} 受损，工匠在 Tick #{offer.offeredTick} 提议减做一件。</p>
    {!amended ? <p>
      {closed ? '结案前未见原委托方同意，未据此退款、减件或延长工期。'
        : '仅为提议。最早下一轮由原委托方同意，生效前不会据此退款、减件或延长工期。'}
    </p> : <>
      <p>原委托方于 Tick #{amendment.acceptedTick} 同意。第 2 件未动工，已解除；
        {patron ? '退回本人' : '退给原委托方'} {amendment.releasedStones} 灵石、玄土根 {amendment.releasedHerbs} 株（已计入累计实退）。</p>
      <p>原先的首坯保留，只续制第 1 件。补签截止 Tick #{amendment.workUntilTick}（仅首件延后 {WORKSHOP_CAPACITY_RECOVERY_TICKS} 轮，该轮起不能续作）。</p>
      <p>按原约已交割 {delivered ? 1 : 0}/2 件；补签保留件已交割 {delivered ? 1 : 0}/1 件。解除件不等于仍欠交割。</p>
      {closed && (order.refundedStones > amendment.releasedStones || order.refundedHerbs > amendment.releasedHerbs) &&
        <p>结案另实退首件未耗余料：{order.refundedStones - amendment.releasedStones} 灵石、玄土根 {order.refundedHerbs - amendment.releasedHerbs} 株。</p>}
    </>}
  </div>;
}

export function WorkshopPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator }) {
  const actor = world.cultivators.find(({ id }) => id === cultivator.id);
  if (!actor) return null;
  const orders = visibleWorkshopOrders(world, actor).filter(({ patronId, makerId, offeredTick }) =>
    (patronId === actor.id || makerId === actor.id) && offeredTick <= world.tick)
    .sort((a, b) => (b.settledTick ?? b.offeredTick) - (a.settledTick ?? a.offeredTick));
  if (!orders.length) return null;
  const people = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const known = new Map(knownMapLocations(world, actor).map(({ id, name }) => [id, name]));

  return (
    <details className="min-w-0 rounded border border-indigo-400/20 bg-slate-950/60">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-indigo-200">工坊委制与品质交割</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>此处只查本人参与的订单。订单完成不表示每件都达标；实际验收入库、未达标及未用材料退款分别记录。</p>
        <ol aria-label="本角色可查的工坊委制" className="max-h-[27rem] space-y-2 overflow-y-auto">
          {orders.map((order) => {
            const patron = order.patronId === actor.id;
            const accepted = order.acceptedTick !== undefined && order.acceptedTick <= world.tick;
            const receipts = order.work.filter(({ tick }) => tick <= world.tick);
            const completedPieces = receipts.filter(({ stage }) => stage === 'finish').length;
            const delivered = receipts.filter(({ stage, artifactId }) => stage === 'finish' && artifactId !== undefined).length;
            const terms = workshopTerms(order.tier, order.quantity);
            const label = order.status === 'offered' && world.tick >= order.offerExpiresTick ? STATUS.expired : STATUS[order.status];
            const institutionClosed = order.closeReason === 'institution_closed' && order.status === 'cancelled' &&
              order.settledTick !== undefined && order.settledTick <= world.tick;
            return (
              <li key={order.id} className="min-w-0 space-y-1.5 break-words rounded border border-slate-800 p-2">
                <h5 className="font-semibold text-indigo-100">{patron ? '本人委制' : '本人承制'} · {order.tier} ×{order.quantity} · {label}</h5>
                <p>对方 {people.get(patron ? order.makerId : order.patronId) ?? '修士未详'} · {known.get(order.siteId) ?? '工坊地点此时未观测'}</p>
                <p>约定最低品质：{QUALITY[order.qualityFloor]} · 邀约 Tick #{order.offeredTick}
                  {!accepted && order.status === 'offered' && ` · 回应截止 Tick #${order.offerExpiresTick}`}
                </p>
                <p>约定整单托管 {terms.totalStones} 灵石与玄土根 {terms.totalHerbs} 株；每件只有实际交割才付工钱 {terms.feePerPiece} 灵石。</p>
                {accepted ? <>
                  <p>工匠同意 Tick #{order.acceptedTick}{order.deadlineTick !== undefined && ` · 工期截止 Tick #${order.deadlineTick}`}</p>
                  <p>实际工序 {receipts.length}/{order.quantity * 2} · 已验质 {completedPieces}/{order.quantity} 件 · 实际交割 {delivered} 件</p>
                </> : <p className="text-slate-400">没有已同意的承制记录，未开工。</p>}
                {order.closeReason !== 'institution_closed' && <p>当前托管 {order.escrowStones} 灵石与玄土根 {order.escrowHerbs} 株 · 已实退 {order.refundedStones} 灵石与玄土根 {order.refundedHerbs} 株</p>}
                <CapacityReceipt order={order} tick={world.tick} patron={patron} receipts={receipts} />
                {order.closeReason && (order.closeReason !== 'institution_closed' || institutionClosed) &&
                  <p>结案：{CLOSE[order.closeReason]}{order.settledTick !== undefined && ` · Tick #${order.settledTick}`}</p>}
                {institutionClosed && <ClosureReceipt world={world} order={order} patron={patron} />}
                {!order.closeReason && order.settledTick !== undefined && <p>已结算 Tick #{order.settledTick}</p>}
                {!!receipts.length && <ol aria-label="逐件实际耗材与品质凭证" className="space-y-1.5 border-t border-slate-800 pt-2">
                  {receipts.map((receipt, index) => {
                    const stillHeld = patron && receipt.artifactId && actor.artifacts.some(({ id }) => id === receipt.artifactId);
                    const missedFloor = receipt.quality === 'failed' || (receipt.quality === 'standard' && order.qualityFloor === 'fine');
                    return (
                      <li key={index} className="rounded bg-slate-900/80 p-2">
                        <p>Tick #{receipt.tick} · 第 {receipt.piece} 件 · {receipt.stage === 'blank' ? '制坯' : '验质'} · {people.get(receipt.makerId) ?? '工匠未详'}</p>
                        <p>实际耗用 {receipt.stonesUsed} 灵石、玄土根 {receipt.herbsUsed} 株{receipt.feePaid !== undefined && ` · 实付工费 ${receipt.feePaid} 灵石`}</p>
                        {receipt.quality !== undefined && <p className={receipt.artifactId ? 'text-emerald-200' : 'text-amber-200'}>
                          实测品质：{QUALITY[receipt.quality]}{receipt.qualityScore !== undefined && `（评分 ${receipt.qualityScore}）`}
                          {receipt.artifactId ? (patron ? stillHeld ? ' · 已验收入库，当前仍持有' : ' · 曾验收入库，当前未持有' : ' · 已交割') : missedFloor ? ' · 未达到约定品质，无成品入库' : ' · 未交割，无成品入库'}
                        </p>}
                      </li>
                    );
                  })}
                </ol>}
              </li>
            );
          })}
        </ol>
      </div>
    </details>
  );
}
