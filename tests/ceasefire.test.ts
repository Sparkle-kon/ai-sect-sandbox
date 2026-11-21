import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeCeasefireBetween, advanceCeasefires, availableCeasefireActions, CEASEFIRE_AID_DELAY, CEASEFIRE_BOND, CEASEFIRE_DURATION,
  createCeasefireState, recordCeasefireHostility, resolveCeasefireAction, visibleCeasefires } from '../src/engine/ceasefireEngine';
import { advanceDiplomacy } from '../src/engine/diplomacyEngine';
import type { CeasefireMove, Cultivator, LLMDecisionPayload, SectSiege, WorldEvent } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(192);
  world.ceasefires = createCeasefireState();
  world.tick = 12;
  world.month = 12;
  const [attacker, defender, ally] = world.sects;
  attacker.spiritStones = 500;
  defender.spiritStones = 300;
  attacker.arrayHp = attacker.arrayMaxHp = 100;
  defender.arrayHp = 20; defender.arrayMaxHp = 100;
  const first = world.cultivators.find(({ id }) => id === attacker.leaderId)!;
  const second = world.cultivators.find(({ id }) => id === defender.leaderId)!;
  const supporter = world.cultivators.find(({ sectId }) => sectId === ally.id)!;
  const unrecruited = world.cultivators.find(({ id, sectId }) => id !== first.id && sectId === attacker.id)!;
  first.locationId = second.locationId = supporter.locationId = defender.headquartersId;
  world.diplomacy = [{ sectAId: attacker.id, sectBId: defender.id, affinity: -82, pact: 'war', sinceTick: 2 }];
  const siege: SectSiege = { id: 'actual-current-war', attackerSectId: attacker.id, defenderSectId: defender.id, destinationId: defender.headquartersId,
    participantIds: [first.id, supporter.id], status: 'sieging', startedTick: 5, rounds: 2, lastResolvedTick: 11 };
  world.sieges = [siege];
  const act = (actor: Cultivator, ceasefireMove: CeasefireMove, fields: Partial<LLMDecisionPayload> = {}) =>
    resolveCeasefireAction(world, actor, { chosenAction: 'CEASEFIRE', ceasefireMove, innerMonologue: '按授权签议', ...fields });
  const offer = () => {
    expect(act(first, 'offer', { targetSectId: defender.id })?.witnessScope).toBe('participants');
    return world.ceasefires.agreements[0];
  };
  const sign = () => {
    const deal = offer();
    expect(act(second, 'accept', { targetCeasefireId: deal.id })?.title).toBe('两宗签署停战撤军议约');
    return deal;
  };
  return { world, attacker, defender, ally, first, second, supporter, unrecruited, siege, act, offer, sign };
}

