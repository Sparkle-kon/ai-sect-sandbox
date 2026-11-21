import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { PilgrimagePanel } from '../src/components/PilgrimagePanel';
import { TerrainSuccessionPanel } from '../src/components/TerrainSuccessionPanel';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { MapPoint, PilgrimageJourney, RoadCrossing, RoadLink } from '../src/types/world';

const middle: MapPoint = { x: 380, y: 340 };
function fixture() {
  const world = createInitialWorld();
  world.tick = 26;
  const sect = world.sects[0];
  const actor = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const companion = world.cultivators.find(({ id }) => id !== actor.id)!;
  const outsider = world.cultivators.find(({ id }) => id !== actor.id && id !== companion.id)!;
  const hq = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const market = world.locations.find(({ id }) => id === 'loc-market')!;
  const otherStop = world.locations.find(({ id }) => id === 'loc-market-east')!;
  Object.assign(hq, { x: 340, y: 340, name: '近处宗门驻地' });
  Object.assign(market, { x: 420, y: 340, name: '可见通商坊市' });
  actor.locationId = companion.locationId = hq.id;
  const road: RoadLink = { id: 'ridge-secret-id', sectId: sect.id, anchorSiteId: hq.id, otherSiteId: market.id,
    path: [{ x: hq.x, y: hq.y }, middle, { x: market.x, y: market.y }], openedTick: 13,
    condition: 57, lastMaintainedTick: 20, lastMaintainedBy: 'unpublished-worker', lastPatrolledTick: 21, lastPatrolledBy: 'unpublished-patrol' };
  world.roads.links = [road];
  const journey: PilgrimageJourney = { id: 'route-case-id', organizerId: actor.id, companionId: companion.id,
    stopIds: [hq.id, market.id, otherStop.id], status: 'active', proposedTick: 20, offerExpiresTick: 23,
    startedTick: 21, expiresTick: 37, stopsVisited: [{ locationId: hq.id, tick: 21 }],
    legIndex: 0, path: [], pathIndex: 0, spentByEach: 8, aid: [] };
  world.pilgrimages.journeys = [journey];
  const crossing: RoadCrossing = { id: 'private-crossing-id', roadId: road.id, journeyId: journey.id, legIndex: 0,
    payerId: actor.id, companionId: companion.id, departedTick: 26, fee: 4, stride: 8, paidSteps: 9, freeSteps: 11, freeStride: 5 };
  const pilgrimage = (observer = actor) => renderToStaticMarkup(<PilgrimagePanel world={world} cultivator={observer} />);
  const map = () => renderToStaticMarkup(<TerrainSuccessionPanel world={world} view={createTerrainMapView(world, actor, true)} selected={actor} />);
  return { world, actor, companion, outsider, hq, market, road, journey, crossing, pilgrimage, map };
}

describe('road ledger and private crossing receipts', () => {
  it('nests the actual term and dated repair in the existing route fold, without rendering IDs or geometry', () => {
    const { world, actor, hq, market, road, map } = fixture();
    const html = map();
    expect(html).toMatch(/地脉修复与路线检核[\s\S]+驿路修缮与关津权限[\s\S]+实测可见路线/);
    expect(html).toContain('近处宗门驻地 ⇄ 可见通商坊市');
    expect(html).toContain('实际开路 Tick #13 · 路况 57/100');
    expect(html).toContain('最近实际修缮 Tick #20');
    expect(html).toContain('最近实际巡查 Tick #21');
    expect(html).toContain('单段路权费 4 灵石（条款，非扣款记录）');
    expect(html).toContain('普通路线不另收路权费，巡礼原有开支不变');
    expect(html).not.toMatch(/ridge-secret-id|unpublished-worker|unpublished-patrol/);
    road.condition = 21;
    expect(map()).toContain('现不可使用付费捷径');
    expect(map()).not.toContain('单段路权费 4');
    road.closedTick = 26;
    road.closeReason = 'title_lost';
    expect(map()).toContain('驻地权属已变更');
    Object.assign(market, { x: 980, y: 20 });
    actor.exploredTileIds = [terrainTileAt(world, market.x, market.y)!.id];
    expect(actor.locationId).toBe(hq.id);
    expect(map()).not.toContain('驿路修缮与关津权限');
    expect(map()).not.toContain('可见通商坊市');
    expect(renderToStaticMarkup(<App />)).not.toContain('驿路修缮与关津权限');
  });

  it('only renders the settled departure payment to the real organizer and companion; estimated time is not arrival', () => {
    const { world, companion, outsider, market, journey, crossing, pilgrimage } = fixture();
    expect(pilgrimage()).not.toContain('驿路启程凭证');
    expect(pilgrimage()).toContain('每人已实付：8 灵石');
    world.roads.crossings = [crossing];
    const html = pilgrimage();
    expect(html).toContain('第 1 段驿路启程凭证 · Tick #26');
    expect(html).toContain('本人实付路权费 4 灵石（一次；同行者未另付）');
    expect(html).toContain('驿路 9 步 / 2 轮行进；普通路线 11 步 / 3 轮行进（不另收路权费）');
    expect(html).toContain('尚无实际到站记录');
    expect(html).not.toContain('private-crossing-id');
    expect(pilgrimage(companion)).toContain('发起人实付路权费 4 灵石');
    expect(pilgrimage(outsider)).toBe('');
    world.tick = 27;
    journey.stopsVisited.push({ locationId: market.id, tick: 27 });
    expect(pilgrimage()).toContain('实际到站 Tick #27');
    world.tick = 25; // no crossing from the future in this selected snapshot
    expect(pilgrimage()).not.toContain('驿路启程凭证');
  });
});
