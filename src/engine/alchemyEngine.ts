import { flowActor, flowSite, recordResourceFlow } from './resourceFlowEngine';
import { commonsHarvestLimit, settleCommonsHarvest } from './sharedCommonsEngine';
import { authorizedHerbHarvestLimit, settleLeasedHerbHarvest } from './territorialLeaseEngine';
import { localQiWeather, weatherHerbRegrowth } from './weatherEngine';
import type { Cultivator, HerbId, LLMDecisionPayload, PillId, WorldEvent, WorldState } from '../types/world';
import { recordMemory } from './memoryEngine';
import { guardingHerbBeast } from './spiritBeastEngine';
import { canUseFurnace, claimFurnaceUse } from './furnaceReservationEngine';

import { DANXIA_REGROWTH_CADENCE, danxiaMedicineSite, type DanxiaRegrowthSample } from './danxiaShortageTerms';

export const HERB_LABELS: Record<HerbId, string> = {
  jade_leaf: '翡翠灵叶', earth_root: '玄土根', star_bloom: '星露花', shadow_moss: '幽影苔',
};

export interface AlchemyRecipe {
  name: string;
  herbs: Partial<Record<HerbId, number>>;
  furnaceGrade: 1 | 2 | 3;
  spiritStones: number;
  success: number;
  toxicity: number;
}

/** Entirely fictional spirit ingredients and game effects, not real chemistry. */
export const ALCHEMY_RECIPES: Record<PillId, AlchemyRecipe> = {
  foundation: { name: '筑基丹', herbs: { jade_leaf: 2, earth_root: 1 }, furnaceGrade: 1, spiritStones: 40, success: 0.65, toxicity: 18 },
  golden: { name: '九转金丹', herbs: { jade_leaf: 2, star_bloom: 3 }, furnaceGrade: 3, spiritStones: 120, success: 0.55, toxicity: 30 },
  barrier: { name: '破障丹', herbs: { earth_root: 2, star_bloom: 2 }, furnaceGrade: 2, spiritStones: 75, success: 0.6, toxicity: 24 },
  heart_poison: { name: '噬心毒丹', herbs: { shadow_moss: 3, earth_root: 1 }, furnaceGrade: 2, spiritStones: 60, success: 0.6, toxicity: 35 },
};

const HERBS = Object.keys(HERB_LABELS) as HerbId[];
const PILLS = Object.keys(ALCHEMY_RECIPES) as PillId[];
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export interface AlchemyOption {
  action: 'GATHER_HERBS' | 'BREW_PILL' | 'USE_PILL';
  targetHerbId?: HerbId;
  targetPillId?: PillId;
  targetCultivatorId?: string;
}

export function alchemyCost(pill: PillId, furnaceGrade: number): number {
  const recipe = ALCHEMY_RECIPES[pill];
  return Math.ceil(recipe.spiritStones * (1 - Math.max(0, furnaceGrade - recipe.furnaceGrade) * 0.15));
}

export function alchemySuccess(actor: Cultivator, pill: PillId, furnaceGrade: number): number {
  return clamp(ALCHEMY_RECIPES[pill].success + (furnaceGrade - ALCHEMY_RECIPES[pill].furnaceGrade) * 0.12 +
    (actor.spiritRoot === '火' ? 0.1 : 0) + actor.techniqueMastery * 0.001 - actor.pillToxicity * 0.002, 0.1, 0.95);
}

function hostile(actor: Cultivator, target: Cultivator, world: WorldState): boolean {
  return target.id !== actor.id && target.alive && target.hp > 0 && target.locationId === actor.locationId &&
    world.relationships.some((edge) =>
      ((edge.fromId === actor.id && edge.toId === target.id) || (edge.fromId === target.id && edge.toId === actor.id)) &&
      (edge.type === '血仇' || edge.affinity <= -40));
}

