import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceWorkshops, availableWorkshopActions, workshopTerms } from '../src/engine/workshopEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload } from '../src/types/world';

const config = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'test-fixture', model: 'fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '本回合在此。' };
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(11311);
  world.tick = 28;
  world.month = 6;
  const site = world.locations.find(({ id }) => id === 'loc-market')!;
  const patron = world.cultivators[0];
  const maker = world.cultivators.find((actor) => actor.sectId === patron.sectId && actor.id !== patron.id)!;
  for (const person of [patron, maker]) {
    person.locationId = site.id;
    person.hp = person.maxHp;
  }
  site.furnaceGrade = 3;
  maker.spiritRoot = site.spiritRoot;
  maker.techniqueMastery = 100;
  patron.spiritStones = 500;
  patron.herbs.earth_root = 20;
  patron.artifacts = [];
  const proposal = availableWorkshopActions(patron, world).find((option) => option.workshopMove === 'offer' &&
    option.targetCultivatorId === maker.id && option.workshopTier === '法器' && option.workshopQuantity === 2 &&
    option.workshopQualityFloor === 'fine')!;
  expect(proposal).toBeDefined();
  return { world, maker, patron, proposal };
}

describe('commissions through the LLM and Utility paths', () => {
  it('requires the named real maker and four actual work turns to settle two distinct fine items', async () => {
    const { world, patron, maker, proposal } = fixture();
    const offer: LLMDecisionPayload = { ...proposal, chosenAction: 'WORKSHOP', innerMonologue: '按实有良品交货。' };
    const chat = (value: LLMDecisionPayload) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
    const model = vi.fn(async () => chat({ ...offer, targetCultivatorId: 'invented-maker' }));
    vi.stubGlobal('fetch', model);
    const source = vi.fn();
    await queryCultivatorLLMDecision(patron, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(world.workshops.orders).toEqual([]);
    model.mockImplementation(async () => chat(offer));
    const valid = await queryCultivatorLLMDecision(patron, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(applyCultivatorBrainDecision(world, patron, valid, () => .99)).not.toBeNull();
    expect(patron.spiritStones).toBe(500);
    const signed = computeHeuristicDecision(maker, world, () => .99);
    expect(signed).toMatchObject({ chosenAction: 'WORKSHOP', workshopMove: 'accept' });
    expect(applyCultivatorBrainDecision(world, maker, signed, () => .99)).not.toBeNull();
    const contract = world.workshops.orders[0];
    const terms = workshopTerms(contract.tier, contract.quantity);
    expect(patron.spiritStones).toBe(500 - terms.totalStones);
    const action = { ...rest, chosenAction: 'WORKSHOP', targetWorkshopId: contract.id, workshopMove: 'work' } satisfies LLMDecisionPayload;
    expect(applyCultivatorBrainDecision(world, maker, action, () => .99)).toBeNull();

    let next = world;
    for (let count = 1; count <= 4; count++) {
      const decisions = Object.fromEntries(next.cultivators.map(({ id }) => [id, rest]));
      decisions[maker.id] = action;
      next = advanceWorldTick(next, decisions, () => .99);
      expect(next.workshops.orders[0].work).toHaveLength(count);
      expect(next.cultivators.find(({ id }) => id === patron.id)?.artifacts).toHaveLength(Math.floor(count / 2));
      next = decodeWorldSave(encodeWorldSave(next));
    }
    const completed = next.workshops.orders[0];
    expect(completed).toMatchObject({ status: 'completed', escrowStones: 0, escrowHerbs: 0, refundedStones: 0, refundedHerbs: 0 });
    const produced = next.cultivators.find(({ id }) => id === patron.id)!.artifacts;
    expect(produced.map(({ id, maxDurability }) => [id, maxDurability])).toEqual([
      [`workshop-artifact-${contract.id}-1`, 72], [`workshop-artifact-${contract.id}-2`, 72],
    ]);
    expect(completed.work.filter(({ stage }) => stage === 'finish').map(({ quality, feePaid }) => [quality, feePaid]))
      .toEqual([['fine', terms.feePerPiece], ['fine', terms.feePerPiece]]);
    const journal = next.resourceFlow.months.flatMap(({ entries }) => entries).filter(({ mechanism }) => mechanism === 'workshop');
    expect(journal.filter(({ reason }) => reason === 'workshop_wage').map(({ amount }) => amount)).toEqual([terms.feePerPiece, terms.feePerPiece]);
    expect(advanceWorkshops(next)).toEqual([]);
    const tampered = JSON.parse(encodeWorldSave(next)) as { world: typeof next };
    tampered.world.workshops.orders[0].work[1].feePaid = terms.feePerPiece + 1;
    expect(() => decodeWorldSave(JSON.stringify(tampered))).toThrow('workshops.work.quality');
  });
});
