import type { DramaticBondFact } from '../types/dramaticBond';
import type { ProtagonistHandoff, ProtagonistHandoffTie, ProtagonistHandoffTieKind } from '../types/protagonistHandoff';
import type { ChronicleAnchor, ProtagonistArc, WorldState } from '../types/world';
import { verifiedImmortalAscension } from './ascensionProof';
import { isChronicleStoryFact } from './chronicleLead';
import { dramaticBondCompareFacts, dramaticBondReadVenue, dramaticBondSourceId, dramaticBondUnique, matchesDramaticBondFact, matchesDramaticBondRedactedPractice } from './dramaticBondTerms';
import { eraHistoryCompatibleArchiveAnchor, eraHistoryMatchesLiveEvent } from './eraHistoryIndex';

export const PROTAGONIST_HANDOFF_WINDOW = 24;
const titles: Record<ProtagonistHandoffTieKind, string> = {
  encounter: '同席相逢',
  practice: '并肩同修',
  duel: '旧日交手',
};
const tieKinds = ['encounter', 'practice', 'duel'] as const;
const isTieKind = (kind: DramaticBondFact['kind']): kind is ProtagonistHandoffTieKind => kind !== 'lethal_duel';
const archiveSources = (world: WorldState, eventId: string, cutoff: number): ChronicleAnchor[] => [
  ...world.chronicleArchive.anchors.filter(row => row.id === eventId),
  ...[...world.chronicleArchive.chapters, ...world.coldHistory.chapters]
    .flatMap(chapter => chapter.endTick <= cutoff ? chapter.anchors.filter(row =>
      row.id === eventId && row.tick >= chapter.startTick && row.tick <= chapter.endTick) : []),
];
const publicSource = (row: ChronicleAnchor, cutoff: number) =>
  isChronicleStoryFact(row, cutoff) && (!('witnessScope' in row) || row.witnessScope === undefined);
const sameAnchor = (left: ChronicleAnchor, right: ChronicleAnchor) =>
  left.title.trim().slice(0, 80) === right.title.trim().slice(0, 80) &&
  left.description.trim().slice(0, 220) === right.description.trim().slice(0, 220);
type TieAuthority = 'verified' | 'missing' | 'disputed';
const validCutoff = (world: WorldState, tick: number) => Number.isSafeInteger(tick) && tick >= 0 && tick <= world.tick;

/** Native proof and public copies are independent. Missing evidence never becomes a newly inferred old tie. */
function handoffTieAuthority(
  world: WorldState, predecessorId: string, candidateId: string, tie: ProtagonistHandoffTie, throughTick: number,
  storageRedaction = false,
): TieAuthority | 'redacted' {
  if (!validCutoff(world, throughTick) || !tieKinds.includes(tie.kind) || predecessorId === candidateId || !Number.isSafeInteger(tie.tick) ||
      tie.tick < 1 || tie.tick > throughTick ||
      !dramaticBondUnique(world.cultivators, predecessorId) || !dramaticBondUnique(world.cultivators, candidateId) ||
      ![predecessorId, candidateId].some(id => dramaticBondSourceId(tie.tick, id, tie.kind) === tie.eventId))
    return 'disputed';
  const facts = world.dramaticBonds?.facts.filter(row => row.sourceEventId === tie.eventId) ?? [];
  const raw = world.events.filter(row => row.id === tie.eventId);
  const archived = archiveSources(world, tie.eventId, throughTick);
  const fact = facts[0];
  const storageOmission = (row: ChronicleAnchor, isArchived: boolean) =>
    storageRedaction && tie.kind === 'practice' && !!fact &&
    (isArchived && raw.length === 0 || raw[0]?.dialogueRedacted === true) &&
    matchesDramaticBondRedactedPractice(world, fact, row, isArchived);
  const isPair = (ids: readonly string[]) =>
    ids.length === 2 && ids[0] !== ids[1] && ids.includes(predecessorId) && ids.includes(candidateId);
  const anchorMatches = (row: ChronicleAnchor, isArchived: boolean) =>
    publicSource(row, throughTick) && row.tick === tie.tick && row.locationId === tie.siteId && isPair(row.actorIds) &&
    row.id === dramaticBondSourceId(tie.tick, row.actorIds[0], tie.kind) &&
    row.category === (tie.kind === 'duel' ? 'combat' : 'diplomacy') &&
    (tie.kind !== 'practice' || row.dialogue?.kind === 'dual_cultivation' || storageOmission(row, isArchived)) &&
    (!fact || row.year === fact.year && row.month === fact.month && row.actorIds.every((id, i) => id === fact.actorIds[i]));
  const primary = raw[0] ?? archived[0];
  if (raw.length > 1 || facts.length > 1 || raw.some(row => !anchorMatches(row, false)) || archived.some(row => !anchorMatches(row, true)) ||
      primary && archived.some(row => !sameAnchor(row, primary)))
    return 'disputed';
  if (!fact) return 'missing';
  if (fact.kind !== tie.kind || fact.tick !== tie.tick || fact.siteId !== tie.siteId ||
      !isPair(fact.actorIds) || fact.sourceEventId !== dramaticBondSourceId(tie.tick, fact.actorIds[0], tie.kind) ||
      (tie.kind === 'duel' ? !fact.winnerId || !fact.actorIds.includes(fact.winnerId) : fact.winnerId !== undefined) ||
      fact.fallenId !== undefined || !dramaticBondReadVenue(world, fact) ||
      raw.some(row => !matchesDramaticBondFact(fact, row) && !storageOmission(row, false))) return 'disputed';
  if (!primary) return 'missing';
  // Once a marked original truly leaves the bounded hot ring, a dialogue-less archive is only missing proof.
  // The saved dated handoff can outlast it, but a reader/election always uses the strict non-storage path.
  if (raw[0] && storageOmission(raw[0], false)) return 'redacted';
  return !raw.length && archived.every(row => storageOmission(row, true)) ? 'missing' : 'verified';
}