/** Used by both brains and re-evaluated at execution, so stale selections spend nothing. */
export function availableAlchemy(actor: Cultivator, world: WorldState, executionTick = world.tick): AlchemyOption[] {
  const place = world.locations.find((node) => node.id === actor.locationId);
  if (!actor.alive || actor.hp <= 0 || !place) return [];
  const result: AlchemyOption[] = [];
  const harvestLimit = authorizedHerbHarvestLimit(world, actor, place);
  const guarding = harvestLimit > 0 ? guardingHerbBeast(world, actor) : undefined;
  let canBrew: boolean | undefined;
  for (const herb of HERBS) {
    if (harvestLimit > 0 && (place.ownerSectId || commonsHarvestLimit(world, actor, place, herb) > 0) && (!guarding || actor.combatPower >= guarding.power * 1.25) && place.herbs[herb] >= 1 && actor.herbs[herb] < 99) result.push({ action: 'GATHER_HERBS', targetHerbId: herb });
  }
  for (const pill of PILLS) {
    const recipe = ALCHEMY_RECIPES[pill];
    if (place.furnaceGrade >= recipe.furnaceGrade && actor.pills[pill] < 99 &&
        actor.spiritStones >= alchemyCost(pill, place.furnaceGrade) &&
        HERBS.every((herb) => actor.herbs[herb] >= (recipe.herbs[herb] ?? 0)) &&
        (canBrew ??= canUseFurnace(world, actor, place.id, 'brew', undefined, executionTick))) {
      result.push({ action: 'BREW_PILL', targetPillId: pill });
    }
    if (actor.pills[pill] < 1) continue;
    if (pill === 'heart_poison') {
      for (const target of world.cultivators) {
        if (hostile(actor, target, world)) result.push({ action: 'USE_PILL', targetPillId: pill, targetCultivatorId: target.id });
      }
    } else {
      result.push({ action: 'USE_PILL', targetPillId: pill, targetCultivatorId: actor.id });
    }
  }
  return result;
}

function event(world: WorldState, actor: Cultivator, title: string, description: string, target?: Cultivator): WorldEvent {
  recordMemory(actor, world.tick, description, target ? 8 : 5, target ? 'combat' : 'cultivation', target ? -2 : 2);
  return {
    id: `evt-${world.tick}-${actor.id}-alchemy`, tick: world.tick, year: world.year, month: world.month,
    title, description, category: target ? 'intrigue' : 'breakthrough',
    actorIds: target ? [actor.id, target.id] : [actor.id], locationId: actor.locationId,
  };
}

export function resolveAlchemy(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload, rng: () => number): WorldEvent | null {
  const option = availableAlchemy(actor, world).find((choice) => choice.action === decision.chosenAction &&
    choice.targetHerbId === decision.targetHerbId && choice.targetPillId === decision.targetPillId &&
    choice.targetCultivatorId === (decision.targetCultivatorId ?? (decision.chosenAction === 'USE_PILL' && decision.targetPillId !== 'heart_poison' ? actor.id : undefined)));
  if (!option) return null;
  const place = world.locations.find((node) => node.id === actor.locationId)!;
  const participant = { kind: 'participants', actorIds: [actor.id] } as const;
  const pocket = flowActor(actor.id);
  if (option.action === 'GATHER_HERBS' && option.targetHerbId) {
    const herb = option.targetHerbId;
    const amount = Math.min(2, Math.floor(place.herbs[herb]), 99 - actor.herbs[herb], authorizedHerbHarvestLimit(world, actor, place),
      place.ownerSectId ? 2 : commonsHarvestLimit(world, actor, place, herb));
    if (amount <= 0 || !settleLeasedHerbHarvest(world, actor, place, herb, amount) ||
      (!place.ownerSectId && !settleCommonsHarvest(world, actor, place, herb, amount))) return null;
    place.herbs[herb] -= amount;
    actor.herbs[herb] += amount;
    recordResourceFlow(world, { kind: 'transfer', mechanism: 'alchemy', refId: place.id, reason: 'herb_harvest',
      from: flowSite(place.id), to: pocket, good: herb, amount, visibility: participant });
    return event(world, actor, `${actor.name}采集灵草`, `${actor.name}在${place.name}采得${amount}株${HERB_LABELS[herb]}，灵草存量随之减少。`);
  }
  const pill = option.targetPillId!;
  const recipe = ALCHEMY_RECIPES[pill];
  if (option.action === 'BREW_PILL') {
    const cost = alchemyCost(pill, place.furnaceGrade);
    if (!claimFurnaceUse(world, actor, place.id, 'brew')) return null;
    for (const herb of HERBS) {
      const used = recipe.herbs[herb] ?? 0;
      if (!used) continue;
      actor.herbs[herb] -= used;
      recordResourceFlow(world, { kind: 'consumption', mechanism: 'alchemy', refId: place.id, reason: 'brew_material',
        from: pocket, good: herb, amount: used, visibility: participant });
    }
    actor.spiritStones -= cost;
    recordResourceFlow(world, { kind: 'consumption', mechanism: 'alchemy', refId: place.id, reason: 'brew_fee',
      from: pocket, good: 'stone', amount: cost, visibility: participant });
    const success = rng() < alchemySuccess(actor, pill, place.furnaceGrade);
    if (success) {
      actor.pills[pill] += 1;
      recordResourceFlow(world, { kind: 'production', mechanism: 'alchemy', refId: place.id, reason: 'brew_output',
        to: pocket, good: pill, amount: 1, visibility: participant });
    }
    return event(world, actor, `${actor.name}${success ? '炼丹成丹' : '炼丹失手'}`,
      `${actor.name}借${place.furnaceGrade}阶丹炉耗费${cost}灵石与药材炼制【${recipe.name}】，${success ? '凝成一枚灵丹。' : '炉火失控，药材与灵石尽耗，未能成丹。'}`);
  }
  actor.pills[pill] -= 1;
  recordResourceFlow(world, { kind: 'consumption', mechanism: 'alchemy', refId: place.id, reason: 'pill_use',
    from: pocket, good: pill, amount: 1, visibility: participant });
  if (pill === 'heart_poison') {
    const target = world.cultivators.find((person) => person.id === option.targetCultivatorId)!;
    target.hp = Math.max(1, target.hp - Math.max(1, Math.round(target.maxHp * 0.16)));
    target.qiProgress = Math.max(0, target.qiProgress - 15);
    target.pillToxicity = clamp(target.pillToxicity + recipe.toxicity, 0, 100);
    actor.karma = clamp(actor.karma - 8, -100, 100);
    const edge = world.relationships.find((relation) =>
      (relation.fromId === actor.id && relation.toId === target.id) || (relation.fromId === target.id && relation.toId === actor.id));
    if (edge) { edge.affinity = Math.max(-100, edge.affinity - 20); edge.type = '血仇'; edge.note = '遭噬心毒丹暗算，怨结难消'; }
    const description = `${actor.name}对近旁仇敌${target.name}施用虚构灵丹【${recipe.name}】，扰乱气机、造成非致命伤势与丹毒，仇怨更深。`;
    recordMemory(target, world.tick, description, 9, 'combat', -5);
    return event(world, actor, `${actor.name}以毒丹暗算仇敌`, description, target);
  }
  const efficacy = Math.max(0.25, 1 - actor.pillToxicity / 100);
  const qiGain = pill === 'foundation' ? 30 : pill === 'barrier' ? 22 : 8;
  const healing = pill === 'golden' ? 0.45 : pill === 'barrier' ? 0.15 : 0.08;
  actor.qiProgress = clamp(actor.qiProgress + Math.round(qiGain * efficacy), 0, 100);
  actor.hp = clamp(actor.hp + Math.round(actor.maxHp * healing * efficacy), 1, actor.maxHp);
  if (pill === 'barrier') {
    actor.reflections = actor.reflections.map((reflection) => reflection.kind === 'heart_demon'
      ? { ...reflection, intensity: Math.max(1, reflection.intensity - Math.max(1, Math.round(2 * efficacy))) } : reflection);
  }
  actor.pillToxicity = clamp(actor.pillToxicity + recipe.toxicity, 0, 100);
  return event(world, actor, `${actor.name}服用${recipe.name}`,
    `${actor.name}服下【${recipe.name}】，恢复伤势与气机${pill === 'barrier' ? '并缓和心魔' : ''}；丹毒累积至${actor.pillToxicity}，过量会减弱药效并反噬。`);
}

