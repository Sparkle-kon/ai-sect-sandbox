import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChronicleFeed } from '../src/components/ChronicleFeed';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';
import type { WorldEvent } from '../src/types/world';

function makeWorld() {
  const world = createInitialWorld();
  const [actor, partner, observer, unrelated] = world.cultivators;
  const combat: WorldEvent = {
    id: 'evt-combat',
    tick: 4,
    year: 1,
    month: 4,
    title: '山门斗法',
    description: '胜负已定，两人各自收剑。',
    category: 'combat',
    actorIds: [actor.id, partner.id],
    dialogue: {
      kind: 'combat',
      source: 'llm',
      turns: [
        { speakerId: actor.id, speakerName: actor.name, text: '<符箓>只为止战。' },
        { speakerId: partner.id, speakerName: partner.name, text: '此局到此为止。' },
      ],
    },
  };
  const trade: WorldEvent = {
    ...combat,
    id: 'evt-trade',
    tick: 10,
    month: 10,
    title: '易物相商',
    description: '二人交换了修行物资。',
    category: 'diplomacy',
    actorIds: [actor.id, observer.id],
    dialogue: {
      kind: 'trade',
      source: 'utility',
      turns: [
        { speakerId: actor.id, speakerName: actor.name, text: '今日可换灵药。' },
        { speakerId: observer.id, speakerName: observer.name, text: '请先看这一匣。' },
      ],
    },
  };
  const plain: WorldEvent = {
    ...combat,
    id: 'evt-plain',
    tick: 11,
    month: 11,
    title: '无声异象',
    description: '星光自峡谷升起。',
    category: 'heavenly',
    dialogue: undefined,
  };
  return { world, actor, partner, observer, unrelated, combat, trade, plain };
}

describe('chronicle dialogue UI', () => {
  it('leaves the canonical record visible and places ordered dialogue in accessible closed details', () => {
    const { actor, partner, combat, trade, plain } = makeWorld();
    const html = renderToStaticMarkup(<ChronicleFeed events={[plain, trade, combat]} />);
    expect(html).toContain('共记录 3 条因果');
    expect(html).toContain(plain.title);
    expect(html).toContain(plain.description);
    expect(html).toContain(combat.title);
    expect(html).toContain(combat.description);
    expect(html).toContain(trade.description);
    expect(html.match(/<details\b/g)).toHaveLength(2);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:\s|=|>)/);
    expect(html).toContain('斗法交锋 · 查看对话（2 句）');
    expect(html).toContain('交易交涉 · 查看对话（2 句）');
    expect(html).toContain('模型演绎。对白仅供演绎');
    expect(html).toContain('离线演绎。对白仅供演绎');
    expect(html).toContain(`${actor.name}：</span><span class="text-slate-200">&lt;符箓&gt;只为止战。`);
    expect(html).toContain(`${partner.name}：</span><span class="text-slate-200">此局到此为止。`);
    expect(html.indexOf(combat.description)).toBeLessThan(html.indexOf('斗法交锋 · 查看对话'));
    expect(html.indexOf('&lt;符箓&gt;只为止战。')).toBeLessThan(html.indexOf('此局到此为止。'));
  });

  it('omits transcript affordances when there is no dialogue or no turns', () => {
    const { plain } = makeWorld();
    const empty: WorldEvent = {
      ...plain,
      id: 'evt-empty-dialogue',
      dialogue: { kind: 'trade', source: 'utility', turns: [] },
    };
    const html = renderToStaticMarkup(<ChronicleFeed events={[plain, empty]} />);
    expect(html).toContain(plain.description);
    expect(html).not.toContain('<details');
    expect(html).not.toContain('查看对话');
  });

  it('summarizes only the selected actor’s latest dialogue, never transcript lines', () => {
    const { world, actor, partner, observer, unrelated, combat, trade, plain } = makeWorld();
    world.events = [plain, combat, trade];
    const map = (id: string | null) => renderToStaticMarkup(
      <WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={() => undefined} />
    );
    const selected = map(actor.id);
    expect(selected).toContain('最近对话：交易交涉 · 仙历 1年10月 · 2 句');
    expect(selected).not.toContain('今日可换灵药。');
    expect(selected).not.toContain('最近对话：斗法交锋');
    expect(map(partner.id)).toContain('最近对话：斗法交锋 · 仙历 1年4月 · 2 句');
    expect(map(observer.id)).toContain('最近对话：交易交涉');
    expect(map(unrelated.id)).not.toContain('最近对话：');
    expect(map(null)).not.toContain('最近对话：');
  });
});
