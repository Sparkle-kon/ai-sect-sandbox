import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceOaths, availableOathActions, createOathState, OATH_TERMS, resolveOathAction } from '../src/engine/oathEngine';
import type { ActionType } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.oaths = createOathState();
  const [buyer, seller, witness] = world.cultivators;
  seller.locationId = buyer.locationId;
  buyer.spiritStones = 1_000; seller.spiritStones = 1_000;
  buyer.pills.foundation = 0; seller.pills.foundation = 2;
  const offer = () => resolveOathAction(world, buyer, { chosenAction: 'OFFER_OATH', oathTerm: 'foundation_pill',
    targetCultivatorId: seller.id, innerMonologue: '订契' });
  const response = (action: ActionType, actor = seller) =>
    resolveOathAction(world, actor, { chosenAction: action, targetOathId: world.oaths.contracts[0].id, innerMonologue: '应契' });
  const balances = () => buyer.spiritStones + seller.spiritStones + world.oaths.contracts.reduce((sum, contract) =>
    sum + contract.escrow.payment + contract.escrow.collateral, 0);
  return { world, buyer, seller, witness, offer, response, balances };
}

describe('consensual oath contracts, escrow and appeals', () => {
  it('requires actual parties and funded consent, then transfers resources and settles once only', () => {
    const { world, buyer, seller, witness, offer, response, balances } = fixture();
    const costs = OATH_TERMS.foundation_pill;
    expect(offer()?.title).toBe('天道契书提案');
    expect(offer()).toBeNull();
    const first = world.oaths.contracts[0];
    expect(first.escrow).toEqual({ payment: 0, collateral: 0 });
    expect(response('ACCEPT_OATH', witness)).toBeNull();
    buyer.spiritStones = 0;
    expect(response('ACCEPT_OATH')).toBeNull();
    buyer.spiritStones = 1_000;
    expect(response('ACCEPT_OATH')).not.toBeNull();
    expect(response('ACCEPT_OATH')).toBeNull();
    expect(first.escrow).toEqual({ payment: costs.payment, collateral: costs.collateral });
    expect(balances()).toBe(2_000);
    expect(response('FULFILL_OATH')?.title).toBe('契书履约结算');
    expect(first.status).toBe('fulfilled');
    expect(first.evidence[0]).toMatchObject({ kind: 'delivery', requesterPresent: true, quantity: 1, actorId: seller.id });
    expect([buyer.pills.foundation, seller.pills.foundation]).toEqual([1, 1]);
    expect(buyer.spiritStones).toBe(1_000 - costs.payment);
    expect(seller.spiritStones).toBe(1_000 + costs.payment);
    expect(balances()).toBe(2_000);
    expect(response('FULFILL_OATH')).toBeNull();
    expect(advanceOaths(world)).toEqual([]);
  });

  it('distinguishes decline and expiry with no funding', () => {
    const { world, offer, response, balances } = fixture();
    offer();
    const refused = world.oaths.contracts[0];
    expect(response('DECLINE_OATH')).not.toBeNull();
    expect(refused.status).toBe('declined');
    offer();
    const expired = world.oaths.contracts[0];
    world.tick = expired.offerExpiresTick;
    expect(response('ACCEPT_OATH')).toBeNull();
    expect(advanceOaths(world)[0]?.title).toMatch(/失效/);
    expect(expired.status).toBe('expired');
    expect(advanceOaths(world)).toEqual([]);
    expect(balances()).toBe(2_000);
  });

  it('accepts no false evidence without a timely real tender; waits then forfeits to buyer', () => {
    const { world, buyer, seller, offer, response, balances } = fixture();
    offer(); response('ACCEPT_OATH');
    const oath = world.oaths.contracts[0];
    seller.pills.foundation = 0;
    expect(response('FULFILL_OATH')).toBeNull();
    expect(oath.evidence).toEqual([]);
    world.tick = oath.deadlineTick!;
    expect(advanceOaths(world)[0]?.title).toMatch(/待裁/);
    expect(oath.status).toBe('breached');
    expect(oath.settledTick).toBeUndefined();
    expect(availableOathActions(seller, world).some(({ action }) => action === 'APPEAL_OATH')).toBe(true);
    world.tick = oath.appealUntilTick!;
    expect(response('APPEAL_OATH')).toBeNull();
    expect(advanceOaths(world)[0]?.title).toMatch(/结算/);
    expect(buyer.spiritStones).toBe(1_000 + oath.collateral);
    expect(seller.spiritStones).toBe(1_000 - oath.collateral);
    expect(balances()).toBe(2_000);
    expect(advanceOaths(world)).toEqual([]);
  });

  it('upholds one evidence-backed appeal for an absent requester without transferring inventory', () => {
    const { world, buyer, seller, offer, response, balances } = fixture();
    offer(); response('ACCEPT_OATH');
    const oath = world.oaths.contracts[0];
    buyer.locationId = world.locations.find(({ id }) => id !== oath.locationId)!.id;
    world.tick++;
    expect(response('FULFILL_OATH')?.title).toMatch(/留证/);
    expect(response('FULFILL_OATH')).toBeNull();
    expect(oath.evidence[0]).toMatchObject({ kind: 'tender', requesterPresent: false, quantity: 1, locationId: oath.locationId });
    world.tick = oath.deadlineTick!;
    advanceOaths(world);
    expect(response('APPEAL_OATH')?.title).toMatch(/免除/);
    expect(oath.appeal).toMatchObject({ appellantId: seller.id, status: 'upheld' });
    expect(oath.status).toBe('excused');
    expect([buyer.spiritStones, seller.spiritStones, buyer.pills.foundation, seller.pills.foundation]).toEqual([1000,1000,0,2]);
    expect(balances()).toBe(2_000);
    expect(response('APPEAL_OATH')).toBeNull();
  });

  it('rejects unsubstantiated appeals, preserving all escrow assets', () => {
    const { world, buyer, seller, offer, response, balances } = fixture();
    offer(); response('ACCEPT_OATH');
    const oath = world.oaths.contracts[0];
    world.tick = oath.deadlineTick!;
    advanceOaths(world);
    expect(response('APPEAL_OATH')?.title).toBe('天道复核驳回');
    expect(oath.appeal?.status).toBe('rejected');
    expect(seller.spiritStones).toBe(1_000 - oath.collateral);
    expect(buyer.spiritStones).toBe(1_000 + oath.collateral);
    expect(balances()).toBe(2_000);
  });
});
