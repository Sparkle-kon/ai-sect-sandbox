import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { lootStorageRing } from '../src/engine/artifactEngine';
import { advanceEstates, availableEstateActions, captureEstate, createEstateState, resolveEstateAction, visibleEstates } from '../src/engine/estateEngine';
import { advanceMarkets, createMarketState, resolveMarketAction } from '../src/engine/marketEngine';
import type { ActionType, Cultivator } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(36);
  world.estates = createEstateState();
  world.markets = createMarketState();
  const [deceased, heir, rival, outsider] = world.cultivators;
  const site = world.locations.find(({ type }) => type === 'market')!;
  for (const actor of world.cultivators) actor.locationId = world.locations[1].id;
  for (const actor of [deceased, heir, rival]) actor.locationId = site.id;
  world.relationships = [
    { fromId: deceased.id, toId: heir.id, type: '师徒', affinity: 68, note: '多年师承' },
    { fromId: deceased.id, toId: rival.id, type: '挚友', affinity: 94, note: '至交' },
    { fromId: heir.id, toId: rival.id, type: '竞争', affinity: 20, note: '旧日争端' },
  ];
  deceased.spiritStones = 51;
  deceased.herbs.jade_leaf = 7;
  deceased.pills.foundation = 4;
  deceased.artifacts = [{ name: '无字玉牌', spiritRoot: '土', boundTo: deceased.id, resonance: 12 }];
  const act = (actor: Cultivator, chosenAction: ActionType, target: string) => resolveEstateAction(world, actor, {
    chosenAction, ...(chosenAction === 'NAME_HEIR' ? { targetCultivatorId: target } : { targetEstateId: target }), innerMonologue: '处理归葬事务',
  });
  const kill = (actor = deceased) => { actor.alive = false; actor.hp = 0; };
  return { world, deceased, heir, rival, outsider, site, kill, act };
}

