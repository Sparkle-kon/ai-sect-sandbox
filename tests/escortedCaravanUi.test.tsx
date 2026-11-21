import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarketCaravansPanel } from '../src/components/MarketCaravansPanel';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { mapTransitActorIds, visibleCheckpointRoute, visibleMapEscort } from '../src/components/mapConvoyView';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { EscortContract } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 10;
  const [client, buyer, guard, observer] = world.cultivators;
  client.name = '货主甲';
  buyer.name = '买方乙';
  guard.name = '承镖丙';
  observer.name = '旁观修士丁';
  const origin = world.locations.find(({ type }) => type === 'market')!;
  Object.assign(origin, { x: 180, y: 180, name: '西路公开坊市' });
  const destination = { ...origin, id: 'east-escort-market', x: 820, y: 180, name: '东路公开坊市' };
  world.locations.push(destination);
  client.locationId = guard.locationId = observer.locationId = origin.id;
  buyer.locationId = destination.id;
  buyer.exploredTileIds = [terrainTileAt(world, 220, 180)!.id];
  const shipment = { id: 'test-shipment', sequence: 1, buyOrderId: 'buy', sellOrderId: 'sell', buyerId: buyer.id, sellerId: client.id,
    originId: origin.id, destinationId: destination.id, good: 'jade_leaf' as const, quantity: 8, unitPrice: 11, departedTick: 5,
    arrivalTick: 13, status: 'in_transit' as const };
  world.markets.shipments = [shipment];
  const contract: EscortContract = { id: 'do-not-publish-contract-id', shipmentId: shipment.id, clientId: client.id, escortId: guard.id,
    originId: origin.id, destinationId: destination.id, status: 'active', offeredTick: 5, expiresTick: 8, acceptedTick: 6,
    feeEscrow: 30, feePaid: 0, feeRefunded: 0, rationsEscrow: 1, rationsSpent: 2, rationsReturned: 0,
    path: [{ x: 180, y: 180 }, { x: 220, y: 180 }, { x: 820, y: 180 }], pathIndex: 1, stride: 1,
    lastCrossedTileIds: [], usedReportIds: ['do-not-publish-report-id'], detours: [{ tick: 9, reportId: 'do-not-publish-report-id', extraSteps: 2 }],
  };
  world.escorts.contracts = [contract];
  world.escorts.reports = [{ id: 'do-not-publish-report-id', contractId: contract.id, reporterId: guard.id, observedTick: 8,
    hazardId: 'do-not-publish-hazard-id', tileId: terrainTileAt(world, 220, 180)!.id, expiresTick: 12 }];
  const markup = (cultivator = guard) => renderToStaticMarkup(<MarketCaravansPanel world={world} cultivator={cultivator} />);
  return { world, client, buyer, guard, observer, contract, markup };
}

describe('escorted caravan roles, accounting, and known route', () => {
  it('separates physical client cargo from the named escort fee, supplies, and verified detour proof', () => {
    const { markup } = fixture();
    const html = markup();
    expect(html).toContain('委托货物：翡翠灵叶 8 件 · 单价 11 灵石');
    expect(html).toContain('护送中 · 委托方：货主甲 · 护镖修士：承镖丙');
    expect(html).toContain('护镖费：托管 30 灵石 · 已付护镖者 0 · 退还委托方 0');
    expect(html).toContain('护镖者自备玄土根：托管 1 株 · 已耗 2 · 退回 0');
    expect(html).toContain('核验路报与绕行 · 记录 1 条，已采纳 1 条');
    expect(html).toContain('Tick #9 · 依核验路报改道 · 增加 2 段');
    expect(html).not.toContain('do-not-publish');
  });

  it('keeps unrelated actors and offscreen explored checkpoints away from live logistics', () => {
    const { markup, buyer, observer, contract } = fixture();
    const ownerView = markup();
    expect(ownerView).toContain('当前所见关口');
    const buyerView = markup(buyer);
    expect(buyerView).toContain('当前未观测到在途关口，仅显示所知运输端点');
    expect(buyerView).not.toContain('当前所见关口');
    const bystander = markup(observer);
    expect(bystander).toContain('委托货物：');
    expect(bystander).not.toContain('护镖委托与独立账目');
    expect(bystander).not.toContain('承镖丙');
    expect(bystander).not.toContain('核验路报');
    contract.pathIndex = 2;
    expect(markup()).toContain('当前所见关口'); // The actual escort knows its own checkpoint even before locationId is committed on delivery.
  });

  it('clips visible route drawing before an unknown gap and never treats a terminal receipt as in-flight', () => {
    const { world, guard, observer, contract, markup } = fixture();
    const base = createTerrainMapView(world, guard, true);
    const mark = terrainTileAt(world, 220, 180)!.id;
    const remote = terrainTileAt(world, 820, 180)!.id;
    const shown = visibleCheckpointRoute(world, { ...base, current: new Set([mark, remote]) }, contract.path, contract.pathIndex);
    expect(shown?.route.every(({ x }) => x >= 200 && x <= 240)).toBe(true);
    expect(visibleMapEscort(world, { ...base, current: new Set([mark, remote]) }, guard)).toEqual(shown);
    expect(visibleMapEscort(world, base, observer)).toBeUndefined();
    expect(mapTransitActorIds(world).has(guard.id)).toBe(true);
    const canvas = () => renderToStaticMarkup(<WorldMapCanvas compact world={world} selectedCultivatorId={guard.id} onSelectCultivator={() => undefined} />);
    expect(canvas()).toContain('定位所选护镖车队');
    expect(visibleCheckpointRoute(world, { ...base, current: new Set([remote]) }, contract.path, contract.pathIndex)).toBeUndefined();
    contract.status = 'failed';
    contract.feeEscrow = 0;
    contract.feeRefunded = 30;
    contract.rationsEscrow = 0;
    contract.rationsReturned = 1;
    expect(markup()).toContain('护送失败 · 委托方：货主甲 · 护镖修士：承镖丙');
    expect(markup()).toContain('退还委托方 30');
    expect(markup()).not.toContain('当前所见关口');
    expect(canvas()).not.toContain('定位所选护镖车队');
    expect(mapTransitActorIds(world).has(guard.id)).toBe(false);
  });
});
