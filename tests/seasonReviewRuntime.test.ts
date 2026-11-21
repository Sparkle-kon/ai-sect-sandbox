import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceCompetitionSeasons, publicCompetitionStandings } from '../src/engine/competitionEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceSeasonReviews, effectiveCompetitionHonors, SEASON_REVIEW_WINDOW } from '../src/engine/seasonReviewEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '只核对规范收据。' };
const config = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'test-fixture', model: 'fixture' };
const winner = (world: WorldState, seasonId: string) => publicCompetitionStandings(world, seasonId).find(({ rank }) => rank === 1);
afterEach(() => vi.unstubAllGlobals());

describe('season closure, immutable legacy attribution and effective title ownership', () => {
  it('audits genuine relief evidence, then moves one active honor without rewriting its original receipt', async () => {
    let world = createInitialWorld(11821);
    let [actual, wrong] = world.cultivators;
    const site = world.locations.find(({ id }) => id === 'loc-market')!;
    const village = world.settlements.villages.find(({ locationId }) => locationId === site.id)!;
    actual.locationId = wrong.locationId = site.id;
    actual.personality = '刚正';
    actual.spiritStones = 200;
    actual.herbs.jade_leaf = 20;
    const apply = (person: typeof actual, action: LLMDecisionPayload, state = world) =>
      applyCultivatorBrainDecision(state, person, action, () => .99);
    const entrant = { ...rest, chosenAction: 'RANK_SEASON', seasonMove: 'join' } satisfies LLMDecisionPayload;
    expect(apply(actual, entrant)).not.toBeNull();
    expect(apply(wrong, entrant)).not.toBeNull();
    village.stress = 45;
    const decisions = Object.fromEntries(world.cultivators.map(({ id }) => [id, rest]));
    decisions[actual.id] = { ...rest, chosenAction: 'DELIVER_RELIEF', targetSettlementId: village.id };
    world = advanceWorldTick(world, decisions, () => .99);
    [actual, wrong] = world.cultivators;
    expect(world.competitions.scores).toHaveLength(1);
    expect(world.competitionReviews.proofs[0]).toMatchObject({ rule: 'public_relief', actorId: actual.id, settlementId: village.id,
      stones: 12, herbs: 2 });
    const correctWorld = decodeWorldSave(encodeWorldSave(world));
    const score = world.competitions.scores[0];
    // Fixture for an old misattributed register. The independent actual paid source is not fabricated or moved.
    score.actorId = wrong.id;
    for (const state of [world, correctWorld]) {
      state.year++;
      state.month = 1;
      state.tick = 13;
      expect(advanceCompetitionSeasons(state)).toHaveLength(1);
    }
    const original = structuredClone(world.competitions.honors[0]);
    expect(original.actorId).toBe(wrong.id);
    const review = { ...rest, chosenAction: 'SEASON_REVIEW', targetScoreId: score.id } satisfies LLMDecisionPayload;
    expect(computeHeuristicDecision(actual, world, () => .99)).toMatchObject({ chosenAction: 'SEASON_REVIEW', targetScoreId: score.id });
    const reply = (value: LLMDecisionPayload) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
    const mock = vi.fn(async () => reply({ ...review, targetScoreId: 'unproven-receipt' }));
    vi.stubGlobal('fetch', mock);
    const source = vi.fn();
    await queryCultivatorLLMDecision(actual, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(world.competitionReviews.cases).toHaveLength(0);
    mock.mockImplementation(async () => reply(review));
    const approved = await queryCultivatorLLMDecision(actual, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(apply(actual, approved)).not.toBeNull();
    expect(apply(actual, approved)).toBeNull();
    const comparative = correctWorld.cultivators.find(({ id }) => id === actual.id)!;
    expect(apply(comparative, review, correctWorld)).not.toBeNull();
    expect(effectiveCompetitionHonors(world)[0]).toMatchObject({ actorId: wrong.id });
    expect(advanceSeasonReviews(world, winner)).toEqual([]);
    const close = (base: WorldState) => {
      let state = base;
      for (let count = 0; count < SEASON_REVIEW_WINDOW; count++) {
        state = advanceWorldTick(state, Object.fromEntries(state.cultivators.map(({ id }) => [id, rest])), () => .99);
      }
      return state;
    };
    const contradicted = close(world);
    expect(contradicted.competitionReviews.cases[0]).toMatchObject({ status: 'corrected' });
    expect(contradicted.competitionReviews.corrections).toEqual([expect.objectContaining({ seasonId: original.seasonId,
      previousActorId: wrong.id, newActorId: actual.id, reason: 'wrong_recipient' })]);
    expect(contradicted.competitions.scores.find(({ id }) => id === score.id)?.actorId).toBe(wrong.id);
    expect(contradicted.competitions.honors).toEqual([original]);
    expect(effectiveCompetitionHonors(contradicted)).toEqual([expect.objectContaining({ actorId: actual.id })]);
    expect(winner(contradicted, original.seasonId)?.actorId).toBe(actual.id);
    expect(advanceSeasonReviews(contradicted, winner)).toEqual([]);
    const raw = encodeWorldSave(contradicted);
    expect(decodeWorldSave(raw).competitionReviews).toEqual(contradicted.competitionReviews);
    const bad = JSON.parse(raw) as { world: WorldState };
    bad.world.competitionReviews.proofs[0].actorId = wrong.id;
    expect(() => decodeWorldSave(JSON.stringify(bad))).toThrow('competitionReviews.proofs.relief');
    const forgedHonor = JSON.parse(raw) as { world: WorldState };
    forgedHonor.world.competitionReviews.honorChanges[0].newActorId = wrong.id;
    expect(() => decodeWorldSave(JSON.stringify(forgedHonor))).toThrow('competitionReviews.honorChanges.references');
    const confirmed = close(correctWorld);
    expect(confirmed.competitionReviews.cases[0]).toMatchObject({ status: 'confirmed' });
    expect(confirmed.competitionReviews.honorChanges).toEqual([]);
    expect(effectiveCompetitionHonors(confirmed)[0]?.actorId).toBe(actual.id);
  });
});
