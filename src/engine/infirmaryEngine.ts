import type { Cultivator, InfirmaryCase, InfirmaryClosureReason, InfirmaryMove, InfirmaryShift, InfirmaryState, LLMDecisionPayload,
  LocationNode, Sect, WorldEvent, WorldState } from '../types/world';
import { pilgrimageCheckpoint } from './pilgrimageEngine';

export const INFIRMARY_TREATMENT_STONES = 12;
export const INFIRMARY_TREATMENT_HERBS = 2;
export const INFIRMARY_QUEUE_TICKS = 6;
export const INFIRMARY_SHIFT_TICKS = 3;
export const INFIRMARY_HEAL_FRACTION = .55;
export const INFIRMARY_DETOX_MAX = 10;
export const INFIRMARY_PATIENT_THRESHOLD = .70;
export const INFIRMARY_GUARD_THRESHOLD = .75;
export const INFIRMARY_MAX_BEDS = 2;
const CASE_HISTORY = 64;
const SHIFT_HISTORY = 32;
const RETRY_WAIT = 2;

export interface InfirmaryOption {
  action: 'INFIRMARY';
  infirmaryMove: InfirmaryMove;
  targetInfirmaryCaseId?: string;
}
export interface InfirmaryCapacity { beds: number; onDuty: number; stocked: number; available: number }
export interface InfirmaryView {
  sectId: string;
  siteId: string;
  capacity?: InfirmaryCapacity;
  ownCases: InfirmaryCase[];
  ownShift?: InfirmaryShift;
  ownQueuePosition?: number;
}

export const createInfirmaryState = (): InfirmaryState => ({ cases: [], shifts: [], nextId: 1 });
const live = (actor: Cultivator | undefined): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const findActor = (world: WorldState, id: string) => world.cultivators.find((actor) => actor.id === id);
const health = (actor: Cultivator) => actor.hp / Math.max(1, actor.maxHp);
const injured = (actor: Cultivator) => health(actor) <= INFIRMARY_PATIENT_THRESHOLD;

function clinicSite(world: WorldState, sect: Sect): LocationNode | undefined {
  if (sect.facilities.alchemy_hall < 1 || world.relocations.plans.some((plan) => plan.sectId === sect.id && plan.status === 'in_transit')) return undefined;
  return world.locations.find((site) => site.id === sect.headquartersId && site.type !== 'secret_realm' &&
    (!site.ownerSectId || site.ownerSectId === sect.id));
}

