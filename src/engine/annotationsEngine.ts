import { publicChronicleChapters } from './coldHistoryEngine';
import type { AnnotationBookmark, AnnotationState, LocationNode, MapAnnotation, MapPoint, MapTile, WorldState } from '../types/world';
import { currentVisibleTileIds, knownMapLocations, terrainTileAt } from './terrainEngine';

import { ANNOTATION_MAX_BOOKMARKS, ANNOTATION_MAX_NOTES, ANNOTATION_MAX_NOTE_CHARS, ANNOTATION_MAX_TITLE_CHARS } from './annotationState';
export { ANNOTATION_MAX_BOOKMARKS, ANNOTATION_MAX_NOTES, ANNOTATION_MAX_NOTE_CHARS, ANNOTATION_MAX_TITLE_CHARS,
  createAnnotationState } from './annotationState';
const CONTROL = /[\u0000-\u001f\u007f]/u;
const REPLACED_CONTROL = /[\u0000-\u001f\u007f]/gu;

export type AnnotationTargetInput = { kind: 'site'; locationId: string } | { kind: 'tile'; tileId: string };
export type AnnotationCommand =
  | { kind: 'add_bookmark'; eventId: string }
  | { kind: 'remove_bookmark'; bookmarkId: string }
  | { kind: 'add_note'; target: AnnotationTargetInput; text: string }
  | { kind: 'edit_note'; noteId: string; text: string }
  | { kind: 'remove_note'; noteId: string };

export type AnnotationErrorCode = 'unavailable_event' | 'unknown_target' | 'invalid_text' | 'not_found' | 'duplicate' | 'limit';
export type AnnotationMutationResult =
  | { ok: true; world: WorldState }
  | { ok: false; world: WorldState; code: AnnotationErrorCode };

export interface AnnotationBookmarkSource {
  eventId: string;
  eventTick: number;
  title: string;
  category: AnnotationBookmark['category'];
  locationId?: string;
}
export interface VisibleMapAnnotation { note: MapAnnotation; point: MapPoint; historical: boolean }


function safeTitle(input: string): string {
  return input.replace(REPLACED_CONTROL, ' ').trim().slice(0, ANNOTATION_MAX_TITLE_CHARS);
}

function privateOrFutureDuplicate(world: WorldState, eventId: string): boolean {
  return world.events.some((event) => event.id === eventId && (event.witnessScope === 'participants' || event.tick > world.tick));
}

/** Only canonical public evidence present in the viewed timeline snapshot, never novel prose or another branch. */
export function bookmarkableEvent(world: WorldState, eventId: string): AnnotationBookmarkSource | undefined {
  if (!eventId || privateOrFutureDuplicate(world, eventId)) return undefined;
  const canonical = world.events.find(({ id, tick }) => id === eventId && tick <= world.tick) ??
    world.chronicleArchive.anchors.find(({ id, tick }) => id === eventId && tick <= world.tick) ??
    publicChronicleChapters(world).filter((row) => row.endTick <= world.tick)
      .flatMap((row) => row.anchors.filter(({ tick }) => tick >= row.startTick && tick <= row.endTick))
      .find(({ id, tick }) => id === eventId && tick <= world.tick);
  if (!canonical) return undefined;
  const title = safeTitle(canonical.title);
  if (!title) return undefined;
  return { eventId: canonical.id, eventTick: canonical.tick, title, category: canonical.category,
    ...(canonical.locationId ? { locationId: canonical.locationId } : {}) };
}

export function visibleBookmarks(world: WorldState): AnnotationBookmark[] {
  // The captured public title outlives the rolling feed, but current proof of privacy takes precedence.
  return world.annotations.bookmarks.filter((entry) => entry.createdTick <= world.tick && entry.eventTick <= entry.createdTick &&
    !privateOrFutureDuplicate(world, entry.eventId)).map((entry) => ({ ...entry }));
}

function scope(world: WorldState, actorId?: string | null): { sites: LocationNode[]; tileIds: Set<string> } {
  if (actorId === undefined || actorId === null) {
    return { sites: world.locations.filter((site) => site.type === 'market' || site.type === 'sect_hq' ||
      world.sects.some(({ headquartersId }) => headquartersId === site.id)), tileIds: new Set() };
  }
  const actor = world.cultivators.find(({ id }) => id === actorId);
  if (!actor) return { sites: [], tileIds: new Set() };
  return { sites: knownMapLocations(world, actor), tileIds: new Set([...actor.exploredTileIds, ...currentVisibleTileIds(world, actor)]) };
}

export function availableAnnotationTargets(world: WorldState, actorId?: string | null): {
  sites: Array<{ id: string; name: string; tileId: string }>;
  tiles: Array<{ id: string; col: number; row: number }>;
} {
  const known = scope(world, actorId);
  return {
    sites: known.sites.flatMap((site) => {
      const tile = terrainTileAt(world, site.x, site.y);
      return tile ? [{ id: site.id, name: site.name, tileId: tile.id }] : [];
    }),
    tiles: world.terrain.tiles.filter(({ id }) => known.tileIds.has(id)).map(({ id, col, row }) => ({ id, col, row })),
  };
}

