import type { MapEffect, MapPoint, MapPresentation, MapTile, TerrainBiome, WorldEvent, WorldState } from '../types/world';
import { terrainTileAt } from './terrainEngine';

const WIDTH = 1000;
const HEIGHT = 600;
const COST: Record<TerrainBiome, number> = { 坊市: 1, 灵山: 1.15, 剑冢: 1.65, 荒漠: 1.9, 毒沼: 2.75, 魔渊: 3.4 };
const same = (a: MapPoint, b: MapPoint) => a.x === b.x && a.y === b.y;
const pointCopy = ({ x, y }: MapPoint): MapPoint => ({ x, y });

/** A* with terrain-weighted orthogonal travel and a minimum-cost Manhattan heuristic. */
export function findMapPath(world: WorldState, from: MapPoint, to: MapPoint, allows?: (tile: MapTile) => boolean): MapPoint[] {
  const source = terrainTileAt(world, from.x, from.y);
  const destination = terrainTileAt(world, to.x, to.y);
  if (!source || !destination || (allows && (!allows(source) || !allows(destination)))) return [];
  if (same(from, to)) return [pointCopy(from)];
  if (source.id === destination.id) return [pointCopy(from), pointCopy(to)];
  const { columns, rows, tiles } = world.terrain;
  const index = (col: number, row: number) => row * columns + col;
  const fromIndex = index(source.col, source.row);
  const toIndex = index(destination.col, destination.row);
  const heuristic = (i: number) => Math.abs(tiles[i].col - destination.col) + Math.abs(tiles[i].row - destination.row);
  const steps = [ [1, 0], [0, 1], [-1, 0], [0, -1] ];
  const open = new Set([fromIndex]);
  const firm = new Set<number>();
  const through = new Map<number, number>();
  const g = new Map<number, number>([[fromIndex, 0]]);
  while (open.size) {
    let current = -1;
    let best = Infinity;
    for (const i of open) {
      const estimate = g.get(i)! + heuristic(i);
      if (estimate < best || (estimate === best && i < current)) { current = i; best = estimate; }
    }
    if (current === toIndex) {
      const route = [current];
      while (route[0] !== fromIndex) route.unshift(through.get(route[0])!);
      const point = (tile: typeof source): MapPoint => ({ x: (tile.col + .5) * WIDTH / columns, y: (tile.row + .5) * HEIGHT / rows });
      const points = [from, ...route.map((i) => point(tiles[i])), to].filter((p, i, all) => i === 0 || !same(p, all[i - 1]));
      return points.map(pointCopy);
    }
    open.delete(current);
    firm.add(current);
    const { col, row, biome } = tiles[current];
    for (const [dc, dr] of steps) {
      const c = col + dc; const r = row + dr;
      if (c < 0 || c >= columns || r < 0 || r >= rows) continue;
      const n = index(c, r);
      if (firm.has(n) || !tiles[n] || (allows && !allows(tiles[n]))) continue;
      const candidate = g.get(current)! + (COST[biome] + COST[tiles[n].biome]) / 2;
      if (candidate < (g.get(n) ?? Infinity)) { g.set(n, candidate); through.set(n, current); open.add(n); }
    }
  }
  return [];
}

export function deriveMapPresentation(prev: WorldState, next: WorldState, events: WorldEvent[]): MapPresentation {
  const sameTick = prev.mapPresentation?.tick === next.tick;
  const trails = new Map((sameTick ? prev.mapPresentation.trails : []).map((trail) => [trail.cultivatorId, trail]));
  const effects = new Map((sameTick ? prev.mapPresentation.effects : []).map((effect) => [effect.id, effect]));
  const before = new Map(prev.cultivators.map((actor) => [actor.id, actor]));
  const after = new Map(next.cultivators.map((actor) => [actor.id, actor]));
  const prevSites = new Map(prev.locations.map((site) => [site.id, site]));
  const nextSites = new Map(next.locations.map((site) => [site.id, site]));
  const put = (id: string, kind: MapEffect['kind'], locationId: string | undefined, actorIds: string[], text?: string) => {
    if (!locationId || !nextSites.has(locationId)) return;
    effects.set(id, { id, tick: next.tick, kind, locationId, actorIds: [...actorIds], text });
  };
  const damaged = new Set<string>();
  const paths = new Map<string, MapPoint[]>();
  // A pilgrim has already traversed the actual checkpoint sequence, not a new unrestricted flight.
  const pilgrimsMoved = new Set(next.pilgrimages.journeys.filter(({ lastMovedTick }) => lastMovedTick === next.tick)
    .flatMap(({ organizerId, companionId }) => [organizerId, companionId]));
  for (const entry of events) {
    if (entry.tick !== next.tick) continue;
    const first = entry.actorIds[0] ? after.get(entry.actorIds[0]) : undefined;
    const loc = entry.locationId ?? first?.locationId;
    if (entry.duelWinnerId || entry.id.endsWith('-duel') || entry.id.endsWith('-kill')) put(`${entry.id}-clash`, 'clash', loc, entry.actorIds);
    if (entry.id.includes('-tribulation-wave-') || entry.id.startsWith('evt-god-strike-') || (entry.id.includes('-tribulation-failure') && entry.description.includes('劫雷')) ||
      (entry.category === 'heavenly' && /劫雷|天劫降临/.test(entry.title))) put(`${entry.id}-lightning`, 'lightning', loc, entry.actorIds, entry.title);
    for (const hit of entry.damage ?? []) {
      if (!Number.isFinite(hit.amount) || hit.amount <= 0) continue;
      damaged.add(hit.cultivatorId);
      put(`${entry.id}-damage-${hit.cultivatorId}`, 'damage', loc ?? after.get(hit.cultivatorId)?.locationId,
        [hit.cultivatorId], `−${hit.amount} HP`);
    }
  }
  for (const actor of next.cultivators) {
    const previous = before.get(actor.id);
    if (!previous) continue;
    if (previous.locationId !== actor.locationId && actor.alive && !pilgrimsMoved.has(actor.id)) {
      const origin = prevSites.get(previous.locationId) ?? nextSites.get(previous.locationId);
      const dest = nextSites.get(actor.locationId);
      if (origin && dest) {
        const route = `${origin.x}/${origin.y}>${dest.x}/${dest.y}`;
        const points = paths.get(route) ?? findMapPath(next, origin, dest);
        paths.set(route, points);
        if (points.length > 1) trails.set(actor.id, { cultivatorId: actor.id, tick: next.tick, fromLocationId: previous.locationId,
          toLocationId: actor.locationId, points });
      }
    }
    if (actor.alive && previous.alive && (previous.realm !== actor.realm || previous.realmStage < actor.realmStage)) {
      put(`evt-${next.tick}-${actor.id}-map-breakthrough`, 'breakthrough', actor.locationId, [actor.id], `${actor.realm}${actor.realmStage}层`);
    }
    if (previous.hp > actor.hp && !damaged.has(actor.id) && actor.alive && previous.alive) {
      put(`evt-${next.tick}-${actor.id}-map-damage`, 'damage', actor.locationId, [actor.id], `−${previous.hp - actor.hp} HP`);
    }
  }
  return { tick: next.tick, trails: [...trails.values()], effects: [...effects.values()] };
}
