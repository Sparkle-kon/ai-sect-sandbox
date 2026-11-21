import type { Cultivator, LLMDecisionPayload, WitnessClaim, WitnessState, WorldEvent, WorldState } from '../types/world';

const SOURCE_WINDOW = 8;
const REVIEW_WINDOW = 8;
const APPEAL_WINDOW = 6;
const MAX_FACTS = 96;
const MAX_CLAIMS = 64;
const MAX_LIVE_CASES = 24;
const REPUTATION_PENALTY = 2;
const live = (person: Cultivator) => person.alive && person.hp > 0;
const byId = (a: string, b: string) => a.localeCompare(b);

export type WitnessOption =
  | { action: 'FILE_WITNESS_CLAIM'; targetWitnessEventId: string; targetCultivatorId: string; targetWitnessClaimId?: never }
  | { action: 'ATTEST_WITNESS' | 'CHALLENGE_WITNESS'; targetWitnessClaimId: string; targetWitnessEventId?: never; targetCultivatorId?: never };

export const createWitnessState = (): WitnessState => ({ facts: [], claims: [], nextId: 1 });

function trimFacts(world: WorldState): void {
  const referenced = new Set(world.witnesses.claims.map(({ sourceEventId }) => sourceEventId));
  const recent = new Set(world.witnesses.facts.slice(-MAX_FACTS).map(({ eventId }) => eventId));
  world.witnesses.facts = world.witnesses.facts.filter(({ eventId }) => referenced.has(eventId) || recent.has(eventId));
}

/** Record actual first-hand opportunity at emission, never from somebody's rumor packet. */
export function capturePublicWitnessFact(world: WorldState, event: WorldEvent): void {
  if (event.witnessScope === 'participants' || event.tick !== world.tick || !event.locationId ||
      !world.locations.some(({ id }) => id === event.locationId) || !event.duelWinnerId ||
      world.witnesses.facts.some(({ eventId }) => eventId === event.id)) return;
  const parties = [...new Set(event.actorIds)];
  if (parties.length !== 2 || !parties.includes(event.duelWinnerId) ||
      parties.some((id) => !world.cultivators.some((person) => person.id === id))) return;
  const witnessIds = world.cultivators.filter((person) =>
    live(person) && person.locationId === event.locationId && !parties.includes(person.id)).map(({ id }) => id).sort(byId);
  world.witnesses.facts.push({ eventId: event.id, tick: event.tick, locationId: event.locationId,
    participantIds: parties, winnerId: event.duelWinnerId, witnessIds });
  trimFacts(world);
}

function knowsEvent(actor: Cultivator, world: WorldState, eventId: string): boolean {
  return actor.rumors.some((rumor) => rumor.learnedTick <= world.tick && rumor.originTick <= world.tick &&
    rumor.witnessScope !== 'participants' && rumor.provenance !== 'fabricated' && !rumor.id.startsWith('rumor-forged-') &&
    (rumor.originEventId === eventId || rumor.id === `rumor-${eventId}`));
}
function knowsClaim(actor: Cultivator, world: WorldState, claim: WitnessClaim): boolean {
  // A posted dossier is observable at its venue; an old relay cannot reveal new dossier changes.
  return actor.locationId === claim.locationId && world.locations.some(({ id }) => id === claim.locationId);
}

export function visibleWitnessClaims(world: WorldState, actor?: Cultivator): WitnessClaim[] {
  return world.witnesses.claims.filter((claim) => !actor || knowsClaim(actor, world, claim));
}

export function availableWitnessActions(actor: Cultivator, world: WorldState): WitnessOption[] {
  if (!live(actor) || world.cultivators.find(({ id }) => id === actor.id) !== actor) return [];
  const { claims, facts } = world.witnesses;
  const options: WitnessOption[] = [];
  for (const claim of visibleWitnessClaims(world, actor)) {
    if (claim.settledTick !== undefined || world.tick >= claim.deadlineTick) continue;
    const fact = facts.find(({ eventId }) => eventId === claim.sourceEventId);
    if (!fact) continue;
    if (claim.subjectId === actor.id && !claim.appeal && world.tick < claim.challengeUntilTick) {
      options.push({ action: 'CHALLENGE_WITNESS', targetWitnessClaimId: claim.id });
    }
    if (fact.witnessIds.includes(actor.id) && actor.id !== claim.claimantId && !claim.attestations.some(({ actorId }) => actorId === actor.id)) {
      options.push({ action: 'ATTEST_WITNESS', targetWitnessClaimId: claim.id });
    }
  }
  if (claims.length >= MAX_CLAIMS || claims.filter(({ settledTick }) => settledTick === undefined).length >= MAX_LIVE_CASES ||
      claims.some(({ claimantId, filedTick }) => claimantId === actor.id && filedTick === world.tick)) return options;
  for (const fact of [...facts].sort((a, b) => b.tick - a.tick || byId(a.eventId, b.eventId))) {
    if (fact.locationId !== actor.locationId || world.tick < fact.tick || world.tick - fact.tick > SOURCE_WINDOW ||
        !world.locations.some(({ id }) => id === fact.locationId) ||
        !(fact.witnessIds.includes(actor.id) || fact.participantIds.includes(actor.id) || knowsEvent(actor, world, fact.eventId))) continue;
    for (const subjectId of [...fact.participantIds].sort(byId)) {
      if (subjectId === actor.id || claims.some((claim) => claim.sourceEventId === fact.eventId && claim.subjectId === subjectId) ||
          !world.cultivators.some((person) => person.id === subjectId)) continue;
      options.push({ action: 'FILE_WITNESS_CLAIM', targetWitnessEventId: fact.eventId, targetCultivatorId: subjectId });
    }
  }
  return options;
}

