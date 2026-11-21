import type { Cultivator, LocationNode, WorldEvent, WorldState } from '../types/world';
import { courierCheckpoint } from './sealedCourierEngine';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { currentVisibleTileIds, terrainTileAt } from './terrainEngine';

export type ChronicleFocusKind = 'site' | 'actor' | 'sect';
export interface ChronicleFocusRequest { eventId: string; kind: ChronicleFocusKind; targetId: string }
export type ChronicleFocusTarget = ChronicleFocusRequest & { label: string };
export interface ChronicleFocusOptions { links: ChronicleFocusTarget[]; withheld: boolean }
export type ChronicleFocusResult = { ok: true; target: ChronicleFocusTarget } | { ok: false; reason: 'unavailable' };
export const CHRONICLE_FOCUS_UNAVAILABLE = '这条纪事的目标目前不可定位，未显示未知地点。';
const MAX_ACTOR_LINKS = 3;

function unsettledStation(world: WorldState, actor: Cultivator): boolean {
  const guard = actor.guardAssignment;
  return Boolean(guard && guard.assignedTick <= world.tick && guard.expiresTick > world.tick && guard.locationId !== actor.locationId) ||
    world.escorts.contracts.some((row) => row.escortId === actor.id && row.status === 'active') ||
    world.relocations.plans.some((row) => row.status === 'in_transit' && row.garrisonIds.includes(actor.id)) ||
    world.sieges.some((row) => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(actor.id));
}

function observedTiles(world: WorldState, actor?: Cultivator): ReadonlySet<string> {
  return actor?.alive && actor.hp > 0 && !unsettledStation(world, actor) ? currentVisibleTileIds(world, actor) : new Set();
}
function isVisible(world: WorldState, tiles: ReadonlySet<string>, at: { x: number; y: number } | undefined): boolean {
  const tile = at && terrainTileAt(world, at.x, at.y);
  return !!tile && tiles.has(tile.id);
}

/** Never substitute a rumor, an explored-but-not-current tile, or another site's coordinates. */
export function canFocusChronicleSite(world: WorldState, siteId: string, viewerId?: string | null): boolean {
  const viewer = viewerId && world.cultivators.find(({ id }) => id === viewerId) || undefined;
  return isVisible(world, observedTiles(world, viewer), world.locations.find(({ id }) => id === siteId));
}

function canonicalEvents(world: WorldState): ReadonlyMap<string, WorldEvent> {
  const facts = new Map<string, WorldEvent>();
  const rejected = new Set<string>();
  for (const event of world.events) {
    if (!event.id) continue;
    if (rejected.has(event.id) || facts.has(event.id) || event.witnessScope === 'participants' ||
        !Number.isSafeInteger(event.tick) || event.tick < 0 || event.tick > world.tick ||
        event.id.startsWith('evt-sealed-dispatch-')) {
      facts.delete(event.id);
      rejected.add(event.id);
    } else facts.set(event.id, event);
  }
  return facts;
}

function exactElection(world: WorldState, event: WorldEvent, site: LocationNode) {
  if (event.category !== 'diplomacy' || site.type === 'secret_realm') return undefined;
  return world.sects.find((sect) => {
    const proof = sect.succession;
    return sect.headquartersId === site.id && site.ownerSectId === sect.id && proof?.method === 'election' &&
      proof.tick === event.tick && sect.leaderId === proof.leaderId && event.actorIds[0] === proof.leaderId &&
      event.id === `evt-${event.tick}-${sect.id}-leadership-vacancy-${proof.leaderId}`;
  });
}

/** Index once per snapshot/observer. Returned data contains only explicit safe labels and IDs, never geometry. */
export function createChronicleFocusResolver(world: WorldState, viewerId?: string | null): {
  build(eventId: string): ChronicleFocusOptions;
  resolve(request: ChronicleFocusRequest): ChronicleFocusResult;
} {
  const actors = new Map(world.cultivators.map((actor) => [actor.id, actor]));
  const viewer = viewerId ? actors.get(viewerId) : undefined;
  const observed = observedTiles(world, viewer);
  const sites = new Map(world.locations.map((site) => [site.id, site]));
  const facts = canonicalEvents(world);
  const build = (eventId: string): ChronicleFocusOptions => {
    const fact = facts.get(eventId);
    if (!fact) return { links: [], withheld: false };
    const site = fact.locationId ? sites.get(fact.locationId) : undefined;
    const visibleSource = isVisible(world, observed, site);
    const observedFact = Boolean(viewer && observed.size && (visibleSource || fact.actorIds.includes(viewer.id)));
    const links: ChronicleFocusTarget[] = [];
    let withheld = false;
    const add = (kind: ChronicleFocusKind, targetId: string, label: string) => links.push({ eventId, kind, targetId, label });
    if (fact.locationId) {
      if (observedFact && site && visibleSource) add('site', site.id, site.name);
      else withheld = true;
    }
    let people = 0;
    for (const actorId of new Set(fact.actorIds)) {
      const actor = observedFact ? actors.get(actorId) : undefined;
      const observedPoint = actor?.alive && actor.hp > 0 && !unsettledStation(world, actor) ?
        courierCheckpoint(world, actor) ?? pilgrimageCheckpoint(world, actor) ?? sites.get(actor.locationId) : undefined;
      if (actor && isVisible(world, observed, observedPoint)) {
        if (people++ < MAX_ACTOR_LINKS) add('actor', actor.id, actor.name);
      } else withheld = true;
    }
    const sect = observedFact && site && visibleSource ? exactElection(world, fact, site) : undefined;
    if (sect) add('sect', sect.id, sect.name);
    return { links, withheld };
  };
  return {
    build,
    resolve(request) {
      const target = request && build(request.eventId).links.find((link) => link.kind === request.kind && link.targetId === request.targetId);
      return target ? { ok: true, target } : { ok: false, reason: 'unavailable' };
    },
  };
}

export function buildChronicleFocusTargets(world: WorldState, eventId: string, viewerId?: string | null): ChronicleFocusOptions {
  return createChronicleFocusResolver(world, viewerId).build(eventId);
}
export function resolveChronicleFocus(world: WorldState, request: ChronicleFocusRequest, viewerId?: string | null): ChronicleFocusResult {
  return createChronicleFocusResolver(world, viewerId).resolve(request);
}
