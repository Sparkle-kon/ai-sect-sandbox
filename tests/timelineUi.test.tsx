import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TimelinePanel, buildBranchIntervention } from '../src/components/TimelinePanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { createTimeline, forkTimeline, recordTimelineWorld, TIMELINE_MAX_BRANCHES } from '../src/engine/timelineEngine';
import type { WorldTimeline } from '../src/engine/timelineEngine';

const unexpected = () => { throw new Error('Rendering the timeline must not change the world'); };

const render = (timeline: WorldTimeline, previewTick: number | null, busy = false, notice?: string) =>
  renderToStaticMarkup(<TimelinePanel timeline={timeline} previewTick={previewTick} busy={busy} notice={notice}
    onPreview={unexpected} onSelectBranch={unexpected} onFork={unexpected} />);

describe('historical timeline UI', () => {
  it('shows live controls by default and read-only details for the exact chosen tick', () => {
    const first = createInitialWorld(21);
    const after = { ...first, tick: first.tick + 1, month: 2 };
    const timeline = recordTimelineWorld(createTimeline(first), after);
    const live = render(timeline, null);
    expect(live).toContain('原始时间线 · 实时状态');
    expect(live).toContain('最早 Tick #1');
    expect(live).toContain('最新 Tick #2');
    expect(live).toContain('查看最新快照');
    expect(live).not.toContain('历史分支干预');

    const past = render(timeline, 1);
    expect(past).toContain('历史只读：原始时间线 · Tick #1');
    expect(past).toContain('aria-valuetext="Tick #1"');
    expect(past).toContain('此刻的有效对象');
    expect(past).toContain(first.locations[0].name);
    expect(past).toContain('准备创建分支');
    expect(past).not.toContain('确认并进入新分支');
    expect(render(timeline, 9)).toContain('所选快照已不在保存窗口');
  });

  it('makes lineage and branch caps visible without dropping the original', () => {
    const world = createInitialWorld();
    let timeline = createTimeline(world);
    for (let i = 1; i < TIMELINE_MAX_BRANCHES; i++) {
      timeline = forkTimeline(timeline, world.tick, { type: 'SPAWN_TREASURE', targetLocationId: world.locations[0].id });
    }
    const html = render(timeline, world.tick, false, '操作状态');
    expect(html).toContain('分支 4/4（含原线）');
    expect(html).toContain('原始时间线');
    expect(html).toContain('从「支线 2」的 Tick #1 分出');
    expect(html).toContain('分支上限已到，仍可查看或切换已有分支');
    expect(html).toContain('操作状态');
    expect(html).toMatch(/<button type="submit"[^>]*disabled=""/);
  });

  it('builds only exact legal typed commands for the previewed snapshot', () => {
    const world = createInitialWorld();
    const [alive, dead] = world.cultivators;
    dead.alive = false;
    expect(buildBranchIntervention(world, 'TRIBULATION_STRIKE', alive.id)).toEqual({ type: 'TRIBULATION_STRIKE', targetCultivatorId: alive.id });
    expect(buildBranchIntervention(world, 'TRIBULATION_STRIKE', dead.id)).toBeUndefined();
    expect(buildBranchIntervention(world, 'SPAWN_TREASURE', 'forged-target')).toBeUndefined();
    expect(buildBranchIntervention(world, 'SPAWN_TREASURE', world.locations[0].id)).toEqual({ type: 'SPAWN_TREASURE', targetLocationId: world.locations[0].id });
    expect(buildBranchIntervention(world, 'DEMONIC_TIDE', 'unused')).toEqual({ type: 'DEMONIC_TIDE' });
    for (const actor of world.cultivators) actor.alive = false;
    expect(buildBranchIntervention(world, 'DEMONIC_TIDE', '')).toBeUndefined();
  });
});
