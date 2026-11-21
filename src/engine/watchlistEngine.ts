import type { Cultivator, MapPoint, PlayerWatch, WatchDigest, WatchlistState, WatchTarget, WorldEvent, WorldState } from '../types/world';
import { courierCheckpoint } from './sealedCourierEngine';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { terrainTileAt } from './terrainEngine';

export const WATCHLIST_MAX_WATCHES = 12;
export const WATCHLIST_MAX_DIGESTS = 96;
export const WATCHLIST_BUCKET_MAX_COUNT = 999;
export const WATCHLIST_MAX_LABEL_CHARS = 64;
export const WATCHLIST_CATEGORIES: readonly WorldEvent['category'][] = ['breakthrough', 'combat', 'intrigue', 'heavenly', 'death', 'diplomacy'];
const CLEAN = /[\u0000-\u001f\u007f]/gu;

export type WatchlistCommand =
  | { kind: 'add_watch'; target: WatchTarget }
  | { kind: 'remove_watch'; watchId: string }
  | { kind: 'mark_read'; watchId: string; throughTick: number };
export type WatchlistErrorCode = 'unknown_target' | 'not_found' | 'duplicate' | 'limit' | 'unknown_digest';
export type WatchlistMutationResult = { ok: true; world: WorldState } | { ok: false; world: WorldState; code: WatchlistErrorCode };
export interface WatchlistView { watch: PlayerWatch; label: string; digests: WatchDigest[]; unread: number }
export interface WatchTargetOption { target: WatchTarget; label: string }

export const createWatchlistState = (): WatchlistState => ({ watches: [], digests: [], nextId: 1 });
const key = ({ kind, id }: WatchTarget) => `${kind}:${id}`;
const live = (actor: Cultivator | undefined): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const labelFor = (value: string, kind: WatchTarget['kind']): string =>
  value.replace(CLEAN, ' ').trim().slice(0, WATCHLIST_MAX_LABEL_CHARS) ||
  ({ actor: '修士', site: '地点', sect: '宗门' } as const)[kind];

