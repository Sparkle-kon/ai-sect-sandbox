import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  advanceSectCredit, availableSectCreditActions, createSectCreditState, resolveSectCreditAction, SECT_CREDIT_COLLECTION_TICKS,
  SECT_CREDIT_OFFER_TICKS, SECT_CREDIT_PAYMENT_MAX, SECT_CREDIT_PRINCIPAL, SECT_CREDIT_RESERVE, SECT_CREDIT_RESTRICTION_TICKS,
  SECT_CREDIT_TERM_TICKS, SECT_CREDIT_TREASURY_CAP, sectCreditExposure, sectCreditLiquidity, visibleSectCredit,
} from '../src/engine/sectCreditEngine';
import type { Cultivator, RelocationPlan, SectCreditMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(99521);
  world.tick = 10;
  world.credit = createSectCreditState();
  const [lender, borrower, other] = world.sects;
  const reps = world.sects.map((sect) => {
    const actor = world.cultivators.find(({ id }) => id === sect.leaderId)!;
    actor.locationId = sect.headquartersId;
    sect.spiritStones = 500;
    return actor;
  });
  const [lenderLeader, borrowerLeader, otherLeader] = reps;
  const act = (actor: Cultivator, creditMove: SectCreditMove, target: string) => resolveSectCreditAction(world, actor, {
    chosenAction: 'SECT_CREDIT', innerMonologue: '按账目划拨', creditMove,
    ...(creditMove === 'offer' ? { targetSectId: target } : { targetCreditId: target }),
  });
  const offer = () => {
    expect(act(lenderLeader, 'offer', borrower.id)?.witnessScope).toBe('participants');
    return world.credit.loans[0];
  };
  const fund = () => {
    const loan = offer();
    expect(act(borrowerLeader, 'accept', loan.id)?.title).toBe('双签后宗门信贷实拨');
    return loan;
  };
  const total = () => world.sects.reduce((sum, sect) => sum + sect.spiritStones, 0) +
    world.relocations.plans.reduce((sum, plan) => sum + plan.custody.stones, 0);
  return { world, lender, borrower, other, lenderLeader, borrowerLeader, otherLeader, act, offer, fund, total };
}

