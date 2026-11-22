import { createFastForwardRunner } from '../src/engine/fastForwardEngine';
import { describe, expect, it } from 'vitest';
import { queueGuidedHeartDemonChoice } from '../src/engine/heartDemonEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { actualNativeHeartFrame, trialActor, trialTurn } from './heartDemonNativeFixture';

describe('native heart-demon resolution', () => {
  it('leaves an unchosen guided trial waiting in a real offline worker checkpoint', () => {
    const { frame, trial } = actualNativeHeartFrame();
    const runner = createFastForwardRunner(frame, 2, { now: () => 0 });
    expect(runner.advanceChunk()).toMatchObject({ currentTick: frame.tick + 2, completedTicks: 2 });
    const checkpoint = runner.checkpoint();
    if (!checkpoint) throw new Error('Expected actual completed alternate months');
    const current = trialActor(checkpoint.world);
    expect(current.tribulation).toMatchObject({ id: trial.id, stage: 'heart_demon', lastActedTick: frame.tick });
    expect(current.tribulation?.heartDemon?.queued).toBeUndefined();
    expect(current.tribulation?.heartDemon?.result).toBeUndefined();
    expect(current.destinyTraits).toBeUndefined();
    expect(trialActor(frame).tribulation).toEqual(trial);
  });

  it('can change a survivor’s personality without creating a new faction or a destiny awakening', () => {
    const { frame, trial } = actualNativeHeartFrame();
    const actor = trialActor(frame);
    // Stress a genuine open trial with measured scalar game state, not a made-up choice or result.
    actor.personality = '刚正';
    actor.techniqueMastery = 0;
    actor.karma = -100;
    trial.pressure = 100;
    const pending = queueGuidedHeartDemonChoice(frame, actor.id, trial.id, 'wrath');
    expect(pending).not.toBe(frame);

    const after = trialTurn(pending);
    const survivor = trialActor(after);
    expect(survivor).toMatchObject({ alive: true, realm: '筑基', sectId: actor.sectId, personality: '嗜血' });
    expect(survivor.tribulation?.heartDemon?.result).toMatchObject({
      outcome: 'failed', choice: 'wrath', origin: 'player', damage: actor.hp - survivor.hp,
      personalityBefore: '刚正', personalityAfter: '嗜血',
    });
    expect(survivor.hp).toBeLessThan(actor.hp);
    expect(survivor.destinyTraits).toBeUndefined();
    const saved = encodeEraWorldSave(after);
    expect(encodeEraWorldSave(decodeEraWorldSave(saved))).toBe(saved);
  });
});
