import type {
  CouncilRecord, Cultivator, LLMDecisionPayload, ProbationCase, ProbationExpulsion, ProbationMove, ProbationReason,
  ProbationState, ProbationVote, SettlementRecord, WorldEvent, WorldState,
} from '../types/world';
import { activeEscortForActor } from './escortEngine';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { activeRelocationForActor } from './relocationEngine';
import { courierCheckpoint } from './sealedCourierEngine';
import { isRetiredFromService } from './serviceRetirementEngine';
import { knownMapLocations } from './terrainEngine';
import { isTribulationActive } from './tribulationEngine';

export const PROBATION_REQUEST_TICKS = 6;
export const PROBATION_SERVICE_TICKS = 18;
export const PROBATION_RETRY_TICKS = 6;
export const PROBATION_TERMINAL_LIMIT = 32;
export const PROBATION_REQUIRED_RELIEF = 2;
export const PROBATION_REQUIRED_REVIEWS = 2;
const VILLAGE_OPTIONS = 4;

export interface ProbationOption {
  action: 'PROBATION';
  probationMove: ProbationMove;
  targetProbationId?: string;
  targetExpulsionId?: string;
  probationFirstVillageId?: string;
  probationSecondVillageId?: string;
  probationVote?: ProbationVote;
}

export const createProbationState = (): ProbationState => ({ expulsions: [], cases: [], nextId: 1 });
const revision = (actor: Cultivator): number => actor.disciplineRevision ?? 0;
const alive = (actor?: Cultivator): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const person = (world: WorldState, id: string) => world.cultivators.find(actor => actor.id === id);
const caseAnchor = (world: WorldState, row: ProbationCase) => world.probation.expulsions.find(item => item.id === row.expulsionId);
const ongoing = (row: ProbationCase) => row.status === 'requested' || row.status === 'active' || row.status === 'ready';
const deadline = (row: ProbationCase) => row.status === 'requested' ? row.requestExpiresTick : row.deadlineTick ?? 0;
function lastAnchor(world: WorldState, predicate: (row: ProbationExpulsion) => boolean): ProbationExpulsion | undefined {
  const rows = world.probation.expulsions;
  for (let i = rows.length - 1; i >= 0; i--) if (predicate(rows[i])) return rows[i];
  return undefined;
}
const latestExpulsion = (world: WorldState, actorId: string) => lastAnchor(world, row => row.actorId === actorId);

function freeAtSite(world: WorldState, actor: Cultivator) {
  return world.locations.some(site => site.id === actor.locationId) && !pilgrimageCheckpoint(world, actor) &&
    !courierCheckpoint(world, actor) && !activeRelocationForActor(world, actor) &&
    !activeEscortForActor(world, actor) && !isTribulationActive(actor);
}

function senior(world: WorldState, actor: Cultivator, sectId: string) {
  return alive(actor) && actor.sectId === sectId && !isRetiredFromService(actor) &&
    (['掌门', '太上长老', '长老'].includes(actor.sectRank) || world.sects.some(sect => sect.id === sectId && sect.leaderId === actor.id));
}

function independent(world: WorldState, actor: Cultivator, row: ProbationCase) {
  return actor.id !== row.actorId && actor.id !== row.sponsorId && senior(world, actor, row.sectId) &&
    !world.relationships.some(edge => (edge.type === '师徒' || edge.type === '道侣') &&
      (edge.fromId === actor.id && edge.toId === row.actorId || edge.fromId === row.actorId && edge.toId === actor.id));
}

function currentApplicant(world: WorldState, row: ProbationCase): Cultivator | undefined {
  const actor = person(world, row.actorId);
  const anchor = caseAnchor(world, row);
  if (!alive(actor) || actor.sectId || revision(actor) !== row.disciplineRevision || !anchor ||
      anchor.actorId !== actor.id || anchor.sectId !== row.sectId || anchor.reinstatedTick !== undefined ||
      !world.sects.some(sect => sect.id === row.sectId) || anchor !== latestExpulsion(world, actor.id)) return undefined;
  return actor;
}

function validNomination(world: WorldState, row: ProbationCase) {
  return row.villageIds.every(id => world.settlements.villages.some(village =>
    village.id === id && world.locations.some(site => site.id === village.locationId)));
}

function canAdmit(world: WorldState, actor: Cultivator, row: ProbationCase) {
  const applicant = currentApplicant(world, row);
  return applicant !== undefined && actor.id !== row.actorId && senior(world, actor, row.sectId) &&
    freeAtSite(world, applicant) && freeAtSite(world, actor) && applicant.locationId === actor.locationId &&
    validNomination(world, row);
}

