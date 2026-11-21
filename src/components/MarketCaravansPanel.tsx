import { useState } from 'react';
import { marketClosureReason, marketOrdersInPriority, MARKET_GOODS } from '../engine/marketEngine';
import { visibleEscorts } from '../engine/escortEngine';
import { createTerrainMapView } from './terrainMapView';
import { visibleCheckpointRoute } from './mapConvoyView';
import { ResourceFlowPanel } from './ResourceFlowPanel';
import { ShipmentEscortDetails } from './ShipmentEscortDetails';
import type { Cultivator, WorldState } from '../types/world';

type Order = WorldState['markets']['orders'][number];
type Shipment = WorldState['markets']['shipments'][number];
type Receipt = WorldState['markets']['receipts'][number];
type Good = Order['good'];
const ORDER_STATUS: Record<Order['status'], string> = { open: '挂单中', filled: '已撮合完毕', cancelled: '已撤单', expired: '已到期' };
const SHIPMENT_STATUS: Record<Shipment['status'], string> = { in_transit: '运输中', delivered: '已送达', lost: '已损失', returned: '已退运' };
const RECEIPT_STATUS: Record<Receipt['status'], string> = { local_fill: '同场成交', delivered: '运达结算', lost: '损失结算', returned: '退运退款' };
const field = 'min-w-0 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100';
const goodName = (good: Good) => MARKET_GOODS[good].label;
const held = (order: Order): string =>
  order.side === 'buy' ? `托管 ${order.escrowStones} 灵石` : `托管 ${order.escrowGoods} 件物资`;

