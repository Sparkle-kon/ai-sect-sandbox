import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyWatchMutation, availableWatchTargets, captureWatchDigests, createWatchlistState, visibleWatchlists, WATCHLIST_BUCKET_MAX_COUNT,
  WATCHLIST_MAX_DIGESTS, WATCHLIST_MAX_WATCHES } from '../src/engine/watchlistEngine';
import type { WatchTarget, WorldEvent, WorldState } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(82140);
  world.watchlists = createWatchlistState();
  world.tick = 8;
  const [observer, companion, hidden] = world.cultivators;
  observer.locationId = 'loc-taixu';
  observer.realm = '练气';
  observer.exploredTileIds = [];
  observer.rumors = [];
  companion.locationId = observer.locationId;
  hidden.locationId = 'loc-blood';
  const event = (w: WorldState, id: string, fields: Partial<WorldEvent> = {}): WorldEvent => ({
    id, tick: w.tick, year: w.year, month: w.month, category: 'combat', title: 'SECRET_TITLE_DO_NOT_COPY',
    description: 'SECRET_DESCRIPTION_DO_NOT_COPY', actorIds: [companion.id], locationId: observer.locationId, ...fields,
  });
  return { world, observer, companion, hidden, event };
}

function add(world: WorldState, observerId: string, ...targets: WatchTarget[]): WorldState {
  return targets.reduce((input, target) => {
    const result = applyWatchMutation(input, observerId, { kind: 'add_watch', target });
    expect(result.ok).toBe(true);
    return result.world;
  }, world);
}

