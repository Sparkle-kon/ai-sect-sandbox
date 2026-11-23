import { isPrivateApprenticeshipReunionEvent } from '../src/engine/apprenticeshipReunion';
import { isPrivateBattlefieldAftermathEvent } from '../src/engine/battlefieldAftermath';
import { availableWitnessInquiryActions, isPrivateWitnessInquiryEvent } from '../src/engine/witnessInquiry';
import { matchesWitnessedPersonalScene, WITNESSED_PERSONAL_STORY_TICKS } from '../src/engine/witnessedPersonalStory';
import type { WitnessClaim, WitnessFact, WorldEvent, WorldState } from '../src/types/world';
import type { StoryAuditTurn } from './storyTriggerAuditTerms';

const witnessSteps = ['facts', 'independentlyWitnessedDuels', 'filedClaims', 'filedFromWitnessedDuel',
  'inspectedClaims', 'askedClaims', 'inspectionReceipts', 'answerReceipts'] as const;
const readinessSteps = ['missingRetainedProof', 'reviewClosed', 'physicalOrIndependentMissing', 'legalAsk'] as const;
type Readiness = typeof readinessSteps[number];
interface Inspection {
  readonly eventId: string;
  readonly readerId: string;
  readonly claimId: string;
  readonly sourceId: string;
  readonly publicationId: string;
  readonly inspectedTick: number;
  readonly deadline: number;
}
const aftermathSteps = ['battlefieldTerminals', 'terminalsWithQualifiedCase', 'qualifiedCases',
  'terminalsWithResponse', 'actualResponses'] as const;
const apprenticeshipSteps = ['asked', 'refused', 'departed', 'reunited', 'quietConversation'] as const;

export interface StoryTriggerFunnelSummary {
  readonly observedMonths: number;
  readonly witness: Readonly<Record<typeof witnessSteps[number], number>>;
  readonly askReadiness: Readonly<{
    /** Exactly one prediction for execution on the first month after the actual inspection. */
    readonly firstNextTurn: Readonly<Record<Readiness, number>>;
    /** Distinct inspection and prospective month pairs up to first actual answer or administrative close. */
    readonly followupChecks: Readonly<Record<Readiness, number>>;
    readonly inspectionsWithAnyLegalAsk: number;
  }>;
  readonly aftermath: Readonly<Record<typeof aftermathSteps[number], number>>;
  readonly apprenticeship: Readonly<Record<typeof apprenticeshipSteps[number], number>>;
}
type FindEvent = (id: string) => WorldEvent | undefined;

function ledger<K extends string>(stages: readonly K[]) {
  const books = new Map<K, Set<string>>(stages.map(stage => [stage, new Set<string>()]));
  return {
    note(stage: K, identity: string) { books.get(stage)?.add(identity); },
    summarize() {
      return Object.freeze(Object.fromEntries([...books].map(([stage, ids]) => [stage, ids.size]))) as
        Readonly<Record<K, number>>;
    },
  };
}

/** Ambiguous ID twins are never used as evidence. Duplicate submissions of a whole turn are ignored separately. */
function completedEvents(turn: StoryAuditTurn): FindEvent {
  const seen = new Map<string, WorldEvent | null>();
  for (const event of turn.events) {
    if (event.tick === turn.after.tick) seen.set(event.id, seen.has(event.id) ? null : event);
  }
  return id => seen.get(id) ?? undefined;
}

function witnessedDuel(fact: WitnessFact, world: WorldState, source: WorldEvent | undefined): boolean {
  if (!source || !fact.witnessIds.some(id => !fact.participantIds.includes(id))) return false;
  return world.witnessedPersonalStory.scenes.some(scene => scene.kind === 'duel' && scene.eventId === fact.eventId &&
    scene.witnessIds.some(id => fact.witnessIds.includes(id) && !fact.participantIds.includes(id)) &&
    matchesWitnessedPersonalScene(scene, source));
}

function retained<T>(rows: readonly T[], test: (row: T) => boolean): T | undefined {
  let entry: T | undefined;
  for (const row of rows) {
    if (!test(row)) continue;
    if (entry !== undefined) return undefined;
    entry = row;
  }
  return entry;
}

