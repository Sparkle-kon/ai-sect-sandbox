import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { ALCHEMY_RECIPES, alchemyCost, alchemySuccess, availableAlchemy, maintainAlchemy, resolveAlchemy } from '../src/engine/alchemyEngine';
import type { HerbId, LLMDecisionPayload, PillId } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  const actor = world.cultivators[0];
  const target = world.cultivators[1];
  const place = world.locations.find((node) => node.id === actor.locationId)!;
  actor.herbs = { jade_leaf: 10, earth_root: 10, star_bloom: 10, shadow_moss: 10 };
  actor.pills = { foundation: 0, golden: 0, barrier: 0, heart_poison: 0 };
  actor.pillToxicity = 0;
  actor.spiritStones = 500;
  actor.hp = actor.maxHp;
  place.herbs = { jade_leaf: 3, earth_root: 3, star_bloom: 3, shadow_moss: 3 };
  place.herbCapacity = { jade_leaf: 4, earth_root: 4, star_bloom: 4, shadow_moss: 4 };
  place.furnaceGrade = 3;
  return { world, actor, target, place };
}
const brew = (pill: PillId): LLMDecisionPayload => ({ chosenAction: 'BREW_PILL', innerMonologue: '开炉', targetPillId: pill });
const use = (pill: PillId, targetCultivatorId?: string): LLMDecisionPayload => ({ chosenAction: 'USE_PILL', innerMonologue: '服丹', targetPillId: pill, targetCultivatorId });
const gather = (herb: HerbId): LLMDecisionPayload => ({ chosenAction: 'GATHER_HERBS', innerMonologue: '采药', targetHerbId: herb });

