import type { MapTile, TerrainBiome, WorldState } from '../types/world';
import type { MapTerritoryMarker,MapTerritorySemantics } from './mapTerritorySemantics';

export const EXPLORED_TERRAIN_SHADE = '#192238';
export const INK_TERRAIN_FILL: Readonly<Record<TerrainBiome,string>> = {
  灵山:'#15282a', 毒沼:'#192a29', 剑冢:'#1d2838',
  荒漠:'#302d32', 魔渊:'#282233', 坊市:'#332b30',
};
export interface TerrainDrawingOptions {
  /** Coordinate grid is for close inspection and tools, not the normal landscape. */
  readonly showGrid?:boolean;
}

type Classification = (tile: MapTile) => 'visible' | 'explored' | 'hidden';

export function drawTerrain(
  ctx: CanvasRenderingContext2D, world: WorldState, classify: Classification, heat: boolean, phase: number,
  territory?:MapTerritorySemantics, logicalPerCssPixel=1, options?:TerrainDrawingOptions,
) {
  const { columns, rows, tiles } = world.terrain;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const cellW = width / columns;
  const cellH = height / rows;
  const classified = tiles.map(tile=>({tile,state:classify(tile)}));
  const visibleOwners = new Map<number,string>();
  for(const {tile,state} of classified){
    if(state==='visible'&&tile.ownerSectId)visibleOwners.set(tile.row*columns+tile.col,tile.ownerSectId);
  }
  const sectColors = new Map(world.sects.map(({ id, color }) => [id, color]));

  ctx.save();
  for (const {tile,state} of classified) {
    const x = tile.col * cellW;
    const y = tile.row * cellH;
    if (state !== 'visible') {
      // Memory establishes where a tile is, not what is currently on it.
      ctx.fillStyle = state === 'hidden' ? '#070c19' : EXPLORED_TERRAIN_SHADE;
      ctx.fillRect(x, y, cellW, cellH);
      continue;
    }
    ctx.fillStyle = INK_TERRAIN_FILL[tile.biome];
    ctx.fillRect(x, y, cellW, cellH);
    if (heat) {
      const qi = Math.min(100, Math.max(0, tile.spiritQi)) / 100;
      const pulse = 0.96 + 0.04 * Math.sin(phase + (tile.col + tile.row) * 0.24);
      ctx.fillStyle = `hsla(${Math.round(191 - qi * 159)},88%,58%,${(0.12 + qi * 0.41) * pulse})`;
      ctx.fillRect(x, y, cellW, cellH);
    }
  }

  if(options?.showGrid){
    ctx.strokeStyle='rgba(203,213,225,.27)';
    ctx.lineWidth=Math.max(.35,logicalPerCssPixel*.65);
    ctx.beginPath();
    for(let column=1;column<columns;column++){
      const x=column*cellW;
      ctx.moveTo(x,0);ctx.lineTo(x,height);
    }
    for(let row=1;row<rows;row++){
      const y=row*cellH;
      ctx.moveTo(0,y);ctx.lineTo(width,y);
    }
    ctx.stroke();
  }

  // Borders use today’s ownership only where the viewpoint can see it.
  const ownerAt = (row: number, col: number) => {
    if (row < 0 || row >= rows || col < 0 || col >= columns) return undefined;
    return visibleOwners.get(row*columns+col);
  };
  for (const {tile,state} of classified) {
    if (state !== 'visible' || !tile.ownerSectId) continue;
    const color = sectColors.get(tile.ownerSectId);
    if (!color) continue;
    const { row, col } = tile;
    const top = ownerAt(row - 1, col) !== tile.ownerSectId;
    const bottom = ownerAt(row + 1, col) !== tile.ownerSectId;
    const left = ownerAt(row, col - 1) !== tile.ownerSectId;
    const right = ownerAt(row, col + 1) !== tile.ownerSectId;
    if (!top && !bottom && !left && !right) continue;
    const x = col * cellW;
    const y = row * cellH;
    const accent=territory?.byFaction.get(tile.ownerSectId);
    const scale=Math.max(.1,logicalPerCssPixel);
    const inset=accent?Math.min(cellW*.2,cellH*.2,1.9*scale):.8;
    if (territory) ctx.setLineDash([]);
    ctx.strokeStyle = color;
    ctx.beginPath();
    if (top) {
      ctx.moveTo(x, y + inset); ctx.lineTo(x + cellW, y + inset);
    }
    if (bottom) {
      ctx.moveTo(x, y + cellH - inset); ctx.lineTo(x + cellW, y + cellH - inset);
    }
    if (left) {
      ctx.moveTo(x + inset, y); ctx.lineTo(x + inset, y + cellH);
    }
    if (right) {
      ctx.moveTo(x + cellW - inset, y); ctx.lineTo(x + cellW - inset, y + cellH);
    }
    // Broad translucent tincture behind a trace, not a neon border or invented ownership.
    ctx.lineWidth=accent?Math.min(7,4*scale):3.8;
    ctx.globalAlpha=.16;
    ctx.stroke();
    if (accent) {
      ctx.strokeStyle='#0b1220';
      ctx.globalAlpha=.70;
      ctx.lineWidth=1.55*scale;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.strokeStyle='#f8fafc';
      ctx.globalAlpha=options?.showGrid ? .98 : .62;
      ctx.lineWidth=(options?.showGrid?1.15:.82)*scale;
      ctx.lineCap=accent.pattern==='dotted'?'round':'butt';
      ctx.setLineDash(accent.dash.map(dash=>dash*scale));
      ctx.stroke();
      ctx.lineCap='butt';
    }else{
      ctx.lineWidth=1.15;
      ctx.globalAlpha=.48;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Draw the same exact codes exposed by the text index, sized in CSS px despite the zoom/backing store. */
export function drawMapTerritoryGlyphs(ctx:CanvasRenderingContext2D,markers:readonly MapTerritoryMarker[],logicalPerCssPixel=1) {
  if(!markers.length) return;
  const scale=Math.max(.1,logicalPerCssPixel);
  ctx.save();
  ctx.setLineDash([]);
  ctx.font=`700 ${12*scale}px ui-monospace, monospace`;
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  for(const marker of markers) {
    const w=Math.max(28*scale,ctx.measureText(marker.code).width+7*scale),h=17*scale;
    const x=Math.min(ctx.canvas.width-w/2,Math.max(w/2,marker.point.x));
    const anchorY=marker.point.y;
    const y=anchorY-h*.95<h/2?anchorY+h*.9:anchorY-h*.95;
    ctx.strokeStyle='#f8fafc';
    ctx.lineWidth=.9*scale;
    ctx.beginPath();
    ctx.moveTo(x,y+(y<anchorY?h/2:-h/2));
    ctx.lineTo(marker.point.x,anchorY);
    ctx.stroke();
    ctx.fillStyle='#0b1220';
    ctx.fillRect(x-w/2,y-h/2,w,h);
    ctx.strokeRect(x-w/2,y-h/2,w,h);
    ctx.fillStyle='#f8fafc';
    ctx.fillText(marker.code,x,y+.35*scale);
  }
  ctx.restore();
}