describe('funeral and estate conservation', () => {
  it('holds only post-loot assets, never duplicates loot, and transfers a single actual artifact object out of the corpse', () => {
    const { world, deceased, heir, kill } = fixture();
    kill();
    const prior = heir.spiritStones;
    expect(lootStorageRing(heir, deceased)).toEqual({ stones: 51, artifacts: 1 });
    // A separate later refund may be left on the corpse, not part of the thief's transaction.
    deceased.spiritStones += 9;
    deceased.pills.foundation += 1;
    const token = { name: '余留祭牌', spiritRoot: '木' as const, boundTo: deceased.id };
    deceased.artifacts.push(token);
    expect(captureEstate(world, deceased)?.title).toBe('遗产封存立案');
    const estate = world.estates.entries[0];
    expect(estate.holdings).toMatchObject({ stones: 9, pills: { foundation: 1 }, herbs: { jade_leaf: 0 } });
    expect(estate.holdings.artifacts).toHaveLength(1);
    expect(estate.holdings.artifacts[0]).toBe(token);
    expect(estate.holdings.artifacts[0].boundTo).toBeUndefined();
    expect(heir.spiritStones).toBe(prior + 51);
    expect(deceased.spiritStones).toBe(0);
    expect(deceased.artifacts).toEqual([]);
    expect(captureEstate(world, deceased)).toBeNull();
    expect(advanceEstates(world)).toEqual([]);
  });

  it('adjudicates competing claims with frozen nomination and relationship evidence, then transfers just once', () => {
    const { world, deceased, heir, rival, outsider, kill, act } = fixture();
    const before = heir.spiritStones;
    expect(act(deceased, 'NAME_HEIR', heir.id)?.witnessScope).toBe('participants');
    expect(act(deceased, 'NAME_HEIR', heir.id)).toBeNull();
    kill();
    advanceEstates(world);
    const estate = world.estates.entries[0];
    expect(visibleEstates(world, deceased)).toEqual([estate]);
    expect(visibleEstates(world, outsider)).toEqual([]);
    expect(act(outsider, 'CLAIM_ESTATE', estate.id)).toBeNull();
    expect(act(rival, 'CLAIM_ESTATE', estate.id)).not.toBeNull();
    expect(estate.claims[0].basis).toBe('bond');
    expect(act(rival, 'CLAIM_ESTATE', estate.id)).toBeNull();
    expect(act(heir, 'CLAIM_ESTATE', estate.id)).not.toBeNull();
    world.relationships = [];
    world.tick = estate.closesTick;
    expect(advanceEstates(world)[0]?.title).toBe('遗产裁定归属');
    expect(estate).toMatchObject({ status: 'settled', beneficiaryId: heir.id, holdings: { stones: 0, artifacts: [] },
      distributed: { stones: 51, herbs: { jade_leaf: 7 }, pills: { foundation: 4 }, artifactIds: [expect.any(String)] } });
    expect(heir.spiritStones).toBe(before + 51);
    expect(advanceEstates(world)).toEqual([]);
    expect(heir.spiritStones).toBe(before + 51);
  });

  it('keeps assets intact in unclaimed custody after deadline and memorial changes real living relationship once', () => {
    const { world, deceased, heir, rival, kill, act } = fixture();
    kill();
    advanceEstates(world);
    const estate = world.estates.entries[0];
    world.tick = estate.closesTick;
    expect(availableEstateActions(rival, world).some((option) => option.action === 'CLAIM_ESTATE')).toBe(false);
    expect(advanceEstates(world)[0]?.title).toBe('遗产无人申领');
    expect(estate.holdings.stones).toBe(51);
    expect(estate.distributed.stones).toBe(0);
    expect(act(heir, 'HOLD_MEMORIAL', estate.id)?.title).toBe('故人归葬纪念');
    expect(estate.memorial).toMatchObject({ organizerId: heir.id, attendeeIds: [heir.id, rival.id], relationshipImpacts: 1 });
    expect(world.relationships.find((edge) => edge.fromId === heir.id && edge.toId === rival.id)?.affinity).toBe(24);
    expect(act(rival, 'HOLD_MEMORIAL', estate.id)).toBeNull();
    expect(estate.holdings.stones).toBe(51);
    expect(deceased.spiritStones).toBe(0);
  });

  it('collects a real market refund after death without cloning escrow, corpse cash, or inheritance', () => {
    const { world, deceased, heir, kill, act } = fixture();
    const initialHeirCash = heir.spiritStones;
    act(deceased, 'NAME_HEIR', heir.id);
    expect(resolveMarketAction(world, deceased, { chosenAction: 'PLACE_MARKET_BUY', marketGood: 'foundation', marketQuantity: 1,
      marketLimitPrice: 20, innerMonologue: '为家人采买' })).not.toBeNull();
    expect(deceased.spiritStones).toBe(31);
    kill();
    advanceEstates(world);
    const estate = world.estates.entries[0];
    expect(estate.holdings.stones).toBe(31);
    expect(world.markets.orders[0].escrowStones).toBe(20);
    expect(advanceMarkets(world)[0]?.title).toBe('坊市挂单到期');
    expect(world.markets.orders[0].escrowStones).toBe(0);
    for (const event of advanceEstates(world)) expect(event).toBeDefined();
    expect(deceased.spiritStones).toBe(0);
    expect(estate.holdings.stones).toBe(51);
    world.tick = estate.closesTick;
    advanceEstates(world);
    expect(heir.spiritStones).toBe(initialHeirCash + 51);
    expect(deceased.spiritStones).toBe(0);
    expect(estate.holdings.stones).toBe(0);
    expect(advanceMarkets(world)).toEqual([]);
    expect(advanceEstates(world)).toEqual([]);
    expect(heir.spiritStones).toBe(initialHeirCash + 51);
  });

  it('routes genuine late proceeds after the first heir dies into the successor estate, not a cloned corpse balance', () => {
    const { world, deceased, heir, rival, kill, act } = fixture();
    const before = rival.spiritStones;
    act(deceased, 'NAME_HEIR', heir.id);
    kill();
    advanceEstates(world);
    const original = world.estates.entries[0];
    world.tick = original.closesTick;
    advanceEstates(world);
    world.relationships.find(({ fromId, toId }) => fromId === heir.id && toId === rival.id)!.affinity = 95;
    world.relationships.find(({ fromId, toId }) => fromId === heir.id && toId === rival.id)!.type = '挚友';
    act(heir, 'NAME_HEIR', rival.id);
    world.tick += 1;
    const priorHeir = heir.spiritStones;
    kill(heir);
    deceased.spiritStones += 17;
    const results = advanceEstates(world);
    const successor = world.estates.entries.find(({ deceasedId }) => deceasedId === heir.id)!;
    expect(results.some(({ title }) => title === '遗产补记交割')).toBe(true);
    expect(original.holdings.stones).toBe(0);
    expect(original.distributed.stones).toBe(68);
    expect(deceased.spiritStones).toBe(0);
    expect(heir.spiritStones).toBe(0);
    expect(successor.holdings.stones).toBe(priorHeir + 17);
    world.tick = successor.closesTick;
    advanceEstates(world);
    expect(rival.spiritStones).toBe(before + priorHeir + 17);
    expect(successor.holdings.stones).toBe(0);
    expect(advanceEstates(world)).toEqual([]);
  });
});
