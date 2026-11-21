import { recordSeasonReliefProof, recordSeasonTournamentProof, seasonScoreCorrections } from './seasonReviewEngine';
import type { CompetitionMove, CompetitionRule, CompetitionSeason, CompetitionState, CultivationRealm, Cultivator,
  LLMDecisionPayload, SettlementRecord, TournamentBout, WorldEvent, WorldOccasion, WorldState } from '../types/world';

const SEASON_HISTORY = 8;
const HONOR_HISTORY = 48;
const REALMS: readonly CultivationRealm[] = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const seasonId = (year: number) => `season-${year}`;
const season = (year: number, openedTick: number): CompetitionSeason => ({ id: seasonId(year), year, openedTick, status: 'open' });

export const COMPETITION_RULES: Readonly<Record<CompetitionRule, Readonly<{ label: string; points: number }>>> = Object.freeze({
  tournament_win: Object.freeze({ label: '公开大比实赛胜局', points: 4 }),
  tournament_champion: Object.freeze({ label: '公开大比正式魁首', points: 6 }),
  major_breakthrough: Object.freeze({ label: '公共地点大境界突破', points: 3 }),
  public_relief: Object.freeze({ label: '公共坊市实物赈济', points: 2 }),
});

export interface CompetitionOption { action: 'RANK_SEASON'; seasonMove: CompetitionMove }
export interface CompetitionStanding {
  actorId: string;
  rank?: number;
  score: number;
  firstScoredTick?: number;
  disposition: 'ranked' | 'unscored' | 'withdrawn';
}

export function createCompetitionState(year = 1001, openedTick = 1): CompetitionState {
  return { seasons: [season(year, openedTick)], entries: [], scores: [], honors: [], optOutActorIds: [] };
}

export function competitionActorOptedOut(world: WorldState, actorId: string): boolean {
  return world.competitions.optOutActorIds.includes(actorId);
}

function currentSeason(world: WorldState): CompetitionSeason | undefined {
  return world.competitions.seasons.find((item) => item.status === 'open' && item.year === world.year && item.openedTick <= world.tick);
}

export function availableCompetitionActions(actor: Cultivator, world: WorldState): CompetitionOption[] {
  if (!live(actor) || !world.cultivators.includes(actor)) return [];
  const active = currentSeason(world);
  if (!active) return [];
  const entry = world.competitions.entries.find((item) => item.actorId === actor.id && item.seasonId === active.id);
  if (!entry) return [{ action: 'RANK_SEASON', seasonMove: 'join' }];
  return entry.withdrawnTick === undefined ? [{ action: 'RANK_SEASON', seasonMove: 'withdraw' }] : [];
}

function event(world: WorldState, id: string, title: string, description: string, actorIds: string[]): WorldEvent {
  return { id: `evt-${world.tick}-competition-${id}`, tick: world.tick, year: world.year, month: world.month,
    title, description, actorIds, category: 'diplomacy' };
}

export function resolveCompetitionAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'RANK_SEASON' ||
      !availableCompetitionActions(actor, world).some((option) => option.seasonMove === decision.seasonMove)) return null;
  const active = currentSeason(world)!;
  if (decision.seasonMove === 'join') {
    world.competitions.optOutActorIds = world.competitions.optOutActorIds.filter((id) => id !== actor.id);
    world.competitions.entries.push({ seasonId: active.id, actorId: actor.id, joinedTick: world.tick });
    return event(world, `entered-${active.id}-${actor.id}`, '自愿登记赛季榜单', `${actor.name}主动报名，次回合开始计入公开实绩。`, [actor.id]);
  }
  const entry = world.competitions.entries.find((row) => row.actorId === actor.id && row.seasonId === active.id)!;
  entry.withdrawnTick = world.tick;
  if (!competitionActorOptedOut(world, actor.id)) world.competitions.optOutActorIds.push(actor.id);
  const result = event(world, `withdrew-${active.id}-${actor.id}`, '自愿退出赛季榜单',
    '本赛季退出，不再计分或入选授荣；下季不会自动重报。', [actor.id]);
  return { ...result, witnessScope: 'participants' };
}

