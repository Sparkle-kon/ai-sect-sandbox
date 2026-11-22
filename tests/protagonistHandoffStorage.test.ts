import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { readProtagonistHandoff } from '../src/engine/protagonistHandoff';
import { qualifiesProtagonistOpening } from '../src/engine/protagonistSuccession';
import { decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { buildConfirmedShareSave, prepareShareSavePrivacy, SHARE_SAVE_REDACTED_TEXT } from '../src/engine/shareSavePrivacy';
import type { WorldState } from '../src/types/world';
import { electNativeHandoff, nativeHandoffCompetition } from './fixtures/protagonistHandoffSuccessionFixture';
import { fallenProtagonistStory, storyPayload, storyTurn } from './fixtures/protagonistSuccessionFixture';

const handoff = (world: WorldState) => world.protagonistSuccession.arcs.at(-1)!.handoff!;
const reopen = (world: WorldState) => {
  const bytes = encodeEraWorldSave(world);
  const restored = decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(restored)).toBe(bytes);
  return restored;
};
let earned: ReturnType<typeof nativeHandoffCompetition> | undefined;
function competition() {
  earned ??= nativeHandoffCompetition();
  return { ...earned, world: structuredClone(earned.world) };
}

describe('strict native succession evidence across actual saves', () => {
  it('preserves absence in true old/ordinary saves and round-trips exact three public ties in both engine modes', () => {
    const old = encodeWorldSave(createInitialWorld());
    expect(old).not.toContain('"handoff"');
    expect(encodeWorldSave(decodeWorldSave(old))).toBe(old);
    const ordinary = fallenProtagonistStory();
    expect(reopen(ordinary.world).protagonistSuccession.arcs.at(-1)?.handoff).toBeUndefined();

    const setup = competition();
    for (const mode of ['utility', 'deferred'] as const) {
      const world = reopen(electNativeHandoff(setup.world, mode));
      const [predecessor, candidate] = world.protagonistSuccession.arcs.slice(-2);
      expect(predecessor.actorId).toBe(setup.leadId);
      expect(candidate.actorId).toBe(setup.successorId);
      expect(candidate.openedTick).toBe(predecessor.endedTick);
      expect(qualifiesProtagonistOpening(candidate.opening)).toBe(true);
      expect(candidate.handoff).toEqual({
        exitKind: 'public_death',
        exitEventId: setup.exitId,
        ties: setup.ties.map(({ kind, tick, siteId, sourceEventId }) => ({ kind, tick, siteId, eventId: sourceEventId })),
      });
      expect(readProtagonistHandoff(world, candidate, predecessor, candidate.openedTick)).toMatchObject({ exitKind: 'public_death' });
      expect(readProtagonistHandoff(world, candidate, predecessor, candidate.openedTick - 1)).toBeUndefined();
    }
  });

  it('round-trips a confirmed shared save without granting scrubbed public practice any reader authority', () => {
    const { world } = competition();
    const genuine = electNativeHandoff(world);
    const original = encodeWorldSave(genuine);
    const practice = handoff(genuine).ties.find(tie => tie.kind === 'practice')!;
    const raw = genuine.events.find(row => row.id === practice.eventId)!;
    expect(raw.dialogue?.kind).toBe('dual_cultivation');
    const ordinary = structuredClone(genuine);
    delete ordinary.events.find(row => row.id === practice.eventId)!.dialogue;
    expect(() => encodeWorldSave(ordinary)).toThrow();

    const preview = prepareShareSavePrivacy(genuine);
    expect(preview).toMatchObject({ status: 'ready', protectedStateVerified: true });
    const copy = buildConfirmedShareSave(genuine, preview)!;
    expect(copy).toBeDefined();
    const restored = decodeWorldSave(copy.json);
    const [previous, candidate] = restored.protagonistSuccession.arcs.slice(-2);
    expect(candidate.handoff).toEqual(handoff(genuine));
    expect(encodeWorldSave(restored)).toBe(copy.json);
    expect(encodeWorldSave(genuine)).toBe(original);
    expect(restored.cultivators.some(row => row.innerMonologue === SHARE_SAVE_REDACTED_TEXT)).toBe(true);
    expect(restored.events.find(row => row.id === practice.eventId)).toMatchObject({ dialogueRedacted: true });
    expect(restored.events.find(row => row.id === practice.eventId)?.dialogue).toBeUndefined();
    expect(readProtagonistHandoff(restored, candidate, previous, restored.tick)).toBeUndefined();
    const advanced = storyTurn(restored, {}, .99);
    expect(advanced.tick).toBe(restored.tick + 1);
    expect(advanced.cultivators.some(row => row.alive && row.innerMonologue !== SHARE_SAVE_REDACTED_TEXT)).toBe(true);
    const continued = reopen(advanced);
    expect(handoff(continued)).toEqual(candidate.handoff);
    expect(continued.events.find(row => row.id === practice.eventId)).toMatchObject({ dialogueRedacted: true });
    const altered = structuredClone(restored);
    altered.events.find(row => row.id === practice.eventId)!.description = 'This is not the native authored practice.';
    expect(() => encodeWorldSave(altered)).toThrow();
    const plaintext = structuredClone(restored);
    plaintext.events.find(row => row.id === practice.eventId)!.dialogue = structuredClone(raw.dialogue);
    expect(() => encodeWorldSave(plaintext)).toThrow();
    const orphan = structuredClone(restored);
    orphan.events.find(row => row.id === candidate.handoff!.exitEventId)!.dialogueRedacted = true;
    expect(() => encodeWorldSave(orphan)).toThrow(/dramaticBonds.facts.redaction/);
    const hidden = structuredClone(restored);
    hidden.events.find(row => row.id === practice.eventId)!.witnessScope = 'participants';
    expect(() => encodeWorldSave(hidden)).toThrow();
  });

  it('refuses foreign exit, different causal closure, duplicate/date-swapped ties, or a recent orphaned native receipt', () => {
    const { world } = competition();
    const genuine = electNativeHandoff(world);
    expect(handoff(genuine).ties).toHaveLength(3);
    const run = (change: (f: WorldState) => void) => {
      const copy = structuredClone(genuine);
      change(copy);
      return () => encodeWorldSave(copy);
    };
    expect(run(w => { handoff(w).exitEventId = handoff(w).ties[2].eventId; })).toThrow(/handoff.exit/);
    expect(run(w => { handoff(w).exitKind = 'ascension'; })).toThrow(/handoff.exit/);
    expect(run(w => { handoff(w).ties[1].kind = handoff(w).ties[0].kind; })).toThrow(/handoff.timeline/);
    expect(run(w => { handoff(w).ties[1].eventId = handoff(w).ties[0].eventId; })).toThrow(/handoff.timeline/);
    expect(run(w => { handoff(w).ties.reverse(); })).toThrow(/handoff.ties/);
    expect(run(w => { handoff(w).ties[2].tick = w.protagonistSuccession.arcs.at(-1)!.openedTick; })).toThrow(/handoff.ties/);
    expect(run(w => { handoff(w).ties[1].siteId = 'loc-secret-1'; })).toThrow(/handoff.ties/);
    expect(run(w => {
      w.dramaticBonds!.facts = w.dramaticBonds!.facts.filter(x => x.sourceEventId !== handoff(w).ties[1].eventId);
    })).toThrow(/handoff.source/);
    expect(run(w => { w.eraHistory.receipts = w.eraHistory.receipts.filter(x => x.eventId !== handoff(w).exitEventId); }))
      .toThrow(/handoff.exit/);
  });

  it('rejects a participant-only replacement or different role even after a genuinely earned appointment', () => {
    const { world, ordinaryContenderId } = competition();
    const genuine = electNativeHandoff(world);
    const foreign = structuredClone(genuine);
    const privateCopy = structuredClone(genuine);
    const [first] = handoff(genuine).ties;
    expect(foreign.events.some(row => row.id === first.eventId)).toBe(true);
    foreign.events.find(row => row.id === first.eventId)!.actorIds[1] = ordinaryContenderId;
    privateCopy.events.find(row => row.id === first.eventId)!.witnessScope = 'participants';
    expect(() => encodeWorldSave(foreign)).toThrow();
    expect(() => encodeWorldSave(privateCopy)).toThrow();
  });

  it('keeps the native stamp after the cited hot tape ages out, without supplying old prose without sources', () => {
    const { world } = competition();
    let ended = electNativeHandoff(world);
    const original = structuredClone(handoff(ended));
    // Exact current pair ages out of the public event ring through ordinary real turns.
    for (let step = 0; step < 28 && ended.events.some(row =>
      original.ties.some(tie => tie.eventId === row.id)); step++) {
      const orders = Object.fromEntries(ended.cultivators.flatMap(person => {
        const peer = ended.cultivators.find(row => row.id !== person.id && row.alive &&
          row.positionPlane === undefined && row.locationId === person.locationId);
        return person.alive && person.positionPlane === undefined && peer
          ? [[person.id, storyPayload('SOCIALIZE', { targetCultivatorId: peer.id })]] : [];
      }));
      ended = storyTurn(ended, orders, .99);
    }
    expect(ended.events.some(row => original.ties.some(tie => tie.eventId === row.id))).toBe(false);
    const loaded = reopen(ended);
    const candidate = loaded.protagonistSuccession.arcs.find(row => row.handoff?.exitEventId === original.exitEventId)!;
    const previous = loaded.protagonistSuccession.arcs.find(row => row.id === candidate.predecessorArcId)!;
    expect(candidate.handoff).toEqual(original);
    const missing = structuredClone(loaded);
    const cited = candidate.handoff!.ties[0].eventId;
    missing.chronicleArchive.anchors = missing.chronicleArchive.anchors.filter(row => row.id !== cited);
    // Detached read probe with the last independent archive copies unavailable. No shape or gameplay changes.
    missing.chronicleArchive.chapters = missing.chronicleArchive.chapters.map(chapter => ({
      ...chapter, anchors: chapter.anchors.filter(row => row.id !== cited),
    }));
    missing.coldHistory = { ...missing.coldHistory, chapters: missing.coldHistory.chapters.map(chapter => ({
      ...chapter, anchors: chapter.anchors.filter(row => row.id !== cited),
    })) };
    const detached = missing.protagonistSuccession.arcs.find(row => row.id === candidate.id)!;
    const detachedPrevious = missing.protagonistSuccession.arcs.find(row => row.id === previous.id)!;
    expect(readProtagonistHandoff(missing, detached, detachedPrevious, missing.tick)).toBeUndefined();
  });
});