function present(world: WorldState, actor: Cultivator | undefined, sect: Sect, locationId: string): actor is Cultivator {
  return live(actor) && actor.sectId === sect.id && actor.locationId === locationId && !pilgrimageCheckpoint(world, actor) &&
    !world.relocations.plans.some((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(actor.id)) &&
    !world.escorts.contracts.some((deal) => deal.status === 'active' && deal.escortId === actor.id) &&
    !world.sieges.some((siege) => (siege.status === 'marching' || siege.status === 'sieging') && siege.participantIds.includes(actor.id)) &&
    !world.occasions.some((occasion) => (occasion.status === 'registration' || occasion.status === 'running') && occasion.participantIds.includes(actor.id)) &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon';
}

function guardAvailable(world: WorldState, actor: Cultivator | undefined, sect: Sect, siteId: string): actor is Cultivator {
  return present(world, actor, sect, siteId) && actor.id !== sect.leaderId && health(actor) >= INFIRMARY_GUARD_THRESHOLD &&
    !(actor.guardAssignment && actor.guardAssignment.locationId !== siteId && actor.guardAssignment.assignedTick <= world.tick &&
      actor.guardAssignment.expiresTick > world.tick);
}

const effectualShift = (world: WorldState, shift: InfirmaryShift) =>
  shift.startedTick <= world.tick && shift.expiresTick > world.tick;
const liveCase = (world: WorldState, request: InfirmaryCase) => request.status === 'waiting' &&
  request.queuedTick <= world.tick && request.expiresTick > world.tick;

function planClinic(world: WorldState, sect: Sect, site: LocationNode) {
  const beds = Math.min(INFIRMARY_MAX_BEDS, Math.floor(sect.facilities.alchemy_hall));
  const shifts = world.infirmaries.shifts.filter((shift) => shift.sectId === sect.id && shift.siteId === site.id && effectualShift(world, shift));
  const stationed = shifts.filter((shift) => guardAvailable(world, findActor(world, shift.guardId), sect, site.id))
    .sort((a, b) => a.startedTick - b.startedTick || a.guardId.localeCompare(b.guardId));
  const onDuty = stationed.filter((shift) => shift.startedTick < world.tick);
  const availableShifts = onDuty.filter((shift) => shift.lastServedTick !== world.tick);
  const served = world.infirmaries.cases.filter((row) => row.sectId === sect.id && row.siteId === site.id && row.receipt?.tick === world.tick).length;
  const stocked = Math.max(0, Math.min(beds, Math.floor(sect.spiritStones / INFIRMARY_TREATMENT_STONES),
    Math.floor(site.herbs.jade_leaf / INFIRMARY_TREATMENT_HERBS)));
  const available = Math.max(0, Math.min(beds - served, stocked, availableShifts.length));
  const capacity: InfirmaryCapacity = { beds, onDuty: onDuty.length, stocked, available };
  const patients = world.infirmaries.cases.flatMap((row) => {
    if (row.sectId !== sect.id || row.siteId !== site.id || !liveCase(world, row) || row.queuedTick >= world.tick) return [];
    const patient = findActor(world, row.patientId);
    return present(world, patient, sect, site.id) && injured(patient) ? [{ row, patient }] : [];
  }).sort((a, b) => health(a.patient) - health(b.patient) || a.patient.spiritStones - b.patient.spiritStones ||
    a.row.queuedTick - b.row.queuedTick || a.patient.id.localeCompare(b.patient.id));
  return { capacity, scheduledShifts: shifts.length, availableShifts, patients };
}

export function infirmaryCapacity(world: WorldState, sectId: string): InfirmaryCapacity {
  const sect = world.sects.find(({ id }) => id === sectId);
  const site = sect && clinicSite(world, sect);
  return sect && site ? planClinic(world, sect, site).capacity : { beds: 0, onDuty: 0, stocked: 0, available: 0 };
}

export function visibleInfirmaries(world: WorldState, viewer?: Cultivator): InfirmaryView | undefined {
  const actor = viewer && findActor(world, viewer.id);
  if (!actor) return undefined;
  const ownCases = world.infirmaries.cases.filter((row) => row.patientId === actor.id && row.queuedTick <= world.tick)
    .map((row) => ({ ...row, ...(row.receipt ? { receipt: { ...row.receipt } } : {}) }));
  const latestShift = world.infirmaries.shifts.filter((row) => row.guardId === actor.id && row.startedTick <= world.tick).at(-1);
  const ownShift = latestShift && { ...latestShift };
  const sect = world.sects.find(({ id }) => id === actor.sectId);
  const clinic = sect && clinicSite(world, sect);
  if (sect && clinic && present(world, actor, sect, clinic.id)) {
    const plan = planClinic(world, sect, clinic);
    const rank = plan.patients.findIndex(({ patient }) => patient.id === actor.id);
    return { sectId: sect.id, siteId: clinic.id, capacity: plan.capacity, ownCases, ownShift, ...(rank >= 0 ? { ownQueuePosition: rank + 1 } : {}) };
  }
  const saved = ownCases.at(-1) ?? ownShift;
  return saved && { sectId: saved.sectId, siteId: saved.siteId, ownCases, ownShift };
}

export function availableInfirmaryActions(actor: Cultivator, world: WorldState): InfirmaryOption[] {
  if (!world.cultivators.includes(actor)) return [];
  const request = world.infirmaries.cases.find((row) => row.patientId === actor.id && liveCase(world, row));
  const options: InfirmaryOption[] = [];
  // Consent can be withdrawn while the record is valid, even if the requester has already left the clinic.
  if (request && live(actor)) options.push({ action: 'INFIRMARY', infirmaryMove: 'refuse', targetInfirmaryCaseId: request.id });
  const sect = world.sects.find(({ id }) => id === actor.sectId);
  const site = sect && clinicSite(world, sect);
  if (!sect || !site || !present(world, actor, sect, site.id)) return options;
  const plan = planClinic(world, sect, site);
  if (request) {
    const rank = plan.patients.findIndex(({ row }) => row.id === request.id);
    if (rank >= 0 && rank < plan.capacity.available) options.push({ action: 'INFIRMARY', infirmaryMove: 'accept', targetInfirmaryCaseId: request.id });
    return options;
  }
  const latest = world.infirmaries.cases.filter((row) => row.patientId === actor.id && row.settledTick !== undefined).at(-1);
  if (injured(actor) && !(latest?.settledTick !== undefined && world.tick - latest.settledTick < RETRY_WAIT)) {
    options.push({ action: 'INFIRMARY', infirmaryMove: 'request' });
  }
  const alreadyShifted = world.infirmaries.shifts.some((row) => row.guardId === actor.id && effectualShift(world, row));
  if (!alreadyShifted && guardAvailable(world, actor, sect, site.id) && plan.scheduledShifts < plan.capacity.beds) {
    options.push({ action: 'INFIRMARY', infirmaryMove: 'staff' });
  }
  return options;
}

function event(world: WorldState, id: string, title: string, description: string, actorIds: string[], locationId?: string): WorldEvent {
  return { id: `evt-${id}`, title, description, actorIds, locationId, tick: world.tick, year: world.year, month: world.month,
    category: 'diplomacy', witnessScope: 'participants' };
}

const closure: Record<InfirmaryClosureReason, string> = {
  expiry: '候诊期已满，未接受治疗，未消耗公库或药材。',
  ineligible: '病人离开实际本门静养点、原静养点失效或已不能接受治疗；未扣治疗费用。',
  recovered: '等待者已自行恢复，结束候诊，不扣治疗费用。',
  refused: '本人拒绝或撤回候诊；未施治、未扣费用。',
};

export function resolveInfirmaryAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'INFIRMARY') return null;
  const option = availableInfirmaryActions(actor, world).find((row) =>
    row.infirmaryMove === decision.infirmaryMove && row.targetInfirmaryCaseId === decision.targetInfirmaryCaseId);
  if (!option) return null;
  const state = world.infirmaries;
  if (option.infirmaryMove === 'refuse') {
    const row = state.cases.find(({ id }) => id === option.targetInfirmaryCaseId)!;
    row.status = 'refused';
    row.settledTick = world.tick;
    row.reason = 'refused';
    return event(world, `${row.id}-refused`, '本人撤回静养候诊', closure.refused, [actor.id]);
  }
  const sect = world.sects.find(({ id }) => id === actor.sectId)!;
  const site = clinicSite(world, sect)!;
  if (option.infirmaryMove === 'request') {
    const id = `infirmary-case-${state.nextId++}`;
    state.cases.push({ id, patientId: actor.id, sectId: sect.id, siteId: site.id,
      queuedTick: world.tick, expiresTick: world.tick + INFIRMARY_QUEUE_TICKS, status: 'waiting' });
    return event(world, id, '本人申请静养候诊', '本轮仅登记，待下一轮按伤势、财力与等待顺位评估，不会代替本人同意治疗。', [actor.id], site.id);
  }
  if (option.infirmaryMove === 'staff') {
    const id = `infirmary-shift-${state.nextId++}`;
    state.shifts.push({ id, guardId: actor.id, sectId: sect.id, siteId: site.id,
      startedTick: world.tick, expiresTick: world.tick + INFIRMARY_SHIFT_TICKS });
    return event(world, id, '同门自愿值守静养床', '下轮起须本人仍健康在场方可护诊，一位值守每轮至多服务一张床。', [actor.id], site.id);
  }
  const row = state.cases.find((item) => item.id === option.targetInfirmaryCaseId)!;
  const plan = planClinic(world, sect, site);
  const rank = plan.patients.findIndex((item) => item.row.id === row.id);
  if (rank < 0 || rank >= plan.capacity.available) return null;
  const shift = plan.availableShifts[rank];
  const hpRestored = Math.min(actor.maxHp - actor.hp, Math.round(actor.maxHp * INFIRMARY_HEAL_FRACTION));
  const toxicityRemoved = Math.min(INFIRMARY_DETOX_MAX, actor.pillToxicity);
  sect.spiritStones -= INFIRMARY_TREATMENT_STONES;
  site.herbs.jade_leaf -= INFIRMARY_TREATMENT_HERBS;
  actor.hp += hpRestored;
  actor.pillToxicity -= toxicityRemoved;
  shift.lastServedTick = world.tick;
  row.status = 'treated';
  row.settledTick = world.tick;
  row.receipt = { guardId: shift.guardId, shiftId: shift.id, tick: world.tick, stonesSpent: INFIRMARY_TREATMENT_STONES,
    herbsSpent: INFIRMARY_TREATMENT_HERBS, hpRestored, toxicityRemoved };
  return event(world, `${row.id}-treated`, '本人同意接受静养救治', `实耗公库${INFIRMARY_TREATMENT_STONES}灵石及地库${INFIRMARY_TREATMENT_HERBS}翡翠灵叶，实际恢复${hpRestored}气血，清除${toxicityRemoved}点丹毒。`,
    [actor.id, shift.guardId], site.id);
}

