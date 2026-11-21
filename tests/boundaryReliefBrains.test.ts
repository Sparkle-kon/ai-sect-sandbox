import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { boundaryReliefCheckpoint } from '../src/engine/boundaryReliefCheckpoint';
import { advanceBoundaryReliefs, availableBoundaryReliefActions } from '../src/engine/boundaryReliefEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { resolveSectEconomyAction } from '../src/engine/sectEconomyEngine';
import { noteTerrainVisit } from '../src/engine/terrainEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-boundary' };
const respond = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = applyMapBrush(createInitialWorld(626), 'paint_vein', [{ x: 300, y: 220 }]);
  const [chief, incumbent, outsider] = world.cultivators;
  const reserve = world.cultivators.find(({ id }) => id === 'elder-taixu-1')!;
  const hq = world.locations.find(({ id }) => id === chief.locationId)!;
  const post = world.locations.find(({ id }) => id.startsWith('brush-vein-'))!;
  expect(post?.ownerSectId).toBe(chief.sectId);
  // The commander and reserve have genuinely scouted the actual post before being staged at the HQ.
  for (const actor of [chief, reserve]) {
    actor.locationId = post.id;
    noteTerrainVisit(world, actor);
    actor.locationId = hq.id;
    noteTerrainVisit(world, actor);
  }
  incumbent.locationId = hq.id;
  reserve.hp = reserve.maxHp;
  reserve.qiProgress = 70;
  expect(resolveSectEconomyAction(world, chief, { chosenAction: 'DISPATCH_GUARD', targetLocationId: post.id,
    targetCultivatorId: incumbent.id, innerMonologue: '' })).not.toBeNull();
  expect(resolveSectEconomyAction(world, incumbent, { chosenAction: 'GUARD_DUTY', targetLocationId: post.id,
    innerMonologue: '' })).not.toBeNull();
  expect(incumbent.locationId).toBe(post.id);
  expect(reserve.locationId).toBe(hq.id);
  world.tick++;
  const offer = { chosenAction: 'BOUNDARY_RELIEF', boundaryReliefMove: 'offer', targetLocationId: post.id,
    targetCultivatorId: reserve.id, innerMonologue: '请同门自愿接替，实到前不交岗。' } as const;
  const apply = (actor: Cultivator, decision: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, decision, () => .99);
  return { world, chief, incumbent, outsider, reserve, hq, post, offer, apply };
}

