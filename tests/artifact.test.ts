import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { ARTIFACT_RULES, artifactId, artifactPowerMultiplier, artifactRepairCost, availableArtifactActions, equippedArtifact, lootStorageRing, resolveArtifactAction, wearArtifact } from '../src/engine/artifactEngine';
import type { Artifact, LLMDecisionPayload } from '../src/types/world';

const forge = (forgeTier: LLMDecisionPayload['forgeTier']): LLMDecisionPayload => ({ chosenAction: 'FORGE_ARTIFACT', forgeTier, innerMonologue: '铸器' });
const manage = (chosenAction: 'BIND_ARTIFACT' | 'REPAIR_ARTIFACT' | 'AWAKEN_ARTIFACT', targetArtifactId: string): LLMDecisionPayload =>
  ({ chosenAction, targetArtifactId, innerMonologue: '祭炼' });

function fixture() {
  const world = createInitialWorld();
  const [actor, loser] = world.cultivators;
  const site = world.locations.find((node) => node.id === actor.locationId)!;
  site.furnaceGrade = 3;
  actor.realm = '元婴';
  actor.techniqueMastery = 80;
  actor.spiritStones = 3000;
  actor.artifacts = [];
  return { world, actor, loser, site };
}
const blade = (id: string): Artifact => ({ id, name: id, tier: '法宝', spiritRoot: '金', durability: 100, maxDurability: 100 });

