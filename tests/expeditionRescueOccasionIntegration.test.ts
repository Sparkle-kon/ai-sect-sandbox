import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveExpeditionRescueAction } from '../src/engine/expeditionRescueEngine';
import { activeOccasionForActor, advanceOccasions, joinOccasion } from '../src/engine/occasionEngine';
import type { WorldEvent } from '../src/types/world';

function startedExpedition(entrants = 8) {
  const world = createInitialWorld(20);
  const [guide, weak, ...remaining] = world.cultivators.slice(0, entrants);
  world.tick = 60;
  advanceOccasions(world, () => .99);
  const [occasion] = world.occasions;
  expect(occasion.kind).toBe('expedition');
  guide.combatPower = 100_000;
  weak.combatPower = 50_000;
  weak.hp = Math.max(1, Math.floor(weak.maxHp / 5));
  for (const actor of remaining) {
    actor.combatPower = 100;
    actor.hp = actor.maxHp;
  }
  for (const actor of [guide, weak, ...remaining]) {
    actor.herbs.jade_leaf = 10;
    actor.herbs.earth_root = 10;
    actor.exploredTileIds = world.terrain.tiles.map(({ id }) => id);
    expect(joinOccasion(world, actor, { chosenAction: 'JOIN_OCCASION', targetOccasionId: occasion.id, innerMonologue: '' })).not.toBeNull();
  }
  const beforeGuideStones = guide.spiritStones;
  world.tick = occasion.registrationClosesTick;
  advanceOccasions(world, () => 0);
  expect(occasion.status).toBe('running');
  expect(occasion.remainingIds.slice(0, 2)).toEqual([guide.id, weak.id]);
  world.tick++;
  advanceOccasions(world, () => .99);
  expect(occasion.expeditions.map(({ cultivatorId, outcome }) => [cultivatorId, outcome])).toEqual([[guide.id, 'loot']]);
  expect(guide.spiritStones).toBe(beforeGuideStones + 180);
  const existingLoot = guide.artifacts.find(({ id }) => id === `relic-${occasion.id}-${guide.id}`);
  expect(existingLoot).toBeDefined();
  world.tick++;
  const signal = () => resolveExpeditionRescueAction(world, weak, { chosenAction: 'EXPEDITION_RESCUE', rescueMove: 'signal',
    targetOccasionId: occasion.id, innerMonologue: '' });
  const accept = (requestId: string) => resolveExpeditionRescueAction(world, guide, { chosenAction: 'EXPEDITION_RESCUE', rescueMove: 'accept',
    targetExpeditionRescueId: requestId, innerMonologue: '' });
  return { world, weak, guide, occasion, existingLoot, signal, accept };
}

