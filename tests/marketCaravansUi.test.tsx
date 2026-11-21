import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarketCaravansPanel } from '../src/components/MarketCaravansPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { MARKET_GOODS, marketClosureReason } from '../src/engine/marketEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { WorldState } from '../src/types/world';

type Order = WorldState['markets']['orders'][number];

function fixture() {
  const world = createInitialWorld();
  world.tick = 8;
  const [buyer, early, later, seller] = world.cultivators;
  buyer.name = '低价买单';
  early.name = '同价早单';
  later.name = '同价晚单';
  const market = world.locations.find(({ type }) => type === 'market')!;
  buyer.locationId = market.id;
  const east = { ...market, id: 'east-public-market', name: '东方公开坊市' };
  world.locations.push(east);
  const secret = world.locations.find(({ type }) => type === 'secret_realm')!;
  secret.name = '不可出现在坊市的密境';
  const good = (Object.keys(MARKET_GOODS) as Order['good'][])[0];
  const base: Order = {
    id: 'buy-low', sequence: 4, actorId: buyer.id, locationId: market.id, side: 'buy', good, quantity: 4, remaining: 2,
    limitPrice: 21, escrowStones: 42, escrowGoods: 0, placedTick: 7, expiresTick: 10, status: 'open',
  };
  world.markets = { orders: [
    base,
    { ...base, id: 'buy-late', sequence: 3, actorId: later.id, limitPrice: 28, escrowStones: 56 },
    { ...base, id: 'buy-early', sequence: 2, actorId: early.id, limitPrice: 28, escrowStones: 56 },
    { ...base, id: 'sell', sequence: 5, actorId: seller.id, side: 'sell', limitPrice: 31, escrowStones: 0, escrowGoods: 2 },
    { ...base, id: 'old', sequence: 1, actorId: buyer.id, limitPrice: 99, expiresTick: world.tick },
    { ...base, id: 'elsewhere', sequence: 8, locationId: east.id, limitPrice: 997 },
  ], shipments: [
    { id: 'moving', sequence: 6, buyOrderId: 'buy-low', sellOrderId: 'sell', buyerId: buyer.id, sellerId: seller.id,
      originId: market.id, destinationId: east.id, good, quantity: 1, unitPrice: 25, departedTick: 6, arrivalTick: 9, status: 'in_transit' },
    { id: 'returning', sequence: 7, buyOrderId: 'buy-low', sellOrderId: 'sell', buyerId: buyer.id, sellerId: seller.id,
      originId: east.id, destinationId: market.id, good, quantity: 1, unitPrice: 25, departedTick: 5, arrivalTick: 7,
      status: 'returned', settledTick: 7, reason: '买方已退款，卖方已退货。' },
    { id: 'concealed', sequence: 9, buyOrderId: 'buy-low', sellOrderId: 'sell', buyerId: buyer.id, sellerId: seller.id,
      originId: market.id, destinationId: secret.id, good, quantity: 1, unitPrice: 25, departedTick: 6, arrivalTick: 9, status: 'in_transit' },
  ], receipts: [
    { id: 'loss-receipt', sequence: 4, buyerId: buyer.id, sellerId: seller.id, originId: market.id, destinationId: east.id,
      good, quantity: 1, unitPrice: 12, tick: 7, status: 'lost', reason: '实退买方 12 灵石；卖方损失 1 件。' },
  ], nextId: 10 };
  const markup = () => renderToStaticMarkup(<MarketCaravansPanel world={world} cultivator={buyer} />);
  return { world, market, markup };
}

describe('market and caravan presentation', () => {
  it('uses real price-time priority and shows partial escrow beside nominal quantities', () => {
    const { markup } = fixture();
    const html = markup();
    const book = html.split('aria-label="买盘（高价优先）"')[1]?.split('</section>')[0] ?? '';
    expect(book).toContain('同价早单');
    expect(book.indexOf('同价早单')).toBeLessThan(book.indexOf('同价晚单'));
    expect(book.indexOf('同价晚单')).toBeLessThan(book.indexOf('低价买单'));
    expect(book).toContain('2/4 · 部分撮合');
    expect(book).toContain('托管 42 灵石');
    expect(book).not.toContain('99 灵石');
    expect(book).not.toContain('997 灵石');
    expect(html).toContain('托管 2 件物资');
    expect(html).toContain('所选修士挂单');
    expect(html).toContain('不代替其交易');
    expect(html).not.toContain('<button');
  });

  it('shows actual route state and refunds/losses, without disclosing a hidden endpoint', () => {
    const { markup } = fixture();
    const html = markup();
    expect(html).toContain('东方公开坊市 · 运输中');
    expect(html).toContain('预计到达 Tick #9');
    expect(html).toContain('已退运');
    expect(html).toContain('买方已退款，卖方已退货');
    expect(html).toContain('损失结算');
    expect(html).toContain('实退买方 12 灵石；卖方损失 1 件。');
    expect(html).not.toContain('不可出现在坊市的密境');
  });

  it('renders actual closures and does not expose hidden sites when no public markets exist', () => {
    const { world, market, markup } = fixture();
    const tile = terrainTileAt(world, market.x, market.y)!;
    world.mapHazards.push({ id: 'closed-fixture', kind: 'cursed_miasma', tileId: tile.id, createdTick: 6, expiresTick: 10, intensity: 100 });
    const reason = marketClosureReason(world, market.id);
    expect(reason).toBeDefined();
    expect(markup()).toContain(`休市：${reason}`);
    world.locations = world.locations.filter(({ type }) => type !== 'market');
    expect(markup()).toContain('当前世界无公开坊市');
    expect(markup()).not.toContain('不可出现在坊市的密境');
  });
});