describe('boundary relief in both brains', () => {
  it('copies only a matching titled post and real allied nominee, not a forged route, guard, owner or Qi', async () => {
    const { world, chief, incumbent, outsider, reserve, post, offer, apply } = fixture();
    expect(availableBoundaryReliefActions(chief, world, world.tick + 1)).toContainEqual({
      action: 'BOUNDARY_RELIEF', boundaryReliefMove: 'offer', targetLocationId: post.id, targetCultivatorId: reserve.id,
    });
    const mock = vi.fn(async () => respond({ ...offer, targetCultivatorId: outsider.id }));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(chief, world, config, world.tick + 1)).resolves.toBeUndefined();
    for (const injected of [{ targetLocationId: 'imagined' }, { path: [{ x: 180, y: 150 }] },
      { qiProgress: 100 }, { ownerSectId: chief.sectId }, { guardId: incumbent.id }]) {
      mock.mockImplementation(async () => respond({ ...offer, ...injected }));
      await expect(requestCultivatorLLMDecision(chief, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async () => respond(offer));
    const result = await requestCultivatorLLMDecision(chief, world, config, world.tick + 1);
    expect(result).toMatchObject(offer);
    world.tick++;
    expect(apply(chief, result!)).not.toBeNull();
    expect(world.boundaryReliefs.cases[0]).toMatchObject({ status: 'offered', incumbentId: incumbent.id, incomingId: reserve.id });
    expect(reserve.guardAssignment).toBeUndefined();
  });

  it('uses next-turn consent, blocks fictional arrival and stale station actions during actual travel', async () => {
    const { world, chief, incumbent, outsider, reserve, hq, post, offer, apply } = fixture();
    expect(apply(chief, offer)).not.toBeNull();
    const row = world.boundaryReliefs.cases[0];
    const accept = { chosenAction: 'BOUNDARY_RELIEF', boundaryReliefMove: 'accept', targetBoundaryReliefId: row.id,
      innerMonologue: '我自愿接防。' } as const;
    const mock = vi.fn(async (_endpoint: RequestInfo | URL, _init?: RequestInit) => respond(accept));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(outsider, world, config, world.tick + 1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(reserve, world, config, world.tick)).resolves.toBeUndefined();
    const accepted = await requestCultivatorLLMDecision(reserve, world, config, world.tick + 1);
    expect(accepted).toMatchObject(accept);
    world.tick++;
    expect(computeHeuristicDecision(reserve, world, () => .99)).toMatchObject({ chosenAction: 'BOUNDARY_RELIEF', boundaryReliefMove: 'accept' });
    const qi = reserve.qiProgress;
    expect(apply(reserve, accepted!)).not.toBeNull();
    expect(reserve.qiProgress).toBe(qi);
    expect(reserve.locationId).toBe(hq.id);
    expect(boundaryReliefCheckpoint(world, reserve)).toEqual({ x: hq.x, y: hq.y });
    expect(row).toMatchObject({ status: 'travelling', coverage: { kind: 'incumbent', guardId: incumbent.id } });
    expect(reserve.guardAssignment).toBeUndefined();
    expect(incumbent.guardAssignment?.locationId).toBe(post.id);
    mock.mockImplementation(async () => respond({ chosenAction: 'CULTIVATE', innerMonologue: '' }));
    await expect(requestCultivatorLLMDecision(reserve, world, config, world.tick + 1)).resolves.toBeUndefined();
    expect(mock.mock.calls.at(-1)?.[1]?.body).toContain('正在路上的换防修士');
    expect(mock.mock.calls.at(-1)?.[1]?.body).not.toContain('秘密执念');
    expect(computeHeuristicDecision(reserve, world, () => .99).chosenAction).toBe('REST');
  });

  it('sends only an authorized reversal when a travelling nominee is injured within a short true return', async () => {
    const { world, chief, incumbent, reserve, offer, apply } = fixture();
    expect(apply(chief, offer)).not.toBeNull();
    const row = world.boundaryReliefs.cases[0];
    world.tick++;
    expect(apply(reserve, computeHeuristicDecision(reserve, world, () => .99))).not.toBeNull();
    world.tick++;
    advanceBoundaryReliefs(world);
    expect(row.pathIndex).toBeGreaterThan(0);
    expect(row.status).toBe('travelling');
    reserve.hp = Math.floor(reserve.maxHp * .55);
    const utility = computeHeuristicDecision(reserve, world, () => .99);
    expect(utility).toMatchObject({ chosenAction: 'BOUNDARY_RELIEF', boundaryReliefMove: 'withdraw', targetBoundaryReliefId: row.id });
    const reply = { chosenAction: 'BOUNDARY_RELIEF', boundaryReliefMove: 'withdraw', targetBoundaryReliefId: row.id, innerMonologue: '按原路返回。' };
    const mock = vi.fn(async () => respond({ ...reply, targetLocationId: row.originSiteId }));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(reserve, world, config, world.tick + 1)).resolves.toBeUndefined();
    mock.mockImplementation(async () => respond(reply));
    const decision = await requestCultivatorLLMDecision(reserve, world, config, world.tick + 1);
    expect(decision).toMatchObject(reply);
    world.tick++;
    expect(apply(reserve, decision!)).not.toBeNull();
    expect(row.status).toBe('returning');
    expect(incumbent.guardAssignment?.locationId).toBe(row.postSiteId);
    expect(reserve.guardAssignment).toBeUndefined();
  });

  it('lets a fatigued nominee decline safely before taking a physical route', () => {
    const { world, chief, incumbent, reserve, offer, apply } = fixture();
    expect(apply(chief, offer)).not.toBeNull();
    const row = world.boundaryReliefs.cases[0];
    world.tick++;
    reserve.hp = Math.floor(reserve.maxHp * .55);
    const choice = computeHeuristicDecision(reserve, world, () => .99);
    expect(choice).toMatchObject({ chosenAction: 'BOUNDARY_RELIEF', boundaryReliefMove: 'decline', targetBoundaryReliefId: row.id });
    const duty = { ...incumbent.guardAssignment };
    expect(apply(reserve, choice)).not.toBeNull();
    expect(row.status).toBe('declined');
    expect(incumbent.guardAssignment).toEqual(duty);
    expect(reserve.guardAssignment).toBeUndefined();
  });
});
