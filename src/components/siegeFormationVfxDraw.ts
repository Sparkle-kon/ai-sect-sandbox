import type { SiegeFormationFrame } from './siegeFormationVfxPlan';

export const SIEGE_FORMATION_LIFETIME_MS = 1100;
type Point = SiegeFormationFrame['center'];

const tau = Math.PI * 2;
const coordinate = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function ring(ctx: CanvasRenderingContext2D, point: Point, rx: number, ry: number, from = 0, to = tau) {
  ctx.beginPath();
  ctx.ellipse(point.x,point.y,rx,ry,0,from,to);
  ctx.stroke();
}

function strokes(ctx: CanvasRenderingContext2D, point: Point, s: number, opacity: number) {
  ctx.globalAlpha = .65 * opacity;
  ctx.lineWidth = 2.6 * s;
  ctx.strokeStyle = '#241c23';
  ring(ctx,point,22*s,11*s);
  ctx.globalAlpha = .8 * opacity;
  ctx.strokeStyle = '#d2a668';
  ctx.lineWidth = 1.15 * s;
  ring(ctx,point,22*s,11*s);

  ctx.globalAlpha = .46 * opacity;
  ctx.setLineDash([2*s,3*s]);
  ctx.lineWidth = .88*s;
  ring(ctx,point,17.5*s,8*s);
  ctx.setLineDash([]);
}

function breath(ctx: CanvasRenderingContext2D, point: Point, s: number, opacity: number, settle: number) {
  ctx.globalAlpha = .58 * opacity;
  ctx.strokeStyle = '#83b8ab';
  ctx.lineWidth = .95*s;
  const rx = (5.5 + settle) * s;
  // A quiet broken halo centered on the native participant, not a tether to another entity.
  ring(ctx,point,rx,rx*.76,Math.PI*.08,Math.PI*.95);
  ring(ctx,point,rx,rx*.76,Math.PI*1.16,Math.PI*1.88);
}

function guard(ctx: CanvasRenderingContext2D, point: Point, s: number, opacity: number) {
  ctx.globalAlpha = .75 * opacity;
  ctx.strokeStyle = '#c6ddd1';
  ctx.lineWidth = 1.55*s;
  ring(ctx,point,9.5*s,7*s,Math.PI*1.13,Math.PI*1.87);
}

/** A segment announces a confirmed hit only: exact source, exact destination, no launch preview. */
function impact(ctx: CanvasRenderingContext2D, hit: SiegeFormationFrame['hits'][number], s: number, opacity: number) {
  const { from, to, kind } = hit;
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(from.x,from.y);
    ctx.lineTo(to.x,to.y);
    ctx.stroke();
  };
  if (from.x !== to.x || from.y !== to.y) {
    ctx.globalAlpha = .6 * opacity;
    ctx.lineWidth = (kind === 'signature' ? 4.6 : 3.3) * s;
    ctx.strokeStyle = '#2b2028';
    trace();
    ctx.globalAlpha = .86 * opacity;
    ctx.lineWidth = (kind === 'signature' ? 1.7 : 1.2) * s;
    ctx.strokeStyle = kind === 'signature' ? '#f1ca89' : '#c19169';
    trace();
  }
  // No additional target or particle positions: one jewel falls exactly on the proven destination.
  const radius = (kind === 'signature' ? 2.65 : 2.05) * s;
  ctx.globalAlpha = .93 * opacity;
  ctx.fillStyle = kind === 'signature' ? '#ffe2a7' : '#e9bf9b';
  ctx.beginPath();
  ctx.moveTo(to.x,to.y-radius);
  ctx.lineTo(to.x+radius,to.y);
  ctx.lineTo(to.x,to.y+radius);
  ctx.lineTo(to.x-radius,to.y);
  ctx.closePath();
  ctx.fill();
}

/**
 * A bounded three-layer overlay for already authorized native data.
 * The caller clips the whole pass to currently drawn map tiles. Reduced motion uses
 * the same spatial proof as the animated frame, but no motion, fading or elapsed-time change.
 */
export function drawSiegeFormationVfx(ctx: CanvasRenderingContext2D, frames: readonly SiegeFormationFrame[],
  elapsedMs: number, animate: boolean, logicalPerCssPixel: number): void {
  if (!frames.length || animate && (!Number.isFinite(elapsedMs) || elapsedMs >= SIEGE_FORMATION_LIFETIME_MS)) return;
  const s = Number.isFinite(logicalPerCssPixel) ? clamp(logicalPerCssPixel,.05,16) : 1;
  const phase = animate ? clamp(elapsedMs / SIEGE_FORMATION_LIFETIME_MS,0,1) : 0;
  const opacity = animate ? (1-phase)*(1-phase*.26) : 1;
  const settle = animate ? Math.sin(phase*Math.PI)*.72 : 0;
  ctx.save();
  try {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    // A normal map has few simultaneous theatres; bounds protect the renderer if a stale plan is oversized.
    for (let i=0; i<Math.min(8,frames.length); i++) {
      const frame = frames[i];
      if (!coordinate(frame.center)) continue;
      strokes(ctx,frame.center,s,opacity);
      for (let j=0; j<Math.min(16,frame.breaths.length); j++) {
        const point = frame.breaths[j];
        if (coordinate(point)) breath(ctx,point,s,opacity,settle);
      }
      if (frame.guard && coordinate(frame.guard)) guard(ctx,frame.guard,s,opacity);
      for (let j=0; j<Math.min(16,frame.hits.length); j++) {
        const hit = frame.hits[j];
        if (coordinate(hit.from) && coordinate(hit.to)) impact(ctx,hit,s,opacity);
      }
    }
  } finally {
    ctx.restore();
  }
}
