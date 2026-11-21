import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availablePilgrimageActions, PILGRIMAGE_LEG_COST } from '../src/engine/pilgrimageEngine';
import { availableRoadActions, ROAD_CHARTER_ROOTS, ROAD_CHARTER_STONES, ROAD_FARE } from '../src/engine/roadEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMDecisionPayload, WorldState } from '../src/types/world';

const config = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'test-fixture', model: 'fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '只按核验驿路付款。' };
const act = (world: WorldState, actor: Cultivator, decision: LLMDecisionPayload) =>
  applyCultivatorBrainDecision(world, actor, decision, () => .99);
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(11401);
  world.tick = 44;
  world.month = 7;
  const sect = world.sects.find(({ id }) => id === 'sect-danxia')!;
  const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const companion = world.cultivators.find((row) => row.sectId === sect.id && row.id !== leader.id)!;
  const market = world.locations.find(({ id }) => id === 'loc-market')!;
  for (const actor of [leader, companion]) {
    actor.locationId = sect.headquartersId;
    actor.spiritStones = 100;
    actor.herbs.earth_root = 20;
    actor.exploredTileIds = world.terrain.tiles.map(({ id }) => id);
    actor.hp = actor.maxHp;
    actor.guardAssignment = undefined;
  }
  for (const actor of world.cultivators.filter((person) => person.id !== leader.id && person.id !== companion.id)) {
    actor.locationId = 'loc-market-east';
  }
  leader.personality = '刚正';
  sect.spiritStones = 800;
  const charter = availableRoadActions(leader, world).find(({ roadMove, targetLocationId }) =>
    roadMove === 'charter' && targetLocationId === market.id)!;
  expect(charter).toBeDefined();
  expect(act(world, leader, { ...rest, ...charter, chosenAction: 'ROAD' })).not.toBeNull();
  expect(sect.spiritStones).toBe(800 - ROAD_CHARTER_STONES);
  expect(leader.herbs.earth_root).toBe(20 - ROAD_CHARTER_ROOTS);
  const road = world.roads.links[0];
  const proposal = availablePilgrimageActions(leader, world).find(({ pilgrimageMove, targetCultivatorId, targetLocationId }) =>
    pilgrimageMove === 'propose' && targetCultivatorId === companion.id && targetLocationId === market.id)!;
  expect(proposal).toBeDefined();
  expect(act(world, leader, { ...rest, ...proposal, chosenAction: 'PILGRIMAGE' })).not.toBeNull();
  const journey = world.pilgrimages.journeys[0];
  expect(act(world, companion, { ...rest, chosenAction: 'PILGRIMAGE', pilgrimageMove: 'accept', targetPilgrimageId: journey.id })).not.toBeNull();
  world.tick++;
  return { world, sect, leader, companion, market, road, journey };
}

describe('optional maintained road on an actual paid pilgrimage leg', () => {
  it('keeps the existing un-tolled path, and both brains can elect one extra fee for real faster travel', async () => {
    const { world, sect, leader, companion, market, road, journey } = fixture();
    const choices = availablePilgrimageActions(leader, world).filter(({ pilgrimageMove }) => pilgrimageMove === 'advance');
    expect(choices.some(({ targetRoadId }) => targetRoadId === undefined)).toBe(true);
    const paid = choices.find(({ targetRoadId }) => targetRoadId === road.id)!;
    expect(paid).toBeDefined();
    const order: LLMDecisionPayload = { ...rest, ...paid, chosenAction: 'PILGRIMAGE' };
    expect(computeHeuristicDecision(leader, world, () => .99)).toMatchObject({ pilgrimageMove: 'advance', targetRoadId: road.id });
    const respond = (value: LLMDecisionPayload) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
    const mocked = vi.fn(async () => respond({ ...order, targetRoadId: 'made-up-road' }));
    vi.stubGlobal('fetch', mocked);
    const source = vi.fn();
    await queryCultivatorLLMDecision(leader, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(world.roads.crossings).toHaveLength(0);
    mocked.mockImplementation(async () => respond(order));
    const valid = await queryCultivatorLLMDecision(leader, world, config, source);
    expect({ source: source.mock.lastCall, targetRoadId: valid.targetRoadId }).toEqual({ source: ['llm'], targetRoadId: road.id });

    const normalWorld = decodeWorldSave(encodeWorldSave(world));
    const normal = normalWorld.cultivators.find(({ id }) => id === leader.id)!;
    expect(act(normalWorld, normal, { ...order, targetRoadId: undefined })).not.toBeNull();
    expect(normalWorld.roads.crossings).toHaveLength(0);
    expect(normal.spiritStones).toBe(100 - PILGRIMAGE_LEG_COST);
    expect(normalWorld.pilgrimages.journeys[0].stopsVisited).toHaveLength(1);

    const before = sect.spiritStones;
    expect(act(world, leader, valid)).not.toBeNull();
    expect(sect.spiritStones).toBe(before + ROAD_FARE);
    expect(leader.spiritStones).toBe(100 - PILGRIMAGE_LEG_COST - ROAD_FARE);
    expect(companion.spiritStones).toBe(100 - PILGRIMAGE_LEG_COST);
    expect(journey.stopsVisited).toHaveLength(2);
    expect(leader.locationId).toBe(market.id);
    expect(act(world, leader, valid)).toBeNull();
    expect(world.roads.crossings).toHaveLength(1);
    expect(world.roads.crossings[0]).toMatchObject({ roadId: road.id, journeyId: journey.id, legIndex: 0, fee: ROAD_FARE });
    expect(decodeWorldSave(encodeWorldSave(world)).roads).toEqual(world.roads);
  });

  it('rejects a stale toll when the organizer can pay the base fare but not both costs', () => {
    const { world, sect, leader, road, journey } = fixture();
    leader.spiritStones = PILGRIMAGE_LEG_COST + ROAD_FARE - 1;
    const options = availablePilgrimageActions(leader, world).filter(({ pilgrimageMove }) => pilgrimageMove === 'advance');
    expect(options).toEqual([{ action: 'PILGRIMAGE', pilgrimageMove: 'advance', targetPilgrimageId: journey.id }]);
    const balance = sect.spiritStones;
    const offered = { ...rest, ...options[0], chosenAction: 'PILGRIMAGE', targetRoadId: road.id } satisfies LLMDecisionPayload;
    expect(act(world, leader, offered)).toBeNull();
    expect(sect.spiritStones).toBe(balance);
    expect(leader.spiritStones).toBe(PILGRIMAGE_LEG_COST + ROAD_FARE - 1);
    expect(world.roads.crossings).toEqual([]);
  });
});
