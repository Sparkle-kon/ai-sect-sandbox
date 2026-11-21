import type { Cultivator } from '../types/world';
import { MAP_HEIGHT, MAP_WIDTH, mapToScreen } from './mapCamera';
import type { MapCamera } from './mapCamera';

export const CLUSTER_CELL_PX = 44;
export const MAP_ACTOR_PAGE_SIZE = 8;
export const CLUSTER_RADIUS_PX = 15;

export interface MapActorPoint {
  actor: Cultivator;
  x: number;
  y: number;
}
export interface MarkerViewport { width: number; height: number }
export type MapActorMarker =
  | { kind: 'actor'; key: string; x: number; y: number; point: MapActorPoint; selected: boolean; mouseRadius: number }
  | { kind: 'cluster'; key: string; x: number; y: number; ids: readonly string[] };

const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Accept only the authorised map view's actor positions, never the world roster. */
export function planActorMarkers(points: readonly MapActorPoint[], camera: MapCamera,
  size: MarkerViewport, selectedId: string | null): MapActorMarker[] {
  if (!(size.width > 0 && size.height > 0)) return [];
  const columns = Math.max(1, Math.floor(size.width / CLUSTER_CELL_PX));
  const rows = Math.max(1, Math.floor(size.height / CLUSTER_CELL_PX));
  const cellWidth = size.width / columns;
  const cellHeight = size.height / rows;
  const mouseRadius = Math.max(10, 12 * camera.zoom * Math.min(size.width / MAP_WIDTH, size.height / MAP_HEIGHT));
  const cells = new Map<string, Array<Extract<MapActorMarker, { kind: 'actor' }>>>();
  let selected: Extract<MapActorMarker, { kind: 'actor' }> | undefined;
  for (const point of points) {
    if (!point.actor.alive) continue;
    const screen = mapToScreen(camera, point);
    const x = screen.x * size.width / MAP_WIDTH;
    const y = screen.y * size.height / MAP_HEIGHT;
    if (!(x >= 0 && y >= 0 && x <= size.width && y <= size.height)) continue;
    const solo = { kind: 'actor', key: point.actor.id, x, y, point, mouseRadius, selected: point.actor.id === selectedId } as const;
    if (solo.selected) { selected = solo; continue; }
    const cell = `${Math.min(columns - 1, Math.floor(x / cellWidth))}:${Math.min(rows - 1, Math.floor(y / cellHeight))}`;
    const entries = cells.get(cell);
    if (entries) entries.push(solo);
    else cells.set(cell, [solo]);
  }
  const markers: MapActorMarker[] = [];
  for (const [cell, entries] of cells) {
    if (entries.length === 1) { markers.push(entries[0]); continue; }
    entries.sort((a, b) => compareIds(a.key, b.key));
    const count = entries.length;
    let x = entries.reduce((sum, entry) => sum + entry.x, 0) / count;
    let y = entries.reduce((sum, entry) => sum + entry.y, 0) / count;
    // Keep an overlapping selected marker independently tappable without moving the actor itself.
    const clamp = (value: number, extent: number) => Math.max(Math.min(CLUSTER_RADIUS_PX, extent / 2),
      Math.min(Math.max(extent - CLUSTER_RADIUS_PX, extent / 2), value));
    // Maintain breathing room across cell borders, not one sliver-sized last cell.
    const [col, row] = cell.split(':').map(Number);
    x = col * cellWidth + clamp(x - col * cellWidth, cellWidth);
    y = row * cellHeight + clamp(y - row * cellHeight, cellHeight);
    if (selected && Math.hypot(selected.x - x, selected.y - y) < 26) {
      const original = { x, y };
      const candidates = [0, 1, 2, 3].map((side) => ({
        x: col * cellWidth + clamp(original.x - col * cellWidth + (side === 0 ? 28 : side === 1 ? -28 : 0), cellWidth),
        y: row * cellHeight + clamp(original.y - row * cellHeight + (side === 2 ? 28 : side === 3 ? -28 : 0), cellHeight),
      }));
      const space = (p: { x: number; y: number }) => Math.hypot(selected.x - p.x, selected.y - p.y);
      // Diagonal corners provide a distinct tap center even when the selected dot sits at the centroid.
      for (const dx of [0, cellWidth]) for (const dy of [0, cellHeight]) {
        candidates.push({ x: col * cellWidth + clamp(dx, cellWidth), y: row * cellHeight + clamp(dy, cellHeight) });
      }
      const separated = candidates.reduce((best, item) => space(item) > space(best) ? item : best, original);
      ({ x, y } = separated);
    }
    markers.push({ kind: 'cluster', key: cell, x, y, ids: entries.map(({ key }) => key) });
  }
  markers.sort((a, b) => a.x - b.x || a.y - b.y || compareIds(a.key, b.key));
  if (selected) markers.push(selected); // Last painted and selected at exact-coordinate ties.
  return markers;
}

export function pickActorMarker(markers: readonly MapActorMarker[], point: { x: number; y: number }, touch: boolean) {
  let best: MapActorMarker | undefined;
  let distance = Infinity;
  for (const marker of markers) {
    const gap = Math.hypot(marker.x - point.x, marker.y - point.y);
    const mouseRadius = marker.kind === 'cluster' ? CLUSTER_RADIUS_PX : marker.mouseRadius;
    const radius = touch ? Math.max(22, mouseRadius) : mouseRadius;
    if (gap <= radius && gap <= distance) { best = marker; distance = gap; }
  }
  return best;
}

export function mapActorPage(eligible: readonly Cultivator[], search: string, requestedPage: number) {
  const normalize = (value: string) => value.normalize('NFKC').trim().toLowerCase();
  const needle = normalize(search);
  const matching = eligible.filter(actor => !needle || normalize(`${actor.name} ${actor.title} ${actor.realm} ${actor.id}`).includes(needle))
    .sort((a, b) => compareIds(a.id, b.id));
  const total = matching.length;
  const pages = Math.max(1, Math.ceil(total / MAP_ACTOR_PAGE_SIZE));
  const page = Math.max(0, Math.min(requestedPage, pages - 1));
  return { actors: matching.slice(page * MAP_ACTOR_PAGE_SIZE, (page + 1) * MAP_ACTOR_PAGE_SIZE), total, pages, page };
}

/** Resolve touched identities against the latest visible data, not the painted snapshot. */
export function visibleMarkerMembers(marker: MapActorMarker, current: ReadonlyMap<string, Cultivator>) {
  const ids = marker.kind === 'cluster' ? marker.ids : [marker.point.actor.id];
  return ids.flatMap(id => {
    const actor = current.get(id);
    return actor?.alive ? [actor] : [];
  });
}
