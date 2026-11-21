import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChronicleFeed, reopenChronicleProofs, type ChronicleFeedReturn } from '../src/components/ChronicleFeed';
import type { ChronicleLead } from '../src/engine/chronicleLead';
import type { WorldEvent } from '../src/types/world';

const event = (id: string, tick: number, overrides: Partial<WorldEvent> = {}): WorldEvent => ({
  id, tick, year: 1001, month: tick, title: '未改写纪事', description: '原始实录内容。',
  actorIds: ['genuine-lead'], category: 'combat', ...overrides,
});

describe('scene-first public chronicle', () => {
  it('puts faithfully restated scene ahead of date, raw fact and verified links in collapsed proof', () => {
    const fact = event('fact-for-map', 3, { title: '惊天斗法：顾行舟激战李阿七',
      description: '顾行舟于【藏剑峰】向李阿七悍然出手！一番激斗后，顾行舟占据上风，李阿七受创（-19 HP）化作血光遁走。' });
    const html = renderToStaticMarkup(<ChronicleFeed events={[fact]} onJump={() => undefined}
      focusOptions={() => ({ withheld: false, links: [{ eventId: fact.id, kind: 'site', targetId: 'site', label: '藏剑峰' }] })} />);
    const [scene, proof] = html.split('<details');
    expect(scene).toContain('山河见闻');
    expect(scene).toContain('李阿七负伤遁走');
    expect(scene).toContain('失去19点气血的李阿七');
    expect(scene).not.toMatch(/仙历|Tick|惊天斗法：|data-chronicle-focus/);
    expect(proof).toContain('实录与线索');
    expect(proof).toContain('仙历 1001年3月 · Tick #3');
    expect(proof).toContain(fact.title);
    expect(proof).toContain(fact.description);
    expect(proof).toContain('地图：藏剑峰');
    expect(proof).not.toMatch(/^[^>]*\bopen(?:\s|=|>)/);
  });

  it('keeps one thread only with distinct matching public proofs, and leaves other stories in original order', () => {
    const first = event('first-authorized', 3, { title: '顾行舟初试剑', description: '一剑初成。' });
    const last = event('last-authorized', 5, { title: '顾行舟破障归来', category: 'breakthrough', description: '他过了此关。' });
    const other = event('unrelated', 6, { title: '旁人的另一桩事', actorIds: ['different-person'] });
    const privateOnly = event('unreadable-private', 5, { witnessScope: 'participants', title: '秘传文本不入正文' });
    const mismatch = event('another-same-name', 4, { actorIds: ['other-same-display-name'], title: '同名顾行舟的另一场' });
    const lead: ChronicleLead = { actorId: 'genuine-lead', name: '顾行舟', firstTick: 3, lastTick: 5,
      eventIds: [first.id, first.id, privateOnly.id, mismatch.id, last.id] };
    const html = renderToStaticMarkup(<ChronicleFeed events={[other, last, mismatch, first, privateOnly]} lead={lead} />);
    expect(html.match(/aria-label="这一卷的主线"/g)).toHaveLength(1);
    expect(html).toContain('从〈顾行舟初试剑〉读到〈顾行舟破障归来〉');
    const headlines = html.match(/<h4[^>]*>[^<]+<\/h4>/g)?.join(' ') ?? '';
    expect(headlines).toMatch(/旁人的另一桩事.*顾行舟破障归来.*同名顾行舟的另一场.*顾行舟初试剑/);
    expect(html).not.toMatch(/秘传文本不入正文|genuine-lead|first-authorized/);
    expect(renderToStaticMarkup(<ChronicleFeed events={[other, last, mismatch, first]} lead={lead} category="combat" />))
      .not.toMatch(/这一卷的主线|顾行舟破障归来/);
    expect(renderToStaticMarkup(<ChronicleFeed events={[first, privateOnly, mismatch]} lead={lead} />)).not.toContain('这一卷的主线');
  });

  it('restores only prior proof identities and semantic nested sections, not a substitute fold', () => {
    const knownDialogue = { open: false };
    const knownCause = { open: false };
    const unrelated = { open: false };
    const proof = { open: false, querySelector: vi.fn((selector: string) =>
      selector === '[data-chronicle-dialogue] details' ? knownDialogue : selector === '[data-chronicle-cause]' ? knownCause : null) };
    const missingType = { open: false, querySelector: () => null };
    const position: ChronicleFeedReturn = { token: 4, request: { eventId: 'fact', kind: 'site', targetId: 'site' },
      listScrollTop: 25, pageScrollY: 120, openProofs: [{ eventId: 'fact', sections: ['record', 'dialogue'] },
        { eventId: 'filtered-out', sections: ['record', 'cause'] }, { eventId: 'removed-type', sections: ['record', 'cause'] }] };
    const proofs = new Map([
      ['fact', proof], ['unrelated', unrelated], ['removed-type', missingType],
    ]) as unknown as ReadonlyMap<string, HTMLDetailsElement>;
    reopenChronicleProofs(proofs, position);
    expect(proof.open).toBe(true);
    expect(knownDialogue.open).toBe(true);
    expect(knownCause.open).toBe(false);
    expect(unrelated.open).toBe(false);
    expect(missingType.open).toBe(true);
  });
});
