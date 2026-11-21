import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceCompetitionSeasons, publicCompetitionStandings, recordTournamentChampion, resolveCompetitionAction } from '../src/engine/competitionEngine';
import { advanceSeasonReviews, availableSeasonReviewActions, effectiveCompetitionHonors, recordSeasonTournamentProof,
  resolveSeasonReviewAction, seasonScoreCorrections, visibleSeasonReviews } from '../src/engine/seasonReviewEngine';
import type { Cultivator, WorldOccasion, WorldState } from '../src/types/world';

const canonicalWinner = (world: WorldState, seasonId: string) =>
  publicCompetitionStandings(world, seasonId).find(({ rank }) => rank === 1);
function fixture(joinChampion = true) {
  const world = createInitialWorld(18);
  const [champion, claimant, other, unentered] = world.cultivators;
  const market = world.locations.find(({ type }) => type === 'market')!;
  for (const actor of [champion, claimant, other, unentered]) actor.locationId = market.id;
  for (const actor of [claimant, other, ...(joinChampion ? [champion] : [])]) {
    expect(resolveCompetitionAction(world, actor, { chosenAction: 'RANK_SEASON', seasonMove: 'join', innerMonologue: '' })).not.toBeNull();
  }
  world.tick = 10;
  world.month = 10;
  const occasion: WorldOccasion = { id: 'fixture-public-tourney', kind: 'tournament', title: '公开大比',
    locationId: market.id, startedTick: 5, registrationClosesTick: 7, expiresTick: 12, status: 'completed',
    participantIds: [champion.id, claimant.id, other.id], remainingIds: [], expeditions: [], round: 2,
    bouts: [{ round: 1, firstId: champion.id, secondId: claimant.id, winnerId: champion.id },
      { round: 2, firstId: champion.id, secondId: other.id, winnerId: champion.id }],
    championId: champion.id, lastResolvedTick: 10 };
  world.occasions.push(occasion);
  recordTournamentChampion(world, occasion);
  const season = world.competitions.seasons[0];
  const file = (actor: Cultivator, targetScoreId: string) =>
    resolveSeasonReviewAction(world, actor, { chosenAction: 'SEASON_REVIEW', targetScoreId, innerMonologue: '' });
  const seal = () => {
    world.year++;
    world.month = 1;
    world.tick = 13;
    advanceCompetitionSeasons(world);
    return world.competitions.honors[0];
  };
  const adjudicate = () => {
    world.tick = 16;
    world.month = 4;
    return advanceSeasonReviews(world, canonicalWinner);
  };
  return { world, champion, claimant, other, unentered, season, occasion, file, seal, adjudicate };
}