describe('distress inside the actual temporary occasion lifecycle', () => {
  it('does not reroll a waiting explorer or previously earned loot; tracks one real journey while unrelated participants continue', () => {
    const { world, weak, guide, occasion, existingLoot, signal, accept } = startedExpedition();
    const participants = [...occasion.participantIds];
    const nextOrdinary = occasion.remainingIds.find((id) => id !== weak.id);
    expect(nextOrdinary).toBeDefined();
    const signalEvent = signal();
    expect(signalEvent?.witnessScope).toBe('participants');
    const [rescue] = world.expeditionRescues.requests;
    expect(rescue.witnessIds).toContain(guide.id);
    expect(accept(rescue.id)).toBeNull();
    const otherRoll = vi.fn(() => .6);
    advanceOccasions(world, otherRoll);
    expect(otherRoll).toHaveBeenCalledTimes(1);
    expect(occasion.expeditions[1]?.cultivatorId).toBe(nextOrdinary);
    expect(occasion.remainingIds).toContain(weak.id);
    world.tick++;
    const before = { ...guide.herbs };
    expect(accept(rescue.id)?.witnessScope).toBe('participants');
    expect(rescue.status).toBe('extracting');
    expect(rescue.path.length).toBeGreaterThan(1);
    expect(rescue.pathIndex).toBe(0);
    expect(weak.locationId).toBe(occasion.locationId);
    expect(guide.locationId).toBe(occasion.locationId);
    const initial = advanceOccasions(world, otherRoll);
    expect(rescue.pathIndex).toBe(0);
    const following: WorldEvent[] = [...initial];
    while (rescue.status === 'extracting' && world.tick < occasion.expiresTick) {
      world.tick++;
      const from = rescue.pathIndex;
      following.push(...advanceOccasions(world, otherRoll));
      expect(rescue.pathIndex).toBeGreaterThan(from);
      if (rescue.status === 'extracting') {
        expect(activeOccasionForActor(world, weak)).toBe(occasion);
        expect(guide.locationId).toBe(occasion.locationId);
        expect(weak.locationId).toBe(occasion.locationId);
      }
    }
    expect(rescue.status).toBe('rescued');
    expect(rescue.pathIndex).toBe(rescue.path.length - 1);
    expect(rescue.supplySpent).toBe(1);
    expect(guide.herbs).toEqual({ ...before, jade_leaf: before.jade_leaf - 1 });
    expect(following.filter(({ id }) => id.includes(rescue.id)).filter(({ title }) => /抵达|撤离/.test(title))).toHaveLength(1);
    expect(weak.locationId).toBe(rescue.exitSiteId);
    expect(guide.locationId).toBe(rescue.exitSiteId);
    expect(activeOccasionForActor(world, weak)).toBeUndefined();
    expect(activeOccasionForActor(world, guide)).toBeUndefined();
    expect(occasion.participantIds).toEqual(participants);
    expect(occasion.remainingIds).not.toContain(weak.id);
    expect(occasion.expeditions.filter(({ cultivatorId }) => cultivatorId === guide.id)).toHaveLength(1);
    expect(occasion.expeditions.some(({ cultivatorId }) => cultivatorId === weak.id)).toBe(false);
    expect(world.cultivators.flatMap(({ artifacts }) => artifacts).filter(({ id }) => id === existingLoot?.id)).toEqual([existingLoot]);
    expect(advanceOccasions(world, otherRoll)).toEqual([]);
  });

  it('closes an expiring unaccepted signal without paying or rewriting forced gate exit as verified rescue', () => {
    const { world, weak, guide, occasion, signal, accept } = startedExpedition();
    expect(signal()).not.toBeNull();
    const [rescue] = world.expeditionRescues.requests;
    const before = { ...guide.herbs };
    world.tick = occasion.expiresTick;
    const rng = vi.fn(() => .6);
    const events = advanceOccasions(world, rng);
    expect(occasion.status).toBe('cancelled');
    expect(world.locations.some(({ id }) => id === occasion.locationId)).toBe(false);
    expect(rescue.status).toBe('expired');
    expect(rescue.supplySpent).toBeUndefined();
    expect(rescue.exitSiteId).toBeUndefined();
    expect(guide.herbs).toEqual(before);
    expect(activeOccasionForActor(world, weak)).toBeUndefined();
    expect(accept(rescue.id)).toBeNull();
    expect(events.some(({ id }) => id === `evt-${world.tick}-${occasion.id}-close`)).toBe(true);
    expect(events.find(({ id }) => id === `evt-${world.tick}-${occasion.id}-close`)?.description).toContain('未走完的路线不计为救援抵达');
    expect(rng).not.toHaveBeenCalled();
    expect(advanceOccasions(world, rng)).toEqual([]);
  });

  it('keeps an otherwise empty gate open while two processed members walk their accepted route', () => {
    const { world, weak, guide, occasion, signal, accept } = startedExpedition(4);
    advanceOccasions(world, () => .42);
    expect(weak.alive).toBe(true);
    const legacyOutcome = occasion.expeditions.find(({ cultivatorId }) => cultivatorId === weak.id);
    expect(legacyOutcome).toBeDefined();
    expect(occasion.remainingIds).not.toContain(weak.id);
    world.tick++;
    expect(signal()).not.toBeNull();
    const [rescue] = world.expeditionRescues.requests;
    advanceOccasions(world, () => .6);
    world.tick++;
    expect(accept(rescue.id)).not.toBeNull();
    advanceOccasions(world, () => .6);
    expect(occasion.status).toBe('running');
    expect(occasion.remainingIds).toEqual([]);
    expect(world.locations.some(({ id }) => id === occasion.locationId)).toBe(true);
    const noRoll = vi.fn(() => .99);
    while (rescue.status === 'extracting' && world.tick < occasion.expiresTick) {
      world.tick++;
      advanceOccasions(world, noRoll);
    }
    expect(noRoll).not.toHaveBeenCalled();
    expect(rescue.status).toBe('rescued');
    expect(occasion.status).toBe('completed');
    expect(guide.locationId).toBe(rescue.exitSiteId);
    expect(weak.locationId).toBe(rescue.exitSiteId);
    expect(occasion.expeditions.filter(({ cultivatorId }) => cultivatorId === weak.id)).toEqual([legacyOutcome]);
  });
});
