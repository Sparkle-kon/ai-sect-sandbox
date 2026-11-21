import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { modelDecisionCandidates } from '../src/engine/modelDecisionTurn';
import { availablePilgrimageActions, PILGRIMAGE_LEG_COST, pilgrimageCheckpoint, resolvePilgrimageAction } from '../src/engine/pilgrimageEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload, PilgrimageMove } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-camp' };
const response = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(13071);
  world.tick = 10;
  const home = world.locations.find(({ id }) => id === 'loc-taixu')!;
  const [leader, partner] = world.cultivators;
  for (const actor of [leader, partner]) {
    actor.locationId = home.id;
    actor.spiritStones = 100;
    actor.herbs.earth_root = 2;
    actor.hp = actor.maxHp;
    actor.exploredTileIds = [];
    actor.rumors = [];
  }
  const act = (actor: Cultivator, pilgrimageMove: PilgrimageMove, fields: Partial<LLMDecisionPayload> = {}) =>
    resolvePilgrimageAction(world, actor, { chosenAction: 'PILGRIMAGE', pilgrimageMove, innerMonologue: '', ...fields });
  const proposed = availablePilgrimageActions(leader, world).find((option) => option.pilgrimageMove === 'propose' && option.targetCultivatorId === partner.id)!;
  expect(proposed).toBeDefined();
  expect(act(leader, 'propose', proposed)).not.toBeNull();
  const journey = world.pilgrimages.journeys[0];
  const target = { targetPilgrimageId: journey.id };
  expect(act(partner, 'accept', target)).not.toBeNull();
  world.tick++;
  expect(act(leader, 'advance', target)).not.toBeNull();
  expect(pilgrimageCheckpoint(world, leader)).toBeDefined();
  return { world, leader, partner, journey, target, act };
}

describe('model and Utility camp choices at the true pilgrimage checkpoint', () => {
  it('plans against the execution turn, refuses fabricated geometry, and resumes without charging the leg twice', async () => {
    const { world, leader, partner, journey, target, act } = fixture();
    partner.hp = Math.floor(partner.maxHp * .6);
    const camp = { chosenAction: 'PILGRIMAGE', pilgrimageMove: 'camp', ...target, innerMonologue: '按实际补给暂宿。' } as const;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      response({ ...camp, checkpoint: { x: 10, y: 20 } }));
    vi.stubGlobal('fetch', fetcher);
    expect(availablePilgrimageActions(leader, world, false).some(({ pilgrimageMove }) => pilgrimageMove === 'camp')).toBe(false);
    expect(modelDecisionCandidates(world)).toContain(leader); // Same-tick path lock cannot starve next-turn planning.
    await expect(requestCultivatorLLMDecision(leader, world, config, world.tick + 1)).resolves.toBeUndefined();
    fetcher.mockImplementation(async () => response({ ...camp, campName: '虚构地点' }));
    await expect(requestCultivatorLLMDecision(leader, world, config, world.tick + 1)).resolves.toBeUndefined();
    fetcher.mockImplementation(async () => response(camp));
    const planned = await requestCultivatorLLMDecision(leader, world, config, world.tick + 1);
    expect(planned).toMatchObject(camp);
    expect(fetcher.mock.calls[2][1]?.body).toContain('不填写坐标、营地名称');
    const priorPoint = pilgrimageCheckpoint(world, leader);
    world.tick++;
    expect(resolvePilgrimageAction(world, leader, planned!)).not.toBeNull();
    expect(pilgrimageCheckpoint(world, leader)).toEqual(priorPoint);
    expect(leader.herbs.earth_root).toBe(1);
    expect(journey.stopsVisited).toHaveLength(1);
    expect(journey.spentByEach).toBe(PILGRIMAGE_LEG_COST);
    expect(modelDecisionCandidates(world)).toContain(leader); // Fresh camp closes this tick, not its verified resumption turn.
    const resume = { chosenAction: 'PILGRIMAGE', pilgrimageMove: 'resume', ...target, innerMonologue: '原路接续。' } as const;
    fetcher.mockImplementation(async () => response({ ...resume, targetLocationId: journey.stopIds[1] }));
    await expect(requestCultivatorLLMDecision(leader, world, config, world.tick + 1)).resolves.toBeUndefined();
    fetcher.mockImplementation(async () => response(resume));
    const accepted = await requestCultivatorLLMDecision(leader, world, config, world.tick + 1);
    expect(accepted).toMatchObject(resume);
    world.tick++;
    expect(computeHeuristicDecision(leader, world, () => .9)).toMatchObject({ chosenAction: 'PILGRIMAGE', pilgrimageMove: 'resume', ...target });
    expect(computeHeuristicDecision(partner, world, () => .9).pilgrimageMove).not.toBe('dismantle');
    expect(act(leader, 'resume', accepted)).not.toBeNull();
    expect(journey.spentByEach).toBe(PILGRIMAGE_LEG_COST);
    expect(leader.spiritStones).toBe(100 - PILGRIMAGE_LEG_COST);
    expect(leader.herbs.earth_root).toBe(1);
  });

  it('uses rule-brain camp only for real travel need with supplies; honors a manual valid dismantle', async () => {
    const { world, leader, partner, journey, target, act } = fixture();
    world.tick++;
    expect(computeHeuristicDecision(leader, world, () => .9).pilgrimageMove).toBe('advance');
    partner.hp = Math.ceil(partner.maxHp * .6);
    leader.herbs.earth_root = 0;
    expect(computeHeuristicDecision(leader, world, () => .9).pilgrimageMove).toBe('advance');
    leader.herbs.earth_root = 2;
    const utility = computeHeuristicDecision(leader, world, () => .9);
    expect(utility).toMatchObject({ chosenAction: 'PILGRIMAGE', pilgrimageMove: 'camp', ...target });
    expect(resolvePilgrimageAction(world, leader, utility)).not.toBeNull();
    const dismantle = { chosenAction: 'PILGRIMAGE', pilgrimageMove: 'dismantle', ...target, innerMonologue: '撤掉已有营地。' } as const;
    vi.stubGlobal('fetch', vi.fn(async () => response(dismantle)));
    const decision = await requestCultivatorLLMDecision(partner, world, config, world.tick + 1);
    expect(decision).toMatchObject(dismantle);
    world.tick++;
    expect(resolvePilgrimageAction(world, partner, decision!)).not.toBeNull();
    expect(leader.herbs.earth_root).toBe(1);
    expect(journey.stopsVisited).toHaveLength(1);
    expect(act(partner, 'dismantle', target)).toBeNull();
  });
});
