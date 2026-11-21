import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { SharedCommonsPanel } from '../src/components/SharedCommonsPanel';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { visibleSharedCommonsMapSites } from '../src/components/sharedCommonsMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { SharedCommonsPact } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 14;
  const [a, b, c, outside] = world.sects;
  a.name = '签署甲宗'; b.name = '漏缴乙宗'; c.name = '签署丙宗';
  const viewer = world.cultivators.find(({ id }) => id === a.leaderId)!;
  const outsider = world.cultivators.find(({ id }) => id === outside.leaderId)!;
  const site = world.locations.find(({ id }) => id === 'loc-vein-north')!;
  site.name = '真正中立灵地';
  delete site.ownerSectId;
  const tile = terrainTileAt(world, site.x, site.y)!;
  delete tile.ownerSectId;
  viewer.locationId = outsider.locationId = site.id;
  viewer.exploredTileIds = [tile.id];
  const pact: SharedCommonsPact = {
    id: 'pact', siteId: site.id, herbId: 'jade_leaf', proposerSectId: a.id, openedTick: 10, offerExpiresTick: 13,
    status: 'active', activatedTick: 12, startsTick: 13, endsTick: 25,
    parties: [
      { sectId: a.id, signerId: a.leaderId!, share: 2, signedTick: 10 },
      { sectId: b.id, signerId: b.leaderId!, share: 1, signedTick: 11 },
      { sectId: c.id, signerId: c.leaderId!, share: 1, signedTick: 12 },
    ],
    rounds: [{
      startTick: 13, endsTick: 16, stockAtOpen: 10, reserved: 6,
      allocations: [
        { sectId: a.id, maintenanceDue: 6, maintenancePaid: 6, quota: 4, used: 1 },
        { sectId: b.id, maintenanceDue: 3, maintenancePaid: 0, quota: 0, used: 0 },
        { sectId: c.id, maintenanceDue: 3, maintenancePaid: 3, quota: 2, used: 0 },
      ], harvests: [{ tick: 14, actorId: viewer.id, sectId: a.id, units: 1 }],
    }],
  };
  world.sharedCommons.pacts = [pact];
  const panel = (actor = viewer) => renderToStaticMarkup(<SharedCommonsPanel world={world} cultivator={actor} />);
  const marks = (actor = viewer, fog = true) => visibleSharedCommonsMapSites(world, createTerrainMapView(world, actor, fog), actor);
  return { world, a, b, c, viewer, outsider, site, pact, panel, marks };
}

describe('neutral commons shared-site UI', () => {
  it('keeps one fold with actual assent, in-epoch maintenance and used shares rather than imaginary new stock', () => {
    const { panel, outsider } = fixture();
    const text = panel();
    expect(text).toMatch(/<details class="[^"]+"><summary class="[^"]+">灵地公域与共管配额/);
    expect(text).toContain('当前场地无宗门地权');
    expect(text).toContain('签署甲宗 · 2 份 · 已签署 Tick #10');
    expect(text).toContain('漏缴乙宗 · 维护应付 3／实付 0 灵石 · 本期配额失效，不欠款');
    expect(text).toContain('签署甲宗 · 维护应付 6／实付 6 灵石 · 配额 4 株，实采 1 株，余 3 株');
    expect(text).toContain('期初现货 10 株 · 实际预留 6 株');
    expect(panel(outsider)).toBe('');
    expect(renderToStaticMarkup(<App />)).not.toContain('灵地公域与共管配额');
  });

  it('does not imply upkeep or availability on an unsigned pact or earlier branch', () => {
    const { world, pact, panel, marks } = fixture();
    world.tick = 11;
    pact.status = 'offered'; pact.activatedTick = undefined; pact.startsTick = undefined; pact.endsTick = undefined;
    pact.rounds = [];
    expect(panel()).toContain('征求三方签署');
    expect(panel()).toContain('签署丙宗 · 1 份 · 未签署');
    expect(panel()).toContain('尚无当期维护或配额实录');
    expect(panel()).not.toContain('实际预留');
    expect(marks().size).toBe(0);
  });

  it('shows accessible current visible commons marker only when neutral and active', () => {
    const { world, viewer, outsider, a, site, panel, marks } = fixture();
    expect(marks().has(site.id)).toBe(true);
    const renderedMap = () => renderToStaticMarkup(<WorldMapCanvas toolsOpen world={world} selectedCultivatorId={viewer.id} onSelectCultivator={() => {}} compact />);
    expect(renderedMap()).toContain('中立灵地共管中 · 外来者限采储备之外的余量');
    viewer.locationId = world.locations.find(({ id }) => id === 'loc-market')!.id;
    expect(marks().has(site.id)).toBe(false);
    expect(marks(viewer, false).has(site.id)).toBe(true);
    expect(panel(outsider)).toBe('');
    expect(marks(outsider).has(site.id)).toBe(true);
    site.ownerSectId = a.id;
    expect(panel()).toContain('未直接观测当前地权');
    expect(panel()).not.toContain('当前地权：签署甲宗');
    viewer.locationId = site.id;
    expect(panel()).toContain('当前地权：签署甲宗');
    expect(marks(viewer, false).has(site.id)).toBe(false);
    expect(renderedMap()).not.toContain('中立灵地共管中');
  });
});
