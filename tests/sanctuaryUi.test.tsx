import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { SanctuaryPanel } from '../src/components/SanctuaryPanel';
import { visibleSanctuaryMapMarks } from '../src/components/sanctuaryView';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { SanctuaryCharter, SanctuaryIncident, SanctuaryPass } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 12;
  const [viewer, other, aggressor] = world.cultivators;
  viewer.name = '持敕散修';
  viewer.sectId = 'wanderer';
  other.name = '非公开持敕者';
  aggressor.name = '非本人冲突中的陌生人';
  const [sect] = world.sects;
  const site = world.locations.find(({ type, ownerSectId }) => type === 'market' && (!ownerSectId || ownerSectId === sect.id))!;
  site.name = '止戈台';
  viewer.locationId = site.id;
  viewer.exploredTileIds = [];
  const charter: SanctuaryCharter = {
    id: 'registered-charter', sponsorSectId: sect.id, founderId: other.id, siteId: site.id,
    openedTick: 8, expiresTick: 20, status: 'active', shieldHp: 30, maxShieldHp: 60, stonesSpent: 60,
  };
  const pass: SanctuaryPass = {
    id: 'my-pass', charterId: charter.id, actorId: viewer.id, issuedTick: 9, expiresTick: 15, status: 'active',
  };
  const blocked: SanctuaryIncident = {
    id: 'private-own-event', charterId: charter.id, tick: 11, aggressorId: aggressor.id, visitorId: viewer.id,
    kind: 'blocked', shieldSpent: 20, karmaPenalty: 1, sourceEventId: 'unused',
  };
  const hidden = world.locations.find(({ id }) => id === 'loc-vein-north')!;
  hidden.name = '不该泄露的敕令地点';
  hidden.x = site.x < 500 ? 990 : 10;
  hidden.y = site.y < 300 ? 590 : 10;
  world.sanctuary = {
    charters: [charter, { ...charter, id: 'hidden-charter', siteId: hidden.id }],
    passes: [pass, { ...pass, id: 'other-pass', actorId: other.id }],
    incidents: [blocked, { ...blocked, id: 'not-mine', visitorId: other.id, shieldSpent: 19, karmaPenalty: 99 }],
    nextId: 5,
  };
  const panel = () => renderToStaticMarkup(<SanctuaryPanel world={world} cultivator={viewer} />);
  const map = (fog: boolean) => visibleSanctuaryMapMarks(world, createTerrainMapView(world, viewer, fog), viewer);
  return { world, viewer, charter, pass, site, hidden, panel, map };
}

describe('sanctuary scoped real rights and ward outcomes', () => {
  it('shows a non-allied selected visitor own valid pass, fractional pool, selected actual conflict only', () => {
    const { panel } = fixture();
    const html = panel();
    expect(html).toContain('止戈台 · 敕令生效 · 本人有通行权');
    expect(html).toContain('护阵：30/60 点 · 可挡 1 次决斗');
    expect(html).toContain('本人通行权：有效 · 签发 Tick #9 · 到期 Tick #15');
    expect(html).toContain('本人相关的已记录冲突：1 件');
    expect(html).toContain('Tick #11 · 本人为决斗目标 · 护阵挡下决斗 · 护阵消耗 20 点 · 发起方业力扣除 1 点');
    expect(html).not.toContain('非公开持敕者');
    expect(html).not.toContain('不该泄露的敕令地点');
    expect(html).not.toContain('发起方业力扣除 99 点');
    expect(html).not.toContain('<button');
  });

  it('distinguishes exhausted ward from live pass, exact expiry, no-fault site loss and absence in defaults', () => {
    const { world, viewer, charter, pass, panel, map, site } = fixture();
    charter.shieldHp = 10;
    expect(panel()).toContain('护阵已耗尽，仍可通行');
    expect(panel()).toContain('本人通行权：有效');
    expect(map(true).get(site.id)).toBe(0);
    const visualAlternative = renderToStaticMarkup(<WorldMapCanvas toolsOpen world={world} selectedCultivatorId={viewer.id} onSelectCultivator={() => {}} compact />);
    expect(visualAlternative).toContain('本人通行权有效 · 护阵已耗尽');
    world.tick = pass.expiresTick;
    expect(panel()).not.toContain('本人有通行权');
    expect(map(false).has(site.id)).toBe(false);
    world.tick = 12;
    site.ownerSectId = world.sects.find(({ id }) => id !== charter.sponsorSectId)!.id;
    expect(panel()).toContain('设立地点已不符条件');
    expect(map(false).has(site.id)).toBe(false);
    world.tick = 15;
    charter.status = 'ended';
    charter.endReason = 'site_lost';
    charter.endedTick = world.tick;
    expect(panel()).toContain('设立地点已失效 · Tick #15');
    expect(panel()).toContain('已不提供保护');
    expect(renderToStaticMarkup(<App />)).not.toContain('避难所与通行敕令');
    expect(renderToStaticMarkup(<App initialWorkspace="sect" />)).toContain('避难所与通行敕令');
  });

  it('records the selected party actual violation and forfeiture without implying the ward was spent', () => {
    const { world, viewer, site, pass, panel, map } = fixture();
    pass.status = 'ended';
    pass.endedTick = 12;
    pass.endReason = 'violation';
    world.sanctuary.incidents.push({
      ...world.sanctuary.incidents[0], id: 'my-breach', tick: 12, kind: 'forfeited',
      aggressorId: viewer.id, visitorId: world.cultivators[1].id, shieldSpent: 0, karmaPenalty: 2,
    });
    expect(panel()).toContain('本人通行权：违规失权');
    expect(panel()).toContain('本人相关的已记录冲突：2 件');
    expect(panel()).toContain('本人发起 · 通行权因违规被撤销 · 护阵消耗 0 点 · 发起方业力扣除 2 点');
    expect(map(false).has(site.id)).toBe(false);
    const noViewer = renderToStaticMarkup(<SanctuaryPanel world={world} cultivator={undefined} />);
    expect(noViewer).not.toContain('止戈台');
    expect(noViewer).not.toContain('通行权因违规被撤销');
  });

  it('does not place even known live rights on currently fogged tiles or display another viewer pass', () => {
    const { world, viewer, site, hidden, map } = fixture();
    expect(map(true).get(site.id)).toBe(1);
    viewer.exploredTileIds = [terrainTileAt(world, site.x, site.y)!.id];
    viewer.locationId = hidden.id;
    expect(map(false).get(site.id)).toBe(1);
    expect(map(true).has(site.id)).toBe(false);
    expect(map(false).has(hidden.id)).toBe(false);
    expect(visibleSanctuaryMapMarks(world, createTerrainMapView(world, undefined, false)).size).toBe(0);
  });
});
