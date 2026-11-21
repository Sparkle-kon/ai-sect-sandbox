import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { CensusPanel } from '../src/components/CensusPanel';
import { MortalVillagesPanel } from '../src/components/MortalVillagesPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { VillageCensusPeriod } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 14;
  const [viewer, otherViewer] = world.cultivators;
  const [local, remote] = world.settlements.villages;
  const here = world.locations.find(({ id }) => id === local.locationId)!;
  const there = world.locations.find(({ id }) => id === remote.locationId)!;
  Object.assign(here, { x: 340, y: 340 });
  Object.assign(there, { x: 980, y: 20 });
  local.name = '清点村';
  remote.name = '未核迁徙对端';
  viewer.locationId = otherViewer.locationId = here.id;
  viewer.exploredTileIds = otherViewer.exploredTileIds = [];
  const localCount = (population: number, juveniles: number) => ({ villageId: local.id, population, juveniles });
  const period: VillageCensusPeriod = {
    tick: 13, year: 2, month: 2,
    opening: [localCount(100, 5), { villageId: remote.id, population: 70, juveniles: 0 }],
    closing: [localCount(101, 6), { villageId: remote.id, population: 72, juveniles: 0 }],
    movements: [
      { id: 'record-birth', kind: 'birth', villageId: local.id, bornTick: 13, people: 3 },
      { id: 'record-death', kind: 'death', villageId: local.id, people: 1 },
      { id: 'record-in', kind: 'migration', villageId: remote.id, targetVillageId: local.id, people: 2 },
      { id: 'record-out', kind: 'migration', villageId: local.id, targetVillageId: remote.id, people: 4 },
      { id: 'record-enroll', kind: 'enrollment', villageId: local.id, volunteerId: 'private-volunteer', cultivatorId: 'private-recruit', people: 1 },
      { id: 'record-mature', kind: 'maturation', villageId: local.id, bornTick: 0, people: 2 },
    ],
    observations: [
      { villageId: local.id, observerId: viewer.id, count: localCount(99, 5),
        sample: { householdId: 'private-sample-household', adults: 3, juveniles: 2, namedResidents: 1 } },
    ],
  };
  world.villageCensuses.periods = [period];
  const view = (observer = viewer) => renderToStaticMarkup(<MortalVillagesPanel world={world} cultivator={observer} />);
  return { world, viewer, otherViewer, local, remote, there, period, localCount, view };
}

describe('observed village population reconciliation', () => {
  it('distinguishes numeric close, residual, verified transitions and own dated sample without raw identities', () => {
    const { view, otherViewer } = fixture();
    const html = view();
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">坊籍核点与人口口径/);
    expect(html).toContain('月初登记</dt><dd>100 人 · 未成年 5 人');
    expect(html).toContain('凭实录推算</dt><dd>99 人 · 未成年 6 人');
    expect(html).toContain('月末实录</dt><dd>101 人 · 未成年 6 人');
    expect(html).toContain('人口 +2 人 · 未成年 0 人（未解释，不补登）');
    expect(html).toContain('出生 3 人 · 死亡 1 人 · 自愿入门转出 1 人');
    expect(html).toContain('迁入 2 人 · 迁出 4 人 · 满龄转为成年 2 人（不改变总人口）');
    expect(html).toContain('其中 6 人跨越观测边界，仅计本村端');
    expect(html).toContain('签记 Tick #13 · 99 人 · 未成年 5 人');
    expect(html).toContain('抽样已在实有人口口径内，不外推、不另加');
    expect(html).not.toMatch(/未核迁徙对端|private-sample-household|private-volunteer|private-recruit|record-in/);
    expect(view(otherViewer)).toContain('所选修士本月无可见的现场签记');
    expect(view(otherViewer)).not.toContain('抽查 1 户');
    expect(renderToStaticMarkup(<App />)).not.toContain('坊籍核点与人口口径');
  });

  it('uses only observed local periods, leaves open/snapshot differences undefined and never exposes remembered-only counts', () => {
    const { world, viewer, remote, there, local, localCount, view } = fixture();
    const nearby = terrainTileAt(world, there.x, there.y)!;
    viewer.exploredTileIds = [nearby.id];
    world.villageCensuses.periods.push(
      { tick: 14, year: 2, month: 3, opening: [localCount(101, 6)], observations: [], movements: [] },
      { tick: 15, year: 2, month: 4, opening: [localCount(700, 82)], observations: [], movements: [] },
    );
    const html = view();
    expect(html).toContain('核点月份');
    expect(html).toContain('第 2 年 3 月 · 账期 Tick #14');
    expect(html).toContain('尚未结账，不以推算代替实录');
    expect(html).not.toContain('第 2 年 4 月');
    expect(html).not.toContain('实录减推算');
    expect(html).toContain('未核迁徙对端 · 当前未观测');
    expect(renderToStaticMarkup(<CensusPanel world={world} cultivator={viewer} villageId={remote.id} />)).toBe('');
    expect(renderToStaticMarkup(<CensusPanel world={world} cultivator={viewer} villageId={local.id} />)).toContain('尚未结账');
  });
});
