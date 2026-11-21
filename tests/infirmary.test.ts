import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  advanceInfirmaries, availableInfirmaryActions, createInfirmaryState, infirmaryCapacity, INFIRMARY_DETOX_MAX, INFIRMARY_HEAL_FRACTION,
  INFIRMARY_QUEUE_TICKS, INFIRMARY_SHIFT_TICKS, INFIRMARY_TREATMENT_HERBS, INFIRMARY_TREATMENT_STONES, resolveInfirmaryAction,
  visibleInfirmaries,
} from '../src/engine/infirmaryEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, InfirmaryMove } from '../src/types/world';

function fixture(wardLevel = 1) {
  const world = createInitialWorld(90142);
  world.infirmaries = createInfirmaryState();
  world.tick = 10;
  const sect = world.sects[2];
  const hq = world.locations.find(({ id }) => id === sect.headquartersId)!;
  sect.facilities.alchemy_hall = wardLevel;
  sect.spiritStones = 100;
  hq.herbs.jade_leaf = 6;
  const members = world.cultivators.filter((actor) => actor.sectId === sect.id);
  const leader = members.find(({ id }) => id === sect.leaderId)!;
  const [guard, first, second, addedGuard] = members.filter((actor) => actor !== leader);
  const outsider = world.cultivators.find((actor) => actor.sectId !== sect.id)!;
  for (const actor of [guard, first, second, leader, outsider, ...(addedGuard ? [addedGuard] : [])]) {
    actor.locationId = hq.id;
    actor.maxHp = 200;
    actor.hp = 200;
    actor.pillToxicity = 0;
  }
  first.hp = 60;
  first.pillToxicity = 13;
  second.hp = 100;
  const act = (actor: Cultivator, infirmaryMove: InfirmaryMove, targetInfirmaryCaseId?: string) =>
    resolveInfirmaryAction(world, actor, { chosenAction: 'INFIRMARY', innerMonologue: '候诊必须同意', infirmaryMove, targetInfirmaryCaseId });
  const request = (actor: Cultivator) => {
    expect(act(actor, 'request')?.witnessScope).toBe('participants');
    return world.infirmaries.cases.at(-1)!;
  };
  const staff = (actor = guard) => {
    expect(act(actor, 'staff')?.title).toBe('同门自愿值守静养床');
    return world.infirmaries.shifts.at(-1)!;
  };
  return { world, sect, hq, leader, guard, first, second, addedGuard, outsider, act, request, staff };
}

