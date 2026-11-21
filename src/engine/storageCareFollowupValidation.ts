import type { WorldState } from '../types/world';
import { INFIRMARY_MAX_BEDS, INFIRMARY_TREATMENT_HERBS, INFIRMARY_TREATMENT_STONES } from './infirmaryEngine';
import {
  CARE_FOLLOWUP_DELAY_TICKS, CARE_FOLLOWUP_APPOINTMENT_TICKS, CARE_FOLLOWUP_SCHEDULE_WINDOW, CARE_FOLLOWUP_HEAL_FRACTION,
  CARE_FOLLOWUP_DETOX,
} from './careFollowupTerms';

const key = (...parts: (string | number)[]) => JSON.stringify(parts);

export function validateCareFollowupHistory(
  world: WorldState, serviceUses: Set<string>, bedUses: Map<string, number>, fail: (path: string) => never,
): void {
  const { appointments, nextId } = world.careFollowups;
  const people = new Map(world.cultivators.map((actor) => [actor.id, actor]));
  const cases = new Map(world.infirmaries.cases.map((row) => [row.id, row]));
  const shifts = new Map(world.infirmaries.shifts.map((shift) => [shift.id, shift]));
  const sects = new Set(world.sects.map((sect) => sect.id));
  const ids = new Set<string>(), sources = new Set<string>(), admitted = new Set<string>();
  const attendance = new Map<string, { tick: number; sectId: string; siteId: string; patientId: string; guardId: string }>();
  for (const item of appointments) {
    const { id, sourceCaseId, sourceShiftId, sourceGuardId, dischargedTick, patientId, sectId, siteId,
      scheduledTick, dueTick, expiresTick, closure, receipt, status, settledTick } = item;
    const serial = Number(/^care-followup-([1-9]\d*)$/.exec(id)?.[1]);
    const patient = people.get(patientId), original = cases.get(sourceCaseId), source = original?.receipt;
    if (!Number.isSafeInteger(serial) || serial >= nextId || ids.has(id) || sources.has(sourceCaseId) ||
        !patient || !sects.has(sectId) || !people.has(sourceGuardId) || sourceGuardId === patientId ||
        !original || !source || original.status !== 'treated' || original.patientId !== patientId ||
        original.siteId !== siteId || original.sectId !== sectId || original.settledTick !== dischargedTick ||
        source.tick !== dischargedTick || source.shiftId !== sourceShiftId || source.guardId !== sourceGuardId ||
        source.stonesSpent !== INFIRMARY_TREATMENT_STONES || source.herbsSpent !== INFIRMARY_TREATMENT_HERBS ||
        source.hpRestored + source.toxicityRemoved <= 0 || scheduledTick <= dischargedTick ||
        scheduledTick - dischargedTick > CARE_FOLLOWUP_SCHEDULE_WINDOW || scheduledTick > world.tick ||
        dueTick !== scheduledTick + CARE_FOLLOWUP_DELAY_TICKS || expiresTick !== dueTick + CARE_FOLLOWUP_APPOINTMENT_TICKS)
      return fail('careFollowups.appointments.source');
    ids.add(id);
    sources.add(sourceCaseId);
    if ((status === 'scheduled') !== (settledTick === undefined) || (status === 'attended') !== !!receipt ||
        (status === 'closed') !== (closure !== undefined) ||
        (settledTick !== undefined && (settledTick < scheduledTick || settledTick > world.tick || settledTick >= expiresTick)) ||
        (status === 'scheduled' && (world.tick >= expiresTick - 1 || !patient.alive || admitted.has(patientId))) ||
        (status === 'withdrawn' && settledTick! <= scheduledTick) ||
        (status === 'closed' && closure !== 'patient_ineligible' && settledTick !== expiresTick - 1))
      return fail('careFollowups.appointments.lifecycle');
    if (status === 'scheduled') admitted.add(patientId);
    if (!receipt) continue;
    const staff = shifts.get(receipt.shiftId);
    const serviceKey = key(receipt.shiftId, receipt.tick), bedKey = key(sectId, siteId, receipt.tick);
    const beds = (bedUses.get(bedKey) ?? 0) + 1;
    if (receipt.tick !== settledTick || receipt.tick < dueTick || receipt.tick >= expiresTick ||
        receipt.guardId === sourceGuardId || receipt.guardId === patientId ||
        !staff || staff.guardId !== receipt.guardId || staff.sectId !== sectId || staff.siteId !== siteId ||
        staff.startedTick >= receipt.tick || staff.expiresTick <= receipt.tick ||
        (staff.lastServedTick ?? -1) < receipt.tick || staff.lastWithheld?.tick === receipt.tick ||
        serviceUses.has(serviceKey) || beds > INFIRMARY_MAX_BEDS ||
        receipt.hpRestored + receipt.toxicityRemoved <= 0 ||
        receipt.hpRestored > Math.round(receipt.maxHpAtVisit * CARE_FOLLOWUP_HEAL_FRACTION) ||
        receipt.toxicityRemoved > CARE_FOLLOWUP_DETOX)
      return fail('careFollowups.appointments.attendance');
    serviceUses.add(serviceKey);
    bedUses.set(bedKey, beds);
    attendance.set(id, { tick: receipt.tick, siteId, sectId, patientId, guardId: receipt.guardId });
  }
  const journalUses = new Set<string>();
  const completeMonths = new Set<number>();
  for (const month of world.resourceFlow.months) {
    if (month.entries.length === month.totalEntries) completeMonths.add(month.tick);
    for (const entry of month.entries) {
      const stone = entry.reason === 'followup_public_stones', leaf = entry.reason === 'followup_local_leaf';
      if (!stone && !leaf && entry.mechanism !== 'care_followup') continue;
      const attended = attendance.get(entry.refId), ref = key(entry.refId, entry.reason);
      if (!attended || journalUses.has(ref) || entry.mechanism !== 'care_followup' || (!stone && !leaf) ||
          entry.kind !== 'consumption' || entry.tick !== attended.tick ||
          entry.good !== (stone ? 'stone' : 'jade_leaf') || entry.amount !== (stone ? 6 : 1) ||
          entry.from.kind !== (stone ? 'sect' : 'site') || entry.from.id !== (stone ? attended.sectId : attended.siteId) ||
          entry.visibility.kind !== 'participants' || entry.visibility.actorIds.length !== 2 ||
          !entry.visibility.actorIds.includes(attended.patientId) || !entry.visibility.actorIds.includes(attended.guardId))
        return fail('careFollowups.journal.source');
      journalUses.add(ref);
    }
  }
  for (const [id, { tick }] of attendance) if (completeMonths.has(tick) &&
      (!journalUses.has(key(id, 'followup_public_stones')) || !journalUses.has(key(id, 'followup_local_leaf'))))
    return fail('careFollowups.journal.source');
}
