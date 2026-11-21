import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceDoctrines } from '../src/engine/doctrineEngine';
import { infirmaryCapacity } from '../src/engine/infirmaryEngine';
import { availableSectEconomyActions, isGuardAssignmentActive } from '../src/engine/sectEconomyEngine';
import { maintainSectPolitics } from '../src/engine/sectPoliticsEngine';
import { availableServiceRetirementActions, createServiceRetirementState, isRetiredFromService, resolveServiceRetirementAction,
  SERVICE_RETIREMENT_MIN_TICKS, visibleServiceRetirements } from '../src/engine/serviceRetirementEngine';
import type { Cultivator, DoctrineSchool, SectServiceMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(7119);
  world.serviceRetirement = createServiceRetirementState();
  world.tick = 10;
  const [sect] = world.sects;
  const same = world.cultivators.filter((row) => row.sectId === sect.id);
  const leader = same.find(({ id }) => id === sect.leaderId)!;
  const [official, successor] = same.filter((row) => row.id !== leader.id);
  const outsider = world.cultivators.find((row) => row.sectId !== sect.id)!;
  for (const actor of [leader, official, successor]) {
    actor.locationId = sect.headquartersId;
    actor.age = Math.max(18, actor.age);
    actor.hp = actor.maxHp;
  }
  const move = (actor: Cultivator, serviceMove: SectServiceMove) =>
    resolveServiceRetirementAction(world, actor, { chosenAction: 'SECT_SERVICE', serviceMove, innerMonologue: '只就本人公职作选择。' });
  return { world, sect, leader, official, successor, outsider, move };
}

