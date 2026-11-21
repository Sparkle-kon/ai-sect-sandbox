import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableOathArbitrationActions } from '../src/engine/oathArbitrationEngine';
import { advanceOaths, availableOathActions } from '../src/engine/oathEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMDecisionPayload } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '核验原有托管与亲见。' };
const config = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'test-fixture', model: 'fixture' };
afterEach(() => vi.unstubAllGlobals());

describe('canonical tender and the same escrow through a real hearing', () => {
  it('does not create a second deposit and refunds once only after consent, one actual witness and two independent votes', async () => {
    const world = createInitialWorld(11621);
    world.tick = 40;
    world.month = 7;
    const [sectA, sectB, sectC, sectD] = world.sects;
    const payer = world.cultivators.find(({ sectId }) => sectId === sectA.id)!;
    const provider = world.cultivators.find(({ sectId }) => sectId === sectB.id)!;
    const [witness, judgeA] = world.cultivators.filter(({ sectId }) => sectId === sectC.id);
    const judgeB = world.cultivators.find(({ sectId }) => sectId === sectD.id)!;
    const location = 'loc-market';
    const elsewhere = 'loc-market-east';
    world.relationships = [];
    for (const actor of world.cultivators) actor.locationId = elsewhere;
    for (const actor of [payer, provider, witness]) {
      actor.locationId = location;
      actor.hp = actor.maxHp;
    }
    payer.spiritStones = 200;
    provider.spiritStones = 100;
    provider.personality = '刚正';
    provider.herbs.jade_leaf = 12;
    const payerHerbs = payer.herbs.jade_leaf;
    const apply = (actor: Cultivator, choice: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, choice, () => .99);
    expect(apply(payer, { ...rest, chosenAction: 'OFFER_OATH', targetCultivatorId: provider.id, oathTerm: 'jade_herb' })).not.toBeNull();
    const oath = world.oaths.contracts[0];
    expect(apply(provider, { ...rest, chosenAction: 'ACCEPT_OATH', targetOathId: oath.id })).not.toBeNull();
    expect(oath.escrow).toEqual({ payment: 48, collateral: 24 });
    world.tick++;
    apply(payer, { ...rest, chosenAction: 'EXPLORE', targetLocationId: elsewhere });
    expect(payer.locationId).toBe(elsewhere);
    expect(apply(provider, { ...rest, chosenAction: 'FULFILL_OATH', targetOathId: oath.id })).not.toBeNull();
    expect(world.oathArbitrations.observations[0]?.observerIds).toEqual([witness.id]);
    const open = computeHeuristicDecision(provider, world, () => .99);
    expect(open).toMatchObject({ chosenAction: 'OATH_ARBITRATION', arbitrationMove: 'open', targetTenderTick: world.tick });
    expect(apply(provider, open)).not.toBeNull();
    const opened = world.oathArbitrations.cases[0];
    expect(opened.status).toBe('offered');
    expect(oath.escrow).toEqual({ payment: 48, collateral: 24 });

    world.tick++;
    for (const actor of [payer, judgeA, judgeB]) {
      apply(actor, { ...rest, chosenAction: 'EXPLORE', targetLocationId: location });
      expect(actor.locationId).toBe(location);
    }
    const choose = (actor: Cultivator, arbitrationMove: NonNullable<LLMDecisionPayload['arbitrationMove']>, targetCultivatorId?: string) => {
      const option = availableOathArbitrationActions(actor, world).find((row) =>
        row.arbitrationMove === arbitrationMove && row.targetCultivatorId === targetCultivatorId);
      expect(option).toBeDefined();
      return { ...rest, ...option!, chosenAction: 'OATH_ARBITRATION' } satisfies LLMDecisionPayload;
    };
    expect(apply(payer, choose(payer, 'join'))).not.toBeNull();
    expect(opened.status).toBe('hearing');
    world.tick++;
    const modelChoice = choose(payer, 'appoint', judgeA.id);
    const respond = (value: LLMDecisionPayload) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
    const mocked = vi.fn(async () => respond({ ...modelChoice, targetCultivatorId: witness.id }));
    vi.stubGlobal('fetch', mocked);
    const source = vi.fn();
    await queryCultivatorLLMDecision(payer, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(opened.appointments).toEqual([]);
    mocked.mockImplementation(async () => respond(modelChoice));
    const exact = await queryCultivatorLLMDecision(payer, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(apply(payer, exact)).not.toBeNull();
    expect(apply(provider, choose(provider, 'appoint', judgeB.id))).not.toBeNull();
    world.tick++;
    expect(apply(judgeA, choose(judgeA, 'accept'))).not.toBeNull();
    expect(apply(judgeB, choose(judgeB, 'accept'))).not.toBeNull();
    expect(apply(judgeA, { ...rest, chosenAction: 'OATH_ARBITRATION', arbitrationMove: 'file', targetOathId: oath.id })).toBeNull();
    const noWitness = decodeWorldSave(encodeWorldSave(world));
    noWitness.tick = noWitness.oaths.contracts[0].deadlineTick!;
    advanceOaths(noWitness);
    const disp = { ...rest, chosenAction: 'OATH_ARBITRATION', arbitrationMove: 'vote_inconclusive', targetOathId: oath.id } satisfies LLMDecisionPayload;
    for (const person of [judgeA, judgeB]) {
      const other = noWitness.cultivators.find(({ id }) => id === person.id)!;
      expect(applyCultivatorBrainDecision(noWitness, other, disp, () => .99)).not.toBeNull();
    }
    advanceOaths(noWitness);
    expect(noWitness.oathArbitrations.cases[0].disposition).toBe('inconclusive');
    expect(noWitness.oaths.contracts[0].escrow).toEqual({ payment: 48, collateral: 24 });
    expect(decodeWorldSave(encodeWorldSave(noWitness)).oathArbitrations).toEqual(noWitness.oathArbitrations);
    noWitness.tick = noWitness.oaths.contracts[0].appealUntilTick!;
    advanceOaths(noWitness);
    expect(noWitness.oaths.contracts[0].escrow).toEqual({ payment: 0, collateral: 0 });
    expect(apply(witness, choose(witness, 'file'))).not.toBeNull();
    world.tick = oath.deadlineTick!;
    advanceOaths(world);
    expect(oath.status).toBe('breached');
    expect(availableOathActions(provider, world, false).some(({ action }) => action === 'APPEAL_OATH')).toBe(false);
    world.tick = oath.appealUntilTick!;
    advanceOaths(world);
    expect(oath.escrow).toEqual({ payment: 48, collateral: 24 });
    expect(apply(judgeA, choose(judgeA, 'vote_refund'))).not.toBeNull();
    advanceOaths(world);
    expect(oath.escrow).toEqual({ payment: 48, collateral: 24 });
    expect(apply(judgeB, choose(judgeB, 'vote_refund'))).not.toBeNull();
    advanceOaths(world);
    expect(oath.status).toBe('excused');
    expect(opened).toMatchObject({ status: 'closed', disposition: 'refund', closedTick: world.tick });
    expect(oath.escrow).toEqual({ payment: 0, collateral: 0 });
    expect([payer.spiritStones, provider.spiritStones, payer.herbs.jade_leaf, provider.herbs.jade_leaf]).toEqual([200, 100, payerHerbs, 12]);
    expect(advanceOaths(world)).toEqual([]);
    expect(decodeWorldSave(encodeWorldSave(world)).oathArbitrations).toEqual(world.oathArbitrations);
  });
});
