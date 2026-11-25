import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BranchFateComparison, BranchFateReading, BranchFateSubjectControls } from '../src/components/BranchFateComparison';
import type { BranchFateResult } from '../src/engine/branchFateComparison';
import type { WorldTimeline } from '../src/engine/timelineEngine';

const authority = vi.hoisted(() => ({ listBranchFateSubjects: vi.fn(), compareBranchFate: vi.fn() }));
vi.mock('../src/engine/branchFateComparison', () => authority);
const noAction = () => { throw new Error('rendering must not change the selection or compare branches'); };

const actualFate = {
  ok: true, subject: { kind: 'actor', name: '苏清寒' }, originTick: 1, throughTick: 20,
  coverage: 'complete', remoteCause: 'unknown',
  firstDifference: { tick: 1, kind: 'bestow', right: { side: 'right', tick: 1, eventId: 'secret-gift-event', kind:'bestow' } },
  consequence: { side: 'right', tick: 2, eventId: 'secret-breakthrough-event', kind: 'realm',
    fromRealm: '金丹', fromStage: 7, toRealm: '金丹', toStage: 8 },
} satisfies BranchFateResult;

describe('narrow subject fate comparison inside the established branch pair', () => {
  it('remains closed, performs no query on initial render, and keeps subject selection explicit and anonymous in the DOM', () => {
    const timeline = {} as WorldTimeline;
    const closed = renderToStaticMarkup(<BranchFateComparison timeline={timeline} leftId="secret-left" rightId="secret-right"
      throughTick={20} viewerId="secret-viewer" scopeKey="secret-view" />);
    expect(closed.match(/<details\b/g)).toHaveLength(1);
    expect(closed).not.toMatch(/<details[^>]*\bopen(?:\s|=|>)|secret-|<select|<button/);
    expect(closed).toContain('同一对象的命运');
    expect(authority.listBranchFateSubjects).not.toHaveBeenCalled();
    expect(authority.compareBranchFate).not.toHaveBeenCalled();
    const options = [{ kind: 'actor', id: 'secret-actor-one', name: '苏清寒' },
      { kind: 'actor', id: 'secret-actor-two', name: '苏清寒' }] as const;
    const html = renderToStaticMarkup(<BranchFateSubjectControls options={options} onSelect={noAction} onReview={noAction} />);
    expect(html).toContain('value="" selected="">请选择');
    expect(html).toContain('value="0">人物 · 苏清寒（条目 1）');
    expect(html).toContain('value="1">人物 · 苏清寒（条目 2）');
    expect(html).toMatch(/<button type="button"[^>]*disabled=""[^>]*>查最早分歧/);
    expect(html).not.toContain('secret-');
  });

  it('separates verified divergence from a later real result without attributing unavailable causes or exposing IDs', () => {
    const html = renderToStaticMarkup(<BranchFateReading result={actualFate} />);
    expect(html).toContain('共同起点第 1 轮；本次核对至第 20 轮');
    expect(html).toContain('最早可证分歧：第 1 轮 · 赐宝');
    expect(html).toContain('该轮没有可呈现的本项凭据，不能据此推认是否发生');
    expect(html).toContain('本支有实际赐宝凭据');
    expect(html).toContain('已核实的后续 · 乙 · 第 2 轮');
    expect(html).toContain('金丹7 重 → 金丹8 重');
    expect(html).toContain('此处列已核实的后续，起因仍待查');
    expect(html).not.toMatch(/secret-|导致|必然/);
    const leadership = renderToStaticMarkup(<BranchFateReading result={{ ...actualFate, consequence: {
      kind:'leader',side:'left',tick:11,eventId:'secret-election-event',previousLeaderId:'secret-prev',leaderId:'secret-new',
    } }} />);
    expect(leadership).toContain('本支有实际掌门继任凭据');
    expect(leadership).not.toContain('secret-');
  });

  it('distinguishes missing scope or first-source gaps from no proved difference in the retained window', () => {
    const unknown = renderToStaticMarkup(<BranchFateReading result={{ ok:false,reason:'subject_unavailable' }} />);
    expect(unknown).toContain('两支未都有可供当前视角核对的对象记录');
    expect(unknown).not.toMatch(/苏清寒|未发现可证的分歧/);
    const gap = renderToStaticMarkup(<BranchFateReading result={{ ok:false,reason:'incomplete_before_difference' }} />);
    expect(gap).toContain('不能认定最早的差别');
    const partial = renderToStaticMarkup(<BranchFateReading result={{ ...actualFate, coverage:'broken_after_difference' }} />);
    expect(partial).toContain('分歧后的留档或可核对凭据不连续');
    expect(partial).not.toContain('只涵盖所选保留快照');
    const none = renderToStaticMarkup(<BranchFateReading result={{ ...actualFate, firstDifference:undefined, consequence:undefined }} />);
    expect(none).toContain('在这些可核对的快照与项目中，未发现可证的分歧');
    expect(none).not.toContain('两支完全一致');
  });
});
