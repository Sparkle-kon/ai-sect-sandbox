import { MAP_EFFECT_LABELS, MOTION_MS, sampleFlight } from './mapPresentationView';
import type { buildMapPresentation, Point } from './mapPresentationView';
import type { mapActorPositions } from './terrainMapView';

type Presentation = ReturnType<typeof buildMapPresentation>;
type Position = ReturnType<typeof mapActorPositions>[number];

function line(ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.stroke();
}

export function drawFlights(
  ctx: CanvasRenderingContext2D, positions: Position[], routes: Presentation['routes'], elapsed: number, animate: boolean,
): Position[] {
  if (!animate || elapsed >= 780) return positions;
  const progress = Math.max(0, elapsed / 780);
  const smoothed = progress * progress * (3 - 2 * progress);
  ctx.save();
  const frame = positions.map((position) => {
    const route = routes.get(position.actor.id);
    if (!route) return position;
    const { point, behind } = sampleFlight(route.points, smoothed);
    ctx.shadowColor = '#67e8f9';
    ctx.shadowBlur = 11;
    line(ctx, behind, 'rgba(103,232,249,0.32)', 5);
    ctx.shadowBlur = 4;
    line(ctx, behind, '#d0f7ff', 1.4);
    return { actor: position.actor, ...point };
  });
  ctx.restore();
  return frame;
}

export function drawMapEffects(
  ctx: CanvasRenderingContext2D, effects: Presentation['effects'], positions: Position[], elapsed: number, animate: boolean,
) {
  if (animate && elapsed >= MOTION_MS) return;
  const progress = animate ? Math.min(1, elapsed / MOTION_MS) : 0;
  const atSite = new Map<string, number>();
  ctx.save();
  for (const effect of effects) {
    const { x, y } = effect.location;
    const slot = atSite.get(effect.locationId) ?? 0;
    atSite.set(effect.locationId, slot + 1);
    ctx.globalAlpha = 1 - 0.8 * progress;
    ctx.shadowBlur = 9;
    if (effect.kind === 'clash') {
      const fighters = positions.filter((point) => point.actor.locationId === effect.locationId &&
        effect.actorIds.includes(point.actor.id) && Math.hypot(point.x - x, point.y - y) <= 60);
      const [first, second] = fighters;
      ctx.shadowColor = '#f9a8d4';
      line(ctx, first && second ? [first, second] : [{ x: x - 14, y: y + 9 }, { x: x + 15, y: y - 11 }], '#f9a8d4', 3);
      line(ctx, [{ x: x - 9, y: y - 8 }, { x: x + 10, y: y + 7 }], '#fee2e2', 1.5);
    }
    if (effect.kind === 'lightning') {
      ctx.shadowColor = '#bae6fd';
      line(ctx, [{ x: x + 16, y: y - 57 }, { x: x + 7, y: y - 44 }, { x: x + 15, y: y - 44 }, { x, y: y - 19 }], '#e0f2fe', 2.8);
    }
    ctx.shadowColor = '#020617';
    ctx.shadowBlur = 4;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = effect.kind === 'damage' ? '#fda4af' : effect.kind === 'breakthrough' ? '#fde68a' : '#bae6fd';
    const label = effect.text ?? MAP_EFFECT_LABELS[effect.kind];
    ctx.fillText(label.length > 28 ? `${label.slice(0, 27)}…` : label, x, y - 49 - slot * 14 - progress * 16);
  }
  ctx.restore();
}
