import type { CompetitionHonor, CompetitionHonorChange, CompetitionReviewCase, CompetitionReviewProof, CompetitionReviewState,
  CompetitionScore, CompetitionScoreCorrection, CompetitionSeason, Cultivator, LLMDecisionPayload, SettlementRecord,
  WorldEvent, WorldOccasion, WorldState } from '../types/world';

export const SEASON_REVIEW_WINDOW = 3;
export const SEASON_REVIEW_CASE_LIMIT = 4;
export const SUPPORTED_SEASON_REVIEW_RULES = ['public_relief', 'tournament_champion'] as const;
const RELIEF_STONES = 12;
const RELIEF_HERBS = 2;
type ProofRule = CompetitionReviewProof['rule'];
type Winner = { actorId: string; score: number };
type ProofInput = Omit<Extract<CompetitionReviewProof, { rule: 'public_relief' }>, 'id'> |
  Omit<Extract<CompetitionReviewProof, { rule: 'tournament_champion' }>, 'id'>;

export interface SeasonReviewOption { action: 'SEASON_REVIEW'; targetScoreId: string }
export interface SeasonReviewView {
  id: string;
  seasonId: string;
  scoreId: string;
  rule: ProofRule;
  openedTick: number;
  closedTick?: number;
  status: CompetitionReviewCase['status'];
  correction?: Pick<CompetitionScoreCorrection, 'reason' | 'points' | 'newActorId'> & { previousActorId?: string };
}

export const createCompetitionReviewState = (): CompetitionReviewState => ({ proofs: [], cases: [], corrections: [], honorChanges: [] });

const alive = (actor: Cultivator) => actor.alive && actor.hp > 0;
const openSeason = (world: WorldState) => world.competitions.seasons.find((season) =>
  season.status === 'open' && season.year === world.year && season.openedTick <= world.tick);
const currentVenue = (world: WorldState, id: string) => world.locations.find((site) => site.id === id &&
  (site.type === 'market' || site.type === 'sect_hq' ||
    (site.type !== 'secret_realm' && world.sects.some((sect) => sect.headquartersId === site.id && site.ownerSectId === sect.id))));
const supported = (rule: string): rule is ProofRule => SUPPORTED_SEASON_REVIEW_RULES.some((value) => value === rule);
const activeParticipant = (world: WorldState, seasonId: string, actorId: string): boolean =>
  world.competitions.entries.some((entry) => entry.seasonId === seasonId && entry.actorId === actorId && entry.withdrawnTick === undefined);
const eligibleAtSource = (world: WorldState, proof: CompetitionReviewProof): boolean =>
  world.competitions.entries.some((entry) => entry.seasonId === proof.seasonId && entry.actorId === proof.actorId &&
    entry.joinedTick < proof.tick && (entry.withdrawnTick === undefined || entry.withdrawnTick > proof.tick));

