import { expect, it } from 'vitest';
import { createAnomalyStoryFunnel } from '../scripts/anomalyStoryFunnel';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload } from '../src/types/world';

it('distinguishes true three-site receipts from diagnostic contact and rejects a disputed tide', () => {
  const funnel = createAnomalyStoryFunnel();
  let before = createInitialWorld(1, 'spirit-bloom');
  for (let tick = 2; tick <= 45; tick++) {
    const moving = tick === 35 ? 'npc-2' : tick === 37 ? 'npc-3' : undefined;
    const choices: Record<string, LLMDecisionPayload> = Object.fromEntries(before.cultivators.map(row => [
      row.id, row.id === moving ? { chosenAction: 'EXPLORE', targetLocationId: 'loc-market', innerMonologue: '到坊市。' } :
        { chosenAction: 'REST', innerMonologue: '静坐。' },
    ]));
    const after = advanceWorldTick(before, choices, () => .99, 'deferred');
    const turn = { before, after, events: after.events };
    funnel.observe(turn);
    if (tick === 36) {
      expect(funnel.summary().nativeTides).toBeGreaterThan(0);
      expect(funnel.summary().originsWitnessed).toBeGreaterThan(0);
      const origin = after.events.find(row => row.id === 'evt-36-beast-tide-beast-loc-blood')!;
      const disputed = createAnomalyStoryFunnel();
      const events = [...after.events, { ...origin, witnessScope: 'participants' as const }];
      disputed.observe({ before, after: { ...after, events }, events });
      expect(disputed.summary()).toMatchObject({ nativeTides: 0, originsWitnessed: 0 });
    }
    if (tick === 37) expect(funnel.summary().originsReachedTwoSites).toBeGreaterThan(0);
    if (tick === 44) {
      expect(funnel.summary().originsReachedThreeSites).toBe(0);
      expect(funnel.summary().diagnosticThirdSiteContactOriginMonths).toBeGreaterThan(0);
    }
    before = after;
  }
  expect(funnel.summary().originsReachedThreeSites).toBe(1);
  expect(Object.values(funnel.summary()).every(value => typeof value === 'number')).toBe(true);
});
