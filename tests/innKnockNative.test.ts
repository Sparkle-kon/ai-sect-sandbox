import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { publicChronicleSceneEvents } from '../src/engine/chronicleLead';
import { availableNightDoorActions, projectNightDoor } from '../src/engine/nightDoor';
import { nightDoorBedsHeld, nightDoorGuestHeld, nightDoorHouseholdHeld } from '../src/engine/nightDoorBeds';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { availablePilgrimageActions } from '../src/engine/pilgrimageEngine';
import { availablePilgrimageForkActions, pilgrimageForkCheckpoint } from '../src/engine/pilgrimageFork';
import { housingShelterProof, housingVacantCapacity } from '../src/engine/seasonalHousingEngine';
import { availableSettlementActions } from '../src/engine/settlementEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { knownMapLocations, terrainTileAt } from '../src/engine/terrainEngine';
import { availableVillageWorksActions } from '../src/engine/villageWorksEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

afterEach(() => { vi.unstubAllGlobals(); llmScheduler.resetTickBudget(); });

const guest = 'npc-1', candidate = 'npc-2', builder = 'npc-5', remote = 'npc-8';
const host = 'recruit-village-loc-market-vol-1';
const origin = 'loc-taixu', midpoint = 'loc-danxia', inn = 'loc-market';
const villageId = 'village-loc-market', shelter = 'village-work-1';
const matchingContact = 'evt-5-recruit-village-loc-market-vol-1-social';
const forkId = 'pilgrimage-fork-pilgrimage-1-10';
const hazardId = 'hazard-2-tile-10-11';
const encounterId = `night-door-${forkId}-${guest}`;
const householdId = 'household-village-loc-market-first';
const arrivalId = 'evt-pilgrimage-fork-pilgrimage-1-10-npc-1-arrived-17';
const refugeId = 'brush-vein-tile-13-12';
const person = (world: WorldState, id: string) => world.cultivators.find(row => row.id === id)!;
const place = (world: WorldState, id: string) => world.locations.find(row => row.id === id)!;
const at = (world: WorldState, id: string) => person(world, id).locationId;
const choiceAt = (world: WorldState) => world.pilgrimageForks?.forks.find(row => row.id === forkId)
  ?.choices.find(row => row.actorId === guest)!;
const decision = (chosenAction: LLMDecisionPayload['chosenAction'],
  fields: Partial<LLMDecisionPayload> = {}): LLMDecisionPayload =>
  ({ chosenAction, innerMonologue: '只记脚下实走之路，和门前亲见之人。', ...fields });
const rest = decision('REST');
const explore = (targetLocationId: string) => decision('EXPLORE', { targetLocationId });
const turn = (world: WorldState, orders: Readonly<Record<string, LLMDecisionPayload>> = {}) =>
  advanceWorldTick(world, Object.fromEntries(world.cultivators.map(({ id }) => [id, orders[id] ?? rest])),
    () => .99, 'utility');
const reopen = (world: WorldState) => {
  const bytes = encodeEraWorldSave(world);
  const decoded = decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(decoded)).toBe(bytes);
  return decoded;
};

