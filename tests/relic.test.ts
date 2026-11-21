import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { artifactPowerMultiplier, activeRelicResonance, equippedArtifact, RELIC_RESONANCE_BONUS, resolveArtifactAction } from '../src/engine/artifactEngine';
import { advanceEstates } from '../src/engine/estateEngine';
import { advanceOccasions } from '../src/engine/occasionEngine';
import { availableRelicActions, createRelicState, grantExpeditionRelic, heldRelicFragments, reconcileRelicCustody, RELIC_SETS,
  resolveRelicAction, transferLootedRelics } from '../src/engine/relicEngine';
import type { RelicFragment, WorldEvent, WorldOccasion } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(54);
  world.relics = createRelicState(world.locations, world.random.seed);
  const actor = world.cultivators[0], other = world.cultivators[1];
  const cacheSite = world.locations.find(({ type }) => type === 'spirit_vein')!;
  const testingSite = world.locations.find(({ type }) => type === 'secret_realm')!;
  actor.locationId = cacheSite.id;
  other.locationId = cacheSite.id;
  actor.spiritStones = 500;
  actor.herbs.earth_root = 4;
  world.tick = 10;
  const frame = world.relics.fragments.find((item) => item.holder.id === cacheSite.id && item.slot === 'frame')!;
  const recover = (fragment = frame, person = actor) => resolveRelicAction(world, person, {
    chosenAction: 'RELIC', relicMove: 'recover', targetRelicFragmentId: fragment.id, innerMonologue: '核验遗器碎片',
  });
  const assemble = () => resolveRelicAction(world, actor, {
    chosenAction: 'RELIC', relicMove: 'assemble', targetRelicSetId: 'star-balance', innerMonologue: '集齐两槽后重铸',
  });
  const expedition = (): { occasion: WorldOccasion; source: WorldEvent } => {
    const occasion: WorldOccasion = { id: 'fixture-expedition', kind: 'expedition', locationId: testingSite.id, title: '核验用秘境',
      startedTick: 2, registrationClosesTick: 5, expiresTick: 20, status: 'running', participantIds: [actor.id],
      remainingIds: [actor.id], bouts: [], expeditions: [], round: 0 };
    world.occasions.push(occasion);
    const source: WorldEvent = { id: `evt-${world.tick}-${occasion.id}-expedition-${actor.id}`, year: world.year, month: world.month,
      tick: world.tick, title: '秘境传来消息', description: '真实探索系统结算', category: 'heavenly', actorIds: [actor.id], locationId: occasion.locationId };
    return { occasion, source };
  };
  return { world, actor, other, cacheSite, testingSite, frame, recover, assemble, expedition };
}

