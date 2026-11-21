import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { arbitrationHoldUntil, availableOathArbitrationActions, resolveOathArbitrationAction, visibleOathArbitrations } from '../src/engine/oathArbitrationEngine';
import { advanceOaths, availableOathActions, resolveOathAction } from '../src/engine/oathEngine';
import type { Cultivator, OathArbitrationMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(43);
  const hall = world.locations.find(({ type }) => type === 'market')!;
  const elsewhere = world.locations.find(({ id }) => id !== hall.id)!;
  const [requester, provider, observer, first, second, replacement, outsider] = world.cultivators;
  for (const actor of world.cultivators) actor.locationId = elsewhere.id;
  for (const actor of [requester, provider, observer, first, second, replacement, outsider]) {
    actor.spiritStones = 1000;
    actor.herbs.jade_leaf = 0;
    actor.tribulation = undefined;
    actor.sectId = '';
  }
  world.relationships = [];
  requester.locationId = provider.locationId = observer.locationId = hall.id;
  provider.herbs.jade_leaf = 6;
  expect(resolveOathAction(world, requester, { chosenAction: 'OFFER_OATH', oathTerm: 'jade_herb',
    targetCultivatorId: provider.id, innerMonologue: '' })).not.toBeNull();
  const oath = world.oaths.contracts[0];
  expect(resolveOathAction(world, provider, { chosenAction: 'ACCEPT_OATH', targetOathId: oath.id, innerMonologue: '' })).not.toBeNull();
  requester.locationId = elsewhere.id;
  world.tick = 2;
  expect(resolveOathAction(world, provider, { chosenAction: 'FULFILL_OATH', targetOathId: oath.id, innerMonologue: '' })).not.toBeNull();
  const move = (actor: Cultivator, arbitrationMove: OathArbitrationMove, arg?: string | number) =>
    resolveOathArbitrationAction(world, actor, { chosenAction: 'OATH_ARBITRATION', arbitrationMove, targetOathId: oath.id,
      ...(arbitrationMove === 'open' ? { targetTenderTick: Number(arg ?? 2) } : arbitrationMove === 'appoint' ?
        { targetCultivatorId: String(arg) } : {}), innerMonologue: '' });
  const invite = () => {
    requester.locationId = first.locationId = second.locationId = replacement.locationId = hall.id;
    expect(move(provider, 'open')).not.toBeNull();
  };
  const seat = () => {
    expect(move(requester, 'join')).not.toBeNull();
    expect(move(requester, 'appoint', first.id)).not.toBeNull();
    expect(move(provider, 'appoint', second.id)).not.toBeNull();
    expect(move(first, 'accept')).not.toBeNull();
    expect(move(second, 'accept')).not.toBeNull();
    return world.oathArbitrations.cases[0];
  };
  return { world, oath, requester, provider, observer, first, second, replacement, outsider, invite, seat, move, hall };
}

