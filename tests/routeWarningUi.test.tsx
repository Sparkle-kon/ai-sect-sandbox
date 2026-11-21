import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RouteWarningPanel } from '../src/components/RouteWarningPanel';
import { TerrainSuccessionPanel } from '../src/components/TerrainSuccessionPanel';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { availablePilgrimageActions, resolvePilgrimageAction } from '../src/engine/pilgrimageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { Cultivator, LLMDecisionPayload, WorldState } from '../src/types/world';

const action = (chosenAction: LLMDecisionPayload['chosenAction'], fields: Partial<LLMDecisionPayload> = {}): LLMDecisionPayload =>
  ({ chosenAction, innerMonologue: '', ...fields });
const person = (world: WorldState, id: string) => world.cultivators.find((row) => row.id === id)!;
const turn = (world: WorldState, options: Record<string, LLMDecisionPayload> = {}) => advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(({ id }) => [id, options[id] ?? action('REST')])), () => .99);

function fixture() {
  const world = createInitialWorld(13071);
  world.tick = 24;
  const start = world.locations.find(({ id }) => id === 'loc-taixu')!;
  const middle = world.locations.find(({ id }) => id === 'loc-market')!;
  const stop = world.locations.find(({ id }) => id === 'loc-market-east')!;
  Object.assign(start, { x: 220, y: 220 });
  Object.assign(middle, { x: 340, y: 220 });
  Object.assign(stop, { x: 380, y: 220 });
  const [one, partner, other, helper, outsider] = world.cultivators;
  one.name = '私域甲名字'; other.name = '私域乙名字';
  for (const actor of world.cultivators) actor.locationId = stop.id;
  for (const actor of [one, partner, other, helper]) Object.assign(actor, { locationId: start.id, hp: actor.maxHp,
    alive: true, spiritStones: 220, tribulation: undefined, exploredTileIds: world.terrain.tiles.map(({ id }) => id) });
  outsider.realm = '练气';
  const walk = (leader: Cultivator, companion: Cultivator) => {
    const offer = availablePilgrimageActions(leader, world).find((option) =>
      option.pilgrimageMove === 'propose' && option.targetCultivatorId === companion.id)!;
    expect(offer).toMatchObject({ targetLocationId: middle.id, targetPilgrimageNextStopId: stop.id });
    expect(resolvePilgrimageAction(world, leader, action('PILGRIMAGE', offer))).not.toBeNull();
    const id = world.pilgrimages.journeys.at(-1)!.id;
    expect(resolvePilgrimageAction(world, companion, action('PILGRIMAGE', { pilgrimageMove: 'accept', targetPilgrimageId: id }))).not.toBeNull();
    return action('PILGRIMAGE', { pilgrimageMove: 'advance', targetPilgrimageId: id });
  };
  const [left, right] = [walk(one, partner), walk(other, helper)];
  const crossed = turn(applyMapBrush(world, 'cursed_miasma', [{ x: 260, y: 220 }]), { [one.id]: left, [other.id]: right });
  const first = crossed.routeWarnings.observations.find(({ actorId }) => actorId === one.id)!;
  const second = crossed.routeWarnings.observations.find(({ actorId }) => actorId === other.id)!;
  const posted = turn(crossed, { [one.id]: action('ROUTE_WARNING', { routeWarningMove: 'post', targetRouteObservationId: first.id }) });
  const notice = posted.routeWarnings.notices[0];
  const verify = () => turn(posted, { [other.id]: action('ROUTE_WARNING', { routeWarningMove: 'corroborate',
    targetRouteObservationId: second.id, targetRouteWarningId: notice.id }) });
  const retract = () => turn(posted, { [one.id]: action('ROUTE_WARNING', { routeWarningMove: 'retract', targetRouteWarningId: notice.id }) });
  return { crossed, posted, notice, verify, retract, one: one.id, other: other.id, outsider: outsider.id, start: start.id };
}

function panel(world: WorldState, viewer: string, observed?: ReadonlySet<string>) {
  return renderToStaticMarkup(<RouteWarningPanel world={world} viewer={person(world, viewer)} observed={observed} />);
}

describe('current public warning reading and owner-only expiry records', () => {
  it('shows only a first-hand visible adjacent warning, supports a real current detour, and never prints identities or geometry', () => {
    const { crossed, posted, notice, one, outsider, start } = fixture();
    expect(panel(crossed, one)).toBe('');
    expect(panel(posted, outsider)).toBe('');
    const stranger = person(posted, outsider);
    stranger.locationId = start;
    stranger.realm = '元婴';
    const available = panel(posted, outsider);
    expect(available).toContain('驿路警示与旁证');
    expect(available).toContain('瘴气 · 实测强度 1');
    expect(available).toContain(`亲历第 ${notice.observation.observedTick} 轮 · 第 ${notice.postedTick} 轮张贴 · 第 ${notice.expiresTick} 轮起失效`);
    expect(available).toContain('尚无另一支同行队伍的独立旁证');
    expect(available).toContain('当前视野内另证 4 步局部绕行');
    expect(available).toContain('不是封路，也不改变普通路线');
    expect(available).not.toMatch(/本人张贴史|私域甲名字|私域乙名字|<canvas|<details/);
    for (const hidden of [notice.id, notice.observation.id, notice.observation.fromTileId, notice.observation.toTileId, notice.observation.exitTileId!])
      expect(available).not.toContain(hidden);
    const endpoints = new Set([notice.observation.fromTileId, notice.observation.toTileId]);
    const withoutExit = panel(posted, outsider, endpoints);
    expect(withoutExit).toContain('当前视野不足以核验绕行，不等于道路已阻断');
    expect(withoutExit).not.toContain('另证 4 步');
    expect(panel(posted, outsider, new Set([notice.observation.fromTileId]))).toBe('');
    const baseMap = renderToStaticMarkup(<TerrainSuccessionPanel world={posted} view={createTerrainMapView(posted, stranger, false)} selected={stranger} />);
    expect(baseMap.indexOf('实测可见路线')).toBeLessThan(baseMap.indexOf('驿路警示与旁证'));
    stranger.locationId = worldRemoteSite(posted, start);
    expect(panel(posted, outsider)).toBe('');
  });

  it('labels only truly independent corroboration, then only the original author can see own retraction or expiry', () => {
    const { posted, notice, verify, retract, one, other } = fixture();
    const verified = verify();
    const corroborated = panel(verified, one);
    expect(corroborated).toContain(`已有另一支同行队伍独立旁证 · 第 ${verified.tick} 轮`);
    expect(corroborated).toContain('本人张贴史');
    expect(panel(verified, other)).not.toContain('本人张贴史');
    const withdrawn = retract();
    const author = panel(withdrawn, one);
    expect(author).toContain('已由本人撤回');
    expect(author).toContain(`第 ${withdrawn.tick} 轮撤回`);
    expect(author).toContain('此处不显示旧警示位置');
    expect(author).not.toContain('实测强度');
    expect(panel(withdrawn, other)).toBe('');
    let expired = posted;
    while (expired.tick < notice.expiresTick) expired = turn(expired);
    expect(panel(expired, one)).toContain('已过期');
    expect(panel(expired, one)).not.toContain('实测强度');
    expect(panel(expired, other)).toBe('');
  });
});

const worldRemoteSite = (world: WorldState, start: string) => world.locations
  .find((site) => site.id !== start && Math.hypot(site.x - 260, site.y - 220) > 300)!.id;
