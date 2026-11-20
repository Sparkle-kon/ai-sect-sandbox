import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableLeadershipActions } from '../src/engine/sectPoliticsEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' };
const cultivation: LLMDecisionPayload = { chosenAction: 'CULTIVATE', innerMonologue: '为本宗守脉' };

describe('sect politics through the simulation', () => {
  it('credits local service, promotes on thresholds, then elects a successor when the incumbent dies', () => {
    let world = createInitialWorld();
    const [leader, disciple] = world.cultivators;
    const sect = world.sects[0];
    world.cultivators = [leader, disciple];
    world.sects = [sect];
    disciple.locationId = sect.headquartersId;
    disciple.contribution = 74;
    disciple.sectRank = '真传弟子';
    const choices = { [leader.id]: cultivation, [disciple.id]: cultivation };
    world = advanceWorldTick(world, choices, () => 0.5);
    expect(world.cultivators[1]).toMatchObject({ contribution: 76, sectRank: '长老' });
    expect(world.sects[0].leaderId).toBe(leader.id);
    world.month = 12;
    world.cultivators[0].age = world.cultivators[0].lifespan - 1;
    world = advanceWorldTick(world, choices, () => 0.5);
    expect(world.sects[0].succession).toMatchObject({
      method: 'election', previousLeaderId: leader.id, leaderId: disciple.id,
    });
    expect(world.cultivators[1].sectRank).toBe('掌门');
    expect(world.events.some((event) => event.title.includes('推举新掌门'))).toBe(true);
  });

  it('supports an in-world challenge with valid political backing in both Utility and JSON mode', async () => {
    const world = createInitialWorld();
    const [leader, actor, friend] = world.cultivators;
    const hq = world.sects[0].headquartersId;
    world.cultivators = [leader, actor, friend];
    actor.locationId = friend.locationId = hq;
    actor.combatPower = 20_000;
    actor.qiProgress = 30;
    world.tick = 4;
    world.relationships = [{ fromId: actor.id, toId: friend.id, type: '挚友', affinity: 95, note: '' }];
    expect(availableLeadershipActions(actor, world)[0]).toMatchObject({ targetCultivatorId: leader.id });
    expect(computeHeuristicDecision(actor, world, () => 0.9).chosenAction).toBe('CHALLENGE_LEADERSHIP');
    let id = 'missing';
    const mock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        chosenAction: 'CHALLENGE_LEADERSHIP', targetCultivatorId: id, innerMonologue: '有同道助我，愿公开问道',
      }) } }],
    })));
    vi.stubGlobal('fetch', mock);
    expect((await queryCultivatorLLMDecision(actor, world, config)).targetCultivatorId).not.toBe('missing');
    id = leader.id;
    const decision = await queryCultivatorLLMDecision(actor, world, config);
    expect(decision).toMatchObject({ chosenAction: 'CHALLENGE_LEADERSHIP', targetCultivatorId: leader.id });
    const after = advanceWorldTick(world, { [actor.id]: decision, [friend.id]: cultivation, [leader.id]: cultivation }, () => 0.5);
    expect(after.sects[0].leaderId).toBe(actor.id);
    expect(after.sects[0].succession).toMatchObject({ method: 'challenge', supporterIds: [friend.id] });
    expect(after.cultivators.filter(({ sectId, sectRank }) => sectId === actor.sectId && sectRank === '掌门')).toHaveLength(1);
  });
});
