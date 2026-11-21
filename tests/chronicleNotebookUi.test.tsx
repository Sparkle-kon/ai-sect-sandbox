import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { availableBookmarkEvents, ChronicleNotebookPanel } from '../src/components/ChronicleNotebookPanel';
import { annotationWriteIsCurrent } from '../src/components/annotationUi';
import { mapAnnotationPins } from '../src/components/mapAnnotationView';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyAnnotation } from '../src/engine/annotationsEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { WorldEvent } from '../src/types/world';

const ignoreWrite = async () => 'readonly' as const;
function fixture() {
  let world = createInitialWorld();
  world.tick = 9;
  const [viewer, observer] = world.cultivators;
  const site = world.locations.find(({ type }) => type === 'secret_realm')!;
  Object.assign(site, { x: 950, y: 530, name: '仅知情修士看见的远处' });
  const tile = terrainTileAt(world, site.x, site.y)!;
  viewer.exploredTileIds = [tile.id];
  observer.locationId = viewer.locationId;
  observer.exploredTileIds = [];
  observer.rumors = [];
  const event: WorldEvent = { id: 'public-test-event', tick: 8, year: world.year, month: world.month, title: '可取证的公开纪事',
    description: '公开', category: 'diplomacy', actorIds: [viewer.id], locationId: site.id };
  world.events = [event, { ...event, id: 'private-test-event', title: '当事人纪事不应显示', witnessScope: 'participants' },
    { ...event, id: 'future-test-event', title: '尚未发生纪事不应显示', tick: 10 }];
  world.chronicleArchive.anchors.push({ ...event, id: 'retained-public-anchor', title: '留存的公开原始见证' });
  const prior = structuredClone(world);
  const savedBookmark = applyAnnotation(world, viewer.id, { kind: 'add_bookmark', eventId: event.id });
  if (!savedBookmark.ok) throw Error(savedBookmark.code);
  world = savedBookmark.world;
  const savedNote = applyAnnotation(world, viewer.id, { kind: 'add_note', target: { kind: 'site', locationId: site.id }, text: '只有后续这个分支的山径提示' });
  if (!savedNote.ok) throw Error(savedNote.code);
  world = savedNote.world;
  return { world, prior, viewer, observer, site, tile };
}

describe('chronicle notebook branch visibility and authority', () => {
  it('lists actual public events and renders historical branch data without any write controls', () => {
    const { world, prior, viewer, observer } = fixture();
    const listed = availableBookmarkEvents(world).map(({ title }) => title);
    expect(listed).toContain('可取证的公开纪事');
    expect(listed).toContain('留存的公开原始见证');
    expect(listed.every((title) => !title.includes('不应显示'))).toBe(true);
    const html = (state = world, actorId = viewer.id, readOnly = true) => renderToStaticMarkup(<ChronicleNotebookPanel world={state}
      actorId={actorId} readOnly={readOnly} busy={false} branchId="only-active-branch" onWrite={ignoreWrite} />);
    expect(html()).toContain('历史只读');
    expect(html()).toContain('只有后续这个分支的山径提示');
    expect(html()).not.toContain('<button');
    expect(html(prior)).not.toContain('只有后续这个分支的山径提示');
    expect(html(prior)).not.toContain('可取证的公开纪事');
    expect(html(world, observer.id)).not.toContain('仅知情修士看见的远处');
    expect(html(world, viewer.id, false)).toContain('添加地图批注');
  });

  it('plots only current or remembered known pins and keeps a removed site at its originally known tile', () => {
    const { world, viewer, observer, site, tile } = fixture();
    const owned = createTerrainMapView(world, viewer, true);
    expect(owned.tileState(tile)).toBe('explored');
    expect(mapAnnotationPins(world, owned, viewer.id)[0]).toMatchObject({ point: { x: site.x, y: site.y }, historical: false });
    expect(mapAnnotationPins(world, createTerrainMapView(world, observer, true), observer.id)).toEqual([]);
    expect(mapAnnotationPins(world, createTerrainMapView(world, undefined, false), null)).toEqual([]);
    world.locations = world.locations.filter(({ id }) => id !== site.id);
    expect(mapAnnotationPins(world, createTerrainMapView(world, viewer, true), viewer.id)[0]).toMatchObject({ historical: true });
  });

  it('requires an exact authority reference and branch, with no initial homepage mount', () => {
    const { world, viewer } = fixture();
    const stamp = { world, branchId: 'one', actorId: viewer.id };
    expect(annotationWriteIsCurrent(stamp, world, 'one', false)).toBe(true);
    expect(annotationWriteIsCurrent(stamp, structuredClone(world), 'one', false)).toBe(false);
    expect(annotationWriteIsCurrent(stamp, world, 'two', false)).toBe(false);
    expect(annotationWriteIsCurrent(stamp, world, 'one', true)).toBe(false);
    expect(annotationWriteIsCurrent(stamp, world, 'one', false, true)).toBe(false);
    expect(renderToStaticMarkup(<App />)).not.toContain('书签与地图批注');
    expect(renderToStaticMarkup(<App initialWorkspace="chronicle" />)).toContain('书签与地图批注');
  });
});
