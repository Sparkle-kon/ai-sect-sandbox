import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { buildChronicleFocusTargets, canFocusChronicleSite, createChronicleFocusResolver, resolveChronicleFocus } from '../src/engine/chronicleFocusEngine';
import { maintainSectPolitics } from '../src/engine/sectPoliticsEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { WorldEvent } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(95);
  const [viewer, witness, other] = world.cultivators;
  const here = world.locations.find(({ id }) => id === viewer.locationId)!;
  const away = [...world.locations].sort((a, b) => Math.hypot(b.x - here.x, b.y - here.y) - Math.hypot(a.x - here.x, a.y - here.y))[0];
  witness.locationId = here.id;
  other.locationId = away.id;
  const fact: WorldEvent = { id: 'evt-focus-test', tick: world.tick, month: world.month, year: world.year,
    category: 'diplomacy', title: '测试公开记录', description: '测试正文不作坐标依据', actorIds: [witness.id, other.id],
    locationId: here.id };
  world.events.unshift(fact);
  return { world, viewer, witness, other, here, away, fact };
}

describe('chronicle focus scoped to actual public facts and existing fog', () => {
  it('uses strict original viewer observation, not global map state, explored memory, or target imitation', () => {
    const { world, viewer, witness, other, here, away, fact } = fixture();
    viewer.exploredTileIds.push(terrainTileAt(world, away.x, away.y)!.id);
    const resolver = createChronicleFocusResolver(world, viewer.id);
    expect(resolver.build(fact.id)).toEqual({ links: [
      { kind: 'site', eventId: fact.id, targetId: here.id, label: here.name },
      { kind: 'actor', eventId: fact.id, targetId: witness.id, label: witness.name },
    ], withheld: true });
    expect(JSON.stringify(resolver.build(fact.id))).not.toContain(other.name);
    expect(canFocusChronicleSite(world, away.id, viewer.id)).toBe(false);
    expect(canFocusChronicleSite(world, here.id, viewer.id)).toBe(true);
    expect(resolver.resolve({ eventId: fact.id, kind: 'site', targetId: away.id })).toEqual({ ok: false, reason: 'unavailable' });
    expect(resolver.resolve({ eventId: fact.id, kind: 'actor', targetId: viewer.id })).toEqual({ ok: false, reason: 'unavailable' });
    expect(buildChronicleFocusTargets(world, fact.id, null)).toEqual({ links: [], withheld: true });
    witness.locationId = away.id;
    expect(resolveChronicleFocus(world, { eventId: fact.id, kind: 'actor', targetId: witness.id }, viewer.id))
      .toEqual({ ok: false, reason: 'unavailable' });
    world.locations = world.locations.filter(({ id }) => id !== here.id);
    expect(resolveChronicleFocus(world, { eventId: fact.id, kind: 'site', targetId: here.id }, viewer.id))
      .toEqual({ ok: false, reason: 'unavailable' });
  });

  it('fails closed for participant-only, future, colliding, missing and sealed dispatch IDs without leaking a link or hint', () => {
    const { world, viewer, fact } = fixture();
    world.events.unshift({ ...fact, id: 'private', witnessScope: 'participants' }, { ...fact, id: 'future', tick: world.tick + 1 },
      { ...fact, id: 'evt-sealed-dispatch-forged-public' });
    world.events.unshift({ ...fact, id: 'clash', actorIds: [] }, { ...fact, id: 'clash' });
    world.events.push({ ...fact, id: fact.id, witnessScope: 'participants' });
    const links = createChronicleFocusResolver(world, viewer.id);
    for (const eventId of ['private', 'future', 'clash', fact.id, 'evt-sealed-dispatch-forged-public', 'missing']) {
      expect(links.build(eventId)).toEqual({ links: [], withheld: false });
      expect(links.resolve({ eventId, kind: 'actor', targetId: fact.actorIds[0] })).toEqual({ ok: false, reason: 'unavailable' });
    }
  });

  it('cannot expose a stale guard station or replace a courier checkpoint with the last remembered location', () => {
    const { world, viewer, witness, other, here, away, fact } = fixture();
    witness.guardAssignment = { locationId: away.id, assignedTick: world.tick, expiresTick: world.tick + 2 };
    expect(buildChronicleFocusTargets(world, fact.id, viewer.id).links.some(({ kind }) => kind === 'actor')).toBe(false);
    delete witness.guardAssignment;
    world.couriers.dispatches.push({ id: 'dispatch-test', senderId: viewer.id, recipientId: other.id, courierId: witness.id,
      originId: here.id, destinationId: away.id, status: 'in_transit', openedTick: world.tick, offerExpiresTick: world.tick + 2,
      acceptedTick: world.tick, deadlineTick: world.tick + 4, sealed: { kind: 'private_cue', cue: 'request_audience' },
      path: [{ x: here.x, y: here.y }, { x: away.x, y: away.y }], pathIndex: 1, feePaid: 6 });
    expect(buildChronicleFocusTargets(world, fact.id, viewer.id).links.some(({ kind }) => kind === 'actor')).toBe(false);
  });

  it('links the durable institution only for a verified living election at the actual titled venue', () => {
    const { world, viewer } = fixture();
    const sect = world.sects.find(({ id }) => id === viewer.sectId)!;
    const site = world.locations.find(({ id }) => id === sect.headquartersId)!;
    const incumbent = world.cultivators.find(({ id }) => id === sect.leaderId)!;
    if (viewer.id === incumbent.id) {
      delete sect.leaderId;
    } else {
      incumbent.alive = false;
      incumbent.hp = 0;
    }
    viewer.locationId = site.id;
    const publicElection = maintainSectPolitics(world).find(({ id }) => id.includes(`-${sect.id}-leadership-vacancy-`))!;
    expect(publicElection).toBeDefined();
    world.events.unshift(publicElection, { ...publicElection, id: 'forged-ceremony' });
    expect(buildChronicleFocusTargets(world, publicElection.id, viewer.id).links).toContainEqual({
      kind: 'sect', targetId: sect.id, eventId: publicElection.id, label: sect.name,
    });
    expect(buildChronicleFocusTargets(world, 'forged-ceremony', viewer.id).links.some(({ kind }) => kind === 'sect')).toBe(false);
    delete site.ownerSectId;
    expect(resolveChronicleFocus(world, { eventId: publicElection.id, kind: 'sect', targetId: sect.id }, viewer.id))
      .toEqual({ ok: false, reason: 'unavailable' });
  });
});
