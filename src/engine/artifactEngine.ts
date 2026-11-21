import type { ActionType, Artifact, ArtifactTier, CultivationRealm, Cultivator, HerbId, LLMDecisionPayload, PillId, WorldEvent, WorldState } from '../types/world';
import { recordMemory } from './memoryEngine';
import { canUseFurnace, claimFurnaceUse } from './furnaceReservationEngine';

interface ArtifactRule {
  grade: 1 | 2 | 3;
  realm: CultivationRealm;
  mastery: number;
  stones: number;
  durability: number;
  success: number;
  power: number;
}

export const ARTIFACT_RULES: Record<ArtifactTier, ArtifactRule> = {
  法器: { grade: 1, realm: '练气', mastery: 0, stones: 55, durability: 60, success: 0.76, power: 0.06 },
  灵器: { grade: 2, realm: '筑基', mastery: 25, stones: 120, durability: 85, success: 0.68, power: 0.11 },
  法宝: { grade: 3, realm: '金丹', mastery: 45, stones: 250, durability: 110, success: 0.58, power: 0.17 },
  通天灵宝: { grade: 3, realm: '元婴', mastery: 75, stones: 500, durability: 145, success: 0.48, power: 0.24 },
};
const TIERS = Object.keys(ARTIFACT_RULES) as ArtifactTier[];
const REALMS: CultivationRealm[] = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
type ArtifactAction = Extract<ActionType, 'FORGE_ARTIFACT' | 'BIND_ARTIFACT' | 'REPAIR_ARTIFACT' | 'AWAKEN_ARTIFACT'>;
export interface ArtifactOption {
  action: ArtifactAction;
  targetArtifactId?: string;
  forgeTier?: ArtifactTier;
}

export function artifactId(actor: Cultivator, item: Artifact, index: number): string {
  return item.id ?? `legacy-artifact-${actor.id}-${index}`;
}

const tierOf = (artifact: Artifact) => artifact.tier ?? '法器';
export const maxDurabilityOf = (artifact: Artifact) => Math.max(1, artifact.maxDurability ?? ARTIFACT_RULES[tierOf(artifact)].durability);
export const durabilityOf = (artifact: Artifact) => clamp(artifact.durability ?? maxDurabilityOf(artifact), 0, maxDurabilityOf(artifact));

const power = (item: Artifact, actor: Cultivator): number => {
  const condition = durabilityOf(item) / maxDurabilityOf(item);
  const bound = item.boundTo === actor.id;
  const spirit = bound && item.soul ? 0.035 + clamp(item.soul.experience, 0, 100) * 0.0008 : 0;
  return (ARTIFACT_RULES[tierOf(item)].power + (bound ? 0.045 : 0) + (item.spiritRoot === actor.spiritRoot ? 0.025 : 0) + spirit) * condition;
};

export function equippedArtifact(actor: Cultivator): Artifact | undefined {
  const usable = actor.artifacts.filter((item) => durabilityOf(item) > 0 && (!item.boundTo || item.boundTo === actor.id));
  return usable.find((item) => item.boundTo === actor.id) ??
    usable.reduce<Artifact | undefined>((best, item) => !best || power(item, actor) > power(best, actor) ? item : best, undefined);
}

export const RELIC_RESONANCE_BONUS = .12;
function equippedSetBonus(actor: Cultivator, artifact: Artifact | undefined): number {
  const pieces = artifact?.relicFragmentIds;
  return artifact?.relicSetId === 'star-balance' && artifact.boundTo === actor.id && pieces?.length === 2 &&
    Boolean(pieces[0] && pieces[1] && pieces[0] !== pieces[1]) ? RELIC_RESONANCE_BONUS : 0;
}

export function activeRelicResonance(actor: Cultivator): number {
  if (!actor.alive || actor.hp <= 0) return 0;
  return equippedSetBonus(actor, equippedArtifact(actor));
}

export function artifactPowerMultiplier(actor: Cultivator): number {
  const artifact = equippedArtifact(actor);
  return artifact ? 1 + power(artifact, actor) + (actor.alive && actor.hp > 0 ? equippedSetBonus(actor, artifact) : 0) : 1;
}

