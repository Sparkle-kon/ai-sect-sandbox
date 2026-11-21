import { activeDanxiaMedicineEscort, danxiaMedicineActedThisTick } from '../engine/danxiaMedicineTerms';
import { currentVisibleTileIds, knownMapLocations, terrainTileAt } from '../engine/terrainEngine';
import { presentAtVillageGranary } from '../engine/villageGranaryEngine';
import type { Cultivator, MapPoint, MapTile, WorldState } from '../types/world';
import { MAP_HEIGHT, MAP_WIDTH } from './mapCamera';

/** This legend describes only an already-used migration corridor, not present passability. */
export const USED_MIGRATION_ROUTE_LEGEND = '虚线只标已实际行过的迁徙路段，不代表今日还能通行。';
export type UsedMigrationSegment = readonly [MapPoint, MapPoint];

export function projectUsedVillageMigrationSegments(world: WorldState, viewer?: Cultivator): UsedMigrationSegment[] {
  const local = viewer && !activeDanxiaMedicineEscort(world, viewer) && !danxiaMedicineActedThisTick(world, viewer) && presentAtVillageGranary(world, viewer);
  if (!local || !viewer) return [];
  const moves = world.villageEvolution.migrations
    .filter(row => row.tick <= world.tick && (row.fromSettlementId === local.id || row.toSettlementId === local.id)).slice(-4);
  if (!moves.length) return [];
  const knownLocations = new Map(knownMapLocations(world, viewer).map(site => [site.id, site]));
  const knownTiles = new Set([...viewer.exploredTileIds, ...currentVisibleTileIds(world, viewer)]);
  const tiles = new Map(world.terrain.tiles.map(tile => [tile.id, tile]));
  const villages = new Map(world.settlements.villages.map(village => [village.id, village]));
  const censusProof = new Map(world.settlements.records.filter(row => row.kind === 'migration').map(row => [row.id, row]));
  const fromTile = (villageId: string) => {
    const site = knownLocations.get(villages.get(villageId)?.locationId ?? '');
    return site && terrainTileAt(world, site.x, site.y);
  };
  const center = (tile: MapTile): MapPoint => ({
    x: (tile.col + .5) * MAP_WIDTH / world.terrain.columns,
    y: (tile.row + .5) * MAP_HEIGHT / world.terrain.rows,
  });
  const result: UsedMigrationSegment[] = [];
  const registered = new Set<string>();
  for (const move of moves) {
    const proof = censusProof.get(move.id);
    if (!proof || proof.tick !== move.tick || proof.settlementId !== move.fromSettlementId ||
      proof.targetSettlementId !== move.toSettlementId || move.people <= 0 || proof.people !== move.people) continue;
    const origin = fromTile(move.fromSettlementId), destination = fromTile(move.toSettlementId);
    if (!origin || !destination || origin.id === destination.id || move.path.length < 2 ||
      move.path[0] !== origin.id || move.path.at(-1) !== destination.id || new Set(move.path).size !== move.path.length) continue;
    const exact = move.path.map(tileId => tiles.get(tileId));
    if (exact.some((tile, index) => !tile || index > 0 && (!exact[index - 1] ||
      Math.abs(tile.col - exact[index - 1]!.col) + Math.abs(tile.row - exact[index - 1]!.row) !== 1))) continue;
    for (let index = 1; index < exact.length; index += 1) {
      const a = exact[index - 1]!, b = exact[index]!;
      // Do not reconnect fragments across an unobserved tile.
      if (!knownTiles.has(a.id) || !knownTiles.has(b.id)) continue;
      const pair = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
      if (registered.has(pair)) continue;
      registered.add(pair);
      result.push([center(a), center(b)]);
    }
  }
  return result;
}

export function drawUsedVillageMigrationSegments(ctx: CanvasRenderingContext2D, segments: readonly UsedMigrationSegment[], zoom: number): void {
  if (!segments.length) return;
  const inverse = 1 / Math.max(zoom, 1);
  ctx.save();
  ctx.strokeStyle = 'rgba(198, 211, 147, 0.75)';
  ctx.lineWidth = 1.75 * inverse;
  ctx.setLineDash([2 * inverse, 4 * inverse]);
  ctx.beginPath();
  for (const [a, b] of segments) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}
