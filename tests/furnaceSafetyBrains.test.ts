import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { legalTraceCandidates, recordDecisionTrace } from '../src/engine/decisionTraceEngine';
import { availableFurnaceSafetyActions, isFurnaceSafetyClosed, FURNACE_SAFETY_INSPECT_STONES,
  FURNACE_SAFETY_REPAIR } from '../src/engine/furnaceSafetyEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceMapHazards, applyMapBrush } from '../src/engine/mapBrushEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, FurnaceSafetyMove, LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-furnace-safety' };
const respond = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  let world = createInitialWorld(637);
  const siteId = 'loc-danxia';
  const oldSite = world.locations.find(({ id }) => id === siteId)!;
  world.tick = 20;
  const point = { x: oldSite.x, y: oldSite.y };
  world = applyMapBrush(applyMapBrush(world, 'beast_tide', [point]), 'beast_tide', [point]);
  const site = world.locations.find(({ id }) => id === siteId)!;
  const owner = world.cultivators.find(({ id }) => id === 'npc-5')!;
  const outsider = world.cultivators.find(({ id }) => id === 'npc-6')!; // Same sect, but not the officer or a stationed guard.
  const remote = world.cultivators.find(({ id }) => id === 'elder-danxia-1')!;
  outsider.locationId = site.id;
  remote.locationId = 'loc-market';
  owner.spiritStones = 100;
  owner.herbs.earth_root = 4;
  owner.qiProgress = 20;
  const tide = world.mapHazards.find(({ kind }) => kind === 'beast_tide')!;
  expect(world.furnaceSafety.cases).toEqual([]);
  world.tick++;
  expect(advanceMapHazards(world).some(({ title }) => title === '兽潮实损，炉事暂止')).toBe(true);
  const row = world.furnaceSafety.cases[0];
  expect(row).toMatchObject({ siteId, damagedTick: world.tick, severity: 2, integrity: 60, hazardId: tide.id });
  const payload = (furnaceSafetyMove: FurnaceSafetyMove) => ({ chosenAction: 'FURNACE_SAFETY' as const, furnaceSafetyMove,
    targetFurnaceSafetyId: row.id, innerMonologue: '依照真正的炉况行事。' });
  const act = (actor: Cultivator, decision: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, decision, () => .99);
  return { world, site, owner, outsider, remote, row, tide, payload, act };
}

describe('grounded furnace safety in both brains', () => {
  it('plans only verified next-turn local inspection, not forged repair state, site, materials or title', async () => {
    const { world, site, owner, outsider, remote, row, tide, payload, act } = fixture();
    world.tick = tide.expiresTick - 1;
    const inspect = payload('inspect');
    expect(availableFurnaceSafetyActions(owner, world)).toEqual([]);
    const mock = vi.fn(async (_endpoint: RequestInfo | URL, _init?: RequestInit) => respond(inspect));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(owner, world, config, world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(outsider, world, config, world.tick + 1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(remote, world, config, world.tick + 1)).resolves.toBeUndefined();
    for (const extra of [{ targetFurnaceSafetyId: 'invented' }, { furnaceSafetyMove: 'reopen' },
      { integrity: 100 }, { targetLocationId: site.id }, { roots: 0 }, { sectRank: owner.sectRank }]) {
      mock.mockImplementation(async () => respond({ ...inspect, ...extra }));
      await expect(requestCultivatorLLMDecision(owner, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async () => respond(inspect));
    const safe = await requestCultivatorLLMDecision(owner, world, config, world.tick + 1);
    expect(safe).toMatchObject(inspect);
    expect(mock.mock.calls.at(-1)?.[1]?.body).toContain('炉体停用只用本人、此地、执行回合许可');
    world.tick++;
    advanceMapHazards(world);
    owner.locationId = remote.locationId;
    expect(act(owner, safe!)).toBeNull();
    expect(owner.spiritStones).toBe(100);
    owner.locationId = site.id;
    expect(act(owner, safe!)).not.toBeNull();
    expect(owner.spiritStones).toBe(100 - FURNACE_SAFETY_INSPECT_STONES);
    expect(row.integrity).toBe(60);
    expect(row.receipts).toHaveLength(1);
    const trace = recordDecisionTrace(world, owner.id, legalTraceCandidates(world, owner), safe!, 'model', true);
    expect(trace.chosenAction).toBe('redacted');
    expect(JSON.stringify(trace)).not.toContain(row.id);
  });

  it('has Utility inspect then spend actual repair stock; model reopens neither before proof nor for the same turn', async () => {
    const { world, site, owner, row, tide, payload, act } = fixture();
    world.tick = tide.expiresTick;
    advanceMapHazards(world);
    const inspect = computeHeuristicDecision(owner, world, () => .99);
    expect(inspect).toMatchObject({ chosenAction: 'FURNACE_SAFETY', furnaceSafetyMove: 'inspect', targetFurnaceSafetyId: row.id });
    expect(act(owner, inspect)).not.toBeNull();
    const reopen = payload('reopen');
    const mocked = vi.fn(async () => respond(reopen));
    vi.stubGlobal('fetch', mocked);
    await expect(requestCultivatorLLMDecision(owner, world, config, world.tick + 1)).resolves.toBeUndefined();
    world.tick++;
    const repair = computeHeuristicDecision(owner, world, () => .99);
    expect(repair).toMatchObject({ chosenAction: 'FURNACE_SAFETY', furnaceSafetyMove: 'repair', targetFurnaceSafetyId: row.id });
    expect(act(owner, repair)).not.toBeNull();
    expect(row.integrity).toBe(90);
    expect([owner.spiritStones, owner.herbs.earth_root]).toEqual([100 - FURNACE_SAFETY_INSPECT_STONES - FURNACE_SAFETY_REPAIR.stones,
      4 - FURNACE_SAFETY_REPAIR.roots]);
    await expect(requestCultivatorLLMDecision(owner, world, config, world.tick)).resolves.toBeUndefined();
    const allowed = await requestCultivatorLLMDecision(owner, world, config, world.tick + 1);
    expect(allowed).toMatchObject(reopen);
    world.tick++;
    expect(computeHeuristicDecision(owner, world, () => .99)).toMatchObject({ chosenAction: 'FURNACE_SAFETY', furnaceSafetyMove: 'reopen' });
    expect(act(owner, allowed!)).not.toBeNull();
    expect(act(owner, allowed!)).toBeNull();
    expect(row.reopenedTick).toBe(world.tick);
    expect(isFurnaceSafetyClosed(world, site.id)).toBe(true);
    world.tick++;
    expect(isFurnaceSafetyClosed(world, site.id)).toBe(false);
  });
});
