import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceSectCredit, availableSectCreditActions, sectCreditExposure, SECT_CREDIT_PAYMENT_MAX,
  SECT_CREDIT_PRINCIPAL, SECT_CREDIT_RESERVE } from '../src/engine/sectCreditEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(88);
  world.tick = 29; world.month = 5;
  world.relationships = [];
  for (const row of world.diplomacy) { row.pact = 'neutral'; row.affinity = 0; }
  const [lender, borrower] = world.sects;
  for (const sect of world.sects) sect.spiritStones = 5_000;
  lender.spiritStones = 1_200; borrower.spiritStones = 130;
  const origin = world.cultivators.find(({ id }) => id === lender.leaderId)!;
  const receiver = world.cultivators.find(({ id }) => id === borrower.leaderId)!;
  origin.locationId = lender.headquartersId; receiver.locationId = borrower.headquartersId;
  origin.qiProgress = receiver.qiProgress = 0;
  origin.techniqueMastery = receiver.techniqueMastery = 28;
  origin.hp = origin.maxHp; receiver.hp = receiver.maxHp;
  return { world, lender, borrower, origin, receiver };
}

describe('actual sect-credit accounting through both brains', () => {
  it('recognizes the same real offer, transfers only available principal, and writes off only the outstanding debt', async () => {
    const { world, lender, borrower, origin, receiver } = fixture();
    const total = () => lender.spiritStones + borrower.spiritStones;
    const opening = total();
    const local = computeHeuristicDecision(origin, world, () => .99);
    expect(local).toMatchObject({ chosenAction: 'SECT_CREDIT', creditMove: 'offer', targetSectId: borrower.id });
    const request = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(local) } }] })));
    vi.stubGlobal('fetch', request);
    const source = vi.fn();
    const model = await queryCultivatorLLMDecision(origin, world, config, source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(model).toMatchObject({ chosenAction: 'SECT_CREDIT', creditMove: 'offer', targetSectId: borrower.id });
    expect(applyCultivatorBrainDecision(world, origin, model, () => .99)).not.toBeNull();
    expect(total()).toBe(opening);
    expect(lender.spiritStones).toBe(1_200);
    const loan = world.credit.loans[0];
    const accept = availableSectCreditActions(receiver, world).find(({ creditMove }) => creditMove === 'accept')!;
    expect(applyCultivatorBrainDecision(world, receiver, { ...accept, chosenAction: 'SECT_CREDIT', innerMonologue: '接纳真实本金' }, () => .99)).not.toBeNull();
    expect(total()).toBe(opening);
    expect(borrower.spiritStones).toBe(130 + SECT_CREDIT_PRINCIPAL);
    expect(sectCreditExposure(world, borrower.id).payable).toBe(SECT_CREDIT_PRINCIPAL);
    expect(sectCreditExposure(world, lender.id).receivable).toBe(SECT_CREDIT_PRINCIPAL);
    expect(decodeWorldSave(encodeWorldSave(world)).credit).toEqual(world.credit);

    world.tick++;
    const repay = availableSectCreditActions(receiver, world).find(({ creditMove }) => creditMove === 'repay')!;
    expect(applyCultivatorBrainDecision(world, receiver, { ...repay, chosenAction: 'SECT_CREDIT', innerMonologue: '部分偿还' }, () => .99)).not.toBeNull();
    expect(loan.paidTotal).toBe(SECT_CREDIT_PAYMENT_MAX);
    expect(total()).toBe(opening);
    // A finite intervening external expense, independent of the loan ledger.
    borrower.spiritStones = SECT_CREDIT_RESERVE + 10;
    const afterExpense = total();
    world.tick = loan.dueTick!;
    advanceSectCredit(world);
    expect(total()).toBe(afterExpense);
    expect(loan.paidTotal).toBe(SECT_CREDIT_PAYMENT_MAX + 10);
    const lenderAfterCollection = lender.spiritStones;
    advanceSectCredit(world);
    expect(lender.spiritStones).toBe(lenderAfterCollection);
    while (world.tick < loan.collectionUntilTick!) { world.tick++; advanceSectCredit(world); }
    expect(loan.status).toBe('defaulted');
    expect(loan.writtenOff).toBe(SECT_CREDIT_PRINCIPAL - SECT_CREDIT_PAYMENT_MAX - 10);
    expect(total()).toBe(afterExpense);
    expect(sectCreditExposure(world, borrower.id).restrictedUntilTick).toBeGreaterThan(world.tick);
    expect(sectCreditExposure(world, lender.id).receivable).toBe(0);
    expect(decodeWorldSave(encodeWorldSave(world)).credit).toEqual(world.credit);
    const corrupt = structuredClone(world);
    corrupt.credit.loans[0].paidTotal++;
    expect(() => encodeWorldSave(corrupt)).toThrow(/credit.loans.principal/);
  });

  it('applies due collections in the actual world turn without charging a second time in the same tick', () => {
    const { world, lender, borrower, origin, receiver } = fixture();
    const offer = availableSectCreditActions(origin, world).find((item) => item.creditMove === 'offer' && item.targetSectId === borrower.id)!;
    expect(applyCultivatorBrainDecision(world, origin, { ...offer, chosenAction: 'SECT_CREDIT', innerMonologue: '邀约' }, () => .99)).not.toBeNull();
    const reply = availableSectCreditActions(receiver, world).find(({ creditMove }) => creditMove === 'accept')!;
    expect(applyCultivatorBrainDecision(world, receiver, { ...reply, chosenAction: 'SECT_CREDIT', innerMonologue: '接受' }, () => .99)).not.toBeNull();
    const loan = world.credit.loans[0];
    world.tick = loan.dueTick! - 1;
    for (const sect of [lender, borrower]) {
      sect.monthlyEconomy = { tick: loan.dueTick!, taxes: 0, mining: 0, upkeep: 0, net: 0 };
    }
    borrower.spiritStones = SECT_CREDIT_RESERVE + 30;
    const stopped: Record<string, LLMDecisionPayload> = Object.fromEntries(world.cultivators.map(({ id }) =>
      [id, { chosenAction: 'REST', innerMonologue: '静候' }]));
    const collected = advanceWorldTick(world, stopped, () => .99);
    expect(collected.credit.loans[0].receipts).toEqual([{ tick: loan.dueTick!, kind: 'collection', amount: 30 }]);
    expect(collected.sects.find(({ id }) => id === lender.id)?.spiritStones).toBe(lender.spiritStones + 30);
    expect(collected.sects.find(({ id }) => id === borrower.id)?.spiritStones).toBe(SECT_CREDIT_RESERVE);
    expect(advanceSectCredit(collected)).toEqual([]);
    expect(collected.credit.loans[0].receipts).toHaveLength(1);
  });

  it('round-trips partial voluntary and collection receipts within the same shared tick cap', () => {
    const { world, borrower, origin, receiver } = fixture();
    const offer = availableSectCreditActions(origin, world).find((item) => item.creditMove === 'offer' && item.targetSectId === borrower.id)!;
    expect(applyCultivatorBrainDecision(world, origin, { ...offer, chosenAction: 'SECT_CREDIT', innerMonologue: '邀约' }, () => .99)).not.toBeNull();
    const accepted = availableSectCreditActions(receiver, world).find(({ creditMove }) => creditMove === 'accept')!;
    expect(applyCultivatorBrainDecision(world, receiver, { ...accepted, chosenAction: 'SECT_CREDIT', innerMonologue: '同意' }, () => .99)).not.toBeNull();
    const loan = world.credit.loans[0];
    world.tick = loan.dueTick!;
    borrower.spiritStones = SECT_CREDIT_RESERVE + 10;
    const repay = availableSectCreditActions(receiver, world).find(({ creditMove }) => creditMove === 'repay')!;
    expect(applyCultivatorBrainDecision(world, receiver, { ...repay, chosenAction: 'SECT_CREDIT', innerMonologue: '本月自还' }, () => .99)).not.toBeNull();
    borrower.spiritStones += 15; // an unrelated incoming treasury receipt within the same turn
    advanceSectCredit(world);
    expect(loan.receipts).toEqual([{ tick: world.tick, kind: 'voluntary', amount: 10 },
      { tick: world.tick, kind: 'collection', amount: 15 }]);
    expect(decodeWorldSave(encodeWorldSave(world)).credit).toEqual(world.credit);
  });

  it('migrates a previous world without retroactively borrowing or modifying any treasury', () => {
    const { world } = fixture();
    const { credit, ...legacy } = world;
    const restored = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: legacy }));
    expect(restored.credit).toEqual(credit);
    expect(restored.sects).toEqual(world.sects);
  });
});
