import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { MapKeyboardExplorer, mapExplorerIndex } from '../src/components/MapKeyboardExplorer';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { buildMapPresentation } from '../src/components/mapPresentationView';
import { focusMapPoint, mapCameraCommand, mapKeyboardCommand, shouldAnimateMap } from '../src/components/mapKeyboard';
import { DEFAULT_CAMERA, MAP_HEIGHT, MAP_WIDTH, mapToScreen } from '../src/components/mapCamera';

const key = (key: string, modifiers = {}) => mapKeyboardCommand({ key, altKey: false, ctrlKey: false, metaKey: false, ...modifiers });
const noop = () => undefined;

function fixture() {
  const world = createInitialWorld();
  world.tick = 4;
  const [here, remembered, hidden] = world.locations;
  Object.assign(here, { name: '近处公开地点', x: 160, y: 160 });
  Object.assign(remembered, { name: '已走访的远处', x: 800, y: 480 });
  Object.assign(hidden, { name: '无权查看的地点', x: 920, y: 120 });
  const [viewer, local, remote] = world.cultivators;
  viewer.name = '地图视角修士';
  viewer.locationId = local.locationId = here.id;
  local.name = '可见修士甲';
  remote.name = '远方修士乙';
  remote.locationId = remembered.id;
  viewer.exploredTileIds = [terrainTileAt(world, remembered.x, remembered.y)!.id];
  world.mapPresentation = { tick: world.tick, trails: [], effects: [
    { id: 'local-breakthrough', tick: world.tick, kind: 'breakthrough', locationId: here.id, actorIds: [local.id], text: '内部不复制正文' },
    { id: 'private-intrigue-clash', tick: world.tick, kind: 'clash', locationId: here.id, actorIds: [local.id], text: '不公开案情' },
    { id: 'remote-lightning', tick: world.tick, kind: 'lightning', locationId: remembered.id, actorIds: [remote.id] },
  ] };
  world.events.push({ id: 'private-intrigue', tick: world.tick, year: world.year, month: world.month, locationId: here.id,
    actorIds: [local.id], category: 'intrigue', title: '不公开事由', description: '不公开案情', witnessScope: 'participants' });
  const scenery = () => {
    const view = createTerrainMapView(world, viewer, true);
    const actorPositions = mapActorPositions(view.seenLocations, view.liveActors);
    const presentation = buildMapPresentation(world, view, actorPositions);
    return { world, view, actorPositions, presentation };
  };
  return { world, viewer, here, remembered, hidden, local, remote, scenery };
}

