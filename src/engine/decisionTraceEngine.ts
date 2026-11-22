import { cloneWorldWithColdHistory } from './coldHistoryEngine';
import { COHORT_MAX_INVITEES } from './apprenticeCohortEngine';
import { courierCheckpoint } from './sealedCourierEngine';
import { activePilgrimageForActor, pilgrimageCheckpoint } from './pilgrimageEngine';
import { sameGeneratedWorld } from './worldIdentity';
import type { CultivationRealm, Cultivator, DecisionTraceCandidate, DecisionTraceRecord, DecisionTraceState, LLMDecisionPayload, PublicTraceAction, WorldState } from '../types/world';
import { knownMapLocations } from './terrainEngine';
import { isTribulationActive, tribulationTarget } from './tribulationEngine';

export const DECISION_TRACE_LIMIT = 96;
const CANDIDATE_LIMIT = 12;
const SAFE_ACTIONS = new Set<LLMDecisionPayload['chosenAction']>(['REST', 'CULTIVATE', 'BREAKTHROUGH', 'SOCIALIZE', 'EXPLORE', 'FACE_TRIBULATION']);
const publicLocation = (type: WorldState['locations'][number]['type']) => type === 'market' || type === 'sect_hq';
const clampScore = (score: number) => Math.min(100, Math.max(0, Math.round(score)));
export const createDecisionTraceState = (): DecisionTraceState => ({ records: [] });

function candidateId(choice: Omit<DecisionTraceCandidate, 'id'>): string {
  return [choice.action, choice.targetLocationId, choice.targetCultivatorId, choice.tribulationStance].filter(Boolean).join(':');
}
function sortCandidates(candidates: DecisionTraceCandidate[]): DecisionTraceCandidate[] {
  return candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, CANDIDATE_LIMIT);
}
function isSafeAction(action: LLMDecisionPayload['chosenAction']): action is PublicTraceAction { return SAFE_ACTIONS.has(action); }

/** Restricted comparison menu, not a log of private utility branches or model reasoning. */
export function legalTraceCandidates(world: WorldState, actor: Cultivator): DecisionTraceCandidate[] {
  if (!actor.alive || actor.hp <= 0 || actor.positionPlane!==undefined) return [];
  const result: DecisionTraceCandidate[] = [];
  const add = (choice: Omit<DecisionTraceCandidate, 'id'>) => result.push({ ...choice, score: clampScore(choice.score), id: candidateId(choice) });
  const health = actor.hp / Math.max(1, actor.maxHp);
  if (isTribulationActive(actor)) {
    if (actor.tribulation?.lastActedTick === world.tick) return [];
    const heart = actor.tribulation?.stage === 'heart_demon';
    add({ action: 'FACE_TRIBULATION', reason: 'tribulation', score: !heart ? 80 + (1 - health) * 15 : 62, tribulationStance: 'guard' });
    add({ action: 'FACE_TRIBULATION', reason: 'tribulation', score: heart ? 94 : 76, tribulationStance: 'focus' });
    add({ action: 'FACE_TRIBULATION', reason: 'tribulation', score: heart ? 48 : 40 + health * 32, tribulationStance: 'defy' });
    return sortCandidates(result);
  }
  if (pilgrimageCheckpoint(world, actor) || courierCheckpoint(world, actor)) return [];
  add({ action: 'REST', reason: 'recover', score: 30 + (1 - health) * 68 });
  if (activePilgrimageForActor(world, actor)) return sortCandidates(result);
  add({ action: 'CULTIVATE', reason: 'cultivate', score: 61 + health * 8 });
  const retryDelay = actor.tribulation?.stage === 'failed' && actor.tribulation.resolvedTick !== undefined &&
    world.tick - actor.tribulation.resolvedTick < 3;
  if (actor.qiProgress >= 92 && (actor.realm !== '渡劫' || actor.realmStage < 9) && !(tribulationTarget(actor) && retryDelay)) {
    add({ action: 'BREAKTHROUGH', reason: 'ready', score: 82 + (actor.qiProgress - 92) });
  }
  const location = world.locations.find(({ id }) => id === actor.locationId);
  if (location && publicLocation(location.type)) {
    const localPeers = world.cultivators.filter((other) => other.id !== actor.id && other.alive && other.hp > 0 && other.locationId === actor.locationId && !pilgrimageCheckpoint(world, other) && !courierCheckpoint(world, other))
      .sort((a, b) => a.id.localeCompare(b.id)).slice(0, 4);
    for (const peer of localPeers) add({ action: 'SOCIALIZE', reason: 'social', score: 44 + Number(Boolean(peer.sectId) && peer.sectId === actor.sectId) * 4,
      targetCultivatorId: peer.id });
  }
  if (location && !actor.guardAssignment) {
    const destinations = knownMapLocations(world, actor).filter((place) => place.id !== actor.locationId && publicLocation(place.type))
      .map((place) => ({ place, distance: Math.hypot(place.x - location.x, place.y - location.y) }))
      .sort((a, b) => a.distance - b.distance || a.place.id.localeCompare(b.place.id)).slice(0, 5);
    for (const { place, distance } of destinations) add({ action: 'EXPLORE', reason: 'travel', score: 49 - Math.min(20, distance / 40),
      targetLocationId: place.id });
  }
  return sortCandidates(result);
}

