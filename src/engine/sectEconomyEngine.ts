import {isSectActive} from './sectActivity';
import { flowSect, recordResourceFlow } from './resourceFlowEngine';
import { isRetiredFromService } from './serviceRetirementEngine';
import { activeRelocationForSect } from './relocationEngine';
import { boundaryReliefCheckpoint } from './boundaryReliefCheckpoint';
import { boundaryReliefBlocksLegacyDispatch } from './boundaryReliefEngine';
import type { ActionType, Cultivator, FacilityKind, LLMDecisionPayload, LocationNode, Sect, WorldEvent, WorldState } from '../types/world';
import { rewardContribution } from './sectPoliticsEngine';

export const FACILITY_RULES: Record<FacilityKind, { name: string; baseCost: number; maxLevel: number }> = {
  qi_array: { name: '聚灵阵', baseCost: 280, maxLevel: 3 },
  alchemy_hall: { name: '炼丹房', baseCost: 250, maxLevel: 3 },
  scripture_pavilion: { name: '藏经阁', baseCost: 220, maxLevel: 3 },
  defense_array: { name: '护山阵', baseCost: 340, maxLevel: 3 },
  spirit_mine: { name: '灵石矿脉', baseCost: 300, maxLevel: 3 },
};

const KINDS = Object.keys(FACILITY_RULES) as FacilityKind[];
const TREASURY_CAP = 50_000;
const GUARD_DURATION = 6;
const ARRAY_HP_PER_LEVEL = 200;

export interface SectEconomyOption {
  action: Extract<ActionType, 'BUILD_FACILITY' | 'DISPATCH_GUARD' | 'GUARD_DUTY'>;
  facilityKind?: FacilityKind;
  targetCultivatorId?: string;
  targetLocationId?: string;
}

export function facilityBuildCost(sect: Sect, kind: FacilityKind): number {
  return FACILITY_RULES[kind].baseCost * (sect.facilities[kind] + 1);
}

function isResourceSite(site: LocationNode, sectId: string): boolean {
  if (site.ownerSectId && site.ownerSectId !== sectId) return false;
  return site.type === 'spirit_vein' || (site.ownerSectId === sectId && (site.type === 'secret_realm' || site.type === 'abyss'));
}

export function isGuardAssignmentActive(actor: Cultivator, world: WorldState): boolean {
  const assignment = actor.guardAssignment;
  const site = world.locations.find(({ id }) => id === assignment?.locationId);
  return Boolean(actor.alive && actor.hp > 0 && !isRetiredFromService(actor) && assignment && assignment.assignedTick <= world.tick &&
    world.tick < assignment.expiresTick && site && isResourceSite(site, actor.sectId) &&
    world.sects.some(({ id, leaderId }) => id === actor.sectId && actor.id !== leaderId));
}

export const isGuardPhysicallyOnDuty = (actor: Cultivator, world: WorldState): boolean =>
  isGuardAssignmentActive(actor, world) && actor.guardAssignment?.locationId === actor.locationId &&
  !boundaryReliefCheckpoint(world, actor);

export function availableSectEconomyActions(actor: Cultivator, world: WorldState): SectEconomyOption[] {
  const sect = world.sects.find(({ id }) => id === actor.sectId);
  // A traveller's siteId remains their origin; it must not authorize ordinary guard movement or headquarters work.
  if (!sect || !actor.alive || actor.hp <= 0 || isRetiredFromService(actor) || boundaryReliefCheckpoint(world, actor)) return [];
  const options: SectEconomyOption[] = [];
  if (isGuardAssignmentActive(actor, world)) options.push({ action: 'GUARD_DUTY', targetLocationId: actor.guardAssignment?.locationId });
  if (activeRelocationForSect(world, sect.id) || sect.leaderId !== actor.id || actor.locationId !== sect.headquartersId) return options;
  const hq = world.locations.find(({ id }) => id === sect.headquartersId);
  if (!hq || (hq.ownerSectId && hq.ownerSectId !== sect.id)) return options;
  for (const kind of KINDS) {
    if (sect.facilities[kind] < FACILITY_RULES[kind].maxLevel && sect.spiritStones >= facilityBuildCost(sect, kind)) {
      options.push({ action: 'BUILD_FACILITY', facilityKind: kind });
    }
  }
  for (const guard of world.cultivators) {
    if (guard.id === actor.id || !guard.alive || guard.hp <= 0 || isRetiredFromService(guard) || guard.sectId !== sect.id || guard.locationId !== hq.id ||
        isGuardAssignmentActive(guard, world)) continue;
    for (const site of world.locations) {
      if (isResourceSite(site, sect.id) && !boundaryReliefBlocksLegacyDispatch(world, guard.id, site.id) &&
          !world.cultivators.some((member) => member.sectId === sect.id &&
          member.guardAssignment?.locationId === site.id && isGuardAssignmentActive(member, world))) {
        options.push({ action: 'DISPATCH_GUARD', targetCultivatorId: guard.id, targetLocationId: site.id });
      }
    }
  }
  return options;
}

