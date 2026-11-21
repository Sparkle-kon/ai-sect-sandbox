import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublicDialogueTranscript } from '../src/components/PublicDialogueTranscript';
import type { PublicDialogueProvenance } from '../src/engine/publicDialogueProvenance';

const common = { eventId: 'internal-event-id', tick: 21, surface: 'event' } as const;
const first = { ordinal: 1, speakerId: 'private-person-a', speakerName: '林岚', text: '<符箓>原句。\n  别录这一停顿。' };
const second = { ordinal: 2, speakerId: 'private-person-b', speakerName: '林岚', text: '保留原话。' };
const verified = {
  ...common, status: 'verified', kind: 'combat', source: 'llm', turns: [second, first], alternateVersion: true,
} satisfies PublicDialogueProvenance;

describe('public evidenced dialogue disclosure', () => {
  it('renders one native closed fold, retaining exact attributed words and their ordinal order', () => {
    const html = renderToStaticMarkup(<PublicDialogueTranscript provenance={verified} />);
    expect(html.match(/<details\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:\s|=|>)/);
    expect(html).toContain('查看对话 · 已核验');
    expect(html).toContain('原事件存录 · 模型演绎');
    expect(html).toContain('此处不混编');
    expect(html).toContain('&lt;符箓&gt;原句。\n  别录这一停顿。');
    expect(html.indexOf('&lt;符箓&gt;原句。')).toBeLessThan(html.indexOf('保留原话。'));
    expect(html.match(/林岚：/g)).toHaveLength(2);
    expect(html).not.toMatch(/private-person-|internal-event-id|离线演绎/);
  });

  it('identifies a chapter fragment and never blends the alternate version back in', () => {
    const fragment = { ...verified, surface: 'chapter', status: 'fragment', source: 'utility', turns: [second] } as const;
    const html = renderToStaticMarkup(<PublicDialogueTranscript provenance={fragment} />);
    expect(html).toContain('查看对话 · 仅存片段');
    expect(html).toContain('本章存录 · 离线演绎');
    expect(html).toContain('仅列尚可核验的原句，不补录缺失对白。');
    expect(html).toContain('保留原话。');
    expect(html).not.toMatch(/模型演绎|原句。\n|private-person-/);
  });

  it.each([
    ['unresolved', '归属待核'],
    ['conflict', '记录相冲突'],
  ] as const)('does not print any metadata, name, or quote for %s', (status, label) => {
    const html = renderToStaticMarkup(<PublicDialogueTranscript provenance={{ ...common, status }} />);
    expect(html).toContain(`查看对话 · ${label}`);
    expect(html).toContain('不引原话，也不署名。');
    expect(html).not.toMatch(/internal-event-id|<ol|<li|林岚|保留原话|演绎|斗法交锋/);
  });

  it('does not leave any placeholder when the provenance is private or unavailable', () => {
    expect(renderToStaticMarkup(<PublicDialogueTranscript />)).toBe('');
  });
});