describe('voluntary real sect role release and re-entry eligibility', () => {
  it('releases real guard, council, stewardship and shift duties while preserving living actors, assets and rank provenance', () => {
    const { world, sect, official, successor, outsider, move } = fixture();
    const field = world.locations.find(({ id }) => id === 'loc-vein-north')!;
    official.sectRank = '长老';
    official.guardAssignment = { assignedTick: 9, expiresTick: 14, locationId: field.id };
    const school: DoctrineSchool = { id: 'real-school', parentSectId: sect.id, theme: 'community', founderId: official.id, stewardId: official.id,
      foundedTick: 4, status: 'autonomous', memberIds: [official.id, successor.id], treasury: 60 };
    world.doctrines.schools.push(school);
    sect.facilities.alchemy_hall = 1;
    world.infirmaries.shifts.push({ id: 'current-shift', guardId: official.id, sectId: sect.id, siteId: sect.headquartersId,
      startedTick: world.tick - 1, expiresTick: world.tick + 1 });
    const original = structuredClone({ spiritStones: official.spiritStones, herbs: official.herbs, pills: official.pills,
      artifacts: official.artifacts, sectId: official.sectId, contribution: official.contribution });
    const citizens = world.cultivators.length;
    expect(isGuardAssignmentActive(official, world)).toBe(true);
    expect(move(official, 'retire')).toMatchObject({ witnessScope: 'participants' });
    expect(move(official, 'retire')).toBeNull();
    expect(move(official, 'return')).toBeNull();
    const record = world.serviceRetirement.history[0];
    expect(record).toMatchObject({ actorId: official.id, kind: 'retire', formerRank: '长老', forumReleased: true, leaderReleased: false,
      guardLocationId: field.id, stewardSchoolIds: [school.id], infirmaryShiftIds: ['current-shift'] });
    expect(isRetiredFromService(official)).toBe(true);
    expect(official).toMatchObject(original);
    expect(official.alive).toBe(true);
    expect(official.guardAssignment).toBeUndefined();
    expect(school.stewardId).toBeUndefined();
    expect(infirmaryCapacity(world, sect.id).onDuty).toBe(0);
    expect(world.infirmaries.shifts[0].id).toBe('current-shift');
    advanceDoctrines(world);
    expect(school.stewardId).toBe(successor.id);
    expect(school.memberIds).toContain(official.id);
    expect(visibleServiceRetirements(world, outsider)).toEqual([]);
    expect(visibleServiceRetirements(world, official)).toEqual([record]);
    expect(world.cultivators).toHaveLength(citizens);
  });

  it('uses real succession after leader and officer leave, no permanent outside replacement and nobody steals office on return', () => {
    const { world, sect, leader, official, successor, move } = fixture();
    official.sectRank = '长老';
    expect(move(official, 'retire')).not.toBeNull();
    expect(move(leader, 'retire')).not.toBeNull();
    expect(sect.leaderId).toBe(leader.id); // existing election pass owns the genuine predecessor.
    expect(maintainSectPolitics(world).some((event) => event.actorIds.includes(successor.id))).toBe(true);
    expect(sect.succession).toMatchObject({ previousLeaderId: leader.id, leaderId: sect.leaderId });
    expect(sect.leaderId).not.toBe(leader.id);
    expect(sect.leaderId).not.toBe(official.id);
    const serving = world.cultivators.find(({ id }) => id === sect.leaderId)!;
    const oath = world.serviceRetirement.history.find((row) => row.actorId === leader.id)!;
    expect(oath).toMatchObject({ formerRank: '掌门', leaderReleased: true });
    expect(availableSectEconomyActions(serving, world).some(({ targetCultivatorId }) => targetCultivatorId === official.id)).toBe(false);
    world.tick += SERVICE_RETIREMENT_MIN_TICKS - 1;
    expect(move(leader, 'return')).toBeNull();
    world.tick++;
    expect(move(leader, 'return')).not.toBeNull();
    expect(move(leader, 'return')).toBeNull();
    expect(move(leader, 'retire')).toBeNull();
    expect(sect.leaderId).toBe(serving.id);
    expect(leader.service).toMatchObject({ status: 'serving', formerRank: '掌门', retiredTick: world.tick - SERVICE_RETIREMENT_MIN_TICKS });
    expect(world.serviceRetirement.history.at(-1)).toMatchObject({ kind: 'return', forumReleased: false, leaderReleased: false,
      stewardSchoolIds: [], infirmaryShiftIds: [] });
  });

  it('releases effective clinic staffing without dropping receipt-bearing shift identity', () => {
    const { world, sect, official, move } = fixture();
    sect.facilities.alchemy_hall = 1;
    const shift = { id: 'bedside-ward', guardId: official.id, sectId: sect.id, siteId: sect.headquartersId,
      startedTick: world.tick - 1, expiresTick: world.tick + 1 };
    world.infirmaries.shifts.push(shift);
    expect(infirmaryCapacity(world, sect.id).onDuty).toBe(1);
    expect(move(official, 'retire')).not.toBeNull();
    expect(infirmaryCapacity(world, sect.id).onDuty).toBe(0);
    expect(world.infirmaries.shifts).toContain(shift);
  });

  it('does not make age or rank automatic and does not bypass a live transit commitment', () => {
    const { world, sect, leader, official, move } = fixture();
    official.sectRank = '外门弟子';
    expect(move(official, 'retire')).toBeNull();
    world.couriers.dispatches.push({ id: 'service-actual-dispatch', senderId: official.id, recipientId: 'recipient',
      courierId: leader.id, originId: sect.headquartersId, destinationId: 'loc-market', openedTick: 8, offerExpiresTick: 11, status: 'in_transit',
      sealed: { kind: 'private_cue', cue: 'request_audience' }, acceptedTick: 9, deadlineTick: 29, path: [{ x: 180, y: 150 }, { x: 500, y: 490 }],
      pathIndex: 0, feePaid: 12 });
    expect(move(leader, 'retire')).toBeNull();
    expect(world.serviceRetirement.history).toEqual([]);
    expect(world.couriers.dispatches[0].status).toBe('in_transit');
    world.couriers.dispatches = [];
    expect(isRetiredFromService(leader)).toBe(false);
    expect(availableServiceRetirementActions(leader, world)).toEqual([{ action: 'SECT_SERVICE', serviceMove: 'retire' }]);
    expect(move(leader, 'return')).toBeNull();
    expect(move(leader, 'retire')).not.toBeNull();
  });
});
