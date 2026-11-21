import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AlchemyPanel } from '../src/components/AlchemyPanel';
import { SeedCulturePanel } from '../src/components/SeedCulturePanel';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { resolveSeedCultureAction } from '../src/engine/seedCultureEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { WorldState } from '../src/types/world';
import {
  matureSeedCulture, plantedSeedCulture, reservedSeedCulture, seedDecision, seedPerson, seedSite, seedTurn, testedSeedCulture,
} from './fixtures/seedCultureFixture';

const html = (world: WorldState, actorId: string) =>
  renderToStaticMarkup(<SeedCulturePanel world={world} cultivator={seedPerson(world, actorId)} />);

describe('private native seed culture and limited local field summary', () => {
  it('nests the closed section beside Alchemy, separates real sealed seeds from leaves, and renders only dated small samples', () => {
    const f = reservedSeedCulture();
    const { world } = f;
    const keeper = seedPerson(world, f.ownerId), site = seedSite(world, f.siteId);
    const panel = renderToStaticMarkup(<AlchemyPanel world={world} cultivator={keeper} location={site} />);
    expect(panel).toMatch(/<details class="[^"]+"><summary class="[^"]+">留种与实测试验/);
    expect(panel).toContain('实耗翡翠灵叶 2 株、留种 6 枚');
    expect(panel).toContain('当前种册实余 6 枚种子');
    expect(panel).toContain('未持有灵草');
    expect(panel).not.toContain('实见出苗');
    expect(html(world, f.outsiderId)).toBe('');

    const t = testedSeedCulture();
    const lot = t.world.seedCulture.lots.find(({ id }) => id === t.lotId)!;
    const first = structuredClone(lot.tests[0]);
    const observation = '土地灵气 ' + Math.round(first.weather.soilQi * 10) / 10;
    const tested = html(t.world, t.ownerId);
    expect(tested).toContain('当前种册实余 4 枚种子');
    expect(tested).toContain(`第 ${first.tick} 轮实耗小样 2 枚；实见出苗 ${first.sprouted}/2`);
    expect(tested).toContain('不代表整批出苗率');
    expect(tested).toContain(observation);
    expect(tested).not.toContain(f.lotId);
    expect(tested).not.toContain(f.ownerId);
    expect(tested).not.toContain('<button');

    const currentSite = seedSite(t.world, t.siteId);
    terrainTileAt(t.world, currentSite.x, currentSite.y)!.spiritQi = first.weather.soilQi >= 51 ? 8 : 92;
    t.world.tick++;
    expect(resolveSeedCultureAction(t.world, seedPerson(t.world, t.ownerId), seedDecision('test', t.lotId))).not.toBeNull();
    const revised = html(t.world, t.ownerId);
    expect(revised).toContain(observation);
    expect(revised).toContain('当前种册实余 2 枚种子');
    expect(revised.match(/实耗小样 2 枚/g)).toHaveLength(2);
    expect(lot.tests[0]).toEqual(first);
  });

  it('shows anonymous local occupancy only to the authorized onsite viewer and actual plot dates to its owner', () => {
    const f = plantedSeedCulture();
    const viewer = seedPerson(f.world, f.competitorId);
    const owner = seedPerson(f.world, f.ownerId);
    const own = html(f.world, f.ownerId);
    expect(own).toContain('第 ' + f.world.tick + ' 轮实种 2 枚（种册第 1 批）');
    expect(own).toContain('待核验，不视为可收');
    expect(own).not.toContain('已实收');
    const local = html(f.world, f.competitorId);
    expect(local).toContain('本地田圃实况：生长中 1 圃 · 实熟待收 0 圃');
    expect(local).not.toContain('本人田圃与实收');
    expect(local).not.toContain(owner.name);
    expect(local).not.toContain(f.plotId);
    expect(html(f.world, f.outsiderId)).toBe('');
    viewer.locationId = f.world.locations.find(({ id }) => id !== f.siteId)!.id;
    expect(html(f.world, f.competitorId)).not.toContain('本地田圃实况');
  });

  it('distinguishes actual retained yield, real harvest, and real loss from changes in native herb stock', () => {
    const growing = plantedSeedCulture();
    const site = seedSite(growing.world, growing.siteId);
    const hazard = applyMapBrush(applyMapBrush(growing.world, 'beast_tide', [site]), 'beast_tide', [site]);
    const destroyed = seedTurn(hazard);
    const lost = html(destroyed, growing.ownerId);
    expect(lost).toContain('实损 2 枚种子：田圃遭遇实际灾险。未记入实收');
    expect(lost).not.toContain('已实收翡翠灵叶');
    expect(lost).not.toContain(destroyed.mapHazards.find(({ kind }) => kind === 'beast_tide')!.id);

    const f = matureSeedCulture();
    const { world } = f;
    const plot = world.seedCulture.plots.find(({ id }) => id === f.plotId)!;
    const owner = seedPerson(world, f.ownerId);
    const ready = html(world, f.ownerId);
    expect(ready).toContain(`翡翠灵叶 ${plot.yield} 株仍在田圃，尚未移入随身药材`);
    expect(ready).toContain('田圃逐轮原观测');
    expect(ready).not.toContain('已实收翡翠灵叶');
    const privateLeaves = owner.herbs.jade_leaf;
    const wildLeaves = seedSite(world, f.siteId).herbs.jade_leaf;
    expect(resolveSeedCultureAction(world, owner, seedDecision('harvest', f.plotId))).not.toBeNull();
    expect(owner.herbs.jade_leaf).toBe(privateLeaves + plot.yield!);
    expect(seedSite(world, f.siteId).herbs.jade_leaf).toBe(wildLeaves);
    expect(html(world, f.ownerId)).toContain(`已实收翡翠灵叶 ${plot.yield} 株。此为当时交割，不代表现在仍持有`);
    expect(html(world, f.ownerId)).not.toContain('尚未移入随身药材');
  });
});
