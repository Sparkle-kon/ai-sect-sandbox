import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { spreadRumors, witnessEvent } from '../src/engine/rumorEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWitnesses } from '../src/engine/witnessEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, WorldEvent } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'fixture' };
afterEach(() => vi.unstubAllGlobals());

describe('witness origin and simulations', () => {
  it('keeps participant-only rumors from propagating and preserves original on public re-telling', () => {
    const world = createInitialWorld();
    const [origin, relay, far] = [world.cultivators[3], world.cultivators[4], world.cultivators[7]];
    for (const actor of world.cultivators) actor.alive = [origin, relay, far].includes(actor);
    origin.locationId = 'loc-market';
    relay.locationId = 'loc-taixu';
    far.locationId = 'loc-tianji';
    const event: WorldEvent = { id: 'fixture-scope', title: '私下听见', description: '仅当事人知道',
      category: 'intrigue', actorIds: [origin.id], locationId: 'loc-market', tick: 1, year: world.year, month: 1 };
    witnessEvent(world, { ...event, witnessScope: 'participants' });
    witnessEvent(world, { ...event, id: 'fixture-public', title: '可以转述' });
    world.tick = 2; relay.locationId = 'loc-market'; spreadRumors(world);
    expect(relay.rumors.some(({ id }) => id === 'rumor-fixture-scope')).toBe(false);
    expect(relay.rumors[0]).toMatchObject({ id: 'rumor-fixture-public', sourceCultivatorId: origin.id,
      originEventId: 'fixture-public', originSourceCultivatorId: origin.id });
    origin.locationId = 'loc-blood'; far.locationId = 'loc-market'; world.tick = 4; spreadRumors(world);
    expect(far.rumors[0]).toMatchObject({ sourceCultivatorId: relay.id, originSourceCultivatorId: origin.id, hops: 2 });
  });

  it('commits a legal mocked false claim, allows either brain to file an evidence-backed challenge, restores reputation once', async () => {
    const world = createInitialWorld();
    world.tick = 3; world.month = 3;
    const [winner, loser, claimant] = world.cultivators;
    for (const person of [winner, loser, claimant]) { person.locationId = 'loc-market'; person.qiProgress = 25; }
    claimant.personality = '诡诈';
    const duel: WorldEvent = { id: 'duel-evidence-fixture', tick: 3, year: world.year, month: 3, title: '公开斗法结果',
      category: 'combat', description: '首位修士胜出', actorIds: [winner.id, loser.id], duelWinnerId: winner.id, locationId: 'loc-market' };
    witnessEvent(world, duel);
    const choice = computeHeuristicDecision(claimant, world, () => .99);
    expect(choice).toMatchObject({ chosenAction: 'FILE_WITNESS_CLAIM', targetCultivatorId: winner.id, targetWitnessEventId: duel.id });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(choice) } }] }))));
    const filing = await queryCultivatorLLMDecision(claimant, world, config);
    const sect = world.sects.find(({ id }) => id === winner.sectId)!;
    const reputation = sect.reputation;
    expect(applyCultivatorBrainDecision(world, claimant, filing)).not.toBeNull();
    expect(sect.reputation).toBeLessThan(reputation);
    const reply = computeHeuristicDecision(winner, world, () => .99);
    expect(reply.chosenAction).toBe('CHALLENGE_WITNESS');
    expect(applyCultivatorBrainDecision(world, winner, reply)).not.toBeNull();
    expect(advanceWitnesses(world)).toHaveLength(1);
    expect(advanceWitnesses(world)).toEqual([]);
    expect(world.witnesses.claims[0]).toMatchObject({ status: 'retracted', reputationRestored: reputation - (reputation - 2) });
    expect(sect.reputation).toBe(reputation);
    expect(decodeWorldSave(encodeWorldSave(world)).witnesses).toEqual(world.witnesses);
  });
});