function underway() {
  let world = createInitialWorld(13071, 'classic');
  world = turn(world, { [guest]: explore(inn), [candidate]: explore(inn),
    [builder]: decision('GATHER_HERBS', { targetHerbId: 'earth_root' }) });
  expect(person(world, builder).herbs.earth_root).toBe(2);
  world = turn(world, { [guest]: explore(origin), [builder]: explore(inn) });
  expect([at(world, guest), at(world, candidate), at(world, builder)]).toEqual([origin, inn, inn]);
  expect(world.cultivators.some(row => row.id === host)).toBe(false);
  const recruit = availableSettlementActions(person(world, builder), world).find(row =>
    row.action === 'RECRUIT_SETTLER' && row.targetVolunteerId === 'village-loc-market-vol-1')!;
  expect(recruit).toBeDefined();
  world = turn(world, { [builder]: decision('RECRUIT_SETTLER',
    { targetVolunteerId: recruit.targetVolunteerId, targetSettlementId: recruit.targetSettlementId }) });
  expect(world.tick).toBe(4);
  expect(person(world, host)).toMatchObject({ name: '乔照山', locationId: inn, spiritStones: 25 });
  expect(world.households.members.find(row => row.recruitedId === host)).toMatchObject({
    settlementId: villageId, householdId: 'household-village-loc-market-first', settledTick: 4, status: 'recruited',
  });
  expect(availableVillageWorksActions(person(world, builder), world)).toContainEqual({
    action: 'VILLAGE_WORKS', villageWorkKind: 'shelter', targetSettlementId: villageId,
  });
  world = turn(world, {
    [host]: decision('SOCIALIZE', { targetCultivatorId: candidate }),
    [builder]: decision('VILLAGE_WORKS', { villageWorkKind: 'shelter', targetSettlementId: villageId }),
  });
  expect(world.events.find(row => row.id === matchingContact)).toMatchObject({
    actorIds: [host, candidate], locationId: inn, tick: 5, category: 'diplomacy',
  });
  expect(world.relationships.some(row => [row.fromId, row.toId].includes(host) &&
    [row.fromId, row.toId].includes(guest))).toBe(false);

  world = turn(world, { [candidate]: explore(origin) });
  expect(availablePilgrimageActions(person(world, guest), world, true, world.tick + 1)).toContainEqual({
    action: 'PILGRIMAGE', pilgrimageMove: 'propose', targetCultivatorId: candidate,
    targetLocationId: midpoint, targetPilgrimageNextStopId: inn,
  });
  world = turn(world, { [guest]: decision('PILGRIMAGE', { pilgrimageMove: 'propose',
    targetCultivatorId: candidate, targetLocationId: midpoint, targetPilgrimageNextStopId: inn }) });
  const journey = world.pilgrimages.journeys[0].id;
  world = turn(world, { [candidate]: decision('PILGRIMAGE', { pilgrimageMove: 'accept', targetPilgrimageId: journey }) });
  for (let i = 0; i < 2; i++) world = turn(world, { [guest]: decision('PILGRIMAGE',
    { pilgrimageMove: 'advance', targetPilgrimageId: journey }) });
  expect(world.tick).toBe(10);
  expect([at(world, guest), at(world, candidate), at(world, host)]).toEqual([midpoint, midpoint, inn]);
  expect(housingShelterProof(world, villageId, shelter, world.tick + 1)).toMatchObject({
    sponsorId: builder, startedTick: 5, settledTick: 7, laborTotal: 4, stonesSpent: 30, rootsSpent: 2,
  });
  expect(housingVacantCapacity(world, villageId, world.tick)).toBe(6);
  expect(availablePilgrimageForkActions(person(world, guest), world)).toContainEqual({
    action: 'PILGRIMAGE_FORK', pilgrimageForkMove: 'escort', targetPilgrimageForkId: forkId, targetLocationId: inn,
  });
  world = turn(world, {
    [guest]: decision('PILGRIMAGE_FORK', { pilgrimageForkMove: 'escort', targetPilgrimageForkId: forkId, targetLocationId: inn }),
    [candidate]: decision('PILGRIMAGE_FORK', { pilgrimageForkMove: 'remain', targetPilgrimageForkId: forkId }),
  });
  expect(world.tick).toBe(11);
  expect(choiceAt(world)).toMatchObject({ pathIndex: 5, paidStones: 8, status: 'traveling', targetLocationId: inn });
  expect(pilgrimageForkCheckpoint(world, person(world, guest))).toEqual({ x: 380, y: 460 });
  return reopen(world);
}
function stalledAndOccupied() {
  const clean = underway();
  const next = choiceAt(clean).path![choiceAt(clean).pathIndex! + 1];
  expect(terrainTileAt(clean, next.x, next.y)?.id).toBe('tile-10-11');
  const marked = applyMapBrush(applyMapBrush(clean, 'cursed_miasma', [next]), 'cursed_miasma', [next]);
  let stalled = reopen(turn(marked, { [guest]: explore(inn) }));
  expect(stalled.tick).toBe(12);
  expect(stalled.mapHazards.find(row => row.id === hazardId)).toMatchObject({
    kind: 'cursed_miasma', intensity: 2, createdTick: 11, expiresTick: 17,
  });
  expect(choiceAt(stalled)).toMatchObject({ pathIndex: 5, paidStones: 8, status: 'traveling' });
  expect(pilgrimageForkCheckpoint(stalled, person(stalled, guest))).toEqual({ x: 380, y: 460 });
  expect(at(stalled, guest)).toBe(midpoint);
  for (let i = 0; i < 4; i++) stalled = turn(stalled);
  expect(stalled.tick).toBe(16);
  expect(at(stalled, guest)).toBe(midpoint);
  expect(pilgrimageForkCheckpoint(stalled, person(stalled, guest))).toEqual({ x: 380, y: 460 });
  const arrived = reopen(turn(stalled));
  expect(arrived.tick).toBe(17);
  expect([at(arrived, guest), at(arrived, host), at(arrived, candidate), at(arrived, remote)])
    .toEqual([inn, inn, midpoint, 'loc-tianji']);
  expect(arrived.events.find(row => row.id === arrivalId)).toMatchObject({
    witnessScope: 'participants', actorIds: [guest], tick: 17, locationId: inn,
  });
  expect(arrived.mapHazards.some(row => row.id === hazardId)).toBe(false);
  expect(choiceAt(arrived)).toMatchObject({ paidStones: 8, status: 'arrived' });
  expect(choiceAt(arrived).steps?.at(-1)).toEqual({ x: 500, y: 490, tick: 17 });
  expect(arrived.relationships.some(row => [row.fromId, row.toId].includes(host) &&
    [row.fromId, row.toId].includes(guest))).toBe(false);
  return { clean, stalled, arrived };
}

