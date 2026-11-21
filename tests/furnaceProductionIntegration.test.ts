import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableAlchemy, resolveAlchemy } from '../src/engine/alchemyEngine';
import { availableArtifactActions, resolveArtifactAction } from '../src/engine/artifactEngine';
import { openFurnaceTurn, resolveFurnaceReservationAction } from '../src/engine/furnaceReservationEngine';
import { resolveRelicAction } from '../src/engine/relicEngine';
import { availableWorkshopActions, resolveWorkshopAction } from '../src/engine/workshopEngine';
import type { Artifact, LLMDecisionPayload } from '../src/types/world';

const brew: LLMDecisionPayload = { chosenAction: 'BREW_PILL', targetPillId: 'foundation', innerMonologue: '' };
const drink: LLMDecisionPayload = { chosenAction: 'USE_PILL', targetPillId: 'foundation', innerMonologue: '' };
const forge: LLMDecisionPayload = { chosenAction: 'FORGE_ARTIFACT', forgeTier: '法器', innerMonologue: '' };
const assemble: LLMDecisionPayload = { chosenAction: 'RELIC', relicMove: 'assemble', targetRelicSetId: 'star-balance', innerMonologue: '' };
const item = (id: string): Artifact => ({ id, name: id, tier: '法器', spiritRoot: '金', durability: 10, maxDurability: 70 });

function fixture() {
  const world = createInitialWorld();
  const [maker, patron, rival, specialist] = world.cultivators.slice(0, 4).sort((a, b) => a.id.localeCompare(b.id));
  const [site, remote] = world.locations;
  site.furnaceGrade = 1;
  for (const actor of world.cultivators) actor.locationId = remote.id;
  for (const actor of [maker, patron, rival, specialist]) {
    actor.locationId = site.id;
    actor.realm = '金丹';
    actor.techniqueMastery = 80;
    actor.artifacts = [];
    actor.spiritStones = 1800;
    actor.herbs.jade_leaf = 15;
    actor.herbs.earth_root = 15;
    actor.pills.foundation = 1;
  }
  const start = () => {
    expect(resolveWorkshopAction(world, patron, {
      chosenAction: 'WORKSHOP', workshopMove: 'offer', workshopTier: '法器', workshopQuantity: 1,
      targetCultivatorId: maker.id, workshopQualityFloor: 'standard', innerMonologue: '',
    }, () => 0)).not.toBeNull();
    const [order] = world.workshops.orders;
    expect(resolveWorkshopAction(world, maker, {
      chosenAction: 'WORKSHOP', workshopMove: 'accept', targetWorkshopId: order.id, innerMonologue: '',
    }, () => 0)).not.toBeNull();
    const work: LLMDecisionPayload = { chosenAction: 'WORKSHOP', workshopMove: 'work',
      targetWorkshopId: order.id, innerMonologue: '' };
    return { order, work };
  };
  return { world, site, maker, patron, rival, specialist, start };
}

