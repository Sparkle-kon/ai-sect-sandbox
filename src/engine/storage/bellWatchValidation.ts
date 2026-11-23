import { bellWatchEventId, bellWatchEventProof, type BellWatchState } from '../../types/bellWatch';
import type { LocationNode, MapTile, WorldEvent, WorldState } from '../../types/world';
import { routeWarningHazardValid } from '../routeWarningProof';

const markerNamespace = 'evt-bell-report-';
type MarkerKind = 'changed' | 'waiting' | 'inspect' | 'reroute' | 'settled';

/** Participant-only marker events never carry a route, a listener or the site. */
export const isSealedBellMarker = (event: Pick<WorldEvent, 'id'>): boolean => event.id.startsWith(markerNamespace);

const isClock = (tick: number, world: WorldState): boolean => Number.isSafeInteger(tick) && tick >= 1 && tick <= world.tick;

function tileAt(world: WorldState, site: LocationNode): MapTile | undefined {
  const { columns, rows, tiles } = world.terrain;
  const col = Math.min(columns - 1, Math.floor(site.x / (1000 / columns)));
  const row = Math.min(rows - 1, Math.floor(site.y / (600 / rows)));
  return tiles[row * columns + col];
}

function sameCalendar(world: WorldState, event: WorldEvent, at: number): boolean {
  const date = world.year * 12 + world.month - 1 - (world.tick - at);
  return event.tick === at && event.year === Math.floor(date / 12) && event.month === date % 12 + 1;
}

function matchMarker(world: WorldState, event: WorldEvent, at: number): boolean {
  return sameCalendar(world, event, at) && event.category === 'diplomacy' && event.witnessScope === 'participants' &&
    event.actorIds.length === 0 && event.locationId === undefined &&
    event.title === '一件寻常差事' && event.description === '只在当事人的一章里记下这段始末。' &&
    event.damage === undefined && event.duelWinnerId === undefined && event.daoIntents === undefined &&
    event.forbiddenArt === undefined && event.dialogueRedacted === undefined && event.dialogue === undefined;
}

function towerIsEvidenced(world: WorldState, tower: LocationNode, watch: BellWatchState): boolean {
  const sect = world.sects.find(row => row.id === watch.sectId);
  if (sect?.headquartersId === tower.id && sect.facilities.defense_array > 0 &&
    (tower.type === 'sect_hq' && tower.ownerSectId === sect.id ||
      tower.type === 'spirit_vein' && tower.ownerSectId === undefined &&
      sect.inactiveSinceTick !== undefined && sect.inactiveSinceTick >= watch.openedTick)) return true;
  // A real migration leaves the fixed building behind, without rewriting its reports.
  return world.relocations.abandonedSites.some(row => row.originId === tower.id && row.sectId === watch.sectId &&
    row.originalType === 'sect_hq' && row.tick >= watch.openedTick && row.facilities.defense_array > 0);
}