describe('season review certified scoring and one honor disposition', () => {
  it('requires a real two-contender win, preserves bracket proof after eviction and confirms a true receipt without moving honor', () => {
    const { world, champion, claimant, unentered, season, occasion, file, seal, adjudicate } = fixture();
    const score = world.competitions.scores[0];
    expect(world.competitionReviews.proofs).toHaveLength(1);
    expect(world.competitionReviews.proofs[0]).toMatchObject({ rule: 'tournament_champion', actorId: champion.id, championRound: 2, competitiveWinRound: 2 });
    recordSeasonTournamentProof(world, occasion);
    const bye: WorldOccasion = { ...occasion, id: 'bye', bouts: [{ round: 1, firstId: champion.id, winnerId: champion.id }] };
    world.occasions.push(bye);
    recordSeasonTournamentProof(world, bye);
    expect(world.competitionReviews.proofs).toHaveLength(1);
    expect(file(claimant, score.id)).toBeNull(); // still unsettled
    const original = seal();
    world.occasions.splice(0);
    expect(file(unentered, score.id)).toBeNull();
    expect(file(claimant, score.id)).toMatchObject({ witnessScope: 'participants' });
    expect(file(claimant, score.id)).toBeNull();
    expect(visibleSeasonReviews(world, unentered)).toEqual([]);
    expect(visibleSeasonReviews(world, claimant)[0]).toMatchObject({ status: 'pending' });
    expect(advanceSeasonReviews(world, canonicalWinner)).toEqual([]);
    expect(adjudicate()).toEqual([]);
    expect(visibleSeasonReviews(world, unentered, season.id)[0]).toMatchObject({ status: 'confirmed' });
    expect(visibleSeasonReviews(world, unentered, season.id)[0]).not.toHaveProperty('applicantId');
    expect(visibleSeasonReviews(world, unentered, season.id)[0]).not.toHaveProperty('opponentId');
    expect(effectiveCompetitionHonors(world)).toEqual([original]);
    expect(world.competitionReviews.honorChanges).toEqual([]);
  });

  it('voids a duplicate wrong receipt against the true source, preserves original, and performs at most one actual honor move', () => {
    const { world, champion, claimant, season, file, seal, adjudicate } = fixture();
    const trueScore = world.competitions.scores[0];
    const bad = { ...trueScore, id: 'score-legacy-wrong', actorId: claimant.id };
    const earlierMerit = { ...trueScore, id: 'score-early', actorId: claimant.id, rule: 'major_breakthrough' as const,
      sourceId: 'real-public-major-previous', points: 3, tick: trueScore.tick - 1 };
    world.competitions.scores.push(bad, earlierMerit);
    const original = seal();
    const frozen = structuredClone(original);
    expect(original.actorId).toBe(claimant.id);
    expect(file(champion, earlierMerit.id)).toBeNull();
    expect(file(champion, bad.id)).not.toBeNull();
    expect(file(claimant, trueScore.id)).not.toBeNull();
    expect(adjudicate()).toHaveLength(1);
    expect(world.competitions.scores).toContain(bad);
    expect(world.competitions.honors).toEqual([frozen]);
    expect(seasonScoreCorrections(world, season.id).get(bad.id)).toBeNull();
    expect(world.competitionReviews.corrections[0]).toMatchObject({ scoreId: bad.id, reason: 'duplicate_source', points: 6 });
    expect(effectiveCompetitionHonors(world)).toMatchObject([{ actorId: champion.id, score: 6 }]);
    expect(advanceSeasonReviews(world, canonicalWinner)).toEqual([]);
    expect(world.competitionReviews.honorChanges).toHaveLength(1);
  });

  it('does not grant retroactive participation or invent evidence when primary records contradict the filing', () => {
    const missing = fixture(false);
    const registered = missing.world.competitionReviews.proofs[0];
    expect(missing.world.competitions.scores).toEqual([]);
    const omitted = { id: 'score-wrong-ineligible', seasonId: registered.seasonId, actorId: missing.claimant.id,
      sourceId: registered.sourceId, tick: registered.tick, rule: 'tournament_champion' as const, points: 6, locationId: registered.locationId };
    missing.world.competitions.scores.push(omitted);
    missing.seal();
    expect(missing.file(missing.claimant, omitted.id)).not.toBeNull();
    expect(missing.adjudicate()).toHaveLength(1);
    expect(effectiveCompetitionHonors(missing.world)).toEqual([]);
    expect(missing.world.competitionReviews.corrections).toMatchObject([{ reason: 'recipient_ineligible' }]);

    const disputed = fixture();
    const source = disputed.world.competitions.scores[0];
    disputed.seal();
    expect(availableSeasonReviewActions(disputed.claimant, disputed.world)).toContainEqual({ action: 'SEASON_REVIEW', targetScoreId: source.id });
    expect(disputed.file(disputed.claimant, source.id)).not.toBeNull();
    disputed.occasion.championId = disputed.other.id;
    expect(disputed.adjudicate()).toEqual([]);
    expect(disputed.world.competitionReviews.cases[0].status).toBe('inconclusive');
    expect(disputed.world.competitionReviews.corrections).toEqual([]);
  });
});
