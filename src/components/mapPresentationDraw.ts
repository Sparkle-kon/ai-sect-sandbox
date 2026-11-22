import type {Cultivator,Sect} from '../types/world';
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

type FlightAlignment=Sect['alignment'];
export type FlightAlignmentReader=(actor:Pick<Cultivator,'sectId'>)=>FlightAlignment|undefined;
const FLIGHT_MS=780;
const MAX_TAIL_POINTS=10;
const MAX_TAIL_UNITS=62;
const flightInks={
  正道:{glow:'#67e8f9',wash:'rgba(45,212,191,.38)',spine:'#99f6e4',blade:'#fef3c7',spark:'#fcd47c'},
  魔道:{glow:'#fb7185',wash:'rgba(244,63,94,.46)',spine:'#f9a8d4',blade:'#fee2e2',spark:'#d8a7fc'},
  中立:{glow:'#cbd5e1',wash:'rgba(148,163,184,.40)',spine:'#dbeafe',blade:'#f8fafc',spark:'#e2e8f0'},
} as const;

function flightTail(behind:readonly Point[]):Point[]{
  const tip=behind.at(-1);
  if(!tip)return [];
  const suffix=[tip];
  let distance=MAX_TAIL_UNITS,head=tip;
  for(let i=behind.length-2;i>=0&&distance>0&&suffix.length<MAX_TAIL_POINTS;i--){
    const previous=behind[i];
    const length=Math.hypot(previous.x-head.x,previous.y-head.y);
    if(length===0)continue;
    const fraction=Math.min(1,distance/length);
    suffix.push(fraction===1?previous:{x:head.x+(previous.x-head.x)*fraction,y:head.y+(previous.y-head.y)*fraction});
    distance-=length;
    head=previous;
  }
  return suffix.reverse();
}

function drawSwordWake(ctx:CanvasRenderingContext2D,tail:Point[],ink:typeof flightInks[FlightAlignment],
  alignment:FlightAlignment,progress:number){
  const tip=tail.at(-1),prior=tail.at(-2);
  if(!tip||!prior)return;
  const reach=Math.hypot(tip.x-prior.x,tip.y-prior.y);
  if(reach<=0)return;
  ctx.shadowColor=ink.glow;
  ctx.shadowBlur=12;
  line(ctx,tail,ink.wash,alignment==='魔道'?6:5.2);
  ctx.shadowBlur=4;
  line(ctx,tail,ink.spine,1.55);
  const dx=(tip.x-prior.x)/reach,dy=(tip.y-prior.y)/reach;
  const blade=Math.min(reach,alignment==='魔道'?15:12);
  const base={x:tip.x-dx*blade,y:tip.y-dy*blade};
  line(ctx,[base,tip],ink.blade,alignment==='魔道'?2.8:2.45);

  // Small fixed imprints follow the visible wake; they never move the actor or follow another route.
  const marks=alignment==='魔道'?3:2;
  for(let i=0;i<marks;i++){
    const start=1.9+i*3.8,span=2.0+i*.35;
    if(start+span>blade)break;
    const direction=i%2===0?1:-1;
    const thickness=direction*(alignment==='魔道'?2.9:2.1)*(1-progress*.42);
    line(ctx,[{x:tip.x-dx*start,y:tip.y-dy*start},
      {x:tip.x-dx*(start+span)-dy*thickness,y:tip.y-dy*(start+span)+dx*thickness}],ink.spark,.95);
  }
}

export function drawFlights(
  ctx: CanvasRenderingContext2D, positions: Position[], routes: Presentation['routes'], elapsed: number, animate: boolean,
  alignmentOf?:FlightAlignmentReader,
): Position[] {
  if (!animate || elapsed >= FLIGHT_MS) return positions;
  const progress = Math.max(0, elapsed / FLIGHT_MS);
  const smoothed = progress * progress * (3 - 2 * progress);
  ctx.save();
  const frame = positions.map((position) => {
    const route = routes.get(position.actor.id);
    if (!route) return position;
    const { point, behind } = sampleFlight(route.points, smoothed);
    const tail=flightTail(behind);
    if(alignmentOf){
      const alignment=alignmentOf(position.actor)??'中立';
      drawSwordWake(ctx,tail,flightInks[alignment],alignment,progress);
    }else{
      // Old callers retain the cool two-stroke look and all static/reduced-motion semantics.
      ctx.shadowColor = '#67e8f9';
      ctx.shadowBlur = 11;
      line(ctx, tail, 'rgba(103,232,249,0.32)', 5);
      ctx.shadowBlur = 4;
      line(ctx, tail, '#d0f7ff', 1.4);
    }
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
