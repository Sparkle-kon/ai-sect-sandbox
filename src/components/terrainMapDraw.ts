import type { MapTile, WorldState } from '../types/world';
import { BIOME_PALETTE } from './terrainMapView';

type Classification = (tile: MapTile) => 'visible' | 'explored' | 'hidden';

export function drawTerrain(
  ctx: CanvasRenderingContext2D, world: WorldState, classify: Classification, heat: boolean, phase: number,
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
    const palette = BIOME_PALETTE[tile.biome];
    ctx.fillStyle = state === 'hidden' ? '#070c19' : palette.base;
    ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
    if (state === 'hidden') {
      ctx.strokeStyle = '#10172a';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cellW, cellH);
      continue;
    }
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
    if (state === 'explored') {
      ctx.fillStyle = 'rgba(4,8,18,0.70)';
      ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
    } else if (heat) {
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
    const x = col * cellW;
    const y = row * cellH;
    const inset = 0.8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    if (ownerAt(row - 1, col) !== tile.ownerSectId) {
      ctx.moveTo(x, y + inset); ctx.lineTo(x + cellW, y + inset);
    }
    if (ownerAt(row + 1, col) !== tile.ownerSectId) {
      ctx.moveTo(x, y + cellH - inset); ctx.lineTo(x + cellW, y + cellH - inset);
    }
    if (ownerAt(row, col - 1) !== tile.ownerSectId) {
      ctx.moveTo(x + inset, y); ctx.lineTo(x + inset, y + cellH);
    }
    if (ownerAt(row, col + 1) !== tile.ownerSectId) {
      ctx.moveTo(x + cellW - inset, y); ctx.lineTo(x + cellW - inset, y + cellH);
    }
    ctx.stroke();
  }
  ctx.restore();
}
