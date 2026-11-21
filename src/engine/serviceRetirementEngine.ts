import type { Cultivator, LLMDecisionPayload, Sect, SectServiceMove, ServiceRetirementRecord, ServiceRetirementState, WorldEvent, WorldState } from '../types/world';

export const SERVICE_RETIREMENT_MIN_TICKS = 3;
export const SERVICE_RETIREMENT_HISTORY_LIMIT = 96;
const FORUM = new Set<Cultivator['sectRank']>(['长老', '太上长老', '掌门']);
export interface ServiceRetirementOption { action: 'SECT_SERVICE'; serviceMove: SectServiceMove }

export const createServiceRetirementState = (): ServiceRetirementState => ({ history: [], nextId: 1 });
export const isRetiredFromService = (actor?: Cultivator): boolean => actor?.service?.status === 'retired';

function canChoose(world: WorldState, actor: Cultivator): boolean {
  return actor.alive && actor.hp > 0 && actor.age >= 18 && world.locations.some(({ id }) => id === actor.locationId) &&
    !world.relocations.plans.some((row) => row.status === 'in_transit' && row.garrisonIds.includes(actor.id)) &&
    !world.escorts.contracts.some((row) => row.status === 'active' && row.escortId === actor.id) &&
    !world.couriers.dispatches.some((row) => (row.status === 'in_transit' || row.status === 'returning') && row.courierId === actor.id) &&
    !world.pilgrimages.journeys.some((row) => row.status === 'active' && (row.organizerId === actor.id || row.companionId === actor.id)) &&
    !world.sieges.some((row) => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(actor.id)) &&
    !world.occasions.some((row) => (row.status === 'registration' || row.status === 'running') && row.participantIds.includes(actor.id)) &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon';
}

function roles(world: WorldState, actor: Cultivator, sect: Sect) {
  const leaderReleased = sect.leaderId === actor.id;
  const guard = actor.guardAssignment;
  const guardedSite = guard && world.locations.find(({ id }) => id === guard.locationId);
  const guardLocationId = guard && guardedSite && !leaderReleased && guard.assignedTick <= world.tick && guard.expiresTick > world.tick &&
    (!guardedSite.ownerSectId || guardedSite.ownerSectId === sect.id) &&
    (guardedSite.type === 'spirit_vein' || (guardedSite.ownerSectId === sect.id &&
    (guardedSite.type === 'secret_realm' || guardedSite.type === 'abyss'))) ? guard.locationId : undefined;
  const stewardSchoolIds = world.doctrines.schools.filter((row) => row.parentSectId === sect.id && row.status === 'autonomous' &&
    row.stewardId === actor.id).map(({ id }) => id);
  const infirmaryShiftIds = world.infirmaries.shifts.filter((row) => row.sectId === sect.id && row.guardId === actor.id &&
    row.siteId === sect.headquartersId && row.startedTick <= world.tick && row.expiresTick > world.tick).map(({ id }) => id);
  return { leaderReleased, forumReleased: leaderReleased || FORUM.has(actor.sectRank), guardLocationId, stewardSchoolIds, infirmaryShiftIds };
}

export function availableServiceRetirementActions(actor: Cultivator, world: WorldState): ServiceRetirementOption[] {
  const sect = world.sects.find(({ id }) => id === actor.sectId);
  if (!sect || !canChoose(world, actor) || actor.service?.changedTick === world.tick) return [];
  if (isRetiredFromService(actor)) return world.tick - actor.service!.retiredTick >= SERVICE_RETIREMENT_MIN_TICKS ?
    [{ action: 'SECT_SERVICE', serviceMove: 'return' }] : [];
  const role = roles(world, actor, sect);
  return role.forumReleased || role.leaderReleased || role.guardLocationId || role.infirmaryShiftIds.length || role.stewardSchoolIds.length ?
    [{ action: 'SECT_SERVICE', serviceMove: 'retire' }] : [];
}

export function resolveServiceRetirementAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'SECT_SERVICE' || !world.cultivators.includes(actor)) return null;
  const option = availableServiceRetirementActions(actor, world).find((item) => item.serviceMove === decision.serviceMove);
  if (!option) return null;
  const sect = world.sects.find(({ id }) => id === actor.sectId)!;
  const state = world.serviceRetirement;
  const retiring = option.serviceMove === 'retire';
  const vacated: ReturnType<typeof roles> = retiring ? roles(world, actor, sect) : { leaderReleased: false, forumReleased: false, guardLocationId: undefined, stewardSchoolIds: [], infirmaryShiftIds: [] };
  const formerRank = retiring ? actor.sectRank : actor.service!.formerRank;
  if (retiring) {
    actor.service = { status: 'retired', changedTick: world.tick, retiredTick: world.tick, formerSectId: sect.id, formerRank };
    delete actor.guardAssignment;
    for (const school of world.doctrines.schools) {
      if (vacated.stewardSchoolIds.includes(school.id)) delete school.stewardId;
    }
    // The old leader ID remains until the same canonical succession pass records its true predecessor.
    // Active clinic eligibility is withdrawn by isRetiredFromService; historical shift rows are preserved.
  } else {
    actor.service = { ...actor.service!, status: 'serving', changedTick: world.tick };
  }
  const record: ServiceRetirementRecord = { id: `service-record-${state.nextId++}`, actorId: actor.id, sectId: sect.id,
    tick: world.tick, kind: option.serviceMove, formerRank, ...vacated };
  state.history.push(record);
  state.history = state.history.slice(-SERVICE_RETIREMENT_HISTORY_LIMIT);
  return { id: `evt-${record.id}`, tick: world.tick, year: world.year, month: world.month,
    title: retiring ? '本人自愿退居离任' : '本人自愿恢复任职资格',
    description: retiring ? '从实际宗门公职退居；未放弃宗籍、贡献或私人财物。' : '仅恢复候任资格，不收回或重新分配既有职位。',
    actorIds: [actor.id], category: 'diplomacy', witnessScope: 'participants' };
}

export function visibleServiceRetirements(world: WorldState, viewer?: Cultivator): ServiceRetirementRecord[] {
  if (!viewer || !world.cultivators.some(({ id }) => id === viewer.id)) return [];
  return world.serviceRetirement.history.filter((row) => row.actorId === viewer.id && row.tick <= world.tick)
    .map((row) => ({ ...row, stewardSchoolIds: [...row.stewardSchoolIds], infirmaryShiftIds: [...row.infirmaryShiftIds] }));
}
