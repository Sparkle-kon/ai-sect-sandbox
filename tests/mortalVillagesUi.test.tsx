import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MortalVillagesPanel } from '../src/components/MortalVillagesPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableSettlementActions } from '../src/engine/settlementEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { WorldState } from '../src/types/world';

type Village = WorldState['settlements']['villages'][number];

function fixture() {
  const world = createInitialWorld();
  world.tick = 10;
  const [viewer] = world.cultivators;
  const [local, remote, hidden] = world.locations;
  viewer.locationId = local.id;
  viewer.herbs.jade_leaf = 8;
  viewer.spiritStones = 250;
  viewer.exploredTileIds = [local, remote].flatMap((location) => {
    const tile = terrainTileAt(world, location.x, location.y);
    return tile ? [tile.id] : [];
  });
  const sect = world.sects.find(({ id }) => id === viewer.sectId)!;
  sect.leaderId = viewer.id;
  sect.spiritStones = 500;
  const observed: Village = {
    id: 'village-local', locationId: local.id, name: '桥头村', population: 86, capacity: 120, stress: 61,
    lastDisasterTick: 4, lastReliefTick: 5, volunteers: [
      { id: 'willing', name: '公开自愿者', age: 23, spiritRoot: '木', willingness: 99, aptitude: 85 },
      { id: 'unwilling', name: '未表入门者', age: 24, spiritRoot: '土', willingness: 0, aptitude: 75 },
      { id: 'enlisted', name: '已经入门者', age: 26, spiritRoot: '金', willingness: 99, aptitude: 80, enlistedCultivatorId: viewer.id },
    ],
  };
  const unobserved = { ...observed, id: 'village-remembered', name: '记得地名的村', locationId: remote.id, population: 97 };
  const undiscovered = { ...observed, id: 'village-hidden', name: '不可发现的村名', locationId: hidden.id, population: 98 };
  world.settlements = {
    villages: [observed, unobserved, undiscovered],
    records: [
      { id: 'move', tick: 8, kind: 'migration', settlementId: observed.id, targetSettlementId: undiscovered.id,
        people: 5, stones: 0, herbs: 0, description: `迁往${undiscovered.name}` },
      { id: 'relief', tick: 5, kind: 'relief', settlementId: observed.id, actorId: viewer.id, sectId: sect.id,
        people: 0, stones: 12, herbs: 2, description: '' },
      { id: 'disaster', tick: 4, kind: 'disaster', settlementId: observed.id,
        people: 3, stones: 0, herbs: 0, description: '' },
      { id: 'hidden-record', tick: 9, kind: 'recruitment', settlementId: unobserved.id,
        people: 1, stones: 25, herbs: 0, description: '不显示不在视野的账目' },
    ],
  };
  const markup = () => renderToStaticMarkup(<MortalVillagesPanel world={world} cultivator={viewer} />);
  return { world, viewer, observed, unobserved, markup };
}

describe('mortal settlements presentation', () => {
  it('uses game-authorized voluntary recruits and real relief costs', () => {
    const { world, viewer, observed, markup } = fixture();
    expect(availableSettlementActions(viewer, world)).toContainEqual(expect.objectContaining({
      action: 'RECRUIT_SETTLER', targetSettlementId: observed.id, targetVolunteerId: 'willing',
    }));
    const html = markup();
    expect(html).toContain('桥头村 · 人口 86/120');
    expect(html).toContain('压力 61/100');
    expect(html).toContain('当前可招募 1 人');
    expect(html).toContain('公开自愿者');
    expect(html).not.toContain('未表入门者');
    expect(html).not.toContain('已经入门者');
    expect(html).toContain('每位 25 灵石');
    expect(html).toContain('个人 12 灵石与 2 株翡翠灵叶');
    expect(html).not.toContain('<button');
    observed.stress = 71;
    const underStress = markup();
    expect(underStress).toContain('当前可招募 0 人');
    expect(underStress).not.toContain('公开自愿者');
  });

  it('dates real migration, relief and disaster ledger without revealing hidden destinations', () => {
    const html = fixture().markup();
    expect(html).toContain('Tick #8 · 迁徙 → 未观测目的地');
    expect(html).toContain('迁出 5 人');
    expect(html).toContain('Tick #5 · 赈济');
    expect(html).toContain('实际耗费 12 灵石、2 株翡翠灵叶');
    expect(html).toContain('Tick #4 · 受灾');
    expect(html).toContain('遇难 3 人');
    expect(html).not.toContain('不可发现的村名');
  });

  it('hides current population and ledger for remembered offscreen sites or no viewing actor', () => {
    const { world, viewer, markup } = fixture();
    const html = markup();
    expect(html).toContain('记得地名的村 · 当前未观测');
    expect(html).not.toContain('人口 97/120');
    expect(html).not.toContain('不显示不在视野的账目');
    const missing = renderToStaticMarkup(<MortalVillagesPanel world={world} cultivator={undefined} />);
    expect(missing).toContain('未选中修士，无地方观察');
    expect(missing).not.toContain('桥头村');
    viewer.alive = false;
    expect(markup()).not.toContain('人口 86/120');
  });
});
