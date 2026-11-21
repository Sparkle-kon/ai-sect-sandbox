import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { sectRelation } from '../src/engine/diplomacyEngine';
import { OBSERVATORY_COST } from '../src/engine/fieldObservatoryEngine';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableShortShiftActions, SHORT_SHIFT_WAGE } from '../src/engine/shortShiftEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { localQiWeather } from '../src/engine/weatherEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '' };
const plan = (world: WorldState, actorId?: string, decision?: LLMDecisionPayload): WorldState => {
  const choices = Object.fromEntries(world.cultivators.filter(({ id }) => id !== actorId).map(({ id }) => [id, rest]));
  if (actorId && decision) choices[actorId] = decision;
  return advanceWorldTick(world, choices, () => .93);
};
const person = (world: WorldState, id: string) => world.cultivators.find((actor) => actor.id === id)!;
const place = (world: WorldState, id: string) => world.locations.find((site) => site.id === id)!;
const selectShift = (world: WorldState, id: string) => world.shortShifts.shifts.find((row) => row.id === id)!;
const move = (shortShiftMove: 'accept' | 'decline' | 'withdraw' | 'work', id: string): LLMDecisionPayload =>
  ({ chosenAction: 'SHORT_SHIFT', shortShiftMove, targetShortShiftId: id, innerMonologue: '' });

function fundedStation() {
  let world = createInitialWorld(11721);
  world.tick = 29;
  world.month = 5;
  const home = world.sects.find((sect) => sect.leaderId && world.locations.some(({ id, ownerSectId }) =>
    id === sect.headquartersId && ownerSectId === sect.id))!;
  const hostId = home.leaderId!;
  const host = person(world, hostId);
  const siteId = home.headquartersId;
  const guest = world.cultivators.find(({ sectId, id }) => id !== hostId && sectId !== home.id &&
    world.sects.some((sect) => sect.id === sectId) && sectRelation(world, home.id, sectId)?.pact !== 'war')!;
  const workerId = guest.id;
  const memberships = { host: { sectId: host.sectId, sectRank: host.sectRank, title: host.title },
    guest: { sectId: guest.sectId, sectRank: guest.sectRank, title: guest.title } };
  for (const actor of world.cultivators) actor.locationId = 'loc-market';
  host.locationId = guest.locationId = siteId;
  guest.personality = '刚正';
  guest.hp = guest.maxHp;
  host.spiritStones = 500;
  guest.spiritStones = 60;
  world = plan(world, hostId, { ...rest, chosenAction: 'FIELD_OBSERVATORY', observatoryMove: 'fund', targetLocationId: siteId });
  const openedTick = world.tick;
  expect(person(world, hostId).spiritStones).toBe(500 - OBSERVATORY_COST);
  expect(world.fieldObservatories.byActor[hostId].runs[0]).toMatchObject({ status: 'pending', openedTick });
  world = plan(world);
  world = plan(world, hostId, { ...rest, chosenAction: 'FIELD_OBSERVATORY', observatoryMove: 'measure',
    targetLocationId: siteId, targetObservatoryTick: openedTick });
  const source = structuredClone(world.fieldObservatories.byActor[hostId].runs[0]);
  expect(source).toMatchObject({ status: 'measured', openedTick, targetTick: world.tick, locationId: siteId });
  return { world, hostId, workerId, siteId, source, memberships };
}

