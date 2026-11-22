import { describe, expect, it } from 'vitest';
import { advancedPassageMotion, type PassageMotionFrame } from '../src/components/useUpperPassageScrollMotion';

function frame(tick: number, sourceId?: string): PassageMotionFrame {
  return { scope: 'branch:map', actorId: 'body', tick, snapshot: {}, sourceId, historical: false };
}

describe('upper passage artwork follows actual new consecutive turn evidence, never a view change', () => {
  it('can play a physical retreat, stays still when someone else reopens the route, then plays crossing and return', () => {
    const t20 = frame(20);
    const t21 = frame(21, 'actually-left-upper-gate');
    const t22 = frame(22); // The new opening is an option, not a step by this body.
    const t23 = frame(23, 'actually-stepped-the-throat');
    const t24 = frame(24, 'actually-returned-the-body');
    expect([advancedPassageMotion(t20, t21), advancedPassageMotion(t21, t22),
      advancedPassageMotion(t22, t23), advancedPassageMotion(t23, t24)]).toEqual([true, false, true, true]);
  });

  it('keeps a freshly loaded same-date receipt, old source, changed actor, workspace, date or branch static', () => {
    const before = frame(23, 'old-crossing');
    const post = frame(24, 'new-return');
    expect(advancedPassageMotion(undefined, post)).toBe(false);
    expect(advancedPassageMotion(before, { ...post, actorId: 'observer' })).toBe(false);
    expect(advancedPassageMotion(before, { ...post, scope: 'branch:world' })).toBe(false);
    expect(advancedPassageMotion(before, { ...post, scope: 'sibling:map' })).toBe(false);
    expect(advancedPassageMotion(before, { ...post, tick: 25 })).toBe(false);
    expect(advancedPassageMotion(before, { ...post, historical: true })).toBe(false);
    expect(advancedPassageMotion({ ...before, historical: true }, post)).toBe(false);
    expect(advancedPassageMotion(before, { ...post, sourceId: before.sourceId })).toBe(false);
    expect(advancedPassageMotion(before, { ...post, snapshot: before.snapshot })).toBe(false);
    expect(advancedPassageMotion(post, { ...post, snapshot: {}, scope: 'branch:story' })).toBe(false);
    expect(advancedPassageMotion({ ...post, scope: 'branch:story' }, post)).toBe(false);
  });
});