describe('branch-local quiet watchlists', () => {
  it('lets the chosen live viewpoint follow itself, visible real people and known sites, not hidden occupants', () => {
    const { world, observer, companion, hidden } = fixture();
    expect(availableWatchTargets(world, observer.id).some(({ target }) => target.kind === 'actor' && target.id === hidden.id)).toBe(false);
    expect(availableWatchTargets(world, observer.id).some(({ target }) => target.kind === 'site' && target.id === 'loc-secret-1')).toBe(false);
    expect(applyWatchMutation(world, observer.id, { kind: 'add_watch', target: { kind: 'actor', id: hidden.id } })).toMatchObject({ ok: false, code: 'unknown_target' });
    const result = add(world, observer.id, { kind: 'actor', id: observer.id }, { kind: 'actor', id: companion.id }, { kind: 'site', id: hidden.locationId },
      { kind: 'sect', id: observer.sectId });
    expect(result).not.toBe(world);
    expect(result.cultivators).toBe(world.cultivators);
    expect(result.random).toBe(world.random);
    expect(world.watchlists.watches).toEqual([]);
    expect(result.watchlists.watches).toHaveLength(4);
    expect(applyWatchMutation(result, observer.id, { kind: 'add_watch', target: { kind: 'actor', id: companion.id } })).toMatchObject({ ok: false, code: 'duplicate' });
    expect(visibleWatchlists(result, hidden.id)).toEqual([]);
    const priorName = companion.name;
    companion.name = 'CHANGED_AFTER_HIDDEN';
    companion.locationId = hidden.locationId;
    expect(visibleWatchlists(result, observer.id)[1].label).toBe(priorName);
  });

  it('coalesces actual public batches once, drops private/future/ambiguous IDs and never counts hidden activity even at known sites', () => {
    const { world, observer, companion, hidden, event } = fixture();
    const tracked = add(world, observer.id, { kind: 'actor', id: companion.id }, { kind: 'site', id: hidden.locationId },
      { kind: 'sect', id: companion.sectId });
    captureWatchDigests(tracked, [event(tracked, 'at-opt-in')]);
    expect(tracked.watchlists.digests).toEqual([]);
    tracked.tick++;
    const two = event(tracked, 'legitimate-other');
    tracked.events = [event(tracked, 'private-override', { witnessScope: 'participants' })];
    captureWatchDigests(tracked, [
      event(tracked, 'legitimate'), two, { ...two },
      event(tracked, 'private-override'),
      event(tracked, 'participants', { witnessScope: 'participants' }),
      event(tracked, 'conflict'), event(tracked, 'conflict', { category: 'diplomacy' }),
      event(tracked, 'future'), event(tracked, 'future', { tick: tracked.tick + 1 }),
      event(tracked, 'known-but-hidden', { locationId: hidden.locationId }),
      event(tracked, 'observer-party', { actorIds: [observer.id, companion.id], locationId: undefined, category: 'diplomacy' }),
    ]);
    captureWatchDigests(tracked, [event(tracked, 'second-call-must-not-count')]);
    const views = visibleWatchlists(tracked, observer.id);
    expect(views).toHaveLength(3);
    expect(views[0].digests).toEqual([{ watchId: views[0].watch.id, tick: tracked.tick,
      buckets: [{ category: 'combat', count: 2 }, { category: 'diplomacy', count: 1 }] }]);
    expect(views[1].digests).toEqual([]);
    expect(views[2].digests[0].buckets).toEqual(views[0].digests[0].buckets);
    expect(JSON.stringify(tracked.watchlists)).not.toContain('SECRET_');
  });

  it('uses the actual traveling checkpoint instead of treating last location and stale witness rumors as permission', () => {
    const { world, observer, companion, hidden, event } = fixture();
    const watched = add(world, observer.id, { kind: 'actor', id: companion.id });
    const site = watched.locations.find(({ id }) => id === hidden.locationId)!;
    watched.tick++;
    watched.pilgrimages.journeys.push({ id: 'travel', organizerId: observer.id, companionId: hidden.id,
      stopIds: ['loc-taixu', 'loc-market', 'loc-market-east'], stopsVisited: [], status: 'active', proposedTick: 1, offerExpiresTick: 5,
      startedTick: 2, expiresTick: watched.tick + 1, legIndex: 0, path: [{ x: 180, y: 150 }, { x: site.x, y: site.y }, { x: 800, y: 440 }],
      pathIndex: 1, spentByEach: 8, aid: [] });
    const phantom = event(watched, 'phantom');
    observer.rumors.push({ id: 'rumor-phantom', subject: 'stale false view', locationId: observer.locationId, originTick: watched.tick,
      learnedTick: watched.tick, provenance: 'witness', confidence: 100, hops: 0, originEventId: phantom.id, originSourceCultivatorId: observer.id });
    captureWatchDigests(watched, [phantom, event(watched, 'actual-checkpoint', { locationId: site.id, category: 'heavenly' })]);
    expect(visibleWatchlists(watched, observer.id)[0].digests[0].buckets).toEqual([{ category: 'heavenly', count: 1 }]);
  });

  it('bounds watches/digests/buckets and keeps immutable watch state, exact read ticks and removals independent across copies', () => {
    const { world, observer, companion, hidden, event } = fixture();
    const watched = add(world, observer.id, { kind: 'actor', id: companion.id });
    const watchId = watched.watchlists.watches[0].id;
    for (let i = 0; i < WATCHLIST_MAX_DIGESTS + 4; i++) {
      watched.tick++;
      captureWatchDigests(watched, i === WATCHLIST_MAX_DIGESTS + 3 ?
        Array.from({ length: WATCHLIST_BUCKET_MAX_COUNT + 10 }, (_, index) => event(watched, `swarm-${index}`)) :
        [event(watched, `normal-${i}`)]);
    }
    expect(watched.watchlists.digests).toHaveLength(WATCHLIST_MAX_DIGESTS);
    expect(watched.watchlists.digests.at(-1)?.buckets).toEqual([{ category: 'combat', count: WATCHLIST_BUCKET_MAX_COUNT }]);
    const fork = structuredClone(watched);
    expect(applyWatchMutation(fork, hidden.id, { kind: 'mark_read', watchId, throughTick: fork.tick })).toMatchObject({ ok: false, code: 'not_found' });
    expect(applyWatchMutation(fork, observer.id, { kind: 'mark_read', watchId, throughTick: 9 })).toMatchObject({ ok: false, code: 'unknown_digest' });
    const read = applyWatchMutation(fork, observer.id, { kind: 'mark_read', watchId, throughTick: fork.tick });
    expect(read.ok).toBe(true);
    expect(visibleWatchlists(read.world, observer.id)[0].unread).toBe(0);
    expect(visibleWatchlists(watched, observer.id)[0].unread).toBe(WATCHLIST_MAX_DIGESTS);
    expect(applyWatchMutation(read.world, observer.id, { kind: 'mark_read', watchId, throughTick: fork.tick }).world).toBe(read.world);
    const deleted = applyWatchMutation(read.world, observer.id, { kind: 'remove_watch', watchId });
    expect(deleted.world.watchlists.digests).toEqual([]);
    expect(read.world.watchlists.digests).toHaveLength(WATCHLIST_MAX_DIGESTS);

    for (const actor of world.cultivators) actor.locationId = observer.locationId;
    const targets = availableWatchTargets(world, observer.id).slice(0, WATCHLIST_MAX_WATCHES + 1);
    const limited = add(world, observer.id, ...targets.slice(0, WATCHLIST_MAX_WATCHES).map(({ target }) => target));
    expect(applyWatchMutation(limited, observer.id, { kind: 'add_watch', target: targets[WATCHLIST_MAX_WATCHES].target }))
      .toMatchObject({ ok: false, code: 'limit' });
  });
});
