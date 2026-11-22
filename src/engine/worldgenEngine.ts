import {fictionalGenderFor} from './fictionalPersonMetadata';
import type { Cultivator, HerbId, LocationNode, Sect, SpiritRoot, TerrainBiome, WorldGeneration, WorldgenProfileId, WorldState } from '../types/world';
import { ALCHEMY_RECIPES } from './alchemyEngine';
import { findMapPath } from './mapMotionEngine';
import { createSettlementState } from './settlementEngine';
import { spawnInitialBeasts } from './spiritBeastEngine';
import { generateTerrain, knownMapLocations, terrainTileAt } from './terrainEngine';
import { isWorldgenProfileId, WORLDGEN_PROFILES } from './worldgenProfiles';

const HERBS: HerbId[] = ['jade_leaf', 'earth_root', 'star_bloom', 'shadow_moss'];
const GIVEN = ['照川', '持云', '栖松', '禾雨', '问溪', '辞雪', '听岚', '执舟'];
const SURNAME = ['林', '苏', '梁', '韦', '宋', '邱', '乔', '陈'];
const ROOTS: SpiritRoot[] = ['金', '木', '水', '火', '土', '雷', '暗'];
const distinctTerrain: Record<Exclude<WorldgenProfileId, 'classic'>, TerrainBiome[]> = {
  'spirit-bloom': ['灵山', '灵山', '灵山', '毒沼', '剑冢'],
  'fractured-frontier': ['荒漠', '荒漠', '荒漠', '剑冢', '魔渊'],
};

