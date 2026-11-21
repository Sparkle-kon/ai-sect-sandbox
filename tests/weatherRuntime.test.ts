import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceSpiritBeasts } from '../src/engine/spiritBeastEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import { weatherHabitatScore, weatherTravelFriction } from '../src/engine/weatherEngine';

describe('seasonal weather across actual simulation actions', () => {
  it('charges the modeled route strain only on the journey that actually occurs', () => {
    const world = createInitialWorld(42);
    const actor = world.cultivators[0];
    actor.exploredTileIds = world.terrain.tiles.map(({ id }) => id);
    actor.qiProgress = 40;
    const departure = world.locations.find(({ id }) => id === actor.locationId)!;
    const destination = world.locations.find(({ id }) => id === 'loc-secret-1')!;
    for (let attempt = 0; attempt < 24 && weatherTravelFriction(world, departure, destination) <= .25; attempt++) world.tick++;
    const cost = Math.round(weatherTravelFriction(world, departure, destination) * 12);
    expect(cost).toBeGreaterThanOrEqual(3);
    applyCultivatorBrainDecision(world, actor, { chosenAction: 'EXPLORE', targetLocationId: destination.id, innerMonologue: '御剑巡察' }, () => .99);
    expect(actor.locationId).toBe(destination.id);
    expect(actor.qiProgress).toBe(40 - cost);
    expect(actor.memories.some(({ content }) => content.includes('额外消耗'))).toBe(true);
  });

  it('moves a wild beast to the weather-ranked real habitat instead of always the nearest one', () => {
    const world = createInitialWorld(42);
    const beast = world.spiritBeasts[0];
    world.spiritBeasts = [beast];
    for (const actor of world.cultivators) actor.alive = false;
    const previous = world.locations.find(({ id }) => id === beast.locationId)!;
    const otherSites = world.locations.filter(({ id, type }) => id !== previous.id &&
      (type === 'spirit_vein' || type === 'secret_realm' || type === 'abyss'));
    const distance = (location: { x: number; y: number }) => Math.hypot(location.x - previous.x, location.y - previous.y);
    const nearest = [...otherSites].sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id))[0];
    let chosen = nearest;
    for (let tick = 4; tick < 70; tick++) {
      world.tick = tick;
      chosen = [...otherSites].sort((a, b) => weatherHabitatScore(world, previous, b, beast.kind) -
        weatherHabitatScore(world, previous, a, beast.kind) || distance(a) - distance(b) || a.id.localeCompare(b.id))[0];
      if (chosen.id !== nearest.id) break;
    }
    expect(chosen.id).not.toBe(nearest.id);
    beast.nextActionTick = world.tick;
    advanceSpiritBeasts(world, () => 0);
    expect(beast.locationId).toBe(chosen.id);
  });
});
