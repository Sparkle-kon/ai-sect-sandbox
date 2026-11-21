import { renderToStaticMarkup } from 'react-dom/server';
import { MortalVillagesPanel } from '../src/components/MortalVillagesPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { currentVisibleTileIds, terrainTileAt } from '../src/engine/terrainEngine';
import { projectVillageEvolution } from '../src/engine/villageEvolutionEngine';
import { describe, expect, it } from 'vitest';
import { VillageEvolutionDetails, villageDisplayLabel } from '../src/components/VillageEvolutionDetails';
import type { VillageEvolutionView } from '../src/engine/villageEvolutionEngine';

const row: VillageEvolutionView = {
  settlementId: 'private-old-register-key', siteId: 'private-map-key', registeredName: '梅圩',
  status: 'village', currentLocal: true, asOfTick: 16, population: 13, juveniles: 3, namedRemaining: 4, recentChanges: [], knownMoves: [],
};
const ruin = { tick: 31, from: 'village', to: 'ruin', reason: 'depopulated', population: 0 } as const;
const revival = { tick: 34, from: 'ruin', to: 'village', reason: 'actual_return', population: 13 } as const;

describe('quiet village evolution details', () => {
  it('labels only actual changed stages and leaves a normal village unchanged', () => {
    expect(villageDisplayLabel({ ...row, status: 'ruin', recentChanges: [ruin] })).toBe('旧址');
    expect(villageDisplayLabel({ ...row, recentChanges: [ruin, revival] })).toBe('复居');
    expect(villageDisplayLabel({ ...row, status: 'town' })).toBe('集镇');
    expect(villageDisplayLabel(row)).toBeUndefined();
    expect(villageDisplayLabel(undefined)).toBeUndefined();
  });

  it('distinguishes resident subsets, dated water, stock and a partial migration', () => {
    const markup = renderToStaticMarkup(<VillageEvolutionDetails observed local={{
      stock: { roots: 0, stones: 12 },
    }} row={{ ...row, lastSurvey: { tick: 15, usableWell: false, passableCorridors: 1 }, hasActiveDuties: true, knownMoves: [{ tick: 16, people: 4, counterpartName: '溪尾镇', direction: 'departures', leftJuveniles: 3, leftNamed: 4 }] }} />);
    expect(markup).toContain('现住 13 人，其中未成年 3 人、留在坊籍的具名居民 4 人');
    expect(markup).toContain('第 15 轮查验：未见可用水井');
    expect(markup).toContain('玄土根 0 株、灵石 12 枚');
    expect(markup).toContain('4 人从此处迁往溪尾镇');
    expect(markup).toContain('原地留下未成年 3 人、留在坊籍的具名居民 4 人');
    expect(markup).not.toMatch(/private-.*-key|<button/);
  });

  it('never displays unobserved occupancy/resources or invents an invisible counterpart', () => {
    const markup = renderToStaticMarkup(<VillageEvolutionDetails observed={false} row={{
      ...row, currentLocal: false, asOfTick: 34, lastSurvey: { tick: 34, usableWell: true, passableCorridors: 1 }, hasActiveDuties: true, recentChanges: [ruin, revival],
    }} local={{ stock: { roots: 7, stones: 9 } }} />);
    expect(markup).toContain('旧地名仍在');
    expect(markup).toContain('旧址重新住了人');
    expect(markup).toContain('第 34 轮旧录：');
    expect(markup).toContain('第 34 轮查验：水井可用');
    expect(markup).not.toMatch(/现住|义仓实存|未了事务|迁往|未知地名/);
    expect(renderToStaticMarkup(<VillageEvolutionDetails observed={false} row={undefined} />)).toBe('');
  });
});

it('keeps the true old registry name and opens a movement only after its far end is learned', () => {
  const world = createInitialWorld();
  world.tick = 40;
  const viewer = world.cultivators[0];
  viewer.age = 22;
  const old = world.settlements.villages.find(v => world.locations.find(s => s.id === v.locationId)?.type === 'market')!;
  viewer.locationId = old.locationId;
  viewer.exploredTileIds = [];
  viewer.rumors = [];
  const sight = currentVisibleTileIds(world, viewer);
  const other = world.settlements.villages.find(v => {
    const site = world.locations.find(s => s.id === v.locationId)!;
    return site.type === 'spirit_vein' && !sight.has(terrainTileAt(world, site.x, site.y)?.id ?? '');
  })!;
  const otherSite = world.locations.find(s => s.id === other.locationId)!;
  world.villageEvolution = {
    villages: [
      { settlementId: old.id, siteId: old.locationId, registeredName: '旧梅圩', status: 'village', changes: [ruin, revival], samples: [] },
      { settlementId: other.id, siteId: other.locationId, registeredName: '尚未识得的溪尾', status: 'village', changes: [],
        samples: [{ tick: 35, population: 21, capacity: 32, juveniles: 3, namedRemaining: 4, stress: 25, usableWell: false, passableCorridors: 1 }] },
    ],
    migrations: [{ id: 'never-in-dom', tick: 36, fromSettlementId: old.id, toSettlementId: other.id,
      agreementId: 'private-compact', path: [], people: 4, fromBefore: 50, fromAfter: 46, toBefore: 17, toAfter: 21,
      leftJuveniles: 3, leftNamed: 4, households: [] }],
  };
  const view = () => renderToStaticMarkup(<MortalVillagesPanel world={world} cultivator={viewer} />);
  expect(projectVillageEvolution(world, viewer, '旧梅圩').map(row => row.siteId)).toEqual([old.locationId]);
  expect(view()).toContain('旧梅圩 · 复居');
  expect(view()).not.toMatch(/尚未识得的溪尾|4 人从此处迁往/);
  viewer.exploredTileIds.push(terrainTileAt(world, otherSite.x, otherSite.y)!.id);
  expect(view()).toContain('4 人从此处迁往尚未识得的溪尾');
  expect(view()).toContain('第 35 轮旧录：');
  expect(view()).not.toMatch(/never-in-dom|private-compact/);
});
