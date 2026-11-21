import { visibleMapAnnotations } from '../engine/annotationsEngine';
import { terrainTileAt } from '../engine/terrainEngine';
import type { WorldState } from '../types/world';
import type { createTerrainMapView } from './terrainMapView';

export function mapAnnotationPins(world: WorldState, map: ReturnType<typeof createTerrainMapView>, actorId: string | null) {
  return visibleMapAnnotations(world, actorId).filter(({ point }) => {
    const tile = terrainTileAt(world, point.x, point.y);
    return Boolean(tile && map.tileState(tile) !== 'hidden');
  });
}

export function drawMapAnnotationPins(ctx: CanvasRenderingContext2D, pins: ReturnType<typeof mapAnnotationPins>, zoom: number) {
  if (!pins.length) return;
  ctx.save();
  ctx.lineWidth = 2 / zoom;
  ctx.strokeStyle = '#f0abfc';
  ctx.fillStyle = '#d946ef';
  for (const { point, historical } of pins) {
    const y = point.y - 14 / zoom;
    ctx.beginPath();
    ctx.arc(point.x, y, 6 / zoom, 0, Math.PI * 2);
    if (!historical) ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x, y + 6 / zoom);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  ctx.restore();
}
