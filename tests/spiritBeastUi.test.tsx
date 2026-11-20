import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentInspector } from '../src/components/AgentInspector';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { visibleBeastsByLocation } from '../src/components/spiritBeastView';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { SpiritBeast } from '../src/types/world';

const ignore = () => undefined;

function fixture() {
  const world = createInitialWorld();
  const [viewer, stranger] = world.cultivators;
  const [here, remote] = world.locations;
  viewer.locationId = here.id;
  stranger.locationId = remote.id;
  viewer.exploredTileIds = [terrainTileAt(world, remote.x, remote.y)!.id];
  const base = {
    id: 'wild-fixture', name: '凶芒兽', kind: '凶兽', locationId: here.id, homeLocationId: remote.id,
    hp: 61, maxHp: 80, power: 195, cultivation: 18, alive: true, nextActionTick: 7,
  } satisfies SpiritBeast;
  const trailing: SpiritBeast = { ...base, id: 'pet-fixture', name: '远行瑞鹿', kind: '瑞兽', locationId: remote.id, tamedBy: viewer.id };
  world.spiritBeasts = [
    base, trailing,
    { ...base, id: 'closed', name: '已陨之兽', alive: false },
    { ...base, id: 'stranger-beast', name: '坊市冰狐', kind: '妖兽', tamedBy: stranger.id },
    { ...base, id: 'remote-wild', name: '远地奇兽', kind: '妖兽', locationId: remote.id },
  ];
  const inspect = () => renderToStaticMarkup(<AgentInspector world={world} cultivator={viewer} onSelectCultivator={ignore} />);
  const map = () => renderToStaticMarkup(<WorldMapCanvas world={world} selectedCultivatorId={viewer.id} onSelectCultivator={ignore} />);
  return { world, viewer, stranger, here, remote, trailing, inspect, map };
}

describe('wildlife and spirit pet presentation', () => {
  it('inspects only selected-owned pets and living untamed local beasts', () => {
    const { here, remote, trailing, inspect } = fixture();
    const html = inspect();
    const panel = html.split('aria-label="灵宠与野兽"')[1]?.split('</section>')[0];
    expect(panel).toContain('契约灵宠 · 1 只');
    expect(panel).toContain('远行瑞鹿');
    expect(panel).toContain('尚未会合');
    expect(panel).toContain('气血 61/80 · 战力 195 · 修为 18');
    expect(panel).toContain('此地野兽 · 1 只 · 有凶兽出没');
    expect(panel).toContain('凶芒兽');
    expect(panel).not.toContain(remote.name);
    expect(panel).not.toContain('远地奇兽');
    expect(panel).not.toContain('坊市冰狐');
    expect(panel).not.toContain('已陨之兽');
    trailing.locationId = here.id;
    expect(inspect()).toContain('同行');
  });

  it('uses only live current visibility in map projection, not remembered tiles or ownership', () => {
    const { world, viewer, here, remote } = fixture();
    const filtered = visibleBeastsByLocation(world, createTerrainMapView(world, viewer, true));
    expect(filtered.get(here.id)?.map(({ name }) => name)).toEqual(['凶芒兽', '坊市冰狐']);
    expect(filtered.has(remote.id)).toBe(false);
    const full = visibleBeastsByLocation(world, createTerrainMapView(world, viewer, false));
    expect(full.get(remote.id)?.map(({ name }) => name)).toEqual(['远行瑞鹿', '远地奇兽']);
    viewer.alive = false;
    expect(visibleBeastsByLocation(world, createTerrainMapView(world, viewer, true)).size).toBe(0);
  });

  it('provides text equivalents for visible wildlife without exposing pet owner identifiers', () => {
    const { stranger, viewer, map, inspect, world } = fixture();
    const html = map();
    expect(html).toContain('可见灵兽 2 只');
    expect(html).toContain('凶芒兽（凶兽 · 野生）');
    expect(html).toContain('坊市冰狐（妖兽 · 已结契）');
    expect(html).not.toContain(stranger.id);
    expect(html).not.toContain('已陨之兽');
    viewer.alive = false;
    expect(inspect()).toContain('无可查看的当前地点野兽记录。');
    world.spiritBeasts = [];
    expect(inspect()).toContain('尚无存活的契约灵宠。');
  });
});