describe('map keyboard and accessible target parity', () => {
  it('shares clamped pan, zoom, reset and selected focus while reserving browser shortcuts', () => {
    expect([key('ArrowLeft'), key('ArrowDown'), key('+'), key('-'), key('Home'), key('F')]).toEqual(['left', 'down', 'in', 'out', 'home', 'selected']);
    expect(key('ArrowLeft', { altKey: true })).toBeUndefined();
    expect(key('+', { ctrlKey: true })).toBeUndefined();
    expect(key('f', { metaKey: true })).toBeUndefined();
    expect(key('Tab')).toBeUndefined();
    expect(key('Enter')).toBeUndefined(); // Native buttons/summary own activation.
    const focused = mapCameraCommand(DEFAULT_CAMERA, 'selected', { x: 600, y: 300 });
    expect(focused).toEqual(focusMapPoint(DEFAULT_CAMERA, { x: 600, y: 300 }));
    expect(mapToScreen(focused, { x: 600, y: 300 })).toEqual({ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 });
    expect(mapCameraCommand(focused, 'right').x).toBeLessThan(focused.x);
    expect(mapCameraCommand(focused, 'in').zoom).toBeGreaterThan(focused.zoom);
    expect(mapCameraCommand(focused, 'home')).toBe(DEFAULT_CAMERA);
    expect(mapCameraCommand(DEFAULT_CAMERA, 'selected')).toBe(DEFAULT_CAMERA);
  });

  it('limits event and actor targets to the currently visible map while remembering terrain names', () => {
    const { world, here, remembered, hidden, local, remote, scenery } = fixture();
    const { view, actorPositions, presentation } = scenery();
    const index = mapExplorerIndex(world, view, actorPositions, presentation);
    expect(index.sites).toContainEqual({ site: remembered, current: false });
    expect(index.sites.some(({ site }) => site.id === hidden.id)).toBe(false);
    expect(index.actors.map(({ id }) => id)).toContain(local.id);
    expect(index.actors.map(({ id }) => id)).not.toContain(remote.id);
    expect(index.events).toEqual([{ id: 'effect-local-breakthrough', label: '突破', site: here }]);
    const originalIndex = index.actors.findIndex(({ id }) => id === local.id);
    local.realm = '筑基';
    const after = scenery();
    const evolved = mapExplorerIndex(world, after.view, after.actorPositions, after.presentation);
    expect(evolved.actors[originalIndex]).toMatchObject({ id: local.id, realm: '筑基' });
    world.tick++;
    const later = scenery();
    expect(mapExplorerIndex(world, later.view, later.actorPositions, later.presentation).events).toHaveLength(0);
  });

  it('points to public doctrine negotiations and realized charter changes only at visible headquarters', () => {
    const { world, here, remembered, local, viewer, scenery } = fixture();
    const [localSect, remoteSect] = world.sects;
    localSect.headquartersId = here.id;
    remoteSect.headquartersId = remembered.id;
    world.doctrines.schools = [localSect, remoteSect].map((sect) => ({
      id: `school-${sect.id}`, parentSectId: sect.id, founderId: viewer.id, theme: 'community',
      foundedTick: 1, status: 'attached', memberIds: [], treasury: 0,
    }));
    world.doctrines.proposals = world.doctrines.schools.map((school, offset) => ({
      id: `p${offset}`, schoolId: school.id, kind: 'separation', openedTick: 3, expiresTick: 8,
      status: 'pending', stewardId: local.id, leaderId: viewer.id, amount: 30, votes: [],
    }));
    const locations = () => {
      const { view, actorPositions, presentation } = scenery();
      return mapExplorerIndex(world, view, actorPositions, presentation).events;
    };
    expect(locations().filter(({ id }) => id.startsWith('doctrine-'))).toEqual([
      { id: 'doctrine-p0', label: '道统分立待签议', site: here },
    ]);
    world.doctrines.proposals[0].status = 'accepted';
    world.doctrines.records = [{ id: 'r0', tick: world.tick, schoolId: world.doctrines.schools[0].id,
      kind: 'separation', actorIds: [viewer.id, local.id], amount: 30, support: 3, description: '已交割' }];
    expect(locations().filter(({ id }) => id.startsWith('doctrine-'))).toEqual([
      { id: 'doctrine-r0', label: '道统和平分立', site: here },
    ]);
  });

  it('renders native activation controls behind a closed default disclosure and leaves targets available in reduced-motion mode', () => {
    const { world, viewer, scenery } = fixture();
    expect(shouldAnimateMap(true, true)).toBe(false);
    expect(shouldAnimateMap(false, false)).toBe(false);
    expect(shouldAnimateMap(undefined, true)).toBe(false);
    expect(shouldAnimateMap(false, true)).toBe(true);
    const compact = renderToStaticMarkup(<WorldMapCanvas compact world={world} selectedCultivatorId={viewer.id} onSelectCultivator={noop} />);
    expect(compact).toMatch(/<canvas[^>]*tabindex="0"[^>]*aria-describedby=/);
    expect(compact).toMatch(/<details(?![^>]*\bopen)[^>]*><summary[^>]*>山河索引<\/summary><\/details>/);
    expect(compact).not.toContain('可操作地图索引');
    const index = renderToStaticMarkup(<MapKeyboardExplorer {...scenery()} selected={viewer} follows={false} zoom={2}
      onFollow={noop} onCamera={noop} onActor={noop} onSite={noop} onFocusLost={noop} />);
    expect(index).toContain('定位所选修士');
    expect(index).toContain('跟随所选修士');
    expect(index).toContain('当前可见事件');
    expect(index).toMatch(/<button[^>]*>近处公开地点/);
    expect(index).toContain('已探索，当前不可见');
    expect(index).not.toContain('无权查看的地点');
  });
});
