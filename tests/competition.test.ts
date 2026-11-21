import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceCompetitionSeasons, availableCompetitionActions, competitionActorOptedOut, COMPETITION_RULES,
  createCompetitionState, publicCompetitionStandings, recordBreakthroughCompetition, recordReliefCompetition,
  recordTournamentChampion, recordTournamentRound, resolveCompetitionAction } from '../src/engine/competitionEngine';
import { advanceOccasions } from '../src/engine/occasionEngine';
import { resolveSettlementAction } from '../src/engine/settlementEngine';
import type { CompetitionMove, Cultivator, WorldEvent, WorldOccasion } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(307);
  world.competitions = createCompetitionState(world.year, world.tick);
  const [first, second, third] = world.cultivators;
  const market = world.locations.find(({ type }) => type === 'market')!;
  const village = world.settlements.villages.find(({ locationId }) => locationId === market.id)!;
  for (const actor of [first, second, third]) {
    actor.locationId = market.id;
    actor.spiritStones = 500;
    actor.herbs.jade_leaf = 5;
    actor.realm = '筑基';
  }
  village.stress = 60;
  const consent = (actor: Cultivator, seasonMove: CompetitionMove) =>
    resolveCompetitionAction(world, actor, { chosenAction: 'RANK_SEASON', seasonMove, innerMonologue: '自愿决定' });
  const relief = (actor: Cultivator) => resolveSettlementAction(world, actor, {
    chosenAction: 'DELIVER_RELIEF', targetSettlementId: village.id, innerMonologue: '实物赈济',
  });
  const promote = (actor: Cultivator): WorldEvent => {
    actor.realm = '金丹';
    return { id: `evt-${world.tick}-verified-break-${actor.id}`, tick: world.tick, year: world.year, month: world.month,
      title: '不依赖事件标题', description: '依法记录状态变化', category: 'breakthrough', actorIds: [actor.id], locationId: actor.locationId };
  };
  return { world, first, second, third, market, village, consent, relief, promote };
}