function askReadiness(world: WorldState, receipt: Inspection, claim: WitnessClaim | undefined, tick: number): Readiness {
  const person = retained(world.cultivators, actor => actor.id === receipt.readerId);
  if (person && availableWitnessInquiryActions(person, world, tick).some(option =>
      option.witnessInquiryMove === 'ask' && option.targetWitnessClaimId === receipt.claimId))
    return 'legalAsk';
  if (claim?.settledTick !== undefined || tick >= receipt.deadline || claim && tick >= claim.deadlineTick)
    return 'reviewClosed';
  const source = retained(world.events, event => event.id === receipt.sourceId);
  const post = retained(world.events, event => event.id === receipt.publicationId);
  const read = retained(world.events, event => event.id === receipt.eventId);
  const scene = retained(world.witnessedPersonalStory.scenes, row => row.eventId === receipt.sourceId);
  const fact = retained(world.witnesses.facts, row => row.eventId === receipt.sourceId);
  if (!claim || !source || !post || !read || !scene || !fact || tick - scene.tick > WITNESSED_PERSONAL_STORY_TICKS ||
      !matchesWitnessedPersonalScene(scene, source) || !isPrivateWitnessInquiryEvent(read))
    return 'missingRetainedProof';
  // Proof exists and the review is open; the actual resolver did not offer a present independent party.
  return 'physicalOrIndependentMissing';
}

