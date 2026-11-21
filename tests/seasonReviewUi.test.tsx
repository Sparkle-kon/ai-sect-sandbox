import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RankSeasonPanel } from '../src/components/RankSeasonPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { COMPETITION_RULES } from '../src/engine/competitionEngine';
import type { CompetitionReviewCase, CompetitionReviewProof, Cultivator } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 17;
  const [original, other, applicant, stranger] = world.cultivators;
  original.name = '原授文璧';
  other.name = '实绩文瑛';
  applicant.name = '不外传的复核申请人';
  applicant.secretGoal = '永不展示的私下目标';
  const season = { id: 'season-one', year: 1, openedTick: 1, closedTick: 12, status: 'settled' as const };
  const points = COMPETITION_RULES.public_relief.points;
  const locationId = world.settlements.villages[0].locationId;
  world.competitions = {
    seasons: [season],
    entries: [{ seasonId: season.id, actorId: original.id, joinedTick: 1 }, { seasonId: season.id, actorId: other.id, joinedTick: 1 }],
    scores: [{ id: 'raw-score-id', sourceId: 'raw-source-id', seasonId: season.id, actorId: original.id, locationId,
      tick: 9, rule: 'public_relief', points }],
    honors: [{ id: 'raw-award-id', seasonId: season.id, actorId: original.id, awardedTick: 12, score: points,
      place: 1, title: '秋水桂冠' }],
    optOutActorIds: [],
  };
  const proof: CompetitionReviewProof = {
    id: 'raw-proof-id', sourceId: 'raw-source-id', seasonId: season.id,
    settlementId: world.settlements.villages[0].id, actorId: other.id, locationId, tick: 9,
    rule: 'public_relief', stones: 12, herbs: 2,
  };
  const review: CompetitionReviewCase = { id: 'raw-review-id', seasonId: season.id, scoreId: 'raw-score-id', proofId: proof.id,
    applicantId: applicant.id, openedTick: 14, status: 'pending' };
  world.competitionReviews = { proofs: [proof], cases: [review], corrections: [], honorChanges: [] };
  const html = (viewer?: Cultivator) => renderToStaticMarkup(<RankSeasonPanel world={world} cultivator={viewer} />);
  return { world, original, other, applicant, stranger, season, points, proof, review, html };
}

describe('season review audit and effective official honor', () => {
  it('pending cases are own only and a public confirmation does not rewrite score or award', () => {
    const { review, proof, original, applicant, stranger, html } = fixture();
    expect(html(applicant)).toMatch(/<details class="[^"]+"><summary class="[^"]+">赛季荣誉复核与更正/);
    expect(html(applicant)).toContain('等待复核');
    expect(html(stranger)).not.toContain('赛季荣誉复核与更正');
    expect(html()).not.toContain('赛季荣誉复核与更正');
    proof.actorId = original.id;
    review.status = 'confirmed';
    review.closedTick = 17;
    expect(html(stranger)).toContain('核验维持');
    expect(html(stranger)).toContain('核毕 Tick #17');
    expect(html(stranger)).not.toContain('更正生效');
    expect(html(stranger)).toContain('秋水桂冠 · 原授文璧 · 第 1 名');
    expect(html(stranger)).not.toMatch(/不外传的复核申请人|永不展示的私下目标|raw-.+-id/);
    review.status = 'inconclusive';
    expect(html(stranger)).toContain('证据不一致，未更改');
    expect(html(stranger)).not.toContain('更正生效');
  });

  it('shows the append-only correction once beside the immutable award, and never backdates its effective holder', () => {
    const { world, original, other, stranger, season, points, review, proof, html } = fixture();
    review.status = 'corrected';
    review.closedTick = 17;
    world.competitionReviews.corrections = [{
      scoreId: 'raw-score-id', proofId: proof.id, seasonId: season.id, previousActorId: original.id,
      newActorId: other.id, points, tick: 17, reason: 'wrong_recipient',
    }];
    world.competitionReviews.honorChanges = [{
      originalHonorId: 'raw-award-id', seasonId: season.id, previousActorId: original.id, newActorId: other.id, score: points, tick: 17,
    }];
    const markup = html(stranger);
    expect(markup).toContain('榜上分数包含已生效的更正');
    expect(markup).toContain('原授留档：秋水桂冠 · 原授文璧 · 第 1 名');
    expect(markup).toContain('更正生效 Tick #17 · 当前有效得主：实绩文瑛');
    expect(markup.match(/当前有效得主/g)).toHaveLength(1);
    expect(markup).toContain('原计分归属有误');
    expect(markup).not.toMatch(/raw-.+-id|不外传的复核申请人/);
    expect(world.competitions.honors[0].actorId).toBe(original.id);
    world.competitionReviews.honorChanges = [{ originalHonorId: 'raw-award-id', seasonId: season.id, previousActorId: original.id, tick: 17 }];
    expect(html(stranger)).toContain('原荣誉已撤销，无有效得主');
    world.tick = 16;
    expect(html(stranger)).not.toContain('更正生效');
    expect(html(stranger)).not.toContain('已更正');
    expect(html(stranger)).toContain('秋水桂冠 · 原授文璧');
  });
});
