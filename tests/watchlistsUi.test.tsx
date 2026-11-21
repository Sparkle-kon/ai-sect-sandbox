import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { getWatchTargetPage, WatchlistsPanel } from '../src/components/WatchlistsPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableWatchTargets } from '../src/engine/watchlistEngine';

function fixture() {
  const world = createInitialWorld();
  world.tick = 10;
  const [viewer, outsider] = world.cultivators;
  const [local] = world.locations;
  viewer.locationId = local.id;
  world.watchlists = {
    nextId: 3,
    watches: [
      { id: 'mine', observerId: viewer.id, label: '已经关注的修士', target: { kind: 'actor', id: viewer.id }, createdTick: 2, readThroughTick: 6 },
      { id: 'other', observerId: outsider.id, label: '另一个观察者的私密名称', target: { kind: 'actor', id: outsider.id }, createdTick: 2, readThroughTick: 5 },
    ],
    digests: [
      { watchId: 'mine', tick: 6, buckets: [{ category: 'heavenly', count: 999 }] },
      { watchId: 'mine', tick: 9, buckets: [{ category: 'combat', count: 3 }, { category: 'breakthrough', count: 2 }] },
      { watchId: 'other', tick: 8, buckets: [{ category: 'death', count: 13 }] },
    ],
  };
  const onWrite = vi.fn(async () => 'saved' as const);
  const html = (readOnly = false, busy = false, branchId = 'main') => renderToStaticMarkup(
    <WatchlistsPanel world={world} actorId={viewer.id} branchId={branchId} readOnly={readOnly} busy={busy} onWrite={onWrite} />);
  return { world, viewer, outsider, onWrite, html };
}

describe('quiet opt-in grouped records in the existing branch notebook', () => {
  it('renders one default closed drawer and only scoped branch/viewer summaries with explicit read action', () => {
    const { html, onWrite } = fixture();
    const markup = html();
    expect(markup).toMatch(/<details class="[^"]+"><summary class="[^"]+">静默关注与推演摘要/);
    expect(markup).toContain('不会发送消息、提醒或推送');
    expect(markup).toContain('人物 · 已经关注的修士 · 未读 1 轮');
    expect(markup).toContain('Tick #6（已读） · 异象 999+ 件');
    expect(markup).toContain('Tick #9（未读） · 斗法 3 件 · 破境 2 件');
    expect(markup).toContain('截至 Tick #9 均标记已读');
    expect(markup).not.toContain('另一个观察者的私密名称');
    expect(markup).not.toContain('陨落 13 件');
    expect(onWrite).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(<App />)).not.toContain('静默关注与推演摘要');
  });

  it('does not mount editing controls in historical read-only or execute writes while rendering', () => {
    const { world, html, onWrite } = fixture();
    expect(html(true, false, 'other-branch')).toContain('历史只读');
    expect(html(true)).toContain('Tick #9（未读）');
    for (const control of ['添加关注', '移除关注', '均标记已读', '搜索可关注目标']) expect(html(true)).not.toContain(control);
    expect(html(false, true)).toMatch(/<button[^>]*disabled=""[^>]*>移除关注/);
    expect(onWrite).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(<WatchlistsPanel world={world} actorId={null} branchId="main" readOnly={false} busy={false} onWrite={onWrite} />)).toBe('');
  });

  it('paginates only allowed names and searches the final target without mounting the full roster', () => {
    const { world, viewer } = fixture();
    const seed = world.cultivators[0];
    world.cultivators.push(...Array.from({ length: 526 }, (_, index) => ({
      ...seed, id: `watch-target-${index}`, name: `可见修士${index}`, locationId: viewer.locationId,
    })));
    const remote = world.locations.find(({ x, y }) => Math.hypot(x - world.locations[0].x, y - world.locations[0].y) > 400)!;
    world.cultivators.push({ ...seed, id: 'hidden-watch-target', name: '无权发现的远方修士', locationId: remote.id });
    const targets = availableWatchTargets(world, viewer.id);
    const first = getWatchTargetPage(targets, 'actor', '', 0);
    expect(first.rows).toHaveLength(8);
    expect(first.count).toBeGreaterThanOrEqual(526);
    expect(getWatchTargetPage(targets, 'actor', '可见修士５２５', 0).rows[0]?.target.id).toBe('watch-target-525');
    expect(getWatchTargetPage(targets, 'actor', '无权发现的远方修士', 0).rows).toEqual([]);
  });
});