export function validateBellWatches(world: WorldState, fail: (field: string) => never): void {
  const towers = world.locations.filter(site => site.bellWatch !== undefined);
  const raw = new Map<string, WorldEvent[]>();
  for (const event of world.events) {
    if (!isSealedBellMarker(event)) continue;
    const prior = raw.get(event.id);
    if (prior) prior.push(event);
    else raw.set(event.id, [event]);
  }
  if (!towers.length && !raw.size) return;
  const actors = new Set(world.cultivators.map(({ id }) => id));
  const tiles = new Map(world.terrain.tiles.map(tile => [tile.id, tile]));
  const sites = new Map(world.locations.map(site => [site.id, site]));
  const activeTravel = new Set<string>();

  const prove = (watch: BellWatchState, kind: MarkerKind, at: number): void => {
    const id = bellWatchEventId(watch.id, kind, at, bellWatchEventProof(watch, kind));
    const entries = raw.get(id);
    const mustStillBeRetained = world.events.length < 120 || world.events.some(event => event.tick < at);
    // Once the capped live history has truly rotated, the persisted domain receipt is itself the proof.
    if (entries ? entries.length !== 1 || !matchMarker(world, entries[0], at) : mustStillBeRetained)
      fail('locations.bellWatch.event');
    raw.delete(id);
  };

  for (const tower of towers) {
    const watch = tower.bellWatch!;
    const { damage, choice, receipts, waits } = watch;
    if (watch.id !== `bell-watch-${watch.openedTick}-${tower.id}` || !isClock(watch.openedTick, world) ||
      !actors.has(watch.watcherId) || !towerIsEvidenced(world, tower, watch) || !watch.listeners.length ||
      watch.listeners.length > 8) fail('locations.bellWatch.duty');

    const listeners = new Map<string, string>();
    for (const row of watch.listeners) {
      const site = sites.get(row.siteId);
      if (!actors.has(row.actorId) || row.actorId === watch.watcherId || listeners.has(row.actorId) ||
        !site || site.type === 'abyss' || site.type === 'secret_realm') fail('locations.bellWatch.listeners');
      listeners.set(row.actorId, row.siteId);
    }
    if (!damage) {
      if (choice || receipts.length || waits !== undefined) fail('locations.bellWatch.undamaged');
      continue;
    }

    const origin = tileAt(world, tower);
    if (!origin) return fail('locations.bellWatch.originTile');
    const hazard = damage.hazard;
    if (origin.id !== hazard.tileId || !isClock(damage.tick, world) || watch.openedTick >= hazard.createdTick ||
      hazard.createdTick >= damage.tick || !routeWarningHazardValid(world, hazard, damage.tick) ||
      hazard.intensity < 2 && !hazard.id.startsWith('natural-beast-tide-') || damage.integrityBefore !== 100 ||
      damage.integrityAfter !== damage.integrityBefore - hazard.intensity * 20)
      fail('locations.bellWatch.damage');
    prove(watch, 'changed', damage.tick);
    if (waits !== undefined) {
      const waited = new Set<string>();
      const at = damage.tick + 1;
      if (!waits.length || !isClock(at, world)) fail('locations.bellWatch.waits');
      for (const row of waits) {
        if (row.tick !== at || listeners.get(row.actorId) !== row.siteId || waited.has(row.actorId) ||
          receipts.some(receipt => receipt.actorId === row.actorId && receipt.tick <= at))
          fail('locations.bellWatch.waits');
        waited.add(row.actorId);
      }
      prove(watch, 'waiting', at);
    }
    if (!choice) {
      if (receipts.length) fail('locations.bellWatch.unanswered');
      continue;
    }

    const { outcome, endedTick, lastMovedTick, pathIndex, pathTileIds, destinationId, tick, returning } = choice;
    if (!isClock(tick, world) || tick <= damage.tick || (outcome === undefined) !== (endedTick === undefined) ||
      endedTick !== undefined && (!isClock(endedTick, world) || endedTick <= tick) ||
      lastMovedTick !== undefined && (!isClock(lastMovedTick, world) || lastMovedTick <= tick ||
        endedTick !== undefined && lastMovedTick > endedTick))
      fail('locations.bellWatch.choice');
    prove(watch, choice.move, tick);
    if (endedTick !== undefined) prove(watch, 'settled', endedTick);

    if (choice.move === 'inspect') {
      if (pathTileIds.length || pathIndex || returning || lastMovedTick !== undefined || destinationId !== tower.id ||
        outcome !== undefined && outcome !== 'inspected' && outcome !== 'absent')
        fail('locations.bellWatch.inspect');
    } else {
      const target = sites.get(destinationId);
      if (!target || target === tower || ![...listeners.values()].includes(destinationId) ||
        pathTileIds.length < 2 || pathTileIds[0] !== origin.id || pathTileIds.at(-1) !== tileAt(world, target)?.id ||
        pathIndex >= pathTileIds.length || pathIndex > 0 && lastMovedTick === undefined ||
        pathIndex > (lastMovedTick ?? tick) - tick || outcome === 'inspected')
        fail('locations.bellWatch.path');
      const visited = new Set<string>();
      let previous: MapTile | undefined;
      for (const tileId of pathTileIds) {
        const tile = tiles.get(tileId);
        if (!tile || visited.has(tileId) || previous &&
          Math.abs(previous.col - tile.col) + Math.abs(previous.row - tile.row) !== 1) fail('locations.bellWatch.path');
        visited.add(tileId);
        previous = tile;
      }
      if (outcome === 'arrived' && (pathIndex !== pathTileIds.length - 1 || returning || lastMovedTick !== endedTick) ||
        outcome === 'blocked' && (pathIndex !== 0 || returning !== true) ||
        outcome === undefined && pathIndex === pathTileIds.length - 1)
        fail('locations.bellWatch.pathStatus');
      if (outcome === undefined) {
        if (activeTravel.has(watch.watcherId)) fail('locations.bellWatch.doubleTravel');
        activeTravel.add(watch.watcherId);
      }
    }

    const heard = new Set<string>();
    for (const row of receipts) {
      if ((outcome !== 'inspected' && outcome !== 'arrived') || row.tick !== endedTick || row.siteId !== destinationId ||
        listeners.get(row.actorId) !== row.siteId || heard.has(row.actorId))
        fail('locations.bellWatch.receipts');
      heard.add(row.actorId);
    }
  }
  if (raw.size) fail('locations.bellWatch.unlinkedEvent');
}
