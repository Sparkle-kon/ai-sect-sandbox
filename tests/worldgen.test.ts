import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { ALCHEMY_RECIPES } from '../src/engine/alchemyEngine';
import { findMapPath } from '../src/engine/mapMotionEngine';
import { knownMapLocations } from '../src/engine/terrainEngine';
import { localQiWeather } from '../src/engine/weatherEngine';
import { advanceWorldTick, executeGodIntervention } from '../src/engine/worldEngine';
import { certifyStartingResources } from '../src/engine/worldgenEngine';
import { isWorldgenProfileId, WORLDGEN_PROFILES, worldgenProfileOf } from '../src/engine/worldgenProfiles';
import type { WorldgenProfileId, WorldState } from '../src/types/world';

const ids = ['classic', 'spirit-bloom', 'fractured-frontier'] as const;
const stock = (world: WorldState) => world.locations.reduce((sum, site) =>
  sum + Object.values(site.herbs).reduce((count, value) => count + value, 0), 0);
const founders = (world: WorldState) => world.cultivators.filter(({ id }) => id.startsWith('founder-'));

describe('living world creation profiles', () => {
  it('uses a closed catalog and preserves deterministic named casts, RNG state and default classic generation', () => {
    expect(Object.keys(WORLDGEN_PROFILES)).toEqual(ids);
    expect(isWorldgenProfileId(null)).toBe(false);
    expect(isWorldgenProfileId('__proto__')).toBe(false);
    expect(isWorldgenProfileId('classic')).toBe(true);
    const legacyStart = createInitialWorld(2031);
    const classic = createInitialWorld(2031, 'classic');
    expect(legacyStart).toEqual(classic);
    expect(classic.cultivators).toHaveLength(16);
    expect(classic.locations.find(({ id }) => id === 'loc-danxia')?.herbs).toEqual({ jade_leaf: 14, earth_root: 9, star_bloom: 3, shadow_moss: 0 });
    const names = classic.cultivators.map(({ id, sectId, name }) => ({ id, sectId, name }));
    for (const id of ids) {
      const one = createInitialWorld(2031, id);
      const again = createInitialWorld(2031, id);
      expect(one).toEqual(again);
      expect(one.random).toEqual(classic.random);
      expect(one.cultivators.slice(0, names.length).map(({ id, sectId, name }) => ({ id, sectId, name }))).toEqual(names);
      expect(one.sects).toEqual(classic.sects);
      expect(one.relationships).toEqual(classic.relationships);
      expect(one.worldgen).toMatchObject({ algorithm: 1, profileId: id, seed: 2031, birthTick: 1 });
    }
    delete legacyStart.worldgen;
    expect(worldgenProfileOf(legacyStart)).toBe('classic');
    const legacyNext = advanceWorldTick(legacyStart);
    const classicNext = advanceWorldTick(classic);
    delete classicNext.worldgen;
    expect(legacyNext).toEqual(classicNext);
  });

  it('has gameplay-distinct climate, real herb stocks, terrain and faction populations under the same seed', () => {
    const sample = (profile: WorldgenProfileId) => createInitialWorld(0, profile);
    const classic = sample('classic');
    const bloom = sample('spirit-bloom');
    const frontier = sample('fractured-frontier');
    expect(stock(bloom)).toBeGreaterThan(stock(classic) * 1.32);
    expect(stock(frontier)).toBeLessThan(stock(classic) * .65);
    expect(bloom.terrain.tiles.map(({ biome }) => biome)).not.toEqual(frontier.terrain.tiles.map(({ biome }) => biome));
    expect(new Set(founders(bloom).map(({ sectId }) => sectId))).toEqual(new Set(['sect-danxia', 'sect-tianji']));
    expect(new Set(founders(frontier).map(({ sectId }) => sectId))).toEqual(new Set(['sect-bloodmoon', 'sect-qingyun']));
    expect(founders(classic)).toEqual([]);
    expect(founders(createInitialWorld(1, 'spirit-bloom'))).not.toEqual(founders(bloom));
    const weather = (world: WorldState) => world.locations.flatMap((site) =>
      Array.from({ length: 144 }, (_, tick) => localQiWeather(world, site, tick + 1)));
    const manyBloom = weather(bloom);
    const manyFrontier = weather(frontier);
    expect(manyBloom.filter(({ kind }) => kind === '灵潮').length).toBeGreaterThan(manyFrontier.filter(({ kind }) => kind === '灵潮').length * 1.4);
    expect(manyFrontier.filter(({ kind }) => kind === '霜息' || kind === '罡风').length)
      .toBeGreaterThan(manyBloom.filter(({ kind }) => kind === '霜息' || kind === '罡风').length * 1.4);
  });

  it('certifies each living founding actor via actual known reachable herbs and a functional starter furnace across seeds', () => {
    const recipe = ALCHEMY_RECIPES.foundation;
    for (const seed of [0, 1, 318, 8193, 0xffffffff]) {
      for (const profile of ids) {
        const world = createInitialWorld(seed, profile);
        const certification = world.worldgen!;
        const actors = world.cultivators.filter(({ alive }) => alive);
        expect(certification.resources).toHaveLength(actors.length);
        expect(certification.resources).toEqual(certifyStartingResources(world));
        expect(new Set(certification.resources.map(({ actorId }) => actorId)).size).toBe(actors.length);
        for (const plan of certification.resources) {
          const actor = actors.find(({ id }) => id === plan.actorId)!;
          const site = knownMapLocations(world, actor).find(({ id }) => id === plan.locationId)!;
          const source = world.locations.find(({ id }) => id === actor.locationId)!;
          expect(site.furnaceGrade).toBeGreaterThanOrEqual(recipe.furnaceGrade);
          expect(site.herbs.jade_leaf).toBeGreaterThanOrEqual(recipe.herbs.jade_leaf!);
          expect(site.herbs.earth_root).toBeGreaterThanOrEqual(recipe.herbs.earth_root!);
          expect(findMapPath(world, source, site).length).toBeGreaterThan(0);
          expect(Number.isInteger(plan.pathSteps) && plan.pathSteps >= 0).toBe(true);
        }
      }
    }
    const failed = createInitialWorld(22, 'fractured-frontier');
    for (const site of failed.locations) site.herbs.jade_leaf = 0;
    expect(certifyStartingResources(failed)).toEqual([]);
    expect(failed.worldgen?.resources.length).toBeGreaterThan(0);
  });

  it('does not rewrite birth proof after a world intervention even when live state changes', () => {
    const world = createInitialWorld(222, 'fractured-frontier');
    const previous = structuredClone(world.worldgen);
    const target = world.locations.find(({ type }) => type === 'market')!;
    const changed = executeGodIntervention(world, { type: 'SPAWN_TREASURE', targetLocationId: target.id });
    expect(changed.worldgen).toEqual(previous);
    expect(changed.locations.find(({ id }) => id === target.id)).not.toEqual(target);
    expect(advanceWorldTick(changed).worldgen).toEqual(previous);
  });
});
