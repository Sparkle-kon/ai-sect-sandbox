import type { GodBrushKind, MapPoint, WorldState } from '../types/world';
import type { createTerrainMapView } from './terrainMapView';
import { MAP_HEIGHT, MAP_WIDTH } from './mapCamera';

export const BRUSH_LABELS: Record<GodBrushKind, string> = {
  paint_vein: '绘制灵脉', meteor: '天降陨石', beast_tide: '召唤兽潮', cursed_miasma: '升起诅咒瘴气',
};

export const HAZARD_STYLES = {
  meteor: { marker: '陨', label: '陨石余波', color: '#fda4af' },
  beast_tide: { marker: '兽', label: '兽潮', color: '#fcd34d' },
  cursed_miasma: { marker: '瘴', label: '诅咒瘴气', color: '#c4b5fd' },
} as const;

export function getVisibleHazards(world: WorldState, view: ReturnType<typeof createTerrainMapView>) {
  const tiles = new Map(world.terrain.tiles.map((tile) => [tile.id, tile]));
  return (world.mapHazards ?? []).flatMap((hazard) => {
    const tile = tiles.get(hazard.tileId);
    if (!tile || hazard.createdTick > world.tick || hazard.expiresTick <= world.tick || view.tileState(tile) !== 'visible') return [];
    const width = MAP_WIDTH / world.terrain.columns;
    const height = MAP_HEIGHT / world.terrain.rows;
    return [{ hazard, tile, width, height, ...HAZARD_STYLES[hazard.kind] }];
  });
}

export function brushPoint(points: MapPoint[], point: MapPoint, force = false): MapPoint[] {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x >= MAP_WIDTH || point.y < 0 || point.y >= MAP_HEIGHT) return points;
  const prev = points.at(-1);
  if (!prev) return [point];
  const distance = Math.hypot(prev.x - point.x, prev.y - point.y);
  if (distance === 0 || (!force && distance < 6)) return points;
  // Bound stored pointer samples. Keep the path endpoint if the device sends more.
  if (points.length >= 128) return [...points.slice(0, 127), point];
  return [...points, point];
}

export function drawHazards(ctx: CanvasRenderingContext2D, hazards: ReturnType<typeof getVisibleHazards>) {
  ctx.save();
  for (const entry of hazards) {
    const { tile, width, height, color, marker } = entry;
    const x = tile.col * width;
    const y = tile.row * height;
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, width - 2, height - 2);
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(x + 2, y + 2, width - 4, height - 4);
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(marker, x + 4, y + 14);
  }
  ctx.restore();
}
