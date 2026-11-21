import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { SectRelocationPanel } from '../src/components/SectRelocationPanel';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { mapTransitActorIds, visibleMapConvoys } from '../src/components/mapConvoyView';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { WorldState } from '../src/types/world';

type Plan = WorldState['relocations']['plans'][number];

function fixture() {
  const world = createInitialWorld();
  world.tick = 20;
  const [sect, outsiderSect] = world.sects;
  const [viewer, voter, guard] = world.cultivators;
  viewer.sectId = sect.id;
  const [here, remote] = world.locations;
  const previous = world.locations.find((site) => site.id !== here.id && site.id !== remote.id &&
    !world.sects.some(({ headquartersId }) => headquartersId === site.id))!;
  Object.assign(here, { name: '迁出旧峰', x: 180, y: 180 });
  Object.assign(remote, { name: '迁往远峰', x: 820, y: 180 });
  Object.assign(previous, { name: '留存废峰', x: 105, y: 128 });
  guard.name = '记录在册的守山修士';
  viewer.locationId = here.id;
  sect.headquartersId = here.id;
  viewer.exploredTileIds = [terrainTileAt(world, remote.x, remote.y)!.id];
  const active: Plan = {
    id: 'actual-convoy', sectId: sect.id, originId: here.id, destinationId: remote.id, status: 'in_transit', openedTick: 13, deadlineTick: 17,
    proposerId: viewer.id, voterIds: [viewer.id, voter.id, guard.id], votes: [
      { actorId: viewer.id, tick: 13, approve: true }, { actorId: voter.id, tick: 14, approve: false }, { actorId: guard.id, tick: 16, approve: true },
    ], garrisonIds: [guard.id], path: [{ x: 180, y: 180 }, { x: 220, y: 180 }, { x: 820, y: 180 }], pathIndex: 1,
    stoneCost: 30, earthCost: 3, custody: { stones: 94, pavilion: [{ name: '托管经卷', spiritRoot: '土' }] }, spent: true, departedTick: 17,
  };
  world.relocations = { nextId: 10, plans: [active, {
    ...active, id: 'settled-old-plan', originId: previous.id, destinationId: here.id, openedTick: 2, departedTick: 4, settledTick: 6,
    status: 'settled', custody: { stones: 0, pavilion: [] },
  }, { ...active, id: 'foreign-vote', sectId: outsiderSect.id, status: 'voting', stoneCost: 999 }], abandonedSites: [{
    id: 'archived-site', planId: 'settled-old-plan', sectId: sect.id, originId: previous.id, destinationId: here.id, tick: 6,
    originalType: 'sect_hq', facilities: { ...sect.facilities, defense_array: 2 }, arrayHp: 7, arrayMaxHp: 80,
  }] };
  const html = () => renderToStaticMarkup(<SectRelocationPanel world={world} cultivator={viewer} />);
  return { world, viewer, active, remote, html };
}

describe('relocation history and convoy map', () => {
  it('separates current headquarters, votes/supplies, actual custody, and settled or abandoned property', () => {
    const { world, viewer, html } = fixture();
    const markup = html();
    expect(markup).toContain('当前登记山门：迁出旧峰');
    expect(markup).toContain('迁出旧峰 → 迁往远峰 · 迁移在途');
    expect(markup).toContain('同意 2 票 · 反对 1 票 · 邀请 3 人 · 通过需 2 票');
    expect(markup).toContain('30 灵石、玄土根 3 株 · 已支应');
    expect(markup).toContain('实际路线进度：已行 1/2 段');
    expect(markup).toContain('在途托管：94 灵石 · 功法 1 部');
    expect(markup).toContain('启程名册（非到达确认）：记录在册的守山修士');
    expect(markup).toContain('留存废峰 · 已弃置，非活动山门');
    expect(markup).toContain('弃置时护山阵 7/80');
    expect(markup).toContain('不再计作在途资产');
    expect(markup).not.toContain('999 灵石');
    world.sects[1].headquartersId = world.relocations.abandonedSites[0].originId;
    expect(html()).toContain(`曾弃置，现为${world.sects[1].name}山门`);
    world.tick = 15;
    world.relocations.abandonedSites[0].tick = 17;
    expect(html()).not.toContain('已弃置，非活动山门');
    viewer.sectId = 'wanderer';
    expect(html()).toContain('散修没有本宗迁移档案');
  });

  it('gates convoy markers and clips routes across hidden ground even between known endpoints', () => {
    const { world, viewer, active, remote } = fixture();
    const view = createTerrainMapView(world, viewer, true);
    expect([...mapTransitActorIds(world)]).toEqual(active.garrisonIds);
    expect(world.cultivators.some(({ id }) => active.garrisonIds.includes(id))).toBe(true);
    const current = new Set([
      terrainTileAt(world, 220, 180)!.id, terrainTileAt(world, remote.x, remote.y)!.id,
    ]);
    const clipped = visibleMapConvoys(world, { ...view, current });
    expect(clipped).toHaveLength(1);
    expect(clipped[0].marker).toBe(active.path[active.pathIndex]);
    expect(clipped[0].route.at(-1)?.x).toBeLessThan(remote.x);
    expect(clipped[0].route.every(({ x }) => x >= 200 && x <= 240)).toBe(true);
    expect(clipped.some(({ id }) => id === 'settled-old-plan')).toBe(false);
    expect(visibleMapConvoys(world, { ...view, current: new Set([terrainTileAt(world, remote.x, remote.y)!.id]) })).toEqual([]);
    expect(visibleMapConvoys(world, createTerrainMapView(world, viewer, false))[0].route).toBe(active.path);
    active.status = 'settled';
    expect(mapTransitActorIds(world).size).toBe(0);
    expect(visibleMapConvoys(world, view)).toEqual([]);
  });

  it('keeps secondary history out of the mobile homepage and exposes one active accessible map target', () => {
    expect(renderToStaticMarkup(<App />)).not.toContain('山门迁移与旧址');
    expect(renderToStaticMarkup(<App initialWorkspace="sect" />)).toContain('山门迁移与旧址');
    const { world, viewer, active } = fixture();
    const canvas = () => renderToStaticMarkup(<WorldMapCanvas compact world={world} selectedCultivatorId={viewer.id} onSelectCultivator={() => undefined} />);
    expect(canvas()).toContain('当前可见迁移车队 · 1 支');
    expect(canvas()).toMatch(/<button[^>]*>[^<]*迁移车队 · 第/);
    active.status = 'aborted';
    expect(canvas()).not.toContain('当前可见迁移车队');
  });
});
