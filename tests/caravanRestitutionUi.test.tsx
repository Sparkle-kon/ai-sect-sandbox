import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CaravanRestitutionPanel } from '../src/components/CaravanRestitutionPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { CaravanRestitutionLot, MarketShipment } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(89);
  world.tick = 20;
  const [seller, buyer, local, finder, distant] = world.cultivators;
  const markets = world.locations.filter(({ type }) => type === 'market');
  const site = world.locations.find(({ type }) => type === 'spirit_vein')!;
  const tile = terrainTileAt(world, site.x, site.y)!;
  site.name = '不可给出藏点地名';
  seller.name = '原卖方标识不外传';
  finder.name = '发现者标识不外传';
  local.locationId = finder.locationId = site.id;
  seller.locationId = buyer.locationId = distant.locationId = markets[0].id;
  const shipment: MarketShipment = {
    id: 'hidden-lost-shipment', sequence: 1, buyOrderId: 'hidden-buy', sellOrderId: 'hidden-sell',
    buyerId: buyer.id, sellerId: seller.id, originId: markets[0].id, destinationId: markets[1].id,
    good: 'jade_leaf', quantity: 4, unitPrice: 17, departedTick: 16, arrivalTick: 19, settledTick: 19, status: 'lost',
  };
  world.markets.shipments = [shipment];
  const lot: CaravanRestitutionLot = {
    id: 'hidden-recovery-lot', shipmentId: shipment.id, sourceLossEventId: 'hidden-loss-event', siteId: site.id, tileId: tile.id,
    hazardId: 'hidden-hazard', hazardIntensity: 2, openedTick: 19, good: 'jade_leaf', originalQuantity: 4, destroyedQuantity: 3,
    units: 1, buyerId: buyer.id, sellerId: seller.id, status: 'buried',
  };
  world.caravanRestitution = { lots: [lot] };
  const html = (actor = local) => renderToStaticMarkup(<CaravanRestitutionPanel world={world} cultivator={actor} />);
  return { world, seller, buyer, local, finder, distant, shipment, lot, html };
}

describe('physical caravan restitution presentation', () => {
  it('keeps one closed local clue and hides stash, finder, route and offsite even to the buyer or seller', () => {
    const { seller, buyer, distant, html } = fixture();
    const observed = html();
    expect(observed).toMatch(/<details class="[^"]+"><summary class="[^"]+">遗货寻回与归还凭据/);
    expect(observed).toContain('本人在场可见 · 存续遗货 1 株翡翠灵叶');
    expect(observed).toContain('尚未记为实际发现或归还');
    expect(observed).not.toMatch(/已实际找到并封存|已实物归还原卖方|hidden-|不可给出藏点地名|标识不外传|<button/);
    expect(html(seller)).toBe('');
    expect(html(buyer)).toBe('');
    expect(html(distant)).toBe('');
  });

  it('separates real discovery and one authorized handback from already settled cash refund', () => {
    const { world, seller, buyer, finder, distant, lot, html } = fixture();
    lot.status = 'sealed';
    lot.finderId = finder.id;
    lot.discoveredTick = 20;
    expect(html()).toContain('已实际找到并封存，尚无已核验的归还');
    expect(html()).toContain('现场发现 Tick #20');
    expect(html(finder)).toContain('本人实际发现');
    expect(html(distant)).toBe('');
    expect(html()).not.toContain('买方原全额退款仍有效');
    world.tick = 22;
    lot.status = 'returned';
    lot.returnedTick = 21;
    lot.returnedById = finder.id;
    const sellerReceipt = html(seller);
    expect(sellerReceipt).toContain('原运输损失 Tick #19');
    expect(sellerReceipt).toContain('已实物归还原卖方 Tick #21 · 发现者在场交回');
    expect(sellerReceipt).toContain('买方原全额退款仍有效；归还这一株不重开交易');
    expect(sellerReceipt).not.toMatch(/hidden-|不可给出藏点地名|标识不外传/);
    expect(html(finder)).toContain('已实物归还原卖方');
    expect(html()).toBe('');
    expect(html(buyer)).toBe('');
  });
});