function acceptedShift() {
  const inputs = fundedStation();
  const { hostId, workerId, siteId, source } = inputs;
  const invitation = availableShortShiftActions(person(inputs.world, hostId), inputs.world, inputs.world.tick + 1)
    .find(({ shortShiftMove, targetCultivatorId }) => shortShiftMove === 'offer' && targetCultivatorId === workerId);
  expect(invitation).toMatchObject({ action: 'SHORT_SHIFT', shortShiftMove: 'offer', targetObservatoryTick: source.openedTick });
  let world = plan(inputs.world, hostId, { ...rest, ...invitation, chosenAction: 'SHORT_SHIFT' });
  const [proposed] = world.shortShifts.shifts;
  expect(proposed).toMatchObject({ hostId, workerId, siteId, status: 'offered', escrowStones: 0, observatoryOpenedTick: source.openedTick });
  const escrowSource = person(world, hostId).spiritStones;
  const workerBefore = person(world, workerId).spiritStones;
  expect(applyCultivatorBrainDecision(world, person(world, workerId), move('accept', proposed.id), () => .9)).toBeNull();
  expect(person(world, hostId).spiritStones).toBe(escrowSource);
  world = plan(world, workerId, move('accept', proposed.id));
  expect(selectShift(world, proposed.id)).toMatchObject({ status: 'active', escrowStones: SHORT_SHIFT_WAGE,
    acceptedTick: world.tick, shiftTick: world.tick + 1, paidStones: 0, refundedStones: 0 });
  expect(person(world, hostId).spiritStones).toBe(escrowSource - SHORT_SHIFT_WAGE);
  expect(person(world, workerId).spiritStones).toBe(workerBefore);
  return { ...inputs, world, shiftId: proposed.id, escrowSource, workerBefore };
}

afterEach(() => vi.unstubAllGlobals());