export function advanceInfirmaries(world: WorldState): WorldEvent[] {
  const state = world.infirmaries;
  const events: WorldEvent[] = [];
  if (!state.cases.length && !state.shifts.length) return events;
  for (const row of state.cases) {
    if (row.status !== 'waiting' || row.queuedTick > world.tick) continue;
    const sect = world.sects.find(({ id }) => id === row.sectId);
    const site = sect && clinicSite(world, sect);
    const patient = findActor(world, row.patientId);
    const reason: InfirmaryClosureReason | undefined = world.tick >= row.expiresTick ? 'expiry' :
      !sect || site?.id !== row.siteId || !present(world, patient, sect, row.siteId) ? 'ineligible' :
      !injured(patient) ? 'recovered' : undefined;
    if (!reason) continue;
    row.status = 'closed';
    row.settledTick = world.tick;
    row.reason = reason;
    events.push(event(world, `${row.id}-${reason}`, '静养候诊结束', closure[reason], [row.patientId]));
  }
  const keepCases = new Set(state.cases.filter((row) => row.status !== 'waiting').sort((a, b) => (a.settledTick ?? 0) - (b.settledTick ?? 0))
    .slice(-CASE_HISTORY).map(({ id }) => id));
  state.cases = state.cases.filter((row) => row.status === 'waiting' || keepCases.has(row.id) ||
    (row.settledTick !== undefined && world.tick - row.settledTick < RETRY_WAIT));
  const protectedShifts = new Set(state.cases.flatMap(({ receipt }) => receipt ? [receipt.shiftId] : []));
  const keepShifts = new Set(state.shifts.filter((row) => row.expiresTick <= world.tick).slice(-SHIFT_HISTORY).map(({ id }) => id));
  state.shifts = state.shifts.filter((row) => row.expiresTick > world.tick || protectedShifts.has(row.id) || keepShifts.has(row.id));
  return events;
}