export function recordDecisionTrace(world: WorldState, actorId: string, candidates: DecisionTraceCandidate[],
  decision: LLMDecisionPayload, source: DecisionTraceRecord['source'], applied: boolean): DecisionTraceRecord {
  // Rebuild each public candidate explicitly. Ignore any accidental attached free-form fields.
  const reasons: Record<PublicTraceAction, DecisionTraceCandidate['reason']> = {
    REST: 'recover', CULTIVATE: 'cultivate', BREAKTHROUGH: 'ready', SOCIALIZE: 'social', EXPLORE: 'travel', FACE_TRIBULATION: 'tribulation',
  };
  const picks: DecisionTraceCandidate[] = [];
  for (const item of candidates) {
    if (!isSafeAction(item.action) || !Number.isFinite(item.score)) continue;
    const choice: Omit<DecisionTraceCandidate, 'id'> = { action: item.action, score: clampScore(item.score), reason: reasons[item.action] };
    if (item.action === 'EXPLORE') {
      if (!world.locations.some((site) => site.id === item.targetLocationId && publicLocation(site.type))) continue;
      choice.targetLocationId = item.targetLocationId;
    } else if (item.action === 'SOCIALIZE') {
      if (!world.cultivators.some(({ id }) => id === item.targetCultivatorId)) continue;
      choice.targetCultivatorId = item.targetCultivatorId;
    } else if (item.action === 'FACE_TRIBULATION') {
      if (item.tribulationStance !== 'focus' && item.tribulationStance !== 'guard' && item.tribulationStance !== 'defy') continue;
      choice.tribulationStance = item.tribulationStance;
    }
    const id = candidateId(choice);
    if (!picks.some((candidate) => candidate.id === id)) picks.push({ ...choice, id });
  }
  const allowed = sortCandidates(picks);
  const match = allowed.find((item) => item.action === decision.chosenAction &&
    item.targetLocationId === decision.targetLocationId && item.targetCultivatorId === decision.targetCultivatorId &&
    item.tribulationStance === decision.tribulationStance);
  const id = `decision-${world.tick}-${actorId}`;
  const chosenAction = isSafeAction(decision.chosenAction) ? decision.chosenAction : 'redacted';
  const record: DecisionTraceRecord = { id, actorId, tick: world.tick, source, applied, chosenAction, candidates: allowed,
    ...(match ? { chosenCandidateId: match.id } : {}) };
  world.decisionTrace.records = [...world.decisionTrace.records.filter((entry) => entry.id !== id), record].slice(-DECISION_TRACE_LIMIT);
  return record;
}

export type ReplayCouncilMode = 'utility' | 'deferred';
export interface DecisionReplayTape {
  readonly baseTick: number;
  readonly councilMode: ReplayCouncilMode;
}
const runtimeTapes = new WeakMap<DecisionReplayTape, { base: WorldState; decisions: Map<string, LLMDecisionPayload>; draws: Map<string, number> }>();

export function createDecisionReplayTape(base: WorldState, councilMode: ReplayCouncilMode): DecisionReplayTape {
  const token = Object.freeze({ baseTick: base.tick, councilMode });
  runtimeTapes.set(token, { base: cloneWorldWithColdHistory(base), decisions: new Map(), draws: new Map() });
  return token;
}