export function protagonistHandoffTieAuthority(
  world: WorldState, predecessorId: string, candidateId: string, tie: ProtagonistHandoffTie, throughTick: number,
): TieAuthority {
  const authority = handoffTieAuthority(world, predecessorId, candidateId, tie, throughTick);
  return authority === 'redacted' ? 'missing' : authority;
}

/** Internal save path only. A redacted stamp never has verified read or election authority. */
export function protagonistHandoffStoredTieAuthority(
  world: WorldState, predecessorId: string, candidateId: string, tie: ProtagonistHandoffTie, throughTick: number,
): TieAuthority | 'redacted' {
  return handoffTieAuthority(world, predecessorId, candidateId, tie, throughTick, true);
}

export function protagonistHandoffExitAuthority(
  world: WorldState, predecessor: ProtagonistArc, exit: Pick<ProtagonistHandoff, 'exitKind' | 'exitEventId'>, throughTick: number,
): TieAuthority {
  const ended = predecessor.endedTick;
  if (!validCutoff(world, throughTick) || ended === undefined || ended <= predecessor.openedTick || ended > throughTick) return 'disputed';
  const body = dramaticBondUnique(world.cultivators, predecessor.actorId);
  if (!body) return 'disputed';
  if (exit.exitKind === 'ascension') {
    if (predecessor.closeReason !== 'receded') return 'disputed';
    const terminal = verifiedImmortalAscension(world, body)?.terminal;
    return terminal?.tick === ended && terminal.eventId === exit.exitEventId ? 'verified' : 'disputed';
  }
  const death = predecessor.death;
  if (predecessor.closeReason !== 'public_death' || body.alive || body.hp !== 0 || death?.category !== 'death' ||
      death.tick !== ended || death.eventId !== exit.exitEventId) return 'disputed';
  const receipts = world.eraHistory.receipts.filter(row => row.eventId === death.eventId);
  const receipt = receipts[0];
  if (receipts.length > 1 || receipt && (receipt.kind !== 'death' || receipt.actorId !== body.id || receipt.tick !== ended))
    return 'disputed';
  const raw = world.events.filter(row => row.id === death.eventId);
  const archived = archiveSources(world, death.eventId, throughTick);
  const sharedMatches = (row: ChronicleAnchor) =>
    publicSource(row, throughTick) && row.tick === ended && row.category === 'death' && row.actorIds.includes(body.id);
  if (raw.length > 1 || raw.some(row => !sharedMatches(row) || receipt && !eraHistoryMatchesLiveEvent(receipt, row)) ||
      archived.some(row => !sharedMatches(row) || receipt && !eraHistoryCompatibleArchiveAnchor(receipt, row)) ||
      archived.some(row => !sameAnchor(row, raw[0] ?? archived[0]))) return 'disputed';
  return receipt && (raw.length || archived.length) ? 'verified' : 'missing';
}

