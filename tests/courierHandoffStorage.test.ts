import { describe, expect, it } from 'vitest';
import { reconcileCourierDeaths, visibleCouriers } from '../src/engine/sealedCourierEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import type { WorldState } from '../src/types/world';
import {
  arrivedCourierHandoff, handoffPerson, handoffTurn, nativeCourierHandoffRoute,
  offeredCourierHandoff, transferredCourierHandoff,
} from './fixtures/courierHandoffFixture';

const roundTrip = (world: WorldState) => decodeWorldSave(encodeWorldSave(world));
const parcel = (world: WorldState) => world.couriers.dispatches[0];
function tamper(raw: string, edit: (world: WorldState) => void) {
  const parsed = JSON.parse(raw) as { world: WorldState };
  edit(parsed.world);
  return () => decodeWorldSave(JSON.stringify(parsed));
}

describe('one stored sealed parcel preserves actual checkpoint and dated title custody', () => {
  it('reimports a legacy no-handoff, reached, offered, physically changed and actually delivered sequence', () => {
    expect(parcel(roundTrip(nativeCourierHandoffRoute().world)).handoff).toBeUndefined();
    const arrived = roundTrip(arrivedCourierHandoff().world);
    expect(parcel(arrived).handoff?.status).toBe('arrived');
    const offered = roundTrip(offeredCourierHandoff().world);
    expect(parcel(offered).handoff?.status).toBe('offered');
    const f = transferredCourierHandoff(), custody = roundTrip(f.world), tracked = parcel(custody);
    expect(tracked).toMatchObject({
      originalCourierId: f.originalId, courierId: f.newId, status: 'in_transit', handoff: { status: 'transferred' }, feePaid: 12,
    });
    expect(visibleCouriers(custody, handoffPerson(custody, f.recipientId))).toEqual([]);
    const before = structuredClone(tracked.sealed);
    let delivered = custody;
    for (let step = 0; step < 12 && parcel(delivered).status === 'in_transit'; step++) delivered = handoffTurn(delivered);
    const terminal = parcel(roundTrip(delivered));
    expect(terminal.status).toBe('delivered');
    expect(terminal.path).toEqual([]);
    expect(terminal.handoff?.terminal).toEqual({
      status: 'delivered', courierId: f.newId, pathIndex: terminal.handoff!.path.length - 1, tick: terminal.deliveredTick,
    });
    expect(terminal.sealed).toEqual(before);
    expect(delivered.couriers.dispatches).toHaveLength(1);
  });

  it('rejects forged path, date, holder, fee and fictitious delivery at the handoff', () => {
    const f = transferredCourierHandoff(), raw = encodeWorldSave(f.world);
    expect(tamper(raw, (world) => { parcel(world).handoff!.path[0].x += 1; })).toThrow('couriers.handoff.path');
    expect(tamper(raw, (world) => { parcel(world).handoff!.settledTick = parcel(world).handoff!.offeredTick; }))
      .toThrow('couriers.handoff.lifecycle');
    expect(tamper(raw, (world) => { parcel(world).originalCourierId = f.outsiderId; })).toThrow('couriers.handoff.source');
    expect(tamper(raw, (world) => { parcel(world).feePaid = 24; })).toThrow('.feePaid');
    expect(tamper(raw, (world) => {
      const row = parcel(world);
      row.handoff!.terminal = { tick: world.tick, pathIndex: row.pathIndex, courierId: row.courierId, status: 'delivered' };
    })).toThrow('couriers.handoff.travel');
  });

  it('stores actual same-date interrupted custody without replacement, and never turns an unopened invite into delivery', () => {
    const f = offeredCourierHandoff(), owner = handoffPerson(f.world, f.originalId);
    owner.alive = false;
    owner.hp = 0;
    reconcileCourierDeaths(f.world);
    const lost = roundTrip(f.world), packet = parcel(lost);
    expect(packet.status).toBe('lost');
    expect(packet.handoff).toMatchObject({
      status: 'interrupted', offeredTick: lost.tick, settledTick: lost.tick,
      terminal: { status: 'lost', courierId: f.originalId, tick: lost.tick },
    });
    expect(packet.deliveredTick).toBeUndefined();
    expect(lost.couriers.dispatches).toHaveLength(1);
    expect(visibleCouriers(lost, handoffPerson(lost, f.recipientId))).toEqual([]);
  });
});
