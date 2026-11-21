import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { recordTransgression } from '../src/engine/bountyEngine';
import { availableCouncilPlans, resolveCouncil } from '../src/engine/councilEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableProbationActions } from '../src/engine/probationEngine';
import { SETTLEMENT_RELIEF } from '../src/engine/settlementEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMDecisionPayload } from '../src/types/world';

const config = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'test-fixture', model: 'fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '核对实际见习。' };
afterEach(() => vi.unstubAllGlobals());

describe('probation backed by a passed council and actual canonical settlement relief', () => {
  it('makes no progress from duplicate or forged model data, then may restore only membership once', async () => {
    const world = createInitialWorld(11331);
    world.tick = 32;
    world.month = 6;
    const sect = world.sects[0];
    const sponsor = world.cultivators.find(({ id }) => id === sect.leaderId)!;
    const [reviewerA, reviewerB, candidate] = world.cultivators.filter((actor) => actor.sectId === sect.id && actor.id !== sponsor.id);
    expect(candidate).toBeDefined();
    for (const person of [sponsor, reviewerA, reviewerB, candidate]) {
      person.sectId = sect.id; person.locationId = sect.headquartersId; person.hp = person.maxHp;
    }
    reviewerA.sectRank = reviewerB.sectRank = '长老';
    candidate.sectRank = '真传弟子';
    candidate.contribution = 60;
    world.relationships = [];
    recordTransgression(candidate, 'betrayal');
    recordTransgression(candidate, 'betrayal');
    const originalMisconduct = { score: candidate.transgressions, karma: candidate.karma, revision: candidate.disciplineRevision };
    const proposal = availableCouncilPlans(world, sect.id).find(({ proposal: issue }) =>
      issue.kind === 'expel' && issue.targetCultivatorId === candidate.id)!;
    expect(proposal).toBeDefined();
    const original = resolveCouncil(world, proposal, proposal.voterIds.map((voterId) => ({ voterId, vote: 'support', reason: '实际已记录恶行。' })))!;
    expect(original.status).toBe('passed');
    expect(candidate.sectId).toBe('');
    expect(world.probation.expulsions[0]).toMatchObject({ id: original.id, transgressions: originalMisconduct.score,
      disciplineRevision: originalMisconduct.revision, actorId: candidate.id });
    const markets = new Set(world.locations.filter(({ type }) => type === 'market').map(({ id }) => id));
    const villages = world.settlements.villages.filter(({ locationId }) => markets.has(locationId));
    const ids = new Set(villages.map(({ id }) => id));
    const request = availableProbationActions(candidate, world).find(({ probationMove, probationFirstVillageId, probationSecondVillageId }) =>
      probationMove === 'request' && ids.has(probationFirstVillageId!) && ids.has(probationSecondVillageId!))!;
    expect(request).toBeDefined();
    const legallyRequested: LLMDecisionPayload = { ...rest, ...request, chosenAction: 'PROBATION' };
    const reply = (value: LLMDecisionPayload) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
    const mock = vi.fn(async () => reply({ ...legallyRequested, probationSecondVillageId: legallyRequested.probationFirstVillageId }));
    vi.stubGlobal('fetch', mock);
    const source = vi.fn();
    await queryCultivatorLLMDecision(candidate, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(world.probation.cases).toEqual([]);
    mock.mockImplementation(async () => reply(legallyRequested));
    const appliedByModel = await queryCultivatorLLMDecision(candidate, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    const apply = (who: Cultivator, choice: LLMDecisionPayload) => applyCultivatorBrainDecision(world, who, choice, () => .99);
    expect(apply(candidate, appliedByModel)).not.toBeNull();
    sponsor.locationId = candidate.locationId;
    const admitted = computeHeuristicDecision(sponsor, world, () => .99);
    expect(admitted).toMatchObject({ chosenAction: 'PROBATION', probationMove: 'admit' });
    expect(apply(sponsor, admitted)).not.toBeNull();
    const row = world.probation.cases[0];
    expect(row.status).toBe('active');
    const choice = (probationMove: 'review' | 'restore', probationVote?: 'support') =>
      ({ ...rest, chosenAction: 'PROBATION', targetProbationId: row.id, probationMove, probationVote }) satisfies LLMDecisionPayload;
    expect(apply(reviewerA, choice('review', 'support'))).toBeNull();
    candidate.spiritStones = 1000;
    candidate.herbs.jade_leaf = 12;
    for (const id of row.villageIds) {
      world.tick++;
      const village = villages.find((item) => item.id === id)!;
      if (candidate.locationId !== village.locationId) {
        apply(candidate, { ...rest, chosenAction: 'EXPLORE', targetLocationId: village.locationId });
      }
      expect(candidate.locationId).toBe(village.locationId);
      village.stress = 35;
      const real = computeHeuristicDecision(candidate, world, () => .99);
      expect(real).toMatchObject({ chosenAction: 'DELIVER_RELIEF', targetSettlementId: village.id });
      expect(apply(candidate, real)).not.toBeNull();
      expect(apply(candidate, real)).toBeNull();
      expect(row.relief.at(-1)?.sourceId).toBe(world.settlements.records.at(-1)?.id);
    }
    expect(row.relief).toHaveLength(2);
    expect(candidate.spiritStones).toBe(1000 - 2 * SETTLEMENT_RELIEF.stones);
    expect(candidate.herbs.jade_leaf).toBe(12 - 2 * SETTLEMENT_RELIEF.jade_leaf);
    expect(apply(sponsor, choice('review', 'support'))).toBeNull();
    expect(apply(reviewerA, choice('review', 'support'))).not.toBeNull();
    expect(apply(reviewerA, choice('review', 'support'))).toBeNull();
    expect(apply(reviewerB, choice('review', 'support'))).not.toBeNull();
    expect(row.status).toBe('ready');
    expect(candidate.sectId).toBe('');
    expect(apply(candidate, choice('restore'))).not.toBeNull();
    expect(row.status).toBe('reinstated');
    expect(candidate).toMatchObject({ sectId: sect.id, sectRank: '外门弟子', contribution: 0, transgressions: originalMisconduct.score,
      karma: originalMisconduct.karma, disciplineRevision: originalMisconduct.revision });
    expect(candidate.guardAssignment).toBeUndefined();
    expect(world.councils[0]).toEqual(original);
    const raw = encodeWorldSave(world);
    expect(decodeWorldSave(raw).probation).toEqual(world.probation);
    const altered = JSON.parse(raw) as { world: typeof world };
    altered.world.probation.cases[0].relief[0].stones -= 1;
    expect(() => decodeWorldSave(JSON.stringify(altered))).toThrow('probation.relief.references');
    world.tick++;
    const agenda = () => availableCouncilPlans(world, sect.id).some(({ proposal: issue }) =>
      issue.kind === 'expel' && issue.targetCultivatorId === candidate.id);
    expect(agenda()).toBe(false);
    recordTransgression(candidate, 'killing');
    expect(agenda()).toBe(true);
  });
});