function canReview(world: WorldState, actor: Cultivator, row: ProbationCase) {
  return row.status === 'active' && row.relief.length === PROBATION_REQUIRED_RELIEF && uncappedReviewers(row) &&
    independent(world, actor, row) && !row.reviews.some(review => review.reviewerId === actor.id) &&
    currentApplicant(world, row) !== undefined && freeAtSite(world, actor);
}
const uncappedReviewers = (row: ProbationCase) => row.reviews.length < PROBATION_REQUIRED_REVIEWS;

function requestAnchor(world: WorldState, actor: Cultivator): ProbationExpulsion | undefined {
  const row = latestExpulsion(world, actor.id);
  if (!row || actor.sectId || row.reinstatedTick !== undefined ||
      (row.lastCaseClosedTick !== undefined && world.tick < row.lastCaseClosedTick + PROBATION_RETRY_TICKS) ||
      world.probation.cases.some(item => item.expulsionId === row.id && ongoing(item)) ||
      !world.sects.some(sect => sect.id === row.sectId) || !freeAtSite(world, actor)) return undefined;
  return row;
}

function nominatedVillageOptions(world: WorldState, actor: Cultivator): string[] {
  const known = new Map(knownMapLocations(world, actor).map(site => [site.id, site]));
  const here = world.locations.find(site => site.id === actor.locationId);
  if (!here) return [];
  return world.settlements.villages.flatMap(village => {
    const at = known.get(village.locationId);
    return at ? [{ id: village.id, distance: Math.hypot(at.x - here.x, at.y - here.y) }] : [];
  }).sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, VILLAGE_OPTIONS).map(({ id }) => id);
}

/** Only the canonical, successfully applied council expulsion can create an eligibility anchor. */
export function recordProbationExpulsion(world: WorldState, record: CouncilRecord): void {
  if (record.status !== 'passed' || record.proposal.kind !== 'expel' || record.tick !== world.tick ||
      !world.councils.includes(record) || world.probation.expulsions.some(row => row.id === record.id)) return;
  const actor = person(world, record.proposal.targetCultivatorId);
  if (!alive(actor) || actor.sectId || !world.sects.some(sect => sect.id === record.sectId)) return;
  world.probation.expulsions.push({
    id: record.id, actorId: actor.id, sectId: record.sectId, tick: record.tick,
    transgressions: actor.transgressions, disciplineRevision: revision(actor),
  });
}

export function canCouncilUseMisconduct(world: WorldState, actor: Cultivator, sectId: string): boolean {
  const resolved = lastAnchor(world, row =>
    row.actorId === actor.id && row.sectId === sectId && row.reinstatedRevision !== undefined);
  return resolved === undefined || revision(actor) > resolved.reinstatedRevision!;
}

function liveStage(world: WorldState, row: ProbationCase) {
  return ongoing(row) && row.requestedTick <= world.tick && world.tick < deadline(row);
}

export function availableProbationActions(actor: Cultivator, world: WorldState, includeRequests = true): ProbationOption[] {
  if (!alive(actor) || person(world, actor.id) !== actor || !freeAtSite(world, actor)) return [];
  const options: ProbationOption[] = [];
  for (const row of world.probation.cases) {
    if (!liveStage(world, row)) continue;
    if (actor.id === row.actorId) {
      options.push({ action: 'PROBATION', probationMove: 'withdraw', targetProbationId: row.id });
      if (row.status === 'ready' && currentApplicant(world, row) && validNomination(world, row) &&
          row.relief.length === PROBATION_REQUIRED_RELIEF && row.reviews.length === PROBATION_REQUIRED_REVIEWS &&
          row.reviews.every(review => review.vote === 'support' && review.reviewerId !== row.actorId && review.reviewerId !== row.sponsorId) &&
          new Set(row.reviews.map(({ reviewerId }) => reviewerId)).size === PROBATION_REQUIRED_REVIEWS) {
        options.push({ action: 'PROBATION', probationMove: 'restore', targetProbationId: row.id });
      }
    }
    if (row.status === 'requested' && canAdmit(world, actor, row)) {
      options.push({ action: 'PROBATION', probationMove: 'admit', targetProbationId: row.id });
    }
    if (canReview(world, actor, row)) {
      for (const probationVote of ['support', 'oppose'] as const) {
        options.push({ action: 'PROBATION', probationMove: 'review', targetProbationId: row.id, probationVote });
      }
    }
  }
  const anchor = includeRequests ? requestAnchor(world, actor) : undefined;
  if (anchor) {
    const villages = nominatedVillageOptions(world, actor);
    for (let i = 0; i < villages.length; i++) for (let j = i + 1; j < villages.length; j++) {
      options.push({ action: 'PROBATION', probationMove: 'request', targetExpulsionId: anchor.id,
        probationFirstVillageId: villages[i], probationSecondVillageId: villages[j] });
    }
  }
  return options;
}

