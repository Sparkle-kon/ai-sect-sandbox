import { expect, it } from 'vitest';
import { projectDirectorHighlight, resolveDirectorHighlight } from '../src/engine/director/directorHighlights';
import { heartDemonResultEventId } from '../src/engine/heartDemonEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { configureStoryteller } from '../src/engine/storytellerDirector';
import { actualNativeHeartFrame, trialActor, trialTurn, focusTrial } from './heartDemonNativeFixture';

it('resolves an exact unguided heart trial through the director and preserves only its authenticated receipt', () => {
  const { lastLightning } = actualNativeHeartFrame(false);
  expect(configureStoryteller(lastLightning, 'great_calamity', trialActor(lastLightning).id)).toBe(true);
  const opened = trialTurn(lastLightning, { ...focusTrial, tribulationStance: 'guard' });
  const actor = trialActor(opened);
  const frame = actor.tribulation?.heartDemon;
  expect(frame).toBeDefined();
  const offer = projectDirectorHighlight(opened, actor);
  expect(offer?.kind).toBe('heart_demon');
  const queued = resolveDirectorHighlight(opened, offer!.key, 'sever');
  expect(queued).not.toBe(opened);
  const queuedBytes = encodeEraWorldSave(queued);
  const done = trialTurn(decodeEraWorldSave(queuedBytes));
  const proofId = heartDemonResultEventId(frame!.id);
  const result = trialActor(done).tribulation?.heartDemon?.result;
  expect(result).toMatchObject({ origin: 'director', choice: 'sever', resolvedTick: frame!.openedTick + 1 });
  expect(done.storyteller?.highlights?.find(row => row.sourceId === frame!.id)).toMatchObject({
    actorId: actor.id, chosen: 'sever', resolutionTick: done.tick, resolutionEventId: proofId,
  });
  const restored = decodeEraWorldSave(encodeEraWorldSave(done));
  expect(trialActor(restored).tribulation?.heartDemon?.result).toEqual(result);
  const forged = structuredClone(done);
  forged.storyteller!.highlights!.find(row => row.sourceId === frame!.id)!.sourceId = 'substituted-frame';
  expect(() => encodeEraWorldSave(forged)).toThrow(/heartDemon.result/u);
});
