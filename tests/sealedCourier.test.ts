import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeCourierForActor, advanceCouriers, availableCourierActions, COURIER_OFFER_TICKS, COURIER_ROUTE_TICKS, COURIER_SERVICE_FEE,
  COURIER_TILE_STRIDE, courierActedThisTick, courierCheckpoint, createSealedCourierState, publicCourierReliefProof, reconcileCourierDeaths,
  resolveCourierAction, visibleCouriers } from '../src/engine/sealedCourierEngine';
import { resolveSettlementAction, SETTLEMENT_RELIEF } from '../src/engine/settlementEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { CourierMove, Cultivator, LLMDecisionPayload } from '../src/types/world';

function fixture(atMarket = false) {
  const world = createInitialWorld(8081);
  world.couriers = createSealedCourierState();
  world.tick = 10;
  const [senderSect, recipientSect] = world.sects;
  const sender = world.cultivators.find(({ id }) => id === senderSect.leaderId)!;
  const recipient = world.cultivators.find(({ id }) => id === recipientSect.leaderId)!;
  const courier = world.cultivators.find((row) => row.id !== sender.id && row.id !== recipient.id)!;
  const outsider = world.cultivators.find((row) => ![sender.id, recipient.id, courier.id].includes(row.id))!;
  const from = world.locations.find(({ id }) => id === (atMarket ? 'loc-market' : senderSect.headquartersId))!;
  const to = world.locations.find(({ id }) => id === recipientSect.headquartersId)!;
  for (const actor of world.cultivators) actor.locationId = 'loc-market-east';
  sender.locationId = from.id;
  courier.locationId = from.id;
  recipient.locationId = to.id;
  for (const actor of [sender,courier,recipient,outsider]) actor.age = Math.max(18, actor.age);
  sender.spiritStones = 100;
  courier.spiritStones = 50;
  courier.exploredTileIds = [];
  const act = (actor: Cultivator, courierMove: CourierMove, fields: Partial<LLMDecisionPayload> = {}) =>
    resolveCourierAction(world, actor, { chosenAction: 'SEALED_COURIER', innerMonologue: '内容只封在真实函件中', courierMove, ...fields });
  const schedule = (sourceEventId?: string) => {
    const receipt = act(sender, 'send', { targetCourierId: courier.id, targetCultivatorId: recipient.id,
      ...(sourceEventId ? { targetDispatchSourceId: sourceEventId } : { dispatchCue: 'request_audience' }) });
    expect(receipt).toMatchObject({ witnessScope: 'participants', actorIds: [] });
    expect(receipt?.locationId).toBeUndefined();
    expect(JSON.stringify(receipt)).not.toContain('request_audience');
    return world.couriers.dispatches.at(-1)!;
  };
  const signed = (source?: string) => {
    const dispatch = schedule(source);
    expect(act(courier, 'accept', { targetDispatchId: dispatch.id })).not.toBeNull();
    return dispatch;
  };
  const step = () => { world.tick++; return advanceCouriers(world); };
  return { world, sender, recipient, courier, outsider, from, to, act, schedule, signed, step };
}