/** Only nominates real, still uncredited village IDs; it doesn't read remote village stress. */
export function probationReliefTargets(world: WorldState, actor: Cultivator): string[] {
  if (!alive(actor) || person(world, actor.id) !== actor || !freeAtSite(world, actor)) return [];
  const row = world.probation.cases.find(candidate => candidate.actorId === actor.id && candidate.status === 'active' &&
    liveStage(world, candidate) && (candidate.admittedTick ?? Infinity) < world.tick && currentApplicant(world, candidate) === actor);
  if (!row || !validNomination(world, row) || row.relief.some(receipt => receipt.tick === world.tick)) return [];
  return row.villageIds.filter(id => !row.relief.some(receipt => receipt.settlementId === id));
}

/** Called on the successful settlement source branch, after its actual debits and receipt append. */
export function recordProbationRelief(world: WorldState, receipt: SettlementRecord): void {
  if (receipt.kind !== 'relief' || receipt.tick !== world.tick || !receipt.actorId || !world.settlements.records.includes(receipt) ||
      !Number.isFinite(receipt.stones) || (receipt.stones ?? 0) <= 0 ||
      !Number.isFinite(receipt.herbs) || (receipt.herbs ?? 0) <= 0) return;
  const actor = person(world, receipt.actorId);
  if (!actor || !probationReliefTargets(world, actor).includes(receipt.settlementId)) return;
  const village = world.settlements.villages.find(({ id }) => id === receipt.settlementId);
  if (village?.locationId !== actor.locationId || village.lastReliefTick !== receipt.tick) return;
  const row = world.probation.cases.find(candidate => candidate.actorId === actor.id && candidate.status === 'active' && liveStage(world, candidate))!;
  if (row.relief.length >= PROBATION_REQUIRED_RELIEF || row.relief.some(existing => existing.sourceId === receipt.id)) return;
  row.relief.push({ sourceId: receipt.id, tick: receipt.tick, actorId: actor.id, settlementId: receipt.settlementId,
    stones: receipt.stones!, herbs: receipt.herbs! });
}

function event(world: WorldState, row: ProbationCase, token: string, title: string, description: string,
  actor?: Cultivator): WorldEvent {
  const actorIds = [...new Set([row.actorId, row.sponsorId, ...row.reviews.map(({ reviewerId }) => reviewerId), actor?.id]
    .filter((id): id is string => Boolean(id)))];
  return {
    id: `evt-probation-${row.id}-${world.tick}-${token}`, tick: world.tick, year: world.year, month: world.month,
    category: 'diplomacy', title, description, actorIds, locationId: actor?.locationId, witnessScope: 'participants',
  };
}

function finish(world: WorldState, row: ProbationCase, status: 'reinstated' | 'withdrawn' | 'expired' | 'rejected',
  reason?: ProbationReason): void {
  row.status = status;
  row.settledTick = world.tick;
  if (reason) row.reason = reason;
  const anchor = caseAnchor(world, row);
  if (anchor) anchor.lastCaseClosedTick = world.tick;
}