export function resolveSectEconomyAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  const option = availableSectEconomyActions(actor, world).find((candidate) => candidate.action === decision.chosenAction &&
    candidate.facilityKind === decision.facilityKind && candidate.targetCultivatorId === decision.targetCultivatorId &&
    (candidate.targetLocationId === decision.targetLocationId || (candidate.action === 'GUARD_DUTY' && !decision.targetLocationId)));
  if (!option) return null;
  const sect = world.sects.find(({ id }) => id === actor.sectId)!;
  let title: string;
  let description: string;
  let actors = [actor.id];
  if (option.action === 'BUILD_FACILITY' && option.facilityKind) {
    const kind = option.facilityKind;
    const cost = facilityBuildCost(sect, kind);
    sect.spiritStones -= cost;
    const level = ++sect.facilities[kind];
    recordResourceFlow(world, { kind: 'consumption', mechanism: 'sect_economy', refId: sect.id, reason: 'facility_construction',
      from: flowSect(sect.id), good: 'stone', amount: cost, visibility: { kind: 'participants', actorIds: [actor.id] } });
    const hq = world.locations.find(({ id }) => id === sect.headquartersId)!;
    if (kind === 'alchemy_hall' && level > hq.furnaceGrade) hq.furnaceGrade = Math.min(3, level) as LocationNode['furnaceGrade'];
    if (kind === 'defense_array') {
      sect.arrayMaxHp = level * ARRAY_HP_PER_LEVEL;
      sect.arrayHp = Math.min(sect.arrayMaxHp, sect.arrayHp + ARRAY_HP_PER_LEVEL);
    }
    title = `${sect.name}扩建${FACILITY_RULES[kind].name}`;
    description = `${actor.name}从公库拨出${cost}灵石，将${FACILITY_RULES[kind].name}升至${level}阶。`;
  } else if (option.action === 'DISPATCH_GUARD') {
    const guard = world.cultivators.find(({ id }) => id === option.targetCultivatorId)!;
    const site = world.locations.find(({ id }) => id === option.targetLocationId)!;
    guard.guardAssignment = { locationId: site.id, assignedTick: world.tick, expiresTick: world.tick + GUARD_DURATION };
    actors = [actor.id, guard.id];
    title = '奉令镇守';
    description = `${actor.name}派${guard.name}镇守${site.name}，至第${guard.guardAssignment.expiresTick}轮卸任。`;
  } else if (option.action === 'GUARD_DUTY') {
    const site = world.locations.find(({ id }) => id === option.targetLocationId)!;
    const arrived = actor.locationId !== site.id;
    actor.locationId = site.id;
    rewardContribution(actor, world, arrived ? 2 : 3);
    title = arrived ? '守备到岗' : '巡守灵脉';
    description = `${actor.name}${arrived ? '抵达' : '巡守'}${site.name}，获得宗门贡献。`;
  } else return null;
  return { id: `evt-${world.tick}-${actor.id}-${option.action.toLowerCase()}`, tick: world.tick, year: world.year, month: world.month,
    title, description, category: 'diplomacy', actorIds: actors, locationId: actor.locationId };
}

