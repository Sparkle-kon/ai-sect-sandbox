import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SaveResumeComparison, type SaveResumeComparisonProps } from '../src/components/SaveResumeComparison';
import { createInitialWorld } from '../src/data/initialWorld';
import { createMemorySaveBackend, createSaveStore, type SaveResumeAddress, type SaveResumePairReview } from '../src/engine/storageEngine';

const left: SaveResumeAddress = { slotId: 'left', point: 'current' };
const right: SaveResumeAddress = { slotId: 'right', point: 'current' };
const slots = [{ id: 'left', label: '左端槽' }, { id: 'right', label: '右端槽' }];
const view = (props: Partial<SaveResumeComparisonProps> = {}) => renderToStaticMarkup(<SaveResumeComparison slots={slots}
  onAddress={vi.fn()} onReview={vi.fn()} onChoose={vi.fn()} {...props} />);

describe('explicit two native slots and point choices with no implied winner', () => {
  it('renders one initially closed fold and all two independently blank native keyboard controls', () => {
    const onAddress = vi.fn(), onReview = vi.fn(), onChoose = vi.fn();
    const html = view({ onAddress, onReview, onChoose });
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">对照续局存档/);
    expect(html.match(/<select/g)).toHaveLength(4);
    for (const name of ['甲 · 存档槽', '乙 · 存档槽', '甲 · 版位', '乙 · 版位']) expect(html).toContain(name);
    expect(html.match(/value="" selected=""/g)).toHaveLength(4);
    expect(html.match(/<select[^>]+disabled=""/g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>核验并对照/);
    expect(html).not.toContain('选择甲档续局');
    expect(html).not.toContain('选择乙档续局');
    expect(onAddress).not.toHaveBeenCalled();
    expect(onReview).not.toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
    expect(html).not.toContain('tabindex=');
    expect(view({ left, right: left })).toContain('请选不同的存档点');
    expect(view({ left, right: { ...left, point: 'previous' } })).not.toMatch(/<button[^>]+disabled=""[^>]*>核验并对照/);
  });

  it('uses exact real verified metadata for same-name, same-tick options without loading either', async () => {
    const store = createSaveStore(createMemorySaveBackend(), () => Date.UTC(2026, 2, 4, 0, 0));
    const w = createInitialWorld(115);
    await store.save(left.slotId, '相同的显示名', w, null, { branchId: 'main', label: '同名分支', timelineId: 'timeline-shared' });
    await store.save(right.slotId, '相同的显示名', w, null, { branchId: 'branch-1', label: '同名分支', timelineId: 'timeline-shared' });
    const review = await store.reviewResumePair(left, right);
    const choose = vi.fn();
    const checked = view({ left, right, review, onChoose: choose });
    expect(checked).toContain('已核验同一时间线，但属于不同分支');
    expect(checked).toContain('来源分支：同名分支');
    expect(checked).toContain('<code>branch-1</code>');
    expect(checked).toContain('<code>main</code>');
    expect(checked).toContain('timeline-shared');
    expect(checked).toContain(`存档刻：Tick #${w.tick} · 仙历 ${w.year} 年 ${w.month} 月`);
    expect(checked).toContain('2026-03-04T00:00:00.000Z');
    expect(checked).toContain('出生 Tick #' + w.worldgen!.birthTick);
    expect(checked).toContain('与核验时槽头相同');
    expect(checked).toContain('选择甲档续局');
    expect(checked).toContain('选择乙档续局');
    expect(checked).toContain('再确认替换当前世界');
    expect(choose).not.toHaveBeenCalled();
    if (review.left.status !== 'available') throw new Error('expected a verified candidate');
    expect(checked).not.toContain(review.left.info.selection.seal);
    expect(checked).toContain(review.left.info.selection.revision.slice(-8));
    expect(view({ left, right, review, readOnly: true })).toMatch(/<button[^>]+disabled=""[^>]*>选择甲档续局/);
    expect(view({ left, right: { ...right, point: 'previous' }, review })).not.toContain('已核验的续局对照');
  });

  it('separates genuinely absent, damaged, unsupported, and unverified lineage without fallback selection', async () => {
    const store = createSaveStore(createMemorySaveBackend());
    const legacy = createInitialWorld(115);
    delete legacy.worldgen;
    await store.save(left.slotId, '保留的旧档', legacy, null);
    const review = await store.reviewResumePair(left, right);
    expect(review.right.status).toBe('absent');
    for (const [status, wording] of [
      ['absent', '这里没有存档'], ['damaged', '此版完整性校验失败'], ['unsupported', '当前存档方式无法核对这一版'],
    ] as const) {
      const test = { ...review, right: { status, address: right } } satisfies SaveResumePairReview;
      const output = view({ left, right, review: test });
      expect(output).toContain(wording);
      expect(output).toContain('选择甲档续局');
      expect(output).not.toContain('选择乙档续局');
      expect(output).toContain('此组没有足够证据核验沿革');
    }
    await store.save(right.slotId, '同种同刻的旧档', legacy, null);
    const old = await store.reviewResumePair(left, right);
    const compared = view({ left, right, review: old });
    expect(compared).toContain('种子与已知生成设定未见冲突；尚不足以确认完整来历或同一分支');
    expect(compared).toContain('出生 未记录');
    expect(compared).toContain('来源分支未记录，不可凭同名或同刻推断');
    expect(compared).not.toContain('已核验属于同一时间线');
  });
});