const MECHANICAL_FIELDS = [
  'targetLocationId', 'targetCultivatorId', 'rumorIntent', 'proposedScheme', 'targetTuitionId', 'targetOathId', 'oathTerm', 'marketGood',
  'marketQuantity', 'marketLimitPrice', 'targetMarketOrderId', 'targetSettlementId', 'civicMemorialMove', 'targetCivicDeedId', 'targetCivicMemorialId', 'targetVolunteerId', 'targetWitnessEventId',
  'targetWitnessClaimId', 'targetEstateId', 'targetTechniqueId', 'targetHerbId', 'seedMove', 'targetSeedLotId', 'targetSeedPlotId', 'targetPillId', 'targetArtifactId', 'forgeTier',
  'tribulationStance', 'facilityKind', 'targetSectId', 'targetOccasionId', 'targetBountyId', 'targetBeastId',
  'targetScoreId', 'observatoryMove', 'observatoryStation', 'targetObservatoryTick', 'alignedWeatherMove', 'targetAlignedWeatherId', 'arbitrationMove', 'targetTenderTick', 'roadMove', 'targetRoadId', 'probationMove', 'targetProbationId', 'targetExpulsionId', 'probationFirstVillageId', 'probationSecondVillageId', 'probationVote', 'exhibitMove', 'targetRelicExhibitId', 'workshopMove', 'toolLoanMove', 'targetToolLoanId', 'workshopCapacityMove', 'furnaceMove', 'targetFurnaceReservationId', 'furnaceSafetyMove', 'targetFurnaceSafetyId', 'damageAssuranceMove', 'targetDamageAssuranceId', 'sparringMove', 'targetSparringId', 'sparringRounds', 'rescueMove', 'targetExpeditionRescueId', 'shortShiftMove', 'targetShortShiftId', 'boundaryReliefMove', 'targetBoundaryReliefId', 'cohortMove', 'targetCohortId', 'nameMove', 'householdAlias', 'targetHouseholdNameId', 'restitutionMove', 'targetRestitutionId', 'granaryMove', 'villageSupplyMove', 'targetVillageSupplyId', 'villageFairMove', 'targetVillageFairId', 'targetWorkshopId', 'workshopTier', 'workshopQuantity', 'workshopQualityFloor', 'targetTerrainTileId', 'commonsMove', 'targetCommonsId', 'targetCommonsThirdSectId', 'serviceMove', 'courierMove', 'courierHandoffMove', 'targetCourierId', 'dispatchCue', 'targetDispatchId', 'targetDispatchSourceId', 'villageWorkKind', 'guardianMove', 'targetGuardianshipId', 'leaseMove', 'targetTerritorialLeaseId', 'formationMove', 'targetFormationLinkId', 'infirmaryMove', 'targetInfirmaryCaseId', 'careFollowupMove', 'targetCareFollowupId', 'stipendMove', 'targetStipendId', 'habitatMove', 'targetBeastReleaseId', 'chronicleErrataMove', 'targetChronicleSourceId', 'chronicleReliefReading', 'pilgrimageMove', 'targetPilgrimageId', 'targetPilgrimageNextStopId', 'routeWarningMove', 'targetRouteWarningId', 'targetRouteObservationId', 'creditMove', 'targetCreditId', 'sanctuaryMove', 'targetSanctuaryId', 'researchMove', 'researchTopic', 'targetResearchId', 'researchWithdrawReason', 'ceasefireMove', 'targetCeasefireId', 'escortMove', 'targetShipmentId', 'targetEscortId', 'targetHazardId', 'seasonMove', 'editionMove', 'targetScriptureOriginalId', 'targetScriptureEditionId', 'pavilionLoanMove', 'targetPavilionLoanId', 'relicMove', 'targetRelicFragmentId', 'targetRelicSetId', 'recollectionMove', 'relocationMove', 'targetRelocationId', 'doctrineMove', 'doctrineTheme', 'targetDoctrineSchoolId', 'targetDoctrineProposalId',
] as const satisfies readonly (keyof LLMDecisionPayload)[];

export function rememberReplayDecision(tape: DecisionReplayTape, actorId: string, decision: LLMDecisionPayload, rngDraws = 0): void {
  const state = runtimeTapes.get(tape);
  if (!state) return;
  const details = Object.fromEntries(MECHANICAL_FIELDS.flatMap((key) => {
    const value = decision[key];
    return typeof value === 'string' || typeof value === 'number' ? [[key, value]] : [];
  }));
  const ids = decision.cohortInviteeIds;
  // Only the mechanical offer attribute is retained, never a model's raw array or prose.
  const cohortInviteeIds = decision.chosenAction === 'APPRENTICE_COHORT' && decision.cohortMove === 'offer' &&
    Array.isArray(ids) && ids.length >= 2 && ids.length <= COHORT_MAX_INVITEES && Array.from(ids).every((id) => typeof id === 'string' && id.length > 0) &&
    new Set(ids).size === ids.length ? ids.slice() : undefined;
  state.decisions.set(actorId, { ...details, chosenAction: decision.chosenAction, innerMonologue: '',
    ...(cohortInviteeIds ? { cohortInviteeIds } : {}) });
  state.draws.set(actorId, Number.isSafeInteger(rngDraws) && rngDraws > 0 ? Math.min(rngDraws, 512) : 0);
}

