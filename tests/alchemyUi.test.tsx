import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';
import type { Cultivator, HerbId, PillId } from '../src/types/world';

const ignoreSelection = () => undefined;
const herbs = (): Record<HerbId, number> => ({ jade_leaf: 0, earth_root: 0, star_bloom: 0, shadow_moss: 0 });
const pills = (): Record<PillId, number> => ({ foundation: 0, golden: 0, barrier: 0, heart_poison: 0 });

function makeWorld() {
  const world = createInitialWorld();
  const [actor, other] = world.cultivators;
  const [place, remote] = world.locations;
  for (const location of world.locations) {
    location.herbs = herbs();
    location.furnaceGrade = 0;
  }
  actor.locationId = place.id;
  actor.herbs = { ...herbs(), jade_leaf: 2, earth_root: 1 };
  actor.pills = { ...pills(), foundation: 1, heart_poison: 2 };
  actor.pillToxicity = 37;
  place.herbs = { ...herbs(), star_bloom: 5 };
  place.furnaceGrade = 3;
  other.locationId = remote.id;
  other.herbs = herbs();
  other.pills = pills();
  other.pillToxicity = 0;
  remote.herbs = { ...herbs(), shadow_moss: 4 };
  const inspect = (cultivator: Cultivator) => renderToStaticMarkup(
    <AgentInspector world={world} cultivator={cultivator} onSelectCultivator={ignoreSelection} />
  );
  const map = (id: string | null) => renderToStaticMarkup(
    <WorldMapCanvas world={world} selectedCultivatorId={id} onSelectCultivator={ignoreSelection} />
  );
  return { actor, other, place, remote, inspect, map };
}

describe('alchemy inventory and sources UI', () => {
  it('distinguishes carried stock from local herbs and shows furnace grade and toxicity', () => {
    const { actor, place, inspect } = makeWorld();
    const html = inspect(actor);
    const pocket = html.split('aria-label="随身灵草"')[1]?.split('</section>')[0];
    const pillsHtml = html.split('aria-label="随身丹药"')[1]?.split('</section>')[0];
    const local = html.split('aria-label="此地可采灵草"')[1]?.split('</section>')[0];
    expect(pocket).toContain('翡翠灵叶 2 株');
    expect(pocket).toContain('玄土根 1 株');
    expect(pocket).not.toContain('星露花');
    expect(pillsHtml).toContain('筑基丹 1 枚');
    expect(pillsHtml).toContain('噬心毒丹 2 枚');
    expect(pillsHtml).not.toContain('九转金丹');
    expect(local).toContain('星露花 5 株');
    expect(local).not.toContain('翡翠灵叶');
    expect(local).not.toContain('幽影苔');
    expect(html).toContain(`${place.name} · 3 阶丹炉`);
    expect(html).toContain('丹毒 37/100');
    expect(html).toMatch(/<meter aria-label="丹毒"[^>]*min="0" max="100" value="37"/);
  });

  it('handles empty inventories and locations and does not report an active site for an archived cultivator', () => {
    const { other, remote, inspect } = makeWorld();
    remote.herbs = herbs();
    const html = inspect(other);
    expect(html).toContain('未持有灵草。');
    expect(html).toContain('未持有丹药。');
    expect(html).toContain(`${remote.name} · 无丹炉`);
    expect(html).toContain('此地当前无可采灵草。');
    expect(html).toContain('丹毒 0/100');

    other.alive = false;
    expect(inspect(other)).toContain('修士已陨落，不再查看当地丹炉和灵草。');
    expect(inspect(other)).not.toContain('此地可采灵草');
  });

  it('lists all four game recipes and recalculates estimates at the current furnace grade', () => {
    const { actor, place, inspect } = makeWorld();
    actor.techniqueMastery = 0;
    actor.spiritRoot = '木';
    const html = inspect(actor);
    const book = html.split('查看丹方 · 4 种')[1]?.split('</details>')[0];
    for (const name of ['筑基丹', '九转金丹', '破障丹', '噬心毒丹']) expect(book).toContain(name);
    expect(book).toContain('翡翠灵叶 2 株 · 玄土根 1 株');
    expect(book).toContain('最低 3 阶丹炉 · 当前炉阶满足');
    expect(book).toContain('当前耗费 28 灵石 · 成丹率 81.6%');

    place.furnaceGrade = 1;
    const lower = inspect(actor).split('查看丹方 · 4 种')[1]?.split('</details>')[0];
    expect(lower).toContain('最低 3 阶丹炉 · 当前炉阶不满足');
    expect(lower).toContain('当前耗费 40 灵石 · 成丹率 57.6%');
    expect(lower).toContain('基础耗费 120 灵石 · 暂无当地成丹率');
  });

  it('changes the local map badge with selection and makes resource totals available without displaying individual stock', () => {
    const { actor, other, map } = makeWorld();
    const selected = map(actor.id);
    expect(selected).toContain('此地丹道：3 阶丹炉 · 灵草 5 株');
    expect(selected).toContain('· 3 阶丹炉');
    expect(selected).toContain('· 灵草 4 株');
    expect(selected).not.toContain('幽影苔');
    expect(selected).not.toContain('翡翠灵叶');
    expect(map(other.id)).toContain('此地丹道：无丹炉 · 灵草 4 株');
    expect(map(null)).not.toContain('此地丹道：');
  });
});
