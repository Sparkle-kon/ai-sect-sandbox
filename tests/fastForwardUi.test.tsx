import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TimelinePanel } from '../src/components/TimelinePanel';
import type { FastForwardControls } from '../src/components/FastForwardPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { createTimeline, forkTimeline, TIMELINE_MAX_BRANCHES } from '../src/engine/timelineEngine';
import { FAST_FORWARD_MAX_TICKS } from '../src/engine/fastForwardEngine';

const untouched = () => { throw new Error('Rendering may not start, apply or mutate a world'); };
const progress = { startTick: 3, currentTick: 7, requestedTicks: 24, completedTicks: 4,
  living: 519, totalActors: 526, processingMs: 25, maxTickMs: 8, maxChunkMs: 16 };
const control = (phase: FastForwardControls['phase'], overrides: Partial<FastForwardControls> = {}): FastForwardControls =>
  ({ available: true, phase, onStart: untouched, onPause: untouched, onResume: untouched, onStage: untouched,
    onCancel: untouched, onApply: untouched, ...overrides });

function fixture() {
  const world = createInitialWorld();
  const timeline = createTimeline(world);
  const html = (controls?: FastForwardControls, previewTick: number | null = null, branches = timeline) =>
    renderToStaticMarkup(<TimelinePanel timeline={branches} previewTick={previewTick} busy={false} onPreview={untouched}
      onSelectBranch={untouched} onFork={untouched} fastForward={controls}/>);
  return { world, timeline, html };
}

describe('independent fast-forward presentation', () => {
  it('keeps one initially closed inline entry with bounded choices and no worker on render', () => {
    const { world, timeline, html } = fixture();
    expect(html()).not.toContain('长局快进与可取消回放');
    const idle = html(control('idle'));
    expect(idle).toMatch(/<details class="[^"]+"><summary class="[^"]+">长局快进与可取消回放/);
    expect(idle).toContain(`最多 ${FAST_FORWARD_MAX_TICKS} 个月`);
    expect(idle).toContain('不调用模型');
    expect(idle).toContain('原分支不变');
    expect(idle).not.toContain('已完成');
    expect(idle).not.toContain('确认创建并进入新分支');
    expect(html(control('idle', { available: false }))).toMatch(/<button type="submit"[^>]+disabled=""[^>]*>开始独立快进/);
    expect(html(control('idle'), world.tick)).toMatch(/<button type="submit"[^>]+disabled=""[^>]*>开始独立快进/);
    let allBranches = timeline;
    for (let i = 1; i < TIMELINE_MAX_BRANCHES; ++i) {
      allBranches = forkTimeline(allBranches, world.tick, { type: 'SPAWN_TREASURE', targetLocationId: world.locations[0].id });
    }
    const full = html(control('idle'), null, allBranches);
    expect(full).toContain('分支上限已到，暂不能应用新检查点');
    expect(full).toMatch(/<button type="submit"[^>]+disabled=""[^>]*>开始独立快进/);
  });

  it('shows real completed progress and separate pause/stage/cancel from enabled apply', () => {
    const { html } = fixture();
    const running = html(control('running', { progress }));
    expect(running).toContain('已完成 4 / 24 个月 · Tick #3 → #7');
    expect(running).toMatch(/<progress[^>]+max="24"[^>]+value="4"/);
    expect(running).toContain('全部角色记录 526 人');
    expect(running).toContain('暂停快进');
    expect(running).not.toContain('开始独立快进');
    expect(running).not.toContain('准备应用到新分支');
    expect(html(control('pausing', { progress }))).toContain('等待当前一批回合完整结束后暂停');
    const paused = html(control('paused', { progress }));
    expect(paused).toContain('继续快进');
    expect(paused).toContain('核验已完成的检查点');
    expect(paused).toContain('取消并丢弃快进结果');
    expect(html(control('paused', { progress: { ...progress, completedTicks: 0, currentTick: progress.startTick } })))
      .toMatch(/<button[^>]+disabled=""[^>]*>核验已完成的检查点/);
    const ready = html(control('ready', { progress }));
    expect(ready).toContain('检查点已核验，等待确认');
    expect(ready).toContain('准备应用到新分支');
    expect(ready).not.toContain('确认创建并进入新分支');
    expect(html(control('error', { notice: '本地线程已结束' }))).toContain('本次快进未能完成 · 本地线程已结束');
  });
});
