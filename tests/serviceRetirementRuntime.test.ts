import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload } from '../src/types/world';

const config = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '暂歇。' };
const retire: LLMDecisionPayload = { chosenAction: 'SECT_SERVICE', serviceMove: 'retire', innerMonologue: '自愿告老。' };
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(7121);
  world.tick = 20;
  world.month = 6;
  const [sect] = world.sects;
  const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const official = world.cultivators.find((actor) => actor.sectId === sect.id && actor.id !== leader.id)!;
  for (const actor of [leader, official]) {
    actor.locationId = sect.headquartersId;
    actor.hp = actor.maxHp;
    actor.lifespan = 150;
    actor.age = 140;
  }
  official.sectRank = '长老';
  official.contribution = 180;
  return { world, sect, leader, official };
}

describe('retirement on the actual world tick and both cognitive paths', () => {
  it('batches concurrent opt-outs before one actual election, and persists each earned rank stamp', () => {
    const { world, sect, leader, official } = fixture();
    world.tick++;
    expect(computeHeuristicDecision(leader, world, () => .99)).toMatchObject({ chosenAction: 'SECT_SERVICE', serviceMove: 'retire' });
    world.tick--;
    const decisions = Object.fromEntries(world.cultivators.map(({ id }) => [id, rest]));
    decisions[leader.id] = decisions[official.id] = retire;
    const next = advanceWorldTick(world, decisions, () => .99);
    const actual = next.sects.find(({ id }) => id === sect.id)!;
    expect(actual.leaderId).toBeDefined();
    expect([leader.id, official.id]).not.toContain(actual.leaderId);
    expect(actual.succession).toMatchObject({ previousLeaderId: leader.id, leaderId: actual.leaderId, tick: next.tick });
    expect(next.events.filter(({ id }) => id.includes('vacancy-') && id.includes(sect.id))).toHaveLength(1);
    expect(next.serviceRetirement.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorId: leader.id, formerRank: '掌门', leaderReleased: true }),
      expect.objectContaining({ actorId: official.id, formerRank: '长老', leaderReleased: false }),
    ]));
    const restored = decodeWorldSave(encodeWorldSave(next));
    expect(restored.serviceRetirement).toEqual(next.serviceRetirement);
    expect(restored.cultivators.find(({ id }) => id === leader.id)?.service)
      .toMatchObject({ status: 'retired', formerRank: '掌门' });
  });

  it('rejects model instructions addressed to somebody else, but applies a legal self decision', async () => {
    const { world, sect, leader, official } = fixture();
    const reply = (value: LLMDecisionPayload) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
    const fetchMock = vi.fn(async () => reply({ ...retire, targetCultivatorId: official.id }));
    vi.stubGlobal('fetch', fetchMock);
    const source = vi.fn();
    const rejected = await queryCultivatorLLMDecision(leader, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    expect(rejected.chosenAction).not.toBe('SECT_SERVICE');
    expect(world.serviceRetirement.history).toEqual([]);
    fetchMock.mockImplementation(async () => reply(retire));
    const allowed = await queryCultivatorLLMDecision(leader, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(applyCultivatorBrainDecision(world, leader, allowed, () => .99)).not.toBeNull();
    expect(sect.leaderId).not.toBe(leader.id);
    expect(world.serviceRetirement.history).toHaveLength(1);
    expect(official.service).toBeUndefined();
  });
});