function event(world: WorldState, claim: WitnessClaim, key: string, title: string, description: string, actorIds: string[]): WorldEvent {
  return { id: `evt-${world.tick}-${claim.id}-${key}`, tick: world.tick, year: world.year, month: world.month,
    title, description, actorIds, locationId: claim.locationId, category: 'diplomacy' };
}

export function resolveWitnessAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  const option = availableWitnessActions(actor, world).find((entry) =>
    entry.action === decision.chosenAction && (entry.action === 'FILE_WITNESS_CLAIM' ?
      entry.targetWitnessEventId === decision.targetWitnessEventId && entry.targetCultivatorId === decision.targetCultivatorId :
      entry.targetWitnessClaimId === decision.targetWitnessClaimId));
  if (!option) return null;
  if (option.action === 'FILE_WITNESS_CLAIM') {
    const fact = world.witnesses.facts.find(({ eventId }) => eventId === option.targetWitnessEventId)!;
    const subject = world.cultivators.find(({ id }) => id === option.targetCultivatorId)!;
    const sect = world.sects.find(({ id }) => id === subject.sectId);
    const id = `witness-claim-${world.witnesses.nextId++}`;
    const claim: WitnessClaim = { id, sourceEventId: fact.eventId, publicationEventId: `evt-${world.tick}-${id}-posted`,
      claimantId: actor.id, subjectId: subject.id, locationId: fact.locationId, filedTick: world.tick,
      deadlineTick: world.tick + REVIEW_WINDOW, challengeUntilTick: world.tick + APPEAL_WINDOW,
      status: 'pending', attestations: [], ...(sect ? { reputationSectId: sect.id } : {}),
      reputationPenalty: sect ? REPUTATION_PENALTY : 0, reputationRestored: 0 };
    if (sect) sect.reputation -= claim.reputationPenalty;
    world.witnesses.claims.push(claim);
    return event(world, claim, 'posted', '坊间指证待复核', `${actor.name}公开主张${subject.name}在所引斗法中落败；登记为未经证实。`, [actor.id, subject.id]);
  }
  const claim = world.witnesses.claims.find(({ id }) => id === option.targetWitnessClaimId)!;
  const fact = world.witnesses.facts.find(({ eventId }) => eventId === claim.sourceEventId)!;
  if (option.action === 'ATTEST_WITNESS') {
    const verdict = fact.winnerId === claim.subjectId ? 'contradicts' : 'supports';
    claim.attestations.push({ actorId: actor.id, tick: world.tick, verdict });
    if (verdict === 'contradicts') claim.status = 'disputed';
    return event(world, claim, `attest-${actor.id}`, '斗法目击证词', `${actor.name}凭当场目击${verdict === 'supports' ? '支持' : '反驳'}该指证。`, [actor.id]);
  }
  const upheld = fact.winnerId === actor.id;
  const reason = upheld ? '所引公开斗法的原始结果与指证矛盾，胜者正是被指证者。' :
    '所引公开斗法的原始结果不支持此项申辩。';
  claim.appeal = { tick: world.tick, actorId: actor.id, verdict: upheld ? 'upheld' : 'rejected', reason };
  claim.status = 'disputed';
  return event(world, claim, 'appeal', '被指证者提交申辩', `${actor.name}依据同一场公开斗法的原始事实提交一次申辩。`, [actor.id]);
}

export function advanceWitnesses(world: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const claim of world.witnesses.claims) {
    if (claim.settledTick !== undefined) continue;
    const supporting = claim.attestations.filter(({ verdict }) => verdict === 'supports').length;
    const contradicting = claim.attestations.filter(({ verdict }) => verdict === 'contradicts').length;
    if (claim.appeal?.verdict === 'upheld' || contradicting >= 2) {
      claim.status = 'retracted';
      claim.reason = claim.appeal?.verdict === 'upheld' ? claim.appeal.reason : '两名独立的现场目击者均反驳该指证。';
    } else if (supporting >= 2) {
      claim.status = 'corroborated';
      claim.reason = '两名独立的现场目击者支持原主张，转述未计票。';
    } else if (world.tick >= claim.deadlineTick) {
      claim.status = 'disputed';
      claim.reason = '复核期满，未获得足够的独立现场证据；撤销暂记影响，但不认定真伪。';
    } else continue;
    claim.settledTick = world.tick;
    if (claim.status !== 'corroborated' && claim.reputationPenalty > 0) {
      const sect = world.sects.find(({ id }) => id === claim.reputationSectId);
      if (sect) {
        sect.reputation += claim.reputationPenalty;
        claim.reputationRestored = claim.reputationPenalty;
      }
    }
    const title = claim.status === 'retracted' ? '争议指证撤回' : claim.status === 'corroborated' ? '独立证词印证指证' : '证据不足，指证存疑';
    events.push(event(world, claim, 'settled', title, claim.reason, [claim.subjectId]));
  }
  // Keep room for new cases only after settled history is safely beyond the source/appeal window.
  const excess = world.witnesses.claims.length - (MAX_CLAIMS - MAX_LIVE_CASES);
  if (excess > 0) {
    const expired = new Set(world.witnesses.claims.filter((claim) => claim.settledTick !== undefined &&
      world.tick - claim.settledTick > SOURCE_WINDOW + REVIEW_WINDOW).slice(0, excess).map(({ id }) => id));
    world.witnesses.claims = world.witnesses.claims.filter(({ id }) => !expired.has(id));
  }
  trimFacts(world);
  return events;
}
