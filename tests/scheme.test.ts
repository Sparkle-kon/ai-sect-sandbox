import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { schemeOptions } from '../src/engine/schemeEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, SchemeKind, WorldState } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());

function step(world: WorldState, proposal?: SchemeKind, roll = 0.1, pursuit = true): WorldState {
  const [actor, ...others] = world.cultivators;
  const decisions: Record<string, LLMDecisionPayload> = {
    [actor.id]: { chosenAction: pursuit ? 'PURSUE_SCHEME' : 'REST', innerMonologue: '深谋远虑', proposedScheme: proposal },
  };
  for (const other of others) decisions[other.id] = { chosenAction: 'CULTIVATE', innerMonologue: '凝神运气' };
  return advanceWorldTick(world, decisions, () => roll);
}

describe('multi-tick schemes', () => {
  it('finances, purchases and consumes a pill in ordered turns; pauses preserve the active step', () => {
    let world = createInitialWorld();
    const actor = world.cultivators[0];
    actor.realm = '练气';
    actor.spiritStones = 240;
    actor.qiProgress = 15;
    world.cultivators = [actor];
    world = step(world, 'foundation_pill');
    expect(world.cultivators[0].activeScheme?.stepIndex).toBe(0);
    world = step(world);
    expect(world.cultivators[0].locationId).toBe('loc-market');
    world = step(world, undefined, 0.1, false);
    expect(world.cultivators[0].activeScheme?.stepIndex).toBe(1);
    for (let i = 0; i < 4; i++) world = step(world, 'infiltration');
    const end = world.cultivators[0];
    expect(end.activeScheme).toMatchObject({ kind: 'foundation_pill', status: 'completed', stepIndex: 4 });
    expect(end.qiProgress).toBe(45);
    expect(end.spiritStones).toBe(0);
    const dates = end.activeScheme?.steps.map((item) => item.completedTick);
    expect(new Set(dates).size).toBe(4);
    expect(schemeOptions(end, world)).toEqual([]);
    expect(world.events[0].description).toContain('购得筑基丹');
  });

  it('uses Utility AI to start an eligible infiltration and return to headquarters after scouting', () => {
    let world = createInitialWorld();
    const actor = world.cultivators[3];
    world.cultivators = [actor];
    world.tick = 6;
    actor.qiProgress = 40;
    expect(computeHeuristicDecision(actor, world, () => 0.1)).toMatchObject({
      chosenAction: 'PURSUE_SCHEME', proposedScheme: 'infiltration',
    });
    world = step(world, 'infiltration');
    for (let i = 0; i < 6; i++) world = step(world);
    const end = world.cultivators[0];
    expect(end.activeScheme).toMatchObject({ status: 'completed', stepIndex: 5 });
    expect(end.activeScheme?.outcome).toContain('灵气');
    expect(end.locationId).toBe(world.sects.find((sect) => sect.id === end.sectId)?.headquartersId);
    expect(end.spiritStones).toBe(actor.spiritStones - 120);
  });

  it('resolves vengeance via the local combat engine and retires the blood feud after a win', () => {
    let world = createInitialWorld();
    const [actor, target] = world.cultivators;
    target.locationId = actor.locationId;
    world.cultivators = [actor, target];
    world.relationships = [{ fromId: actor.id, toId: target.id, type: '血仇', affinity: -70, note: '旧账' }];
    world = step(world, 'vengeance');
    for (let i = 0; i < 3; i++) world = step(world);
    expect(world.cultivators[0].activeScheme).toMatchObject({ status: 'completed', stepIndex: 3 });
    expect(world.cultivators[1].hp).toBeLessThan(target.hp);
    expect(world.relationships[0].affinity).toBeGreaterThan(-60);
    expect(world.events[0].category).toBe('combat');
  });

  it('transfers an actual artifact once or records failure with no transfer', () => {
    const setup = () => {
      const world = createInitialWorld();
      const [target, , , actor] = world.cultivators;
      target.locationId = actor.locationId;
      world.cultivators = [actor, target];
      return world;
    };
    const success = setup();
    const artifact = success.cultivators[1].artifacts[0];
    for (const [roll, expected] of [[0.05, 'completed'], [0.99, 'failed']] as const) {
      let world = step(setup(), 'artifact_heist', roll);
      for (let i = 0; i < 4; i++) world = step(world, undefined, roll);
      expect(world.cultivators[0].activeScheme?.status).toBe(expected);
      expect(world.cultivators[0].artifacts.includes(artifact)).toBe(expected === 'completed');
      expect(world.cultivators[1].artifacts.includes(artifact)).toBe(expected === 'failed');
    }
  });

  it('expires stale schemes even when the cultivator takes no pursuit action', () => {
    let world = createInitialWorld();
    world.cultivators = [world.cultivators[0]];
    world.cultivators[0].realm = '练气';
    world = step(world, 'foundation_pill');
    world.tick += 23;
    world = step(world, undefined, 0.5, false);
    expect(world.cultivators[0].activeScheme).toMatchObject({ status: 'failed', stepIndex: 0 });
  });

  it('accepts eligible JSON proposals only and supplies the actor’s remaining steps', async () => {
    let world = createInitialWorld();
    const actor = world.cultivators[0];
    actor.realm = '练气';
    let proposal = 'infiltration';
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ chosenAction: 'PURSUE_SCHEME', innerMonologue: '筹资', proposedScheme: proposal }) } }],
    })));
    vi.stubGlobal('fetch', fetchMock);
    const config = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'test', model: 'fixture' };
    expect((await queryCultivatorLLMDecision(actor, world, config)).chosenAction).not.toBe('PURSUE_SCHEME');
    proposal = 'foundation_pill';
    const decision = await queryCultivatorLLMDecision(actor, world, config);
    expect(decision).toMatchObject({ chosenAction: 'PURSUE_SCHEME', proposedScheme: 'foundation_pill' });
    world = advanceWorldTick(world, { [actor.id]: decision }, () => 0.1);
    await queryCultivatorLLMDecision(world.cultivators[0], world, config);
    expect(fetchMock.mock.calls[2][1].body).toEqual(expect.stringContaining('前往坊市'));
  });
});
