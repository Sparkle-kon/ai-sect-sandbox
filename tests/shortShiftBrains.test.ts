import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { OBSERVATORY_LEAD_TICKS, resolveObservatoryAction } from '../src/engine/fieldObservatoryEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableShortShiftActions, SHORT_SHIFT_WAGE } from '../src/engine/shortShiftEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-shift' };
const respond = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(622);
  const host = world.cultivators.find(({ id }) => id === 'npc-1')!;
  const worker = world.cultivators.find(({ id }) => id === 'npc-6')!;
  const outsider = world.cultivators.find(({ id }) => id === 'npc-2')!;
  worker.locationId = host.locationId;
  worker.hp = worker.maxHp;
  worker.qiProgress = 50;
  worker.personality = '刚正';
  const site = world.locations.find(({ id }) => id === host.locationId)!;
  const sourceTick = world.tick;
  const weather = (actor: Cultivator, observatoryMove: 'fund' | 'measure', at?: number) =>
    resolveObservatoryAction(world, actor, { chosenAction: 'FIELD_OBSERVATORY', observatoryMove,
      targetLocationId: site.id, targetObservatoryTick: at, innerMonologue: '' });
  expect(weather(host, 'fund')).not.toBeNull();
  world.tick += OBSERVATORY_LEAD_TICKS;
  expect(weather(host, 'measure', sourceTick)).not.toBeNull();
  const offer = { chosenAction: 'SHORT_SHIFT', shortShiftMove: 'offer', targetCultivatorId: worker.id,
    targetObservatoryTick: sourceTick, innerMonologue: '凭真实观象，请道友自愿值一班。' } as const;
  const shift = (actor: Cultivator, decision: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, decision, () => .99);
  return { world, host, worker, outsider, site, offer, weather, shift };
}

describe('cross-sect short shifts in both brains', () => {
  it('decodes only the actual visitor and measured observatory source, never invented terms', async () => {
    const { world, host, worker, outsider, site, offer, shift } = fixture();
    expect(availableShortShiftActions(host, world, world.tick + 1)).toContainEqual({
      action: 'SHORT_SHIFT', shortShiftMove: 'offer', targetCultivatorId: worker.id, targetObservatoryTick: offer.targetObservatoryTick,
    });
    const mocked = vi.fn(async (_endpoint: RequestInfo | URL, _init?: RequestInit) => respond({ ...offer, targetObservatoryTick: 999 }));
    vi.stubGlobal('fetch', mocked);
    await expect(requestCultivatorLLMDecision(host, world, config, world.tick + 1)).resolves.toBeUndefined();
    mocked.mockImplementation(async () => respond({ ...offer, targetCultivatorId: outsider.id }));
    await expect(requestCultivatorLLMDecision(host, world, config, world.tick + 1)).resolves.toBeUndefined();
    for (const injected of [{ wage: 900 }, { targetLocationId: site.id }, { intensity: .3 }, { targetSectId: host.sectId }]) {
      mocked.mockImplementation(async () => respond({ ...offer, ...injected }));
      await expect(requestCultivatorLLMDecision(host, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    mocked.mockImplementation(async () => respond(offer));
    const decision = await requestCultivatorLLMDecision(host, world, config, world.tick + 1);
    expect(decision).toMatchObject(offer);
    expect(mocked.mock.calls.at(-1)?.[1]?.body).toContain('跨宗短聘只复制现场许可');
    world.tick++;
    expect(shift(host, decision!)).not.toBeNull();
    expect(world.shortShifts.shifts[0]).toMatchObject({ hostId: host.id, workerId: worker.id, status: 'offered', escrowStones: 0 });
  });

  it('models visiting worker consent then only the exact next paid shift and never duplicates its pay', async () => {
    const { world, host, worker, outsider, offer, shift } = fixture();
    const hostFunds = host.spiritStones, workerFunds = worker.spiritStones;
    const affiliation = [worker.sectId, worker.sectRank];
    world.tick++;
    expect(shift(host, offer)).not.toBeNull();
    const row = world.shortShifts.shifts[0];
    const accept = { chosenAction: 'SHORT_SHIFT', shortShiftMove: 'accept', targetShortShiftId: row.id, innerMonologue: '我自愿值班。' } as const;
    const work = { ...accept, shortShiftMove: 'work' } as const;
    const mocked = vi.fn(async () => respond(accept));
    vi.stubGlobal('fetch', mocked);
    await expect(requestCultivatorLLMDecision(outsider, world, config, world.tick + 1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(worker, world, config, world.tick)).resolves.toBeUndefined();
    const accepted = await requestCultivatorLLMDecision(worker, world, config, world.tick + 1);
    expect(accepted).toMatchObject(accept);
    world.tick++;
    expect(computeHeuristicDecision(worker, world, () => .99)).toMatchObject({ chosenAction: 'SHORT_SHIFT', shortShiftMove: 'accept' });
    expect(shift(worker, accepted!)).not.toBeNull();
    expect(host.spiritStones).toBe(hostFunds - SHORT_SHIFT_WAGE);
    worker.qiProgress = 95; // An accepted shift outranks an optional breakthrough.
    mocked.mockImplementation(async () => respond({ ...work, targetObservatoryTick: offer.targetObservatoryTick }));
    await expect(requestCultivatorLLMDecision(worker, world, config, world.tick + 1)).resolves.toBeUndefined();
    mocked.mockImplementation(async () => respond(work));
    await expect(requestCultivatorLLMDecision(worker, world, config, world.tick)).resolves.toBeUndefined();
    const attendance = await requestCultivatorLLMDecision(worker, world, config, world.tick + 1);
    expect(attendance).toMatchObject(work);
    world.tick++;
    expect(computeHeuristicDecision(worker, world, () => .99)).toMatchObject({ ...work, innerMonologue: expect.any(String) });
    expect(shift(worker, attendance!)).not.toBeNull();
    expect(shift(worker, attendance!)).toBeNull();
    expect(worker.spiritStones).toBe(workerFunds + SHORT_SHIFT_WAGE);
    expect([worker.sectId, worker.sectRank]).toEqual(affiliation);
  });

  it('does not displace a pre-existing genuine observatory sampling appointment with short-shift work', () => {
    const { world, host, worker, offer, weather, shift } = fixture();
    world.tick++;
    const otherSource = world.tick;
    expect(weather(worker, 'fund')).not.toBeNull();
    expect(shift(host, offer)).not.toBeNull();
    const row = world.shortShifts.shifts[0];
    world.tick++;
    expect(shift(worker, { chosenAction: 'SHORT_SHIFT', shortShiftMove: 'accept', targetShortShiftId: row.id, innerMonologue: '' })).toBeNull();
    world.tick++;
    const choice = computeHeuristicDecision(worker, world, () => .99);
    expect(choice).toMatchObject({ chosenAction: 'FIELD_OBSERVATORY', observatoryMove: 'measure', targetObservatoryTick: otherSource });
    expect(resolveObservatoryAction(world, worker, choice)).not.toBeNull();
    expect(row.paidStones).toBe(0);
  });
});
