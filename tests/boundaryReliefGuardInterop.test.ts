import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { boundaryReliefCheckpoint } from '../src/engine/boundaryReliefCheckpoint';
import { advanceBoundaryReliefs, resolveBoundaryReliefAction } from '../src/engine/boundaryReliefEngine';
import { availableSectEconomyActions, isGuardPhysicallyOnDuty, maintainSectEconomy, resolveSectEconomyAction } from '../src/engine/sectEconomyEngine';
import type { Cultivator, LLMDecisionPayload } from '../src/types/world';

const legacyDuty = { chosenAction: 'GUARD_DUTY', innerMonologue: '' } as const;

function fixture() {
  const world = createInitialWorld();
  world.tick = 20;
  const [sect] = world.sects;
  const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const [incumbent, incoming, standby] = world.cultivators.filter(({ sectId, id }) => sectId === sect.id && id !== leader.id);
  const hq = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const post = world.locations.find(({ type }) => type === 'spirit_vein')!;
  const alternate = world.locations.find(({ type }) => type === 'secret_realm')!;
  post.ownerSectId = alternate.ownerSectId = sect.id;
  // A real post several contiguous map cells from the actual headquarters, not a duplicate station.
  post.x = hq.x + 165;
  post.y = hq.y;
  for (const actor of [leader, incumbent, incoming, standby]) {
    actor.locationId = hq.id;
    actor.qiProgress = 60;
    actor.hp = actor.maxHp;
    actor.exploredTileIds = world.terrain.tiles.map(({ id }) => id);
  }
  const assign = (guard: Cultivator, siteId: string) => resolveSectEconomyAction(world, leader, {
    chosenAction: 'DISPATCH_GUARD', targetCultivatorId: guard.id, targetLocationId: siteId, innerMonologue: '',
  });
  const duty = (actor: Cultivator) => resolveSectEconomyAction(world, actor, legacyDuty);
  expect(assign(incumbent, post.id)).not.toBeNull();
  expect(duty(incumbent)?.title).toBe('守备到岗');
  const original = { ...incumbent.guardAssignment! };
  const propose = () => {
    expect(resolveBoundaryReliefAction(world, leader, { chosenAction: 'BOUNDARY_RELIEF', boundaryReliefMove: 'offer',
      targetLocationId: post.id, targetCultivatorId: incoming.id, innerMonologue: '' })).not.toBeNull();
    return world.boundaryReliefs.cases.at(-1)!;
  };
  const accept = (id: string) => resolveBoundaryReliefAction(world, incoming, {
    chosenAction: 'BOUNDARY_RELIEF', boundaryReliefMove: 'accept', targetBoundaryReliefId: id, innerMonologue: '',
  } satisfies LLMDecisionPayload);
  const advance = () => { world.tick++; maintainSectEconomy(world); return advanceBoundaryReliefs(world); };
  const staffed = () => world.cultivators.filter((actor) => actor.locationId === post.id && isGuardPhysicallyOnDuty(actor, world));
  return { world, leader, incumbent, incoming, standby, post, hq, alternate, assign, duty, original, propose, accept, advance, staffed };
}

describe('legacy guard and tracked relief interoperability', () => {
  it('keeps incumbent service and unrelated legacy dispatch, then swaps exact guard assignment only after physical route completion', () => {
    const { world, leader, incumbent, incoming, standby, hq, post, alternate, assign, duty, original,
      propose, accept, advance, staffed } = fixture();
    const relief = propose();
    expect(staffed()).toEqual([incumbent]);
    expect(availableSectEconomyActions(leader, world)).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'DISPATCH_GUARD', targetLocationId: alternate.id, targetCultivatorId: standby.id }),
    ]));
    expect(assign(incoming, alternate.id)).toBeNull();
    expect(incumbent.guardAssignment).toEqual(original);
    expect(duty(incumbent)?.title).toBe('巡守灵脉');
    advance();
    expect(accept(relief.id)).not.toBeNull();
    expect(boundaryReliefCheckpoint(world, incoming)).toEqual({ x: hq.x, y: hq.y });
    expect(duty(incoming)).toBeNull();
    expect(incoming.locationId).toBe(hq.id);
    expect(incoming.guardAssignment).toBeUndefined();
    advance();
    expect(relief.status).toBe('travelling');
    expect(relief.pathIndex).toBeGreaterThan(0);
    expect(staffed()).toEqual([incumbent]);
    expect(incoming.guardAssignment).toBeUndefined();
    expect(duty(incoming)).toBeNull();
    for (let rounds = 0; relief.status === 'travelling' && rounds < 10; rounds++) advance();
    expect(relief.status).toBe('completed');
    expect(relief.pathIndex).toBe(relief.path.length - 1);
    expect(incoming.locationId).toBe(post.id);
    expect(incumbent.guardAssignment).toBeUndefined();
    expect(boundaryReliefCheckpoint(world, incoming)).toBeUndefined();
    expect(staffed()).toEqual([incoming]);
    const assigned = { ...incoming.guardAssignment! };
    maintainSectEconomy(world);
    expect(incoming.guardAssignment).toEqual(assigned);
    expect(advanceBoundaryReliefs(world)).toEqual([]);
    expect(staffed()).toEqual([incoming]);
  });

  it('blocks replacement bypass and third-party legacy dispatch over a genuinely uncovered late post', () => {
    const { world, incumbent, incoming, standby, hq, post, alternate, assign, duty, original,
      propose, accept, advance, staffed } = fixture();
    world.tick = original.expiresTick - 2;
    const relief = propose();
    advance();
    expect(accept(relief.id)).not.toBeNull();
    advance();
    expect(world.tick).toBe(original.expiresTick);
    expect(incumbent.guardAssignment).toBeUndefined();
    expect(relief.coverage).toMatchObject({ kind: 'gap', tick: world.tick });
    expect(relief.firstGapTick).toBe(world.tick);
    expect(staffed()).toEqual([]);
    expect(assign(standby, post.id)).toBeNull();
    expect(assign(incoming, alternate.id)).toBeNull();
    expect(duty(incoming)).toBeNull();
    expect(incoming.locationId).toBe(hq.id);
    // The tracked case is not a world-wide ban on ordinary unrelated duties.
    expect(assign(standby, alternate.id)).not.toBeNull();
    expect(duty(standby)?.title).toBe('守备到岗');
    for (let rounds = 0; relief.status === 'travelling' && rounds < 10; rounds++) advance();
    expect(relief.status).toBe('completed');
    expect(relief.firstGapTick).toBe(original.expiresTick);
    expect(relief.coverage).toMatchObject({ kind: 'relief', guardId: incoming.id });
    expect(staffed()).toEqual([incoming]);
    expect(standby.guardAssignment?.locationId).toBe(alternate.id);
  });
});
