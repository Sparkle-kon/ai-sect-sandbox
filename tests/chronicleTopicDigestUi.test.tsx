import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChronicleDigestPage, ChronicleTopicDigest } from '../src/components/ChronicleTopicDigest';
import { createInitialWorld } from '../src/data/initialWorld';
import * as digest from '../src/engine/chronicleDigest';
import type { ChronicleDigestEntry } from '../src/engine/chronicleDigest';
import { archiveChronicleEvents, availableChronicleChapter, resolveChronicleChapter } from '../src/engine/novelGenerator';

const noAction = () => undefined;
const row = (n: number): ChronicleDigestEntry => ({
  id: `internal-entry-${n}`, topic: 'market', group: '当场成交', tick: n, title: `独立场景口号 ${n}`,
  paragraph: `当场交割了第 ${n} 批已验证货物。`,
  proof: {
    label: '真狭坊市收据', sourceId: `internal-proof-${n}`, original: `仅第 ${n} 条实录带的原文。`,
    fields: [{ label: '结算', value: `实收 ${n} 份` }],
    earlier: [{ id: 'never-show-the-earlier-id', tick: n - 1, label: '先前买单', relation: '撮合买单' }],
    interpretations: [
      { id: 'never-show-the-retelling-id', tick: n, label: '未核实的独立传本', reading: '原传本提出相反说法' },
      { id: 'never-show-the-correction-id', tick: n + 1, label: '另附已核定的勘误', reading: '核定结果另立，不替换原文' },
    ],
  },
});

function actualChapter() {
  const world = createInitialWorld(44);
  const [viewer] = world.cultivators;
  world.tick = 6;
  const fact = { id: 'proof-of-actual-breakthrough', tick: 6, year: 1001, month: 6, category: 'breakthrough' as const,
    actorIds: [viewer.id], title: `${viewer.name}突破至练气3层`,
    description: `在【藏剑峰】，${viewer.name}突破瓶颈，修为精进至【练气3层】！` };
  world.events.push(fact);
  archiveChronicleEvents(world, [fact]);
  world.tick = 7;
  resolveChronicleChapter(world, availableChronicleChapter(world, true)!);
  return { world, viewer, fact };
}

describe('on-demand topic stories inside the existing library', () => {
  it('does not query or build a digest behind the default native fold, regardless of scope', () => {
    const spy = vi.spyOn(digest, 'projectChronicleDigest');
    const { world, viewer } = actualChapter();
    const live = renderToStaticMarkup(<ChronicleTopicDigest world={world} viewerId={viewer.id} scopeKey="branch-live" />);
    const preview = renderToStaticMarkup(<ChronicleTopicDigest world={world} viewerId={viewer.id} scopeKey="branch-preview-7" />);
    expect(live).toBe(preview);
    expect(live).toMatch(/<details class="[^"]+"><summary class="[^"]+">按主题读故事<\/summary><\/details>/);
    expect(live).not.toMatch(/<select|实录还是|当前分支|<ol|公开实录|<nav/);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('shows six story cards without raw dates or proof; does not truncate the last page', () => {
    const rows = Array.from({ length: 8 }, (_, index) => row(index + 1));
    const first = renderToStaticMarkup(<ChronicleDigestPage rows={rows} page={0} onPage={noAction} onProof={noAction} />);
    const last = renderToStaticMarkup(<ChronicleDigestPage rows={rows} page={8} onPage={noAction} onProof={noAction} />);
    expect(first.match(/查看此幕实录/g)).toHaveLength(6);
    expect(first).toContain('第 1/2 页');
    expect(first).not.toMatch(/独立场景口号 [78]|原文|事发回合|传本|内情/);
    expect(last.match(/查看此幕实录/g)).toHaveLength(2);
    expect(last).toContain('第 2/2 页');
    expect(last).toContain('独立场景口号 8');
  });

  it('opens only an exact source and separates an earlier receipt, unverified retelling and correction', () => {
    const rows = [row(1), row(2)];
    const html = renderToStaticMarkup(<ChronicleDigestPage rows={rows} page={0}
      selection={{ entryId: rows[1].id, sourceId: rows[1].proof.sourceId }} onPage={noAction} onProof={noAction} />);
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html.match(/这一幕的原始凭据/g)).toHaveLength(1);
    expect(html).toContain('仅第 2 条实录带的原文。');
    expect(html).not.toMatch(/仅第 1 条实录带的原文|internal-entry|internal-proof|never-show-the/);
    expect(html).toMatch(/独立场景口号 2[\s\S]*收起此幕实录[\s\S]*事发回合 #2[\s\S]*撮合买单：先前买单[\s\S]*另附传本与勘误[\s\S]*未核实的独立传本[\s\S]*另附已核定的勘误/);
    const stale = renderToStaticMarkup(<ChronicleDigestPage rows={rows} page={0}
      selection={{ entryId: rows[1].id, sourceId: rows[0].proof.sourceId }} onPage={noAction} onProof={noAction} />);
    expect(stale).not.toMatch(/收起此幕实录|这一幕的原始凭据|另附传本与勘误/);
  });

  it('reuses a genuine branch scene and still never attaches a rejected private or wrong-view copy', () => {
    const { world, viewer, fact } = actualChapter();
    const [entry] = digest.projectChronicleDigest(world, viewer.id, 'chapters');
    const selection = { entryId: entry.id, sourceId: entry.proof.sourceId };
    const html = renderToStaticMarkup(<ChronicleDigestPage rows={[entry]} page={0}
      selection={selection} onPage={noAction} onProof={noAction} />);
    expect(html).toContain(`${viewer.name}踏上练气3层`);
    expect(html).toContain(fact.description);
    expect(html).toContain('本章所附公开实录');
    const other = structuredClone(world);
    other.events.push({ ...fact, witnessScope: 'participants', description: '不应出现的另一支私信' });
    const stale = renderToStaticMarkup(<ChronicleDigestPage rows={digest.projectChronicleDigest(other, viewer.id, 'chapters')}
      page={0} selection={selection} onPage={noAction} onProof={noAction} />);
    expect(stale).toContain('暂无可查的故事实录');
    expect(stale).not.toMatch(/另一支私信|原始凭据|查看此幕实录/);
  });
});
