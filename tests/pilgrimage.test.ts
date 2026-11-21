import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  activePilgrimageForActor, advancePilgrimages, availablePilgrimageActions, createPilgrimageState, PILGRIMAGE_ACTIVE_TICKS,
  PILGRIMAGE_LEG_COST, PILGRIMAGE_OFFER_TICKS, PILGRIMAGE_RELIEF_HP, pilgrimageActedThisTick, pilgrimageCheckpoint,
  resolvePilgrimageAction, visiblePilgrimages,
} from '../src/engine/pilgrimageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, LLMDecisionPayload, PilgrimageMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(13071);
  world.pilgrimages = createPilgrimageState();
  world.tick = 10;
  const site = world.locations.find(({ id }) => id === 'loc-taixu')!;
  const [leader, partner, outsider] = world.cultivators;
  for (const actor of world.cultivators) {
    actor.locationId = actor === leader || actor === partner ? site.id : 'loc-market-east';
    actor.spiritStones = 100;
    actor.exploredTileIds = [];
    actor.rumors = [];
    actor.herbs.jade_leaf = 3;
  }
  const act = (actor: Cultivator, pilgrimageMove: PilgrimageMove, fields: Partial<LLMDecisionPayload> = {}) =>
    resolvePilgrimageAction(world, actor, { chosenAction: 'PILGRIMAGE', pilgrimageMove, innerMonologue: '只认实际共同到达', ...fields });
  const options = () => availablePilgrimageActions(leader, world).find((option) => option.pilgrimageMove === 'propose' && option.targetCultivatorId === partner.id);
  const propose = () => {
    expect(options()).toBeDefined();
    const { targetLocationId, targetPilgrimageNextStopId } = options()!;
    expect(act(leader, 'propose', { targetCultivatorId: partner.id, targetLocationId, targetPilgrimageNextStopId })?.witnessScope).toBe('participants');
    return world.pilgrimages.journeys[0];
  };
  const accept = () => {
    const journey = propose();
    expect(act(partner, 'accept', { targetPilgrimageId: journey.id })?.title).toBe('两人自愿立下巡礼共愿');
    return journey;
  };
  return { world, site, leader, partner, outsider, act, options, propose, accept };
}

