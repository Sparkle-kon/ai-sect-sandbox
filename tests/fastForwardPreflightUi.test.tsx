import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createTimeline, forkTimeline, recordTimelineWorld } from '../src/engine/timelineEngine';
import { FastForwardPanel, sameFastForwardBinding } from '../src/components/FastForwardPanel';
import type { FastForwardControls, FastForwardPreflightBinding } from '../src/components/FastForwardPanel';

function fixture() {
  const world = createInitialWorld(639);
  const timeline = createTimeline(world);
  const head = timeline.branches[0].snapshots[0];
  const source = {world,contextVersion:5,scopeKey:'live'};
  const binding: FastForwardPreflightBinding = {...source,timeline,branchId:'main',head,count:12};
  const onStart = vi.fn();
  const controls: FastForwardControls = {available:true,phase:'idle',capacitySource:source,onStart,
    onPause:vi.fn(),onResume:vi.fn(),onStage:vi.fn(),onCancel:vi.fn(),onApply:vi.fn()};
  return {world,timeline,head,binding,controls,onStart};
}

describe('explicit live-worker preflight', () => {
  it('requires a separate manual local preview before the visible start control', () => {
    const { timeline, controls, onStart } = fixture();
    const html = renderToStaticMarkup(<FastForwardPanel controls={controls} timeline={timeline} blocked={false} branchLimit={false}/>);
    expect(html).toMatch(/<button type="button"(?:(?! disabled=)[^>])*?>预检文件与快照/);
    expect(html).toMatch(/<button type="submit"[^>]+disabled=""[^>]*>开始独立快进/);
    expect(html).not.toContain('正在本机读取');
    expect(onStart).not.toHaveBeenCalled();
    const historical = renderToStaticMarkup(<FastForwardPanel controls={controls} timeline={timeline} blocked branchLimit={false}/>);
    expect(historical).toMatch(/<button type="button"[^>]+disabled=""[^>]*>预检文件与快照/);
  });

  it('invalidates even a same-tick source mutation or folded-branch change, not only a date change', () => {
    const { world, timeline, binding } = fixture();
    expect(sameFastForwardBinding(binding,{...binding})).toBe(true);
    expect(sameFastForwardBinding(binding,{...binding,count:24})).toBe(false);
    expect(sameFastForwardBinding(binding,{...binding,contextVersion:6})).toBe(false);
    expect(sameFastForwardBinding(binding,{...binding,scopeKey:'history'})).toBe(false);
    expect(sameFastForwardBinding(binding,{...binding,world:structuredClone(world)})).toBe(false);
    const changed = recordTimelineWorld(timeline,structuredClone(world));
    expect(changed.branches[0].snapshots[0].tick).toBe(binding.head.tick);
    expect(sameFastForwardBinding(binding,{...binding,head:changed.branches[0].snapshots[0],timeline:changed})).toBe(false);
    const branch = forkTimeline(timeline,world.tick,{type:'SPAWN_TREASURE',targetLocationId:world.locations[0].id});
    expect(sameFastForwardBinding(binding,{...binding,branchId:branch.activeBranchId,timeline:branch})).toBe(false);
    expect(sameFastForwardBinding(binding)).toBe(false);
  });
});
