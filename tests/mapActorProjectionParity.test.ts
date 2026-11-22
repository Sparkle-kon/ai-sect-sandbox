import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { mapTransitActorIds } from '../src/components/mapConvoyView';
import { createInitialWorld } from '../src/data/initialWorld';
import { disasterShelterCheckpoint } from '../src/engine/disasterShelterCheckpoint';
import { danxiaMedicineCheckpoint } from '../src/engine/danxiaMedicineTerms';
import { resolveExpeditionRescueAction } from '../src/engine/expeditionRescueEngine';
import { advanceOccasions, joinOccasion } from '../src/engine/occasionEngine';
import { expeditionRescueCheckpoint } from '../src/engine/expeditionRescueCheckpoint';
import { marketFreightCheckpoint } from '../src/engine/marketFreightCheckpoint';
import { courierCheckpoint } from '../src/engine/sealedCourierEngine';
import { queryCultivatorLLMDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';
import { actualAscensionWaves, ascentActorId, genuineReversibleUpper, travelerId } from './ascensionNativeFixture';
import { shelterAccepted, shelterCase, shelterGuest, shelterHost, shelterTurn } from './disasterShelterNativeFixture';
import { actualNativeDungeonGate, dungeonCompanion, dungeonExplorer, dungeonOutsider } from './expeditionDungeonNativeFixture';
import { DANXIA_FIXTURE, danxiaActor, danxiaPayload, danxiaTurn, preparedDanxiaAppointment } from './fixtures/danxiaNativeFixture';
import { arrivedCourierHandoff, nativeCourierHandoffRoute, handoffDecision, handoffPayload } from './fixtures/courierHandoffFixture';
import { acceptedNativeFreight, freightCarrier, freightContract, freightMonth, freightOther, freightSeller } from './marketFreightNativeFixture';
import { restoreLegacyExpeditionFixture } from './fixtures/legacyExpeditionFixture';
import { legacyMapActorPositions, legacyMapTransitActorIds, legacyTerrainMapView } from './fixtures/legacyTerrainActorProjection';

const actor = (world: WorldState, id: string) => world.cultivators.find(row => row.id === id)!;
const outsider = (world: WorldState, exclude: readonly string[]) =>
  world.cultivators.find(row => row.alive && row.positionPlane === undefined && !exclude.includes(row.id))!;
const ids = (rows: readonly { id: string }[]) => rows.map(row => row.id);
const pos = (rows: ReturnType<typeof mapActorPositions>) => rows.map(row => [row.actor.id, row.x, row.y]);
const collection = <T>(value: ReadonlySet<T> | undefined) => value === undefined ? undefined : [...value];

function equivalent(world: WorldState, viewer: Cultivator | undefined, fog: boolean) {
  const why = `T${world.tick} viewer=${viewer?.id ?? 'none'} realm=${viewer?.positionPlane ?? 'lower'} fog=${fog}`;
  const before = legacyTerrainMapView(world, viewer, fog);
  const current = createTerrainMapView(world, viewer, fog);
  for (const field of ['current', 'known'] as const)
    expect(collection(current[field]), why + ' ' + field).toEqual(collection(before[field]));
  for (const field of ['trailPositions', 'extractionPositions', 'boundaryPositions'] as const)
    expect([...current[field]], why + ' ' + field).toEqual([...before[field]]);
  for (const field of ['seenLocations', 'visibleOpenOccasions', 'liveActors'] as const) {
    expect(ids(current[field]), why + ' ' + field).toEqual(ids(before[field]));
    current[field].forEach((row, index) => expect(row, why + ' same canonical reference').toBe(before[field][index]));
  }
  expect([...current.locationTile].map(([id, tile]) => [id, tile.id]), why).toEqual([...before.locationTile].map(([id, tile]) => [id, tile.id]));
  expect(world.locations.map(site => current.isCurrentLocation(site.id)), why)
    .toEqual(world.locations.map(site => before.isCurrentLocation(site.id)));
  expect(world.terrain.tiles.map(tile => current.tileState(tile)), why)
    .toEqual(world.terrain.tiles.map(tile => before.tileState(tile)));

  const nativeTransit = legacyMapTransitActorIds(world);
  const optimizedTransit = mapTransitActorIds(world);
  expect([...optimizedTransit], why).toEqual([...nativeTransit]);
  // Match both consumer surfaces: raw actor DTO keys and Canvas's separately painted convoy exclusion.
  for (const excludesConvoy of [false, true]) {
    const expected = legacyMapActorPositions(before.seenLocations,
      before.liveActors.filter(row => !excludesConvoy || !nativeTransit.has(row.id)), before.trailPositions);
    const actual = mapActorPositions(current.seenLocations,
      current.liveActors.filter(row => !excludesConvoy || !optimizedTransit.has(row.id)), current.trailPositions);
    expect(pos(actual), why + ' projected centers').toEqual(pos(expected));
    actual.forEach((point, index) => expect(point.actor, why + ' exact actor').toBe(expected[index].actor));
  }
  return current;
}

function privacyMatrix(world: WorldState, parties: readonly string[], stranger: string) {
  for (const fog of [true, false]) {
    equivalent(world, undefined, fog);
    for (const id of [...parties, stranger]) equivalent(world, actor(world, id), fog);
  }
}

function medicalTrip() {
  const f = preparedDanxiaAppointment();
  const { discipleId, staffId, villageSiteId } = DANXIA_FIXTURE;
  const shortage = danxiaTurn(f.world, { [f.patientId]: danxiaPayload('CARE_FOLLOWUP', {
    careFollowupMove: 'attend', targetCareFollowupId: f.appointmentId,
  }) });
  const need = shortage.danxiaShortages.cases[0];
  expect(need.status).toBe('open');
  // Same controlled starting donor reserve as the original medicine integration fixture.
  danxiaActor(shortage, discipleId).herbs.jade_leaf = 2;
  const offered = danxiaTurn(shortage, { [discipleId]: danxiaPayload('DANXIA_MEDICINE', {
    danxiaMedicineMove: 'offer_ship', targetDanxiaShortageId: need.id, targetCultivatorId: staffId,
  }) });
  const commitment = offered.danxiaMedicine.commitments[0];
  const accepted = danxiaTurn(offered, {
    [staffId]: danxiaPayload('DANXIA_MEDICINE', { danxiaMedicineMove: 'accept', targetDanxiaMedicineId: commitment.id }),
    [f.patientId]: danxiaPayload('EXPLORE', { targetLocationId: villageSiteId }),
  });
  const underway = danxiaTurn(accepted);
  expect(underway.danxiaMedicine.commitments[0]).toMatchObject({ status: 'in_transit', departedTick: underway.tick });
  return { world: underway, runner: staffId, recipient: f.patientId, donor: discipleId };
}

function physicalRescue() {
  // The existing promoted old-save fixture gives a genuinely longer exit after payment. Native P18-2 gates
  // now share their anchor tile; the modern private gate is covered independently below.
  const world = createInitialWorld(8278);
  world.tick = 60;
  const occasion = restoreLegacyExpeditionFixture(world);
  const [explorer, guide, spare, stranger] = world.cultivators;
  const market = world.locations.find(site => site.id === 'loc-market')!;
  market.x -= 80;
  for (const person of [explorer, guide, spare]) {
    person.exploredTileIds = world.terrain.tiles.map(tile => tile.id);
    person.herbs.jade_leaf = 4;
    expect(joinOccasion(world, person, { chosenAction: 'JOIN_OCCASION', targetOccasionId: occasion.id, innerMonologue: '' }))
      .not.toBeNull();
  }
  explorer.hp = Math.max(1, Math.floor(explorer.maxHp / 3));
  world.tick = occasion.registrationClosesTick;
  advanceOccasions(world, () => 0);
  world.tick++;
  expect(resolveExpeditionRescueAction(world, explorer, { chosenAction: 'EXPEDITION_RESCUE', rescueMove: 'signal',
    targetOccasionId: occasion.id, innerMonologue: '' })).not.toBeNull();
  const row = world.expeditionRescues.requests[0];
  world.tick++;
  expect(resolveExpeditionRescueAction(world, guide, { chosenAction: 'EXPEDITION_RESCUE', rescueMove: 'accept',
    targetExpeditionRescueId: row.id, innerMonologue: '' })).not.toBeNull();
  expect(row.path.length).toBeGreaterThan(3);
  const accepted = structuredClone(world);
  world.tick++;
  advanceOccasions(world, () => .6);
  expect(row.pathIndex).toBeGreaterThan(0);
  expect(row.status).toBe('extracting');
  const physical = row.path[row.pathIndex];
  return { accepted, following: world, explorer: explorer.id, guide: guide.id, stranger: stranger.id, physical };
}

const cfg: LLMConfig = { enabled: true, apiBaseUrl: 'https://map-parity.invalid/v1', apiKey: 'mock', model: 'mock' };
afterEach(() => { vi.unstubAllGlobals(); llmScheduler.resetTickBudget(); });

describe('optimized map actor projection preserves the native P18-9 observer boundary', () => {
  it('preserves actual station order, null viewer, fog, and off-map upper/retired actors', () => {
    const initial = createInitialWorld(2031);
    privacyMatrix(initial, ['npc-1', 'npc-2'], 'npc-3');
    const moved = advanceWorldTick(initial, Object.fromEntries(initial.cultivators.map(({ id }) => [id,
      id === 'npc-1' ? handoffPayload('EXPLORE', { targetLocationId: 'loc-market' }) : handoffPayload('REST')])), () => .99);
    expect(actor(moved, 'npc-1').locationId).toBe('loc-market');
    privacyMatrix(moved, ['npc-1', 'npc-2'], 'npc-3');
    const { upper, returned } = genuineReversibleUpper();
    for (const world of [upper, returned])
      for (const fog of [true, false]) {
        const view = equivalent(world, actor(world, travelerId), fog);
        if (world === upper) expect(view.liveActors).toEqual([]);
      }
    const passed = actualAscensionWaves().passed;
    for (const fog of [true, false]) {
      expect(equivalent(passed, actor(passed, ascentActorId), fog).liveActors).toEqual([]);
      expect(ids(equivalent(passed, actor(passed, 'elder-taixu-1'), fog).liveActors)).not.toContain(ascentActorId);
    }
  });

  it('keeps a real sealed carrier on the witnessed checkpoint in both decision modes, without duplicating actor centers', async () => {
    const transit = nativeCourierHandoffRoute();
    privacyMatrix(transit.world, [transit.originalId, transit.recipientId], transit.outsiderId);
    const reached = arrivedCourierHandoff(), who = actor(reached.world, reached.originalId);
    expect(courierCheckpoint(reached.world, who)).toBeDefined();
    const exact = handoffDecision('offer', reached.id, reached.newId);
    const { innerMonologue: _notProviderContent, ...mechanical } = exact;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(mechanical),
    } }] }))));
    llmScheduler.resetTickBudget();
    const cognitive = await requestCultivatorLLMDecision(who, reached.world, cfg, reached.world.tick + 1);
    const utility = await queryCultivatorLLMDecision(who, reached.world, { ...cfg, enabled: false }, undefined, reached.world.tick + 1);
    expect(cognitive).toMatchObject(mechanical);
    expect(utility).toMatchObject(mechanical);
    const roll = () => .99;
    const native = (choice: LLMDecisionPayload, mode: 'utility' | 'deferred') => advanceWorldTick(reached.world,
      Object.fromEntries(reached.world.cultivators.map(row => [row.id, row.id === who.id ? choice : handoffPayload('REST')])),
      roll, mode, undefined, { modelActors: new Set(mode === 'deferred' ? [who.id] : []) });
    const modelState = native(cognitive!, 'deferred'), localState = native(utility, 'utility');
    expect(modelState.couriers.dispatches[0].handoff).toMatchObject({ status: 'offered', candidateId: reached.newId });
    expect(modelState.couriers).toEqual(localState.couriers);
    for (const id of [reached.originalId, reached.newId, reached.outsiderId]) for (const fog of [true, false]) {
      const first = equivalent(modelState, actor(modelState, id), fog), second = equivalent(localState, actor(localState, id), fog);
      expect(ids(first.liveActors)).toEqual(ids(second.liveActors));
      expect([...first.trailPositions]).toEqual([...second.trailPositions]);
      expect(pos(mapActorPositions(first.seenLocations, first.liveActors, first.trailPositions)))
        .toEqual(pos(mapActorPositions(second.seenLocations, second.liveActors, second.trailPositions)));
    }
  });

  it('does not widen exact named guest, medicine runner, or market freight scope when fog is disabled', () => {
    const shelter = shelterAccepted();
    const outbound = shelterTurn(shelter.world), stranger = outsider(outbound, [shelterGuest, shelterHost]);
    const lodging = disasterShelterCheckpoint(outbound, actor(outbound, shelterGuest));
    expect(shelterCase(outbound)).toMatchObject({ status: 'outbound', pathIndex: 1 });
    expect(lodging).toBeDefined();
    privacyMatrix(outbound, [shelterGuest, shelterHost], stranger.id);
    expect(equivalent(outbound, actor(outbound, shelterGuest), false).trailPositions.get(shelterGuest)).toEqual(lodging);
    expect(ids(equivalent(outbound, stranger, false).liveActors)).not.toContain(shelterGuest);

    const medical = medicalTrip(), runner = actor(medical.world, medical.runner);
    const point = danxiaMedicineCheckpoint(medical.world, runner);
    expect(point).toBeDefined();
    privacyMatrix(medical.world, [medical.runner, medical.donor, medical.recipient],
      outsider(medical.world, [medical.runner, medical.donor, medical.recipient]).id);
    const recipient = actor(medical.world, medical.recipient);
    expect(equivalent(medical.world, recipient, false).trailPositions.get(runner.id)).toEqual(point);
    expect(ids(equivalent(medical.world, { ...recipient }, false).liveActors)).not.toContain(runner.id);
    expect(ids(equivalent(medical.world, undefined, false).liveActors)).not.toContain(runner.id);

    let freight = acceptedNativeFreight().world;
    for (let i = 0; i < 3 && !marketFreightCheckpoint(freight, actor(freight, freightCarrier)); i++) freight = freightMonth(freight);
    expect(freightContract(freight)?.status).toBe('active');
    expect(marketFreightCheckpoint(freight, actor(freight, freightCarrier))).toBeDefined();
    privacyMatrix(freight, [freightCarrier, freightSeller], freightOther);
    expect(ids(equivalent(freight, actor(freight, freightOther), false).liveActors)).not.toContain(freightCarrier);
  }, 20_000);

  it('preserves a real private gate and paid extraction points without trusting an unrelated viewer', () => {
    const { opening, entered, occasion } = actualNativeDungeonGate(true);
    for (const world of [opening, entered]) privacyMatrix(world, [dungeonExplorer, dungeonCompanion], dungeonOutsider);
    expect(ids(equivalent(entered, actor(entered, dungeonOutsider), false).seenLocations)).not.toContain(occasion.locationId);
    expect(ids(equivalent(entered, actor(entered, dungeonOutsider), false).liveActors)).not.toContain(dungeonExplorer);
    const rescue = physicalRescue();
    for (const world of [rescue.accepted, rescue.following]) privacyMatrix(world, [rescue.explorer, rescue.guide], rescue.stranger);
    const view = equivalent(rescue.following, actor(rescue.following, rescue.guide), false);
    expect(expeditionRescueCheckpoint(rescue.following, actor(rescue.following, rescue.explorer))).toEqual(rescue.physical);
    expect(view.extractionPositions.get(rescue.explorer)).toEqual(rescue.physical);
    expect(equivalent(rescue.following, undefined, false).extractionPositions.size).toBe(0);
  });
});
