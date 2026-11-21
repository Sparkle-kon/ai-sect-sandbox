import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { courierCheckpoint } from './sealedCourierEngine';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { expeditionRescueCheckpoint } from './expeditionRescueCheckpoint';
import { boundaryReliefCheckpoint } from './boundaryReliefCheckpoint';
import type { Cultivator, LocationNode, MapTile, TerrainBiome, WorldState, WorldTerrain } from '../types/world';

const WIDTH = 1000;
const HEIGHT = 600;
const COLUMNS = 25;
const ROWS = 15;
const CELL = 40;
const BIOMES: TerrainBiome[] = ['灵山', '毒沼', '剑冢', '荒漠', '魔渊', '坊市'];
const TERRAIN_SPIRIT: Record<TerrainBiome, number> = { 灵山: 49, 毒沼: 32, 剑冢: 44, 荒漠: 12, 魔渊: 39, 坊市: 26 };
const DISTANCE_THRESHOLD = 65;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const dist = (x: number, y: number, site: LocationNode) => Math.hypot(x - site.x, y - site.y);

function noise(seed: number, col: number, row: number): number {
  let n = Math.imul(col + 1, 0x1f123bb5) ^ Math.imul(row + 1, 0x05491333) ^ seed;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 0x100000000;
}

function landmarkBiome(site: LocationNode): TerrainBiome {
  if (site.type === 'market') return '坊市';
  if (site.type === 'abyss') return '魔渊';
  if (site.type === 'secret_realm') return site.spiritRoot === '暗' ? '毒沼' : '剑冢';
  if (site.spiritRoot === '暗') return '毒沼';
  return '灵山';
}

function distanceOrder(x: number, y: number, sites: LocationNode[]): LocationNode[] {
  return sites.slice().sort((a, b) => dist(x, y, a) - dist(x, y, b) || a.id.localeCompare(b.id));
}

export function generateTerrain(locations: LocationNode[], seed: number): WorldTerrain {
  const tiles: MapTile[] = [];
  const ownerAnchors = locations.filter((site) => site.ownerSectId);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      const x = (col + .5) * CELL;
      const y = (row + .5) * CELL;
      const nearest = distanceOrder(x, y, locations)[0];
      const radius = nearest ? dist(x, y, nearest) : Infinity;
      const blockNoise = noise(seed, Math.floor(col / 3), Math.floor(row / 3));
      const fineNoise = noise(seed + 739, col, row);
      // Most background patches have several adjacent same-biome cells.
      const patch = BIOMES[Math.min(4, Math.floor(blockNoise * 5))];
      const biome = nearest && radius <= DISTANCE_THRESHOLD + fineNoise * 52 ? landmarkBiome(nearest) : patch;
      const influence = nearest ? Math.max(0, 1 - radius / 235) : 0;
      const spiritQi = Math.round(clamp(TERRAIN_SPIRIT[biome] * (1 - influence) + (nearest?.spiritQi ?? 0) * influence + (fineNoise - .5) * 13, 5, 100));
      const border = distanceOrder(x, y, ownerAnchors)[0];
      const owned = border && dist(x, y, border) <= (border.type === 'sect_hq' ? 155 : 84) + (fineNoise - .5) * 22;
      tiles.push({ id: `tile-${col}-${row}`, col, row, biome, spiritQi, ...(owned ? { ownerSectId: border.ownerSectId } : {}) });
    }
  }
  return { seed, columns: COLUMNS, rows: ROWS, tiles };
}

export function terrainTileAt(world: WorldState, x: number, y: number): MapTile | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > WIDTH || y > HEIGHT) return undefined;
  const { columns, rows, tiles } = world.terrain;
  const col = Math.min(columns - 1, Math.floor(x / (WIDTH / columns)));
  const row = Math.min(rows - 1, Math.floor(y / (HEIGHT / rows)));
  return tiles[row * columns + col];
}

export function currentVisibleTileIds(world: WorldState, actor: Cultivator): Set<string> {
  const site = expeditionRescueCheckpoint(world, actor) ?? boundaryReliefCheckpoint(world, actor) ??
    courierCheckpoint(world, actor) ?? pilgrimageCheckpoint(world, actor) ??
    world.locations.find(({ id }) => id === actor.locationId);
  if (!actor.alive || !site) return new Set();
  const focus = terrainTileAt(world, site.x, site.y);
  if (!focus) return new Set();
  const radius = actor.realm === '练气' || actor.realm === '筑基' ? 2 : actor.realm === '金丹' || actor.realm === '元婴' ? 3 : 4;
  // The saved/generated grid is row-major; visit only the observed neighborhood, not every tile for every person.
  const { rows, columns, tiles } = world.terrain;
  const visible = new Set<string>();
  for (let row = Math.max(0, focus.row - radius); row <= Math.min(rows - 1, focus.row + radius); row++) {
    for (let col = Math.max(0, focus.col - radius); col <= Math.min(columns - 1, focus.col + radius); col++) {
      if ((col - focus.col) ** 2 + (row - focus.row) ** 2 <= radius ** 2) {
        const tile = tiles[row * columns + col];
        if (tile) visible.add(tile.id);
      }
    }
  }
  return visible;
}

export function noteTerrainVisit(world: WorldState, actor: Cultivator): void {
  const visible = currentVisibleTileIds(world, actor);
  if (visible.size) actor.exploredTileIds = [...new Set([...actor.exploredTileIds, ...visible])];
}

/** Public landmarks aren't fogged on the agent map; credible rumor reveals only the named destination. */
export function knownMapLocations(world: WorldState, actor: Cultivator): LocationNode[] {
  const known = new Set([...actor.exploredTileIds, ...currentVisibleTileIds(world, actor)]);
  const leads = new Set(actor.rumors.filter((rumor) => rumor.provenance !== 'fabricated' && !rumor.id.startsWith('rumor-forged-') && rumor.confidence >= 55 &&
    rumor.originTick <= world.tick && world.tick - rumor.originTick <= 10 && rumor.learnedTick <= world.tick).map(({ locationId }) => locationId));
  return world.locations.filter((location) => {
    if (isScopedExpeditionGate(location)) return false;
    if (location.id === actor.locationId || location.type === 'sect_hq' || location.type === 'market' ||
        world.sects.some((sect) => sect.headquartersId === location.id) || leads.has(location.id)) return true;
    const tile = terrainTileAt(world, location.x, location.y);
    return Boolean(tile && known.has(tile.id));
  });
}
