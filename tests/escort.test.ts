import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeEscortForActor, availableEscortActions, createEscortState, ESCORT_FEE, ESCORT_RATIONS,
  escortDirective, resolveEscortAction, settleEscortWithShipment, visibleEscorts } from '../src/engine/escortEngine';
import { advanceMarkets, resolveMarketAction } from '../src/engine/marketEngine';
import { findMapPath } from '../src/engine/mapMotionEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, EscortMove, LLMDecisionPayload } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(111);
  world.escorts = createEscortState();
  const [origin, destination] = world.locations.filter(({ type }) => type === 'market');
  const [escort, scout, client, buyer, outsider] = world.cultivators;
  for (const actor of [escort, scout, client]) actor.locationId = origin.id;
  buyer.locationId = destination.id;
  outsider.locationId = world.locations.find(({ type }) => type === 'abyss')!.id;
  client.spiritStones = 500;
  buyer.spiritStones = 300;
  escort.spiritStones = 100;
  client.pills.foundation = 2;
  buyer.pills.foundation = 0;
  escort.herbs.earth_root = 5;
  world.tick = 4;
  expect(resolveMarketAction(world, client, { chosenAction: 'PLACE_MARKET_SELL', marketGood: 'foundation', marketQuantity: 2, marketLimitPrice: 20,
    innerMonologue: '普通市场待售' })).not.toBeNull();
  expect(resolveMarketAction(world, buyer, { chosenAction: 'PLACE_MARKET_BUY', marketGood: 'foundation', marketQuantity: 2, marketLimitPrice: 20,
    innerMonologue: '普通市场买入' })).not.toBeNull();
  expect(advanceMarkets(world).some(({ title }) => title === '跨坊商队启程')).toBe(true);
  const shipment = world.markets.shipments[0];
  const act = (actor: Cultivator, escortMove: EscortMove, params: Partial<LLMDecisionPayload> = {}) =>
    resolveEscortAction(world, actor, { chosenAction: 'ESCORT', escortMove, innerMonologue: '账货分开处理', ...params });
  const offer = () => {
    world.tick++;
    expect(act(client, 'offer', { targetShipmentId: shipment.id })).not.toBeNull();
    return world.escorts.contracts[0];
  };
  return { world, origin, destination, client, buyer, scout, escort, outsider, shipment, act, offer };
}

