import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { createTimeline, forkTimeline, readTimelineHead, recordTimelineWorld, selectTimelineBranch } from '../src/engine/timelineEngine';
import { applyWatchMutation, captureWatchDigests, visibleWatchlists } from '../src/engine/watchlistEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldEvent } from '../src/types/world';

function fixture() {
  const original = createInitialWorld(49);
  original.tick = 10; original.month = 6;
  const [observer, traveler] = original.cultivators;
  const site = original.locations.find(({ id }) => id === 'loc-market')!;
  const stamp = applyWatchMutation(original, observer.id, { kind: 'add_watch', target: { kind: 'site', id: site.id } });
  if (!stamp.ok) throw new Error(stamp.code);
  const orders: Record<string, LLMDecisionPayload> = Object.fromEntries(original.cultivators.map(({ id }) =>
    [id, { chosenAction: 'REST', innerMonologue: '本地静候' }]));
  orders[observer.id] = { chosenAction: 'EXPLORE', targetLocationId: site.id, innerMonologue: '抵达实际坊市' };
  orders[traveler.id] = { chosenAction: 'EXPLORE', targetLocationId: site.id, innerMonologue: '同一回合抵达坊市' };
  return { original, world: stamp.world, observer, site, orders };
}

describe('quiet in-game watches follow actual completed turns and branch snapshots', () => {
  it('coalesces actual equivalent Utility/deferred adjudication and keeps read state immutable and branch-local', () => {
    const { original, world, observer, orders } = fixture();
    expect(original.watchlists.watches).toEqual([]);
    expect(world.watchlists.watches).toHaveLength(1);
    const canonical = advanceWorldTick(world, orders, () => .01);
    const real = visibleWatchlists(canonical, observer.id)[0];
    expect(real.unread).toBe(1);
    expect(real.digests).toEqual([{ watchId: real.watch.id, tick: canonical.tick, buckets: [{ category: 'breakthrough', count: 2 }] }]);
    expect(JSON.stringify(real.digests)).not.toContain('机缘');

    let candidateEvents: readonly WorldEvent[] = [];
    const modelDraft = advanceWorldTick(world, orders, () => .01, 'deferred', undefined,
      { onWatchBatch: (events) => { candidateEvents = events; } });
    expect(modelDraft.watchlists.digests).toEqual([]);
    expect(candidateEvents.filter(({ id }) => id.endsWith('-explore'))).toHaveLength(2);
    captureWatchDigests(modelDraft, candidateEvents);
    expect(modelDraft.watchlists.digests).toEqual(canonical.watchlists.digests);
    captureWatchDigests(modelDraft, candidateEvents);
    expect(modelDraft.watchlists.digests).toHaveLength(1);
    expect(decodeWorldSave(encodeWorldSave(canonical)).watchlists).toEqual(canonical.watchlists);

    const read = applyWatchMutation(canonical, observer.id, { kind: 'mark_read', watchId: real.watch.id, throughTick: canonical.tick });
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error(read.code);
    expect(visibleWatchlists(read.world, observer.id)[0].unread).toBe(0);
    expect(visibleWatchlists(canonical, observer.id)[0].unread).toBe(1);

    const tree = createTimeline(world);
    const withActual = recordTimelineWorld(tree, canonical);
    const side = forkTimeline(withActual, world.tick, { type: 'DEMONIC_TIDE' });
    expect(visibleWatchlists(readTimelineHead(side)!, observer.id)[0].digests).toEqual([]);
    const originalLane = selectTimelineBranch(side, tree.activeBranchId);
    expect(visibleWatchlists(readTimelineHead(originalLane)!, observer.id)[0].unread).toBe(1);
  });

  it('migrates old worlds to an empty quiet register and rejects forged duplicate category evidence', () => {
    const { original, world, orders } = fixture();
    const { watchlists: _oldRegister, ...previous } = original;
    expect(decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: previous })).watchlists.watches).toEqual([]);
    const copied = advanceWorldTick(world, orders, () => .01);
    copied.watchlists.digests[0].buckets.push({ ...copied.watchlists.digests[0].buckets[0] });
    expect(() => encodeWorldSave(copied)).toThrow(/watchlists.digests.category/);
  });
});
