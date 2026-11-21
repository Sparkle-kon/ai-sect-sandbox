import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { projectResourceFlowMonth } from '../src/engine/resourceFlowEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import type { WorldState } from '../src/types/world';
import { attendedCareFollowup, careChoice, carePerson, careTurn, scheduledCareFollowup } from './fixtures/careFollowupFixture';

const roundTrip = (world: WorldState) => decodeWorldSave(encodeWorldSave(world));
function tamper(raw: string, edit: (world: WorldState) => void) {
  const parsed = JSON.parse(raw) as { world: WorldState };
  edit(parsed.world);
  return () => decodeWorldSave(JSON.stringify(parsed));
}

describe('follow-up persistence keeps independent clinic proof without rewriting a discharge', () => {
  it('migrates pre-follow-up saves and round-trips the original exact native discharge after actual separate service', () => {
    const old = JSON.parse(encodeWorldSave(createInitialWorld(82))) as { world: Partial<WorldState> };
    delete old.world.careFollowups;
    expect(decodeWorldSave(JSON.stringify(old)).careFollowups).toEqual({ appointments: [], nextId: 1 });
    const f = scheduledCareFollowup(), pending = roundTrip(f.world);
    expect(pending.careFollowups.appointments[0].status).toBe('scheduled');
    const source = pending.infirmaries.cases.find(({ id }) => id === f.sourceCaseId);
    const result = roundTrip(attendedCareFollowup().world);
    expect(result.careFollowups.appointments[0]).toMatchObject({
      status: 'attended', sourceCaseId: f.sourceCaseId, receipt: { guardId: f.guardId, stonesSpent: 6, herbsSpent: 1 },
    });
    expect(result.infirmaries.cases.find(({ id }) => id === f.sourceCaseId)).toEqual(source);
    expect(result.infirmaries.cases).toHaveLength(pending.infirmaries.cases.length);
  });

  it('uses the real visit-era maximum rather than rewriting history after a patient’s maximum changes', () => {
    const f = attendedCareFollowup(), patient = carePerson(f.world, f.patientId);
    const visit = f.world.careFollowups.appointments[0].receipt!;
    const original = f.world.infirmaries.cases.find(({ id }) => id === f.sourceCaseId)?.receipt;
    expect(visit.maxHpAtVisit).toBe(200);
    expect(original?.maxHpAtVisit).toBe(200);
    expect(visit.hpRestored).toBeGreaterThan(20);
    patient.maxHp = 100;
    patient.hp = Math.min(patient.hp, patient.maxHp);
    const imported = roundTrip(f.world);
    expect(imported.careFollowups.appointments[0].receipt).toEqual(visit);
    expect(imported.infirmaries.cases.find(({ id }) => id === f.sourceCaseId)?.receipt).toEqual(original);
  });

  it('rejects recombined source, substituted attendance, early service and misattributed journal lines', () => {
    const f = attendedCareFollowup(), raw = encodeWorldSave(f.world);
    expect(tamper(raw, (world) => { world.careFollowups.appointments[0].sourceCaseId = 'infirmary-case-999'; }))
      .toThrow('careFollowups.appointments.source');
    expect(tamper(raw, (world) => { world.careFollowups.appointments[0].receipt!.guardId = f.sourceGuardId; }))
      .toThrow('careFollowups.appointments.attendance');
    expect(tamper(raw, (world) => { world.careFollowups.appointments[0].receipt!.tick--; }))
      .toThrow('careFollowups.appointments.attendance');
    expect(tamper(raw, (world) => {
      const entry = world.resourceFlow.months.flatMap(({ entries }) => entries)
        .find((row) => row.reason === 'followup_local_leaf')!;
      entry.visibility = { kind: 'participants', actorIds: [f.patientId, f.outsiderId] };
    })).toThrow('careFollowups.journal.source');
    expect(tamper(raw, (world) => { world.careFollowups.appointments = []; })).toThrow('careFollowups.journal.source');
  });

  it('keeps accounting details private even when the observer views aggregate resource totals', () => {
    const f = attendedCareFollowup();
    const ledger = (actorId?: string) => projectResourceFlowMonth(f.world, f.world.tick, actorId
      ? { kind: 'actor', actorId, visibleSiteIds: new Set([f.siteId]) }
      : { kind: 'observer' });
    const details = (actorId?: string) => ledger(actorId)?.rows.filter(({ mechanism }) => mechanism === 'care_followup');
    expect(details(f.patientId)).toHaveLength(2);
    expect(details(f.guardId)).toHaveLength(2);
    expect(details(f.sourceGuardId)).toEqual([]);
    expect(details(f.outsiderId)).toEqual([]);
    expect(details()).toEqual([]);
    expect(ledger()?.totals.find(({ good }) => good === 'stone')?.consumption).toBeGreaterThanOrEqual(6);
  });

  it('round-trips a terminal no-staff window with no new service, and a separately confirmed voluntary withdrawal', () => {
    const f = scheduledCareFollowup(), prior = careTurn(careTurn(f.world));
    carePerson(prior, f.patientId).hp = 60;
    const noStaff = roundTrip(careTurn(prior));
    expect(noStaff.careFollowups.appointments[0]).toMatchObject({
      status: 'closed', settledTick: noStaff.tick, closure: 'staff_unavailable',
    });
    expect(noStaff.careFollowups.appointments[0].receipt).toBeUndefined();
    expect(noStaff.resourceFlow.months.flatMap(({ entries }) => entries).some(({ mechanism }) => mechanism === 'care_followup')).toBe(false);
    const withdrawn = roundTrip(careTurn(f.world, { [f.patientId]: careChoice('withdraw', f.id) }));
    expect(withdrawn.careFollowups.appointments[0]).toMatchObject({ status: 'withdrawn' });
    expect(withdrawn.infirmaries.cases).toEqual(f.world.infirmaries.cases);
  });
});