export function maintainSectEconomy(world: WorldState): void {
  for (const actor of world.cultivators) {
    if (actor.guardAssignment && !isGuardAssignmentActive(actor, world)) delete actor.guardAssignment;
  }
  for (const sect of world.sects) {
    if (!isSectActive(sect)||sect.monthlyEconomy?.tick === world.tick) continue;
    if (activeRelocationForSect(world, sect.id)) {
      sect.monthlyEconomy = { tick: world.tick, taxes: 0, mining: 0, upkeep: 0, net: 0 };
      continue;
    }
    const hq = world.locations.find(({ id }) => id === sect.headquartersId);
    const controlsHq = hq && (!hq.ownerSectId || hq.ownerSectId === sect.id);
    const holdings = world.locations.filter(({ ownerSectId }) => ownerSectId === sect.id);
    const guarded = new Set(world.cultivators.filter((actor) => actor.sectId === sect.id && isGuardPhysicallyOnDuty(actor, world))
      .map(({ locationId }) => locationId));
    const taxes = holdings.reduce((income, node) => income + (node.type === 'sect_hq' || node.type === 'market' ? 12 + Math.floor(node.spiritQi / 8) : 0), 0);
    const mining = controlsHq && sect.facilities.spirit_mine > 0 ? sect.facilities.spirit_mine *
      (22 + 8 * holdings.filter((node) => node.type === 'spirit_vein').length + 10 * guarded.size) : 0;
    const funds = sect.spiritStones + taxes + mining;
    const operatingCost = KINDS.reduce((sum, kind) => sum + sect.facilities[kind] * (kind === 'defense_array' ? 9 : 3), 0);
    const upkeep = Math.min(funds, operatingCost);
    if (sect.arrayMaxHp > 0) {
      const repair = controlsHq && upkeep === operatingCost ? 14 * sect.facilities.defense_array : -8;
      sect.arrayHp = Math.max(0, Math.min(sect.arrayMaxHp, sect.arrayHp + repair));
    }
    const end = Math.min(TREASURY_CAP, funds - upkeep);
    sect.monthlyEconomy = { tick: world.tick, taxes, mining, upkeep, net: end - sect.spiritStones };
    sect.spiritStones = end;
    const account = flowSect(sect.id);
    const common = { mechanism: 'sect_economy', refId: sect.id, good: 'stone', visibility: { kind: 'observer' } } as const;
    if (taxes > 0) recordResourceFlow(world, { ...common, kind: 'production', reason: 'treasury_tax', to: account, amount: taxes });
    if (mining > 0) recordResourceFlow(world, { ...common, kind: 'production', reason: 'treasury_mining', to: account, amount: mining });
    if (upkeep > 0) recordResourceFlow(world, { ...common, kind: 'consumption', reason: 'treasury_upkeep', from: account, amount: upkeep });
    const overflow = funds - upkeep - end;
    if (overflow > 0) recordResourceFlow(world, { ...common, kind: 'loss', reason: 'treasury_overflow', from: account, amount: overflow });
  }
}

export function sectQiBonus(world: WorldState, actor: Cultivator): number {
  const sect = world.sects.find(({ id }) => id === actor.sectId);
  const hq = world.locations.find(({ id }) => id === actor.locationId);
  return sect && !activeRelocationForSect(world, sect.id) && hq && actor.alive && hq.id === sect.headquartersId && (!hq.ownerSectId || hq.ownerSectId === sect.id)
    ? 1 + sect.facilities.qi_array * .09 : 1;
}

/** Spend the defender's array HP to absorb external damage at its own headquarters. */
export function mitigateSectArray(world: WorldState, defender: Cultivator, attacker: Cultivator, damage: number): number {
  if (damage <= 0 || defender.sectId === attacker.sectId || defender.locationId !== attacker.locationId) return damage;
  const sect = world.sects.find(({ id }) => id === defender.sectId);
  const hq = world.locations.find(({ id }) => id === defender.locationId);
  if (!sect || !hq || hq.id !== sect.headquartersId || (hq.ownerSectId && hq.ownerSectId !== sect.id) ||
      sect.facilities.defense_array <= 0 || sect.arrayHp <= 0) return damage;
  const absorbed = Math.min(sect.arrayHp, Math.floor(damage * (.15 + .10 * sect.facilities.defense_array)));
  sect.arrayHp -= absorbed;
  return damage - absorbed;
}