const options = (world: WorldState, actorId: string) => availableNightDoorActions(person(world, actorId), world);
const view = (world: WorldState, actorId: string) => projectNightDoor(world, person(world, actorId));
type Move = ReturnType<typeof options>[number]['nightDoorMove'];
const doorCommand = (world: WorldState, actorId: string, move: Move) => {
  const option = options(world, actorId).find(row => row.nightDoorMove === move)!;
  expect(option).toBeDefined();
  return decision('NIGHT_DOOR', { nightDoorMove: move, targetNightDoorId: option.targetNightDoorId,
    ...(option.targetLocationId === undefined ? {} : { targetLocationId: option.targetLocationId }) });
};
function withRefuge(world: WorldState) {
  const marked = applyMapBrush(world, 'paint_vein', [{ x: 540, y: 500 }]);
  const refuge = place(marked, refugeId);
  const here = terrainTileAt(marked, place(marked, inn).x, place(marked, inn).y)!;
  const there = terrainTileAt(marked, refuge.x, refuge.y)!;
  expect(Math.abs(here.col - there.col) + Math.abs(here.row - there.row)).toBe(1);
  for (const id of [host, guest]) expect(knownMapLocations(marked, person(marked, id))).toContain(refuge);
  return marked;
}
const encounter = (world: WorldState) => world.nightDoors?.encounters.find(row => row.id === encounterId);
const assertPrivate = (world: WorldState, move: Move, actorId: string) => {
  const receiptId = `evt-${encounterId}-${actorId}-${move}-${world.tick}`;
  expect(world.events.find(event => event.id === receiptId)).toMatchObject({
    witnessScope: 'participants', actorIds: [actorId],
  });
  expect(publicChronicleSceneEvents(world).map(row => row.id)).not.toContain(receiptId);
};

