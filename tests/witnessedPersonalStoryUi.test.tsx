import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WitnessedPersonalStory, WitnessedStoryScopeToggle } from '../src/components/WitnessedPersonalStory';
import type { WitnessedPersonalStoryView } from '../src/engine/witnessedPersonalStory';

const story = {
  actorId: 'internal-observer-id', actorName: '顾行舟', scenes: [
    { eventId: 'proof-A', tick: 31, year: 3, month: 7, siteName: '剑池', title: '剑池交手',
      paragraph: '你在现场看见两位修士交手。' },
    { eventId: 'proof-B', tick: 28, year: 3, month: 4, siteName: '青石<台>', title: '一场聚会',
      paragraph: '你在场看见<公开>聚会。' },
  ],
} satisfies WitnessedPersonalStoryView;

describe('witnessed story presentation', () => {
  it('is a single keyboard-native, visibly pressed scope action with a stable accessible name', () => {
    const render = (active: boolean) => renderToStaticMarkup(<WitnessedStoryScopeToggle
      selectedName={story.actorName} active={active} onToggle={() => undefined} />);
    const off = render(false);
    const on = render(true);
    expect(off).toContain('<button type="button" aria-pressed="false"');
    expect(on).toContain('<button type="button" aria-pressed="true"');
    expect(off).toContain('随顾行舟看');
    expect(on).toContain('随顾行舟看');
    expect(on).toMatch(/aria-hidden="true"[^>]*> · 已开启/);
    expect(on.match(/<button/g)).toHaveLength(1);
    expect(on).not.toMatch(/role="tab"|tabindex="-1"/);
  });

  it('puts safe title and supplied perspective ahead of the location and calendar detail', () => {
    const html = renderToStaticMarkup(<WitnessedPersonalStory story={story} />);
    expect(html.match(/<article/g)).toHaveLength(2);
    expect(html.indexOf('剑池交手')).toBeLessThan(html.indexOf('你在现场看见两位修士交手。'));
    expect(html.indexOf('你在现场看见两位修士交手。')).toBeLessThan(html.indexOf('仙历 3年7月'));
    expect(html.indexOf('仙历 3年7月')).toBeLessThan(html.indexOf('一场聚会'));
    expect(html).toContain('青石&lt;台&gt;');
    expect(html).toContain('看见&lt;公开&gt;聚会。');
    expect(html).not.toMatch(/internal-observer-id|proof-A|proof-B|查看对话|这一卷的主线/);
  });

  it('keeps a narrow-authority empty case neutral instead of falling back to public scenes', () => {
    const html = renderToStaticMarkup(<WitnessedPersonalStory story={{ ...story, scenes: [] }} />);
    expect(html).toContain('现存实录里，尚无这位人物亲历或在场所见的可核验片段。');
    expect(html).not.toMatch(/<article|剑池|这一卷的主线/);
  });
});