describe('cross-sect attendance from a genuinely funded local field station', () => {
  it('takes the same authoritative attendance and wage through Utility and canonical Cognitive JSON without copying the original reading', async () => {
    const { world, shiftId, hostId, workerId, siteId, source, memberships, escrowSource, workerBefore } = acceptedShift();
    const config = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fictional-key', model: 'fixture' };
    const response = (decision: object) => Response.json({ choices: [{ message: { content: JSON.stringify(decision) } }] });
    const fetcher = vi.fn(async () => response({ ...move('work', shiftId), wages: 501, attendance: { tick: 1 } }));
    vi.stubGlobal('fetch', fetcher);
    const worker = person(world, workerId);
    const targetTick = world.tick + 1;
    expect(await requestCultivatorLLMDecision(worker, world, config, targetTick)).toBeUndefined();
    fetcher.mockImplementation(async () => response(move('work', shiftId)));
    const ordered = await requestCultivatorLLMDecision(worker, world, config, targetTick);
    expect(ordered).toMatchObject({ chosenAction: 'SHORT_SHIFT', shortShiftMove: 'work', targetShortShiftId: shiftId });
    const unworked = plan(world);
    const utility = plan(world, workerId);
    const cognitive = plan(world, workerId, ordered);
    for (const finished of [utility, cognitive]) {
      const shift = selectShift(finished, shiftId);
      const { kind, intensity } = localQiWeather(finished, place(finished, siteId));
      expect(shift).toMatchObject({ status: 'completed', escrowStones: 0, paidStones: SHORT_SHIFT_WAGE, refundedStones: 0,
        attendance: { tick: finished.tick, reading: { kind, intensity } } });
      expect(person(finished, workerId)).toMatchObject({ ...memberships.guest, spiritStones: workerBefore + SHORT_SHIFT_WAGE });
      expect(person(finished, hostId)).toMatchObject({ ...memberships.host, spiritStones: escrowSource - SHORT_SHIFT_WAGE });
      expect(finished.sects.map(({ spiritStones }) => spiritStones)).toEqual(unworked.sects.map(({ spiritStones }) => spiritStones));
      expect(finished.fieldObservatories.byActor[hostId].runs[0]).toEqual(source);
      expect(finished.fieldObservatories.byActor[workerId]).toBeUndefined();
      expect(applyCultivatorBrainDecision(finished, person(finished, workerId), move('work', shiftId), () => .93)).toBeNull();
      expect(person(finished, workerId).spiritStones).toBe(workerBefore + SHORT_SHIFT_WAGE);
      expect(decodeWorldSave(encodeWorldSave(finished)).shortShifts).toEqual(finished.shortShifts);
    }
    expect(utility.shortShifts).toEqual(cognitive.shortShifts);
  });

  it('revokes changed title before onsite work and returns only original escrow once', () => {
    const { world, shiftId, hostId, workerId, siteId, escrowSource, workerBefore } = acceptedShift();
    place(world, siteId).ownerSectId = person(world, workerId).sectId;
    const finished = plan(world, workerId, move('work', shiftId));
    const shift = selectShift(finished, shiftId);
    expect(shift).toMatchObject({ status: 'revoked', closeReason: 'access_revoked', escrowStones: 0,
      refundedStones: SHORT_SHIFT_WAGE, paidStones: 0 });
    expect(shift.attendance).toBeUndefined();
    expect(person(finished, hostId).spiritStones).toBe(escrowSource);
    expect(person(finished, workerId).spiritStones).toBe(workerBefore);
    const repeated = plan(finished, workerId, move('work', shiftId));
    expect(selectShift(repeated, shiftId)).toEqual(shift);
    expect(person(repeated, hostId).spiritStones).toBe(escrowSource);
  });

  it.each(['host', 'worker'] as const)('honors explicit %s withdrawal before work without paying a claim', (leaving) => {
    const { world, shiftId, hostId, workerId, escrowSource, workerBefore } = acceptedShift();
    const roleId = leaving === 'host' ? hostId : workerId;
    const finished = plan(world, roleId, move('withdraw', shiftId));
    expect(selectShift(finished, shiftId)).toMatchObject({ status: 'withdrawn', closeReason: `${leaving}_withdrew`, closedById: roleId,
      escrowStones: 0, refundedStones: SHORT_SHIFT_WAGE, paidStones: 0 });
    expect(selectShift(finished, shiftId).attendance).toBeUndefined();
    expect(person(finished, hostId).spiritStones).toBe(escrowSource);
    expect(person(finished, workerId).spiritStones).toBe(workerBefore);
  });

  it('expires a missed shift even when both people remain colocated with a genuine station', () => {
    const { world, shiftId, hostId, workerId, escrowSource, workerBefore } = acceptedShift();
    const missed = plan(world);
    expect(selectShift(missed, shiftId)).toMatchObject({ status: 'expired', closeReason: 'shift_missed',
      escrowStones: 0, refundedStones: SHORT_SHIFT_WAGE, paidStones: 0 });
    expect(selectShift(missed, shiftId).attendance).toBeUndefined();
    expect(person(missed, hostId).spiritStones).toBe(escrowSource);
    expect(person(missed, workerId).spiritStones).toBe(workerBefore);
  });

  it('returns only held wage to the actual deceased host’s legacy custody without any hire income', () => {
    const { world, shiftId, hostId, workerId, escrowSource, workerBefore } = acceptedShift();
    world.month = 12;
    const host = person(world, hostId);
    host.age = host.lifespan - 1;
    world.cultivators = [host, ...world.cultivators.filter(({ id }) => id !== hostId)];
    const afterDeath = plan(world, workerId, move('work', shiftId));
    expect(person(afterDeath, hostId).alive).toBe(false);
    expect(selectShift(afterDeath, shiftId)).toMatchObject({ status: 'revoked', closeReason: 'party_lost', escrowStones: 0,
      refundedStones: SHORT_SHIFT_WAGE, paidStones: 0 });
    const estate = afterDeath.estates.entries.find(({ deceasedId }) => deceasedId === hostId);
    expect(estate?.holdings.stones).toBe(escrowSource);
    expect(person(afterDeath, hostId).spiritStones).toBe(0);
    expect(person(afterDeath, workerId).spiritStones).toBe(workerBefore);
    const again = plan(afterDeath);
    expect(again.estates.entries.find(({ deceasedId }) => deceasedId === hostId)?.holdings.stones).toBe(escrowSource);
  });
});