export function bookmarkLocation(world: WorldState, bookmarkId: string, actorId?: string | null): LocationNode | undefined {
  const bookmark = visibleBookmarks(world).find(({ id }) => id === bookmarkId);
  return bookmark?.locationId ? scope(world, actorId).sites.find(({ id }) => id === bookmark.locationId) : undefined;
}

function tilePoint(world: WorldState, tile: MapTile): MapPoint {
  return { x: (tile.col + .5) * 1000 / world.terrain.columns, y: (tile.row + .5) * 600 / world.terrain.rows };
}

export function visibleMapAnnotations(world: WorldState, actorId?: string | null): VisibleMapAnnotation[] {
  const known = scope(world, actorId);
  return world.annotations.notes.flatMap((note): VisibleMapAnnotation[] => {
    if (note.createdTick > world.tick || note.updatedTick > world.tick) return [];
    const target = note.target;
    const copy = { ...note, target: { ...target } };
    const tile = world.terrain.tiles.find(({ id }) => id === target.tileId);
    if (!tile) return [];
    if (target.kind === 'tile') return known.tileIds.has(tile.id) ? [{ note: copy, point: tilePoint(world, tile), historical: false }] : [];
    const actualSite = world.locations.find(({ id }) => id === target.locationId);
    const siteStillAtAnchor = actualSite && terrainTileAt(world, actualSite.x, actualSite.y)?.id === target.tileId;
    if (siteStillAtAnchor) {
      return known.sites.some(({ id }) => id === target.locationId)
        ? [{ note: copy, point: { x: actualSite.x, y: actualSite.y }, historical: false }] : [];
    }
    // Removal/reuse does not substitute a new map destination nor reveal the old tile to a new viewpoint.
    return known.tileIds.has(tile.id) ? [{ note: copy, point: tilePoint(world, tile), historical: true }] : [];
  });
}

function noteText(input: string): string | undefined {
  if (typeof input !== 'string' || CONTROL.test(input)) return undefined;
  const text = input.trim();
  return text.length > 0 && text.length <= ANNOTATION_MAX_NOTE_CHARS ? text : undefined;
}

/** Mutates only same-tick metadata on a fresh root. The app owns active-branch/expected-snapshot authorization. */
export function applyAnnotation(world: WorldState, actorId: string | null | undefined, command: AnnotationCommand): AnnotationMutationResult {
  const state = world.annotations;
  const no = (code: AnnotationErrorCode): AnnotationMutationResult => ({ ok: false, world, code });
  const yes = (annotations: AnnotationState): AnnotationMutationResult => ({ ok: true, world: { ...world, annotations } });
  switch (command.kind) {
    case 'add_bookmark': {
      const source = bookmarkableEvent(world, command.eventId);
      if (!source) return no('unavailable_event');
      if (state.bookmarks.some(({ eventId }) => eventId === source.eventId)) return no('duplicate');
      if (state.bookmarks.length >= ANNOTATION_MAX_BOOKMARKS) return no('limit');
      const bookmark: AnnotationBookmark = { id: `bookmark-${state.nextId}`, createdTick: world.tick, ...source };
      return yes({ ...state, nextId: state.nextId + 1, bookmarks: [...state.bookmarks, bookmark] });
    }
    case 'remove_bookmark': {
      if (!state.bookmarks.some(({ id, createdTick }) => id === command.bookmarkId && createdTick <= world.tick)) return no('not_found');
      return yes({ ...state, bookmarks: state.bookmarks.filter(({ id }) => id !== command.bookmarkId) });
    }
    case 'add_note': {
      const text = noteText(command.text);
      if (!text) return no('invalid_text');
      if (state.notes.length >= ANNOTATION_MAX_NOTES) return no('limit');
      const target = command.target;
      const known = availableAnnotationTargets(world, actorId);
      let established: MapAnnotation['target'];
      if (target.kind === 'site') {
        const site = known.sites.find(({ id }) => id === target.locationId);
        if (!site) return no('unknown_target');
        established = { kind: 'site', locationId: site.id, tileId: site.tileId, siteName: safeTitle(site.name) || '历史地点' };
      } else {
        const tile = known.tiles.find(({ id }) => id === target.tileId);
        if (!tile) return no('unknown_target');
        established = { kind: 'tile', tileId: tile.id };
      }
      const note: MapAnnotation = { id: `annotation-${state.nextId}`, createdTick: world.tick, updatedTick: world.tick, text, target: established };
      return yes({ ...state, nextId: state.nextId + 1, notes: [...state.notes, note] });
    }
    case 'edit_note': {
      const text = noteText(command.text);
      if (!text) return no('invalid_text');
      const note = state.notes.find(({ id, createdTick, updatedTick }) => id === command.noteId && createdTick <= world.tick && updatedTick <= world.tick);
      if (!note) return no('not_found');
      if (!visibleMapAnnotations(world, actorId).some((view) => view.note.id === note.id)) return no('unknown_target');
      if (note.text === text) return { ok: true, world };
      return yes({ ...state, notes: state.notes.map((row) => row.id === note.id ? { ...row, text, updatedTick: world.tick } : row) });
    }
    case 'remove_note': {
      if (!state.notes.some(({ id, createdTick }) => id === command.noteId && createdTick <= world.tick)) return no('not_found');
      return yes({ ...state, notes: state.notes.filter(({ id }) => id !== command.noteId) });
    }
  }
}