/** One observer per native run. Only counts are returned; stage identities and all private lines remain internal. */
export function createStoryTriggerFunnel(): {
  observe: (turn: StoryAuditTurn) => void;
  summary: () => StoryTriggerFunnelSummary;
} {
  const witness = ledger(witnessSteps), aftermath = ledger(aftermathSteps), apprenticeship = ledger(apprenticeshipSteps);
  const observed = new Set<number>();
  const duelSources = new Set<string>();
  const activeInspections = new Map<string, Inspection>();
  const firstNextTurn = ledger(readinessSteps), followupChecks = ledger(readinessSteps);
  const everLegal = new Set<string>();

  function observe(turn: StoryAuditTurn) {
    const { before, after } = turn;
    const tick = after.tick;
    if (tick !== before.tick + 1) throw new Error('Story trigger funnel requires a genuinely completed month');
    if (observed.has(tick)) return;
    observed.add(tick);
    const actual = completedEvents(turn);
    const facts = new Map(after.witnesses.facts.map(row => [row.eventId, row]));
    const claims = new Map(after.witnesses.claims.map(row => [row.id, row]));

    for (const fact of facts.values()) {
      const source = actual(fact.eventId);
      if (fact.tick !== tick || !source || source.witnessScope !== undefined ||
          source.locationId !== fact.locationId || source.duelWinnerId !== fact.winnerId ||
          fact.participantIds.length !== 2 || !fact.participantIds.every(id => source.actorIds.includes(id))) continue;
      witness.note('facts', fact.eventId);
      if (witnessedDuel(fact, after, source)) {
        duelSources.add(fact.eventId);
        witness.note('independentlyWitnessedDuels', fact.eventId);
      }
    }
    for (const claim of claims.values()) {
      const posted = actual(claim.publicationEventId), fact = facts.get(claim.sourceEventId);
      if (claim.filedTick !== tick || !fact || fact.tick > tick || fact.locationId !== claim.locationId ||
          !posted || posted.id !== `evt-${tick}-${claim.id}-posted` || posted.category !== 'diplomacy' ||
          posted.witnessScope !== undefined || posted.locationId !== claim.locationId ||
          posted.actorIds[0] !== claim.claimantId || posted.actorIds[1] !== claim.subjectId) continue;
      witness.note('filedClaims', claim.id);
      if (duelSources.has(fact.eventId) || witnessedDuel(fact, after, before.events.find(row => row.id === fact.eventId)))
        witness.note('filedFromWitnessedDuel', claim.id);
    }
    const answered = new Set<string>();
    for (const event of turn.events) {
      if (actual(event.id) !== event || !isPrivateWitnessInquiryEvent(event) || event.category !== 'intrigue') continue;
      const match = /^evt-witness-inquiry-(inspect|ask)-[1-9]\d*-.+-(witness-claim-[1-9]\d*)$/u.exec(event.id);
      const claim = match && claims.get(match[2]);
      if (!match || !claim || claim.filedTick >= tick || !event.actorIds[0] ||
          !facts.has(claim.sourceEventId) || claim.locationId !== event.locationId ||
          event.id !== `evt-witness-inquiry-${match[1]}-${tick}-${event.actorIds[0]}-${claim.id}`) continue;
      if (match[1] === 'inspect' && event.actorIds.length === 1) {
        witness.note('inspectedClaims', claim.id);
        witness.note('inspectionReceipts', event.id);
        activeInspections.set(event.id, { eventId: event.id, readerId: event.actorIds[0], claimId: claim.id,
          sourceId: claim.sourceEventId, publicationId: claim.publicationEventId, inspectedTick: tick, deadline: claim.deadlineTick });
      } else if (match[1] === 'ask' && event.actorIds.length === 2 &&
          event.actorIds[0] !== event.actorIds[1] && facts.get(claim.sourceEventId)?.witnessIds.includes(event.actorIds[1])) {
        witness.note('askedClaims', claim.id);
        witness.note('answerReceipts', event.id);
        answered.add(JSON.stringify([event.actorIds[0], claim.id]));
      }
    }

    for (const record of activeInspections.values()) {
      if (answered.has(JSON.stringify([record.readerId, record.claimId]))) {
        activeInspections.delete(record.eventId);
        continue;
      }
      const prospectiveTick = tick + 1;
      const status = askReadiness(after, record, claims.get(record.claimId), prospectiveTick);
      if (tick === record.inspectedTick) firstNextTurn.note(status, record.eventId);
      followupChecks.note(status, JSON.stringify([record.eventId, prospectiveTick]));
      if (status === 'legalAsk') everLegal.add(record.eventId);
      if (status === 'reviewClosed') activeInspections.delete(record.eventId);
    }

    const terminalIds = new Set<string>();
    for (const siege of after.sieges) {
      const terminal = siege.theatre?.terminal, last = siege.theatre?.rounds.at(-1);
      if (!terminal?.battlefield || terminal.tick !== tick || terminal.status !== siege.status ||
          (terminal.status !== 'victory' && terminal.status !== 'repelled') ||
          last?.tick !== tick || last.sourceEventId !== terminal.sourceEventId) continue;
      const proof = actual(terminal.sourceEventId);
      if (!proof || proof.witnessScope !== undefined || proof.category !== 'diplomacy' ||
          proof.locationId !== siege.destinationId) continue;
      terminalIds.add(terminal.sourceEventId);
      aftermath.note('battlefieldTerminals', terminal.sourceEventId);
    }
    for (const row of after.battlefieldAftermath?.cases ?? []) {
      if (row.terminalTick === tick && terminalIds.has(row.terminalEventId)) {
        aftermath.note('terminalsWithQualifiedCase', row.terminalEventId);
        aftermath.note('qualifiedCases', row.id);
      }
      const decision = row.decision;
      if (!decision || decision.tick !== tick || decision.tick <= row.terminalTick) continue;
      const proof = actual(`evt-${tick}-${row.id}-${decision.move}`);
      if (proof && isPrivateBattlefieldAftermathEvent(proof) && proof.actorIds.includes(row.actorId)) {
        aftermath.note('terminalsWithResponse', row.terminalEventId);
        aftermath.note('actualResponses', proof.id);
      }
    }

    const originalCases = new Map(before.apprenticeshipReunions?.cases.map(row => [row.id, row]));
    for (const row of after.apprenticeshipReunions?.cases ?? []) {
      const original = originalCases.get(row.id);
      if (!original && row.askTick === tick) {
        const ask = actual(`evt-${row.id}-ask-${tick}`);
        if (ask && isPrivateApprenticeshipReunionEvent(ask) &&
            ask.actorIds[0] === row.studentId && ask.actorIds[1] === row.mentorId)
          apprenticeship.note('asked', row.id);
      }
      if (original && original.refusedTick === undefined && row.refusedTick === tick && row.askTick < tick) {
        const refuse = actual(`evt-${row.id}-refuse-${tick}`);
        if (refuse && isPrivateApprenticeshipReunionEvent(refuse) &&
            refuse.actorIds[0] === row.studentId && refuse.actorIds[1] === row.mentorId)
          apprenticeship.note('refused', row.id);
      }
      // These two lawful movement stamps have no standalone event: the scene system records them on actual EXPLORE.
      if (original?.refusedTick !== undefined && original.refusedTick < tick && original.departure === undefined &&
          row.departure?.tick === tick)
        apprenticeship.note('departed', row.id);
      if (original?.departure && original.departure.tick < tick && original.reunion === undefined &&
          row.reunion?.tick === tick && row.reunion.actorId !== original.departure.actorId &&
          row.reunion.siteId === original.departure.toSiteId)
        apprenticeship.note('reunited', row.id);
      if (original?.reunion && original.reunion.tick < tick && original.quiet === undefined && row.quiet?.tick === tick) {
        const quiet = actual(row.quiet.eventId);
        if (quiet && quiet.witnessScope === undefined && quiet.category === 'diplomacy' &&
            quiet.locationId === row.reunion?.siteId && quiet.actorIds.length === 2 &&
            quiet.actorIds.includes(row.studentId) && quiet.actorIds.includes(row.mentorId))
          apprenticeship.note('quietConversation', row.id);
      }
    }
  }

  return {
    observe,
    summary: () => Object.freeze({
      observedMonths: observed.size,
      witness: witness.summarize(),
      askReadiness: Object.freeze({firstNextTurn: firstNextTurn.summarize(),
        followupChecks: followupChecks.summarize(), inspectionsWithAnyLegalAsk: everLegal.size}),
      aftermath: aftermath.summarize(), apprenticeship: apprenticeship.summarize(),
    }),
  };
}
