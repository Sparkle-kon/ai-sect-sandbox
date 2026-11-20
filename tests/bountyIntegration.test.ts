import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceBounties } from '../src/engine/bountyEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'fixture', model: 'fixture' };
const rest = (world: WorldState): Record<string, LLMDecisionPayload> => Object.fromEntries(
  world.cultivators.map((actor) => [actor.id, { chosenAction: 'REST', innerMonologue: '不涉尘务' }])
);

describe('bounty board through world simulation', () => {
  it('tracks repeated lethal combat as corruption and funds a real board entry once', () => {
    let world = createInitialWorld();
    const outlaw = world.cultivators[2];
    const victims = world.cultivators.slice(4, 6);
    outlaw.combatPower = 100_000;
    outlaw.karma = -20;
    for (const [index, victim] of victims.entries()) {
      const current = world.cultivators.find((who) => who.id === victim.id);
      if (!current) throw new Error('missing fixture victim');
      current.locationId = outlaw.locationId;
      current.hp = 1;
      world = advanceWorldTick(world, {
        ...rest(world), [outlaw.id]: { chosenAction: 'DUEL', targetCultivatorId: victim.id, innerMonologue: '决战' },
      }, () => 0.1);
      expect(world.cultivators.find((who) => who.id === victim.id)?.alive).toBe(false);
      expect(world.bounties).toHaveLength(index);
    }
    const bounty = world.bounties[0];
    expect(bounty).toMatchObject({ targetCultivatorId: outlaw.id, status: 'open' });
    expect(bounty.escrow.reduce((total, item) => total + item.amount, 0)).toBe(bounty.reward);
    expect(world.cultivators.find((who) => who.id === outlaw.id)).toMatchObject({ karma: -44, transgressions: 4 });
  });

  it('allows offline or JSON pursuit and pays only the verified nonlethal victor', async () => {
    let world = createInitialWorld();
    world.tick = 4;
    const [hunter, , outlaw] = world.cultivators;
    outlaw.transgressions = 4;
    outlaw.locationId = hunter.locationId;
    hunter.combatPower = 100_000;
    hunter.qiProgress = 15;
    advanceBounties(world);
    const bounty = world.bounties[0];
    expect(computeHeuristicDecision(hunter, world, () => 0.5).chosenAction).toBe('PURSUE_BOUNTY');
    let targetId = 'missing';
    const response = vi.fn(async (_url: string, _request: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        chosenAction: 'PURSUE_BOUNTY', targetBountyId: targetId, innerMonologue: '请随我回宗认案',
      }) } }],
    })));
    vi.stubGlobal('fetch', response);
    expect((await queryCultivatorLLMDecision(hunter, world, config)).targetBountyId).not.toBe('missing');
    targetId = bounty.id;
    const decision = await queryCultivatorLLMDecision(hunter, world, config);
    expect(decision).toMatchObject({ chosenAction: 'PURSUE_BOUNTY', targetBountyId: bounty.id });
    world = advanceWorldTick(world, { ...rest(world), [hunter.id]: decision }, () => 0.1);
    expect(world.bounties[0]).toMatchObject({ status: 'claimed', hunterId: hunter.id, escrow: [] });
    expect(world.cultivators.find((who) => who.id === outlaw.id)?.alive).toBe(true);
    expect(world.cultivators[0].spiritStones).toBe(hunter.spiritStones + bounty.reward);
    expect(world.cultivators[0].transgressions).toBe(0);
  });
});
