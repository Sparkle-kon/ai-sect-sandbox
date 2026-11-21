import {danxiaReviewPinnedShortageIds} from './danxiaSeasonTerms';
import type { CareFollowup, Cultivator, DanxiaRegrowthSample, DanxiaShortage, DanxiaShortagesState, WorldEvent, WorldState } from '../types/world';
import { CARE_FOLLOWUP_JADE_LEAF, CARE_FOLLOWUP_NEED_THRESHOLD } from './careFollowupTerms';
import { DANXIA_CLOSED_RETENTION_TICKS, DANXIA_REGROWTH_CADENCE, DANXIA_SECT_ID, danxiaMedicineSite, danxiaShortageId, suppressedDanxiaRegrowth } from './danxiaShortageTerms';
import { clinicAccessForFollowup, INFIRMARY_GUARD_THRESHOLD, INFIRMARY_TREATMENT_HERBS, INFIRMARY_TREATMENT_STONES } from './infirmaryEngine';
import { isRetiredFromService } from './serviceRetirementEngine';
import { localQiWeather, weatherHerbRegrowth } from './weatherEngine';

export const createDanxiaShortagesState = (): DanxiaShortagesState => ({ cases: [] });

const ascii = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const person = (world: WorldState, id: string) => world.cultivators.find(actor => actor.id === id);
const needsCare = (actor: Cultivator) => actor.pillToxicity > 0 || actor.hp / Math.max(1, actor.maxHp) <= CARE_FOLLOWUP_NEED_THRESHOLD;

export function matchesDanxiaCareSource(world: WorldState, row: CareFollowup): boolean {
  const paid = world.infirmaries.cases.find(value => value.id === row.sourceCaseId);
  const receipt = paid?.receipt;
  if (!paid || !receipt || paid.status !== 'treated' || paid.siteId !== row.siteId || paid.sectId !== DANXIA_SECT_ID ||
      row.sectId !== paid.sectId || paid.patientId !== row.patientId || paid.queuedTick >= receipt.tick ||
      paid.settledTick !== receipt.tick || row.dischargedTick !== receipt.tick || row.scheduledTick <= receipt.tick ||
      receipt.shiftId !== row.sourceShiftId || receipt.guardId !== row.sourceGuardId || receipt.guardId === row.patientId ||
      receipt.stonesSpent !== INFIRMARY_TREATMENT_STONES || receipt.herbsSpent !== INFIRMARY_TREATMENT_HERBS ||
      !(receipt.hpRestored > 0 || receipt.toxicityRemoved > 0)) return false;
  return world.infirmaries.shifts.some(shift => shift.id === receipt.shiftId && shift.guardId === receipt.guardId &&
    shift.sectId === paid.sectId && shift.siteId === row.siteId && shift.startedTick < receipt.tick &&
    receipt.tick < shift.expiresTick && (shift.lastServedTick ?? -1) >= receipt.tick);
}

function liveDemand(world: WorldState, siteId: string, row: CareFollowup): boolean {
  const tick = world.tick;
  if (row.status !== 'scheduled' || row.sectId !== DANXIA_SECT_ID || row.siteId !== siteId ||
      row.scheduledTick >= tick || row.dueTick > tick || tick >= row.expiresTick) return false;
  const patient = person(world, row.patientId);
  return !!patient && needsCare(patient) && clinicAccessForFollowup(world, patient)?.site.id === siteId &&
    matchesDanxiaCareSource(world, row);
}

export function danxiaHouseholdProvenance(world: WorldState, patientId: string, tick: number) {
  const registrations = world.households.members.filter(row => row.status === 'recruited' && row.recruitedId === patientId &&
    row.settledTick !== undefined && row.registeredTick <= row.settledTick && row.settledTick < tick);
  if (registrations.length !== 1) return undefined;
  const row = registrations[0];
  const household = world.households.groups.find(group => group.id === row.householdId);
  const village = world.settlements.villages.find(village => village.id === row.settlementId);
  return household && village && village.population > 0 && household.createdTick <= tick &&
    household.presences.some(presence => presence.settlementId === village.id) ? row : undefined;
}

function caseEvent(world: WorldState, row: DanxiaShortage, phase: 'opened'|'closed'): WorldEvent {
  return { id: `evt-${row.id}-${phase}`, tick: world.tick, year: world.year, month: world.month, category: 'diplomacy',
    title: phase === 'opened' ? '丹霞药叶短缺' : '丹霞药叶短缺记录结束',
    description: phase === 'opened' ? '当地霜息阻住本月药叶再生，实有存药不足此前约定的复诊。没有划拨药材或施治。' :
      '短缺记录已按实有库存、原复诊结局或原址实际权限核对结束。没有在此划拨药材或施治。',
    actorIds: [row.discipleId, row.patientId], locationId: row.siteId, witnessScope: 'participants' };
}