describe('public rules, opt-in seasons and earned honorary titles', () => {
  it('opts in explicitly, excludes joining-tick and private/hidden breakthroughs, and deduplicates authentic sources', () => {
    const { world, first, second, consent, promote } = fixture();
    expect(availableCompetitionActions(first, world)).toEqual([{ action: 'RANK_SEASON', seasonMove: 'join' }]);
    expect(consent(first, 'join')).not.toBeNull();
    expect(consent(first, 'join')).toBeNull();
    const sameTick = promote(first);
    recordBreakthroughCompetition(world, first, '筑基', sameTick);
    expect(world.competitions.scores).toEqual([]);

    world.tick++;
    const authentic = promote(first);
    recordBreakthroughCompetition(world, first, '金丹', authentic);
    recordBreakthroughCompetition(world, first, '筑基', { ...authentic, witnessScope: 'participants' });
    recordBreakthroughCompetition(world, first, '筑基', { ...authentic, category: 'intrigue' });
    const hide = world.locations.find(({ type }) => type === 'secret_realm')!;
    const previous = first.locationId;
    first.locationId = hide.id;
    recordBreakthroughCompetition(world, first, '筑基', { ...authentic, locationId: hide.id });
    expect(world.competitions.scores).toEqual([]);
    first.locationId = previous;
    recordBreakthroughCompetition(world, second, '筑基', promote(second)); // Second actor did not opt in.
    recordBreakthroughCompetition(world, first, '筑基', authentic);
    recordBreakthroughCompetition(world, first, '筑基', authentic);
    expect(world.competitions.scores).toHaveLength(1);
    expect(world.competitions.scores[0]).toMatchObject({ rule: 'major_breakthrough', sourceId: authentic.id, points: 3, actorId: first.id });
    expect(publicCompetitionStandings(world)).toEqual([{ actorId: first.id, rank: 1, score: 3, firstScoredTick: world.tick, disposition: 'ranked' }]);
  });

  it('accepts only actual funded relief at a public market and only active consensual entries', () => {
    const { world, first, consent, relief } = fixture();
    consent(first, 'join');
    world.tick++;
    expect(relief(first)).not.toBeNull();
    const valid = world.settlements.records.at(-1)!;
    recordReliefCompetition(world, { ...valid });
    expect(world.competitions.scores).toEqual([]);
    recordReliefCompetition(world, valid);
    recordReliefCompetition(world, valid);
    expect(world.competitions.scores).toHaveLength(1);
    expect(world.competitions.scores[0]).toMatchObject({ actorId: first.id, rule: 'public_relief', sourceId: valid.id, points: COMPETITION_RULES.public_relief.points });
    consent(first, 'withdraw');
    expect(publicCompetitionStandings(world)).toEqual([{ actorId: first.id, disposition: 'withdrawn', score: 0 }]);
    expect(availableCompetitionActions(first, world)).toEqual([]);
    expect(consent(first, 'join')).toBeNull();
    world.tick += 2;
    expect(relief(first)).not.toBeNull();
    recordReliefCompetition(world, world.settlements.records.at(-1)!);
    expect(world.competitions.scores).toHaveLength(1);
  });

  it('scores genuine non-bye tournament wins and championship once through the occasion resolver', () => {
    const { world, first, second, third, market, consent } = fixture();
    for (const actor of [first, second, third]) {
      consent(actor, 'join');
      actor.hp = actor.maxHp;
    }
    first.combatPower = 2000; second.combatPower = 190; third.combatPower = 10;
    world.tick++;
    const roster = [first.id, second.id, third.id];
    const tournament: WorldOccasion = { id: 'official-season-tournament', kind: 'tournament', locationId: market.id,
      status: 'running', title: '公开规则赛事', startedTick: 1, registrationClosesTick: 2, expiresTick: 19,
      participantIds: roster, remainingIds: roster, bouts: [], expeditions: [], round: 0 };
    world.occasions.push(tournament);
    expect(advanceOccasions(world, () => .5)).toHaveLength(1);
    expect(tournament.bouts.some((bout) => !bout.secondId && bout.winnerId === second.id)).toBe(true);
    expect(world.competitions.scores).toMatchObject([{ actorId: first.id, rule: 'tournament_win', points: 4 }]);
    recordTournamentRound(world, tournament, tournament.bouts[0]);
    recordTournamentChampion(world, tournament);
    expect(world.competitions.scores).toHaveLength(1);
    world.tick++;
    advanceOccasions(world, () => .5);
    expect(tournament).toMatchObject({ status: 'completed', championId: first.id });
    expect(world.competitions.scores.map(({ rule }) => rule)).toEqual(['tournament_win', 'tournament_win', 'tournament_champion']);
    recordTournamentChampion(world, tournament);
    expect(world.competitions.scores).toHaveLength(3);
    expect(publicCompetitionStandings(world)[0]).toMatchObject({ actorId: first.id, score: 14, rank: 1 });
  });

  it('uses immutable score/earliest credit/id tie-breakers, freezes at rotation, and pays no assets for the honor', () => {
    const { world, first, second, third, consent, promote } = fixture();
    for (const actor of [first, second, third]) consent(actor, 'join');
    world.tick += 2;
    recordBreakthroughCompetition(world, third, '筑基', promote(third));
    recordBreakthroughCompetition(world, second, '筑基', promote(second));
    world.tick++;
    recordBreakthroughCompetition(world, first, '筑基', promote(first));
    const ordered = [second.id, third.id].sort().concat(first.id);
    const priorId = world.competitions.seasons[0].id;
    const merchandise = world.cultivators.map((actor) => ({ id: actor.id, stones: actor.spiritStones, title: actor.title, gear: actor.artifacts.length }));
    const frozen = structuredClone(world.competitions.scores);
    expect(publicCompetitionStandings(world).map(({ actorId }) => actorId)).toEqual(ordered);
    world.tick = 13; world.month = 1; world.year++;
    expect(advanceCompetitionSeasons(world)[0]?.title).toBe('年度争衡魁首');
    expect(advanceCompetitionSeasons(world)).toEqual([]);
    expect(world.competitions.honors).toEqual([{ id: `honor-${priorId}`, seasonId: priorId, actorId: ordered[0], place: 1, score: 3,
      awardedTick: 13, title: '年度争衡魁首' }]);
    expect(world.competitions.scores).toEqual(frozen);
    expect(publicCompetitionStandings(world)).toEqual([]);
    expect(publicCompetitionStandings(world, priorId).map(({ actorId }) => actorId)).toEqual(ordered);
    expect(world.cultivators.map((actor) => ({ id: actor.id, stones: actor.spiritStones, title: actor.title, gear: actor.artifacts.length }))).toEqual(merchandise);
  });

  it('preserves opt-out beyond season archive and only changes it through an explicit later choice', () => {
    const { world, first, consent } = fixture();
    consent(first, 'join');
    world.tick++;
    consent(first, 'withdraw');
    expect(competitionActorOptedOut(world, first.id)).toBe(true);
    for (let i = 0; i < 11; i++) {
      world.year++; world.tick += 12; world.month = 1;
      expect(advanceCompetitionSeasons(world)).toEqual([]);
      expect(publicCompetitionStandings(world)).toEqual([]);
    }
    expect(world.competitions.seasons).toHaveLength(8);
    expect(world.competitions.entries).toEqual([]);
    expect(competitionActorOptedOut(world, first.id)).toBe(true);
    expect(consent(first, 'join')).not.toBeNull();
    expect(competitionActorOptedOut(world, first.id)).toBe(false);
  });
});
