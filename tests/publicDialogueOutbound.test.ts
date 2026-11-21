import { describe, expect, it, vi } from 'vitest';
import { enrichTickDialogues } from '../src/engine/dialogueEngine';
import { llmScheduler } from '../src/engine/llmScheduler';
import type { LLMConfig } from '../src/types/world';
import { publicDialogueProofFixture } from './fixtures/publicDialogueFixture';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'http://127.0.0.1:1', apiKey: 'mock-only', model: 'mock' };

describe('existing optional dialogue enrichment cannot send private or disputed role assignments', () => {
  it('keeps private and incorrect speaker assignments entirely out of the existing model request', async () => {
    const request = vi.spyOn(llmScheduler,'requestJson').mockRejectedValue(new Error('test does not use a provider'));
    try {
      const f = publicDialogueProofFixture();
      const native = structuredClone(f.event);
      f.world.events = [{ ...native, witnessScope: 'participants' }];
      expect(await enrichTickDialogues(f.world,config)).toBe(f.world);
      expect(request).not.toHaveBeenCalled();
      native.dialogue!.turns[0].speakerName = '近名的另一人';
      f.world.events = [native];
      expect(await enrichTickDialogues(f.world,config)).toBe(f.world);
      expect(request).not.toHaveBeenCalled();
    } finally {
      request.mockRestore();
    }
  });
});