/** Capture only before decisions, using the measurement returned by this month's actual growth pass. */
export function openDanxiaShortage(world: WorldState, sample?: DanxiaRegrowthSample): WorldEvent[] {
  if (!sample || sample.tick !== world.tick || !suppressedDanxiaRegrowth(sample)) return [];
  const site = danxiaMedicineSite(world);
  if (!site || site.id !== sample.siteId || world.danxiaShortages.cases.some(row => row.status === 'open' && row.siteId === site.id)) return [];
  const current = localQiWeather(world, site);
  if (current.kind !== sample.kind || current.intensity !== sample.intensity ||
      weatherHerbRegrowth(world,site,'jade_leaf',DANXIA_REGROWTH_CADENCE) !== 0 ||
      site.herbCapacity.jade_leaf !== sample.capacity || site.herbs.jade_leaf !== sample.before + sample.grown) return [];
  const live = world.careFollowups.appointments.filter(row => liveDemand(world, site.id, row))
    .sort((a, b) => a.dueTick - b.dueTick || a.scheduledTick - b.scheduledTick || ascii(a.id,b.id));
  const requiredLeaves = live.length * CARE_FOLLOWUP_JADE_LEAF;
  const availableLeaves = site.herbs.jade_leaf;
  if (!Number.isSafeInteger(availableLeaves) || availableLeaves < 0 || availableLeaves >= requiredLeaves) return [];

  const used = new Set(world.danxiaShortages.cases.flatMap(row => row.demandIds));
  const disciples = world.cultivators.filter(actor => actor.sectId === DANXIA_SECT_ID && actor.age >= 18 &&
    (actor.sectRank === '内门弟子' || actor.sectRank === '真传弟子') && actor.hp / Math.max(1, actor.maxHp) >= INFIRMARY_GUARD_THRESHOLD &&
    !isRetiredFromService(actor) && clinicAccessForFollowup(world, actor)?.site.id === site.id)
    .sort((a, b) => ascii(a.id,b.id));
  for (const appointment of live) {
    if (used.has(appointment.id)) continue;
    const member = danxiaHouseholdProvenance(world, appointment.patientId, world.tick);
    const disciple = disciples.find(actor => actor.id !== appointment.patientId);
    if (!member || !disciple) continue;
    const row: DanxiaShortage = { id: danxiaShortageId(appointment.id), siteId: site.id, openedTick: world.tick, regrowth: {...sample},
      discipleId: disciple.id, patientId: appointment.patientId, settlementId: member.settlementId, householdId: member.householdId,
      volunteerId: member.volunteerId, appointmentId: appointment.id, sourceCaseId: appointment.sourceCaseId,
      demandIds: live.map(item=>item.id), requiredLeaves, availableLeaves, status: 'open' };
    world.danxiaShortages.cases.push(row);
    return [caseEvent(world,row,'opened')];
  }
  return [];
}

/** Run after actual late native follow-up settlement: no intervention or fictional cure. */
export function advanceDanxiaShortages(world: WorldState): WorldEvent[] {
  const results: WorldEvent[] = [];
  for (const row of world.danxiaShortages.cases) {
    if (row.status !== 'open') continue;
    const site = danxiaMedicineSite(world);
    const validSite = site?.id === row.siteId;
    const due = validSite ? world.careFollowups.appointments.filter(appointment =>
      row.demandIds.includes(appointment.id) && liveDemand(world,row.siteId,appointment)) : [];
    const requiredLeaves = due.length * CARE_FOLLOWUP_JADE_LEAF;
    const availableLeaves = validSite ? site.herbs.jade_leaf : 0;
    const reason = !validSite ? 'authority_lost' : !due.length ? 'commitment_ended' :
      availableLeaves >= requiredLeaves ? 'adequate_stock' : undefined;
    if (!reason) continue;
    row.status = 'closed';
    row.resolution = { tick:world.tick,reason,requiredLeaves,availableLeaves };
    results.push(caseEvent(world,row,'closed'));
  }
  const cited=danxiaReviewPinnedShortageIds(world);
  for(const commitment of world.danxiaMedicine.commitments)cited.add(commitment.shortageId);
  world.danxiaShortages.cases = world.danxiaShortages.cases.filter(row => row.status === 'open' || cited.has(row.id) ||
    !row.resolution || world.tick - row.resolution.tick <= DANXIA_CLOSED_RETENTION_TICKS);
  return results;
}

export interface DanxiaShortageView {
  id: string; siteName: string; openedTick: number; discipleName: string; patientName: string; settlementName: string; householdBranch:'first'|'second';
  requiredLeaves: number; availableLeaves: number; status: DanxiaShortage['status']; resolution?: DanxiaShortage['resolution'];
}
export function projectDanxiaShortages(world: WorldState, viewer?: Cultivator): DanxiaShortageView[] {
  if (!viewer || !world.cultivators.includes(viewer)) return [];
  return world.danxiaShortages.cases.flatMap(row => {
    if (row.discipleId !== viewer.id && row.patientId !== viewer.id) return [];
    const disciple = person(world,row.discipleId), patient = person(world,row.patientId);
    const village = world.settlements.villages.find(item => item.id === row.settlementId);
    const site = world.locations.find(item => item.id === row.siteId);
    const household=world.households.groups.find(item=>item.id===row.householdId);
    if (!disciple || !patient || !village || !site || !household) return [];
    return [{ id:row.id,siteName:site.name,openedTick:row.openedTick,discipleName:disciple.name,patientName:patient.name,
      settlementName:village.name,householdBranch:household.branch,requiredLeaves:row.requiredLeaves,availableLeaves:row.availableLeaves,status:row.status,
      ...(row.resolution ? {resolution:{...row.resolution}} : {}) }];
  });
}
