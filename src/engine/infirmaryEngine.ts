import { hasCohortStaffedDuty } from './apprenticeCohortEngine';
import { hasDueObservatoryDuty } from './staffedDutyEngine';
import { isRetiredFromService } from './serviceRetirementEngine';
import type { Cultivator, InfirmaryCase, InfirmaryClosureReason, InfirmaryMove, InfirmaryShift, InfirmaryState, LLMDecisionPayload,
  LocationNode, Sect, StaffedDutyKind, WorldEvent, WorldState } from '../types/world';
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
  ownDutyDisposition?: 'handoff_available' | 'waiting_conflict';
}

export const createInfirmaryState = (): InfirmaryState => ({ cases: [], shifts: [], nextId: 1 });
const live = (actor: Cultivator | undefined): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const findActor = (world: WorldState, id: string) => world.cultivators.find((actor) => actor.id === id);
const health = (actor: Cultivator) => actor.hp / Math.max(1, actor.maxHp);
const injured = (actor: Cultivator) => health(actor) <= INFIRMARY_PATIENT_THRESHOLD;

function clinicSite(world: WorldState, sect: Sect): LocationNode | undefined {
  if (sect.facilities.alchemy_hall < 1 || world.relocations.plans.some((plan) => plan.sectId === sect.id && plan.status === 'in_transit')) return undefined;
  return world.locations.find((site) => site.id === sect.headquartersId && site.type !== 'secret_realm' && site.type !== 'abyss' &&
    (!site.ownerSectId || site.ownerSectId === sect.id));
}