describe('fictional alchemy resources and remedies', () => {
  it('collects only local finite herbs, preserves conservation and inventory bounds', () => {
    const { world, actor, place } = fixture();
    const before = actor.herbs.jade_leaf + place.herbs.jade_leaf;
    expect(resolveAlchemy(world, actor, gather('jade_leaf'), () => 0)?.description).toContain('翡翠灵叶');
    expect(actor.herbs.jade_leaf).toBe(12);
    expect(place.herbs.jade_leaf).toBe(1);
    resolveAlchemy(world, actor, gather('jade_leaf'), () => 0);
    expect(actor.herbs.jade_leaf + place.herbs.jade_leaf).toBe(before);
    const snapshot = JSON.stringify(world);
    expect(resolveAlchemy(world, actor, gather('jade_leaf'), () => 0)).toBeNull();
    expect(JSON.stringify(world)).toBe(snapshot);
    actor.herbs.jade_leaf = 98; place.herbs.jade_leaf = 3;
    resolveAlchemy(world, actor, gather('jade_leaf'), () => 0);
    expect(actor.herbs.jade_leaf).toBe(99);
    expect(place.herbs.jade_leaf).toBe(2);
    expect(availableAlchemy(actor, world)).not.toContainEqual({ action: 'GATHER_HERBS', targetHerbId: 'jade_leaf' });
  });

  it('charges exactly the recipe once on success and failure using a deterministic roll', () => {
    const { world, actor, place } = fixture();
    const cost = alchemyCost('foundation', place.furnaceGrade);
    const success = vi.fn(() => 0);
    expect(resolveAlchemy(world, actor, brew('foundation'), success)?.title).toContain('成丹');
    expect(success).toHaveBeenCalledTimes(1);
    expect(actor.pills.foundation).toBe(1);
    expect(actor.herbs.jade_leaf).toBe(8);
    expect(actor.herbs.earth_root).toBe(9);
    expect(actor.spiritStones).toBe(500 - cost);
    expect(resolveAlchemy(world, actor, brew('foundation'), () => 0.9999)?.title).toContain('失手');
    expect(actor.pills.foundation).toBe(1);
    expect(actor.herbs.jade_leaf).toBe(6);
    expect(actor.spiritStones).toBe(500 - 2 * cost);
  });

  it('furnace tiers change recipe access, cost and success, without spending on invalid requests', () => {
    const { world, actor, place } = fixture();
    place.furnaceGrade = 0;
    const rng = vi.fn(() => 0);
    expect(resolveAlchemy(world, actor, brew('foundation'), rng)).toBeNull();
    expect(actor.spiritStones).toBe(500);
    place.furnaceGrade = 1;
    expect(availableAlchemy(actor, world)).toContainEqual({ action: 'BREW_PILL', targetPillId: 'foundation' });
    expect(resolveAlchemy(world, actor, brew('golden'), rng)).toBeNull();
    expect(alchemyCost('foundation', 3)).toBeLessThan(alchemyCost('foundation', 1));
    expect(alchemySuccess(actor, 'foundation', 3)).toBeGreaterThan(alchemySuccess(actor, 'foundation', 1));
    actor.herbs.jade_leaf = 1;
    expect(resolveAlchemy(world, actor, brew('foundation'), rng)).toBeNull();
    actor.herbs.jade_leaf = 10; actor.spiritStones = 0;
    expect(resolveAlchemy(world, actor, brew('foundation'), rng)).toBeNull();
    expect(rng).not.toHaveBeenCalled();
  });

  it('dead actors, missing locations, foreign targets and mismatched action fields cannot mutate resources', () => {
    const { world, actor, target } = fixture();
    actor.pills.foundation = 1;
    expect(resolveAlchemy(world, actor, use('foundation', target.id), () => 0)).toBeNull();
    expect(resolveAlchemy(world, actor, { ...brew('foundation'), targetHerbId: 'jade_leaf' }, () => 0)).toBeNull();
    actor.alive = false;
    expect(availableAlchemy(actor, world)).toEqual([]);
    expect(resolveAlchemy(world, actor, use('foundation'), () => 0)).toBeNull();
    actor.alive = true; actor.locationId = 'nonexistent';
    expect(availableAlchemy(actor, world)).toEqual([]);
    expect(actor.pills.foundation).toBe(1);
    expect(actor.spiritStones).toBe(500);
  });

  it('all restorative pills have bounded effects, consume one item, and stack toxicity', () => {
    for (const pill of ['foundation', 'golden', 'barrier'] as const) {
      const { world, actor } = fixture();
      actor.pills[pill] = 2; actor.hp = actor.maxHp - 1; actor.qiProgress = 99;
      actor.reflections = [{ id: 'demon', tick: 1, kind: 'heart_demon', theme: 'conflict', intensity: 7, statement: '执念', sourceMemoryIds: [], source: 'utility' }];
      expect(resolveAlchemy(world, actor, use(pill), () => 0)?.description).toContain(ALCHEMY_RECIPES[pill].name);
      expect(actor.hp).toBe(actor.maxHp); expect(actor.qiProgress).toBe(100);
      expect(actor.pills[pill]).toBe(1);
      expect(actor.pillToxicity).toBe(ALCHEMY_RECIPES[pill].toxicity);
      if (pill === 'barrier') expect(actor.reflections[0].intensity).toBe(5);
      resolveAlchemy(world, actor, use(pill), () => 0);
      expect(actor.pillToxicity).toBe(ALCHEMY_RECIPES[pill].toxicity * 2);
      expect(resolveAlchemy(world, actor, use(pill), () => 0)).toBeNull();
    }
  });

  it('high toxicity reduces healing, penalizes vitality and qi, detoxifies without resurrecting the dead', () => {
    const clean = fixture(); const toxic = fixture();
    for (const f of [clean, toxic]) { f.actor.hp = 1; f.actor.qiProgress = 10; f.actor.pills.golden = 1; }
    toxic.actor.pillToxicity = 90;
    resolveAlchemy(clean.world, clean.actor, use('golden'), () => 0);
    resolveAlchemy(toxic.world, toxic.actor, use('golden'), () => 0);
    expect(toxic.actor.hp).toBeLessThan(clean.actor.hp);
    expect(toxic.actor.pillToxicity).toBe(100);
    const hp = toxic.actor.hp; const qi = toxic.actor.qiProgress;
    maintainAlchemy(toxic.world);
    expect(toxic.actor.hp).toBe(hp - 5); expect(toxic.actor.qiProgress).toBe(qi - 4);
    expect(toxic.actor.pillToxicity).toBe(98);
    toxic.actor.hp = 1; toxic.actor.qiProgress = 0;
    maintainAlchemy(toxic.world);
    expect(toxic.actor.hp).toBe(1); expect(toxic.actor.alive).toBe(true); expect(toxic.actor.qiProgress).toBe(0);
    toxic.actor.alive = false; toxic.actor.hp = 0;
    const toxicity = toxic.actor.pillToxicity;
    maintainAlchemy(toxic.world);
    expect(toxic.actor.hp).toBe(0); expect(toxic.actor.pillToxicity).toBe(toxicity);
  });

  it('herbs regrow on a fixed three-tick cadence only up to local capacities', () => {
    const { world, actor, place } = fixture();
    actor.pillToxicity = 1;
    world.tick = 2; maintainAlchemy(world);
    expect(place.herbs.jade_leaf).toBe(3); expect(actor.pillToxicity).toBe(0);
    world.tick = 3; maintainAlchemy(world);
    expect(place.herbs.jade_leaf).toBe(4);
    world.tick = 6; maintainAlchemy(world);
    expect(place.herbs.jade_leaf).toBe(4);
    place.herbCapacity.shadow_moss = 0; place.herbs.shadow_moss = 0;
    world.tick = 9; maintainAlchemy(world);
    expect(place.herbs.shadow_moss).toBe(0);
  });

  it('hostile fictional poison requires a living local enemy, never consumes on stale eligibility', () => {
    const { world, actor, target } = fixture();
    actor.pills.heart_poison = 3;
    target.locationId = actor.locationId;
    world.relationships = [];
    expect(resolveAlchemy(world, actor, use('heart_poison', target.id), () => 0)).toBeNull();
    world.relationships.push({ fromId: target.id, toId: actor.id, type: '竞争', affinity: -40, note: '积怨' });
    expect(availableAlchemy(actor, world)).toContainEqual({ action: 'USE_PILL', targetPillId: 'heart_poison', targetCultivatorId: target.id });
    target.locationId = 'far-away';
    expect(resolveAlchemy(world, actor, use('heart_poison', target.id), () => 0)).toBeNull();
    target.locationId = actor.locationId; target.alive = false;
    expect(resolveAlchemy(world, actor, use('heart_poison', target.id), () => 0)).toBeNull();
    expect(actor.pills.heart_poison).toBe(3);
    target.alive = true; target.hp = 1; target.pillToxicity = 90;
    expect(resolveAlchemy(world, actor, use('heart_poison', actor.id), () => 0)).toBeNull();
    expect(resolveAlchemy(world, actor, use('heart_poison', target.id), () => 0)?.actorIds).toEqual([actor.id, target.id]);
    expect(actor.pills.heart_poison).toBe(2);
    expect(target.hp).toBe(1); expect(target.alive).toBe(true); expect(target.pillToxicity).toBe(100);
    expect(world.relationships[0]).toMatchObject({ type: '血仇', affinity: -60 });
    expect(target.memories[0]?.content).toContain('噬心毒丹');
  });
});