export function seasonReviewProofId(rule: ProofRule, sourceId: string, seasonId: string): string {
  const text = JSON.stringify([rule, sourceId, seasonId]);
  let a = 0x811c9dc5, b = 0x84222325;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ text.charCodeAt(text.length - 1 - i), 0x01000193);
  }
  return `proof-${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

function register(world: WorldState, proof: ProofInput): void {
  const id = seasonReviewProofId(proof.rule, proof.sourceId, proof.seasonId);
  const log = world.competitionReviews.proofs;
  if (log.some((row) => row.id === id || (row.rule === proof.rule && row.sourceId === proof.sourceId && row.seasonId === proof.seasonId))) return;
  log.push({ ...proof, id });
}

export function recordSeasonReliefProof(world: WorldState, record: SettlementRecord): void {
  const season = openSeason(world);
  if (!season || !world.settlements.records.includes(record) || record.kind !== 'relief' || record.tick !== world.tick ||
      record.people !== 0 || record.stones !== RELIEF_STONES || record.herbs !== RELIEF_HERBS || !record.actorId) return;
  const village = world.settlements.villages.find(({ id }) => id === record.settlementId);
  if (!village || currentVenue(world, village.locationId)?.type !== 'market' ||
      !world.cultivators.some((actor) => actor.id === record.actorId && actor.locationId === village.locationId)) return;
  register(world, { rule: 'public_relief', seasonId: season.id, sourceId: record.id, tick: record.tick, locationId: village.locationId,
    actorId: record.actorId, settlementId: record.settlementId, stones: record.stones, herbs: record.herbs });
}

function competitiveWin(occasion: WorldOccasion, actorId: string): { round: number; opponentId: string } | undefined {
  return occasion.bouts.flatMap((bout) => {
    if (bout.winnerId !== actorId || !bout.secondId || bout.firstId === bout.secondId ||
        bout.round < 1 || bout.round > occasion.round || ![bout.firstId, bout.secondId].includes(actorId) ||
        !occasion.participantIds.includes(bout.firstId) || !occasion.participantIds.includes(bout.secondId)) return [];
    return [{ round: bout.round, opponentId: bout.firstId === actorId ? bout.secondId : bout.firstId }];
  }).sort((a, b) => b.round - a.round || a.opponentId.localeCompare(b.opponentId))[0];
}

export function recordSeasonTournamentProof(world: WorldState, occasion: WorldOccasion): void {
  const season = openSeason(world);
  const actorId = occasion.championId;
  if (!season || !actorId || !world.occasions.includes(occasion) || occasion.kind !== 'tournament' ||
      occasion.status !== 'completed' || occasion.lastResolvedTick !== world.tick || !currentVenue(world, occasion.locationId) ||
      !world.cultivators.some(({ id }) => id === actorId)) return;
  const win = competitiveWin(occasion, actorId);
  if (!win) return;
  register(world, { rule: 'tournament_champion', seasonId: season.id, sourceId: `${occasion.id}:champion`, tick: world.tick,
    locationId: occasion.locationId, actorId, occasionId: occasion.id, championRound: occasion.round,
    competitiveWinRound: win.round, opponentId: win.opponentId });
}

function sameSource(score: CompetitionScore, proof: CompetitionReviewProof): boolean {
  return score.seasonId === proof.seasonId && score.sourceId === proof.sourceId && score.rule === proof.rule &&
    score.tick === proof.tick && score.locationId === proof.locationId;
}

function extantProofAgrees(world: WorldState, proof: CompetitionReviewProof): boolean {
  if (!world.cultivators.some(({ id }) => id === proof.actorId) ||
      proof.id !== seasonReviewProofId(proof.rule, proof.sourceId, proof.seasonId)) return false;
  if (proof.rule === 'public_relief') {
    if (proof.stones !== RELIEF_STONES || proof.herbs !== RELIEF_HERBS) return false;
    const record = world.settlements.records.find(({ id }) => id === proof.sourceId);
    if (!record) return true; // Retention is not a refutation of a pinned, already verified public proof.
    const village = world.settlements.villages.find(({ id }) => id === record.settlementId);
    return record.kind === 'relief' && record.tick === proof.tick && record.people === 0 && record.actorId === proof.actorId &&
      record.settlementId === proof.settlementId && record.stones === proof.stones && record.herbs === proof.herbs &&
      (!village || village.locationId === proof.locationId);
  }
  if (proof.competitiveWinRound < 1 || proof.competitiveWinRound > proof.championRound || proof.opponentId === proof.actorId ||
      proof.sourceId !== `${proof.occasionId}:champion`) return false;
  const occasion = world.occasions.find(({ id }) => id === proof.occasionId);
  if (!occasion) return true;
  const win = competitiveWin(occasion, proof.actorId);
  return occasion.kind === 'tournament' && occasion.status === 'completed' && occasion.championId === proof.actorId &&
    occasion.lastResolvedTick === proof.tick && occasion.locationId === proof.locationId && occasion.round === proof.championRound &&
    win?.round === proof.competitiveWinRound && win.opponentId === proof.opponentId;
}

function reviewAtCurrentTick(world: WorldState, season: CompetitionSeason): boolean {
  return season.status === 'settled' && season.closedTick !== undefined && world.tick >= season.closedTick &&
    world.tick < season.closedTick + SEASON_REVIEW_WINDOW;
}
function physicallyObserving(world: WorldState, actor: Cultivator): boolean {
  return alive(actor) && actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon' &&
    !world.couriers.dispatches.some((row) => row.courierId === actor.id &&
      (row.status === 'in_transit' || row.status === 'returning' || row.lastAdvancedTick === world.tick)) &&
    !world.pilgrimages.journeys.some((row) => row.status === 'active' &&
      (row.organizerId === actor.id || row.companionId === actor.id) && (row.path.length > 0 || row.lastMovedTick === world.tick)) &&
    !world.escorts.contracts.some((row) => row.status === 'active' && row.escortId === actor.id) &&
    !world.relocations.plans.some((row) => row.status === 'in_transit' && row.garrisonIds.includes(actor.id)) &&
    !world.sieges.some((row) => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(actor.id));
}

/** Only certifiable public receipts in the short recent sealed season may be filed. */
export function availableSeasonReviewActions(actor: Cultivator, world: WorldState): SeasonReviewOption[] {
  if (!world.competitionReviews.proofs.length || !world.cultivators.includes(actor) || !physicallyObserving(world, actor) ||
      !currentVenue(world, actor.locationId)) return [];
  const seasons = world.competitions.seasons.filter((season) => reviewAtCurrentTick(world, season) &&
    activeParticipant(world, season.id, actor.id) &&
    world.competitionReviews.cases.filter(({ seasonId }) => seasonId === season.id).length < SEASON_REVIEW_CASE_LIMIT);
  if (!seasons.length) return [];
  const inScope = new Set(seasons.map(({ id }) => id));
  const already = new Set(world.competitionReviews.cases.map(({ scoreId }) => scoreId));
  const proofs = world.competitionReviews.proofs.filter((proof) => inScope.has(proof.seasonId) && proof.locationId === actor.locationId &&
    extantProofAgrees(world, proof));
  const eligible = new Set(world.competitions.entries.filter((entry) => inScope.has(entry.seasonId) && entry.withdrawnTick === undefined)
    .map((entry) => JSON.stringify([entry.seasonId, entry.actorId])));
  return world.competitions.scores.filter((score) => !already.has(score.id) && supported(score.rule) &&
    eligible.has(JSON.stringify([score.seasonId, score.actorId])) && proofs.some((proof) => sameSource(score, proof)))
    .sort((a, b) => Number(b.actorId === actor.id) - Number(a.actorId === actor.id) || b.tick - a.tick || a.id.localeCompare(b.id))
    .slice(0, 12).map(({ id }) => ({ action: 'SEASON_REVIEW', targetScoreId: id }));
}

export function resolveSeasonReviewAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'SEASON_REVIEW' || !decision.targetScoreId ||
      !availableSeasonReviewActions(actor, world).some(({ targetScoreId }) => targetScoreId === decision.targetScoreId)) return null;
  const score = world.competitions.scores.find(({ id }) => id === decision.targetScoreId)!;
  const proof = world.competitionReviews.proofs.find((row) => sameSource(score, row))!;
  const row: CompetitionReviewCase = { id: 'review-' + score.id, scoreId: score.id, seasonId: score.seasonId, proofId: proof.id,
    applicantId: actor.id, status: 'pending', openedTick: world.tick };
  world.competitionReviews.cases.push(row);
  return { id: `evt-${row.id}-filed`, tick: world.tick, year: world.year, month: world.month, category: 'diplomacy',
    title: '赛季收据申请复核', description: '复核窗结束后依真实赛季来源对账；原本分数和称号记录不得涂改。',
    actorIds: [actor.id], locationId: actor.locationId, witnessScope: 'participants' };
}

export function seasonScoreCorrections(world: WorldState, seasonId: string): ReadonlyMap<string, string | null> {
  return new Map(world.competitionReviews.corrections.filter((row) => row.seasonId === seasonId && row.tick <= world.tick)
    .map((row) => [row.scoreId, row.newActorId ?? null]));
}

export function effectiveCompetitionHonors(world: WorldState): CompetitionHonor[] {
  const changes = new Map(world.competitionReviews.honorChanges.filter((row) => row.tick <= world.tick)
    .map((row) => [row.originalHonorId, row]));
  return world.competitions.honors.flatMap((honor) => {
    const change = changes.get(honor.id);
    if (!change) return [{ ...honor }];
    return change.newActorId && change.score !== undefined ? [{ ...honor, actorId: change.newActorId, score: change.score }] : [];
  });
}

function existingCredit(world: WorldState, proof: CompetitionReviewProof, scoreId: string): boolean {
  const effective = seasonScoreCorrections(world, proof.seasonId);
  return world.competitions.scores.some((score) => score.id !== scoreId && sameSource(score, proof) &&
    (effective.has(score.id) ? effective.get(score.id) : score.actorId) === proof.actorId);
}

export function advanceSeasonReviews(world: WorldState,
  canonicalWinner: (world: WorldState, seasonId: string) => Winner | undefined): WorldEvent[] {
  const state = world.competitionReviews;
  if (!state.proofs.length && !state.cases.length && !state.honorChanges.length) return [];
  const events: WorldEvent[] = [];
  for (const season of world.competitions.seasons) {
    if (season.status !== 'settled' || season.closedTick === undefined || world.tick < season.closedTick + SEASON_REVIEW_WINDOW) continue;
    const batch = state.cases.filter((row) => row.seasonId === season.id && row.status === 'pending')
      .sort((a, b) => a.openedTick - b.openedTick || a.scoreId.localeCompare(b.scoreId));
    if (!batch.length) continue;
    let corrected = false;
    for (const row of batch) {
      row.closedTick = world.tick;
      const score = world.competitions.scores.find(({ id }) => id === row.scoreId);
      const proof = state.proofs.find(({ id }) => id === row.proofId);
      if (!score || !proof || !sameSource(score, proof) || !extantProofAgrees(world, proof)) {
        row.status = 'inconclusive';
        continue;
      }
      if (score.actorId === proof.actorId) { row.status = 'confirmed'; continue; }
      const eligible = eligibleAtSource(world, proof);
      const duplicate = existingCredit(world, proof, score.id);
      const correction: CompetitionScoreCorrection = { scoreId: score.id, proofId: proof.id, seasonId: season.id,
        previousActorId: score.actorId, points: score.points, tick: world.tick,
        reason: !eligible ? 'recipient_ineligible' : duplicate ? 'duplicate_source' : 'wrong_recipient',
        ...(eligible && !duplicate ? { newActorId: proof.actorId } : {}) };
      state.corrections.push(correction);
      row.status = 'corrected';
      corrected = true;
    }
    const original = world.competitions.honors.find(({ seasonId }) => seasonId === season.id);
    if (!corrected || !original || state.honorChanges.some(({ seasonId }) => seasonId === season.id)) continue;
    const effective = canonicalWinner(world, season.id);
    if (effective?.actorId === original.actorId) continue;
    const change: CompetitionHonorChange = { originalHonorId: original.id, seasonId: season.id, previousActorId: original.actorId,
      tick: world.tick, ...(effective ? { newActorId: effective.actorId, score: effective.score } : {}) };
    state.honorChanges.push(change);
    events.push({ id: `evt-${original.id}-review`, tick: world.tick, year: world.year, month: world.month, category: 'diplomacy',
      title: '赛季荣誉复核更正', description: effective ?
        '依据公开原始凭证更正积分后，唯一生效荣誉已改授；原收据与原授荣记载不涂改。' :
        '依据公开原始凭证更正积分后，并无合格位次，原荣誉撤销；原授荣记载仍保留。',
      actorIds: effective ? [original.actorId, effective.actorId] : [original.actorId] });
  }
  const seasons = new Set(world.competitions.seasons.map(({ id }) => id));
  state.cases = state.cases.filter(({ seasonId }) => seasons.has(seasonId));
  state.corrections = state.corrections.filter(({ seasonId }) => seasons.has(seasonId));
  const referenced = new Set(state.cases.map(({ proofId }) => proofId));
  const evidenceOpen = new Set(world.competitions.seasons.filter((season) => season.status === 'open' || reviewAtCurrentTick(world, season))
    .map(({ id }) => id));
  state.proofs = state.proofs.filter((proof) => referenced.has(proof.id) || evidenceOpen.has(proof.seasonId));
  const honors = new Set(world.competitions.honors.map(({ id }) => id));
  state.honorChanges = state.honorChanges.filter(({ originalHonorId }) => honors.has(originalHonorId));
  return events;
}

export function visibleSeasonReviews(world: WorldState, viewer?: Cultivator, seasonId?: string): SeasonReviewView[] {
  const state = world.competitionReviews;
  if (!state.cases.length) return [];
  const ownId = viewer && world.cultivators.some(({ id }) => id === viewer.id) ? viewer.id : undefined;
  return state.cases.flatMap((row) => {
    if ((seasonId !== undefined && row.seasonId !== seasonId) || row.openedTick > world.tick ||
        (row.closedTick !== undefined && row.closedTick > world.tick) ||
        (row.status === 'pending' && row.applicantId !== ownId)) return [];
    const score = world.competitions.scores.find(({ id }) => id === row.scoreId);
    if (!score || !supported(score.rule) || !activeParticipant(world, row.seasonId, score.actorId)) return [];
    const correction = state.corrections.find(({ scoreId, tick }) => scoreId === row.scoreId && tick <= world.tick);
    const detail = correction ? { reason: correction.reason, points: correction.points, previousActorId: score.actorId,
      ...(correction.newActorId && activeParticipant(world, row.seasonId, correction.newActorId) ? { newActorId: correction.newActorId } : {}) } : undefined;
    const { id, scoreId, openedTick, closedTick, status } = row;
    return [{ id, seasonId: row.seasonId, scoreId, rule: score.rule, openedTick, closedTick, status, ...(detail ? { correction: detail } : {}) }];
  });
}

export function visibleSeasonHonorChanges(world: WorldState, seasonId?: string): CompetitionHonorChange[] {
  return world.competitionReviews.honorChanges.filter((row) => row.tick <= world.tick &&
    (seasonId === undefined || row.seasonId === seasonId)).map((row) => ({ ...row }));
}
