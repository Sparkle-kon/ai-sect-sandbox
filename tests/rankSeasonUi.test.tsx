import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { RankSeasonPanel } from '../src/components/RankSeasonPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { COMPETITION_RULES, publicCompetitionStandings } from '../src/engine/competitionEngine';

function fixture() {
  const world = createInitialWorld();
  world.tick = 18;
  world.year = 2;
  world.month = 6;
  const [first, unsignedScore, retired, historic] = world.cultivators;
  first.name = '当季公开领先者';
  first.secretGoal = '秘密谋划不计分';
  unsignedScore.name = '公开参赛待得分';
  retired.name = '不公开的退出者姓名';
  historic.name = '往季实授者';
  historic.alive = false;
  historic.hp = 0;
  const ended = { id: 'season-ended', year: 1, openedTick: 1, closedTick: 12, status: 'settled' as const };
  const current = { id: 'season-current', year: 2, openedTick: 13, status: 'open' as const };
  const points = COMPETITION_RULES.tournament_win.points;
  const record = { rule: 'tournament_win' as const, points, locationId: world.locations[0].id };
  world.competitions = { seasons: [ended, current], optOutActorIds: [retired.id], entries: [
    { seasonId: current.id, actorId: first.id, joinedTick: 13 },
    { seasonId: current.id, actorId: unsignedScore.id, joinedTick: 14 },
    { seasonId: current.id, actorId: retired.id, joinedTick: 13, withdrawnTick: 17 },
    { seasonId: ended.id, actorId: historic.id, joinedTick: 1 },
  ], scores: [
    { ...record, id: 'score-first', sourceId: 'do-not-publish-source', actorId: first.id, seasonId: current.id, tick: 15 },
    { ...record, id: 'score-withdrew', sourceId: 'do-not-publish-withdrawn-source', actorId: retired.id, seasonId: current.id, tick: 15 },
    { ...record, id: 'score-issued', sourceId: 'do-not-publish-archive-source', actorId: historic.id, seasonId: ended.id, tick: 5 },
  ], honors: [
    { id: 'earned', seasonId: ended.id, actorId: historic.id, place: 1, score: points, title: '确实授予的赛季荣誉', awardedTick: 12 },
    { id: 'fake-first', seasonId: current.id, actorId: first.id, place: 1, score: points, title: '不可当作结算已发', awardedTick: 17 },
    { id: 'future', seasonId: ended.id, actorId: retired.id, place: 1, score: points, title: '不可提前显示', awardedTick: 30 },
  ] };
  const markup = (actor = first) => renderToStaticMarkup(<RankSeasonPanel world={world} cultivator={actor} />);
  return { world, first, unsignedScore, retired, historic, current, ended, points, markup };
}

describe('public competition seasons and the opted-out boundary', () => {
  it('shows canonical public provisional scores and pending entries without leaking schemes or a withdrawn person', () => {
    const { world, first, current, retired, points, markup } = fixture();
    expect(publicCompetitionStandings(world, current.id)).toContainEqual(expect.objectContaining({ actorId: first.id, rank: 1, score: points }));
    const html = markup();
    expect(html).toContain('进行中 · 临时排名');
    expect(html).toContain('第 1 名 · 当季公开领先者');
    expect(html).toContain(`暂列 ${points} 分`);
    expect(html).toContain('结算前不代表已获荣誉');
    expect(html).toContain('公开参赛待得分');
    expect(html).toContain('已报名，未得分');
    expect(html).not.toContain('秘密谋划不计分');
    expect(html).not.toContain('不公开的退出者姓名');
    expect(html).not.toContain('do-not-publish');
    const own = markup(retired);
    expect(own).toContain('本季已退出（不列名次或分数）');
    expect(own).toContain('后续赛季不自动续报');
    expect(own).not.toContain('不公开的退出者姓名');
    world.competitions.entries = world.competitions.entries.filter(({ actorId }) => actorId !== retired.id);
    expect(markup(retired)).toContain('本季未报名，保留先前退出选择（可重新自愿报名）');
    expect(markup(first)).not.toContain('保留先前退出选择');
  });

  it('separates actual honor records from provisional leaders and shows the final result when no season is open', () => {
    const { world, ended, current, points, markup } = fixture();
    const html = markup();
    expect(html).toContain('已授予荣誉 · 1 项');
    expect(html).toContain('确实授予的赛季荣誉 · 往季实授者 · 第 1 名');
    expect(html).toContain(`结算 ${points} 分 · 实授 Tick #12`);
    expect(html).not.toContain('不可当作结算已发');
    expect(html).not.toContain('不可提前显示');
    world.competitions.seasons = [current];
    expect(markup()).toContain('确实授予的赛季荣誉');
    expect(markup()).toContain('已归档赛季');
    world.competitions.seasons = [ended];
    expect(markup()).toContain('最近结算 · 正式排名');
    expect(markup()).toContain(`终榜 ${points} 分`);
  });

  it('uses the real typed rules and stays inside the chronicle workspace', () => {
    const { world, markup } = fixture();
    expect(renderToStaticMarkup(<App />)).not.toContain('赛季榜与荣誉');
    expect(renderToStaticMarkup(<App initialWorkspace="chronicle" />)).toContain('赛季榜与荣誉');
    const html = markup();
    for (const { label, points } of Object.values(COMPETITION_RULES)) expect(html).toContain(`${label} · +${points} 分`);
    world.competitions.seasons = [];
    expect(markup()).toContain('尚未有可查看的赛季');
  });
});