function hash(seed: number, key: string): number {
  let n = seed >>> 0;
  for (let i = 0; i < key.length; i++) n = Math.imul(n ^ key.charCodeAt(i), 0x9e3779b1);
  n = Math.imul(n ^ (n >>> 16), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}
const distance = (a: LocationNode, b: LocationNode) => Math.hypot(a.x - b.x, a.y - b.y);
function isStarterSource(site: LocationNode): boolean {
  const recipe = ALCHEMY_RECIPES.foundation;
  return site.furnaceGrade >= recipe.furnaceGrade &&
    HERBS.every((herb) => site.herbs[herb] >= (recipe.herbs[herb] ?? 0) && site.herbCapacity[herb] >= site.herbs[herb]);
}

/** Verify at creation time only: stock and furnaces are real, and destination is known and traversable. */
export function certifyStartingResources(world: WorldState): WorldGeneration['resources'] {
  const living = world.cultivators.filter((actor) => actor.alive && actor.hp > 0).sort((a, b) => a.id.localeCompare(b.id));
  const byLocation = new Map(world.locations.map((place) => [place.id, place]));
  const routes = new Map<string, number>();
  const resources: WorldGeneration['resources'] = [];
  for (const actor of living) {
    const source = byLocation.get(actor.locationId);
    if (!source) continue;
    const known = knownMapLocations(world, actor).filter(isStarterSource)
      .sort((a, b) => distance(source, a) - distance(source, b) || a.id.localeCompare(b.id));
    for (const destination of known) {
      const key = `${source.id}\n${destination.id}`;
      let pathSteps = routes.get(key);
      if (pathSteps === undefined) {
        const path = findMapPath(world, source, destination);
        if (!path.length) continue;
        pathSteps = Math.max(0, new Set(path.flatMap(({ x, y }) => {
          const tile = terrainTileAt(world, x, y);
          return tile ? [tile.id] : [];
        })).size - 1);
        routes.set(key, pathSteps);
      }
      resources.push({ actorId: actor.id, locationId: destination.id, pathSteps });
      break;
    }
  }
  return resources;
}

function founder(world: WorldState, sect: Sect, profile: WorldgenProfileId, index: number): Cultivator {
  const seed = world.random.seed;
  const id = `founder-${profile}-${sect.id}-${index + 1}`;
  const n = hash(seed, id);
  const hq = world.locations.find(({ id: locationId }) => locationId === sect.headquartersId)!;
  const spiritRoot = index % 2 === 0 ? hq.spiritRoot : ROOTS[Math.floor(n / 101) % ROOTS.length];
  return {
    id, gender:fictionalGenderFor(seed,id), name: SURNAME[n % SURNAME.length] + GIVEN[Math.floor(n / 13) % GIVEN.length],
    title: '创世外门弟子', sectId: sect.id, sectRank: '外门弟子', contribution: 0, transgressions: 0, realm: '练气', realmStage: 1,
    qiProgress: 5 + n % 21, hp: 120, maxHp: 120, combatPower: 100, age: 18 + n % 12, lifespan: 120,
    personality: index % 2 === 0 ? '苟道' : '逍遥', locationId: hq.id, spiritStones: 48 + n % 17, karma: 0,
    currentAction: 'REST', innerMonologue: '我在开山之初入门，自当先稳固根基。', secretGoal: '扎稳功法根基',
    spiritRoot, technique: { name: '入门吐纳诀', spiritRoot }, techniqueMastery: 0,
    herbs: { jade_leaf: 0, earth_root: 0, star_bloom: 0, shadow_moss: 0 }, pills: { foundation: 0, golden: 0, barrier: 0, heart_poison: 0 },
    pillToxicity: 0, exploredTileIds: [], artifacts: [], memories: [], coreMemories: [], memorySequence: 0, reflections: [], rumors: [], alive: true,
  };
}

function enrichPreset(world: WorldState, profileId: Exclude<WorldgenProfileId, 'classic'>): void {
  const { herbScale, qiScale, foundingFocus } = WORLDGEN_PROFILES[profileId];
  const seed = world.random.seed;
  for (const site of world.locations) {
    const bonus = (hash(seed, `${profileId}-qi-${site.id}`) % 7) - 3;
    site.spiritQi = Math.max(12, Math.min(100, Math.round(site.spiritQi * qiScale + bonus)));
    for (const herb of HERBS) {
      // Increase/decrease both actual stock and capacity together; no free live-market injection later.
      const multiplier = herbScale + ((hash(seed, `${profileId}/${site.id}/${herb}`) % 13) - 6) / 100;
      site.herbCapacity[herb] = Math.max(0, Math.round(site.herbCapacity[herb] * multiplier));
      site.herbs[herb] = Math.min(site.herbCapacity[herb], Math.max(0, Math.round(site.herbs[herb] * multiplier)));
    }
  }
  const recipe = ALCHEMY_RECIPES.foundation;
  // Keep an independently checkable minimum at known faction and transit hubs without flattening scarcity.
  for (const place of world.locations) {
    if (place.type !== 'market' && !world.sects.some(({ headquartersId }) => headquartersId === place.id)) continue;
    for (const herb of HERBS) {
      place.herbs[herb] = Math.max(place.herbs[herb], recipe.herbs[herb] ?? 0);
      place.herbCapacity[herb] = Math.max(place.herbCapacity[herb], place.herbs[herb]);
    }
  }
  const favored = foundingFocus === 'observatories' ? ['sect-danxia', 'sect-tianji'] : ['sect-bloodmoon', 'sect-qingyun'];
  for (const [i, sectId] of favored.entries()) {
    const sect = world.sects.find(({ id }) => id === sectId);
    if (!sect || !world.locations.some(({ id }) => id === sect.headquartersId)) continue;
    const foundingCount = i === 0 ? 2 : 1 + hash(seed, `${profileId}-founding`) % 2;
    for (let slot = 0; slot < foundingCount; slot++) world.cultivators.push(founder(world, sect, profileId, slot));
  }
  world.terrain = generateTerrain(world.locations, seed);
  // Change real background travel biomes, but leave all observed landmark tiles canonically anchored.
  for (const tile of world.terrain.tiles) {
    const x = (tile.col + .5) * 1000 / world.terrain.columns;
    const y = (tile.row + .5) * 600 / world.terrain.rows;
    if (world.locations.some((location) => Math.hypot(location.x - x, location.y - y) < 115)) continue;
    const pattern = hash(seed, `${profileId}-terrain-${Math.floor(tile.col / 3)}-${Math.floor(tile.row / 3)}`);
    if (pattern % 4 !== 0) tile.biome = distinctTerrain[profileId][Math.floor(pattern / 7) % distinctTerrain[profileId].length];
  }
  world.spiritBeasts = spawnInitialBeasts(world.locations);
  world.settlements = createSettlementState(world.locations, seed, {generatedPersonMetadata:true});
}

/** Constructor-only transformation; an existing world never has its profile retroactively changed. */
export function initializeWorldProfile(world: WorldState, profileId: WorldgenProfileId): void {
  if (!isWorldgenProfileId(profileId) || world.worldgen || world.tick !== 1) throw new RangeError('Invalid world generation request');
  if (profileId !== 'classic') enrichPreset(world, profileId);
  const resources = certifyStartingResources(world);
  const required = world.cultivators.filter((actor) => actor.alive && actor.hp > 0).length;
  if (resources.length !== required) throw new Error('Starting resource certification failed');
  world.worldgen = { algorithm: 1, profileId, seed: world.random.seed, birthTick: world.tick, resources };
}