function actualPoint(world: WorldState, actor: Cultivator, sites: ReadonlyMap<string, MapPoint>): MapPoint | undefined {
  const inCourier = courierCheckpoint(world, actor);
  if (inCourier) return inCourier;
  const pilgrimage = pilgrimageCheckpoint(world, actor);
  if (pilgrimage) return pilgrimage;
  const convoy = world.relocations.plans.find((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(actor.id)) ??
    world.escorts.contracts.find((contract) => contract.status === 'active' && contract.escortId === actor.id);
  if (convoy) return convoy.path[convoy.pathIndex];
  return sites.get(actor.locationId);
}

function viewTiles(world: WorldState, actor: Cultivator | undefined, sites: ReadonlyMap<string, MapPoint>): Set<string> {
  if (!live(actor)) return new Set();
  const position = actualPoint(world, actor, sites);
  const center = position && terrainTileAt(world, position.x, position.y);
  if (!center) return new Set();
  const radius = actor.realm === '练气' || actor.realm === '筑基' ? 2 : actor.realm === '金丹' || actor.realm === '元婴' ? 3 : 4;
  const { rows, columns, tiles } = world.terrain;
  const seen = new Set<string>();
  for (let row = Math.max(0, center.row - radius); row <= Math.min(rows - 1, center.row + radius); row++) {
    for (let col = Math.max(0, center.col - radius); col <= Math.min(columns - 1, center.col + radius); col++) {
      const tile = tiles[row * columns + col];
      if (tile && (col - center.col) ** 2 + (row - center.row) ** 2 <= radius ** 2) seen.add(tile.id);
    }
  }
  return seen;
}

export function availableWatchTargets(world: WorldState, observerId?: string | null): WatchTargetOption[] {
  const observer = world.cultivators.find(({ id }) => id === observerId);
  if (!live(observer)) return [];
  const result: WatchTargetOption[] = [];
  const sites = new Map(world.locations.map((site) => [site.id, site]));
  const current = viewTiles(world, observer, sites);
  const explored = new Set(observer.exploredTileIds);
  const publicLandmarks = new Set(world.sects.map(({ headquartersId }) => headquartersId));
  const known = new Set<string>();
  for (const actor of world.cultivators) {
    if (!live(actor)) continue;
    const point = actualPoint(world, actor, sites);
    const tile = point && terrainTileAt(world, point.x, point.y);
    if (actor.id === observer.id || (tile && current.has(tile.id))) {
      result.push({ target: { kind: 'actor', id: actor.id }, label: labelFor(actor.name, 'actor') });
    }
  }
  for (const site of world.locations) {
    const tile = terrainTileAt(world, site.x, site.y);
    if (site.type !== 'market' && site.type !== 'sect_hq' && !publicLandmarks.has(site.id) &&
        !(tile && (current.has(tile.id) || explored.has(tile.id)))) continue;
    known.add(site.id);
    result.push({ target: { kind: 'site', id: site.id }, label: labelFor(site.name, 'site') });
  }
  for (const sect of world.sects) {
    if (sect.id === observer.sectId || known.has(sect.headquartersId)) result.push({ target: { kind: 'sect', id: sect.id }, label: labelFor(sect.name, 'sect') });
  }
  return result;
}

export function visibleWatchlists(world: WorldState, observerId?: string | null): WatchlistView[] {
  if (!observerId || !world.watchlists.watches.length || !world.cultivators.some(({ id }) => id === observerId)) return [];
  return world.watchlists.watches.filter((row) => row.observerId === observerId && row.createdTick <= world.tick && row.readThroughTick <= world.tick)
    .map((watch) => {
      const digests = world.watchlists.digests.filter((row) => row.watchId === watch.id && row.tick > watch.createdTick && row.tick <= world.tick)
        .map((row) => ({ ...row, buckets: row.buckets.map((bucket) => ({ ...bucket })) }));
      return { watch: { ...watch, target: { ...watch.target } }, label: watch.label, digests,
        unread: digests.filter(({ tick }) => tick > watch.readThroughTick).length };
    });
}

/** UI owns active-branch CAS. Engine changes only fresh player metadata, not time, RNG, or game facts. */
export function applyWatchMutation(world: WorldState, observerId: string | null | undefined, command: WatchlistCommand): WatchlistMutationResult {
  const state = world.watchlists;
  const failure = (code: WatchlistErrorCode): WatchlistMutationResult => ({ ok: false, world, code });
  const result = (watchlists: WatchlistState): WatchlistMutationResult => ({ ok: true, world: { ...world, watchlists } });
  if (!observerId || !world.cultivators.some(({ id }) => id === observerId)) return failure('unknown_target');
  if (command.kind === 'add_watch') {
    const eligible = availableWatchTargets(world, observerId).find((row) => key(row.target) === key(command.target));
    if (!eligible) return failure('unknown_target');
    if (state.watches.some((watch) => watch.observerId === observerId && key(watch.target) === key(eligible.target))) return failure('duplicate');
    if (state.watches.length >= WATCHLIST_MAX_WATCHES) return failure('limit');
    const watch: PlayerWatch = { id: `watch-${state.nextId}`, observerId, target: { ...eligible.target }, label: eligible.label,
      createdTick: world.tick, readThroughTick: world.tick };
    return result({ ...state, nextId: state.nextId + 1, watches: [...state.watches, watch] });
  }
  const watch = state.watches.find((row) => row.id === command.watchId && row.observerId === observerId && row.createdTick <= world.tick);
  if (!watch) return failure('not_found');
  if (command.kind === 'remove_watch') {
    return result({ ...state, watches: state.watches.filter(({ id }) => id !== watch.id),
      digests: state.digests.filter(({ watchId }) => watchId !== watch.id) });
  }
  if (!Number.isSafeInteger(command.throughTick) || command.throughTick <= watch.createdTick || command.throughTick > world.tick ||
    !state.digests.some((row) => row.watchId === watch.id && row.tick === command.throughTick)) return failure('unknown_digest');
  if (watch.readThroughTick >= command.throughTick) return { ok: true, world };
  return result({ ...state, watches: state.watches.map((row) => row.id === watch.id ? { ...row, readThroughTick: command.throughTick } : row) });
}

const signature = (event: WorldEvent): string => JSON.stringify([event.tick, event.category, event.locationId ?? null,
  [...new Set(event.actorIds)].sort()]);

function canonicalBatch(world: WorldState, batch: readonly WorldEvent[]): WorldEvent[] {
  const candidates = new Map<string, { event: WorldEvent; signature: string }>();
  const rejected = new Set<string>();
  for (const event of batch) {
    if (!event.id || event.witnessScope === 'participants' || event.tick !== world.tick || !WATCHLIST_CATEGORIES.includes(event.category)) {
      if (event.id) rejected.add(event.id);
      continue;
    }
    const incoming = signature(event);
    const existing = candidates.get(event.id);
    if (!existing) candidates.set(event.id, { event, signature: incoming });
    else if (incoming !== existing.signature) rejected.add(event.id);
  }
  for (const event of world.events) {
    const candidate = candidates.get(event.id);
    if (candidate && (event.witnessScope === 'participants' || signature(event) !== candidate.signature)) rejected.add(event.id);
  }
  return [...candidates.values()].filter(({ event }) => !rejected.has(event.id)).map(({ event }) => event);
}

/** Called for one complete authoritative tick's emitted batch (never retrospectively read a trimmed feed). */
export function captureWatchDigests(world: WorldState, events: readonly WorldEvent[]): void {
  const state = world.watchlists;
  if (world.tick <= (state.lastCapturedTick ?? 0) || !state.watches.length) return;
  state.lastCapturedTick = world.tick;
  const eligible = state.watches.filter((watch) => watch.createdTick < world.tick);
  if (!eligible.length || !events.length) return;
  const actors = new Map(world.cultivators.map((actor) => [actor.id, actor]));
  const sites = new Map(world.locations.map((site) => [site.id, site]));
  const valid = canonicalBatch(world, events);
  const observerTiles = new Map<string, Set<string>>();
  const eventTiles = new Map<string, string>();
  for (const event of valid) {
    const location = event.locationId && sites.get(event.locationId);
    const tile = location && terrainTileAt(world, location.x, location.y);
    if (tile) eventTiles.set(event.id, tile.id);
  }
  const digests: WatchDigest[] = [];
  for (const watch of eligible) {
    const observer = actors.get(watch.observerId);
    if (!observer) continue;
    let current = observerTiles.get(observer.id);
    if (!current) {
      current = viewTiles(world, observer, sites);
      observerTiles.set(observer.id, current);
    }
    const counts = new Map<WorldEvent['category'], number>();
    for (const event of valid) {
      const tile = eventTiles.get(event.id);
      const observed = event.actorIds.includes(observer.id) || (tile !== undefined && current.has(tile));
      if (!observed) continue;
      const matches = watch.target.kind === 'actor' ? event.actorIds.includes(watch.target.id) :
        watch.target.kind === 'site' ? event.locationId === watch.target.id :
        event.actorIds.some((id) => actors.get(id)?.sectId === watch.target.id);
      if (matches) counts.set(event.category, Math.min(WATCHLIST_BUCKET_MAX_COUNT, (counts.get(event.category) ?? 0) + 1));
    }
    const buckets = WATCHLIST_CATEGORIES.flatMap((category) => {
      const count = counts.get(category);
      return count ? [{ category, count }] : [];
    });
    if (buckets.length) digests.push({ watchId: watch.id, tick: world.tick, buckets });
  }
  if (digests.length) state.digests = [...state.digests, ...digests].slice(-WATCHLIST_MAX_DIGESTS);
}