describe('real treasury-funded sect credit', () => {
  it('reserves issuer capacity only as commitments and requires actual counterpart consent with fresh liquidity and headroom', () => {
    const { world, lender, borrower, other, lenderLeader, borrowerLeader, otherLeader, act, offer, total } = fixture();
    lender.spiritStones = SECT_CREDIT_RESERVE + SECT_CREDIT_PRINCIPAL;
    const totalBefore = total();
    const loan = offer();
    expect(total()).toBe(totalBefore);
    expect(lender.spiritStones).toBe(200);
    expect(sectCreditExposure(world, lender.id)).toMatchObject({ receivable: 0, pendingOutgoing: 120 });
    expect(visibleSectCredit(world, otherLeader)).toEqual([]);
    expect(visibleSectCredit(world, borrowerLeader)).toEqual([loan]);
    expect(act(lenderLeader, 'offer', other.id)).toBeNull();
    expect(act(otherLeader, 'accept', loan.id)).toBeNull();
    lender.spiritStones -= 1;
    expect(act(borrowerLeader, 'accept', loan.id)).toBeNull();
    lender.spiritStones += 1;
    borrower.spiritStones = SECT_CREDIT_TREASURY_CAP - SECT_CREDIT_PRINCIPAL + 1;
    expect(act(borrowerLeader, 'accept', loan.id)).toBeNull();
    borrower.spiritStones -= 1;
    const updatedTotal = total();
    expect(act(borrowerLeader, 'accept', loan.id)).not.toBeNull();
    expect(act(borrowerLeader, 'accept', loan.id)).toBeNull();
    expect(total()).toBe(updatedTotal);
    expect(borrower.spiritStones).toBe(SECT_CREDIT_TREASURY_CAP);
    expect(lender.spiritStones).toBe(SECT_CREDIT_RESERVE);
    expect(loan).toMatchObject({ status: 'active', fundedTick: world.tick, dueTick: world.tick + SECT_CREDIT_TERM_TICKS });
    expect(visibleSectCredit(world, otherLeader)).toEqual([loan]);
  });

  it('releases an expired or declined offer without funds or weakening active borrowing limits', () => {
    const { world, lender, borrower, lenderLeader, borrowerLeader, otherLeader, act, offer, total } = fixture();
    const amount = total();
    const loan = offer();
    expect(act(borrowerLeader, 'offer', lender.id)).toBeNull();
    expect(act(otherLeader, 'offer', borrower.id)).toBeNull();
    expect(act(borrowerLeader, 'decline', loan.id)?.witnessScope).toBe('participants');
    expect(act(borrowerLeader, 'decline', loan.id)).toBeNull();
    expect(loan.status).toBe('declined');
    expect(act(lenderLeader, 'offer', borrower.id)).not.toBeNull();
    world.tick += SECT_CREDIT_OFFER_TICKS;
    expect(act(borrowerLeader, 'accept', world.credit.loans[1].id)).toBeNull();
    expect(advanceSectCredit(world)).toHaveLength(1);
    expect(advanceSectCredit(world)).toEqual([]);
    expect(world.credit.loans[1].status).toBe('expired');
    expect(sectCreditExposure(world, lender.id).pendingOutgoing).toBe(0);
    expect(total()).toBe(amount);
  });

  it('shares the per-tick payment limit, honors new leaders and records settlement even after diplomacy changes', () => {
    const { world, lender, borrower, borrowerLeader, act, fund, total } = fixture();
    const amount = total();
    const loan = fund();
    world.tick = loan.dueTick!;
    world.diplomacy = [{ sectAId: lender.id, sectBId: borrower.id, affinity: -99, sinceTick: world.tick, pact: 'war' }];
    const newLeader = world.cultivators.find((actor) => actor.sectId === borrower.id && actor.id !== borrowerLeader.id)!;
    borrower.leaderId = newLeader.id;
    newLeader.locationId = borrower.headquartersId;
    newLeader.sectRank = '掌门';
    expect(act(borrowerLeader, 'repay', loan.id)).toBeNull();
    expect(act(newLeader, 'repay', loan.id)).not.toBeNull();
    expect(act(newLeader, 'repay', loan.id)).toBeNull();
    expect(advanceSectCredit(world)).toEqual([]);
    expect(loan.paidTotal).toBe(SECT_CREDIT_PAYMENT_MAX);
    expect(sectCreditExposure(world, borrower.id).payable).toBe(80);
    world.tick++;
    expect(advanceSectCredit(world)).toHaveLength(1);
    expect(advanceSectCredit(world)).toEqual([]);
    expect(act(newLeader, 'repay', loan.id)).toBeNull();
    world.tick++;
    expect(advanceSectCredit(world)).toHaveLength(1);
    expect(loan).toMatchObject({ status: 'paid', paidTotal: loan.principal, writtenOff: 0, settledTick: world.tick });
    expect(loan.receipts).toHaveLength(3);
    expect(sectCreditExposure(world, lender.id).receivable).toBe(0);
    expect(total()).toBe(amount);
  });

  it('takes only actual excess balance, writes off remainder once and applies an independent time-limited restriction', () => {
    const { world, lender, borrower, otherLeader, fund, total } = fixture();
    const loan = fund();
    borrower.spiritStones = SECT_CREDIT_RESERVE + 19;
    lender.spiritStones = SECT_CREDIT_TREASURY_CAP - 7;
    const amount = total();
    world.tick = loan.dueTick!;
    expect(advanceSectCredit(world)).toHaveLength(1);
    expect(loan.paidTotal).toBe(7);
    expect(loan.receipts).toEqual([{ tick: world.tick, kind: 'collection', amount: 7 }]);
    expect(lender.spiritStones).toBe(SECT_CREDIT_TREASURY_CAP);
    expect(advanceSectCredit(world)).toEqual([]);
    world.tick += SECT_CREDIT_COLLECTION_TICKS;
    expect(advanceSectCredit(world)[0]?.title).toBe('宗门逾期清算');
    expect(advanceSectCredit(world)).toEqual([]);
    expect(loan).toMatchObject({ status: 'defaulted', writtenOff: 113 });
    expect(sectCreditExposure(world, lender.id)).toMatchObject({ receivable: 0, defaultedWriteOff: 113 });
    expect(sectCreditExposure(world, borrower.id)).toMatchObject({ payable: 0, restrictedUntilTick: world.tick + SECT_CREDIT_RESTRICTION_TICKS });
    expect(availableSectCreditActions(otherLeader, world).some(({ targetSectId }) => targetSectId === borrower.id)).toBe(false);
    expect(total()).toBe(amount);
    world.tick += SECT_CREDIT_RESTRICTION_TICKS;
    expect(availableSectCreditActions(otherLeader, world).some(({ targetSectId }) => targetSectId === borrower.id)).toBe(true);
  });

  it('collects against the one real migrating custody and does not let borrowed stones fund a circular follow-up', () => {
    const { world, lender, borrower, other, borrowerLeader, fund, act, total } = fixture();
    borrower.spiritStones = SECT_CREDIT_RESERVE;
    const loan = fund();
    expect(borrower.spiritStones).toBe(200);
    expect(act(borrowerLeader, 'offer', other.id)).toBeNull();
    const route = (sectId: string, id: string, stones: number): RelocationPlan => ({
      id, sectId, originId: 'hq', destinationId: 'other', status: 'in_transit', openedTick: 3, deadlineTick: 6, proposerId: 'leader',
      voterIds: [], votes: [], garrisonIds: [], path: [], pathIndex: 0, stoneCost: 0, earthCost: 0, spent: true, custody: { stones, pavilion: [] },
    });
    const lenderMove = route(lender.id, 'route-l', lender.spiritStones);
    const borrowerMove = route(borrower.id, 'route-b', borrower.spiritStones);
    lender.spiritStones = 0;
    borrower.spiritStones = 0;
    world.relocations.plans.push(lenderMove, borrowerMove);
    world.tick = loan.dueTick!;
    expect(sectCreditLiquidity(world, borrower.id)).toBe(200);
    expect(act(borrowerLeader, 'repay', loan.id)).toBeNull();
    const amount = total();
    expect(advanceSectCredit(world)).toHaveLength(1);
    expect(sectCreditLiquidity(world, borrower.id)).toBe(160);
    expect(lenderMove.custody.stones).toBe(420);
    expect(lender.spiritStones).toBe(0);
    expect(borrower.spiritStones).toBe(0);
    expect(total()).toBe(amount);
  });
});
