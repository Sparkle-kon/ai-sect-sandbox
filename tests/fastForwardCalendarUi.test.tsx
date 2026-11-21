import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FastForwardPanel, sameFastForwardBinding, type FastForwardControls, type FastForwardPreflightBinding } from '../src/components/FastForwardPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { createTimeline } from '../src/engine/timelineEngine';

function fixture() {
  const world = createInitialWorld(101);
  world.year = 1014;
  world.month = 12;
  const timeline = createTimeline(world);
  const head = timeline.branches[0].snapshots[0];
  const onStart = vi.fn();
  const controls: FastForwardControls = {
    available: true, phase: 'idle', capacitySource: { world, contextVersion: 0, scopeKey: 'live' },
    onStart, onPause: vi.fn(), onResume: vi.fn(), onStage: vi.fn(), onCancel: vi.fn(), onApply: vi.fn(),
  };
  const render = (mods: Partial<FastForwardControls> = {}) =>
    renderToStaticMarkup(<FastForwardPanel controls={{ ...controls, ...mods }} timeline={timeline} blocked={false} branchLimit={false} />);
  return { world, timeline, head, controls, render, onStart };
}

describe('one existing fast-forward calendar entry', () => {
  it('labels both native date fields and forecasts from the actual branch without starting', () => {
    const { render, onStart } = fixture();
    const html = render();
    expect(html).toContain('目标仙历');
    expect(html).toContain('当前分支：仙历 1014 年 12 月');
    expect(html).toContain('预计推演 12 个月，抵达仙历 1015 年 12 月');
    expect(html.match(/<input[^>]*inputMode="numeric"/g)).toHaveLength(2);
    expect(html).not.toMatch(/推演月数|<select/);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('binds both numeric fields and blocks same-tick conflicting live dates', () => {
    const { world, timeline, head, controls, render } = fixture();
    const a: FastForwardPreflightBinding = { world, timeline, branchId: timeline.activeBranchId, head, count: 12,
      target: { year: 1015, month: 12 } };
    expect(sameFastForwardBinding(a, { ...a, target: { ...a.target! } })).toBe(true);
    expect(sameFastForwardBinding(a, { ...a, target: { year: 1016, month: 12 } })).toBe(false);
    expect(sameFastForwardBinding(a, { ...a, target: { year: 1015, month: 11 } })).toBe(false);
    expect(sameFastForwardBinding(a, { ...a, target: undefined })).toBe(false);
    const mismatch = render({ capacitySource: { ...controls.capacitySource!, world: { ...world, month: 11 } } });
    expect(mismatch).toContain('实时状态与分支最新记录的轮次或日期不一致');
    expect(mismatch).toMatch(/<button type="button"[^>]+disabled=""[^>]*>预检文件与快照/);
  });

  it('shows actual month advancement across New Year without removing cancel or applying anything', () => {
    const { world, render } = fixture();
    const html = render({ phase: 'running', progress: { startTick: world.tick, currentTick: world.tick + 1,
      requestedTicks: 3, completedTicks: 1, living: 48, totalActors: 48, processingMs: 1, maxTickMs: 1, maxChunkMs: 1 } });
    expect(html).toContain('已完成 1 / 3 个月');
    expect(html).toContain('副本已到仙历 1015 年 1 月 · 本批目标仙历 1015 年 3 月');
    expect(html).toContain('取消并丢弃快进结果');
    expect(html).not.toContain('确认创建并进入新分支');
  });
});
