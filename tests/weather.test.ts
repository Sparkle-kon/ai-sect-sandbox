import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { generateTerrain, terrainTileAt } from '../src/engine/terrainEngine';
import { localQiWeather, visibleQiWeather, weatherHabitatScore, weatherHerbRegrowth, weatherTravelFriction } from '../src/engine/weatherEngine';
import type { HerbId, LocationNode } from '../src/types/world';

const herbs: HerbId[] = ['jade_leaf', 'earth_root', 'star_bloom', 'shadow_moss'];

describe('seasonal qi fronts', () => {
  it('produces seed-specific bounded fronts without advancing simulation RNG and verifies forecast across seasons', () => {
    const world = createInitialWorld(0);
    const different = createInitialWorld(2031);
    world.tick = 12;
    world.month = 12;
    const source = world.locations[0];
    const previousRandom = { ...world.random };
    const first = localQiWeather(world, source);
    expect(first).toEqual(localQiWeather(structuredClone(world), source));
    expect(first.season).toBe('冬');
    const spring = localQiWeather(world, source, 13);
    expect(spring.season).toBe('春');
    const next = { ...world, tick: 13, year: world.year + 1, month: 1 };
    expect(localQiWeather(next, source)).toEqual(spring);
    expect(Array.from({ length: 40 }, (_, i) => localQiWeather(world, source, i + 1).intensity))
      .not.toEqual(Array.from({ length: 40 }, (_, i) => localQiWeather({ ...different, tick: 12, month: 12 }, different.locations[0], i + 1).intensity));
    expect(world.random).toEqual(previousRandom);
  });

  it('gives separate observations and forecasts only for currently visible locations', () => {
    const world = createInitialWorld(0);
    const actor = world.cultivators[0];
    const template = world.locations[0];
    const fixtureSite = (id: string, x: number, type: LocationNode['type']): LocationNode =>
      ({ ...template, type, id, x, y: 120, ownerSectId: undefined });
    const home = fixtureSite('test-home', 120, 'sect_hq');
    const near = fixtureSite('test-near', 160, 'spirit_vein');
    const hidden = fixtureSite('test-hidden', 900, 'secret_realm');
    const market = fixtureSite('test-market', 820, 'market');
    world.locations = [home, near, hidden, market];
    world.terrain = generateTerrain(world.locations, world.terrain.seed);
    actor.locationId = home.id;
    actor.realm = '练气';
    actor.exploredTileIds = [terrainTileAt(world, hidden.x, hidden.y)!.id];
    expect(visibleQiWeather(world, actor).map((entry) => entry.locationId)).toEqual([home.id, near.id]);
    const [entry] = visibleQiWeather(world, actor);
    expect(entry.observed.tick).toBe(world.tick);
    expect(entry.forecast.map(({ tick }) => tick)).toEqual([world.tick + 1, world.tick + 2, world.tick + 3]);
    expect(visibleQiWeather(world).map(({ locationId }) => locationId)).toEqual([home.id, market.id]);
    actor.alive = false;
    expect(visibleQiWeather(world, actor)).toEqual([]);
  });

  it('varies route resistance and habitat preference over time without modifying terrain', () => {
    const world = createInitialWorld(2031);
    const from = world.locations[0], to = world.locations[3];
    const results = Array.from({ length: 40 }, (_, tick) => {
      world.tick = tick + 1;
      world.month = tick % 12 + 1;
      expect(weatherTravelFriction(world, from, from)).toBe(0);
      return { friction: weatherTravelFriction(world, from, to), habitat: weatherHabitatScore(world, from, to, '瑞兽') };
    });
    expect(results.every(({ friction }) => friction >= 0 && friction <= 1)).toBe(true);
    expect(Math.max(...results.map(({ friction }) => friction))).toBeGreaterThan(.35);
    expect(new Set(results.map(({ habitat }) => habitat)).size).toBeGreaterThan(8);
  });

  it('limits resource growth and produces real seasonal effects over hundreds of ticks across seeds', () => {
    let added = 0;
    let skipped = 0;
    for (const seed of [0, 1, 2031, 0xffffffff]) {
      const world = createInitialWorld(seed);
      for (let tick = 1; tick <= 504; tick++) {
        world.tick = tick;
        world.month = (tick - 1) % 12 + 1;
        for (const location of world.locations) {
          const reading = localQiWeather(world, location);
          expect(reading.intensity).toBeGreaterThanOrEqual(0);
          expect(reading.intensity).toBeLessThanOrEqual(1);
          for (const herb of herbs) {
            if ((tick + Math.round(location.x)) % 5 === 0) location.herbs[herb] = Math.max(0, location.herbs[herb] - 1);
            const pulse = weatherHerbRegrowth(world, location, herb, 3);
            const normal = Number(tick % 3 === 0);
            if (reading.kind === '灵潮' && reading.intensity >= .35) expect(pulse).toBeGreaterThanOrEqual(normal);
            else if (reading.intensity >= .35) expect(pulse).toBeLessThanOrEqual(normal);
            if (pulse > normal) added++;
            if (pulse < normal) skipped++;
            const prior = location.herbs[herb];
            location.herbs[herb] = Math.min(location.herbCapacity[herb], prior + pulse);
            expect(location.herbs[herb]).toBeGreaterThanOrEqual(prior);
            expect(location.herbs[herb]).toBeLessThanOrEqual(location.herbCapacity[herb]);
          }
        }
      }
    }
    expect(added).toBeGreaterThan(100);
    expect(skipped).toBeGreaterThan(100);
  });
});