function BookSide({ orders, side, actorName }: { orders: Order[]; side: Order['side']; actorName: (id: string) => string }) {
  const label = side === 'buy' ? '买盘（高价优先）' : '卖盘（低价优先）';
  return (
    <section className="min-w-0 space-y-1" aria-label={label}>
      <h5 className="text-xs font-semibold text-amber-100">{label}</h5>
      {orders.length === 0 ? <p className="text-xs text-slate-400">暂无挂单。</p> : (
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-xs text-slate-300">
            <caption className="sr-only">{label}，同价按挂单顺序</caption>
            <thead className="text-slate-400">
              <tr><th scope="col" className="pr-2">修士</th><th scope="col" className="pr-2">限价</th>
                <th scope="col" className="pr-2">剩余／原单</th><th scope="col">托管</th></tr>
            </thead>
            <tbody>{marketOrdersInPriority(orders, side).map((order) => (
              <tr key={order.id} className="border-t border-slate-800">
                <th scope="row" className="py-1 pr-2 font-medium">{actorName(order.actorId)}</th>
                <td className="pr-2">{order.limitPrice} 灵石</td>
                <td className="pr-2">{order.remaining}/{order.quantity}{order.remaining < order.quantity ? ' · 部分撮合' : ''}</td>
                <td>{held(order)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function MarketCaravansPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator | undefined }) {
  const [requestedMarketId, setRequestedMarketId] = useState<string>();
  const [requestedGood, setRequestedGood] = useState<Good>();
  const publicMarkets = world.locations.filter(({ type }) => type === 'market');
  const publicNames = new Map(publicMarkets.map(({ id, name }) => [id, name]));
  const market = publicMarkets.find(({ id }) => id === requestedMarketId) ??
    publicMarkets.find(({ id }) => id === cultivator?.locationId) ?? publicMarkets[0];
  const marketId = market?.id;
  const names = new Map(world.cultivators.map(({ id, name }) => [id, name]));
  const actorName = (id: string) => names.get(id) ?? '修士未详';
  const marketOrders = (world.markets?.orders ?? []).filter(({ locationId }) => locationId === marketId);
  const localOrders = marketOrders.filter((order) => order.status === 'open' && order.remaining > 0 && order.expiresTick > world.tick);
  const goods = Object.keys(MARKET_GOODS) as Good[];
  const good = requestedGood ?? localOrders[0]?.good ?? goods[0];
  const currentBook = localOrders.filter((entry) => entry.good === good);
  const positions = cultivator ? marketOrders.filter(({ actorId }) => actorId === cultivator.id)
    .sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || b.placedTick - a.placedTick || b.sequence - a.sequence).slice(0, 12) : [];
  const publicRoute = (origin: string, destination: string) =>
    publicNames.has(origin) && publicNames.has(destination) && (origin === marketId || destination === marketId);
  const shipments = (world.markets?.shipments ?? []).filter(({ originId, destinationId }) => publicRoute(originId, destinationId))
    .sort((a, b) => Number(b.status === 'in_transit') - Number(a.status === 'in_transit') || b.departedTick - a.departedTick || b.sequence - a.sequence).slice(0, 16);
  const receipts = (world.markets?.receipts ?? []).filter(({ originId, destinationId }) => publicRoute(originId, destinationId))
    .sort((a, b) => b.tick - a.tick || b.sequence - a.sequence).slice(0, 16);
  const closure = marketId ? marketClosureReason(world, marketId) : undefined;
  const selectedInvolved = (buyer: string, seller: string) => cultivator?.id === buyer || cultivator?.id === seller;
  const terrain = createTerrainMapView(world, cultivator, true);
  const escortsByShipment = new Map((world.escorts ? visibleEscorts(world, cultivator) : []).map((view) => {
    const point = view.checkpoint;
    return [view.contract.shipmentId, { ...view,
      checkpoint: point && (view.contract.escortId === cultivator?.id || visibleCheckpointRoute(world, terrain, [point], 0)) ? point : undefined }];
  }));

  return (
    <section aria-label="坊市与跨境商队" className="min-w-0 space-y-2 rounded-xl border border-amber-400/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4">
      <h3 className="text-sm font-semibold text-amber-100">坊市与跨境商队</h3>
      <p className="text-xs text-slate-400">仅查看公开坊市；修士自行挂单，不代替其交易。</p>
      {!market ? <p className="text-xs text-slate-400">当前世界无公开坊市。</p> : (
        <>
          <label className="grid min-w-0 gap-1 text-xs text-slate-300">查看坊市
            <select className={field} value={market.id} onChange={(event) => setRequestedMarketId(event.currentTarget.value)}>
              {publicMarkets.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
            </select>
          </label>
          <p className={`break-words text-xs ${closure ? 'text-rose-200' : 'text-emerald-200'}`}>
            {market.name} · {closure ? `休市：${closure}` : '正常开市'}
          </p>
          <details className="min-w-0 rounded border border-slate-800 bg-slate-950/60 p-2">
            <summary className="cursor-pointer text-xs font-semibold text-amber-100">价时优先订单簿 · 在簿 {localOrders.length} 单</summary>
            <div className="mt-2 space-y-2">
              <label className="grid min-w-0 gap-1 text-xs text-slate-300">物品
                <select className={field} value={good} onChange={(event) => setRequestedGood(goods.find((entry) => entry === event.currentTarget.value))}>
                  {goods.map((item) => <option key={item} value={item}>{goodName(item)}</option>)}
                </select>
              </label>
              <p className="text-xs text-slate-400">同价按较早下单顺序撮合；限价以灵石／件计。</p>
              <div className="grid gap-2 xl:grid-cols-2">
                <BookSide orders={currentBook.filter(({ side }) => side === 'buy')} side="buy" actorName={actorName} />
                <BookSide orders={currentBook.filter(({ side }) => side === 'sell')} side="sell" actorName={actorName} />
              </div>
            </div>
          </details>
          <details className="rounded border border-slate-800 bg-slate-950/60 p-2">
            <summary className="cursor-pointer text-xs font-semibold text-amber-100">所选修士挂单 · {positions.length} 条</summary>
            {positions.length === 0 ? <p className="mt-1 text-xs text-slate-400">所选修士在此坊市没有记录。</p> : (
              <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs text-slate-300">
                {positions.map((order) => <li key={order.id} className="break-words rounded bg-slate-900/80 p-2">
                  {order.side === 'buy' ? '买入' : '卖出'}{goodName(order.good)} · {ORDER_STATUS[order.status]}
                  {' · '}剩余 {order.remaining}/{order.quantity} · 限价 {order.limitPrice} · {held(order)}
                  {' · '}挂单 Tick #{order.placedTick}{order.settledTick !== undefined ? ` · 结算 Tick #${order.settledTick}` : ` · 至 Tick #${order.expiresTick} 前`}
                </li>)}
              </ul>
            )}
          </details>
          <details className="rounded border border-slate-800 bg-slate-950/60 p-2">
            <summary className="cursor-pointer text-xs font-semibold text-amber-100">商队运输 · 最近 {shipments.length} 条</summary>
            {shipments.length === 0 ? <p className="mt-1 text-xs text-slate-400">暂无可见运输。</p> : (
              <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto text-xs text-slate-300">
                {shipments.map((shipment) => {
                  const escort = escortsByShipment.get(shipment.id);
                  return <li key={shipment.id} className="space-y-0.5 break-words rounded bg-slate-900/80 p-2">
                  <p>{publicNames.get(shipment.originId)} → {publicNames.get(shipment.destinationId)} · {SHIPMENT_STATUS[shipment.status]}
                    {selectedInvolved(shipment.buyerId, shipment.sellerId) || !!cultivator && escort?.contract.escortId === cultivator.id ? ' · 所选修士相关' : ''}
                  </p>
                  <p>委托货物：{goodName(shipment.good)} {shipment.quantity} 件 · 单价 {shipment.unitPrice} 灵石 · 离站 Tick #{shipment.departedTick}
                    {shipment.settledTick !== undefined ? ` · 结算 Tick #${shipment.settledTick}` : ` · 预计到达 Tick #${shipment.arrivalTick}`}
                  </p>
                  {shipment.reason && <p className="text-amber-100">{shipment.reason}</p>}
                  {escort && <ShipmentEscortDetails view={escort} world={world} actorName={actorName} />}
                </li>;
                })}
              </ul>
            )}
          </details>
          <details className="rounded border border-slate-800 bg-slate-950/60 p-2">
            <summary className="cursor-pointer text-xs font-semibold text-amber-100">成交与结算收据 · 最近 {receipts.length} 条</summary>
            {receipts.length === 0 ? <p className="mt-1 text-xs text-slate-400">暂无结算收据。</p> : (
              <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto text-xs text-slate-300">
                {receipts.map((receipt) => <li key={receipt.id} className="space-y-0.5 break-words rounded bg-slate-900/80 p-2">
                  <p>Tick #{receipt.tick} · {RECEIPT_STATUS[receipt.status]} · {goodName(receipt.good)} {receipt.quantity} 件 · 单价 {receipt.unitPrice} 灵石
                    {selectedInvolved(receipt.buyerId, receipt.sellerId) ? ' · 所选修士相关' : ''}
                  </p>
                  <p>卖方 {actorName(receipt.sellerId)} · 买方 {actorName(receipt.buyerId)}</p>
                  {receipt.reason && <p className="text-amber-100">记录结果：{receipt.reason}</p>}
                </li>)}
              </ul>
            )}
          </details>
        </>
      )}
      <ResourceFlowPanel world={world} cultivator={cultivator} />
    </section>
  );
}
