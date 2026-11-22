import { isScopedExpeditionGate } from '../engine/expeditionOmenTerms';
import { formationLinkAvailability } from '../engine/formationNetworkEngine';
import { terrainTileAt } from '../engine/terrainEngine';
import { localQiWeather } from '../engine/weatherEngine';
import type { MapPoint, SpiritRoot, WorldState } from '../types/world';
import type { visibleFormationMapLinks } from './formationMapView';
import { MAP_HEIGHT, MAP_WIDTH } from './mapCamera';
import { visibleCheckpointRoute } from './mapConvoyView';
import type { createTerrainMapView } from './terrainMapView';

type TerrainView = ReturnType<typeof createTerrainMapView>;
type ScopedFormationLines = ReturnType<typeof visibleFormationMapLinks>;
type ClipSpan = { x: number; y: number; width: number; height: number };
type SiteFlow = MapPoint & { id: string; tint: string; strength: number; phaseOffset: number };
type FormationFlow = { id: string; a: MapPoint; b: MapPoint; phaseOffset: number };

export interface QiFlowPlan {
  readonly sites: readonly SiteFlow[];
  readonly links: readonly FormationFlow[];
  readonly clip: readonly ClipSpan[];
  readonly hasMotion: boolean;
}

const MAX_SITES = 12;
const MAX_LINKS = 8;
const LOCAL_MOTES = 3;
const TRAVELLING_MOTES = 3;
const TAU = Math.PI * 2;
const roots: Record<SpiritRoot, string> = {
  金: '#fde68a', 木: '#86efac', 水: '#a5f3fc', 火: '#fda4af',
  土: '#fcd9a6', 雷: '#d8b4fe', 暗: '#f0abfc', 天灵根: '#c7d2fe',
};
const ascii = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const samePoint = (a: MapPoint, b: MapPoint) => a.x === b.x && a.y === b.y;
const fraction = (value: number) => value - Math.floor(value);

/** Presentation entropy is fixed by the terrain seed and public identity, never simulation RNG. */
function phaseFor(seed: number, id: string): number {
  let hash = (seed | 0) ^ 0x25a6b794;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) / 0x1_0000_0000;
}

export function buildQiFlowPlan(world: WorldState, view: TerrainView, formationLines: ScopedFormationLines): QiFlowPlan {
  const { rows, columns, seed, tiles } = world.terrain;
  if (!Number.isSafeInteger(rows) || rows < 1 || !Number.isSafeInteger(columns) || columns < 1 ||
      rows * columns !== tiles.length) return { sites: [], links: [], clip: [], hasMotion: false };
  const cellWidth = MAP_WIDTH / columns, cellHeight = MAP_HEIGHT / rows;
  const clip: ClipSpan[] = [];
  const current = new Set<string>();
  for (let row = 0; row < rows; row++) {
    let left = -1;
    for (let col = 0; col <= columns; col++) {
      const tile = col < columns ? tiles[row * columns + col] : undefined;
      const present = !!tile && tile.row === row && tile.col === col && view.tileState(tile) === 'visible' &&
        (!view.current || view.current.has(tile.id));
      if (present) {
        if (left < 0) left = col;
        current.add(tile.id);
      } else if (left >= 0) {
        clip.push({ x: left * cellWidth, y: row * cellHeight, width: (col - left) * cellWidth, height: cellHeight });
        left = -1;
      }
    }
  }

  const actual = new Map(world.locations.map(site => [site.id, site]));
  const seen = new Map(view.seenLocations.flatMap(site => {
    const tile = terrainTileAt(world, site.x, site.y);
    return actual.get(site.id) === site && !isScopedExpeditionGate(site) && view.isCurrentLocation(site.id) &&
      tile && current.has(tile.id) ? [[site.id, site] as const] : [];
  }));
  const sites = [...seen.values()].sort((a, b) => ascii(a.id, b.id)).slice(0, MAX_SITES).map(site => {
    const weather = localQiWeather(world, site);
    const actualQi = Math.min(1, Math.max(0, site.spiritQi / 150));
    return { id: site.id, x: site.x, y: site.y, tint: roots[site.spiritRoot],
      strength: 0.36 + actualQi * 0.46 + (weather.kind === '灵潮' ? weather.intensity * 0.18 : 0),
      phaseOffset: phaseFor(seed, site.id) };
  });

  // The supplied projection is already authorized for the selected actor. Intersect it with
  // exact live native endpoints and the current clip; never expand from the raw ledger.
  const native = new Map(world.formations.links.map(link => [link.id, link]));
  const links = new Map<string, FormationFlow>();
  const scopedRouteView = { ...view, current };
  for (const line of [...formationLines].sort((a, b) => ascii(a.id, b.id))) {
    if (links.size >= MAX_LINKS) break;
    if (line.status !== 'active' || links.has(line.id)) continue;
    const candidate = native.get(line.id);
    if (!candidate || candidate.status !== 'active' || candidate.openedTick > world.tick ||
        candidate.fundedTick === undefined || candidate.fundedTick > world.tick ||
        formationLinkAvailability(world, candidate) !== 'ready') continue;
    const a = seen.get(candidate.siteAId), b = seen.get(candidate.siteBId);
    if (!a || !b || samePoint(a, b) || !samePoint(a, line.a) || !samePoint(b, line.b)) continue;
    const tail = visibleCheckpointRoute(world, scopedRouteView, [a, b], 0)?.route.at(-1);
    if (!tail || !samePoint(tail, b)) continue;
    links.set(line.id, { id: line.id, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, phaseOffset: phaseFor(seed, line.id) });
  }
  return { sites, links: [...links.values()], clip, hasMotion: sites.length > 0 || links.size > 0 };
}

