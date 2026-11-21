import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { PilgrimagePanel } from '../src/components/PilgrimagePanel';
import { visiblePilgrimageMapCheckpoint } from '../src/components/pilgrimageMapView';
import { createTerrainMapView } from '../src/components/terrainMapView';
import * as initialWorldModule from '../src/data/initialWorld';
import type { PilgrimageJourney } from '../src/types/world';

function fixture() {
  const world = initialWorldModule.createInitialWorld();
  world.tick = 12;
  const [viewer, companion, outsider] = world.cultivators;
  const source = world.locations.find(({ id }) => id === 'loc-market')!;
  const first = world.locations.find(({ id }) => id === 'loc-market-east')!;
  const hidden = world.locations.find(({ id }) => id === 'loc-vein-north')!;
  source.name = '相约坊市';
  first.name = '已知检查站';
  hidden.name = '不可查的远方站';
  hidden.x = 990;
  hidden.y = 10;
  viewer.name = '本人发起的修士';
  companion.name = '可读的实际同行者';
  outsider.name = '私密外部参与者';
  viewer.locationId = companion.locationId = source.id;
  viewer.exploredTileIds = [];
  companion.exploredTileIds = [];
  const journey: PilgrimageJourney = {
    id: 'my-journey', organizerId: viewer.id, companionId: companion.id, stopIds: [source.id, first.id, hidden.id],
    stopsVisited: [], status: 'proposed', proposedTick: 11, offerExpiresTick: 14,
    legIndex: 0, path: [], pathIndex: 0, spentByEach: 0, aid: [],
  };
  world.pilgrimages.journeys = [journey];
  const html = (actor = viewer) => renderToStaticMarkup(<PilgrimagePanel world={world} cultivator={actor} />);
  return { world, viewer, companion, outsider, source, first, hidden, journey, html };
}

describe('participant pilgrimage detail and fogged checkpoints', () => {
  it('shows an actual pending invitation without assuming consent, hides unknown stops and nonparticipant visits', () => {
    const { world, companion, outsider, journey, html } = fixture();
    const markup = html();
    expect(markup).toContain('同行邀约待回应 · 本人发起 · 可读的实际同行者');
    expect(markup).toContain('回应截止 Tick #14');
    expect(markup).toContain('实际已到检查站：0/2 · 每人已实付：0 灵石');
    expect(markup).toContain('检查站 1：已知检查站');
    expect(markup).toContain('检查站 2：此时点不可查的站点');
    expect(markup).not.toContain('不可查的远方站');
    expect(markup).not.toContain('同行者已接受');
    expect(markup).not.toContain('<button');
    expect(html(companion)).toContain('本人受邀');
    expect(html(outsider)).toBe('');
    journey.status = 'declined';
    journey.reason = 'declined';
    journey.settledTick = world.tick;
    expect(html()).toContain('同行者已拒绝');
    expect(html()).toContain('结案：同行者未同意 · Tick #12');
  });

  it('shows real paid departures, one actual arrival and received aid in interrupted history, never full success', () => {
    const { world, source, first, journey, html } = fixture();
    world.tick = 19;
    journey.status = 'interrupted';
    journey.startedTick = 12;
    journey.expiresTick = 28;
    journey.settledTick = 19;
    journey.reason = 'lost_site';
    journey.spentByEach = 16;
    journey.stopsVisited = [{ locationId: source.id, tick: 12 }, { locationId: first.id, tick: 16 }];
    journey.aid = [{ giverId: journey.companionId, receiverId: journey.organizerId, locationId: first.id, hpRestored: 9, tick: 17 }];
    const markup = html();
    expect(markup).toContain('同行者已接受 · Tick #12');
    expect(markup).toContain('结案：原路线站点已失效 · Tick #19');
    expect(markup).toContain('实际已到检查站：1/2 · 每人已实付：16 灵石');
    expect(markup).toContain('已知检查站 · 实际到站 Tick #16');
    expect(markup).toContain('同行者施援给本人 · 实际恢复 9 点气血');
    expect(markup).not.toContain('已完成巡礼');
  });

  it('adds just one closed section only when the selected character owns a journey', () => {
    const { world, viewer } = fixture();
    const initial = vi.spyOn(initialWorldModule, 'createInitialWorld').mockImplementation(() => structuredClone(world));
    try {
      const people = renderToStaticMarkup(<App initialWorkspace="people" />);
      expect(people).toContain('朝山巡礼与共愿');
      expect(people).toMatch(/aria-expanded="false"[^>]+>朝山巡礼与共愿/);
      expect(people).not.toContain('本人巡礼与共愿档案');
      expect(renderToStaticMarkup(<App />)).not.toContain('朝山巡礼与共愿');
      world.pilgrimages.journeys[0].organizerId = world.cultivators.find(({ id }) => id !== viewer.id && id !== world.pilgrimages.journeys[0].companionId)!.id;
      expect(renderToStaticMarkup(<App initialWorkspace="people" />)).not.toContain('朝山巡礼与共愿');
    } finally {
      initial.mockRestore();
    }
  });

  it('shows selected actual underway checkpoint only when visible and leaves the mobile default uncluttered', () => {
    const { world, source, first, viewer, companion, outsider, journey } = fixture();
    expect(renderToStaticMarkup(<App />)).not.toContain('朝山巡礼与共愿');
    expect(renderToStaticMarkup(<App initialWorkspace="people" />)).not.toContain('朝山巡礼与共愿');
    journey.status = 'active';
    journey.startedTick = 12;
    journey.expiresTick = 28;
    journey.stopsVisited = [{ locationId: source.id, tick: 12 }];
    journey.spentByEach = 8;
    const midpoint = { x: (source.x + first.x) / 2, y: (source.y + first.y) / 2 };
    journey.path = [{ x: source.x, y: source.y }, midpoint, { x: first.x, y: first.y }];
    journey.pathIndex = 1;
    journey.lastMovedTick = 12;
    const mark = (actor = viewer, fog = false) => visiblePilgrimageMapCheckpoint(world, createTerrainMapView(world, actor, fog), actor);
    expect(mark()?.point).toEqual(midpoint);
    expect(mark(companion)?.point).toEqual(midpoint);
    expect(mark(outsider)).toBeUndefined();
    expect(mark(viewer, true)?.point).toEqual(midpoint);
    outsider.locationId = source.id;
    const maskedView = createTerrainMapView(world, outsider, true);
    expect(visiblePilgrimageMapCheckpoint(world, maskedView, viewer)).toBeUndefined();
    journey.status = 'withdrawn';
    expect(mark()).toBeUndefined();
  });
});
