import { isScopedExpeditionGate } from '../engine/expeditionOmenTerms';
import { terrainTileAt } from '../engine/terrainEngine';
import { onLowerPlane } from '../engine/upperPassageIsolation';
import type { Cultivator, MapPoint, WorldState } from '../types/world';
import { MAP_HEIGHT, MAP_WIDTH } from './mapCamera';
import { mapTransitActorIds } from './mapConvoyView';
import type { createTerrainMapView } from './terrainMapView';

type TerrainView = ReturnType<typeof createTerrainMapView>;

export interface MapFlyingSword {
  id: string;
  points: readonly MapPoint[];
}

function routeIsVisible(world: WorldState, view: TerrainView, path: readonly MapPoint[]): boolean {
  const visible = ({ x, y }: MapPoint) => {
    const tile = terrainTileAt(world, x, y);
    return !!tile && view.tileState(tile) === 'visible' && (!view.current || view.current.has(tile.id));
  };
  return path.every((to, index) => {
    if (!visible(to)) return false;
    if (!index) return true;
    const from = path[index - 1];
    const crossings = [0, 1];
    const axis = (a: number, b: number, cellSize: number) => {
      if (a === b) return;
      for (let edge = Math.floor(Math.min(a, b) / cellSize) + 1; edge * cellSize < Math.max(a, b); edge++) {
        const t = (edge * cellSize - a) / (b - a);
        if (t > 0 && t < 1) crossings.push(t);
      }
    };
    axis(from.x, to.x, MAP_WIDTH / world.terrain.columns);
    axis(from.y, to.y, MAP_HEIGHT / world.terrain.rows);
    crossings.sort((a, b) => a - b);
    const at = (t: number): MapPoint => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    // Test each crossed tile, even where the path barely grazes its corner between control samples.
    return crossings.slice(1).every((end, i) => visible(at((crossings[i] + end) / 2)) && visible(at(end)));
  });
}

function schematicArc(from: MapPoint, to: MapPoint): MapPoint[] {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const bow = Math.min(22, length * .12);
  // A deterministic small quadratic bow, rendered as exactly these segments.
  const side = dx < 0 ? -1 : 1;
  const nx = side * dy / length, ny = -side * dx / length;
  return [from, ...Array.from({ length: 9 }, (_, i) => {
    const t = (i + 1) / 10;
    const offset = 4 * t * (1 - t) * bow;
    return { x: from.x + dx * t + nx * offset, y: from.y + dy * t + ny * offset };
  }), to];
}

/** A schematic cue for the selected actor's own receipt, not a saved flight path or public rumor ledger. */
export function visibleMapFlyingSwords(world: WorldState, view: TerrainView, viewer?: Cultivator): readonly MapFlyingSword[] {
  // The native spread writes at most one learned packet per recipient per month, every third tick for swords.
  if (!viewer || world.tick <= 0 || world.tick % 3 !== 0 || !world.cultivators.includes(viewer)) return [];
  const receipts = viewer.rumors.filter((row) => row.learnedTick === world.tick && row.provenance === 'flying_sword');
  if (receipts.length !== 1) return [];
  const receipt = receipts[0];
  if (receipt.witnessScope === 'participants' || receipt.originTick >= world.tick || receipt.hops < 1 || receipt.hops > 4 ||
      !receipt.sourceCultivatorId || receipt.sourceCultivatorId === viewer.id ||
      world.locations.some((location) => location.id === receipt.locationId && isScopedExpeditionGate(location))) return [];
  const sender = world.cultivators.find(({ id }) => id === receipt.sourceCultivatorId);
  if (!sender || sender.sectId !== viewer.sectId || sender.locationId === viewer.locationId) return [];

  const transit = mapTransitActorIds(world);
  const endpoint = (actor: Cultivator): MapPoint | undefined => {
    if (!actor.alive || actor.hp <= 0 || !onLowerPlane(actor) || !view.liveActors.includes(actor) ||
        transit.has(actor.id) || view.trailPositions.has(actor.id) || !view.isCurrentLocation(actor.locationId) ||
        world.disasterShelter?.cases.some(({ guest, status }) => guest.actorId === actor.id &&
          (status === 'outbound' || status === 'returning'))) return undefined;
    const location = world.locations.find(({ id }) => id === actor.locationId);
    if (!location || isScopedExpeditionGate(location) || !view.seenLocations.includes(location)) return undefined;
    return { x: location.x, y: location.y };
  };
  const from = endpoint(sender), to = endpoint(viewer);
  if (!from || !to || from.x === to.x && from.y === to.y) return [];
  const arc = schematicArc(from, to);
  const points = routeIsVisible(world, view, arc) ? arc : [from, to];
  if (points !== arc && !routeIsVisible(world, view, points)) return [];
  return [{ id: `flying-sword-${world.tick}`, points }];
}
