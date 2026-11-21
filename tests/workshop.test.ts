import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceEstates } from '../src/engine/estateEngine';
import { ARTIFACT_RULES, resolveArtifactAction } from '../src/engine/artifactEngine';
import { projectResourceFlowMonth } from '../src/engine/resourceFlowEngine';
import {
  advanceWorkshops, availableWorkshopActions, createWorkshopState, resolveWorkshopAction, visibleWorkshopOrders,
  WORKSHOP_ACTIVE_OFFERS_PER_SITE, WORKSHOP_CAPACITY, WORKSHOP_HERB, WORKSHOP_TERMINAL_LIMIT, workshopTerms,
} from '../src/engine/workshopEngine';
import type { Cultivator, LLMDecisionPayload, WorkshopMove, WorkshopQualityFloor, WorkshopTier } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.workshops = createWorkshopState();
  world.tick = 30;
  // Keep the named maker within the engine's two advertised candidates, without relaxing the real offer gate.
  const [maker, patron, peer, outsider] = [...world.cultivators.slice(0, 4)]
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const site = world.locations[0];
  const remote = world.locations[1];
  for (const actor of world.cultivators) if (![patron, maker, peer, outsider].includes(actor)) actor.locationId = remote.id;
  for (const actor of [patron, maker, peer, outsider]) {
    actor.artifacts = [];
    actor.locationId = site.id;
    actor.realm = '练气';
    actor.techniqueMastery = 0;
    actor.spiritStones = 400;
    actor.herbs[WORKSHOP_HERB] = 20;
    actor.alive = true;
    actor.hp = actor.maxHp;
    actor.tribulation = undefined;
  }
  site.furnaceGrade = 1;
  site.spiritRoot = '火';
  maker.spiritRoot = '金';
  const run = (actor: Cultivator, move: WorkshopMove, fields: Partial<LLMDecisionPayload> = {},
    roll: () => number = () => 0) => resolveWorkshopAction(world, actor, {
      chosenAction: 'WORKSHOP', innerMonologue: 'sandbox test', workshopMove: move, ...fields,
    }, roll);
  const offer = (quantity: 1 | 2 = 1, qualityFloor: WorkshopQualityFloor = 'standard', tier: WorkshopTier = '法器',
    actor = patron, recipient = maker) => run(actor, 'offer', {
      targetCultivatorId: recipient.id, workshopTier: tier, workshopQuantity: quantity, workshopQualityFloor: qualityFloor,
    });
  const start = (quantity: 1 | 2 = 1, floor: WorkshopQualityFloor = 'standard') => {
    expect(offer(quantity, floor)).toBeTruthy();
    const order = world.workshops.orders.at(-1)!;
    expect(run(maker, 'accept', { targetWorkshopId: order.id })).toBeTruthy();
    return order;
  };
  const step = (orderId: string, roll?: () => number) => {
    world.tick++;
    return run(maker, 'work', { targetWorkshopId: orderId }, roll);
  };
  return { world, patron, maker, peer, outsider, site, remote, run, offer, start, step };
}

