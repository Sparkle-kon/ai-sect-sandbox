import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EraHistoryPanel, EraHistoryReceipts, type EraHistoryOption } from '../src/components/EraHistoryPanel';
import type { EraHistoryView } from '../src/engine/eraHistoryIndex';

const query = { kind: 'actor', id: 'secret-actor-id' } as const;
const options = [
  { query, label: '顾行舟（门内）' },
  { query: { kind: 'actor', id: 'secret-other-actor-id' }, label: '顾行舟（散修）' },
] satisfies EraHistoryOption[];
const common = { eventId: 'secret-event-id', tick: 829, year: 1070, month: 1 };

describe('era history portal', () => {
  it('is a single native default-closed archival subsection and does not query until a user acts', () => {
    const read = vi.fn(() => []);
    const html = renderToStaticMarkup(<EraHistoryPanel scopeKey="secret-branch-scope" options={options} read={read} />);
    expect(html.match(/<details\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:\s|=|>)/);
    expect(html).toContain('查阅年代旧事');
    expect(html).toContain('value="" selected="">请选择');
    expect(html).toContain('value="0">人物 · 顾行舟（门内）');
    expect(html).toContain('value="1">人物 · 顾行舟（散修）');
    expect(html).not.toMatch(/secret-|<button|role="tab"/);
    expect(read).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(<EraHistoryPanel scopeKey="other-branch" options={[]} read={read} />)).toBe('');
  });

  it('distinguishes original, archival copy, native proof and lost original without reproducing private story data', () => {
    const sources = ['live_event', 'public_archive', 'native_receipt', 'source_lost'] as const;
    const rows = sources.map((source, index) => ({ source, receipt: {
      ...common, eventId: `secret-event-${index}`, kind: 'death', actorId: query.id,
    } })) satisfies EraHistoryView[];
    const html = renderToStaticMarkup(<EraHistoryReceipts rows={rows} query={query} />);
    expect(html).toContain('原始纪事尚存');
    expect(html).toContain('公开卷册仍有留本');
    expect(html).toContain('仍有原生凭据');
    expect(html).toContain('原件已不可查，仅存当时登记的索引');
    expect(html.match(/仙历 1070 年 1 月 · 第 829 轮/g)).toHaveLength(4);
    expect(html).not.toMatch(/secret-|<button|查看对话/);
  });

  it('presents local migration direction without a counterpart and never implies nothing happened in an empty branch projection', () => {
    const settlement = { kind: 'settlement', id: 'private-subject-site' } as const;
    const row = { source: 'native_receipt', receipt: { ...common, kind: 'migration', recordId: 'private-record-id',
      fromSettlementId: 'private-counterpart', toSettlementId: settlement.id, people: 8 } } satisfies EraHistoryView;
    expect(renderToStaticMarkup(<EraHistoryReceipts rows={[row]} query={settlement} />)).toContain('记载村民迁入 · 8 人');
    expect(renderToStaticMarkup(<EraHistoryReceipts rows={[row]} query={settlement} />)).not.toContain('private-');
    expect(renderToStaticMarkup(<EraHistoryReceipts rows={[]} query={settlement} />)).toContain('本分支现存的可查凭据');
  });
});
