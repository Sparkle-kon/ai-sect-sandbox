import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChapterTurningPoints } from '../src/components/ChapterTurningPoints';
import { projectChapterTurningPoints } from '../src/engine/chronicleTurningPoints';
import { marketTurningChapter, politicalTurningChapter, turningPerson } from './fixtures/chapterTurningPointsFixture';

describe('one closed read-only chapter turning-point summary grounded in typed proof', () => {
  it('opens the prose in place with ordinary participants and shows later verified consequence and source order separately', () => {
    const f = marketTurningChapter();
    const before = JSON.stringify(f.chapter);
    const result = projectChapterTurningPoints(f.world, f.chapter.id, f.viewerId);
    expect(result.arcs).toHaveLength(1);
    const markup = renderToStaticMarkup(<ChapterTurningPoints arcs={result.arcs} />);
    expect(markup).toMatch(/<details class="[^"]+"><summary class="[^"]+">有据转折/);
    expect(markup).toContain('在万仙坊市，卖家挂出货物');
    expect(markup.indexOf('在万仙坊市，卖家挂出货物')).toBeLessThan(markup.indexOf('实录所证的后果：货物已在本地交割'));
    expect(markup.indexOf('实录所证的后果')).toBeLessThan(markup.indexOf('已核验的事实关系'));
    expect(markup).toContain('后续实际撮合此买单');
    expect(markup).toContain('后续实际撮合此卖单');
    expect(markup).toContain('同一轮内有先后');
    expect(markup).not.toMatch(/仙历|纪元|<button|<a /);
    for (const hidden of [f.sourceIds.isolated, f.sourceIds.buy, f.viewerId, f.west]) expect(markup).not.toContain(hidden);
    expect(JSON.stringify(f.chapter)).toBe(before);
  });

  it('preserves actual later shipment while withholding the arc when any linked geography is no longer authorized', () => {
    const f = marketTurningChapter(true);
    const known = projectChapterTurningPoints(f.world, f.chapter.id, f.viewerId);
    const markup = renderToStaticMarkup(<ChapterTurningPoints arcs={known.arcs} />);
    expect(markup).toContain('实录所证的后果：商队到货并已交割');
    expect(markup).toContain('后续结算了这支实际商队');
    expect(markup).toMatch(/第 [0-9]+ 轮 → 第 [0-9]+ 轮/);

    const viewer = turningPerson(f.world, f.viewerId);
    viewer.realm = '练气';
    viewer.exploredTileIds = f.world.terrain.tiles.map(({ id }) => id);
    const clipped = projectChapterTurningPoints(f.world, f.chapter.id, f.viewerId);
    expect(renderToStaticMarkup(<ChapterTurningPoints arcs={clipped.arcs} />)).toBe('');
  });

  it('never displays a stand-alone terminal settlement or detached event as part of the proof', () => {
    const f = politicalTurningChapter();
    const actual = projectChapterTurningPoints(f.world, f.chapter.id, f.viewerId);
    const [single] = actual.arcs;
    const hidden = { ...single.scenes[0], eventId: 'unlinked-private-looking-id', title: '独立见闻不得串入', paragraph: '凭空的前情' };
    const intact = renderToStaticMarkup(<ChapterTurningPoints arcs={[{ ...single, scenes: [hidden, ...single.scenes] }]} />);
    expect(intact).toContain('选举实际填补掌门空位');
    expect(intact).not.toMatch(/独立见闻不得串入|凭空的前情|unlinked-private-looking-id/);
    for (const arc of [
      { ...single, links: [] }, { ...single, consequenceEventId: 'missing-checked-proof' },
      { ...single, links: [{ ...single.links[0], sameTurn: !single.links[0].sameTurn }] },
    ]) expect(renderToStaticMarkup(<ChapterTurningPoints arcs={[arc]} />)).toBe('');
  });
});