describe('bilateral armistice and actual aid custody', () => {
  it('requires aged actual bilateral warfare, current authorized leaders, and genuine consent', () => {
    const { world, attacker, defender, first, second, supporter, siege, unrecruited, act, offer } = fixture();
    world.sieges = [];
    first.locationId = attacker.headquartersId;
    expect(act(first, 'offer', { targetSectId: defender.id })).toBeNull();
    world.sieges = [siege];
    world.diplomacy[0].sinceTick = 11;
    expect(act(first, 'offer', { targetSectId: defender.id })).toBeNull();
    world.diplomacy[0].sinceTick = 2;
    first.locationId = defender.headquartersId;
    expect(act(unrecruited, 'offer', { targetSectId: defender.id })).toBeNull();
    const deal = offer();
    expect(visibleCeasefires(world)).toEqual([]);
    expect(visibleCeasefires(world, supporter)).toEqual([]);
    expect(visibleCeasefires(world, first)).toEqual([deal]);
    expect(act(first, 'accept', { targetCeasefireId: deal.id })).toBeNull();
    expect(act(supporter, 'accept', { targetCeasefireId: deal.id })).toBeNull();
    expect(act(second, 'offer', { targetSectId: attacker.id })).toBeNull();
    expect(act(second, 'decline', { targetCeasefireId: deal.id })?.title).toBe('停战提议被拒');
    expect(deal.status).toBe('declined');
    expect(act(second, 'accept', { targetCeasefireId: deal.id })).toBeNull();
    expect(attacker.spiritStones).toBe(500);
    expect(defender.spiritStones).toBe(300);
    expect(siege.status).toBe('sieging');
    expect(world.diplomacy[0].pact).toBe('war');
  });

  it('withdraws the actual living army without injury, freezes actual aid, and pays/refunds each balance once', () => {
    const { world, attacker, defender, ally, first, second, supporter, unrecruited, siege, sign, act } = fixture();
    world.tributeDemands.push({ id: 'pending-bilateral', demanderSectId: attacker.id, targetSectId: defender.id,
      amount: 70, startedTick: 8, status: 'pending' });
    const health = [first.hp, second.hp, supporter.hp, unrecruited.hp];
    const reputation = [attacker.reputation, defender.reputation];
    const elsewhere = unrecruited.locationId;
    const deal = sign();
    expect(siege).toMatchObject({ status: 'withdrawn', lastResolvedTick: world.tick });
    expect(deal.withdrawnSiegeIds).toEqual([siege.id]);
    expect(first.locationId).toBe(attacker.headquartersId);
    expect(second.locationId).toBe(defender.headquartersId);
    expect(supporter.locationId).toBe(ally.headquartersId);
    expect(unrecruited.locationId).toBe(elsewhere);
    expect([first.hp, second.hp, supporter.hp, unrecruited.hp]).toEqual(health);
    expect([attacker.reputation, defender.reputation]).toEqual(reputation);
    expect(world.tributeDemands[0]).toMatchObject({ status: 'rejected', resolvedTick: world.tick });
    expect(activeCeasefireBetween(world, defender.id, attacker.id)).toBe(deal);
    expect(visibleCeasefires(world)).toEqual([deal]);
    expect(world.diplomacy[0].pact).toBe('neutral');
    expect(deal.escrow).toEqual({ proposerBond: CEASEFIRE_BOND, targetBond: CEASEFIRE_BOND, aid: 120 });
    expect(attacker.spiritStones).toBe(500 - CEASEFIRE_BOND - 120);
    expect(defender.spiritStones).toBe(300 - CEASEFIRE_BOND);
    expect(act(second, 'accept', { targetCeasefireId: deal.id })).toBeNull();
    world.tick += CEASEFIRE_AID_DELAY - 1;
    expect(advanceDiplomacy(world, () => .5)).toEqual([]);
    expect(advanceCeasefires(world)).toEqual([]);
    world.tick++;
    expect(advanceCeasefires(world).map(({ title }) => title)).toEqual(['战后重建援款入库']);
    expect(advanceCeasefires(world)).toEqual([]);
    expect(deal.aidReleasedTick).toBe(world.tick);
    expect(defender.spiritStones).toBe(300 - CEASEFIRE_BOND + 120);
    world.tick = deal.signedTick! + CEASEFIRE_DURATION;
    expect(advanceCeasefires(world).map(({ title }) => title)).toEqual(['停战正常期满']);
    expect(advanceCeasefires(world)).toEqual([]);
    expect(deal).toMatchObject({ status: 'fulfilled', escrow: { proposerBond: 0, targetBond: 0, aid: 0 } });
    expect(attacker.spiritStones).toBe(380);
    expect(defender.spiritStones).toBe(420);
    expect(world.diplomacy[0].pact).toBe('neutral');
    expect(activeCeasefireBetween(world, attacker.id, defender.id)).toBeUndefined();
  });

  it('rejects stale authority, unfunded signing and expired offers without changing cash or army state', () => {
    const { world, attacker, defender, second, act, offer, siege } = fixture();
    const deal = offer();
    attacker.spiritStones = CEASEFIRE_BOND;
    expect(availableCeasefireActions(second, world).some(({ ceasefireMove }) => ceasefireMove === 'accept')).toBe(false);
    expect(act(second, 'accept', { targetCeasefireId: deal.id })).toBeNull();
    attacker.spiritStones = 500;
    defender.leaderId = world.cultivators.find(({ sectId, id }) => sectId === defender.id && id !== second.id)!.id;
    expect(advanceCeasefires(world)[0]?.title).toBe('停战提议失效');
    expect(deal.status).toBe('expired');
    expect(siege.status).toBe('sieging');
    expect(attacker.spiritStones).toBe(500);
    expect(defender.spiritStones).toBe(300);

    const other = fixture();
    const deadline = other.offer();
    other.world.tick = deadline.offerExpiresTick;
    expect(other.act(other.second, 'accept', { targetCeasefireId: deadline.id })).toBeNull();
    expect(advanceCeasefires(other.world)[0]?.title).toBe('停战提议失效');
    expect(deadline.status).toBe('expired');
  });

  it('forfeits the initiating offender bond from actual harmful proof exactly once and keeps private source identifiers sealed', () => {
    const { world, attacker, defender, first, second, supporter, sign } = fixture();
    const reputation = attacker.reputation;
    const deal = sign();
    const proof: WorldEvent = { id: 'private-canonical-proof', tick: world.tick, year: world.year, month: world.month,
      title: '与条约无关的文字', description: '不读取自然语言', category: 'combat', actorIds: [first.id, second.id],
      locationId: defender.headquartersId, witnessScope: 'participants', damage: [{ cultivatorId: second.id, amount: 1 }] };
    expect(recordCeasefireHostility(world, supporter, second, proof)).toBeNull();
    expect(recordCeasefireHostility(world, first, second, { ...proof, damage: [{ cultivatorId: first.id, amount: 100 }] })).toBeNull();
    expect(recordCeasefireHostility(world, first, second, { ...proof, tick: world.tick - 1 })).toBeNull();
    expect(recordCeasefireHostility(world, first, second, proof)?.title).toBe('停战违约及保证金罚没');
    expect(recordCeasefireHostility(world, first, second, proof)).toBeNull();
    expect(deal).toMatchObject({ status: 'breached', escrow: { proposerBond: 0, targetBond: 0, aid: 0 },
      breach: { offenderSectId: attacker.id, kind: 'hostile_damage', forfeitedBond: CEASEFIRE_BOND } });
    expect(deal.breach?.eventId).toBeUndefined();
    expect(world.diplomacy[0].pact).toBe('war');
    expect(attacker.reputation).toBe(reputation - 12);
    expect(attacker.spiritStones).toBe(440);
    expect(defender.spiritStones).toBe(360);
  });

  it('explicit renunciation after release transfers only the offender bond and never claws back paid aid', () => {
    const { world, attacker, defender, second, sign, act } = fixture();
    const deal = sign();
    world.tick += CEASEFIRE_AID_DELAY;
    advanceCeasefires(world);
    expect(act(second, 'break', { targetCeasefireId: deal.id })?.title).toBe('停战违约及保证金罚没');
    expect(act(second, 'break', { targetCeasefireId: deal.id })).toBeNull();
    expect(attacker.spiritStones).toBe(500 - 120 + CEASEFIRE_BOND);
    expect(defender.spiritStones).toBe(300 + 120 - CEASEFIRE_BOND);
    expect(deal.aidReleasedTick).toBe(world.tick);
    expect(deal.breach?.kind).toBe('renounced');
    expect(world.diplomacy[0].pact).toBe('war');
    expect(advanceCeasefires(world)).toEqual([]);
  });
});