function present(world: WorldState, actor: Cultivator | undefined, sect: Sect, locationId: string,
  tick = world.tick): actor is Cultivator {
  return live(actor) && actor.sectId === sect.id && actor.locationId === locationId && !pilgrimageCheckpoint(world, actor) &&
    !world.pilgrimages.journeys.some(row => (row.organizerId === actor.id || row.companionId === actor.id) &&
      (row.status === 'active' || row.startedTick === tick || row.lastMovedTick === tick)) &&
    !world.couriers.dispatches.some(row => row.courierId === actor.id && (row.status === 'in_transit' || row.status === 'returning' ||
      row.acceptedTick !== undefined && (row.acceptedTick === tick || row.lastAdvancedTick === tick || row.settledTick === tick))) &&
    !world.relocations.plans.some((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(actor.id)) &&
    !world.boundaryReliefs.cases.some(row => row.incomingId === actor.id && (row.status === 'travelling' || row.status === 'returning')) &&
    !world.escorts.contracts.some((deal) => deal.status === 'active' && deal.escortId === actor.id) &&
    !world.sieges.some((siege) => (siege.status === 'marching' || siege.status === 'sieging') && siege.participantIds.includes(actor.id)) &&
    !world.occasions.some((occasion) => (occasion.status === 'registration' || occasion.status === 'running') &&
      occasion.participantIds.includes(actor.id) && !world.expeditionRescues.requests.some(row =>
        row.occasionId === occasion.id && row.arrivedIds?.includes(actor.id))) &&
    !world.expeditionRescues.requests.some(row => row.gateSiteId === locationId && (row.explorerId === actor.id || row.rescuerId === actor.id) &&
      row.supplySpent === 1 && (row.status === 'extracting' || row.status === 'interrupted' && row.pathIndex > 0 &&
        !row.arrivedIds?.includes(actor.id) && world.occasions.some(occasion => occasion.id === row.occasionId && occasion.status === 'running'))) &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon';
}

function guardAvailable(world: WorldState, actor: Cultivator | undefined, sect: Sect, siteId: string, tick: number): actor is Cultivator {
  return present(world, actor, sect, siteId, tick) && !isRetiredFromService(actor) && actor.id !== sect.leaderId &&
    health(actor) >= INFIRMARY_GUARD_THRESHOLD &&
    !(actor.guardAssignment && actor.guardAssignment.locationId !== siteId && actor.guardAssignment.assignedTick <= tick &&
      actor.guardAssignment.expiresTick > tick);
}

const effectualShift = (shift: InfirmaryShift, tick: number) => shift.startedTick <= tick && shift.expiresTick > tick;
const liveCase = (request: InfirmaryCase, tick: number) => request.status === 'waiting' &&
  request.queuedTick <= tick && request.expiresTick > tick;
const ascii = (a:string,b:string) => a < b ? -1 : a > b ? 1 : 0;

interface StaffAllocation {
  primaryId: string;
  conflict?: StaffedDutyKind;
  replacementId?: string;
}
interface ClinicAllocation {
  siteId: string;
  cases: Map<string,StaffAllocation>;
}
type ClinicTurn = {tick:number;clinics:Map<string,ClinicAllocation>};
const clinicTurns = new WeakMap<WorldState,ClinicTurn>();

function dutyFor(world: WorldState, actor: Cultivator, siteId: string, tick: number): StaffedDutyKind|undefined {
  return hasDueObservatoryDuty(world,actor,siteId,tick) ? 'observatory' :
    hasCohortStaffedDuty(world,actor,siteId,tick) ? 'cohort' : undefined;
}

function clinicInputs(world: WorldState, sect: Sect, site: LocationNode, tick: number) {
  const beds = Math.min(INFIRMARY_MAX_BEDS, Math.floor(sect.facilities.alchemy_hall));
  const shifts = world.infirmaries.shifts.filter(shift => shift.sectId === sect.id && shift.siteId === site.id && effectualShift(shift,tick));
  const signed = shifts.flatMap(shift => {
    const guard = findActor(world,shift.guardId);
    return shift.startedTick < tick && guardAvailable(world,guard,sect,site.id,tick)
      ? [{shift,duty:dutyFor(world,guard,site.id,tick)}] : [];
  }).sort((a,b) => a.shift.startedTick-b.shift.startedTick || ascii(a.shift.guardId,b.shift.guardId) || ascii(a.shift.id,b.shift.id));
  const served = world.infirmaries.cases.filter(row => row.sectId === sect.id && row.siteId === site.id && row.receipt?.tick === tick).length;
  const stocked = Math.max(0, Math.min(beds, Math.floor(sect.spiritStones / INFIRMARY_TREATMENT_STONES),
    Math.floor(site.herbs.jade_leaf / INFIRMARY_TREATMENT_HERBS)));
  const patients = world.infirmaries.cases.flatMap(row => {
    if (row.sectId !== sect.id || row.siteId !== site.id || !liveCase(row,tick) || row.queuedTick >= tick) return [];
    const patient = findActor(world,row.patientId);
    return present(world,patient,sect,site.id,tick) && injured(patient) ? [{row,patient}] : [];
  }).sort((a,b) => health(a.patient)-health(b.patient) || a.patient.spiritStones-b.patient.spiritStones ||
    a.row.queuedTick-b.row.queuedTick || ascii(a.patient.id,b.patient.id) || ascii(a.row.id,b.row.id));
  return {beds,stocked,served,scheduledShifts:shifts.length,signed,patients};
}

function allocateClinic(site: LocationNode, inputs: ReturnType<typeof clinicInputs>, tick: number): ClinicAllocation {
  const max = Math.max(0,Math.min(inputs.beds-inputs.served,inputs.stocked));
  const remaining = inputs.signed.filter(({shift}) => shift.lastServedTick !== tick);
  const cases = new Map<string,StaffAllocation>();
  for (const {row} of inputs.patients.slice(0,max)) {
    const primary = remaining.shift();
    if (!primary) break;
    const allocation: StaffAllocation = {primaryId:primary.shift.id};
    if (primary.duty) {
      allocation.conflict = primary.duty;
      const backup = remaining.findIndex(({duty,shift}) => duty === undefined && shift.guardId !== primary.shift.guardId);
      if (backup >= 0) allocation.replacementId = remaining.splice(backup,1)[0].shift.id;
    }
    cases.set(row.id,allocation);
  }
  return {siteId:site.id,cases};
}

/** Freeze only allocations based on actual prior signatures and the early world state, not actor evaluation order. */
export function beginClinicDutyTurn(world: WorldState): void {
  if (clinicTurns.get(world)?.tick === world.tick) return;
  const clinics = new Map<string,ClinicAllocation>();
  for (const sect of world.sects) {
    const site = clinicSite(world,sect);
    if (!site) continue;
    const allocation = allocateClinic(site,clinicInputs(world,sect,site,world.tick),world.tick);
    clinics.set(sect.id,allocation);
    for (const assignment of allocation.cases.values()) if (assignment.conflict) {
      const primary = world.infirmaries.shifts.find(shift => shift.id === assignment.primaryId);
      if (primary) primary.lastWithheld = {tick:world.tick,duty:assignment.conflict};
    }
  }
  clinicTurns.set(world,{tick:world.tick,clinics});
}

function planClinic(world: WorldState, sect: Sect, site: LocationNode, tick = world.tick) {
  const inputs = clinicInputs(world,sect,site,tick);
  const turn = clinicTurns.get(world);
  const frozen = turn?.tick === tick ? turn.clinics.get(sect.id) : undefined;
  const frozenConflict = frozen?.siteId === site.id && [...frozen.cases.values()].some(row => row.conflict);
  // Uncontested care still reranks the live queue; only real conflict pairings are frozen.
  const cases = frozenConflict ? frozen.cases : allocateClinic(site,inputs,tick).cases;
  const mayUseHandoff = turn?.tick !== tick || frozenConflict;
  const signed = new Map(inputs.signed.map(entry => [entry.shift.id,entry]));
  const permits = new Map<string,{shift:InfirmaryShift;move:'accept'|'accept_handoff';handoff?:{fromShiftId:string;duty:StaffedDutyKind}}>();
  const max = Math.max(0,Math.min(inputs.beds-inputs.served,inputs.stocked));
  if (max > 0) for (const {row} of inputs.patients) {
    const allocation = cases.get(row.id);
    if (!allocation) continue;
    const primary = signed.get(allocation.primaryId);
    if (!primary || primary.duty !== allocation.conflict || primary.shift.lastServedTick === tick) continue;
    if (!allocation.conflict) {
      permits.set(row.id,{shift:primary.shift,move:'accept'});
    } else if (mayUseHandoff && allocation.replacementId) {
      const backup = signed.get(allocation.replacementId);
      if (backup && backup.shift.guardId !== primary.shift.guardId && !backup.duty && backup.shift.lastServedTick !== tick) {
        permits.set(row.id,{shift:backup.shift,move:'accept_handoff',handoff:{fromShiftId:primary.shift.id,duty:allocation.conflict}});
      }
    }
    if (permits.size >= max) break;
  }
  const capacity: InfirmaryCapacity = {beds:inputs.beds,
    onDuty:inputs.signed.filter(({duty})=>duty===undefined).length,stocked:inputs.stocked,available:permits.size};
  return {...inputs,capacity,cases,permits};
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
    .map((row) => ({ ...row, ...(row.receipt ? { receipt: { ...row.receipt, ...(row.receipt.handoff ? {handoff:{...row.receipt.handoff}} : {}) } } : {}) }));
  const latestShift = world.infirmaries.shifts.filter((row) => row.guardId === actor.id && row.startedTick <= world.tick).at(-1);
  const ownShift = latestShift && { ...latestShift, ...(latestShift.lastWithheld ? {lastWithheld:{...latestShift.lastWithheld}} : {}) };
  const sect = world.sects.find(({ id }) => id === actor.sectId);
  const clinic = sect && clinicSite(world, sect);
  if (sect && clinic && present(world, actor, sect, clinic.id)) {
    const plan = planClinic(world, sect, clinic);
    const rank = plan.patients.findIndex(({ patient }) => patient.id === actor.id);
    const request = rank >= 0 ? plan.patients[rank].row : undefined;
    const disposition = request && plan.cases.get(request.id)?.conflict ?
      plan.permits.get(request.id)?.move === 'accept_handoff' ? 'handoff_available' : 'waiting_conflict' : undefined;
    return { sectId: sect.id, siteId: clinic.id, capacity: plan.capacity, ownCases, ownShift,
      ...(rank >= 0 ? { ownQueuePosition: rank + 1 } : {}), ...(disposition ? {ownDutyDisposition:disposition} : {}) };
  }
  const saved = ownCases.at(-1) ?? ownShift;
  return saved && { sectId: saved.sectId, siteId: saved.siteId, ownCases, ownShift };
}

export function availableInfirmaryActions(actor: Cultivator, world: WorldState, executionTick = world.tick): InfirmaryOption[] {
  if ((executionTick !== world.tick && executionTick !== world.tick+1) || !world.cultivators.includes(actor)) return [];
  const request = world.infirmaries.cases.find((row) => row.patientId === actor.id && liveCase(row,executionTick));
  const options: InfirmaryOption[] = [];
  // Consent can be withdrawn while the record is valid, even if the requester has already left the clinic.
  if (request && live(actor)) options.push({ action: 'INFIRMARY', infirmaryMove: 'refuse', targetInfirmaryCaseId: request.id });
  const sect = world.sects.find(({ id }) => id === actor.sectId);
  const site = sect && clinicSite(world, sect);
  if (!sect || !site || !present(world, actor, sect, site.id,executionTick)) return options;
  const plan = planClinic(world, sect, site,executionTick);
  if (request) {
    const permit = plan.permits.get(request.id);
    if (permit) options.push({action:'INFIRMARY',infirmaryMove:permit.move,targetInfirmaryCaseId:request.id});
    return options;
  }
  const latest = world.infirmaries.cases.filter((row) => row.patientId === actor.id && row.settledTick !== undefined).at(-1);
  if (injured(actor) && !(latest?.settledTick !== undefined && executionTick - latest.settledTick < RETRY_WAIT)) {
    options.push({ action: 'INFIRMARY', infirmaryMove: 'request' });
  }
  const alreadyShifted = world.infirmaries.shifts.some((row) => row.guardId === actor.id && effectualShift(row,executionTick));
  if (!alreadyShifted && guardAvailable(world, actor, sect, site.id,executionTick) && plan.scheduledShifts < plan.capacity.beds) {
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
  const consent = decision.infirmaryMove === 'accept' || decision.infirmaryMove === 'accept_handoff';
  if (consent && Object.entries(decision).some(([field,value]) => value !== undefined &&
    !['chosenAction','innerMonologue','spokenLine','infirmaryMove','targetInfirmaryCaseId'].includes(field) &&
    !(field === 'action' && value === 'INFIRMARY'))) return null;
  const option = availableInfirmaryActions(actor, world).find((row) =>
    row.infirmaryMove === decision.infirmaryMove && row.targetInfirmaryCaseId === decision.targetInfirmaryCaseId);
  if (!option) return null;
  if (consent) beginClinicDutyTurn(world);
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
  const permit = plan.permits.get(row.id);
  if (!permit || permit.move !== option.infirmaryMove) return null;
  const {shift,handoff} = permit;
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
    herbsSpent: INFIRMARY_TREATMENT_HERBS, hpRestored, toxicityRemoved, ...(handoff ? {handoff:{...handoff}} : {}) };
  return event(world, `${row.id}-treated`, handoff ? '本人明确接受替班护诊' : '本人同意接受静养救治', `实耗公库${INFIRMARY_TREATMENT_STONES}灵石及地库${INFIRMARY_TREATMENT_HERBS}翡翠灵叶，实际恢复${hpRestored}气血，清除${toxicityRemoved}点丹毒。`,
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
  const protectedShifts = new Set(state.cases.flatMap(({ receipt }) => receipt ? [receipt.shiftId,...(receipt.handoff ? [receipt.handoff.fromShiftId] : [])] : []));
  const keepShifts = new Set(state.shifts.filter((row) => row.expiresTick <= world.tick).slice(-SHIFT_HISTORY).map(({ id }) => id));
  state.shifts = state.shifts.filter((row) => row.expiresTick > world.tick || protectedShifts.has(row.id) || keepShifts.has(row.id));
  return events;
}
