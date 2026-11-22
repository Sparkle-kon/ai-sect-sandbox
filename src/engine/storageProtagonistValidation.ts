import type { ChronicleChapter, ProtagonistArc, ProtagonistEvidence, WorldState } from '../types/world';
import { verifiedImmortalAscension } from './ascensionProof';
import { isChronicleStoryFact } from './chronicleLead';
import { DRAMATIC_BOND_FACTS_MAX } from './dramaticBondTerms';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { PROTAGONIST_HANDOFF_WINDOW, protagonistHandoffExitAuthority, protagonistHandoffStoredTieAuthority } from './protagonistHandoff';
import { PROTAGONIST_OPEN_WINDOW, PROTAGONIST_SUPPORT_LIMIT, PROTAGONIST_SUSTAIN_WINDOW,
  protagonistFactIndex, qualifiesProtagonistOpening } from './protagonistSuccession';

export function validateProtagonistHistory(
  world: WorldState, chapters: readonly ChronicleChapter[], actors: ReadonlySet<string>,
  fail: (path: string) => never,
): void {
  const { arcs, lastEvaluatedTick } = world.protagonistSuccession;
  if ((lastEvaluatedTick !== undefined && lastEvaluatedTick >= world.tick) ||
      (lastEvaluatedTick === undefined && arcs.length > 0))
    return fail('protagonistSuccession.evaluation');
  if (!arcs.length && !chapters.some(({ storyFocal }) => storyFocal !== undefined)) return;
  const facts = protagonistFactIndex(world);
  const entities = new Map(world.cultivators.map((person) => [person.id, person]));
  const hasHandoffs = arcs.some(row => row.handoff !== undefined);
  const oldestHot = hasHandoffs ? world.events.reduce((oldest, row) => Math.min(oldest, row.tick), Infinity) : Infinity;
  const needsHot = (tick: number) => tick > oldestHot || tick === world.tick && world.events.length < 120;
  const bonds = hasHandoffs ? world.dramaticBonds?.facts : undefined;
  const firstBond = bonds?.[0];
  const bondIds = new Set(bonds?.map(row => row.sourceEventId));
  const known = new Map<string, ProtagonistArc>();
  const pastActorEnd = new Map<string, number>();
  let previous: ProtagonistArc | undefined;
  const verifySource = (proof: ProtagonistEvidence, person: string) => {
    // Retired source content and explicitly contested copies may not be projected as scenes.
    // Absolute ledger evidence remains data, not a substitute for a currently readable text.
    const current = facts.byId.get(proof.eventId);
    if (!current) return;
    if (current.tick !== proof.tick || current.category !== proof.category || !current.actorIds.includes(person) ||
        (proof.attribution === 'named_first' && current.actorIds[0] !== person) ||
        (proof.attribution === 'direct_quote' && current.dialogue !== undefined &&
          !current.dialogue.turns.some(({ speakerId }) => speakerId === person)))
      fail('protagonistSuccession.arcs.proofSource');
  };
  for (const arc of arcs) {
    const { id, actorId, openedTick, endedTick, opening, support, death, closeReason, predecessorArcId, handoff } = arc;
    const terminalActor = closeReason === 'receded' && endedTick !== undefined &&
      endedTick - openedTick < PROTAGONIST_SUSTAIN_WINDOW ? entities.get(actorId) : undefined;
    const exactDeparture = terminalActor && verifiedImmortalAscension(world, terminalActor)?.terminal.tick === endedTick;
    if (id !== `protagonist-arc-${openedTick}` || known.has(id) || !actors.has(actorId) ||
        openedTick > (lastEvaluatedTick ?? -1) || predecessorArcId !== previous?.id ||
        (previous !== undefined && (previous.endedTick === undefined || openedTick < previous.endedTick ||
          openedTick <= previous.openedTick)) ||
        ((endedTick === undefined) !== (closeReason === undefined)) ||
        (endedTick !== undefined && (endedTick <= openedTick || endedTick > (lastEvaluatedTick ?? -1))) ||
        ((closeReason === 'public_death') !== (death !== undefined)) ||
        (closeReason === 'receded' && endedTick! - openedTick < PROTAGONIST_SUSTAIN_WINDOW && !exactDeparture))
      return fail('protagonistSuccession.arcs.timeline');

    const precedingEvidence = new Set(previous ?
      [...previous.opening, ...previous.support, ...(previous.death ? [previous.death] : [])].map(({ eventId }) => eventId) : []);
    let date = Math.max(openedTick - PROTAGONIST_OPEN_WINDOW, previous?.openedTick ?? -1, pastActorEnd.get(actorId) ?? -1);
    const ownIds = new Set<string>();
    if (!qualifiesProtagonistOpening(opening))
      return fail('protagonistSuccession.arcs.opening');
    for (const proof of opening) {
      if (proof.tick <= date || proof.tick > openedTick || proof.category === 'heavenly' || precedingEvidence.has(proof.eventId))
        return fail('protagonistSuccession.arcs.opening');
      verifySource(proof, actorId);
      date = proof.tick;
      ownIds.add(proof.eventId);
    }
    if (support.length > PROTAGONIST_SUPPORT_LIMIT) return fail('protagonistSuccession.arcs.support');
    date = openedTick;
    for (const proof of support) {
      if (proof.tick <= date || proof.tick > (endedTick ?? lastEvaluatedTick ?? -1) ||
          proof.category === 'heavenly' || ownIds.has(proof.eventId))
        return fail('protagonistSuccession.arcs.support');
      verifySource(proof, actorId);
      date = proof.tick;
      ownIds.add(proof.eventId);
    }
    if (death) {
      const prior = facts.byId.get(death.eventId), raw = facts.native.get(death.eventId);
      const roles = prior && [...new Set(prior.actorIds)];
      if (death.tick !== endedTick || death.category !== 'death' || ownIds.has(death.eventId) ||
          entities.get(actorId)?.alive !== false ||
          (prior !== undefined && roles?.length === 1 && roles[0] !== actorId) ||
          (prior !== undefined && raw !== undefined && roles?.length !== 1 &&
            (roles?.length !== 2 || raw.duelWinnerId === undefined || raw.duelWinnerId === actorId || !roles.includes(raw.duelWinnerId))))
        return fail('protagonistSuccession.arcs.death');
      verifySource(death, actorId);
    }
    if (handoff) {
      const path = 'protagonistSuccession.arcs.handoff';
      if (!previous || predecessorArcId !== previous.id || actorId === previous.actorId || previous.endedTick !== openedTick ||
          handoff.ties.length !== 3 || new Set(handoff.ties.map(row => row.kind)).size !== 3 ||
          new Set(handoff.ties.map(row => row.eventId)).size !== 3)
        return fail(`${path}.timeline`);
      const exit = protagonistHandoffExitAuthority(world, previous, handoff, world.tick);
      // Public mortality has a separate durable lifecycle receipt. It does not rotate with public text.
      // The authored book can no longer quote the exit after its original and copies are gone.
      const retainedDeath = handoff.exitKind === 'public_death' &&
        world.eraHistory.receipts.some(row => row.eventId === handoff.exitEventId &&
          row.kind === 'death' && row.actorId === previous!.actorId && row.tick === openedTick);
      if (exit === 'disputed' || exit === 'missing' && (!retainedDeath || needsHot(openedTick)))
        return fail(`${path}.exit`);
      let priorDate = Math.max(1, openedTick - PROTAGONIST_HANDOFF_WINDOW) - 1;
      for (const tie of handoff.ties) {
        const locations = world.locations.filter(row => row.id === tie.siteId);
        const site = locations.length === 1 ? locations[0] : undefined;
        if (tie.tick <= priorDate || tie.tick >= openedTick || tie.eventId === handoff.exitEventId ||
            !site || isScopedExpeditionGate(site) || !['market', 'sect_hq', 'spirit_vein'].includes(site.type))
          return fail(`${path}.ties`);
        const authority = protagonistHandoffStoredTieAuthority(world, previous.actorId, actorId, tie, world.tick);
        const couldRotateBond = bonds?.length === DRAMATIC_BOND_FACTS_MAX && firstBond &&
          (tie.tick < firstBond.tick || tie.tick === firstBond.tick && tie.eventId < firstBond.sourceEventId);
        // A pruned original is not readable prose; this permits only historic stamps independently
        // retained in the typed ledger, or stamps actually older than its full native retention frontier.
        if (authority === 'disputed' || authority === 'missing' &&
            (needsHot(tie.tick) || !bondIds.has(tie.eventId) && !couldRotateBond))
          return fail(`${path}.source`);
        priorDate = tie.tick;
      }
    }
    if (endedTick !== undefined) pastActorEnd.set(actorId, endedTick);
    known.set(id, arc);
    previous = arc;
  }
  for (const chapter of chapters) {
    const stamp = chapter.storyFocal;
    if (stamp === undefined) continue;
    if (chapter.endTick > (lastEvaluatedTick ?? -1)) return fail('chronicleArchive.chapter.storyFocal');
    if (stamp.kind === 'ensemble') continue;
    const arc = known.get(stamp.arcId), biography = chapter.biographies.find(({ actorId }) => actorId === stamp.actorId);
    if (!arc || chapter.endTick < arc.openedTick || chapter.endTick >= (arc.endedTick ?? Infinity) ||
        arc.actorId !== stamp.actorId || !biography || stamp.eventIds.length < 2 ||
        new Set(stamp.eventIds).size !== stamp.eventIds.length)
      return fail('chronicleArchive.chapter.storyFocal');
    const cited = new Map(chapter.anchors.map((entry) => [entry.id, entry]));
    let date = -1;
    for (const id of stamp.eventIds) {
      const proof = cited.get(id);
      if (!proof || proof.tick <= date || !proof.actorIds.includes(stamp.actorId) ||
          !isChronicleStoryFact(proof, chapter.endTick) || !biography.anchorIds.includes(id))
        return fail('chronicleArchive.chapter.storyFocal');
      date = proof.tick;
    }
  }
}
