import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { damageAssuranceImpactKey, damageAssuranceRemaining, damageAssuranceWorkKey } from '../src/engine/damageAssuranceEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import type { WorldState } from '../src/types/world';
import {
  assuranceCase, assuranceChoice, assuranceTurn, nativeSafetyChoice, paidDamageAssurance, sealedDamageAssurance,
} from './fixtures/damageAssuranceFixture';

const roundTrip = (world: WorldState) => decodeWorldSave(encodeWorldSave(world));
function tamper(raw: string, edit: (world: WorldState) => void) {
  const parsed = JSON.parse(raw) as { world: WorldState };
  edit(parsed.world);
  return () => decodeWorldSave(JSON.stringify(parsed));
}

describe('local furnace restitution cross-checks the single original impact and each actual work receipt', () => {
  it('migrates older saves and reimports a real lesser shortfall even after native reopening', () => {
    const old = JSON.parse(encodeWorldSave(createInitialWorld(93))) as { world: Partial<WorldState> };
    delete old.world.damageAssurance;
    expect(decodeWorldSave(JSON.stringify(old)).damageAssurance).toEqual({ claims: [] });
    const f = paidDamageAssurance(2), restored = roundTrip(f.world), claim = restored.damageAssurance.claims[0];
    expect(claim.initialLoss).toBe(40);
    expect(claim.contributions[0]).toMatchObject({ creditedPoints: 30, stonesSpent: 8, rootsSpent: 2 });
    expect(assuranceCase(restored, f.caseId).receipts[1].assuranceClaimId).toBe(claim.id);
    const reopened = roundTrip(assuranceTurn(restored, { [f.actorId]: nativeSafetyChoice('reopen', f.caseId) }));
    expect(reopened.damageAssurance.claims[0]).toMatchObject({ status: 'closed', closure: 'native_reopened', closedTick: reopened.tick });
    expect(damageAssuranceRemaining(reopened.damageAssurance.claims[0])).toBe(10);
  });

  it('rejects edited losses, plain or orphan repairs, and duplicate copied branch custody', () => {
    const f = paidDamageAssurance(), raw = encodeWorldSave(f.world);
    expect(tamper(raw, (s) => { s.damageAssurance.claims[0].initialLoss++; })).toThrow('damageAssurance.claims.source');
    expect(tamper(raw, (s) => { s.damageAssurance.claims[0].contributions[0].creditedPoints--; })).toThrow('damageAssurance.claims.work');
    expect(tamper(raw, (s) => { delete assuranceCase(s, f.caseId).receipts[1].assuranceClaimId; })).toThrow('damageAssurance.claims.work');
    expect(tamper(raw, (s) => { s.damageAssurance.claims[0].contributions = []; })).toThrow('damageAssurance.nativeWork');
    expect(tamper(raw, (s) => { s.damageAssurance.claims.push(structuredClone(s.damageAssurance.claims[0])); }))
      .toThrow('damageAssurance.claims.source');
  });

  it('uses authenticated impact/work keys across separate branch replays but will not credit a plain-work branch', () => {
    const f = sealedDamageAssurance(2);
    const atFork = encodeWorldSave(f.world);
    const cover = roundTrip(assuranceTurn(decodeWorldSave(atFork), { [f.actorId]: assuranceChoice('make_good', f.claimId) }));
    const routine = roundTrip(assuranceTurn(decodeWorldSave(atFork), { [f.actorId]: nativeSafetyChoice('repair', f.caseId) }));
    const real = cover.damageAssurance.claims[0], ordinary = routine.damageAssurance.claims[0];
    expect(damageAssuranceImpactKey(real)).toBe(damageAssuranceImpactKey(ordinary));
    expect(assuranceCase(cover, f.caseId).integrity).toBe(assuranceCase(routine, f.caseId).integrity);
    expect(ordinary.contributions).toEqual([]);
    expect(damageAssuranceRemaining(ordinary)).toBe(40);
    expect(damageAssuranceRemaining(real)).toBe(10);
    expect(tamper(encodeWorldSave(routine), (s) => { s.damageAssurance.claims[0].contributions = structuredClone(real.contributions); }))
      .toThrow('damageAssurance.claims.work');
    const replay = assuranceTurn(decodeWorldSave(atFork), { [f.actorId]: assuranceChoice('make_good', f.claimId) });
    const again = replay.damageAssurance.claims[0];
    expect(damageAssuranceWorkKey(real, real.contributions[0])).toBe(damageAssuranceWorkKey(again, again.contributions[0]));
    expect(decodeWorldSave(atFork).damageAssurance.claims[0].contributions).toEqual([]);
  });
});