describe('pilgrimage paths and voluntary shared vows', () => {
  it('only proposes real mutually known routes, with no reveals or travel when proposing and freely declining', () => {
    const { world, site, leader, partner, outsider, act, propose } = fixture();
    expect(act(leader, 'propose', { targetCultivatorId: partner.id, targetLocationId: 'loc-secret-1', targetPilgrimageNextStopId: 'loc-market' })).toBeNull();
    expect(act(leader, 'propose', { targetCultivatorId: partner.id, targetLocationId: 'loc-vein-north', targetPilgrimageNextStopId: 'loc-market' })).toBeNull();
    expect(availablePilgrimageActions(leader, world, false)).toEqual([]);
    const journey = propose();
    expect(journey.offerExpiresTick).toBe(world.tick + PILGRIMAGE_OFFER_TICKS);
    expect(journey.stopsVisited).toEqual([]);
    expect(journey.path).toEqual([]);
    expect(visiblePilgrimages(world, outsider)).toEqual([]);
    expect(visiblePilgrimages(world, partner)[0].knownStopIds).toEqual(journey.stopIds);
    expect(leader.exploredTileIds).toEqual([]);
    expect(partner.exploredTileIds).toEqual([]);
    expect(leader.locationId).toBe(site.id);
    expect(partner.locationId).toBe(site.id);
    expect(leader.spiritStones).toBe(100);
    expect(act(leader, 'accept', { targetPilgrimageId: journey.id })).toBeNull();
    expect(act(outsider, 'accept', { targetPilgrimageId: journey.id })).toBeNull();
    expect(act(partner, 'decline', { targetPilgrimageId: journey.id })?.title).toBe('同行邀约被谢绝');
    expect(act(partner, 'decline', { targetPilgrimageId: journey.id })).toBeNull();
    expect(availablePilgrimageActions(leader, world)).toEqual([]);
    expect(journey).toMatchObject({ status: 'declined', reason: 'declined', spentByEach: 0 });
  });

  it('advances a known road by actual strides, deducts each leg only once, and preserves same-tick participant blocking', () => {
    const { world, site, leader, partner, act, accept } = fixture();
    const journey = accept();
    const args = { targetPilgrimageId: journey.id };
    expect(journey.stopsVisited).toEqual([{ locationId: site.id, tick: world.tick }]);
    expect(pilgrimageActedThisTick(world, partner)).toBe(true);
    expect(act(leader, 'advance', args)).toBeNull();
    expect(partner.spiritStones).toBe(100);
    expect(leader.spiritStones).toBe(100);
    expect(partner.locationId).toBe(site.id);
    const visitedBeforeWalking = [...partner.exploredTileIds];
    world.tick++;
    const first = act(leader, 'advance', args);
    expect(first?.title).toBe('沿已勘路线结伴前行');
    expect(pilgrimageCheckpoint(world, partner)).toBeDefined();
    expect(pilgrimageCheckpoint(world, leader)).toEqual(pilgrimageCheckpoint(world, partner));
    expect(partner.locationId).toBe(site.id);
    expect(journey.stopsVisited).toHaveLength(1);
    expect(partner.spiritStones).toBe(100 - PILGRIMAGE_LEG_COST);
    expect(leader.spiritStones).toBe(100 - PILGRIMAGE_LEG_COST);
    expect(act(leader, 'advance', args)).toBeNull();
    expect(act(partner, 'withdraw', args)).toBeNull();
    const seen = new Set([...visitedBeforeWalking, ...journey.path.slice(1, journey.pathIndex + 1).map((point) => terrainTileAt(world, point.x, point.y)?.id)]);
    expect(new Set(partner.exploredTileIds)).toEqual(seen);
    expect(visiblePilgrimages(world, partner)[0].journey).not.toHaveProperty('path');
    for (let i = 0; i < PILGRIMAGE_ACTIVE_TICKS && journey.status === 'active'; i++) {
      world.tick++;
      expect(act(leader, 'advance', args)).not.toBeNull();
      expect(pilgrimageActedThisTick(world, partner)).toBe(true);
    }
    expect(journey).toMatchObject({ status: 'completed', path: [], pathIndex: 0, legIndex: 2, spentByEach: 2 * PILGRIMAGE_LEG_COST });
    expect(journey.stopsVisited.map(({ locationId }) => locationId)).toEqual(journey.stopIds);
    expect(leader.locationId).toBe(journey.stopIds[2]);
    expect(partner.locationId).toBe(journey.stopIds[2]);
    expect(leader.spiritStones).toBe(100 - 2 * PILGRIMAGE_LEG_COST);
    expect(partner.spiritStones).toBe(100 - 2 * PILGRIMAGE_LEG_COST);
    expect(pilgrimageCheckpoint(world, partner)).toBeUndefined();
    expect(advancePilgrimages(world)).toEqual([]);
  });

  it('spends one real herb for only actual missing HP and lets a participant stop without paying the next leg', () => {
    const { world, leader, partner, act, accept } = fixture();
    const journey = accept();
    const args = { targetPilgrimageId: journey.id };
    partner.hp = partner.maxHp - 4;
    expect(act(leader, 'relieve', args)).toBeNull();
    world.tick++;
    expect(act(leader, 'relieve', args)?.title).toBe('同行者互助');
    expect(partner.hp).toBe(partner.maxHp);
    expect(leader.herbs.jade_leaf).toBe(2);
    expect(journey.aid).toEqual([{ tick: world.tick, giverId: leader.id, receiverId: partner.id, hpRestored: 4, locationId: leader.locationId }]);
    partner.hp -= PILGRIMAGE_RELIEF_HP;
    expect(act(leader, 'relieve', args)).toBeNull();
    expect(act(partner, 'withdraw', args)?.title).toBe('止步退出巡礼');
    expect(journey).toMatchObject({ status: 'withdrawn', reason: 'withdrawn', spentByEach: 0 });
    expect(leader.spiritStones).toBe(100);
  });

  it('leaves partial visits and actual costs after losing a planned site or the companion', () => {
    const { world, leader, partner, act, accept } = fixture();
    const journey = accept();
    world.tick++;
    expect(act(leader, 'advance', { targetPilgrimageId: journey.id })).not.toBeNull();
    expect(activePilgrimageForActor(world, leader)).toBe(journey);
    partner.alive = false;
    partner.hp = 0;
    expect(advancePilgrimages(world)).toHaveLength(1);
    expect(journey).toMatchObject({ status: 'interrupted', reason: 'member_missing', legIndex: 0, path: [], spentByEach: PILGRIMAGE_LEG_COST });
    expect(journey.stopsVisited).toHaveLength(1);
    expect(leader.spiritStones).toBe(100 - PILGRIMAGE_LEG_COST);
    expect(activePilgrimageForActor(world, leader)).toBeUndefined();
    expect(advancePilgrimages(world)).toEqual([]);
  });

  it('records stale unsigned proposals exactly once and does not accept if either participant moved away', () => {
    const { world, leader, partner, propose, act } = fixture();
    const journey = propose();
    partner.locationId = 'loc-market-east';
    expect(act(partner, 'accept', { targetPilgrimageId: journey.id })).toBeNull();
    world.tick = journey.offerExpiresTick;
    expect(advancePilgrimages(world)).toHaveLength(1);
    expect(advancePilgrimages(world)).toEqual([]);
    expect(journey).toMatchObject({ status: 'expired', reason: 'offer_expiry', spentByEach: 0, stopsVisited: [] });
    expect(leader.spiritStones).toBe(100);
  });
});