describe('real sect infirmary triage and voluntary care', () => {
  it('creates a valid shift and queue without healing or charges; only independent actual care is stronger than field rest', () => {
    const { world, sect, hq, guard, first, act, request, staff } = fixture();
    expect(infirmaryCapacity(world, sect.id)).toEqual({ beds: 1, onDuty: 0, stocked: 1, available: 0 });
    const row = request(first);
    const shift = staff();
    expect(shift.expiresTick).toBe(world.tick + INFIRMARY_SHIFT_TICKS);
    expect(row.expiresTick).toBe(world.tick + INFIRMARY_QUEUE_TICKS);
    expect(first.hp).toBe(60);
    expect(first.pillToxicity).toBe(13);
    expect(sect.spiritStones).toBe(100);
    expect(hq.herbs.jade_leaf).toBe(6);
    expect(act(first, 'accept', row.id)).toBeNull();
    expect(act(guard, 'staff')).toBeNull();
    world.tick++;
    expect(infirmaryCapacity(world, sect.id)).toEqual({ beds: 1, onDuty: 1, stocked: 1, available: 1 });
    const field = structuredClone(world);
    const rest = field.cultivators.find(({ id }) => id === first.id)!;
    applyCultivatorBrainDecision(field, rest, { chosenAction: 'REST', innerMonologue: '自行休息' }, () => .5);
    expect(rest.hp).toBe(60 + 70);
    expect(rest.pillToxicity).toBe(9);
    expect(field.infirmaries.cases[0].status).toBe('waiting');
    expect(act(first, 'accept', row.id)?.actorIds).toEqual([first.id, guard.id]);
    expect(act(first, 'accept', row.id)).toBeNull();
    expect(first.hp).toBe(60 + Math.round(first.maxHp * INFIRMARY_HEAL_FRACTION));
    expect(first.pillToxicity).toBe(13 - INFIRMARY_DETOX_MAX);
    expect(row).toMatchObject({ status: 'treated', settledTick: world.tick, receipt: { shiftId: shift.id, guardId: guard.id,
      tick: world.tick, stonesSpent: INFIRMARY_TREATMENT_STONES, herbsSpent: INFIRMARY_TREATMENT_HERBS, hpRestored: 110, toxicityRemoved: 10 } });
    expect(sect.spiritStones).toBe(100 - INFIRMARY_TREATMENT_STONES);
    expect(hq.herbs.jade_leaf).toBe(6 - INFIRMARY_TREATMENT_HERBS);
    expect(infirmaryCapacity(world, sect.id).available).toBe(0);
    expect(availableInfirmaryActions(first, world).some(({ infirmaryMove }) => infirmaryMove === 'request')).toBe(false);
  });

  it('ranks need before wealth and orders equal need by means; refusal immediately opens the actual bed', () => {
    const { world, sect, hq, first, second, outsider, act, request, staff } = fixture();
    first.spiritStones = 500;
    second.spiritStones = 0;
    const lowNeed = request(second);
    const highNeed = request(first);
    staff();
    world.tick++;
    expect(visibleInfirmaries(world, first)?.ownQueuePosition).toBe(1);
    expect(visibleInfirmaries(world, second)?.ownQueuePosition).toBe(2);
    expect(visibleInfirmaries(world, outsider)).toBeUndefined();
    expect(visibleInfirmaries(world, first)?.ownCases.map(({ id }) => id)).toEqual([highNeed.id]);
    expect(act(second, 'accept', lowNeed.id)).toBeNull();
    expect(act(first, 'accept', lowNeed.id)).toBeNull();
    first.hp = second.hp;
    expect(visibleInfirmaries(world, second)?.ownQueuePosition).toBe(1);
    expect(act(second, 'refuse', lowNeed.id)?.witnessScope).toBe('participants');
    expect(act(second, 'refuse', lowNeed.id)).toBeNull();
    expect(second.hp).toBe(100);
    expect(sect.spiritStones).toBe(100);
    expect(hq.herbs.jade_leaf).toBe(6);
    expect(lowNeed).toMatchObject({ status: 'refused', reason: 'refused' });
    expect(visibleInfirmaries(world, first)?.ownQueuePosition).toBe(1);
    expect(act(first, 'accept', highNeed.id)).not.toBeNull();
    expect(first.hp).toBe(first.maxHp);
  });

  it('withdraws offers when stock or an actual local guard is unavailable while waiting has no passive effect', () => {
    const { world, sect, hq, guard, first, act, request, staff } = fixture();
    const row = request(first);
    const shift = staff();
    world.tick++;
    guard.locationId = 'loc-market';
    expect(infirmaryCapacity(world, sect.id)).toMatchObject({ onDuty: 0, available: 0 });
    expect(act(first, 'accept', row.id)).toBeNull();
    expect(advanceInfirmaries(world)).toEqual([]);
    expect(first.hp).toBe(60);
    guard.locationId = hq.id;
    hq.herbs.jade_leaf = 1;
    expect(infirmaryCapacity(world, sect.id)).toMatchObject({ onDuty: 1, stocked: 0 });
    expect(act(first, 'accept', row.id)).toBeNull();
    hq.herbs.jade_leaf = 6;
    sect.spiritStones = 11;
    expect(act(first, 'accept', row.id)).toBeNull();
    sect.spiritStones = 100;
    world.tick = shift.expiresTick;
    expect(act(first, 'accept', row.id)).toBeNull();
    world.tick = row.expiresTick;
    expect(advanceInfirmaries(world)[0]?.witnessScope).toBe('participants');
    expect(advanceInfirmaries(world)).toEqual([]);
    expect(row).toMatchObject({ status: 'closed', reason: 'expiry' });
    expect(sect.spiritStones).toBe(100);
    expect(hq.herbs.jade_leaf).toBe(6);
  });

  it('hands out real separate beds only for actual shifts, and retains the reference after treatment', () => {
    const { world, sect, guard, first, second, leader, addedGuard, act, staff, request } = fixture(2);
    const newcomer = addedGuard ?? { ...leader, id: 'second-test-guard', sectRank: '内门弟子' as const };
    if (!addedGuard) world.cultivators.push(newcomer);
    const firstCase = request(first);
    const secondCase = request(second);
    const primary = staff(guard);
    const secondary = staff(newcomer);
    expect(act(leader, 'staff')).toBeNull();
    world.tick++;
    expect(infirmaryCapacity(world, sect.id).available).toBe(2);
    expect(act(second, 'accept', secondCase.id)).not.toBeNull();
    expect(act(first, 'accept', firstCase.id)).not.toBeNull();
    expect(firstCase.receipt?.guardId).toBe(primary.guardId);
    expect(secondCase.receipt?.guardId).toBe(secondary.guardId);
    expect(infirmaryCapacity(world, sect.id).available).toBe(0);
    world.tick += 100;
    // Fill recent historical shift retention, but treatment still points to the older actual shifts.
    world.infirmaries.shifts.push(...Array.from({ length: 40 }, (_, index) => ({ id: `historical-${index}`, guardId: newcomer.id,
      siteId: secondary.siteId, sectId: sect.id, startedTick: index + 20, expiresTick: index + 23 })));
    expect(advanceInfirmaries(world)).toEqual([]);
    expect(world.infirmaries.shifts.some(({ id }) => id === firstCase.receipt?.shiftId)).toBe(true);
    expect(world.infirmaries.shifts.some(({ id }) => id === secondCase.receipt?.shiftId)).toBe(true);
  });
});
