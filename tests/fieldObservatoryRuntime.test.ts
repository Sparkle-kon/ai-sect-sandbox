import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableObservatoryActions, OBSERVATORY_COST, projectFieldObservatory } from '../src/engine/fieldObservatoryEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { localQiWeather } from '../src/engine/weatherEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const config = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'test-fixture', model: 'fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '实测须本人按时在场。' };
const turn = (world: WorldState, actorId?: string, choice?: LLMDecisionPayload) => {
  const decisions = Object.fromEntries(world.cultivators.map(({ id }) => [id, rest]));
  if (actorId && choice) decisions[actorId] = choice;
  return advanceWorldTick(world, decisions, () => .99);
};
afterEach(() => vi.unstubAllGlobals());

describe('funded temporary field forecasts at live and prospective action ticks', () => {
  it('scores a sealed prediction only against the real target turn, recognizes a missed branch, and relays only the aged reading', async () => {
    let world = createInitialWorld(11721);
    world.month = 5;
    const site = world.locations.find(({ id }) => id === 'loc-market')!;
    const [operator, recipient, outsider] = world.cultivators;
    for (const actor of world.cultivators) actor.locationId = 'loc-market-east';
    operator.locationId = recipient.locationId = site.id;
    operator.spiritStones = 100;
    operator.hp = operator.maxHp;
    world.tick = Array.from({ length: 40 }, (_, index) => index + 30).find((tick) => {
      world.tick = tick;
      const now = localQiWeather(world, site);
      const future = localQiWeather(world, site, tick + 2);
      return now.kind !== future.kind && now.intensity !== future.intensity;
    })!;
    expect(world.tick).toBeGreaterThanOrEqual(30);
    const realBaseline = localQiWeather(world, site);
    const fund = availableObservatoryActions(operator, world).find(({ observatoryMove }) => observatoryMove === 'fund')!;
    expect(fund).toBeDefined();
    expect(applyCultivatorBrainDecision(world, operator, { ...rest, ...fund, chosenAction: 'FIELD_OBSERVATORY' }, () => .99)).not.toBeNull();
    expect(operator.spiritStones).toBe(100 - OBSERVATORY_COST);
    const openedTick = world.tick;
    const initial = projectFieldObservatory(world, operator).runs[0];
    expect(initial).toMatchObject({ status: 'pending', baseline: { kind: realBaseline.kind, intensity: realBaseline.intensity },
      forecast: { kind: realBaseline.kind, intensity: realBaseline.intensity }, targetTick: openedTick + 2 });
    expect(projectFieldObservatory(world, outsider).runs).toEqual([]);
    world = turn(world);
    const beforeTarget = world.cultivators.find(({ id }) => id === operator.id)!;
    expect(availableObservatoryActions(beforeTarget, world).some(({ observatoryMove }) => observatoryMove === 'measure')).toBe(false);
    const prepared = availableObservatoryActions(beforeTarget, world, world.tick + 1).find(({ observatoryMove }) => observatoryMove === 'measure')!;
    expect(prepared).toBeDefined();
    const action: LLMDecisionPayload = { ...rest, ...prepared, chosenAction: 'FIELD_OBSERVATORY' };
    const reply = (choice: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(choice) } }] }));
    const mock = vi.fn(async () => reply({ ...action, targetObservatoryTick: openedTick + 199 }));
    vi.stubGlobal('fetch', mock);
    const source = vi.fn();
    const fallback = await queryCultivatorLLMDecision(beforeTarget, world, config, source, world.tick + 1);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(fallback).toMatchObject({ chosenAction: 'FIELD_OBSERVATORY', observatoryMove: 'measure', targetObservatoryTick: openedTick });
    mock.mockImplementation(async () => reply({ ...action, reading: { kind: '冒充实测', intensity: .999 } }));
    const requested = await queryCultivatorLLMDecision(beforeTarget, world, config, source, world.tick + 1);
    expect(source).toHaveBeenLastCalledWith('llm');
    const missed = turn(decodeWorldSave(encodeWorldSave(world)));
    const missedObserver = missed.cultivators.find(({ id }) => id === operator.id)!;
    expect(projectFieldObservatory(missed, missedObserver).runs[0]).toMatchObject({ status: 'missed' });
    expect(projectFieldObservatory(missed, missedObserver).metrics.scored).toBe(0);
    world = turn(world, operator.id, requested);
    const active = () => world.cultivators.find(({ id }) => id === operator.id)!;
    const actualSite = world.locations.find(({ id }) => id === site.id)!;
    const expected = localQiWeather(world, actualSite);
    const daytime = projectFieldObservatory(world, active());
    expect(daytime.runs[0]).toMatchObject({ status: 'measured', reading: { kind: expected.kind, intensity: expected.intensity },
      kindHit: false, intensityErrorPp: Math.round(Math.abs(realBaseline.intensity - expected.intensity) * 100) });
    expect(daytime.metrics.scored).toBe(1);
    expect(applyCultivatorBrainDecision(world, active(), requested, () => .99)).toBeNull();
    world = turn(world);
    const relay = computeHeuristicDecision(active(), world, () => .99);
    expect(relay).toMatchObject({ chosenAction: 'FIELD_OBSERVATORY', observatoryMove: 'relay', targetCultivatorId: recipient.id });
    expect(applyCultivatorBrainDecision(world, active(), relay, () => .99)).not.toBeNull();
    expect(applyCultivatorBrainDecision(world, active(), relay, () => .99)).toBeNull();
    const inbox = projectFieldObservatory(world, world.cultivators.find(({ id }) => id === recipient.id)!).received;
    expect(inbox).toEqual([expect.objectContaining({ measuredTick: openedTick + 2, relayedTick: world.tick, ageTicks: 1, stale: true,
      reading: { kind: expected.kind, intensity: expected.intensity } })]);
    expect(projectFieldObservatory(world, world.cultivators.find(({ id }) => id === outsider.id)!).received).toEqual([]);
    const raw = encodeWorldSave(world);
    expect(decodeWorldSave(raw).fieldObservatories).toEqual(world.fieldObservatories);
    const bad = JSON.parse(raw) as { world: typeof world };
    bad.world.fieldObservatories.byActor[recipient.id].inbox[0].openedTick++;
    expect(() => decodeWorldSave(JSON.stringify(bad))).toThrow('fieldObservatories.inbox.references');
  });
});
