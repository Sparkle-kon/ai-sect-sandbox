import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BranchComparisonPanel, BranchComparisonReading, chooseAlignedComparisonTick } from '../src/components/BranchComparisonPanel';
import { TimelinePanel } from '../src/components/TimelinePanel';
import * as compare from '../src/engine/branchComparisonEngine';
import { recordCausalChronicleNode } from '../src/engine/chronicleCausalityEngine';
import { createTimeline, forkTimeline, readTimelineHead, recordTimelineWorld } from '../src/engine/timelineEngine';
import { createInitialWorld } from '../src/data/initialWorld';
import type { WorldEvent } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(62);
  const [viewer] = world.cultivators;
  const market = world.locations.find(({ type }) => type === 'market')!;
  viewer.locationId = market.id;
  const emit = (source: typeof world, id: string): WorldEvent => ({
    id, tick: source.tick, year: source.year, month: source.month, title: '可核实的公开坊市实录',
    description: '供分界测试', category: 'diplomacy', actorIds: [viewer.id], locationId: market.id,
  });
  const bought = emit(world, 'raw-prior-market-id');
  recordCausalChronicleNode(world, bought, { kind: 'market_buy_order', entityId: 'internal-earlier-order-id' });
  world.events.push(bought);
  const initial = createTimeline(world);
  world.tick = 4;
  const active = recordTimelineWorld(initial, world);
  const fork = forkTimeline(active, 4, { type: 'SPAWN_TREASURE', targetLocationId: market.id }, '对照的乙线');
  const branch = readTimelineHead(fork)!;
  const real = emit(branch, 'raw-settlement-signal');
  recordCausalChronicleNode(branch, real, { kind: 'market_settlement', entityId: 'internal-market-receipt', outcome: 'local_fill',
    predecessors: [{ relation: 'matched_buy_order', eventId: bought.id }] });
  branch.events.push(real, { ...real, id: 'secret-participants-id', witnessScope: 'participants', title: '不公开私条' });
  branch.cultivators[1].alive = false;
  branch.cultivators[1].hp = 0;
  const timeline = recordTimelineWorld(fork, branch);
  return { initial, timeline, viewerId: viewer.id };
}

describe('read-only same-turn branch comparison presentation', () => {
  it('adds only a closed secondary fold for at least two branches and makes no projection while closed', () => {
    const { initial, timeline, viewerId } = fixture();
    const enumerate = vi.spyOn(compare, 'listAlignedBranchTicks');
    const query = vi.spyOn(compare, 'compareAlignedBranches');
    expect(renderToStaticMarkup(<BranchComparisonPanel timeline={initial} />)).toBe('');
    const onPreview = vi.fn(), onSelectBranch = vi.fn(), onFork = vi.fn();
    const html = renderToStaticMarkup(<TimelinePanel timeline={timeline} previewTick={null} busy={false}
      onPreview={onPreview} onSelectBranch={onSelectBranch} onFork={onFork} comparisonViewerId={viewerId} comparisonScopeKey="view" />);
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">对照同一轮<\/summary><\/details>/);
    expect(html).not.toMatch(/共同保留的轮次|对照此轮|同轮分支对照结果/);
    expect(enumerate).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(onPreview).not.toHaveBeenCalled();
    expect(onSelectBranch).not.toHaveBeenCalled();
    expect(onFork).not.toHaveBeenCalled();
    enumerate.mockRestore();
    query.mockRestore();
  });

  it('only offers an exact shared time and never falls back after the requested time expires', () => {
    const { timeline } = fixture();
    const shared = compare.listAlignedBranchTicks(timeline, 'main', timeline.activeBranchId);
    expect(shared).toEqual([1, 4]);
    expect(chooseAlignedComparisonTick(shared, undefined, 1)).toBe(1);
    expect(chooseAlignedComparisonTick(shared, undefined, 3)).toBe(4);
    expect(chooseAlignedComparisonTick(shared, 1, 4)).toBe(1);
    expect(chooseAlignedComparisonTick(shared, 3, 4)).toBeUndefined();
    expect(chooseAlignedComparisonTick([], undefined, 4)).toBeUndefined();
    const lost = compare.compareAlignedBranches(timeline, 'main', timeline.activeBranchId, 3);
    const html = renderToStaticMarkup(<BranchComparisonReading result={lost} />);
    expect(html).toContain('两条分支都不保留这一轮。 未用相邻轮次填补。');
    expect(html).not.toContain('乙减甲');
  });

  it('renders actual same-tick numeric differences and independently scoped receipts, not causality from a difference', () => {
    const { timeline, viewerId } = fixture();
    const before = JSON.stringify(timeline);
    const result = compare.compareAlignedBranches(timeline, 'main', timeline.activeBranchId, 4, viewerId);
    const text = renderToStaticMarkup(<BranchComparisonReading result={result} />);
    expect(text).toContain('对照第 4 轮的两个实际快照。');
    expect(text).toContain('在世人数');
    expect(text).toContain('乙减甲 -1');
    expect(text).toContain('乙减甲 +1');
    expect(text).toContain('数量差不证明哪条事件造成了变化。');
    expect(text).toContain('其中未保留：第 2 至 3 轮。');
    expect(text).toContain('不等于没有发生事件。');
    const left = text.split('aria-label="甲的独立证据"')[1]?.split('</section>')[0];
    const right = text.split('aria-label="乙的独立证据"')[1]?.split('</section>')[0];
    expect(left).not.toContain('当场交割');
    expect(right).toContain('交易结算 · 第 4 轮 · 当场交割');
    expect(right).toContain('前因：实际撮合买单');
    expect(right).toContain('挂出买单 · 第 1 轮');
    expect(text).not.toMatch(/不公开私条|raw-prior|raw-settlement|internal-market|secret-participants/);
    expect(JSON.stringify(timeline)).toBe(before);
  });
});