export interface DecisionReplayMetrics {
  alive: boolean;
  hp: number;
  qiProgress: number;
  realm: CultivationRealm;
  realmStage: number;
  livingCount: number;
  publicEventCount: number;
}
export interface DecisionReplayComparison {
  tick: number;
  actorId: string;
  alternateCandidateId: string;
  baseline: DecisionReplayMetrics;
  alternate: DecisionReplayMetrics;
}
export type DecisionReplayResult = { ok: true; comparison: DecisionReplayComparison } | { ok: false; reason: string };
export type ReplayAdvance = (base: WorldState, decisions: Record<string, LLMDecisionPayload>, councilMode: ReplayCouncilMode,
  onActor: (actorId: string, candidates: DecisionTraceCandidate[], applied: boolean) => void,
  decisionDraws: Readonly<Record<string, number>>) => WorldState;

function metrics(world: WorldState, actor: Cultivator): DecisionReplayMetrics {
  return { alive: actor.alive, hp: actor.hp, qiProgress: actor.qiProgress, realm: actor.realm, realmStage: actor.realmStage,
    livingCount: world.cultivators.filter((item) => item.alive).length,
    publicEventCount: world.events.filter((event) => event.tick === world.tick && event.witnessScope !== 'participants').length };
}

export function replayOneTurn(tape: DecisionReplayTape, baseline: WorldState, traceId: string,
  candidateIdToApply: string, advance: ReplayAdvance): DecisionReplayResult {
  const privateState = runtimeTapes.get(tape);
  if (!privateState || baseline.tick !== tape.baseTick + 1 || !sameGeneratedWorld(baseline, privateState.base)) {
    return { ok: false, reason: '当前分支没有同回合的可复演快照。' };
  }
  const trace = baseline.decisionTrace.records.find((item) => item.id === traceId && item.tick === baseline.tick);
  const actor = trace ? baseline.cultivators.find(({ id }) => id === trace.actorId) : undefined;
  if (!trace || !actor || !privateState.decisions.has(trace.actorId)) return { ok: false, reason: '找不到同回合的实际执行记录。' };
  const alternate = trace.candidates.find((item) => item.id === candidateIdToApply);
  if (!alternate || alternate.id === trace.chosenCandidateId) return { ok: false, reason: '请选择不同的合法备选行动。' };
  if (trace.source === 'avatar') return { ok: false, reason: '玩家接管的行动不在自动复演范围内。' };
  const actualDecision = privateState.decisions.get(trace.actorId)!;
  if ((isSafeAction(actualDecision.chosenAction) ? actualDecision.chosenAction : 'redacted') !== trace.chosenAction) {
    return { ok: false, reason: '回放记录与该分支的原决定不一致。' };
  }

  const copyDecisions = () => Object.fromEntries([...privateState.decisions].map(([id, decision]) => [id, { ...decision,
    ...(decision.cohortInviteeIds ? { cohortInviteeIds: decision.cohortInviteeIds.slice() } : {}),
  }]));
  const draws = Object.freeze(Object.fromEntries(privateState.draws));
  const decisions = copyDecisions();
  decisions[actor.id] = {
    chosenAction: alternate.action, innerMonologue: '',
    ...(alternate.targetLocationId ? { targetLocationId: alternate.targetLocationId } : {}),
    ...(alternate.targetCultivatorId ? { targetCultivatorId: alternate.targetCultivatorId } : {}),
    ...(alternate.tribulationStance ? { tribulationStance: alternate.tribulationStance } : {}),
  };
  let accepted = false;
  let originalObserved = false;
  let control: WorldState;
  let replay: WorldState;
  try {
    control = advance(structuredClone(privateState.base), copyDecisions(), tape.councilMode, (actorId, _now, applied) => {
      if (actorId === actor.id) originalObserved = applied === trace.applied;
    }, draws);
    replay = advance(structuredClone(privateState.base), decisions, tape.councilMode, (actorId, now, applied) => {
      if (actorId === actor.id) accepted = applied && now.some((option) => option.id === alternate.id && option.action === alternate.action &&
        option.targetLocationId === alternate.targetLocationId && option.targetCultivatorId === alternate.targetCultivatorId &&
        option.tribulationStance === alternate.tribulationStance);
    }, draws);
  } catch {
    return { ok: false, reason: '该隔离回合未能完整复演。' };
  }
  const controlActor = control.cultivators.find(({ id }) => id === actor.id);
  if (!originalObserved || !controlActor || control.tick !== baseline.tick || !sameGeneratedWorld(control, baseline)) {
    return { ok: false, reason: '原始决定的离线复演与执行记录不一致。' };
  }
  const alternateActor = replay.cultivators.find(({ id }) => id === actor.id);
  if (!accepted || replay.tick !== baseline.tick || !sameGeneratedWorld(replay, baseline) || !alternateActor) {
    return { ok: false, reason: '按实际执行顺序复核后，该行动不再适用。' };
  }
  return { ok: true, comparison: { tick: baseline.tick, actorId: actor.id, alternateCandidateId: alternate.id,
    baseline: metrics(control, controlActor), alternate: metrics(replay, alternateActor) } };
}