/** Called once per world tick before agent decisions. No RNG: deterministic regrowth and detox. */
export function maintainAlchemy(world: WorldState): DanxiaRegrowthSample | undefined {
  const observed = world.tick % DANXIA_REGROWTH_CADENCE === 0 ? danxiaMedicineSite(world) : undefined;
  let sample: DanxiaRegrowthSample | undefined;
  for (const place of world.locations) {
    for (const herb of HERBS) {
      const increment = weatherHerbRegrowth(world, place, herb, DANXIA_REGROWTH_CADENCE);
      const before = place.herbs[herb];
      if (increment > 0) {
        const after = clamp(before + increment, 0, place.herbCapacity[herb]);
        place.herbs[herb] = after;
        if (after > before) recordResourceFlow(world, { kind: 'production', mechanism: 'alchemy', refId: place.id,
          reason: 'herb_regrowth', to: flowSite(place.id), good: herb, amount: after - before, visibility: { kind: 'known_sites', siteIds: [place.id] } });
      }
      if (place === observed && herb === 'jade_leaf') {
        const {kind,intensity} = localQiWeather(world, place);
        sample = {tick:world.tick,siteId:place.id,kind,intensity,before,grown:place.herbs.jade_leaf-before,capacity:place.herbCapacity.jade_leaf};
      }
    }
  }
  for (const actor of world.cultivators) {
    if (!actor.alive) continue;
    if (actor.pillToxicity >= 60) {
      actor.hp = Math.max(1, actor.hp - Math.ceil(actor.pillToxicity / 20));
      actor.qiProgress = Math.max(0, actor.qiProgress - Math.ceil(actor.pillToxicity / 25));
    }
    actor.pillToxicity = clamp(actor.pillToxicity - 2, 0, 100);
  }
  return sample;
}
