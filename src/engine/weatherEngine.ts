import type { Cultivator, HerbId, LocationNode, SpiritBeast, TerrainBiome, WorldState } from '../types/world';
import { currentVisibleTileIds, knownMapLocations, terrainTileAt } from './terrainEngine';

export type QiWeatherSeason = '春' | '夏' | '秋' | '冬';
export type QiWeatherKind = '平息' | '灵潮' | '罡风' | '霜息';
export interface QiWeatherReading {
  tick: number;
  season: QiWeatherSeason;
  kind: QiWeatherKind;
  /** Local strength, on a 0–1 scale. */
  intensity: number;
}
export interface QiWeatherSite {
  locationId: string;
  locationName: string;
  observed: QiWeatherReading;
  forecast: QiWeatherReading[];
}

export const QI_WEATHER_FORECAST_TICKS = 3;
const SEASONS: QiWeatherSeason[] = ['春', '夏', '秋', '冬'];
const MOD = (n: number, period: number) => ((n % period) + period) % period;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const BIOME_EXPOSURE: Record<TerrainBiome, number> = { 灵山: .08, 毒沼: .025, 剑冢: .11, 荒漠: .13, 魔渊: .05, 坊市: -.07 };

function hash(seed: number, value: number): number {
  let n = (seed >>> 0) ^ Math.imul(value, 0x9e3779b1);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 0x100000000;
}
function territoryPhase(seed: number, owner: string | undefined): number {
  if (!owner) return 0;
  let key = 0;
  for (let i = 0; i < owner.length; i++) key = Math.imul(key, 31) + owner.charCodeAt(i) | 0;
  return (hash(seed, key) - .5) * .35;
}

function qiWeatherAt(world: WorldState, x: number, y: number, tick: number, siteOwner?: string): QiWeatherReading {
  const seed = world.terrain.seed;
  const month = MOD(world.month - 1 + tick - world.tick, 12);
  const season = SEASONS[Math.floor(month / 3)];
  const biome = terrainTileAt(world, x, y);
  if (!biome) return { tick, season, kind: '平息', intensity: 0 };

  // Coherent bands cross the map at a fixed pace; a second slower pulse gives seed-specific years.
  // Territory subtly shifts the exposure, but neither alters the RNG cursor nor stores weather.
  const theta = hash(seed, 11) * 2 * Math.PI;
  const space = (x / 1000 - .5) * Math.cos(theta) + (y / 600 - .5) * Math.sin(theta);
  const phase = 2 * Math.PI * (space + MOD(tick, 14) / 14 + hash(seed, 29)) +
    territoryPhase(seed, siteOwner ?? biome.ownerSectId);
  const slower = Math.sin(2 * Math.PI * (MOD(tick, 37) / 37 + hash(seed, 53)) + space * 3);
  const tendency = season === '春' ? .13 : season === '夏' ? .07 : season === '秋' ? -.01 : -.14;
  const pressure = .70 * Math.sin(phase) + .17 * slower + tendency;
  if (Math.abs(pressure) < .27) return { tick, season, kind: '平息', intensity: 0 };
  const kind: QiWeatherKind = pressure > 0 ? '灵潮' : season === '冬' ? '霜息' : '罡风';
  const intensity = Math.round(clamp((Math.abs(pressure) - .27) / .76 + BIOME_EXPOSURE[biome.biome], .05, 1) * 100) / 100;
  return { tick, season, kind, intensity };
}

export function localQiWeather(world: WorldState, location: LocationNode, tick = world.tick): QiWeatherReading {
  return qiWeatherAt(world, location.x, location.y, tick, location.ownerSectId);
}