describe('commissioned workshop inventory, quality and participant receipts', () => {
  it('uses consent, deposits actual assets once, and keeps offers participant-private without producing anything', () => {
    const { world, patron, maker, outsider, run, offer } = fixture();
    const terms = workshopTerms('法器', 2);
    expect(offer(2)?.witnessScope).toBe('participants');
    const [order] = world.workshops.orders;
    expect(order).toMatchObject({ status: 'offered', escrowStones: 0, escrowHerbs: 0 });
    expect(patron.spiritStones).toBe(400);
    expect(patron.herbs[WORKSHOP_HERB]).toBe(20);
    expect(visibleWorkshopOrders(world, patron)).toEqual([order]);
    expect(visibleWorkshopOrders(world, maker)).toEqual([order]);
    expect(visibleWorkshopOrders(world, outsider)).toEqual([]);
    expect(visibleWorkshopOrders(world)).toEqual([]);
    expect(visibleWorkshopOrders(world, structuredClone(patron))).toEqual([]);
    expect(run(outsider, 'accept', { targetWorkshopId: order.id })).toBeNull();
    expect(run(maker, 'accept', { targetWorkshopId: order.id })).toBeTruthy();
    expect(run(maker, 'accept', { targetWorkshopId: order.id })).toBeNull();
    expect(run(maker, 'work', { targetWorkshopId: order.id })).toBeNull();
    expect(order).toMatchObject({ status: 'active', escrowStones: terms.totalStones, escrowHerbs: terms.totalHerbs, work: [] });
    expect(patron.spiritStones).toBe(400 - terms.totalStones);
    expect(patron.herbs[WORKSHOP_HERB]).toBe(20 - terms.totalHerbs);
    const entries = projectResourceFlowMonth(world, world.tick, { kind: 'observer' })!.rows;
    expect(entries.map(({ good, amount }) => [good, amount])).toEqual([['stone', terms.totalStones], [WORKSHOP_HERB, terms.totalHerbs]]);
    expect(entries.every(row => row.kind === 'transfer' && row.to.kind === 'workshop' && row.reason === 'workshop_deposit')).toBe(true);
  });

  it('makes two accepted artifacts only through four actual turns and transfers wages exactly once per piece', () => {
    const { world, patron, maker, start, step, run } = fixture();
    const order = start(2);
    const rolls = vi.fn(() => 0);
    const terms = workshopTerms('法器', 2);
    for (let turn = 0; turn < 4; turn++) {
      expect(step(order.id, rolls)).toBeTruthy();
      expect(run(maker, 'work', { targetWorkshopId: order.id }, rolls)).toBeNull();
      expect(order.work).toHaveLength(turn + 1);
      expect(patron.artifacts).toHaveLength(Math.floor((turn + 1) / 2));
    }
    expect(rolls).toHaveBeenCalledTimes(2);
    expect(order).toMatchObject({ status: 'completed', escrowHerbs: 0, escrowStones: 0, refundedStones: 0 });
    expect(order.work.map(({ stage, piece, quality, qualityScore }) => [stage, piece, quality, qualityScore])).toEqual([
      ['blank', 1, undefined, undefined], ['finish', 1, 'standard', 42],
      ['blank', 2, undefined, undefined], ['finish', 2, 'standard', 42],
    ]);
    expect(patron.artifacts.map(({ id }) => id)).toEqual([`workshop-artifact-${order.id}-1`, `workshop-artifact-${order.id}-2`]);
    expect(patron.artifacts.every(({ maxDurability, boundTo }) => maxDurability === ARTIFACT_RULES['法器'].durability && !boundTo)).toBe(true);
    expect(maker.spiritStones).toBe(400 + 2 * terms.feePerPiece);
    expect(patron.spiritStones + maker.spiritStones + order.escrowStones).toBe(800 - 2 * terms.fuelPerPiece);
    expect(patron.herbs[WORKSHOP_HERB] + order.escrowHerbs).toBe(16);
    expect(advanceWorkshops(world)).toEqual([]);
  });

  it('grades from actual conditions and rejects below-floor or ruined pieces without producing or paying wages', () => {
    const standard = fixture();
    const rejected = standard.start(1, 'fine');
    standard.step(rejected.id);
    standard.step(rejected.id);
    const terms = workshopTerms('法器', 1);
    expect(rejected.work[1]).toMatchObject({ quality: 'standard', qualityScore: 42 });
    expect(rejected.work[1]).not.toHaveProperty('artifactId');
    expect(standard.patron.artifacts).toEqual([]);
    expect(standard.patron.spiritStones).toBe(400 - terms.fuelPerPiece);
    expect(standard.maker.spiritStones).toBe(400);
    expect(rejected.refundedStones).toBe(terms.feePerPiece);
    expect(rejected.refundedHerbs).toBe(0);

    const fine = fixture();
    const accepted = fine.start(1, 'fine');
    fine.step(accepted.id);
    fine.maker.techniqueMastery = 80;
    fine.maker.spiritRoot = fine.site.spiritRoot;
    fine.site.furnaceGrade = 3;
    fine.step(accepted.id);
    expect(accepted.work[1]).toMatchObject({ quality: 'fine', qualityScore: 90, feePaid: terms.feePerPiece });
    expect(fine.patron.artifacts[0].maxDurability).toBe(Math.ceil(ARTIFACT_RULES['法器'].durability * 1.2));

    const damaged = fixture();
    const ruined = damaged.start();
    damaged.step(ruined.id);
    damaged.maker.hp = 1;
    damaged.step(ruined.id);
    expect(ruined.work[1]).toMatchObject({ quality: 'failed', qualityScore: 32 });
    expect(damaged.patron.artifacts).toEqual([]);
  });

  it('pauses absent parties and full recipients without debit or RNG, then only refunds unspent materials at expiry', () => {
    const { world, patron, maker, remote, run, start, step } = fixture();
    const order = start(2);
    const terms = workshopTerms('法器', 2);
    step(order.id);
    const originalSite = patron.locationId;
    patron.locationId = remote.id;
    const roll = vi.fn(() => 0);
    expect(step(order.id, roll)).toBeNull();
    patron.locationId = originalSite;
    patron.artifacts = Array.from({ length: WORKSHOP_CAPACITY }, (_, i) => ({ id: `spare-${i}`, name: '已有器物', spiritRoot: '金' }));
    expect(step(order.id, roll)).toBeNull();
    expect(roll).not.toHaveBeenCalled();
    expect(order.work).toHaveLength(1);
    expect(order.escrowStones).toBe(terms.totalStones - terms.blankFuel);
    world.tick = order.deadlineTick!;
    expect(advanceWorkshops(world)).toHaveLength(1);
    expect(order).toMatchObject({ status: 'expired', closeReason: 'work_expired', refundedHerbs: terms.totalHerbs - 1,
      refundedStones: terms.totalStones - terms.blankFuel, escrowHerbs: 0, escrowStones: 0 });
    expect(patron.spiritStones).toBe(400 - terms.blankFuel);
    expect(patron.herbs[WORKSHOP_HERB]).toBe(19);
    expect(run(maker, 'work', { targetWorkshopId: order.id }, roll)).toBeNull();
    expect(advanceWorkshops(world)).toEqual([]);
  });

  it('cancels a partial batch without duplicating accepted output, extracting a second wage, or restoring spent fuel', () => {
    const { patron, maker, start, step, run } = fixture();
    const order = start(2);
    const terms = workshopTerms('法器', 2);
    step(order.id);
    step(order.id);
    const artifact = patron.artifacts[0];
    step(order.id);
    expect(run(patron, 'cancel', { targetWorkshopId: order.id })).toBeTruthy();
    expect(run(maker, 'cancel', { targetWorkshopId: order.id })).toBeNull();
    expect(order).toMatchObject({ status: 'cancelled', closeReason: 'patron_cancelled',
      refundedStones: terms.totalStones - terms.fuelPerPiece - terms.blankFuel - terms.feePerPiece, refundedHerbs: 1 });
    expect(patron.artifacts).toEqual([artifact]);
    expect(maker.spiritStones).toBe(400 + terms.feePerPiece);
    expect(patron.herbs[WORKSHOP_HERB]).toBe(17);
  });

  it('releases deceased patron refund into the exact actor ledger, then normal probate adopts it', () => {
    const { world, patron, start, step } = fixture();
    const order = start();
    step(order.id);
    const terms = workshopTerms('法器', 1);
    patron.alive = false;
    patron.hp = 0;
    expect(advanceWorkshops(world)).toHaveLength(1);
    expect(order.closeReason).toBe('patron_unavailable');
    expect(patron.spiritStones).toBe(400 - terms.blankFuel);
    expect(advanceEstates(world)).toHaveLength(1);
    const estate = world.estates.entries.find(({ deceasedId }) => deceasedId === patron.id)!;
    expect(estate.holdings.stones).toBe(400 - terms.blankFuel);
    expect(estate.holdings.herbs[WORKSHOP_HERB]).toBe(19);
    expect(patron.spiritStones).toBe(0);
    expect(advanceWorkshops(world)).toEqual([]);
    advanceEstates(world);
    expect(estate.holdings.stones).toBe(400 - terms.blankFuel);
  });

  it('prevents site overbooking, rejects illegal payload terms, and retains only the last closed orders', () => {
    const { world, patron, maker, peer, outsider, run, offer } = fixture();
    expect(offer(1, 'standard', '灵器')).toBeNull(); // No qualified furnace or maker.
    expect(offer()).toBeTruthy();
    expect(offer(1, 'standard', '法器', peer)).toBeTruthy();
    expect(world.workshops.orders).toHaveLength(WORKSHOP_ACTIVE_OFFERS_PER_SITE);
    expect(offer(1, 'standard', '法器', outsider)).toBeNull();
    const [first, second] = world.workshops.orders;
    expect(run(maker, 'accept', { targetWorkshopId: first.id, workshopQuantity: 2 })).toBeNull();
    expect(run(maker, 'accept', { targetWorkshopId: first.id })).toBeTruthy();
    expect(run(maker, 'accept', { targetWorkshopId: second.id })).toBeNull();
    expect(run(maker, 'decline', { targetWorkshopId: second.id })).toBeTruthy();
    expect(peer.spiritStones).toBe(400);
    expect(run(patron, 'cancel', { targetWorkshopId: first.id })).toBeTruthy();
    for (let i = 0; i < WORKSHOP_TERMINAL_LIMIT + 4; i++) {
      world.tick++;
      expect(offer()).toBeTruthy();
      const id = world.workshops.orders.at(-1)!.id;
      expect(run(maker, 'decline', { targetWorkshopId: id })).toBeTruthy();
      advanceWorkshops(world);
    }
    expect(world.workshops.orders).toHaveLength(WORKSHOP_TERMINAL_LIMIT);
    expect(world.workshops.orders.map(({ id }) => id)).not.toContain(first.id);
    expect(patron.spiritStones).toBe(400);
  });

  it('does not change regular direct forge or consume world RNG when only listing options', () => {
    const { world, patron } = fixture();
    const prior = { ...world.random };
    expect(availableWorkshopActions(patron, world)).not.toHaveLength(0);
    expect(world.random).toEqual(prior);
    expect(resolveArtifactAction(world, patron, { chosenAction: 'FORGE_ARTIFACT', forgeTier: '法器', innerMonologue: '' }, () => 0)).toBeTruthy();
    expect(patron.spiritStones).toBe(400 - ARTIFACT_RULES['法器'].stones);
    expect(patron.artifacts).toHaveLength(1);
    expect(world.workshops.orders).toEqual([]);
  });
});