function publicVenue(world: WorldState, locationId: string | undefined): boolean {
  return Boolean(locationId && world.locations.some((site) => site.id === locationId &&
    (site.type === 'market' || site.type === 'sect_hq' || world.sects.some(({ headquartersId }) => headquartersId === site.id))));
}

function compactSource(key: readonly string[]): string {
  const text = JSON.stringify(key);
  let first = 0x811c9dc5, second = 0x84222325;
  for (let i = 0; i < text.length; i++) {
    first = Math.imul(first ^ text.charCodeAt(i), 0x01000193);
    second = Math.imul(second ^ text.charCodeAt(text.length - 1 - i), 0x01000193);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function awardPoints(world: WorldState, actorId: string, rule: CompetitionRule, sourceId: string, locationId: string): void {
  const active = currentSeason(world);
  if (!active || !world.cultivators.some(({ id }) => id === actorId)) return;
  const entry = world.competitions.entries.find((item) => item.actorId === actorId && item.seasonId === active.id);
  if (!entry || entry.joinedTick >= world.tick || entry.withdrawnTick !== undefined) return;
  if (world.competitions.scores.some((item) => item.actorId === actorId && item.sourceId === sourceId && item.rule === rule)) return;
  const base = `score-${compactSource([rule, sourceId, actorId])}`;
  let id = base, serial = 1;
  while (world.competitions.scores.some((row) => row.id === id)) id = `${base}-${++serial}`;
  world.competitions.scores.push({ id, seasonId: active.id, actorId,
    sourceId, tick: world.tick, rule, points: COMPETITION_RULES[rule].points, locationId });
}

function competitiveBout(occasion: WorldOccasion, bout: TournamentBout): boolean {
  return Boolean(bout.secondId && bout.secondId !== bout.firstId && [bout.firstId, bout.secondId].includes(bout.winnerId) &&
    occasion.participantIds.includes(bout.firstId) && occasion.participantIds.includes(bout.secondId));
}

export function recordTournamentRound(world: WorldState, occasion: WorldOccasion, bout: TournamentBout): void {
  if (!world.occasions.includes(occasion) || occasion.kind !== 'tournament' ||
      (occasion.status !== 'running' && occasion.status !== 'completed') || occasion.lastResolvedTick !== world.tick ||
      !publicVenue(world, occasion.locationId) || !occasion.bouts.includes(bout) || bout.round !== occasion.round ||
      !competitiveBout(occasion, bout)) return;
  // A single actor can win once in each actual bracket round; an automatic bye never qualifies.
  awardPoints(world, bout.winnerId, 'tournament_win', `${occasion.id}:round:${bout.round}`, occasion.locationId);
}

export function recordTournamentChampion(world: WorldState, occasion: WorldOccasion): void {
  if (!world.occasions.includes(occasion) || occasion.kind !== 'tournament' || occasion.status !== 'completed' ||
      occasion.lastResolvedTick !== world.tick || !publicVenue(world, occasion.locationId) || !occasion.championId ||
      !occasion.bouts.some((bout) => bout.winnerId === occasion.championId && competitiveBout(occasion, bout))) return;
  recordSeasonTournamentProof(world, occasion);
  awardPoints(world, occasion.championId, 'tournament_champion', `${occasion.id}:champion`, occasion.locationId);
}

/** Uses the previous actual realm from the atomic action, never a title or NLP classification. */
export function recordBreakthroughCompetition(world: WorldState, actor: Cultivator, beforeRealm: CultivationRealm, outcome: WorldEvent): void {
  const tier = REALMS.indexOf(beforeRealm);
  if (tier < 0 || REALMS[tier + 1] !== actor.realm || !live(actor) || !world.cultivators.includes(actor) ||
      !outcome.locationId || outcome.locationId !== actor.locationId || !publicVenue(world, outcome.locationId) ||
      outcome.category !== 'breakthrough' || outcome.tick !== world.tick || outcome.witnessScope === 'participants' ||
      !outcome.actorIds.includes(actor.id)) return;
  awardPoints(world, actor.id, 'major_breakthrough', outcome.id, outcome.locationId);
}

export function recordReliefCompetition(world: WorldState, record: SettlementRecord): void {
  if (!world.settlements.records.includes(record) || record.kind !== 'relief' || record.tick !== world.tick ||
      !record.actorId || record.stones <= 0 || record.herbs <= 0 || record.people !== 0) return;
  const village = world.settlements.villages.find(({ id }) => id === record.settlementId);
  if (!village || !world.locations.some((site) => site.id === village.locationId && site.type === 'market')) return;
  recordSeasonReliefProof(world, record);
  awardPoints(world, record.actorId, 'public_relief', record.id, village.locationId);
}

export function publicCompetitionStandings(world: WorldState, which?: string): CompetitionStanding[] {
  const ref = which ?? currentSeason(world)?.id;
  if (!ref || !world.competitions.seasons.some(({ id }) => id === ref)) return [];
  const totals = new Map<string, { score: number; firstScoredTick: number }>();
  const corrections = seasonScoreCorrections(world, ref);
  for (const row of world.competitions.scores) {
    if (row.seasonId !== ref) continue;
    const adjusted = corrections.get(row.id);
    if (adjusted === null) continue;
    const actorId = adjusted ?? row.actorId;
    const aggregate = totals.get(actorId);
    if (aggregate) {
      aggregate.score += row.points;
      aggregate.firstScoredTick = Math.min(aggregate.firstScoredTick, row.tick);
    } else totals.set(actorId, { score: row.points, firstScoredTick: row.tick });
  }
  const classified = world.competitions.entries.filter(({ seasonId }) => seasonId === ref).map((entry): CompetitionStanding => {
    if (entry.withdrawnTick !== undefined) return { actorId: entry.actorId, disposition: 'withdrawn', score: 0 };
    const actual = totals.get(entry.actorId);
    return actual ? { actorId: entry.actorId, disposition: 'ranked', ...actual } :
      { actorId: entry.actorId, disposition: 'unscored', score: 0 };
  });
  const typePriority: Record<CompetitionStanding['disposition'], number> = { ranked: 0, unscored: 1, withdrawn: 2 };
  classified.sort((a, b) => typePriority[a.disposition] - typePriority[b.disposition] || b.score - a.score ||
    (a.firstScoredTick ?? Infinity) - (b.firstScoredTick ?? Infinity) || (a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0));
  let rank = 0;
  return classified.map((entry) => entry.disposition === 'ranked' ? { ...entry, rank: ++rank } : entry);
}

export function advanceCompetitionSeasons(world: WorldState): WorldEvent[] {
  const active = world.competitions.seasons.find((item) => item.status === 'open');
  if (active?.year === world.year || (active && active.year > world.year)) return [];
  const result: WorldEvent[] = [];
  if (active) {
    const winner = publicCompetitionStandings(world, active.id).find(({ rank }) => rank === 1);
    active.status = 'settled';
    active.closedTick = world.tick;
    if (winner && !world.competitions.honors.some((entry) => entry.seasonId === active.id)) {
      const title = '年度争衡魁首';
      world.competitions.honors.push({ id: `honor-${active.id}`, seasonId: active.id, actorId: winner.actorId, place: 1,
        awardedTick: world.tick, score: winner.score, title });
      result.push(event(world, `honor-${active.id}`, title, `仙历${active.year}年正式榜单已封榜，魁首实绩${winner.score}分，仅颁授名誉称号。`, [winner.actorId]));
    }
  }
  if (!world.competitions.seasons.some(({ id }) => id === seasonId(world.year))) {
    world.competitions.seasons.push(season(world.year, world.tick));
  }
  world.competitions.seasons = world.competitions.seasons.slice(-SEASON_HISTORY);
  const retained = new Set(world.competitions.seasons.map(({ id }) => id));
  world.competitions.entries = world.competitions.entries.filter((item) => retained.has(item.seasonId));
  world.competitions.scores = world.competitions.scores.filter((item) => retained.has(item.seasonId));
  world.competitions.honors = world.competitions.honors.slice(-HONOR_HISTORY);
  return result;
}
