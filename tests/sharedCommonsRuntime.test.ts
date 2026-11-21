import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableAlchemy, resolveAlchemy } from '../src/engine/alchemyEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableSharedCommonsActions } from '../src/engine/sharedCommonsEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload } from '../src/types/world';

const config = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fictional-fixture', model: 'fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '留在实际所在处。' };
const gather: LLMDecisionPayload = { ...rest, chosenAction: 'GATHER_HERBS', targetHerbId: 'jade_leaf' };
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(7128);
  world.tick = 32;
  world.month = 6;
  const leaders = world.sects.map((sect) => {
    const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
    leader.hp = leader.maxHp;
    leader.locationId = sect.headquartersId;
    return leader;
  });
  const market = world.locations.find(({ id }) => id === 'loc-market')!;
  market.herbs.jade_leaf = market.herbCapacity.jade_leaf = 9;
  world.diplomacy = [];
  const proposer = leaders[0];
  const opening = availableSharedCommonsActions(proposer, world).find((option) =>
    option.commonsMove === 'offer' && option.targetLocationId === market.id && option.targetHerbId === 'jade_leaf')!;
  expect(opening).toBeDefined();
  const apply = (actor: typeof proposer, choice: LLMDecisionPayload) =>
    applyCultivatorBrainDecision(world, actor, choice, () => .99);
  const letSign = (sectId: string) => leaders.find((person) => person.sectId === sectId)!;
  return { world, market, proposer, opening, apply, letSign };
}

describe('shared commons canonical harvest and both decision paths', () => {
  it('retains exact signed terms from JSON and uses the same Utility consent before settling real stock', async () => {
    const { world, market, proposer, opening, apply, letSign } = fixture();
    const utility = computeHeuristicDecision(proposer, world, () => .99);
    expect(utility).toMatchObject({ chosenAction: 'SHARED_COMMONS', commonsMove: 'offer' });
    const message = (arg: Partial<LLMDecisionPayload>) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ ...arg, chosenAction: 'SHARED_COMMONS', innerMonologue: '仅签明示条款。' }) } }],
    }));
    const fetchMock = vi.fn(async () => message({ ...opening, targetCommonsThirdSectId: opening.targetSectId }));
    vi.stubGlobal('fetch', fetchMock);
    const source = vi.fn();
    await queryCultivatorLLMDecision(proposer, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(world.sharedCommons.pacts).toHaveLength(0);
    fetchMock.mockImplementation(async () => message(opening));
    const legitimate = await queryCultivatorLLMDecision(proposer, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(legitimate).toMatchObject({ targetSectId: opening.targetSectId, targetCommonsThirdSectId: opening.targetCommonsThirdSectId,
      targetHerbId: 'jade_leaf', targetLocationId: market.id });
    expect(apply(proposer, legitimate)).not.toBeNull();

    const guests = [letSign(opening.targetSectId!), letSign(opening.targetCommonsThirdSectId!)];
    expect(guests.every(Boolean)).toBe(true);
    for (const guest of guests) {
      const answer = computeHeuristicDecision(guest, world, () => .99);
      expect(answer).toMatchObject({ chosenAction: 'SHARED_COMMONS', commonsMove: 'sign' });
      expect(apply(guest, answer)).not.toBeNull();
    }
    const agreement = world.sharedCommons.pacts[0];
    expect(agreement.status).toBe('active');
    expect(agreement.rounds).toEqual([]);
    let next = advanceWorldTick(world, Object.fromEntries(world.cultivators.map(({ id }) => [id, rest])), () => .99);
    const current = () => next.sharedCommons.pacts[0].rounds[0];
    const actualSite = next.locations.find(({ id }) => id === market.id)!;
    expect(actualSite.ownerSectId).toBeUndefined();
    expect(current().stockAtOpen).toBe(9);
    expect(current().reserved).toBe(8);
    expect(current().allocations.map(({ maintenanceDue, maintenancePaid, quota, used }) => [maintenanceDue, maintenancePaid, quota, used]))
      .toEqual([[6, 6, 4, 0], [3, 3, 2, 0], [3, 3, 2, 0]]);
    const paidSectIds = new Set(agreement.parties.map(({ sectId }) => sectId));
    const firstHarvester = next.cultivators.find(({ id }) => id === proposer.id)!;
    const bystander = next.cultivators.find((actor) => !paidSectIds.has(actor.sectId ?? ''))!;
    firstHarvester.locationId = bystander.locationId = actualSite.id;
    for (const person of [firstHarvester, bystander]) person.herbs.jade_leaf = 0;
    expect(availableAlchemy(bystander, next)).toContainEqual({ action: 'GATHER_HERBS', targetHerbId: 'jade_leaf' });
    expect(resolveAlchemy(next, bystander, gather, () => .99)).not.toBeNull();
    expect([actualSite.herbs.jade_leaf, bystander.herbs.jade_leaf]).toEqual([8, 1]);
    expect(resolveAlchemy(next, bystander, gather, () => .99)).toBeNull();
    expect(resolveAlchemy(next, firstHarvester, gather, () => .99)).not.toBeNull();
    expect([actualSite.herbs.jade_leaf, firstHarvester.herbs.jade_leaf]).toEqual([6, 2]);
    expect(current().allocations.find(({ sectId }) => sectId === proposer.sectId)?.used).toBe(2);
    const raw = encodeWorldSave(next);
    next = decodeWorldSave(raw);
    expect(current().harvests).toEqual([{ tick: next.tick, actorId: firstHarvester.id, sectId: proposer.sectId, units: 2 }]);
    const corrupt = JSON.parse(raw) as { world: typeof next };
    corrupt.world.sharedCommons.pacts[0].rounds[0].harvests[0].units = 1;
    expect(() => decodeWorldSave(JSON.stringify(corrupt))).toThrow('sharedCommons.allocations.accounting');
    const legacy = JSON.parse(raw) as { world: Partial<typeof next> };
    delete legacy.world.sharedCommons;
    expect(decodeWorldSave(JSON.stringify(legacy)).sharedCommons).toEqual({ pacts: [], nextId: 1 });
  });
});
