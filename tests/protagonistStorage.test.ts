import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableChronicleChapter, resolveChronicleChapter, stampedChronicleLead } from '../src/engine/novelGenerator';
import { projectProtagonistSuccession } from '../src/engine/protagonistSuccession';
import { buildConfirmedShareSave, prepareShareSavePrivacy } from '../src/engine/shareSavePrivacy';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import type { WorldState } from '../src/types/world';
import { earnedProtagonistStory, fallenProtagonistStory } from './fixtures/protagonistSuccessionFixture';

function alter(raw: string, edit: (world: WorldState) => void) {
  const parsed: { world: WorldState } = JSON.parse(raw);
  edit(parsed.world);
  return () => decodeWorldSave(JSON.stringify(parsed));
}
function withActualMarkedChapter() {
  const f = earnedProtagonistStory();
  const closed = f.world.tick - 1;
  const plan = availableChronicleChapter(f.world, true, closed);
  expect(plan?.storyFocal?.kind).toBe('lead');
  if (!plan) throw new Error('fixture actual closed chapter');
  const chapter = resolveChronicleChapter(f.world, plan, undefined, closed);
  if (!chapter) throw new Error('fixture writes exact native plan once');
  return { ...f, chapter };
}

describe('archived protagonists use their original checked public arc and chapter identities', () => {
  it('migrates older saves and strictly loads the true earned same-name successors as separate arcs', () => {
    const old: { world: Partial<WorldState> } = JSON.parse(encodeWorldSave(createInitialWorld(123)));
    delete old.world.protagonistSuccession;
    expect(decodeWorldSave(JSON.stringify(old)).protagonistSuccession).toEqual({ arcs: [] });
    const f = fallenProtagonistStory(), world = decodeWorldSave(encodeWorldSave(f.world));
    const view = projectProtagonistSuccession(world);
    expect(view.archived[0]).toMatchObject({ actorId: f.leadId, closeReason: 'public_death' });
    expect(view.active).toMatchObject({ actorId: f.successorId, predecessorArcId: view.archived[0].id });
    expect(view.active?.name).toBe(view.archived[0].name);
    expect(projectProtagonistSuccession(world, f.deathTick - 1).active?.actorId).toBe(f.leadId);
  });

  it('rejects fabricated opening period, same-name actor substitution, missing death and future authored lead', () => {
    const f = fallenProtagonistStory(), raw = encodeWorldSave(f.world);
    expect(alter(raw, (s) => { s.protagonistSuccession.arcs[0].opening[1].tick = s.protagonistSuccession.arcs[0].opening[0].tick; }))
      .toThrow('protagonistSuccession.arcs.opening');
    expect(alter(raw, (s) => { s.protagonistSuccession.arcs[0].actorId = f.successorId; }))
      .toThrow('protagonistSuccession.arcs.proofSource');
    expect(alter(raw, (s) => { delete s.protagonistSuccession.arcs[0].death; }))
      .toThrow('protagonistSuccession.arcs.timeline');
    const marked = withActualMarkedChapter();
    expect(alter(encodeWorldSave(marked.world), (s) => {
      const chapter = s.chronicleArchive.chapters[0];
      if (chapter.storyFocal?.kind === 'lead') chapter.storyFocal.arcId = 'protagonist-arc-999';
    })).toThrow('chronicleArchive.chapter.storyFocal');
  });

  it('preserves linked episode identities in a strict privacy copy without restoring old dialogue or body', () => {
    const f = withActualMarkedChapter(), native = encodeWorldSave(f.world);
    const reviewed = prepareShareSavePrivacy(f.world);
    expect(reviewed.status).toBe('ready');
    const shared = buildConfirmedShareSave(f.world, reviewed);
    if (!shared) throw new Error('fixture produces exact confirmed privacy copy');
    const decoded = decodeWorldSave(shared.json);
    const chapter = decoded.chronicleArchive.chapters[0];
    expect(chapter.storyFocal).toEqual(f.chapter.storyFocal);
    expect(stampedChronicleLead(chapter)?.actorId).toBe(f.leadId);
    expect(chapter.anchors.some(({ dialogue }) => dialogue !== undefined)).toBe(false);
    expect(chapter.body).not.toEqual(f.chapter.body);
    expect(encodeWorldSave(f.world)).toBe(native);
  });
});
