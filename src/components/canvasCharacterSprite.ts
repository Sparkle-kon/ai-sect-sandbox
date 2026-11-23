import type { MapActorSpriteModel } from './mapActorSpriteModel';
import { drawStageFigure } from './sceneStageSprites';

type Pen = CanvasRenderingContext2D;

/** CSS pixel diameter reserved around the already-authorized marker's exact hit center. */
export function mapCharacterSpriteSize(zoom: number, selected: boolean): number {
  const bounded = Number.isFinite(zoom) ? Math.min(3, Math.max(1, zoom)) : 1;
  return Math.round((selected ? 29 : 23) + (bounded - 1) * 2.5);
}

function phaseFromId(id: string): number {
  let state = 2166136261;
  for (const char of id) state = Math.imul(state ^ (char.codePointAt(0) ?? 0), 16777619);
  return (state >>> 0) / 4294967296 * Math.PI * 2;
}

function mount(ctx: Pen, px: number, y: number, spirit: string, facing: number): void {
  const half = px * .39;
  ctx.save(); ctx.translate(0,y); ctx.scale(facing,1);
  ctx.fillStyle = 'rgba(8,19,27,.62)';
  ctx.fillRect(-half-2,-1,half*2+2,4);
  ctx.fillStyle = '#163748';
  ctx.beginPath();
  ctx.moveTo(-half,-1.6); ctx.lineTo(half-2,-1.4); ctx.lineTo(half+2,-.2);
  ctx.lineTo(half-3,2.2); ctx.lineTo(-half,1.8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = spirit;
  ctx.fillRect(-half + 1,-.65,half*1.8,1.25);
  ctx.fillStyle = '#e9f7e8';
  ctx.fillRect(-half + 3,-.85,half*1.27,1);
  ctx.fillStyle = '#f0c87d';
  ctx.fillRect(-half*.62,-2.15,1.4,3);
  ctx.restore();
}

function poseDetails(ctx: Pen, model: MapActorSpriteModel, px: number, time: number, phase: number, facing: number): void {
  const { pose, appearance } = model;
  const { palette } = appearance;
  ctx.save(); ctx.scale(facing,1);
  ctx.fillStyle = palette.spirit;
  if (pose === 'cultivate') {
    for(let i=0; i<5; i++) {
      const angle = i * 2.399 + phase + time * .92;
      const progress = ((time * .6 + i * .21 + phase) % 1);
      ctx.globalAlpha = .42 + (1 - progress) * .45;
      const x = Math.sin(angle) * px * .30;
      const y = px * (.34 - progress * .58);
      ctx.fillRect(Math.round(x),Math.round(y),i % 3 ? 1.15 : 1.55,i % 3 ? 1 : 1.55);
    }
  } else if (pose === 'fight') {
    const swing = Math.sin(time * 5.2 + phase);
    const reach = px * (.11 + swing * .025);
    ctx.globalAlpha = .5 + swing * .19;
    ctx.strokeStyle = palette.spirit;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(px*.19,-px*.36);
    ctx.quadraticCurveTo(px*.47,-px*.29,px*.44,reach);
    ctx.stroke();
    ctx.fillStyle = '#f2ead2';
    ctx.fillRect(px*.38,-px*.28,1.4,1.4);
  } else if (pose === 'labor') {
    ctx.globalAlpha = .82;
    const bend = Math.sin(time * 3.4 + phase);
    const x = px * (.23 + bend * .037), y = px*.35;
    ctx.fillStyle = '#b9936c';
    ctx.fillRect(x-2,y+1,7,1.4);
    ctx.fillStyle = '#a6c779';
    ctx.fillRect(x+.5,y-3,1,4);
    ctx.fillRect(x-1.3,y-3.2,2,1.2);
    ctx.fillRect(x+1,y-4.1,2.2,1.35);
  }
  ctx.restore();
}

/**
 * Standalone map illustration: resolved model only, CSS anchors unchanged, no identity or locale text
 * reads. Zero phase uses the same contemplative frame for reduced motion and deterministic previews.
 */
export function drawCanvasCharacterSprite(ctx: Pen, x: number, y: number, character: MapActorSpriteModel,
  size: number, phaseSeconds: number, mounted = false): void {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size <= 0) return;
  const seconds = Number.isFinite(phaseSeconds) ? Math.max(0, phaseSeconds) : 0;
  const phase = phaseFromId(character.id);
  const facing = phase >= Math.PI ? 1 : -1;
  const hover = mounted && seconds > 0 ? Math.sin(seconds * 4.1 + phase) * size * .046 : 0;
  const standing = character.pose !== 'cultivate';
  const base = size * (standing ? .43 : .36);
  const scale = size / (mounted ? 70 : 62);
  ctx.save(); ctx.translate(x,y);
  // Keep animated sword, effects and hems inside the same footprint reserved for label layout.
  ctx.beginPath(); ctx.rect(-size / 2,-size / 2,size,size); ctx.clip();
  ctx.translate(0,hover);
  if (mounted) mount(ctx,size,base + 1,character.appearance.palette.spirit,facing);
  poseDetails(ctx,character,size,seconds,phase,facing);
  ctx.save(); ctx.translate(0,base); ctx.scale(scale,scale);
  drawStageFigure(ctx,character,seconds,facing,phase);
  ctx.restore();
  ctx.restore();
}