describe('one canonical physical furnace across production engines', () => {
  it('charges a failed brew once, bars conflicting forge and workshop with no spend/RNG, and releases next tick', () => {
    const { world, maker, patron, rival, start } = fixture();
    const { order, work } = start();
    world.tick++;
    const escrow = structuredClone(order);
    const forgeStones = patron.spiritStones;
    const failed = vi.fn(() => .999);
    expect(resolveAlchemy(world, rival, brew, failed)?.title).toContain('失手');
    expect(failed).toHaveBeenCalledTimes(1);
    expect(availableArtifactActions(patron, world).some(({ action }) => action === 'FORGE_ARTIFACT')).toBe(false);
    expect(availableArtifactActions(patron, world, world.tick + 1).some(({ action }) => action === 'FORGE_ARTIFACT')).toBe(true);
    expect(availableWorkshopActions(maker, world).some(({ workshopMove }) => workshopMove === 'work')).toBe(false);
    const denied = vi.fn(() => 0);
    expect(resolveArtifactAction(world, patron, forge, denied)).toBeNull();
    expect(resolveWorkshopAction(world, maker, work, denied)).toBeNull();
    expect(denied).not.toHaveBeenCalled();
    expect(patron.spiritStones).toBe(forgeStones);
    expect(order).toEqual(escrow);
    expect(resolveAlchemy(world, rival, drink, denied)).not.toBeNull();
    expect(denied).not.toHaveBeenCalled();
    world.tick++;
    expect(resolveWorkshopAction(world, maker, work, denied)?.title).toBe('工坊铸坯');
    expect(resolveArtifactAction(world, patron, forge, denied)).toBeNull();
    expect(order.work).toHaveLength(1);
    expect(order.escrowStones).toBeLessThan(escrow.escrowStones);
    expect(order.escrowHerbs).toBe(escrow.escrowHerbs - 1);
  });

  it('keeps an invalid workshop finish out of custody and does not consume the slot on a patron inventory cap', () => {
    const { world, maker, patron, rival, start } = fixture();
    const { order, work } = start();
    world.tick++;
    expect(resolveWorkshopAction(world, maker, work, () => 0)).not.toBeNull();
    world.tick++;
    patron.artifacts = Array.from({ length: 12 }, (_, index) => item(`overflow-${index}`));
    const before = structuredClone(order);
    const denied = vi.fn(() => 0);
    expect(resolveWorkshopAction(world, maker, work, denied)).toBeNull();
    expect(denied).not.toHaveBeenCalled();
    expect(order).toEqual(before);
    expect(resolveArtifactAction(world, rival, forge, () => 0)?.title).toContain('成形');
    patron.artifacts.pop();
    world.tick++;
    expect(resolveWorkshopAction(world, maker, work, () => 0)?.title).toBe('工坊验收交割');
    expect(order.work).toHaveLength(2);
    expect(patron.artifacts).toHaveLength(12);
    expect(order.escrowHerbs).toBe(0);
    expect(order.escrowStones).toBe(0);
  });

  it('uses a real named workshop booking only for the matching maker and commission', () => {
    const { world, site, maker, rival, start } = fixture();
    const { order, work } = start();
    expect(resolveFurnaceReservationAction(world, maker, { chosenAction: 'FURNACE_RESERVATION', furnaceMove: 'reserve',
      targetLocationId: site.id, targetWorkshopId: order.id, innerMonologue: '' })).not.toBeNull();
    expect(world.furnaceReservations.uses).toEqual([]);
    expect(availableWorkshopActions(maker, world, false, world.tick + 1)).toContainEqual({
      action: 'WORKSHOP', workshopMove: 'work', targetWorkshopId: order.id,
    });
    world.tick++;
    openFurnaceTurn(world);
    const [held] = world.furnaceReservations.reservations;
    expect(held.status).toBe('reserved');
    const rng = vi.fn(() => 0);
    expect(resolveArtifactAction(world, maker, forge, rng)).toBeNull();
    expect(resolveAlchemy(world, rival, brew, rng)).toBeNull();
    expect(resolveWorkshopAction(world, maker, { ...work, targetWorkshopId: 'different-receipt' }, rng)).toBeNull();
    expect(held.status).toBe('reserved');
    expect(world.furnaceReservations.uses).toEqual([]);
    expect(resolveWorkshopAction(world, maker, work, rng)?.title).toBe('工坊铸坯');
    expect(held.status).toBe('used');
    expect(world.furnaceReservations.uses).toMatchObject([{ actorId: maker.id, tick: world.tick,
      slot: 1, kind: 'workshop', reservationId: held.id }]);
    expect(resolveWorkshopAction(world, maker, work, rng)).toBeNull();
    expect(order.work).toHaveLength(1);
    expect(rng).not.toHaveBeenCalled();
  });

  it('blocks relic assembly, repairs and awakening after both physical grade-two slots are used; binding remains independent', () => {
    const { world, site, maker, patron, rival, specialist } = fixture();
    site.furnaceGrade = 2;
    const freeItem = item('unbound');
    const bound = { ...item('bound'), tier: '灵器' as const, boundTo: specialist.id, resonance: 100 };
    specialist.artifacts = [freeItem, bound];
    world.relics.fragments = [
      { id: 'part-frame', setId: 'star-balance', slot: 'frame', source: { kind: 'wild_cache', locationId: site.id, tick: world.tick },
        holder: { kind: 'actor', id: specialist.id } },
      { id: 'part-core', setId: 'star-balance', slot: 'core', source: { kind: 'wild_cache', locationId: site.id, tick: world.tick },
        holder: { kind: 'actor', id: specialist.id } },
    ];
    const funds = specialist.spiritStones;
    const herbs = specialist.herbs.earth_root;
    const rng = vi.fn(() => 0);
    expect(resolveArtifactAction(world, maker, forge, rng)).not.toBeNull();
    expect(resolveAlchemy(world, maker, brew, rng)).toBeNull();
    expect(resolveAlchemy(world, rival, brew, rng)).not.toBeNull();
    expect(rng).toHaveBeenCalledTimes(2);
    expect(resolveArtifactAction(world, specialist, { ...forge, chosenAction: 'REPAIR_ARTIFACT',
      forgeTier: undefined, targetArtifactId: freeItem.id }, rng)).toBeNull();
    expect(resolveArtifactAction(world, specialist, { ...forge, chosenAction: 'AWAKEN_ARTIFACT',
      forgeTier: undefined, targetArtifactId: bound.id }, rng)).toBeNull();
    expect(resolveRelicAction(world, specialist, assemble)).toBeNull();
    expect(freeItem.durability).toBe(10);
    expect(bound).not.toHaveProperty('soul');
    expect(specialist.spiritStones).toBe(funds);
    expect(specialist.herbs.earth_root).toBe(herbs);
    expect(world.relics.fragments.every(({ holder }) => holder.kind === 'actor')).toBe(true);
    expect(resolveArtifactAction(world, specialist, { chosenAction: 'BIND_ARTIFACT', targetArtifactId: freeItem.id, innerMonologue: '' }, rng)).not.toBeNull();
    expect(availableAlchemy(patron, world).some(({ action }) => action === 'BREW_PILL')).toBe(false);
    world.tick++;
    expect(resolveRelicAction(world, specialist, assemble)).not.toBeNull();
    expect(world.relics.fragments.every(({ holder }) => holder.kind === 'consumed')).toBe(true);
  });
});
