import type { MapTile, WorldState } from '../types/world';
import type { MapTerritoryMarker,MapTerritorySemantics } from './mapTerritorySemantics';
import { BIOME_PALETTE } from './terrainMapView';

export const EXPLORED_TERRAIN_SHADE = '#192238';

type Classification = (tile: MapTile) => 'visible' | 'explored' | 'hidden';

export function drawTerrain(
  ctx: CanvasRenderingContext2D, world: WorldState, classify: Classification, heat: boolean, phase: number,
  territory?:MapTerritorySemantics, logicalPerCssPixel=1,
) {
  const { columns, rows, tiles, seed } = world.terrain;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const cellW = width / columns;
  const cellH = height / rows;
  const indexed = new Map(tiles.map((tile) => [tile.row * columns + tile.col, tile]));
  const sectColors = new Map(world.sects.map(({ id, color }) => [id, color]));

  ctx.save();
  for (const tile of tiles) {
    const state = classify(tile);
    const x = tile.col * cellW;
    const y = tile.row * cellH;
    if (state !== 'visible') {
      // Exploration remembers tile position, not an authoritative update to mutable biome.
      ctx.fillStyle = state === 'hidden' ? '#070c19' : EXPLORED_TERRAIN_SHADE;
      ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
      ctx.strokeStyle = '#10172a';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cellW, cellH);
      continue;
    }
    const palette = BIOME_PALETTE[tile.biome];
    ctx.fillStyle = palette.base;
    ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
    // Seeded strokes create texture without changing between renders.
    const grain = Math.abs(Math.imul(tile.col + 11, 92821) ^ Math.imul(tile.row + 17, 68917) ^ Number(seed));
    const stampX = x + cellW * (0.15 + (grain % 11) / 30);
    const stampY = y + cellH * (0.18 + ((grain >>> 3) % 11) / 30);
    ctx.strokeStyle = palette.detail;
    ctx.globalAlpha = 0.30;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(stampX, stampY + cellH * 0.12);
    ctx.lineTo(stampX + cellW * 0.12, stampY);
    ctx.lineTo(stampX + cellW * 0.26, stampY + cellH * 0.10);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (heat) {
      const qi = Math.min(100, Math.max(0, tile.spiritQi)) / 100;
      const pulse = 0.96 + 0.04 * Math.sin(phase + (tile.col + tile.row) * 0.24);
      ctx.fillStyle = `hsla(${Math.round(191 - qi * 159)},88%,58%,${(0.12 + qi * 0.41) * pulse})`;
      ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
    }
    ctx.strokeStyle = 'rgba(203,213,225,0.09)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, cellW, cellH);
  }

  // Borders use today’s ownership only where the viewpoint can see it.
  const ownerAt = (row: number, col: number) => {
    if (row < 0 || row >= rows || col < 0 || col >= columns) return undefined;
    const neighbor = indexed.get(row * columns + col);
    return neighbor && classify(neighbor) === 'visible' ? neighbor.ownerSectId : undefined;
  };
  for (const tile of tiles) {
    if (!tile.ownerSectId || classify(tile) !== 'visible') continue;
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
    ctx.lineWidth = accent ? 3*scale : 1.6;
    ctx.globalAlpha = 0.82;
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
    ctx.stroke();
    if (accent) {
      ctx.strokeStyle='#0b1220';
      ctx.globalAlpha=.96;
      ctx.lineWidth=2.4*scale;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.strokeStyle='#f8fafc';
      ctx.lineWidth=1.25*scale;
      ctx.lineCap=accent.pattern==='dotted'?'round':'butt';
      ctx.setLineDash(accent.dash.map(dash=>dash*scale));
      ctx.stroke();
      ctx.lineCap='butt';
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