const within = (tick: number, ended: number) => tick >= Math.max(1, ended - PROTAGONIST_HANDOFF_WINDOW) && tick < ended;
const asTie = (fact: DramaticBondFact & { kind: ProtagonistHandoffTieKind }): ProtagonistHandoffTie =>
  ({ kind: fact.kind, eventId: fact.sourceEventId, tick: fact.tick, siteId: fact.siteId });

/** Only the actual exit month may rank qualified successors; no delayed retroactive appointment. */
export function certifyProtagonistHandoff(
  world: WorldState, predecessor: ProtagonistArc, candidateId: string, throughTick: number,
): ProtagonistHandoff | undefined {
  if (throughTick !== world.tick || throughTick !== predecessor.endedTick || predecessor.actorId === candidateId)
    return undefined;
  const candidate = dramaticBondUnique(world.cultivators, candidateId);
  if (!candidate?.alive || candidate.hp <= 0 || candidate.positionPlane === 'immortal') return undefined;
  const deathId = predecessor.death?.eventId;
  const former = dramaticBondUnique(world.cultivators, predecessor.actorId);
  const ascensionId = former && predecessor.closeReason === 'receded' ? verifiedImmortalAscension(world, former)?.terminal.eventId : undefined;
  const exit = deathId ? { exitKind: 'public_death' as const, exitEventId: deathId } :
    ascensionId ? { exitKind: 'ascension' as const, exitEventId: ascensionId } : undefined;
  if (!exit || protagonistHandoffExitAuthority(world, predecessor, exit, throughTick) !== 'verified') return undefined;
  const choices: Record<ProtagonistHandoffTieKind, ProtagonistHandoffTie[]> = { encounter: [], practice: [], duel: [] };
  for (const row of [...(world.dramaticBonds?.facts ?? [])].sort((a, b) => dramaticBondCompareFacts(b, a))) {
    if (!isTieKind(row.kind) || !within(row.tick, throughTick) || !row.actorIds.includes(predecessor.actorId) ||
        !row.actorIds.includes(candidateId)) continue;
    const tie = asTie({ ...row, kind: row.kind });
    if (choices[tie.kind].length === 3 || choices[tie.kind].some(prior => prior.tick === tie.tick)) continue;
    if (protagonistHandoffTieAuthority(world, predecessor.actorId, candidateId, tie, throughTick) !== 'verified') continue;
    // Three distinct dates per kind suffice: at most two other selected dates can conflict.
    choices[tie.kind].push(tie);
  }
  for (const encounter of choices.encounter) for (const practice of choices.practice) for (const duel of choices.duel) {
    if (new Set([encounter.tick, practice.tick, duel.tick]).size === tieKinds.length)
      return { ...exit, ties: [encounter, practice, duel].sort((a, b) => a.tick - b.tick) };
  }
  return undefined;
}

export function readProtagonistHandoff(
  world: WorldState, arc: ProtagonistArc, predecessor: ProtagonistArc, throughTick: number,
): { exitKind: ProtagonistHandoff['exitKind']; ties: (ProtagonistHandoffTie & { title: string })[] } | undefined {
  const handoff = arc.handoff;
  if (!handoff || !validCutoff(world, throughTick) || arc.openedTick > throughTick ||
      arc.predecessorArcId !== predecessor.id || arc.openedTick !== predecessor.endedTick ||
      handoff.ties.length !== tieKinds.length || new Set(handoff.ties.map(row => row.kind)).size !== tieKinds.length) return undefined;
  if (protagonistHandoffExitAuthority(world, predecessor, handoff, throughTick) !== 'verified' ||
      handoff.ties.some((row, i) => !within(row.tick, arc.openedTick) || (i > 0 && row.tick <= handoff.ties[i - 1].tick) ||
        protagonistHandoffTieAuthority(world, predecessor.actorId, arc.actorId, row, throughTick) !== 'verified')) return undefined;
  return { exitKind: handoff.exitKind, ties: handoff.ties.map(row => ({ ...row, title: titles[row.kind] })) };
}