describe('relic provenance and equipped set resonance', () => {
  it('seeds finite physical complementary caches; moves only on-site possession without multiple recovery or foreign visibility', () => {
    const { world, actor, other, frame, recover, cacheSite, testingSite } = fixture();
    expect(world.relics).toEqual(createRelicState([...world.locations].reverse(), world.random.seed));
    expect(world.relics).not.toEqual(createRelicState(world.locations, world.random.seed + 1));
    expect(new Set(world.relics.fragments.map(({ id }) => id)).size).toBe(world.relics.fragments.length);
    expect(world.relics.fragments.filter((item) => item.holder.id === cacheSite.id).map(({ slot }) => slot).sort()).toEqual(['core', 'frame']);
    const birthStock = world.relics.fragments.length;
    expect(recover()?.title).toBe('拾得遗器碎片');
    expect(recover()).toBeNull();
    expect(recover(frame, other)).toBeNull();
    const alternateFrame = world.relics.fragments.find((item) => item.holder.id === testingSite.id && item.slot === 'frame')!;
    actor.locationId = testingSite.id;
    expect(recover(alternateFrame)).toBeNull(); // One actor cannot monopolize known natural sites for the same missing slot.
    expect(heldRelicFragments(world, actor.id)).toEqual([frame]);
    expect(heldRelicFragments(world, other.id)).toEqual([]);
    expect(frame.source).toMatchObject({ kind: 'wild_cache', tick: 1, locationId: cacheSite.id });
    expect(world.relics.fragments.length).toBe(birthStock);
  });

  it('gives the complementary slot only after recorded expedition loot and consumes real funded input with auditable provenance', () => {
    const { world, actor, frame, assemble, recover, expedition } = fixture();
    recover();
    const { occasion, source } = expedition();
    expect(grantExpeditionRelic(world, occasion, actor, source)).toBeNull();
    occasion.expeditions.push({ cultivatorId: actor.id, tick: world.tick, outcome: 'loot', description: '实得' });
    expect(grantExpeditionRelic(world, occasion, actor, { ...source, id: 'faked-id' })).toBeNull();
    expect(grantExpeditionRelic(world, occasion, actor, source)?.title).toBe('秘境实录添入遗器碎片');
    expect(grantExpeditionRelic(world, occasion, actor, source)).toBeNull();
    const core = heldRelicFragments(world, actor.id).find(({ slot }) => slot === 'core')!;
    expect(core.source).toMatchObject({ kind: 'expedition', eventId: source.id, occasionId: occasion.id, locationId: occasion.locationId, tick: world.tick });
    expect(assemble()).toBeNull();
    const forge = world.locations.find(({ furnaceGrade }) => furnaceGrade >= 2)!;
    actor.locationId = forge.id;
    actor.spiritStones = 5;
    expect(assemble()).toBeNull();
    actor.spiritStones = 500;
    const rule = RELIC_SETS['star-balance'];
    expect(availableRelicActions(actor, world)).toContainEqual({ action: 'RELIC', relicMove: 'assemble', targetRelicSetId: 'star-balance' });
    expect(assemble()?.title).toBe('遗器合璧重铸');
    expect(assemble()).toBeNull();
    const artifact = actor.artifacts.at(-1)!;
    expect(artifact).toMatchObject({ relicSetId: 'star-balance', relicFragmentIds: [frame.id, core.id] });
    expect(frame.holder).toEqual({ kind: 'consumed', id: artifact.id });
    expect(core.holder).toEqual(frame.holder);
    expect(heldRelicFragments(world, actor.id)).toEqual([]);
    expect(actor.spiritStones).toBe(500 - rule.stoneCost);
    expect(actor.herbs.earth_root).toBe(4 - rule.earthCost);
  });

  it('is naturally earned by the existing runtime expedition resolver', () => {
    const { world, actor, testingSite, expedition, recover } = fixture();
    recover();
    const { occasion, source } = expedition();
    actor.locationId = testingSite.id;
    const events = advanceOccasions(world, () => .99);
    expect(occasion.expeditions[0]?.outcome).toBe('loot');
    expect(events.some(({ id }) => id === source.id)).toBe(true);
    expect(events.some(({ title }) => title === '秘境实录添入遗器碎片')).toBe(true);
    expect(heldRelicFragments(world, actor.id).some((entry) => entry.slot === 'core' && entry.source.eventId === source.id)).toBe(true);
  });

  it('uses existing binding and equips at most one intact set bonus without changing legacy ordering', () => {
    const { world, actor, cacheSite, recover, assemble } = fixture();
    recover();
    const core = world.relics.fragments.find((item) => item.holder.id === cacheSite.id && item.slot === 'core')!;
    recover(core);
    actor.locationId = world.locations.find(({ furnaceGrade }) => furnaceGrade >= 2)!.id;
    assemble();
    const relic = actor.artifacts.at(-1)!;
    const legacy = equippedArtifact(actor);
    expect(legacy).not.toBe(relic);
    expect(activeRelicResonance(actor)).toBe(0);
    expect(resolveArtifactAction(world, actor, { chosenAction: 'BIND_ARTIFACT', targetArtifactId: relic.id, innerMonologue: '' }, () => 0)).not.toBeNull();
    expect(equippedArtifact(actor)).toBe(relic);
    expect(activeRelicResonance(actor)).toBe(RELIC_RESONANCE_BONUS);
    const without = structuredClone(actor);
    delete without.artifacts.at(-1)!.relicSetId;
    expect(artifactPowerMultiplier(actor) - artifactPowerMultiplier(without)).toBeCloseTo(RELIC_RESONANCE_BONUS);
    actor.artifacts.push({ ...relic, id: 'backup-relic', boundTo: undefined });
    expect(activeRelicResonance(actor)).toBe(RELIC_RESONANCE_BONUS);
    relic.durability = 0;
    expect(activeRelicResonance(actor)).toBe(0);
  });

  it('moves custody once on verified loot or through probate, preserving original date and place', () => {
    const { world, actor, other, frame, cacheSite, recover } = fixture();
    recover();
    const core = world.relics.fragments.find((item) => item.holder.id === cacheSite.id && item.slot === 'core')!;
    recover(core, other);
    const original = structuredClone(frame.source);
    actor.alive = false; actor.hp = 0;
    const battle: WorldEvent = { id: 'verified-duel', tick: world.tick, year: world.year, month: world.month, category: 'death',
      actorIds: [other.id, actor.id], duelWinnerId: other.id, locationId: cacheSite.id, title: '斗法结果', description: '合法胜负' };
    expect(transferLootedRelics(world, other, actor, { ...battle, category: 'combat' })).toBe(0);
    expect(transferLootedRelics(world, other, actor, battle)).toBe(1);
    expect(transferLootedRelics(world, other, actor, battle)).toBe(0);
    advanceEstates(world);
    reconcileRelicCustody(world);
    expect(frame.holder).toEqual({ kind: 'actor', id: other.id });
    const heir = world.cultivators.find((person) => person.alive && person.id !== other.id)!;
    other.namedHeirId = heir.id;
    other.alive = false; other.hp = 0;
    advanceEstates(world);
    reconcileRelicCustody(world);
    const estate = world.estates.entries.find(({ deceasedId }) => deceasedId === other.id)!;
    expect(frame.holder).toEqual({ kind: 'estate', id: estate.id });
    expect(core.holder).toEqual(frame.holder);
    world.tick = estate.closesTick;
    advanceEstates(world);
    reconcileRelicCustody(world);
    reconcileRelicCustody(world);
    expect(frame.holder).toEqual({ kind: 'actor', id: heir.id });
    expect(core.holder).toEqual(frame.holder);
    expect(frame.source).toEqual(original);
    expect(world.relics.fragments.filter((item: RelicFragment) => item.id === frame.id)).toHaveLength(1);
  });
});