describe('sealed physical courier routes', () => {
  it('requires a real local consenting courier and transfers the flat actual service fee once', () => {
    const { world, sender, recipient, courier, outsider, from, to, act, schedule, step } = fixture();
    expect(act(sender, 'send', { targetCourierId: outsider.id, targetCultivatorId: recipient.id, dispatchCue: 'request_audience' })).toBeNull();
    expect(availableCourierActions(sender, world, false).some(({ courierMove }) => courierMove === 'send')).toBe(false);
    const row = schedule();
    expect(row).toMatchObject({ status: 'offered', feePaid: 0, path: [], originId: from.id, destinationId: to.id,
      offerExpiresTick: world.tick + COURIER_OFFER_TICKS });
    expect(sender.spiritStones).toBe(100);
    expect(courier.spiritStones).toBe(50);
    expect(act(outsider, 'accept', { targetDispatchId: row.id })).toBeNull();
    expect(visibleCouriers(world, recipient)).toEqual([]);
    expect(visibleCouriers(world, outsider)).toEqual([]);
    expect(visibleCouriers(world, courier)[0]).not.toHaveProperty('payload');
    expect(visibleCouriers(world, courier)[0]).not.toHaveProperty('recipientName');
    expect(visibleCouriers(world, sender)[0].payload).toEqual({ kind: 'private_cue', cue: 'request_audience' });
    sender.spiritStones = COURIER_SERVICE_FEE - 1;
    expect(act(courier, 'accept', { targetDispatchId: row.id })).toBeNull();
    sender.spiritStones = 100;
    expect(act(courier, 'accept', { targetDispatchId: row.id })).not.toBeNull();
    expect(act(courier, 'accept', { targetDispatchId: row.id })).toBeNull();
    expect([sender.spiritStones, courier.spiritStones]).toEqual([100 - COURIER_SERVICE_FEE, 50 + COURIER_SERVICE_FEE]);
    expect(row).toMatchObject({ status: 'in_transit', deadlineTick: world.tick + COURIER_ROUTE_TICKS, pathIndex: 0 });
    expect(courierActedThisTick(world, courier)).toBe(true);
    expect(advanceCouriers(world)).toEqual([]);
    expect(row.pathIndex).toBe(0);
    const first = step();
    expect(first).toEqual([]);
    expect(row.pathIndex).toBe(COURIER_TILE_STRIDE);
    expect(courierCheckpoint(world, courier)).toEqual(row.path[row.pathIndex]);
    expect(courier.locationId).toBe(from.id);
    expect(advanceCouriers(world)).toEqual([]);
    expect(row.pathIndex).toBe(COURIER_TILE_STRIDE);
  });

  it('opens only for the exact recipient after physical arrival, and conserves the proof through raw log eviction', () => {
    const { world, sender, recipient, courier, outsider, to, act, signed, step } = fixture(true);
    const village = world.settlements.villages.find(({ locationId }) => locationId === sender.locationId)!;
    village.stress = 60;
    sender.herbs.jade_leaf = 8;
    const paid = resolveSettlementAction(world, sender, { chosenAction: 'DELIVER_RELIEF', targetSettlementId: village.id, innerMonologue: '亲自支付' })!;
    expect(paid).toBeDefined();
    expect(publicCourierReliefProof(world, sender, paid.id)).toBeUndefined();
    world.events = [{ ...paid, witnessScope: 'participants' }];
    expect(publicCourierReliefProof(world, sender, paid.id)).toBeUndefined();
    world.events = [paid];
    expect(act(sender, 'send', { targetCourierId: courier.id, targetCultivatorId: recipient.id, targetDispatchSourceId: 'other-fake-id' })).toBeNull();
    const dispatch = signed(paid.id);
    expect(sender.spiritStones).toBe(100 - SETTLEMENT_RELIEF.stones - COURIER_SERVICE_FEE);
    expect(visibleCouriers(world, recipient)).toEqual([]);
    world.events = [];
    world.settlements.records = [];
    while (dispatch.status === 'in_transit') step();
    expect(dispatch).toMatchObject({ status: 'delivered', deliveredTick: world.tick, pathIndex: 0, path: [] });
    expect(courier.locationId).toBe(to.id);
    expect(courierActedThisTick(world, courier)).toBe(true);
    expect(activeCourierForActor(world, courier)).toBeUndefined();
    expect(visibleCouriers(world, recipient)[0]).toMatchObject({ senderName: sender.name, role: 'recipient',
      payload: { kind: 'public_relief', sourceEventId: paid.id, settlementId: village.id, stones: SETTLEMENT_RELIEF.stones, herbs: SETTLEMENT_RELIEF.jade_leaf } });
    expect(visibleCouriers(world, courier)[0]).not.toHaveProperty('payload');
    expect(visibleCouriers(world, outsider)).toEqual([]);
    expect(advanceCouriers(world)).toEqual([]);
  });

  it('actually retraces its route for an absent recipient without ever showing the unopened payload to anyone else', () => {
    const { world, sender, recipient, courier, outsider, from, to, signed, step } = fixture();
    const row = signed();
    recipient.locationId = 'loc-vein-north';
    outsider.locationId = to.id;
    while (row.status === 'in_transit') step();
    expect(row).toMatchObject({ status: 'returning', reason: 'recipient_absent' });
    expect(courier.locationId).toBe(to.id);
    expect(courierCheckpoint(world, courier)).toEqual(row.path.at(-1));
    const index = row.pathIndex;
    step();
    expect(row.pathIndex).toBe(index - COURIER_TILE_STRIDE);
    expect(courier.locationId).toBe(to.id);
    while (row.status === 'returning') step();
    expect(row).toMatchObject({ status: 'returned', reason: 'recipient_absent', settledTick: world.tick });
    expect(courier.locationId).toBe(from.id);
    expect(courierActedThisTick(world, courier)).toBe(true);
    expect(visibleCouriers(world, recipient)).toEqual([]);
    expect(visibleCouriers(world, outsider)).toEqual([]);
    expect([sender.spiritStones, courier.spiritStones]).toEqual([100 - COURIER_SERVICE_FEE, 50 + COURIER_SERVICE_FEE]);
  });

  it('uses verified traveled hazard cells and actual death once, with no fictional fee on an unaccepted envelope', () => {
    const { world, sender, courier, recipient, from, schedule, signed, step } = fixture();
    const lost = signed();
    const hazardPoint = lost.path[3];
    const tile = terrainTileAt(world, hazardPoint.x, hazardPoint.y)!;
    world.mapHazards.push({ id: 'courier-real-hazard', tileId: tile.id, kind: 'beast_tide',
      createdTick: world.tick + 1, expiresTick: world.tick + 2, intensity: 2 });
    expect(step()).toHaveLength(1);
    expect(lost).toMatchObject({ status: 'returning', reason: 'hazard' });
    expect(visibleCouriers(world, recipient)).toEqual([]);
    while (lost.status === 'returning') step();
    expect(lost).toMatchObject({ status: 'lost', reason: 'hazard', path: [] });
    expect(courier.locationId).toBe(from.id);
    expect(advanceCouriers(world)).toEqual([]);
    step();
    const unopened = schedule();
    courier.alive = false;
    courier.hp = 0;
    expect(reconcileCourierDeaths(world)[0]).toMatchObject({ witnessScope: 'participants', actorIds: [] });
    expect(reconcileCourierDeaths(world)).toEqual([]);
    expect(unopened).toMatchObject({ status: 'expired', reason: 'courier_death', feePaid: 0, path: [] });
    expect([sender.spiritStones, courier.spiritStones]).toEqual([100 - COURIER_SERVICE_FEE, 50 + COURIER_SERVICE_FEE]);
  });
});