describe('proof-based escort routes, private supply and sole market cargo settlement', () => {
  it('leaves a real unoffered shipment unchanged and holds an explicit unsigned offer for only one tick', () => {
    const untouched = fixture();
    const baseline = structuredClone(untouched.shipment);
    untouched.world.tick++;
    expect(escortDirective(untouched.world, untouched.shipment)).toBeUndefined();
    for (let i = 0; i < 8 && untouched.shipment.status === 'in_transit'; i++) {
      advanceMarkets(untouched.world);
      untouched.world.tick++;
    }
    expect(untouched.shipment).toMatchObject({ status: 'delivered', arrivalTick: baseline.arrivalTick });
    expect(untouched.world.escorts.contracts).toEqual([]);
    expect(untouched.buyer.pills.foundation).toBe(2);

    const { world, client, buyer, shipment, offer, act } = fixture();
    expect(act(client, 'offer', { targetShipmentId: shipment.id })).toBeNull();
    const pending = offer();
    expect(client.spiritStones).toBe(500 - ESCORT_FEE);
    expect(escortDirective(world, shipment)).toMatchObject({ hold: true, managed: false, baselineDelay: 1 });
    expect(advanceMarkets(world)).toEqual([]);
    expect(shipment.status).toBe('in_transit');
    world.tick++;
    expect(escortDirective(world, shipment)).toMatchObject({ hold: false, managed: false, baselineDelay: 1 });
    expect(pending).toMatchObject({ status: 'expired', feeEscrow: 0, feeRefunded: ESCORT_FEE, rationsSpent: 0 });
    expect(client.spiritStones).toBe(500);
    expect(buyer.pills.foundation).toBe(0);
    expect(escortDirective(world, shipment)?.baselineDelay).toBe(1);
  });

  it('charges separate actual rations and fee, freezes the volunteer, and pays once after real market-delivered cargo', () => {
    const { world, client, buyer, escort, outsider, origin, destination, shipment, offer, act } = fixture();
    const pending = offer();
    expect(act(buyer, 'accept', { targetEscortId: pending.id })).toBeNull();
    expect(act(outsider, 'accept', { targetEscortId: pending.id })).toBeNull();
    const initialContents = { good: shipment.good, quantity: shipment.quantity, unitPrice: shipment.unitPrice };
    expect(act(escort, 'accept', { targetEscortId: pending.id })?.title).toBe('护镖护卫登程');
    expect(act(escort, 'accept', { targetEscortId: pending.id })).toBeNull();
    expect(escort.herbs.earth_root).toBe(5 - ESCORT_RATIONS);
    expect(activeEscortForActor(world, escort)).toBe(pending);
    expect(escort.locationId).toBe(origin.id);
    expect(pending).toMatchObject({ rationsSpent: 1, rationsEscrow: 2, feeEscrow: ESCORT_FEE });
    const start = escortDirective(world, shipment)!;
    expect(start).toMatchObject({ managed: true, forceReturn: false, riskMultiplier: .65 });
    expect(start.crossedTileIds.length).toBeGreaterThan(1);
    expect(escortDirective(world, shipment)).toEqual(start);
    expect(shipment).toMatchObject(initialContents);
    expect(buyer.pills.foundation).toBe(0);
    expect(client.pills.foundation).toBe(0);
    expect(visibleEscorts(world, outsider)).toEqual([]);
    expect(visibleEscorts(world, escort)[0].contract).not.toHaveProperty('path');
    expect(visibleEscorts(world, escort)[0].checkpoint).toEqual(pending.path[pending.pathIndex]);
    for (let i = 0; i < 12 && shipment.status === 'in_transit'; i++) {
      advanceMarkets(world);
      world.tick++;
    }
    expect(shipment.status).toBe('delivered');
    expect(buyer.pills.foundation).toBe(2);
    expect(buyer.spiritStones).toBe(260);
    expect(client.spiritStones).toBe(500 + 40 - ESCORT_FEE);
    expect(escort.spiritStones).toBe(100 + ESCORT_FEE);
    expect(escort.herbs.earth_root).toBe(4);
    expect(escort.locationId).toBe(destination.id);
    expect(pending).toMatchObject({ status: 'delivered', feeEscrow: 0, feePaid: ESCORT_FEE, rationsEscrow: 0, rationsReturned: 2 });
    expect(activeEscortForActor(world, escort)).toBeUndefined();
    expect(settleEscortWithShipment(world, shipment)).toBeNull();
  });

  it('does not route around unreported facts, but spends real rations on a bounded detour around an independent observed hazard', () => {
    const { world, client, escort, scout, origin, outsider, shipment, offer, act } = fixture();
    const plan = offer();
    expect(act(escort, 'accept', { targetEscortId: plan.id })).not.toBeNull();
    escort.exploredTileIds = world.terrain.tiles.map(({ id }) => id);
    const originTile = terrainTileAt(world, origin.x, origin.y)!.id;
    const hazardPoint = plan.path.slice(1).find(({ x, y }) => terrainTileAt(world, x, y)?.id !== originTile)!;
    const hazardTile = terrainTileAt(world, hazardPoint.x, hazardPoint.y)!;
    const watch = { ...origin, id: 'test-observation-post', type: 'spirit_vein' as const, x: hazardPoint.x, y: hazardPoint.y };
    world.locations.push(watch);
    scout.locationId = watch.id;
    world.mapHazards.push({ id: 'actual-road-meteor', kind: 'meteor', tileId: hazardTile.id, intensity: 3,
      createdTick: world.tick, expiresTick: world.tick + 4 });
    const absent = structuredClone(world);
    const unreported = escortDirective(absent, absent.markets.shipments[0])!;
    expect(unreported.crossedTileIds).toContain(hazardTile.id);
    expect(absent.escorts.contracts[0].detours).toEqual([]);
    const reportPayload = { targetEscortId: plan.id, targetHazardId: 'actual-road-meteor' };
    expect(act(client, 'report', reportPayload)).toBeNull();
    expect(act(escort, 'report', reportPayload)).toBeNull();
    expect(act(outsider, 'report', reportPayload)).toBeNull();
    expect(act(scout, 'report', { ...reportPayload, targetHazardId: 'fabricated' })).toBeNull();
    expect(availableEscortActions(scout, world)).toContainEqual({ action: 'ESCORT', escortMove: 'report', ...reportPayload });
    expect(act(scout, 'report', reportPayload)?.witnessScope).toBe('participants');
    expect(act(scout, 'report', reportPayload)).toBeNull();
    const routed = escortDirective(world, shipment)!;
    expect(routed.crossedTileIds).not.toContain(hazardTile.id);
    expect(plan.path.slice(plan.pathIndex).every(({ x, y }) => terrainTileAt(world, x, y)?.id !== hazardTile.id)).toBe(true);
    expect(plan.detours[0]).toMatchObject({ tick: world.tick, reportId: world.escorts.reports[0].id });
    expect(plan.detours[0].extraSteps).toBeLessThanOrEqual(8);
    expect(plan.rationsSpent).toBe(2);
    expect(escortDirective(world, shipment)).toEqual(routed);
    expect(plan.rationsSpent).toBe(2);
  });

  it('returns the actual sale and independent funds if the escort is lost, without transferring cargo to the escort', () => {
    const { world, client, buyer, escort, shipment, offer, act } = fixture();
    const plan = offer();
    act(escort, 'accept', { targetEscortId: plan.id });
    escort.alive = false; escort.hp = 0;
    expect(escortDirective(world, shipment)?.forceReturn).toBe(true);
    expect(advanceMarkets(world).map(({ title }) => title)).toContain('商队退运退款');
    expect(shipment.status).toBe('returned');
    expect(plan).toMatchObject({ feeEscrow: 0, feePaid: 0, feeRefunded: ESCORT_FEE, status: 'failed',
      rationsSpent: 1, rationsEscrow: 0, rationsReturned: 2 });
    expect(client.spiritStones).toBe(500);
    expect(client.pills.foundation).toBe(2);
    expect(buyer.spiritStones).toBe(300);
    expect(buyer.pills.foundation).toBe(0);
    expect(escort.spiritStones).toBe(100);
    expect(escort.herbs.earth_root).toBe(4);
    expect(settleEscortWithShipment(world, shipment)).toBeNull();
  });

  it('adds opt-in terrain constraints without changing the unrestricted path helper', () => {
    const { world, origin, destination } = fixture();
    const path = findMapPath(world, origin, destination);
    const again = findMapPath(world, origin, destination, () => true);
    expect(path).toEqual(again);
    const destinationTile = terrainTileAt(world, destination.x, destination.y)!;
    expect(findMapPath(world, origin, destination, (tile) => tile.id !== destinationTile.id)).toEqual([]);
  });
});
