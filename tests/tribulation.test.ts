import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld, REALM_BASE_POWER, REALM_LIFESPAN } from '../src/data/initialWorld';
import { availableAmbushTargets, interfereTribulation, isTribulationActive, recommendedTribulationStance, resolveTribulation, tribulationTarget, triggerTribulation } from '../src/engine/tribulationEngine';

function fixture() {
  const world = createInitialWorld();
  const [actor, enemy] = world.cultivators;
  actor.realm = '筑基';
  actor.realmStage = 9;
  actor.qiProgress = 95;
  actor.hp = actor.maxHp = 500;
  actor.techniqueMastery = 50;
  actor.pillToxicity = 0;
  actor.pills.barrier = 0;
  actor.reflections = [];
  actor.artifacts = [];
  world.relationships = [];
  return { world, actor, enemy };
}

describe('staged heavenly trial', () => {
  it('gates the four major trial destinations and checks readiness without mutating a failed start', () => {
    const { world, actor } = fixture();
    actor.qiProgress = 89;
    expect(tribulationTarget(actor)).toBe('金丹');
    expect(triggerTribulation(world, actor)).toBeNull();
    expect(actor.tribulation).toBeUndefined();
    const cases = [['练气', undefined], ['筑基', '金丹'], ['金丹', '元婴'], ['元婴', '化神'], ['化神', undefined],
      ['炼虚', undefined], ['合体', undefined], ['大乘', '渡劫'], ['渡劫', undefined]] as const;
    for (const [realm, target] of cases) { actor.realm = realm; expect(tribulationTarget(actor)).toBe(target); }
    actor.realm = '筑基'; actor.realmStage = 8; actor.qiProgress = 100;
    expect(triggerTribulation(world, actor)).toBeNull();
  });

  it('advances only once per new tick, keeps realm during waves and promotes after the heart trial', () => {
    const { world, actor } = fixture();
    expect(triggerTribulation(world, actor)?.title).toContain('降临');
    expect(triggerTribulation(world, actor)).toBeNull();
    const rng = vi.fn(() => .5);
    expect(resolveTribulation(world, actor, 'guard', rng)).toBeNull();
    expect(rng).not.toHaveBeenCalled();
    for (let wave = 1; wave <= 3; wave++) {
      world.tick++;
      expect(resolveTribulation(world, actor, 'guard', rng)?.title).toBe(`第${wave}重雷劫`);
      expect(resolveTribulation(world, actor, 'guard', rng)).toBeNull();
      expect(actor.realm).toBe('筑基');
    }
    expect(actor.tribulation?.stage).toBe('heart_demon');
    expect(recommendedTribulationStance(actor)).toBe('focus');
    world.tick++;
    expect(resolveTribulation(world, actor, 'focus', rng)?.category).toBe('breakthrough');
    expect(rng).toHaveBeenCalledTimes(3);
    expect(actor.realm).toBe('金丹'); expect(actor.realmStage).toBe(1); expect(actor.qiProgress).toBe(0);
    expect(actor.maxHp).toBe(Math.round(REALM_BASE_POWER.金丹 * 1.08));
    expect(actor.lifespan).toBe(REALM_LIFESPAN.金丹);
    expect(actor.tribulation?.resolvedTick).toBe(world.tick);
    expect(isTribulationActive(actor)).toBe(false);
  });

  it('wears protective gear and uses a barrier pill at low vitality but not at excessive toxicity', () => {
    const baseline = fixture(); const geared = fixture(); const toxic = fixture();
    for (const { world, actor } of [baseline, geared, toxic]) { actor.hp = 200; triggerTribulation(world, actor); world.tick++; }
    geared.actor.artifacts = [{ id: 'guard', name: '玄镜', spiritRoot: '金', tier: '法宝', durability: 110, maxDurability: 110 }];
    geared.actor.pills.barrier = 1;
    toxic.actor.pillToxicity = 80; toxic.actor.pills.barrier = 1;
    resolveTribulation(baseline.world, baseline.actor, 'guard', () => .5);
    expect(resolveTribulation(geared.world, geared.actor, 'guard', () => .5)?.description).toContain('破障丹');
    expect(geared.actor.hp).toBeGreaterThan(baseline.actor.hp);
    expect(geared.actor.pillToxicity).toBe(24); expect(geared.actor.pills.barrier).toBe(0);
    expect(geared.actor.artifacts[0].durability).toBeLessThan(110);
    resolveTribulation(toxic.world, toxic.actor, 'guard', () => .5);
    expect(toxic.actor.pills.barrier).toBe(1);
  });

  it('fails deterministically under hostile obsessions, allowing only a cooled and recharged retry', () => {
    const { world, actor, enemy } = fixture();
    actor.realm = '元婴'; actor.techniqueMastery = 0;
    triggerTribulation(world, actor);
    const trial = actor.tribulation!;
    trial.stage = 'heart_demon'; trial.pressure = 80;
    actor.reflections = [{ id: 'demon', tick: world.tick, kind: 'heart_demon', intensity: 10, theme: 'conflict',
      statement: '旧怨', sourceMemoryIds: [], source: 'utility' }];
    world.relationships.push({ fromId: actor.id, toId: enemy.id, type: '血仇', affinity: -90, note: '积怨' });
    world.tick++;
    const rng = vi.fn(() => 0);
    expect(resolveTribulation(world, actor, 'guard', rng)?.title).toBe('渡劫失败');
    expect(rng).not.toHaveBeenCalled();
    expect(actor.alive).toBe(true); expect(actor.qiProgress).toBe(35); expect(actor.realm).toBe('元婴');
    actor.qiProgress = 100;
    expect(triggerTribulation(world, actor)).toBeNull();
    world.tick += 3;
    expect(triggerTribulation(world, actor)).not.toBeNull();
  });

  it('records lethal lightning and drops original techniques', () => {
    const { world, actor } = fixture();
    actor.authoredTechnique = { id: 'original', name: '原典', spiritRoot: '木' };
    actor.hp = 1;
    triggerTribulation(world, actor); world.tick++;
    expect(resolveTribulation(world, actor, 'defy', () => 1)?.category).toBe('death');
    expect(actor.alive).toBe(false); expect(actor.hp).toBe(0); expect(actor.tribulation?.stage).toBe('failed');
    expect(world.locations.find(({ id }) => id === actor.locationId)?.inheritanceScrolls).toContainEqual(actor.authoredTechnique);
  });

  it('allows local hostility only, caps pressure interruptions and does not award a kill', () => {
    const { world, actor, enemy } = fixture();
    enemy.locationId = actor.locationId;
    triggerTribulation(world, actor);
    expect(availableAmbushTargets(enemy, world)).toEqual([]);
    world.relationships.push({ fromId: actor.id, toId: enemy.id, type: '竞争', affinity: -45, note: '旧怨' });
    expect(availableAmbushTargets(enemy, world)).toContain(actor);
    enemy.locationId = 'elsewhere';
    expect(interfereTribulation(world, enemy, actor.id, () => 0)).toBeNull();
    enemy.locationId = actor.locationId; actor.hp = 1;
    for (let i = 0; i < 3; i++) {
      world.tick++;
      expect(interfereTribulation(world, enemy, actor.id, () => 0)?.actorIds).toEqual([enemy.id, actor.id]);
    }
    expect(actor.hp).toBe(1); expect(actor.alive).toBe(true);
    expect(actor.tribulation?.pressure).toBe(39);
    expect(interfereTribulation(world, enemy, actor.id, () => 0)).toBeNull();
  });
});
