import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableSectEconomyActions } from '../src/engine/sectEconomyEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' };

describe('sect economy through world ticks', () => {
  it('uses offline choices to dispatch a disciple and physically station them at a resource site', () => {
    let world = createInitialWorld();
    const [leader, disciple] = world.cultivators;
    disciple.locationId = leader.locationId;
    leader.qiProgress = 0;
    disciple.qiProgress = 0;
    world.cultivators = [leader, disciple];
    world.sects = [world.sects[0]];
    world.tick = 8;
    const guardOrder = computeHeuristicDecision(leader, world, () => 0.9);
    expect(guardOrder).toMatchObject({ chosenAction: 'DISPATCH_GUARD', targetCultivatorId: disciple.id });
    const choices = {
      [leader.id]: guardOrder,
      [disciple.id]: { chosenAction: 'REST' as const, innerMonologue: '待命' },
    };
    world = advanceWorldTick(world, choices, () => 0.9);
    expect(world.cultivators[1].guardAssignment).toMatchObject({ locationId: guardOrder.targetLocationId });
    expect(world.cultivators[1].locationId).not.toBe(guardOrder.targetLocationId);
    const duty = computeHeuristicDecision(world.cultivators[1], world, () => 0.9);
    expect(duty.chosenAction).toBe('GUARD_DUTY');
    world = advanceWorldTick(world, {
      [leader.id]: { chosenAction: 'REST', innerMonologue: '留守' },
      [disciple.id]: duty,
    }, () => 0.9);
    expect(world.cultivators[1].locationId).toBe(guardOrder.targetLocationId);
    expect(world.sects[0].monthlyEconomy?.tick).toBe(world.tick);
  });

  it('validates the LLM’s authority to build an array and records the lasting structure', async () => {
    let world = createInitialWorld();
    const [leader, disciple] = world.cultivators;
    disciple.locationId = leader.locationId;
    world.cultivators = [leader, disciple];
    world.sects = [world.sects[0]];
    const response = vi.fn(async (_url: string, _request: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        chosenAction: 'BUILD_FACILITY', facilityKind: 'defense_array', innerMonologue: '护山布阵',
      }) } }],
    })));
    vi.stubGlobal('fetch', response);
    expect((await queryCultivatorLLMDecision(disciple, world, config)).chosenAction).not.toBe('BUILD_FACILITY');
    expect(availableSectEconomyActions(leader, world)).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'BUILD_FACILITY', facilityKind: 'defense_array' }),
    ]));
    const decision = await queryCultivatorLLMDecision(leader, world, config);
    expect(decision).toMatchObject({ chosenAction: 'BUILD_FACILITY', facilityKind: 'defense_array' });
    world = advanceWorldTick(world, {
      [leader.id]: decision,
      [disciple.id]: { chosenAction: 'REST', innerMonologue: '待命' },
    }, () => 0.8);
    expect(world.sects[0].facilities.defense_array).toBe(1);
    expect(world.sects[0].arrayMaxHp).toBeGreaterThan(0);
    expect(response.mock.calls[1][1].body).toEqual(expect.stringContaining('宗门经营许可'));
  });
});
