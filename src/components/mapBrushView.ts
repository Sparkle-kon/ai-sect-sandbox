import type { GodBrushKind, MapPoint, WorldState } from '../types/world';
import type { createTerrainMapView } from './terrainMapView';
import { MAP_HEIGHT, MAP_WIDTH } from './mapCamera';

export const BRUSH_LABELS: Record<GodBrushKind, string> = {
  paint_vein: '绘制灵脉', meteor: '天降陨石', beast_tide: '召唤兽潮', cursed_miasma: '升起诅咒瘴气',
};

export const HAZARD_STYLES = {
  meteor: { marker: '陨', label: '陨石余波', color: '#fda4af', symbol:'triangle',symbolLabel:'三角',dash:[7,3] },
  beast_tide: { marker: '兽', label: '兽潮', color: '#fcd34d', symbol:'chevron',symbolLabel:'双折线',dash:[2,2] },
  cursed_miasma: { marker: '瘴', label: '诅咒瘴气', color: '#c4b5fd', symbol:'square',symbolLabel:'方形',dash:[8,2,2,2] },
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

type HazardSymbol = (typeof HAZARD_STYLES)[keyof typeof HAZARD_STYLES]['symbol'];
const hazardOrder = {meteor:0,beast_tide:1,cursed_miasma:2} as const;

function strokeHazardSymbol(ctx:CanvasRenderingContext2D,symbol:HazardSymbol,x:number,y:number,radius:number) {
  ctx.beginPath();
  if(symbol==='triangle') {
    ctx.moveTo(x,y-radius); ctx.lineTo(x+radius,y+radius); ctx.lineTo(x-radius,y+radius); ctx.closePath();
  } else if(symbol==='chevron') {
    for(const offset of [-radius/2,radius/2]) {
      ctx.moveTo(x-radius,y+offset+radius/2); ctx.lineTo(x,y+offset-radius/2); ctx.lineTo(x+radius,y+offset+radius/2);
    }
  } else {
    ctx.rect(x-radius,y-radius,radius*2,radius*2);
  }
  ctx.stroke();
}

/** Draw exactly the visible projection. Shapes, dash and intensity do not depend on hue. */
type HazardPaint = Omit<ReturnType<typeof getVisibleHazards>[number], 'color'> & { color: string };
export function drawHazards(ctx: CanvasRenderingContext2D, hazards: readonly HazardPaint[]) {
  const tiles = new Map<string,HazardPaint[]>();
  for(const entry of hazards) {
    const bucket = tiles.get(entry.tile.id);
    if(bucket) bucket.push(entry);
    else tiles.set(entry.tile.id,[entry]);
  }
  ctx.save();
  for(const entries of tiles.values()) {
    entries.sort((left,right)=>hazardOrder[left.hazard.kind]-hazardOrder[right.hazard.kind] ||
      (left.hazard.id<right.hazard.id?-1:left.hazard.id>right.hazard.id?1:0));
    const {tile,width,height}=entries[0];
    const x=tile.col*width, y=tile.row*height;
    for(const [index,entry] of entries.entries()) {
      const {color,dash,symbol,hazard}=entry;
      const inset=2+index*2;
      ctx.globalAlpha=.13;
      ctx.fillStyle=color;
      ctx.fillRect(x+inset,y+inset,width-2*inset,height-2*inset);
      ctx.globalAlpha=1;
      ctx.setLineDash([...dash]);
      ctx.strokeStyle='#020617'; ctx.lineWidth=2.8;
      ctx.strokeRect(x+inset,y+inset,width-2*inset,height-2*inset);
      ctx.strokeStyle=color; ctx.lineWidth=1.25;
      ctx.strokeRect(x+inset,y+inset,width-2*inset,height-2*inset);
      ctx.setLineDash([]);
      const stack=entries.length>1 && width<entries.length*22;
      const cell=(stack?height-4:width-2)/entries.length;
      const badgeWidth=Math.min(27,stack?width-6:cell-1);
      const badgeHeight=Math.min(17,stack?cell-1:height-6);
      const badgeX=stack?x+3:x+1+cell*(index+.5)-badgeWidth/2;
      const badgeY=stack?y+2+cell*index:y+3;
      const center=badgeY+badgeHeight/2;
      const radius=Math.min(5,badgeWidth*.21,badgeHeight*.32);
      ctx.fillStyle='#020617';
      ctx.fillRect(badgeX,badgeY,badgeWidth,badgeHeight);
      ctx.strokeStyle='#f8fafc'; ctx.lineWidth=1.4;
      strokeHazardSymbol(ctx,symbol,badgeX+badgeWidth*.31,center,radius);
      ctx.fillStyle='#f8fafc';
      ctx.font=`bold ${Math.min(12,badgeWidth*.47,badgeHeight*.8)}px sans-serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(String(hazard.intensity),badgeX+badgeWidth*.74,center);
    }
  }
  ctx.restore();
}