/** Return growth units, never subtracting accumulated herbs; callers enforce existing site capacity. */
export function weatherHerbRegrowth(world: WorldState, location: LocationNode, herb: HerbId, baseInterval: number): number {
  if (!Number.isSafeInteger(baseInterval) || baseInterval < 1 || world.tick < 1) return 0;
  const { kind, intensity } = localQiWeather(world, location);
  const regular = world.tick % baseInterval === 0;
  if (kind === '平息' || intensity < .35) return Number(regular);
  const hardy = herb === 'earth_root' || herb === 'shadow_moss';
  // Keep the rates real even when fronts frequently cross site boundaries.
  // A site/plant/tick-specific sample avoids cadence synchronization with yearly fronts.
  const roll = hash(world.terrain.seed, Math.imul(world.tick, 97) +
    Math.round(location.x) * 83 + Math.round(location.y) * 101 +
    (herb === 'jade_leaf' ? 13 : herb === 'earth_root' ? 29 : herb === 'star_bloom' ? 61 : 89));
  // Favorable fronts can only add a pulse; adverse fronts can only skip a regular pulse.
  if (kind === '灵潮') return Number(regular || roll < 1 / Math.max(1, (baseInterval - 1) ** 2));
  const delay = kind === '霜息' && !hardy && intensity >= .55 ? 2 : 1;
  return Number(regular && roll < baseInterval / (baseInterval + delay));
}

function travelCost(reading: QiWeatherReading): number {
  if (reading.kind === '罡风') return reading.intensity;
  if (reading.kind === '霜息') return reading.intensity * .82;
  if (reading.kind === '灵潮') return reading.intensity * .18;
  return 0;
}

/** Normalized route resistance, considering departure, exposure en route and arrival. */
export function weatherTravelFriction(world: WorldState, from: LocationNode, to: LocationNode): number {
  if (from.id === to.id) return 0;
  const midpoint = qiWeatherAt(world, (from.x + to.x) / 2, (from.y + to.y) / 2, world.tick);
  return travelCost(localQiWeather(world, from)) * .25 + travelCost(midpoint) * .5 + travelCost(localQiWeather(world, to)) * .25;
}

/** Preference used to rank actual reachable wilderness choices, not to reveal or spawn sites. */
export function weatherHabitatScore(world: WorldState, from: LocationNode, to: LocationNode, kind: SpiritBeast['kind']): number {
  const weather = localQiWeather(world, to);
  const biome = terrainTileAt(world, to.x, to.y)?.biome;
  const qi = clamp(to.spiritQi, 0, 150) * .025;
  const distance = Math.hypot(to.x - from.x, to.y - from.y) * .006;
  const rough = biome === '魔渊' || biome === '毒沼' || biome === '荒漠';
  const shelter = biome === '灵山' || biome === '剑冢';
  const terrainBias = kind === '凶兽' ? (rough ? .9 : -.2) : kind === '瑞兽' ? (shelter ? .85 : -.35) : 0;
  const frontBias = weather.kind === '灵潮' ? weather.intensity * (kind === '凶兽' ? .65 : 2.5) :
    (weather.kind === '罡风' || weather.kind === '霜息') ? weather.intensity * (kind === '凶兽' ? 1.85 : -2) : 0;
  return qi - distance + terrainBias + frontBias;
}

/** Forecast only at observed sites. Public atlas mode does not illustrate hidden terrain. */
export function visibleQiWeather(world: WorldState, actor?: Cultivator): QiWeatherSite[] {
  const visible = actor ? currentVisibleTileIds(world, actor) : undefined;
  const candidates = actor ? knownMapLocations(world, actor).filter((location) => {
    const tile = terrainTileAt(world, location.x, location.y);
    return tile && visible?.has(tile.id);
  }) : world.locations.filter((location) => location.type === 'sect_hq' || location.type === 'market');
  return candidates.slice().sort((a, b) => a.id.localeCompare(b.id)).map((location) => ({
    locationId: location.id,
    locationName: location.name,
    observed: localQiWeather(world, location),
    forecast: Array.from({ length: QI_WEATHER_FORECAST_TICKS }, (_, index) => localQiWeather(world, location, world.tick + index + 1)),
  }));
}