describe('a real door after a witnessed obstruction (P22-7)', () => {
  it('differs from the same normal physical road and from knowing the wrong person', () => {
    const { clean, stalled, arrived } = stalledAndOccupied();
    const direct = reopen(turn(clean));
    expect(direct.tick).toBe(12);
    expect(at(direct, guest)).toBe(inn);
    expect(at(arrived, candidate)).toBe(midpoint);
    expect(publicChronicleSceneEvents(arrived).map(row => row.id)).not.toContain(arrivalId);
    expect(stalled.nightDoors?.blocks).toContainEqual(expect.objectContaining({
      forkId, actorId: guest, destinationId: inn, tick: 12, pathIndex: 5, hazardId, hazardTileId: 'tile-10-11',
      hazardCreatedTick: 11, hazardExpiresTick: 17,
    }));
    expect(encounter(stalled)).toBeUndefined();
    expect(direct.nightDoors?.blocks ?? []).toEqual([]);
    expect(encounter(direct)).toBeUndefined();
    const unstaffed = reopen(turn(stalled, { [host]: explore('loc-market-east') }));
    expect(at(unstaffed, guest)).toBe(inn);
    expect(at(unstaffed, host)).toBe('loc-market-east');
    expect(encounter(unstaffed)).toBeUndefined();
    expect(view(unstaffed, guest)).toBeUndefined();
    expect(encounter(arrived)).toMatchObject({
      id: encounterId, forkId, guestId: guest, hostId: host, hostHouseholdId: householdId, villageId,
      siteId: inn, shelterProjectId: shelter, arrivalTick: 17, arrivalEventId: arrivalId,
      acquaintanceId: candidate, acquaintanceEventId: matchingContact,
    });
    expect(view(stalled, host)).toBeUndefined();
    expect(view(direct, host)).toBeUndefined();
    expect(view(direct, guest)).toBeUndefined();
    expect(view(arrived, host)).toMatchObject({ role: 'host', uncertain: true });
    expect(view(arrived, host)?.identifiedGuestName).toBeUndefined();
    expect(view(arrived, guest)).toMatchObject({ role: 'guest' });
    expect(view(arrived, candidate)).toBeUndefined();
    expect(view(arrived, remote)).toBeUndefined();
  });

  it('never substitutes a remembered absent acquaintance or a one-sided guess for the guest self-identifying at the door', () => {
    const { arrived } = stalledAndOccupied();
    const identify = doorCommand(arrived, guest, 'identify');
    const impostor = reopen(turn(arrived, { [candidate]: identify }));
    expect(view(impostor, host)?.identifiedGuestName).toBeUndefined();
    expect(encounter(impostor)?.identifiedTick).toBeUndefined();
    const known = reopen(turn(arrived, { [guest]: identify }));
    expect(view(known, host)).toMatchObject({ identifiedGuestName: person(known, guest).name });
    expect(view(known, host)?.identifiedGuestName).not.toBe(person(known, candidate).name);
    expect(at(known, candidate)).toBe(midpoint);
    expect(at(known, guest)).toBe(inn);
    expect(encounter(known)?.identifiedTick).toBe(18);
    assertPrivate(known, 'identify', guest);
  });

  it('lets the host refuse without moving anyone and holds a room only with actual authority and response', () => {
    const { arrived } = stalledAndOccupied();
    const closed = reopen(turn(arrived, { [host]: doorCommand(arrived, host, 'close') }));
    expect([at(closed, host), at(closed, guest)]).toEqual([inn, inn]);
    expect(view(closed, host)?.identifiedGuestName).toBeUndefined();
    expect(options(closed, guest).some(row => row.nightDoorMove === 'accept')).toBe(false);
    expect(encounter(closed)?.closedTick).toBe(18);
    expect(encounter(closed)?.identifiedTick).toBeUndefined();
    expect(nightDoorBedsHeld(closed, villageId)).toBe(0);
    assertPrivate(closed, 'close', host);

    const offered = reopen(turn(arrived, { [host]: doorCommand(arrived, host, 'shelter') }));
    expect([at(offered, host), at(offered, guest)]).toEqual([inn, inn]);
    expect(view(offered, remote)).toBeUndefined();
    expect(encounter(offered)?.offer).toMatchObject({ move: 'shelter', tick: 18 });
    expect(encounter(offered)?.offer?.acceptedTick).toBeUndefined();
    expect(nightDoorBedsHeld(offered, villageId)).toBe(0);
    assertPrivate(offered, 'shelter', host);
    const accepted = reopen(turn(offered, { [guest]: doorCommand(offered, guest, 'accept') }));
    expect([at(accepted, host), at(accepted, guest)]).toEqual([inn, inn]);
    expect(encounter(accepted)?.offer).toMatchObject({ move: 'shelter', tick: 18, acceptedTick: 19 });
    expect(encounter(accepted)?.offer?.expiresTick).toBeGreaterThan(19);
    expect(nightDoorBedsHeld(accepted, villageId)).toBe(1);
    expect(nightDoorGuestHeld(accepted, guest)).toBe(true);
    expect(nightDoorHouseholdHeld(accepted, householdId)).toBe(true);
    expect(nightDoorGuestHeld(accepted, candidate)).toBe(false);
    expect(encounter(accepted)?.identifiedTick).toBeUndefined(); // Help is not identification.
    assertPrivate(accepted, 'accept', guest);
    const leaves = reopen(turn(accepted, { [guest]: explore(midpoint) }));
    expect(at(leaves, guest)).toBe(midpoint);
    expect(nightDoorBedsHeld(leaves, villageId)).toBe(0);
  });

  it('does not escort on behalf of the guest and only records two crossings when two living people actually move', () => {
    const { arrived } = stalledAndOccupied();
    const originView = withRefuge(arrived);
    const proposal = doorCommand(originView, host, 'escort');
    expect(proposal.targetLocationId).toBe(refugeId);
    const offered = reopen(turn(originView, { [host]: proposal }));
    expect([at(offered, host), at(offered, guest)]).toEqual([inn, inn]);
    expect(options(offered, host).some(row => row.nightDoorMove === 'cross')).toBe(false);
    expect(encounter(offered)?.offer).toMatchObject({ move: 'escort', refugeId, tick: 18 });
    assertPrivate(offered, 'escort', host);
    const accepted = reopen(turn(offered, { [guest]: doorCommand(offered, guest, 'accept') }));
    expect([at(accepted, host), at(accepted, guest)]).toEqual([inn, inn]);
    expect(encounter(accepted)?.offer).toMatchObject({ move: 'escort', refugeId, acceptedTick: 19 });
    expect(encounter(accepted)?.offer?.crossed ?? []).toEqual([]);
    expect(nightDoorBedsHeld(accepted, villageId)).toBe(0);
    const hostCross = doorCommand(accepted, host, 'cross');
    const guestCross = doorCommand(accepted, guest, 'cross');
    expect(hostCross.targetLocationId).toBe(refugeId);
    expect(guestCross.targetLocationId).toBe(refugeId);
    const alone = reopen(turn(accepted, { [host]: hostCross }));
    expect([at(alone, host), at(alone, guest)]).toEqual([refugeId, inn]);
    expect(encounter(alone)?.offer?.crossed).toEqual([{ actorId: host, tick: 20 }]);
    assertPrivate(alone, 'cross', host);
    const both = reopen(turn(accepted, { [host]: hostCross, [guest]: guestCross }));
    expect([at(both, host), at(both, guest)]).toEqual([refugeId, refugeId]);
    expect(encounter(both)?.offer?.crossed).toEqual(expect.arrayContaining([
      { actorId: host, tick: 20 }, { actorId: guest, tick: 20 },
    ]));
    assertPrivate(both, 'cross', host);
    assertPrivate(both, 'cross', guest);
    const unsafe = applyMapBrush(applyMapBrush(accepted, 'beast_tide', [place(accepted, refugeId)]),
      'beast_tide', [place(accepted, refugeId)]);
    const noCross = reopen(turn(unsafe, { [host]: hostCross, [guest]: guestCross }));
    expect([at(noCross, host), at(noCross, guest)]).toEqual([inn, inn]);
    expect(encounter(noCross)?.offer?.crossed ?? []).toEqual([]);
    expect(at(both, candidate)).toBe(midpoint);
    expect(view(both, remote)).toBeUndefined();
  });

  it('admits only an exact Cognitive door command and uses the same native close as the Utility lane', async () => {
    const { arrived } = stalledAndOccupied();
    const closed = doorCommand(arrived, host, 'close');
    const exact = { chosenAction: 'NIGHT_DOOR', nightDoorMove: 'close',
      targetNightDoorId: closed.targetNightDoorId } as const;
    expect(exact.targetNightDoorId).toBe(encounterId);
    const validProvider = async (reply: object) => {
      llmScheduler.resetTickBudget();
      const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] })));
      vi.stubGlobal('fetch', fetch);
      const proposal = await requestCultivatorLLMDecision(person(arrived, host), arrived, {
        enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture',
      }, arrived.tick + 1);
      expect(fetch).toHaveBeenCalledTimes(1);
      return proposal;
    };
    expect(await validProvider({ ...exact, identifiedGuestName: person(arrived, candidate).name })).toBeUndefined();
    expect(await validProvider({ ...exact, forcedArrival: true })).toBeUndefined();
    expect(await validProvider({ ...exact, targetLocationId: inn })).toBeUndefined();
    const accepted = await validProvider(exact);
    expect(accepted).toMatchObject(exact);
    const cognitive = reopen(advanceWorldTick(arrived, Object.fromEntries(arrived.cultivators
      .map(({ id }) => [id, id === host ? accepted! : rest])),
    () => .99, 'deferred', undefined, { modelActors: new Set([host]) }));
    const utility = reopen(turn(arrived, { [host]: closed }));
    expect(encounter(cognitive)).toEqual(encounter(utility));
    expect(encounter(cognitive)).toMatchObject({ closedTick: 18 });
    const autonomous = reopen(advanceWorldTick(arrived, Object.fromEntries(arrived.cultivators
      .filter(row => row.id !== host).map(({ id }) => [id, rest])), () => .99, 'utility'));
    expect(options(arrived, host).some(row => row.nightDoorMove === 'shelter')).toBe(true);
    expect(encounter(autonomous)?.offer).toMatchObject({ move: 'shelter', tick: 18 });
    expect(nightDoorBedsHeld(autonomous, villageId)).toBe(0);
  });

});
