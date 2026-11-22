import { describe, expect, it } from 'vitest';
import { possessAvatar } from '../src/engine/avatarEngine';
import { projectDramaticBondArcs, projectPersonalDramaticBonds } from '../src/engine/dramaticBondEngine';
import { actualCommonBond, actualPrivateBond, bondSite, firstId, secondId } from './dramaticBondNativeFixture';

describe('the personal scroll is never evidence for a public arc', () => {
  it('opens an initiated private act only to the exact current avatar of its initiator', () => {
    const { clash } = actualCommonBond();
    const result = actualPrivateBond(clash);
    const scope = { currentVisibleSiteIds: new Set([bondSite]) };
    const ready = projectDramaticBondArcs(result, scope);
    expect(ready).not.toHaveLength(0);
    expect(projectPersonalDramaticBonds(result, firstId, firstId)).toBeUndefined();

    const initiator = structuredClone(result);
    expect(possessAvatar(initiator, firstId)).toBe(true);
    expect(projectPersonalDramaticBonds(initiator, firstId, firstId)?.scenes).toContainEqual(
      expect.objectContaining({ title: '亲自设局', tick: result.tick }),
    );
    expect(projectPersonalDramaticBonds(initiator, firstId, secondId)).toBeUndefined();
    expect(projectDramaticBondArcs(initiator, scope)).toEqual(ready);

    const target = structuredClone(result);
    expect(possessAvatar(target, secondId)).toBe(true);
    expect(projectPersonalDramaticBonds(target, secondId, secondId)?.scenes.some(scene => scene.title === '亲自设局')).toBe(false);
    expect(projectDramaticBondArcs(target, scope)).toEqual(ready);
  });
});
