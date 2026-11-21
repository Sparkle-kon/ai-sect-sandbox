import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { flowActor, flowGranary } from '../src/engine/resourceFlowEngine';
import { activeCourierForActor, resolveCourierAction } from '../src/engine/sealedCourierEngine';
import { SETTLEMENT_RELIEF } from '../src/engine/settlementEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { availableVillageGranaryActions, resolveVillageGranaryAction } from '../src/engine/villageGranaryEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '' };
const actor = (world: WorldState, id: string) => world.cultivators.find((person) => person.id === id)!;
const village = (world: WorldState, id: string) => world.settlements.villages.find((settlement) => settlement.id === id)!;
const granary = (world: WorldState, settlementId: string) => world.villageGranaries.granaries.find((bin) => bin.settlementId === settlementId);
const turn = (world: WorldState, orders: Record<string, LLMDecisionPayload> = {}, applied?: Map<string, boolean>) =>
  advanceWorldTick(world, { ...Object.fromEntries(world.cultivators.map(({ id }) => [id, rest])), ...orders },
    () => .93, 'utility', (id, effect) => applied?.set(id, effect));
const move = (granaryMove: 'donate' | 'draw', targetSettlementId: string): LLMDecisionPayload =>
  ({ chosenAction: 'VILLAGE_GRANARY', granaryMove, targetSettlementId, innerMonologue: '' });

function initial() {
  const world = createInitialWorld(7041);
  world.tick = 20;
  world.month = 5;
  const community = world.settlements.villages.find(({ locationId }) => locationId === 'loc-market')!;
  const [sponsor, local] = world.cultivators;
  sponsor.locationId = local.locationId = community.locationId;
  sponsor.age = Math.max(18, sponsor.age);
  local.age = Math.max(18, local.age);
  sponsor.spiritStones = local.spiritStones = 120;
  sponsor.herbs.earth_root = local.herbs.earth_root = 10;
  sponsor.herbs.jade_leaf = local.herbs.jade_leaf = 6;
  community.stress = 27;
  return { world, settlementId: community.id, siteId: community.locationId, sponsorId: sponsor.id, localId: local.id };
}

function stockedAndDisaster() {
  const start = initial();
  const { settlementId, siteId, sponsorId, localId } = start;
  let world = turn(start.world, { [sponsorId]: move('donate', settlementId), [localId]: move('donate', settlementId) });
  expect(granary(world, settlementId)).toMatchObject({ roots: 4, stones: 16, donatedRoots: 4, donatedStones: 16,
    spentRoots: 0, spentStones: 0 });
  expect(actor(world, sponsorId)).toMatchObject({ spiritStones: 112, herbs: { earth_root: 8 } });
  expect(actor(world, localId)).toMatchObject({ spiritStones: 112, herbs: { earth_root: 8 } });
  expect(availableVillageGranaryActions(actor(world, sponsorId), world).some(({ granaryMove }) => granaryMove === 'draw')).toBe(false);
  expect(world.settlements.records.filter(({ kind }) => kind === 'relief')).toEqual([]);
  world = turn(world);
  const site = world.locations.find(({ id }) => id === siteId)!;
  const tileId = terrainTileAt(world, site.x, site.y)!.id;
  for (const hitTick of [23, 26]) {
    while (world.tick + 1 < hitTick) world = turn(world);
    world.mapHazards.push({ id: `granary-disaster-${hitTick}`, kind: 'beast_tide', tileId,
      intensity: 4, createdTick: hitTick, expiresTick: hitTick + 1 });
    world = turn(world);
    expect(world.tick).toBe(hitTick);
    expect(village(world, settlementId).lastDisasterTick).toBe(hitTick);
    expect(world.settlements.records.find((row) => row.settlementId === settlementId && row.tick === hitTick && row.kind === 'disaster')?.people)
      .toBeGreaterThan(0);
  }
  expect(village(world, settlementId).stress).toBeGreaterThan(59);
  expect(granary(world, settlementId)).toMatchObject({ roots: 4, stones: 16, spentRoots: 0, spentStones: 0 });
  return { ...start, world };
}

