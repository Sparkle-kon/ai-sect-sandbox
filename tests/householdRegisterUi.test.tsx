import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { HouseholdRegisterPanel } from '../src/components/HouseholdRegisterPanel';
import { MortalVillagesPanel } from '../src/components/MortalVillagesPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { visibleHouseholds } from '../src/engine/householdEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { HouseholdCensus, HouseholdView } from '../src/engine/householdEngine';

function projectedFixture() {
  const world = createInitialWorld();
  world.tick = 220;
  const [viewer, guardian] = world.cultivators;
  guardian.name = '已同意的监护人';
  const census: HouseholdCensus = {
    settlementId: world.settlements.villages[0].id, population: 8, adults: 6, juveniles: 2, namedResidents: 2, unassigned: 3,
    groups: [
      { id: 'a', branch: 'first', adults: 4, juveniles: 1, namedResidents: 2, births: 3, matured: 2, migratedIn: 1, migratedOut: 0, deaths: 0 },
    ],
  };
  const view: HouseholdView = {
    censuses: [census],
    ownMembership: { volunteerId: 'former-volunteer', householdId: 'a', settlementId: census.settlementId,
      registeredTick: 10, status: 'recruited', recruitedId: viewer.id, settledTick: 20 },
    guardianContracts: [{ id: 'actual-guardianship', householdId: 'a', guardianId: guardian.id, wardId: viewer.id,
      openedTick: 18, expiresTick: 21, status: 'active', acceptedTick: 19 }],
  };
  const html = () => renderToStaticMarkup(<HouseholdRegisterPanel world={world} census={census} view={view} cultivator={viewer} />);
  return { world, viewer, guardian, census, view, html };
}

describe('household register scoped UI', () => {
  it('shows existing numbers without incrementing population for households or named previously recruited person', () => {
    const { html } = projectedFixture();
    const markup = html();
    expect(markup).toMatch(/<details class="[^"]+"><summary class="[^"]+">家户谱系与代际坊籍/);
    expect(markup).toContain('以下均是同一批村民的统计，不在村镇总人口之外重复计数');
    expect(markup).toContain('村镇现有人口</dt><dd>8 人');
    expect(markup).toContain('匿名成年／未成年</dt><dd>6／2 人');
    expect(markup).toContain('具名在籍居民（子集）</dt><dd>2 人');
    expect(markup).toContain('未归入分支</dt><dd>3 人');
    expect(markup).toContain('家户甲 · 登记第 1 支 · 当地匿名成年 4 · 未成年 1 · 具名居民 2');
    expect(markup).toContain('出生 3、成年 2、迁入 1、迁出 0、死亡 0');
    expect(markup).toContain('自愿入门留档 · 不再计入该村凡人人口');
  });

  it('separates voluntary consent from branch description and does not conflate offered with active', () => {
    const { world, view, html } = projectedFixture();
    expect(html()).toContain('监护是另行自愿结约，不是血亲、宗门品阶或自动收徒');
    expect(html()).toContain('对方 已同意的监护人 · 双方已同意，监护有效');
    expect(html()).toContain('同意 Tick #19');
    const agreement = view.guardianContracts[0];
    world.cultivators[2].name = '不公开的其他监护人';
    view.guardianContracts.push({ ...agreement, id: 'others', guardianId: world.cultivators[2].id, wardId: world.cultivators[3].id });
    expect(html()).not.toContain('不公开的其他监护人');
    agreement.status = 'offered'; agreement.openedTick = world.tick; agreement.expiresTick = world.tick + 3; agreement.acceptedTick = undefined;
    expect(html()).toContain('待受监护方回应');
    expect(html()).not.toContain('双方已同意');
  });

  it('only mounts nested under observed settlement, skipping home and remembered tile', () => {
    const world = createInitialWorld();
    const [viewer] = world.cultivators;
    const [village] = world.settlements.villages;
    const local = world.locations.find(({ id }) => id === village.locationId)!;
    viewer.locationId = local.id;
    const site = terrainTileAt(world, local.x, local.y)!;
    viewer.exploredTileIds = [site.id];
    const html = () => renderToStaticMarkup(<MortalVillagesPanel world={world} cultivator={viewer} />);
    expect(visibleHouseholds(world, viewer).censuses.find(({ settlementId }) => settlementId === village.id)?.population).toBe(village.population);
    expect(html()).toContain('家户谱系与代际坊籍');
    const far = world.locations.find(({ x, y }) => Math.hypot(x - local.x, y - local.y) > 300)!;
    viewer.locationId = far.id;
    const markup = html();
    expect(markup).toContain(`${village.name} · 当前未观测`);
    const hiddenLocal = markup.split(`${village.name} · 当前未观测`)[1].split('</details>')[0];
    expect(hiddenLocal).not.toContain('家户谱系与代际坊籍');
    expect(renderToStaticMarkup(<App />)).not.toContain('家户谱系与代际坊籍');
  });
});