/** Behind the map markers. Static mode retains the rings, cloud strokes, and evenly spaced light. */
export function drawQiFlow(ctx: CanvasRenderingContext2D, plan: QiFlowPlan,
  phase: number, animate: boolean, logicalPerCssPixel: number): void {
  if (!plan.hasMotion || !plan.clip.length) return;
  const pixel = Number.isFinite(logicalPerCssPixel) ? Math.max(0.2, Math.min(2.8, logicalPerCssPixel)) : 1;
  const time = animate && Number.isFinite(phase) ? phase : 0;
  const dot = (x: number, y: number, radius: number) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  };

  ctx.save();
  ctx.beginPath();
  for (const span of plan.clip) ctx.rect(span.x, span.y, span.width, span.height);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  const strokeLink = (link: FormationFlow) => {
    ctx.beginPath();
    ctx.moveTo(link.a.x, link.a.y);
    ctx.lineTo(link.b.x, link.b.y);
    ctx.stroke();
  };
  for (const link of plan.links) {
    ctx.strokeStyle = '#2dd4bf';
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 8 * pixel;
    strokeLink(link);
    ctx.strokeStyle = '#99f6e4';
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 1.9 * pixel;
    strokeLink(link);
    ctx.fillStyle = '#ccfbf1';
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < TRAVELLING_MOTES; i++) {
      const resting = (i + 1) / (TRAVELLING_MOTES + 1);
      const progress = animate ? fraction(resting + time * 0.32 + link.phaseOffset) : resting;
      dot(link.a.x + (link.b.x - link.a.x) * progress, link.a.y + (link.b.y - link.a.y) * progress, 2.4 * pixel);
    }
  }
  for (const site of plan.sites) {
    const orbit = site.phaseOffset * TAU;
    const pulse = animate ? 0.92 + 0.08 * Math.sin(orbit + time * 2.3) : 1;
    const radius = (18 + 9 * site.strength) * pulse;
    ctx.strokeStyle = site.tint;
    ctx.globalAlpha = site.strength * 0.24;
    ctx.lineWidth = Math.max(2, pixel * 4);
    ctx.beginPath();
    ctx.ellipse(site.x, site.y + 4, radius + 6, radius * 0.54 + 2, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = site.strength * 0.62;
    ctx.lineWidth = Math.max(1, pixel * 1.65);
    ctx.beginPath();
    ctx.ellipse(site.x, site.y + 4, radius, radius * 0.5, 0, 0, TAU);
    ctx.stroke();

    // Horizontal ink-cloud ridges stay legible on reduced-motion clients.
    ctx.globalAlpha = 0.14 + site.strength * 0.19;
    ctx.lineWidth = Math.max(2, pixel * 2.7);
    for (let i = 0; i < 2; i++) {
      const x = site.x + Math.sin(orbit + i + time * 0.85) * 7;
      const y = site.y - 10 - i * 6;
      ctx.beginPath();
      ctx.moveTo(x - 21, y);
      ctx.bezierCurveTo(x - 12, y - 7, x + 1, y + 3, x + 18, y - 3);
      ctx.stroke();
    }
    ctx.fillStyle = site.tint;
    ctx.globalAlpha = 0.72;
    for (let i = 0; i < LOCAL_MOTES; i++) {
      const angle = orbit + TAU * i / LOCAL_MOTES + time * 0.72;
      dot(site.x + Math.cos(angle) * radius, site.y - 7 + Math.sin(angle) * radius * 0.58, (i ? 1.5 : 2.2) * pixel);
    }
  }
  ctx.restore();
}