export function resolveProbationAction(world: WorldState, actor: Cultivator, payload: LLMDecisionPayload): WorldEvent | null {
  if (payload.chosenAction !== 'PROBATION') return null;
  const option = availableProbationActions(actor, world, payload.probationMove === 'request').find(choice =>
    choice.probationMove === payload.probationMove && choice.targetProbationId === payload.targetProbationId &&
    choice.targetExpulsionId === payload.targetExpulsionId && choice.probationFirstVillageId === payload.probationFirstVillageId &&
    choice.probationSecondVillageId === payload.probationSecondVillageId && choice.probationVote === payload.probationVote);
  if (!option) return null;
  if (option.probationMove === 'request') {
    const expulsion = latestExpulsion(world, actor.id)!;
    const row: ProbationCase = {
      id: `probation-${world.probation.nextId++}`, expulsionId: expulsion.id, actorId: actor.id, sectId: expulsion.sectId,
      villageIds: [option.probationFirstVillageId!, option.probationSecondVillageId!], disciplineRevision: revision(actor),
      status: 'requested', requestedTick: world.tick, requestExpiresTick: world.tick + PROBATION_REQUEST_TICKS, relief: [], reviews: [],
    };
    world.probation.cases.push(row);
    return event(world, row, 'request', '被逐修士自请见习', '只记本人自愿申请，须由原宗现任长老受理；尚未复籍。', actor);
  }
  const row = world.probation.cases.find(candidate => candidate.id === option.targetProbationId)!;
  if (option.probationMove === 'admit') {
    row.status = 'active';
    row.sponsorId = actor.id;
    row.admittedTick = world.tick;
    row.deadlineTick = world.tick + PROBATION_SERVICE_TICKS;
    return event(world, row, 'admit', '原宗受理见习', '由两处村镇赈济的真实物资凭据计功，受理人不参与独立复核。', actor);
  }
  if (option.probationMove === 'review') {
    row.reviews.push({ reviewerId: actor.id, tick: world.tick, vote: option.probationVote! });
    if (option.probationVote === 'oppose') finish(world, row, 'rejected', 'review_oppose');
    else if (row.reviews.length === PROBATION_REQUIRED_REVIEWS) row.status = 'ready';
    return event(world, row, `review-${row.reviews.length}`, option.probationVote === 'oppose' ? '独立复核未同意' : '独立复核已签署',
      option.probationVote === 'oppose' ? '一名独立长老不同意，见习结案，未复籍。' :
        '只核对已落实的服务凭据。两签齐备后仍须本人确认，不改变旧议决。', actor);
  }
  if (option.probationMove === 'withdraw') {
    finish(world, row, 'withdrawn', 'withdrawn');
    return event(world, row, 'withdraw', '本人退出见习', '已履行的赈济不撤回，宗籍不变。', actor);
  }
  const anchor = caseAnchor(world, row)!;
  actor.sectId = row.sectId;
  actor.sectRank = '外门弟子';
  actor.contribution = 0;
  anchor.reinstatedTick = world.tick;
  anchor.reinstatedRevision = row.disciplineRevision;
  finish(world, row, 'reinstated');
  return event(world, row, 'restore', '本人确认恢复外门宗籍',
    '仅恢复原宗外门身份。先前议决、恶行、悬赏和旧职均不撤销或自动恢复。', actor);
}

export function advanceProbation(world: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const row of world.probation.cases) {
    if (!ongoing(row)) continue;
    const actor = person(world, row.actorId);
    const why: ProbationReason | undefined = actor && revision(actor) !== row.disciplineRevision ? 'new_misconduct' :
      !currentApplicant(world, row) || !validNomination(world, row) ? 'unavailable' :
        world.tick >= deadline(row) ? 'deadline' : undefined;
    if (!why) continue;
    finish(world, row, why === 'deadline' ? 'expired' : 'rejected', why);
    const answer = why === 'new_misconduct' ? '出现本案起始点之后的新恶行，尚未取得复籍。' :
      why === 'unavailable' ? '申请人、原宗或约定村镇已不再符合本案条件；未复籍。' : '约定期限已过，未自动复籍。';
    events.push(event(world, row, 'close', '见习结案未复籍', answer, actor));
  }
  const terminal = world.probation.cases.filter(row => row.settledTick !== undefined)
    .sort((a, b) => b.settledTick! - a.settledTick! || Number(b.id.slice(10)) - Number(a.id.slice(10)))
    .slice(0, PROBATION_TERMINAL_LIMIT);
  const heldCases = new Set(terminal.map(({ id }) => id));
  world.probation.cases = world.probation.cases.filter(row => ongoing(row) || heldCases.has(row.id));
  const heldSources = new Set(world.probation.cases.map(({ expulsionId }) => expulsionId));
  const latest = new Map<string, ProbationExpulsion>();
  const cleared = new Map<string, ProbationExpulsion>();
  for (const anchor of world.probation.expulsions) {
    latest.set(JSON.stringify([anchor.actorId, anchor.sectId]), anchor);
    if (anchor.reinstatedTick !== undefined) cleared.set(JSON.stringify([anchor.actorId, anchor.sectId]), anchor);
  }
  for (const anchor of [...latest.values(), ...cleared.values()]) heldSources.add(anchor.id);
  world.probation.expulsions = world.probation.expulsions.filter(row => heldSources.has(row.id));
  return events;
}

/** Historical files are only shown to their actual parties, not to current officials generally. */
export function visibleProbationCases(world: WorldState, actor?: Cultivator): ProbationCase[] {
  if (!actor || person(world, actor.id) !== actor) return [];
  return world.probation.cases.filter(row => row.requestedTick <= world.tick &&
    (row.actorId === actor.id || row.sponsorId === actor.id || row.reviews.some(review => review.reviewerId === actor.id) ||
      liveStage(world, row) && (row.status === 'requested' ? canAdmit(world, actor, row) : canReview(world, actor, row))));
}