describe('forging, equipment, spirit growth and storage ring', () => {
  it('requires the tier thresholds and consumes no stone or random roll for an illegal action', () => {
    const { world, actor, site } = fixture();
    const rng = vi.fn(() => 0);
    site.furnaceGrade = 1;
    expect(resolveArtifactAction(world, actor, forge('灵器'), rng)).toBeNull();
    site.furnaceGrade = 3;
    actor.realm = '筑基';
    expect(resolveArtifactAction(world, actor, forge('法宝'), rng)).toBeNull();
    actor.realm = '元婴'; actor.techniqueMastery = 74;
    expect(resolveArtifactAction(world, actor, forge('通天灵宝'), rng)).toBeNull();
    actor.techniqueMastery = 80; actor.spiritStones = 499;
    expect(resolveArtifactAction(world, actor, forge('通天灵宝'), rng)).toBeNull();
    expect(rng).not.toHaveBeenCalled();
    expect(actor.spiritStones).toBe(499);
  });
  it('charges successful and failed forge rolls and issues unique IDs', () => {
    const { world, actor } = fixture();
    const cost = ARTIFACT_RULES.通天灵宝.stones;
    expect(resolveArtifactAction(world, actor, forge('通天灵宝'), () => 0)?.title).toContain('成形');
    world.tick++;
    expect(resolveArtifactAction(world, actor, forge('通天灵宝'), () => 0)?.title).toContain('成形');
    world.tick++;
    expect(resolveArtifactAction(world, actor, forge('通天灵宝'), () => .999)?.title).toContain('失败');
    expect(actor.artifacts).toHaveLength(2);
    expect(new Set(actor.artifacts.map(({ id }) => id)).size).toBe(2);
    expect(actor.artifacts[0]).toMatchObject({ tier: '通天灵宝', durability: ARTIFACT_RULES.通天灵宝.durability });
    expect(actor.spiritStones).toBe(3000 - 3 * cost);
  });
  it('limits forging inventory but preserves all mandatory loot at the cap', () => {
    const { world, actor, loser } = fixture();
    actor.artifacts = Array.from({ length: 12 }, (_, index) => blade(`item-${index}`));
    expect(resolveArtifactAction(world, actor, forge('法器'), () => 0)).toBeNull();
    loser.alive = false; loser.hp = 0; loser.artifacts = [blade('claimed')];
    expect(lootStorageRing(actor, loser).artifacts).toBe(1);
    expect(actor.artifacts).toHaveLength(13);
    expect(actor.artifacts[12].id).toBe('claimed');
    expect(resolveArtifactAction(world, actor, forge('法器'), () => 0)).toBeNull();
  });
  it('chooses the blood-bound artifact, supports legacy items, and repairs at the correct furnace', () => {
    const { world, actor, site } = fixture();
    const old: Artifact = { name: '无字镜', spiritRoot: '土' };
    const strong = blade('strong');
    actor.artifacts = [old, strong];
    const id = artifactId(actor, old, 0);
    expect(availableArtifactActions(actor, world)).toContainEqual({ action: 'BIND_ARTIFACT', targetArtifactId: id });
    expect(old.id).toBeUndefined();
    expect(equippedArtifact(actor)).toBe(strong);
    resolveArtifactAction(world, actor, manage('BIND_ARTIFACT', id), () => 0);
    expect(equippedArtifact(actor)).toBe(old);
    expect(old.id).toBe(id);
    resolveArtifactAction(world, actor, manage('BIND_ARTIFACT', 'strong'), () => 0);
    expect(old.boundTo).toBeUndefined();
    expect(equippedArtifact(actor)).toBe(strong);
    strong.durability = 0;
    expect(equippedArtifact(actor)).toBe(old);
    actor.artifacts = [strong];
    expect(artifactPowerMultiplier(actor)).toBe(1);
    site.furnaceGrade = 2;
    expect(resolveArtifactAction(world, actor, manage('REPAIR_ARTIFACT', 'strong'), () => 0)).toBeNull();
    site.furnaceGrade = 3;
    const cost = artifactRepairCost(strong);
    const before = actor.spiritStones;
    resolveArtifactAction(world, actor, manage('REPAIR_ARTIFACT', 'strong'), () => 0);
    expect(strong.durability).toBe(100);
    expect(actor.spiritStones).toBe(before - cost);
  });
  it('wears on combat, builds resonance, and makes awakened souls improve bound gear', () => {
    const { world, actor } = fixture();
    const item = blade('soul');
    actor.artifacts = [item];
    resolveArtifactAction(world, actor, manage('BIND_ARTIFACT', 'soul'), () => 0);
    const before = artifactPowerMultiplier(actor);
    wearArtifact(actor, true);
    wearArtifact(actor, false);
    expect(item.durability).toBe(79);
    expect(artifactPowerMultiplier(actor)).toBeLessThan(before);
    expect(resolveArtifactAction(world, actor, manage('AWAKEN_ARTIFACT', 'soul'), () => 0)).toBeNull();
    wearArtifact(actor, true);
    const without = artifactPowerMultiplier(actor);
    expect(resolveArtifactAction(world, actor, manage('AWAKEN_ARTIFACT', 'soul'), () => 0)?.title).toContain('苏醒');
    expect(artifactPowerMultiplier(actor)).toBeGreaterThan(without);
    wearArtifact(actor, true);
    expect(item.soul?.experience).toBe(12);
    expect(resolveArtifactAction(world, actor, manage('AWAKEN_ARTIFACT', 'soul'), () => 0)).toBeNull();
  });
  it('rejects stale and foreign artifact choices', () => {
    const { world, actor, loser } = fixture();
    const item = { ...blade('claimed'), boundTo: loser.id };
    actor.artifacts = [item];
    expect(equippedArtifact(actor)).toBeUndefined();
    expect(resolveArtifactAction(world, actor, manage('BIND_ARTIFACT', 'claimed'), () => 0)).toBeNull();
    expect(resolveArtifactAction(world, actor, manage('REPAIR_ARTIFACT', 'missing'), () => 0)).toBeNull();
    actor.alive = false;
    expect(availableArtifactActions(actor, world)).toEqual([]);
  });
  it('transfers all inventory once, preserving wear and soul but clearing former ownership', () => {
    const { actor, loser } = fixture();
    const a = { ...blade('x'), name: '青剑', durability: 17, boundTo: loser.id, resonance: 80, soul: { name: '剑魂', experience: 37 } };
    loser.artifacts = [a, { name: '旧器', spiritRoot: '水' }];
    loser.spiritStones = 42;
    loser.herbs.star_bloom = 5;
    loser.pills.golden = 3;
    const previousHerbs = actor.herbs.star_bloom;
    const previousPills = actor.pills.golden;
    expect(lootStorageRing(actor, loser)).toEqual({ stones: 0, artifacts: 0 });
    loser.alive = false; loser.hp = 0;
    expect(lootStorageRing(actor, loser)).toEqual({ stones: 42, artifacts: 2 });
    expect(actor.spiritStones).toBe(3042);
    expect(actor.herbs.star_bloom).toBe(previousHerbs + 5);
    expect(actor.pills.golden).toBe(previousPills + 3);
    expect(actor.artifacts[0]).toMatchObject({ id: 'x', durability: 17, resonance: 0, soul: a.soul });
    expect(actor.artifacts[0].boundTo).toBeUndefined();
    expect(actor.artifacts[0].soul).not.toBe(a.soul);
    expect(loser.artifacts).toEqual([]);
    expect(loser.spiritStones).toBe(0);
    expect(Object.values(loser.herbs).every((n) => n === 0)).toBe(true);
    expect(Object.values(loser.pills).every((n) => n === 0)).toBe(true);
    expect(lootStorageRing(actor, loser)).toEqual({ stones: 0, artifacts: 0 });
    expect(actor.artifacts).toHaveLength(2);
  });
});