export function wearArtifact(actor: Cultivator, won: boolean): void {
  const artifact = equippedArtifact(actor);
  if (!artifact) return;
  const bound = artifact.boundTo === actor.id;
  const reduction = bound && artifact.soul ? Math.floor(clamp(artifact.soul.experience, 0, 100) / 35) : 0;
  artifact.durability = Math.max(0, durabilityOf(artifact) - (won ? 7 : 14) + reduction);
  if (bound) {
    artifact.resonance = Math.min(100, (artifact.resonance ?? 0) + (won ? 18 : 10));
    if (artifact.soul) artifact.soul.experience = Math.min(100, artifact.soul.experience + (won ? 12 : 7));
  }
}

export function artifactRepairCost(item: Artifact): number {
  return Math.ceil((maxDurabilityOf(item) - durabilityOf(item)) * ARTIFACT_RULES[tierOf(item)].stones /
    maxDurabilityOf(item) / 3);
}
const bindCost = 15;
const awakenCost = 85;
const awakenResonance = 45;

export function availableArtifactActions(actor: Cultivator, world: WorldState, executionTick = world.tick): ArtifactOption[] {
  const site = world.locations.find((location) => location.id === actor.locationId);
  if (!actor.alive || actor.hp <= 0 || !site) return [];
  const options: ArtifactOption[] = [];
  let canForge: boolean | undefined;
  let canRepair: boolean | undefined;
  let canAwaken: boolean | undefined;
  for (const tier of TIERS) {
    const rule = ARTIFACT_RULES[tier];
    if (actor.artifacts.length < 12 && site.furnaceGrade >= rule.grade && actor.spiritStones >= rule.stones &&
        actor.techniqueMastery >= rule.mastery && REALMS.indexOf(actor.realm) >= REALMS.indexOf(rule.realm) &&
        (canForge ??= canUseFurnace(world, actor, site.id, 'forge', undefined, executionTick))) {
      options.push({ action: 'FORGE_ARTIFACT', forgeTier: tier });
    }
  }
  actor.artifacts.forEach((item, index) => {
    if (item.boundTo && item.boundTo !== actor.id) return;
    const targetArtifactId = artifactId(actor, item, index);
    const rule = ARTIFACT_RULES[tierOf(item)];
    if (!item.boundTo && durabilityOf(item) > 0 && actor.spiritStones >= bindCost) options.push({ action: 'BIND_ARTIFACT', targetArtifactId });
    if (site.furnaceGrade >= rule.grade && durabilityOf(item) < maxDurabilityOf(item) && actor.spiritStones >= artifactRepairCost(item) &&
        (canRepair ??= canUseFurnace(world, actor, site.id, 'repair', undefined, executionTick))) {
      options.push({ action: 'REPAIR_ARTIFACT', targetArtifactId });
    }
    if (tierOf(item) !== '法器' && item.boundTo === actor.id && !item.soul && durabilityOf(item) > 0 &&
        site.furnaceGrade >= rule.grade && actor.spiritStones >= awakenCost && (item.resonance ?? 0) >= awakenResonance &&
        (canAwaken ??= canUseFurnace(world, actor, site.id, 'awaken', undefined, executionTick))) {
      options.push({ action: 'AWAKEN_ARTIFACT', targetArtifactId });
    }
  });
  return options;
}

