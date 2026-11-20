import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeOccasionForActor, advanceOccasions, availableOccasionJoins, joinOccasion } from '../src/engine/occasionEngine';
import type { Cultivator, WorldState } from '../src/types/world';

const join = (world: WorldState, actor: Cultivator) => joinOccasion(world, actor,
  { chosenAction: 'JOIN_OCCASION', targetOccasionId: world.occasions[0].id, innerMonologue: '报名' });

function fixture(roll: number) {
  const world = createInitialWorld();
  world.tick = 60;
  advanceOccasions(world, () => roll);
  return { world, occasion: world.occasions[0] };
}

describe('tournaments and temporary realm expeditions', () => {
  it('opens only on schedule, limits enrollment and never creates duplicate occasions', () => {
    const world = createInitialWorld();
    world.tick = 59;
    const rng = vi.fn(() => .1);
    expect(advanceOccasions(world, rng)).toEqual([]);
    expect(rng).not.toHaveBeenCalled();
    world.tick++;
    expect(advanceOccasions(world, rng)).toHaveLength(1);
    expect(advanceOccasions(world, rng)).toEqual([]);
    expect(world.occasions).toHaveLength(1);
    const entrant = world.cultivators[0];
    entrant.locationId = world.occasions[0].locationId;
    expect(availableOccasionJoins(entrant, world)).toHaveLength(1);
    expect(join(world, entrant)).not.toBeNull();
    expect(join(world, entrant)).toBeNull();
    expect(activeOccasionForActor(world, entrant)).toBe(world.occasions[0]);
    world.tick = world.occasions[0].registrationClosesTick;
    expect(join(world, world.cultivators[1])).toBeNull();
    expect(advanceOccasions(world, rng)[0].title).toContain('取消');
    expect(activeOccasionForActor(world, entrant)).toBeUndefined();
    expect(entrant.locationId).toBe(world.occasions[0].locationId);
  });

  it('runs a bounded nonlethal tournament with a bye, real rewards and a single champion', () => {
    const { world, occasion } = fixture(0);
    const [strong, weak, third] = world.cultivators;
    for (const actor of [strong, weak, third]) { actor.hp = actor.maxHp; join(world, actor); }
    strong.combatPower = 200_000;
    weak.combatPower = 200;
    third.combatPower = 100;
    const balance = strong.spiritStones;
    const contribution = strong.contribution;
    const own = world.sects.find(({ id }) => id === strong.sectId)!;
    const reputation = own.reputation;
    world.tick = occasion.registrationClosesTick;
    expect(advanceOccasions(world, () => .5)[0].title).toContain('开始');
    expect(strong.locationId).toBe(occasion.locationId);
    world.tick++;
    expect(advanceOccasions(world, () => .5)).toHaveLength(1);
    expect(occasion.bouts.some(({ secondId }) => secondId === undefined)).toBe(true);
    expect(advanceOccasions(world, () => .5)).toEqual([]);
    world.tick++;
    expect(advanceOccasions(world, () => .5).map(({ title }) => title)).toContain('大比魁首揭晓');
    expect(occasion.championId).toBe(strong.id);
    expect(occasion.status).toBe('completed');
    expect(strong.locationId).toBe(own.headquartersId);
    expect(strong.spiritStones).toBe(balance + 220); expect(strong.contribution).toBe(contribution + 20);
    expect(own.reputation).toBe(reputation + 8);
    expect([strong, weak, third].every(({ alive, hp }) => alive && hp > 0)).toBe(true);
  });

  it('resolves expedition loot and lethal danger then evacuates and preserves inheritance', () => {
    const { world, occasion } = fixture(1);
    const [first, second] = world.cultivators;
    first.combatPower = 100_000;
    first.hp = first.maxHp;
    second.hp = 1;
    second.authoredTechnique = { id: 'test-scroll', name: '流光经', spiritRoot: '火' };
    const initialStones = first.spiritStones;
    expect(world.locations.find(({ id }) => id === occasion.locationId)?.type).toBe('secret_realm');
    expect(join(world, first)).not.toBeNull(); expect(join(world, second)).not.toBeNull();
    world.tick = occasion.registrationClosesTick;
    advanceOccasions(world, () => 0);
    world.tick++;
    advanceOccasions(world, () => 1);
    expect(occasion.expeditions[0]).toMatchObject({ cultivatorId: first.id, outcome: 'loot' });
    expect(first.spiritStones).toBe(initialStones + 180);
    expect(first.artifacts.some(({ tier }) => tier === '通天灵宝')).toBe(true);
    world.tick++;
    expect(advanceOccasions(world, () => 0).some(({ category }) => category === 'death')).toBe(true);
    expect(occasion.expeditions[1]).toMatchObject({ cultivatorId: second.id, outcome: 'death' });
    expect(second.alive).toBe(false);
    expect(occasion.status).toBe('completed');
    expect(world.locations.some(({ id }) => id === occasion.locationId)).toBe(false);
    expect(world.locations.some(({ id }) => id === first.locationId)).toBe(true);
    expect(world.locations.some(({ inheritanceScrolls }) => inheritanceScrolls.some(({ id }) => id === 'test-scroll'))).toBe(true);
  });

  it('cleans up an empty temporary site without starting activity after its timeout', () => {
    const { world, occasion } = fixture(1);
    world.tick = occasion.expiresTick;
    const result = advanceOccasions(world, () => .5);
    expect(result[0]?.title).toContain('取消');
    expect(occasion.status).toBe('cancelled');
    expect(world.locations.some(({ id }) => id === occasion.locationId)).toBe(false);
  });
});
