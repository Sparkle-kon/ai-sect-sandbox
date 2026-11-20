import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' };
function still(world: WorldState): Record<string, LLMDecisionPayload> {
  return Object.fromEntries(world.cultivators.map((actor) =>
    [actor.id, { chosenAction: 'REST', innerMonologue: '静候消息' }]));
}

describe('inter-sect diplomacy through both brains', () => {
  it('makes Utility leadership pursue validated ties and commits the reciprocal pact through a world tick', () => {
    let world = createInitialWorld();
    world.tick = 9;
    const actor = world.cultivators[0];
    actor.qiProgress = 15;
    for (const relation of world.diplomacy) {
      if (relation.sectAId === actor.sectId || relation.sectBId === actor.sectId) {
        if (relation.affinity > 0) relation.affinity = 90;
      }
    }
    for (const sect of world.sects) {
      const leader = world.cultivators.find((candidate) => candidate.id === sect.leaderId);
      if (leader) leader.locationId = sect.headquartersId;
    }
    const choice = computeHeuristicDecision(actor, world, () => 0.8);
    expect(choice).toMatchObject({ chosenAction: 'OFFER_ALLIANCE' });
    world = advanceWorldTick(world, { ...still(world), [actor.id]: choice }, () => 0.8);
    expect(world.diplomacy.find((relation) =>
      [relation.sectAId, relation.sectBId].includes(actor.sectId) &&
      [relation.sectAId, relation.sectBId].includes(choice.targetSectId ?? ''))?.pact).toBe('alliance');
  });

  it('accepts a leader’s valid JSON war declaration but refuses the same forged authority from a disciple', async () => {
    let world = createInitialWorld();
    const [leader, disciple] = world.cultivators;
    disciple.locationId = leader.locationId;
    const enemy = 'sect-bloodmoon';
    const response = vi.fn(async (_url: string, _request: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        chosenAction: 'DECLARE_WAR', targetSectId: enemy, innerMonologue: '传令与血月决裂',
      }) } }],
    })));
    vi.stubGlobal('fetch', response);
    expect((await queryCultivatorLLMDecision(disciple, world, config)).chosenAction).not.toBe('DECLARE_WAR');
    const decision = await queryCultivatorLLMDecision(leader, world, config);
    expect(decision).toMatchObject({ chosenAction: 'DECLARE_WAR', targetSectId: enemy });
    world = advanceWorldTick(world, { ...still(world), [leader.id]: decision }, () => 0.5);
    expect(world.diplomacy.find((row) => row.sectAId === enemy && row.sectBId === leader.sectId)?.pact).toBe('war');
    expect(response.mock.calls[1][1].body).toEqual(expect.stringContaining('本宗邦交'));
  });
});