export function resolveArtifactAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload, rng: () => number): WorldEvent | null {
  const option = availableArtifactActions(actor, world).find((candidate) => candidate.action === decision.chosenAction &&
    candidate.targetArtifactId === decision.targetArtifactId && candidate.forgeTier === decision.forgeTier);
  if (!option) return null;
  let title: string;
  let description: string;
  if (option.action === 'FORGE_ARTIFACT' && option.forgeTier) {
    const tier = option.forgeTier;
    const rule = ARTIFACT_RULES[tier];
    const site = world.locations.find((place) => place.id === actor.locationId)!;
    const chance = clamp(rule.success + 0.04 * (site.furnaceGrade - rule.grade) + actor.techniqueMastery * 0.001 +
      (actor.spiritRoot === site.spiritRoot ? 0.06 : 0), 0.05, 0.95);
    if (!claimFurnaceUse(world, actor, site.id, 'forge')) return null;
    actor.spiritStones -= rule.stones;
    const success = rng() < chance;
    title = success ? '炼器开炉，灵宝成形' : '炉火失控，炼器失败';
    if (success) {
      const usedIds = new Set(world.cultivators.flatMap((person) => person.artifacts.map((item) => item.id)));
      let serial = 1;
      const prefix = `artifact-${actor.id}-${world.tick}`;
      while (usedIds.has(`${prefix}-${serial}`)) serial++;
      const name = `${actor.spiritRoot}纹·${tier}`;
      actor.artifacts.push({ id: `${prefix}-${serial}`, name, spiritRoot: actor.spiritRoot, tier, maxDurability: rule.durability,
        durability: rule.durability, resonance: 0 });
      description = `${actor.name}在${site.name}耗费${rule.stones}灵石，铸成【${name}】。`;
    } else {
      description = `${actor.name}在${site.name}炼制${tier}失手，${rule.stones}灵石随炉火消散。`;
    }
  } else {
    const index = actor.artifacts.findIndex((item, i) => artifactId(actor, item, i) === option.targetArtifactId);
    const item = actor.artifacts[index];
    if (!item) return null;
    if (option.action === 'REPAIR_ARTIFACT' && !claimFurnaceUse(world, actor, actor.locationId, 'repair')) return null;
    if (option.action === 'AWAKEN_ARTIFACT' && !claimFurnaceUse(world, actor, actor.locationId, 'awaken')) return null;
    item.id ??= artifactId(actor, item, index);
    if (option.action === 'BIND_ARTIFACT') {
      for (const other of actor.artifacts) {
        if (other.boundTo === actor.id) {
          delete other.boundTo;
          other.resonance = 0;
        }
      }
      actor.spiritStones -= bindCost;
      item.boundTo = actor.id;
      item.resonance = 0;
      title = '滴血认主';
      description = `${actor.name}将【${item.name}】认作本命法宝，优先装备。`;
    } else if (option.action === 'REPAIR_ARTIFACT') {
      const cost = artifactRepairCost(item);
      actor.spiritStones -= cost;
      item.durability = maxDurabilityOf(item);
      title = '修复法宝';
      description = `${actor.name}耗费${cost}灵石，将【${item.name}】修复如初。`;
    } else if (option.action === 'AWAKEN_ARTIFACT') {
      actor.spiritStones -= awakenCost;
      item.resonance = Math.max(0, (item.resonance ?? 0) - awakenResonance);
      item.soul = { name: `${item.name}之灵`, experience: 0 };
      title = '法宝器灵苏醒';
      description = `${actor.name}凝聚斗法共鸣，唤醒【${item.soul.name}】，随战历练可进一步增益与护器。`;
    } else {
      return null;
    }
  }
  recordMemory(actor, world.tick, description, 6, 'cultivation', 2);
  return { id: `evt-${world.tick}-${actor.id}-${option.action.toLowerCase()}-${actor.memorySequence}`, tick: world.tick, year: world.year,
    month: world.month, title, description, category: 'breakthrough', actorIds: [actor.id], locationId: actor.locationId };
}

export function lootStorageRing(winner: Cultivator, loser: Cultivator): { stones: number; artifacts: number } {
  if (!winner.alive || loser.alive || winner.id === loser.id) return { stones: 0, artifacts: 0 };
  const stones = loser.spiritStones;
  const artifacts = loser.artifacts.length;
  winner.spiritStones += stones;
  loser.spiritStones = 0;
  for (const key of Object.keys(loser.herbs) as HerbId[]) {
    winner.herbs[key] += loser.herbs[key];
    loser.herbs[key] = 0;
  }
  for (const key of Object.keys(loser.pills) as PillId[]) {
    winner.pills[key] += loser.pills[key];
    loser.pills[key] = 0;
  }
  const claimed = loser.artifacts.map((item, i) => {
    const loot = { ...item, id: artifactId(loser, item, i), resonance: 0 };
    delete loot.boundTo;
    if (loot.soul) loot.soul = { ...loot.soul };
    return loot;
  });
  loser.artifacts = [];
  winner.artifacts.push(...claimed);
  return { stones, artifacts };
}
