import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceCompetitionSeasons, competitionActorOptedOut, publicCompetitionStandings, resolveCompetitionAction } from '../src/engine/competitionEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldOccasion, WorldState } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const rest = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(
  world.cultivators.map(({ id }) => [id, { chosenAction: 'REST', innerMonologue: '调息' }]));
afterEach(() => vi.unstubAllGlobals());

describe('public seasons within the live turn', () => {
  it('enrolls by either brain, scores a real public non-bye win and championship, then awards once', async () => {
    const world = createInitialWorld(9);
    world.tick = 4; world.month = 4;
    const actor = world.cultivators[0];
    actor.hp = actor.maxHp;
    actor.qiProgress = 0;
    actor.personality = '刚正';
    const local = computeHeuristicDecision(actor, world, () => .99);
    expect(local).toMatchObject({ chosenAction: 'RANK_SEASON', seasonMove: 'join' });
    const client = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(local) } }] })));
    vi.stubGlobal('fetch', client);
    const source = vi.fn();
    const model = await queryCultivatorLLMDecision(actor, world, config, source);
    expect(source).toHaveBeenCalledWith('llm');
    expect(model).toMatchObject({ chosenAction: 'RANK_SEASON', seasonMove: 'join' });
    const fromRule = advanceWorldTick(world, { ...rest(world), [actor.id]: local }, () => .99);
    const fromModel = advanceWorldTick(world, { ...rest(world), [actor.id]: model }, () => .99);
    expect(fromModel.competitions).toEqual(fromRule.competitions);
    expect(fromModel.competitions.entries).toHaveLength(1);
    expect(fromModel.competitions.entries[0]).toMatchObject({ actorId: actor.id, joinedTick: 5 });

    const contender = fromModel.cultivators.find(({ id }) => id === actor.id)!;
    const rival = fromModel.cultivators[1];
    const market = fromModel.locations.find(({ type }) => type === 'market')!;
    contender.locationId = market.id; rival.locationId = market.id;
    contender.combatPower = 10_000; rival.combatPower = 20;
    const fixture: WorldOccasion = { id: 'public-season-test', kind: 'tournament', title: '公示大比',
      locationId: market.id, status: 'running', startedTick: 1, registrationClosesTick: 3, expiresTick: 12,
      participantIds: [actor.id, rival.id], remainingIds: [actor.id, rival.id], bouts: [], expeditions: [], round: 0 };
    fromModel.occasions.push(fixture);
    const scored = advanceWorldTick(fromModel, rest(fromModel), () => .99);
    expect(scored.occasions.find(({ id }) => id === fixture.id)?.championId).toBe(actor.id);
    expect(scored.competitions.scores.map(({ rule }) => rule).sort()).toEqual(['tournament_champion', 'tournament_win']);
    const points = scored.competitions.scores.reduce((sum, row) => sum + row.points, 0);
    expect(publicCompetitionStandings(scored)).toContainEqual(expect.objectContaining({ actorId: actor.id, score: points, rank: 1 }));

    scored.tick = 12; scored.month = 12;
    const closing = advanceWorldTick(scored, rest(scored), () => .99);
    expect(closing.competitions.honors).toHaveLength(1);
    expect(closing.competitions.honors[0]).toMatchObject({ actorId: actor.id, score: points, place: 1, awardedTick: 13 });
    expect(advanceCompetitionSeasons(closing)).toEqual([]);
    expect(closing.competitions.honors).toHaveLength(1);
    const decoded = decodeWorldSave(encodeWorldSave(closing));
    expect(decoded.competitions).toEqual(closing.competitions);
    const fake = structuredClone(closing);
    fake.competitions.scores[0].points++;
    expect(() => encodeWorldSave(fake)).toThrow(/competitions.scores.references/);
  });

  it('counts verified public relief and a true major breakthrough, never a minor breakthrough; opt-out outlives the year', () => {
    const world = createInitialWorld(9);
    const actor = world.cultivators[0];
    const village = world.settlements.villages.find(({ locationId }) => locationId === 'loc-market')!;
    village.stress = 40;
    actor.locationId = village.locationId;
    actor.herbs.jade_leaf = 4;
    actor.spiritStones = 120;
    expect(resolveCompetitionAction(world, actor, { chosenAction: 'RANK_SEASON', seasonMove: 'join', innerMonologue: '主动报名' })).not.toBeNull();
    const relief = advanceWorldTick(world, { ...rest(world), [actor.id]: {
      chosenAction: 'DELIVER_RELIEF', targetSettlementId: village.id, innerMonologue: '实际交付补给',
    } }, () => .99);
    expect(relief.competitions.scores.map(({ rule }) => rule)).toEqual(['public_relief']);
    const volunteer = relief.cultivators.find(({ id }) => id === actor.id)!;
    volunteer.realm = '练气'; volunteer.realmStage = 8; volunteer.qiProgress = 100;
    const cultivate = { ...rest(relief), [actor.id]: { chosenAction: 'BREAKTHROUGH', innerMonologue: '累积实力' } } satisfies Record<string, LLMDecisionPayload>;
    const minor = advanceWorldTick(relief, cultivate, () => .01);
    expect(minor.competitions.scores).toHaveLength(1);
    minor.cultivators.find(({ id }) => id === actor.id)!.qiProgress = 100;
    const major = advanceWorldTick(minor, cultivate, () => .01);
    expect(major.cultivators.find(({ id }) => id === actor.id)!.realm).toBe('筑基');
    expect(major.competitions.scores.map(({ rule }) => rule)).toEqual(['public_relief', 'major_breakthrough']);

    const subject = major.cultivators.find(({ id }) => id === actor.id)!;
    expect(resolveCompetitionAction(major, subject, { chosenAction: 'RANK_SEASON', seasonMove: 'withdraw', innerMonologue: '退出' })).not.toBeNull();
    major.year++; major.tick = 16; major.month = 4;
    advanceCompetitionSeasons(major);
    expect(competitionActorOptedOut(major, actor.id)).toBe(true);
    expect(major.competitions.honors).toHaveLength(0);
    subject.qiProgress = 20; subject.personality = '刚正'; subject.hp = subject.maxHp;
    expect(computeHeuristicDecision(subject, major, () => .99).chosenAction).not.toBe('RANK_SEASON');
    expect(competitionActorOptedOut(decodeWorldSave(encodeWorldSave(major)), actor.id)).toBe(true);
  });

  it('starts a legacy save at its actual present date without awarding historical honors', () => {
    const world = createInitialWorld(33);
    world.year = 1007; world.tick = 80;
    const { competitions: _data, ...legacy } = world;
    const imported = decodeWorldSave(JSON.stringify({ world: legacy, format: 'ai-sect-sandbox', version: 1 }));
    expect(imported.competitions.seasons).toHaveLength(1);
    expect(imported.competitions.seasons[0]).toMatchObject({ year: 1007, openedTick: 80, status: 'open' });
    expect(imported.competitions.scores).toEqual([]);
    expect(imported.competitions.honors).toEqual([]);
  });
});
