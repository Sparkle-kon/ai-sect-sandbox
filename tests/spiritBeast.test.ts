import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceSpiritBeasts, availableBeastTames, guardingHerbBeast, petCombatBonus, spawnInitialBeasts, tameSpiritBeast } from '../src/engine/spiritBeastEngine';
import type { SpiritBeast } from '../src/types/world';

function fixture(kind: SpiritBeast['kind'] = '妖兽') {
  const world = createInitialWorld();
  const [actor, visitor] = world.cultivators;
  const place = world.locations.find(({ type }) => type === 'spirit_vein')!;
  actor.locationId = place.id;
  actor.realm = '筑基'; actor.combatPower = 100; actor.maxHp = 500; actor.hp = 500;
  actor.herbs.jade_leaf = 3;
  const beast: SpiritBeast = { id: 'lair-test', name: '试验灵兽', kind, locationId: place.id, homeLocationId: place.id,
    hp: 300, maxHp: 300, power: 200, cultivation: 5, alive: true, nextActionTick: 18 };
  world.spiritBeasts = [beast];
  const decision = { chosenAction: 'TAME_BEAST', targetBeastId: beast.id, innerMonologue: '交好' } as const;
  return { world, actor, visitor, beast, place, decision };
}
describe('wilderness beasts and bonded companions', () => {
  it('builds a deterministic wilderness-only population and does not act before its schedule', () => {
    const { world, beast } = fixture();
    const population = spawnInitialBeasts(world.locations);
    expect(population.length).toBeGreaterThan(0);
    expect(population).toEqual(spawnInitialBeasts([...world.locations].reverse()));
    expect(population.every(({ locationId, nextActionTick }) => nextActionTick >= 18 &&
      ['spirit_vein', 'secret_realm', 'abyss'].includes(world.locations.find(({ id }) => id === locationId)!.type))).toBe(true);
    const rng = vi.fn(() => 0);
    expect(advanceSpiritBeasts(world, rng)).toEqual([]);
    expect(beast.cultivation).toBe(5);
    expect(rng).not.toHaveBeenCalled();
  });

  it('guards its occupied lair against weak herb gatherers, grows and harms only low-realm targets', () => {
    const { world, actor, beast, place } = fixture();
    expect(guardingHerbBeast(world, actor)).toBeUndefined();
    world.tick = 18;
    expect(guardingHerbBeast(world, actor)).toBe(beast);
    const hp = actor.hp;
    const attack = advanceSpiritBeasts(world, () => 0)[0];
    expect(attack.title).toContain('袭击');
    expect(attack.damage).toEqual([{ cultivatorId: actor.id, amount: hp - actor.hp }]);
    expect(beast.cultivation).toBeGreaterThan(5);
    expect(beast.hp).toBeLessThan(beast.maxHp);
    expect(advanceSpiritBeasts(world, () => 0)).toEqual([]);
    world.tick += 3; actor.realm = '金丹';
    expect(advanceSpiritBeasts(world, () => 0).some(({ title }) => title.includes('袭击'))).toBe(false);
    expect(beast.locationId).not.toBe(place.id);
    expect(guardingHerbBeast(world, actor)).toBeUndefined();
  });

  it('charges feed on a legal attempt, tames once, and provides only a co-located pet bonus', () => {
    const { world, actor, beast, decision, visitor } = fixture();
    expect(availableBeastTames(visitor, world)).toEqual([]);
    expect(tameSpiritBeast(world, actor, decision, () => .999)?.title).toBe('驯兽未成');
    expect(actor.herbs.jade_leaf).toBe(2);
    expect(tameSpiritBeast(world, actor, decision, () => 0)?.title).toBe('灵兽认主');
    expect(actor.herbs.jade_leaf).toBe(1);
    expect(beast.tamedBy).toBe(actor.id);
    expect(tameSpiritBeast(world, actor, decision, () => 0)).toBeNull();
    expect(petCombatBonus(world, actor)).toBeGreaterThan(1);
    actor.locationId = world.locations.find(({ id }) => id !== beast.locationId)!.id;
    expect(petCombatBonus(world, actor)).toBe(1);
    world.tick++;
    advanceSpiritBeasts(world, () => .5);
    expect(beast.locationId).toBe(actor.locationId);
    expect(petCombatBonus(world, actor)).toBeGreaterThan(1);
    actor.alive = false; actor.hp = 0;
    advanceSpiritBeasts(world, () => .5);
    expect(beast.tamedBy).toBeUndefined();
    expect(petCombatBonus(world, actor)).toBe(1);
  });

  it('requires stronger cultivation and feeding for fierce beasts and wakes a bounded tide once', () => {
    const { world, actor, beast, decision } = fixture('凶兽');
    actor.herbs.star_bloom = 2;
    expect(tameSpiritBeast(world, actor, decision, () => 0)).toBeNull();
    expect(actor.herbs.star_bloom).toBe(2);
    actor.realm = '金丹';
    expect(availableBeastTames(actor, world)).toHaveLength(1);
    world.tick = 36; beast.nextActionTick = 37;
    expect(advanceSpiritBeasts(world, () => .5)[0].title).toBe('凶兽引动兽潮');
    expect(world.mapHazards).toContainEqual(expect.objectContaining({ kind: 'beast_tide', createdTick: 36, expiresTick: 40 }));
    expect(advanceSpiritBeasts(world, () => .5)).toEqual([]);
    expect(tameSpiritBeast(world, actor, decision, () => 0)).not.toBeNull();
    expect(actor.herbs.star_bloom).toBe(0);
  });
});