describe('village granary following actual settlement and concurrent actions', () => {
  it('uses a fresh disaster assessment and one actual buffer draw, without awarding residents, personal charity or honor', () => {
    const { world, settlementId, sponsorId, localId } = stockedAndDisaster();
    expect(availableVillageGranaryActions(actor(world, sponsorId), world, world.tick + 1)).toContainEqual({
      action: 'VILLAGE_GRANARY', granaryMove: 'draw', targetSettlementId: settlementId,
    });
    const stale = structuredClone(world);
    stale.tick++;
    expect(stale.settlements.lastAdvancedTick).not.toBe(stale.tick);
    expect(resolveVillageGranaryAction(stale, actor(stale, sponsorId), move('draw', settlementId))).toBeNull();
    expect(granary(stale, settlementId)).toEqual(granary(world, settlementId));

    const baseline = turn(world);
    const applied = new Map<string, boolean>();
    const result = turn(world, { [sponsorId]: move('draw', settlementId), [localId]: move('draw', settlementId) }, applied);
    expect([applied.get(sponsorId), applied.get(localId)]).toEqual([true, false]);
    const bin = granary(result, settlementId)!;
    const need = village(baseline, settlementId).stress;
    expect(bin).toMatchObject({ roots: 3, stones: 12, donatedRoots: 4, donatedStones: 16, spentRoots: 1, spentStones: 4, lastDrawTick: result.tick });
    const withdrawals = bin.receipts.filter(({ kind }) => kind === 'draw');
    expect(withdrawals).toEqual([{ kind: 'draw', actorId: sponsorId, tick: result.tick, stressBefore: need,
      stressAfter: village(result, settlementId).stress, disasterTick: 26 }]);
    expect(village(result, settlementId).stress).toBeLessThan(need);
    expect(village(result, settlementId).lastReliefTick).toBe(result.tick);
    expect(result.settlements.villages.map(({ population }) => population)).toEqual(baseline.settlements.villages.map(({ population }) => population));
    expect(result.cultivators.map(({ id }) => id)).toEqual(baseline.cultivators.map(({ id }) => id));
    expect(actor(result, sponsorId)).toMatchObject({ spiritStones: 112, herbs: { earth_root: 8, jade_leaf: 6 } });
    expect(result.settlements.records.filter(({ kind }) => kind === 'relief')).toEqual([]);
    expect(result.probation).toEqual(baseline.probation);
    expect(result.competitions.scores).toEqual(baseline.competitions.scores);
    expect(result.competitions.honors).toEqual(baseline.competitions.honors);
    const ledger = result.resourceFlow.months.flatMap(({ entries }) => entries).filter(({ mechanism }) => mechanism === 'granary');
    const originalDeposit = world.resourceFlow.months.flatMap(({ entries }) => entries).filter(({ mechanism, kind }) =>
      mechanism === 'granary' && kind === 'transfer');
    expect(originalDeposit).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: flowActor(sponsorId), to: flowGranary(settlementId), good: 'earth_root', amount: 2 }),
      expect.objectContaining({ from: flowActor(sponsorId), to: flowGranary(settlementId), good: 'stone', amount: 8 }),
    ]));
    expect(ledger.filter(({ kind }) => kind === 'consumption')).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: flowGranary(settlementId), good: 'earth_root', amount: 1 }),
      expect.objectContaining({ from: flowGranary(settlementId), good: 'stone', amount: 4 }),
    ]));
    expect(ledger.some(({ kind }) => kind === 'production')).toBe(false);
  });

  it.each(['personal', 'stored'] as const)('rechecks shared relief stamp after a %s first action while need remains high', (first) => {
    const { world, settlementId, sponsorId, localId } = stockedAndDisaster();
    const personal: LLMDecisionPayload = { chosenAction: 'DELIVER_RELIEF', targetSettlementId: settlementId, innerMonologue: '' };
    const buffer = move('draw', settlementId);
    const applied = new Map<string, boolean>();
    const result = turn(world, { [sponsorId]: first === 'personal' ? personal : buffer, [localId]: first === 'personal' ? buffer : personal }, applied);
    expect([applied.get(sponsorId), applied.get(localId)]).toEqual([true, false]);
    const ownRelief = result.settlements.records.filter(({ kind }) => kind === 'relief');
    expect(village(result, settlementId).stress).toBeGreaterThanOrEqual(35);
    expect(village(result, settlementId).lastReliefTick).toBe(result.tick);
    expect(actor(result, localId)).toMatchObject({ spiritStones: 112, herbs: { earth_root: 8, jade_leaf: 6 } });
    if (first === 'personal') {
      expect(ownRelief).toMatchObject([{ actorId: sponsorId, stones: SETTLEMENT_RELIEF.stones, herbs: SETTLEMENT_RELIEF.jade_leaf }]);
      expect(actor(result, sponsorId)).toMatchObject({ spiritStones: 112 - SETTLEMENT_RELIEF.stones,
        herbs: { jade_leaf: 6 - SETTLEMENT_RELIEF.jade_leaf } });
      expect(granary(result, settlementId)).toMatchObject({ roots: 4, stones: 16, spentRoots: 0, spentStones: 0 });
    } else {
      expect(ownRelief).toEqual([]);
      expect(actor(result, sponsorId)).toMatchObject({ spiritStones: 112, herbs: { jade_leaf: 6 } });
      expect(granary(result, settlementId)).toMatchObject({ roots: 3, stones: 12, spentRoots: 1, spentStones: 4 });
    }
  });

  it('does not accept a donation from an actual courier still transporting from a stale village anchor', () => {
    const { world, settlementId, siteId, sponsorId, localId } = initial();
    const sponsor = actor(world, sponsorId);
    const courier = actor(world, localId);
    const target = world.sects.find(({ leaderId }) => leaderId && leaderId !== sponsorId && leaderId !== localId)!;
    const recipientId = target.leaderId!;
    actor(world, recipientId).locationId = target.headquartersId;
    expect(resolveCourierAction(world, sponsor, { chosenAction: 'SEALED_COURIER', courierMove: 'send',
      targetCourierId: courier.id, targetCultivatorId: recipientId, dispatchCue: 'request_audience', innerMonologue: '' })).not.toBeNull();
    const [dispatch] = world.couriers.dispatches;
    expect(resolveCourierAction(world, courier, { chosenAction: 'SEALED_COURIER', courierMove: 'accept',
      targetDispatchId: dispatch.id, innerMonologue: '' })).not.toBeNull();
    const paid = courier.spiritStones;
    expect(courier.locationId).toBe(siteId);
    expect(activeCourierForActor(world, courier)).toBe(dispatch);
    expect(resolveVillageGranaryAction(world, courier, move('donate', settlementId))).toBeNull();
    const result = turn(world, { [courier.id]: move('donate', settlementId) });
    expect(actor(result, courier.id)).toMatchObject({ spiritStones: paid, herbs: { earth_root: 10 } });
    expect(granary(result, settlementId)).toBeUndefined();
    expect(result.resourceFlow.months.flatMap(({ entries }) => entries).some(({ mechanism }) => mechanism === 'granary')).toBe(false);
  });
});