describe('first-hand evidence and independent oath panels', () => {
  it('holds the original balance only after both sign and settles one canonical refund', () => {
    const { world, oath, requester, provider, observer, first, second, outsider, invite, seat, move } = fixture();
    expect(world.oathArbitrations.observations).toEqual([{ oathId: oath.id, tenderTick: 2, siteId: oath.locationId, observerIds: [observer.id] }]);
    expect(move(provider, 'open', 1)).toBeNull();
    invite();
    expect(arbitrationHoldUntil(world, oath.id)).toBeUndefined();
    expect(move(observer, 'join')).toBeNull();
    const hearing = seat();
    expect(arbitrationHoldUntil(world, oath.id)).toBe(13);
    expect(oath.escrow).toEqual({ payment: 48, collateral: 24 });
    expect(move(first, 'vote_refund')).toBeNull();
    expect(move(outsider, 'file')).toBeNull();
    expect(move(first, 'file')).toBeNull();
    expect(move(observer, 'file')).not.toBeNull();
    expect(move(observer, 'file')).toBeNull();
    world.tick = oath.deadlineTick!;
    advanceOaths(world);
    expect(availableOathActions(provider, world, false)).not.toContainEqual({ action: 'APPEAL_OATH', targetOathId: oath.id });
    world.tick = oath.appealUntilTick!;
    expect(advanceOaths(world)).toEqual([]);
    expect(oath.escrow).toEqual({ payment: 48, collateral: 24 });
    expect(move(first, 'vote_refund')).not.toBeNull();
    expect(move(first, 'vote_refund')).toBeNull();
    expect(advanceOaths(world)).toEqual([]);
    expect(move(second, 'vote_refund')).not.toBeNull();
    expect(advanceOaths(world).map(({ title }) => title)).toEqual(['中立裁断原额退款']);
    expect(hearing).toMatchObject({ status: 'closed', disposition: 'refund' });
    expect(oath.escrow).toEqual({ payment: 0, collateral: 0 });
    expect([requester.spiritStones, provider.spiritStones]).toEqual([1000, 1000]);
    expect([requester.herbs.jade_leaf, provider.herbs.jade_leaf]).toEqual([0, 6]);
    expect(advanceOaths(world)).toEqual([]);
    expect(visibleOathArbitrations(world, outsider)).toEqual([]);
    const [view] = visibleOathArbitrations(world, observer);
    expect(view).not.toHaveProperty('escrow');
    expect(view.appointments).toEqual([]);
    expect(visibleOathArbitrations(world, requester)[0].appointments[0]).not.toHaveProperty('appointeeId');
  });

  it('documents new faction conflict as recusal and excludes the witness and duplicate judge from replacement', () => {
    const { world, oath, requester, provider, observer, first, second, replacement, invite, seat, move } = fixture();
    invite();
    const hearing = seat();
    const faction = world.sects[0].id;
    first.sectId = requester.sectId = faction;
    expect(availableOathArbitrationActions(first, world, false)).toContainEqual({
      action: 'OATH_ARBITRATION', arbitrationMove: 'recuse', targetOathId: oath.id,
    });
    advanceOaths(world);
    expect(hearing.appointments[0]).toMatchObject({ appointeeId: first.id, recusal: 'faction', endedTick: world.tick });
    expect(move(requester, 'appoint', second.id)).toBeNull();
    expect(move(requester, 'appoint', observer.id)).toBeNull();
    expect(move(requester, 'appoint', replacement.id)).not.toBeNull();
    expect(move(replacement, 'accept')).not.toBeNull();
    expect(move(observer, 'file')).not.toBeNull();
    world.tick = oath.deadlineTick!;
    advanceOaths(world);
    expect(move(second, 'vote_refund')).not.toBeNull();
    expect(move(replacement, 'vote_inconclusive')).not.toBeNull();
    advanceOaths(world);
    expect(hearing.disposition).toBe('inconclusive');
    expect(arbitrationHoldUntil(world, oath.id)).toBeUndefined();
    expect(oath.escrow).toEqual({ payment: 48, collateral: 24 });
    world.tick = oath.appealUntilTick!;
    advanceOaths(world);
    expect([requester.spiritStones, provider.spiritStones]).toEqual([1024, 976]);
    expect(advanceOaths(world)).toEqual([]);
  });

  it('leaves unilateral proposals with the normal appeal/date and expires an incomplete dual hearing without new custody', () => {
    const unjoined = fixture();
    unjoined.world.tick = unjoined.oath.deadlineTick!;
    advanceOaths(unjoined.world);
    unjoined.invite();
    expect(resolveOathAction(unjoined.world, unjoined.provider, { chosenAction: 'APPEAL_OATH', targetOathId: unjoined.oath.id,
      innerMonologue: '' })).not.toBeNull();
    advanceOaths(unjoined.world);
    expect(unjoined.world.oathArbitrations.cases[0].disposition).toBe('external_settlement');
    const agreed = fixture();
    agreed.invite();
    const hearing = agreed.seat();
    agreed.world.tick = agreed.oath.deadlineTick!;
    advanceOaths(agreed.world);
    agreed.world.tick = hearing.expiresTick! - 1;
    expect(advanceOaths(agreed.world)).toEqual([]);
    expect(agreed.oath.escrow.payment).toBe(48);
    agreed.world.tick += 1;
    advanceOaths(agreed.world);
    expect(hearing.disposition).toBe('inconclusive');
    expect([agreed.requester.spiritStones, agreed.provider.spiritStones]).toEqual([1024, 976]);
    expect(agreed.oath.escrow).toEqual({ payment: 0, collateral: 0 });
  });
});
