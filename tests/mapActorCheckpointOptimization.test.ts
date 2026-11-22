import { describe, expect, it, vi } from 'vitest';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { courierCheckpoint } from '../src/engine/sealedCourierEngine';
import type { DanxiaMedicineCommitment, PilgrimageJourney } from '../src/types/world';
import { handoffPerson, nativeCourierHandoffRoute } from './fixtures/courierHandoffFixture';

describe('map checkpoint candidate pass', () => {
  it('does not invoke linear checkpoint find for 1200 unrelated bodies with retained receipt histories', () => {
    const f = nativeCourierHandoffRoute(), { world } = f;
    const selected = handoffPerson(world, f.originalId);
    const exact = courierCheckpoint(world, selected);
    expect(exact).toBeDefined();
    const template = world.cultivators.find(actor => actor.id !== selected.id)!;
    for (let index = 0; index < 1200; index++) {
      world.cultivators.push({ ...template, id: `map-load-${index}`, name: `负载修士 ${index}`, locationId: selected.locationId });
    }

    const dispatch = world.couriers.dispatches[0];
    for (let index = 0; index < 128; index++) {
      world.couriers.dispatches.push({ ...dispatch, id: `past-packet-${index}`, status: 'delivered' });
    }
    const reports = [
      vi.spyOn(world.couriers.dispatches, 'find'),
      vi.spyOn(world.danxiaMedicine.commitments, 'find'),
      vi.spyOn(world.pilgrimages.journeys, 'find'),
      vi.spyOn(world.expeditionRescues.requests, 'find'),
      vi.spyOn(world.boundaryReliefs.cases, 'find'),
      vi.spyOn(world.escorts.contracts, 'find'),
    ];
    try {
      const view = createTerrainMapView(world, undefined, false);
      expect(view.liveActors).toHaveLength(world.cultivators.length);
      expect(view.trailPositions.get(selected.id)).toEqual(exact);
      expect(reports.map(watch => watch.mock.calls.length)).toEqual([1, 0, 0, 0, 0, 0]);
    } finally { reports.forEach(watch => watch.mockRestore()); }
  });

  it('uses the native first match, then lower-priority fallback; does not cache between mutable phases', () => {
    const f = nativeCourierHandoffRoute(), { world } = f;
    const courier = handoffPerson(world, f.originalId), companion = handoffPerson(world, f.senderId);
    const actualCourierPoint = courierCheckpoint(world, courier)!;
    const pilgrimPoint = { x: 212, y: 157 };
    const pilgrimage: PilgrimageJourney = {
      id: 'overlapping-native-pilgrim-role', organizerId: courier.id, companionId: companion.id,
      stopIds: [f.originId, f.postId, f.destinationId], stopsVisited: [], status: 'active',
      proposedTick: world.tick - 2, offerExpiresTick: world.tick, startedTick: world.tick - 1, expiresTick: world.tick + 3,
      legIndex: 0, path: [pilgrimPoint], pathIndex: 0, spentByEach: 0, aid: [],
    };
    world.pilgrimages.journeys.push(pilgrimage);

    const snapshot = () => createTerrainMapView(world, undefined, false);
    const initial = snapshot();
    expect(initial.trailPositions.get(courier.id)).toEqual(actualCourierPoint);
    expect(initial.trailPositions.get(companion.id)).toEqual(pilgrimPoint);

    const live = world.couriers.dispatches[0];
    // An older viable identity with an empty path still wins native first-match before point validation.
    world.couriers.dispatches.unshift({ ...live, id: 'older-ambiguous-receipt', path: [] });
    expect(courierCheckpoint(world, courier)).toBeUndefined();
    expect(snapshot().trailPositions.get(courier.id)).toEqual(pilgrimPoint);
    world.couriers.dispatches.shift();
    expect(snapshot().trailPositions.get(courier.id)).toEqual(actualCourierPoint);

    live.status = 'delivered';
    pilgrimage.status = 'completed';
    const later = snapshot();
    expect(later.trailPositions.has(courier.id)).toBe(false);
    expect(later.liveActors).toContain(courier);
    expect(mapActorPositions(later.seenLocations, later.liveActors, later.trailPositions).some(({ actor }) =>
      actor === courier)).toBe(true);
    // Earlier read contains detached route coordinates, not the mutated live receipt or its geometry.
    expect(initial.trailPositions.get(courier.id)).toEqual(actualCourierPoint);
  });

  it('keeps higher-priority private medicine membership ahead of a visible ordinary courier', () => {
    const f = nativeCourierHandoffRoute(), { world } = f;
    const carrier = handoffPerson(world, f.originalId), client = handoffPerson(world, f.senderId);
    const outsider = handoffPerson(world, f.outsiderId);
    expect(createTerrainMapView(world, outsider, false).trailPositions.get(carrier.id)).toBeDefined();
    const point = { x: 240, y: 175 };
    const medicine: DanxiaMedicineCommitment = {
      id: 'private-overlapping-medicine', shortageId: 'shortage', sourceCaseId: 'case', appointmentId: 'visit',
      discipleId: client.id, patientId: f.recipientId, householdId: 'house', volunteerId: 'volunteer',
      settlementId: 'village', originId: f.originId, destinationId: f.destinationId, escortId: carrier.id,
      choice: 'offer_ship', startedTick: world.tick - 1, offerUntilTick: world.tick + 2,
      status: 'lost', escrow: 0, acceptedTick: world.tick - 1, returnStartedTick: world.tick,
      path: [point], pathIndex: 0,
    };
    world.danxiaMedicine.commitments.push(medicine);
    const archived = JSON.stringify(world);
    const own = createTerrainMapView(world, client, false);
    expect(own.trailPositions.get(carrier.id)).toEqual(point);
    expect(mapActorPositions(own.seenLocations, own.liveActors, own.trailPositions)).toContainEqual({
      actor: carrier, ...point,
    });
    for (const person of [outsider, { ...client }]) {
      const hidden = createTerrainMapView(world, person, false);
      expect(hidden.liveActors).not.toContain(carrier);
      expect(hidden.trailPositions.has(carrier.id)).toBe(false);
    }
    expect(JSON.stringify(world)).toBe(archived);
  });
});
