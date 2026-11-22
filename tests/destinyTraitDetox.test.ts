import { describe, expect, it } from 'vitest';
import { activeDestinyTraitOffer, resolveGuidedDestinyTrait } from '../src/engine/destinyTraitEngine';
import { actualDestinyOrdinary, destinyActor, destinyMonth } from './destinyTraitNativeFixture';

describe('丹毒化灵', () => {
  it('reduces only the held real toxicity during native cultivation and never pushes it below zero', () => {
    const { advanced } = actualDestinyOrdinary(1);
    const offer = activeDestinyTraitOffer(advanced, destinyActor(advanced));
    expect(offer?.options).toContain('alchemy-poison-transmutation');
    if (!offer) throw new Error('Expected the native breakthrough offer');
    const trained = resolveGuidedDestinyTrait(advanced, offer.id, 'alchemy-poison-transmutation');
    const other = resolveGuidedDestinyTrait(advanced, offer.id, 'star-reforged-bones');
    expect(trained).not.toBe(advanced);
    expect(other).not.toBe(advanced);
    const practice = (world: typeof advanced) => destinyActor(destinyMonth(world, {
      chosenAction: 'CULTIVATE', innerMonologue: '运气走完一周天。',
    }));
    destinyActor(trained).pillToxicity = 6;
    destinyActor(other).pillToxicity = 6;
    expect(practice(trained).pillToxicity).toBe(1);
    expect(practice(other).pillToxicity).toBe(4);
    destinyActor(trained).pillToxicity = 3;
    destinyActor(other).pillToxicity = 3;
    expect(practice(other).pillToxicity).toBe(1);
    expect(practice(trained).pillToxicity).toBe(0);
  });
});
