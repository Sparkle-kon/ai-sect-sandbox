import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { fabricateRumor, RUMOR_LIMIT, spreadRumors, witnessEvent } from '../src/engine/rumorEngine';
import { advanceWorldTick, applyCultivatorBrainDecision, executeGodIntervention } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldEvent } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());

function network() {
  const world = createInitialWorld();
  const [witness, listener, sectMate, stranger] = world.cultivators;
  const [eventSite, relaySite, remoteSite, otherSite] = world.locations;
  world.cultivators = [witness, listener, sectMate, stranger];
  witness.locationId = eventSite.id;
  listener.locationId = relaySite.id;
  sectMate.locationId = remoteSite.id;
  stranger.locationId = otherSite.id;
  listener.sectId = sectMate.sectId = 'sect-qingyun';
  witness.sectId = stranger.sectId = 'sect-bloodmoon';
  const event: WorldEvent = {
    id: 'evt-god-treasure-1-fixture', tick: world.tick, year: world.year, month: world.month,
    title: '赤松边裂出青石碑', description: '只有在灵脉附近才看得见', locationId: eventSite.id,
    actorIds: [witness.id], category: 'heavenly',
  };
  return { world, witness, listener, sectMate, stranger, event };
}

describe('rumor knowledge network', () => {
  it('records only on-site witnesses and relays one hop at a time with decreasing confidence', () => {
    const { world, witness, listener, sectMate, stranger, event } = network();
    witnessEvent(world, event);
    expect(witness.rumors[0]).toMatchObject({ hops: 0, confidence: 100, provenance: 'witness' });
    expect([listener, sectMate, stranger].map((r) => r.rumors.length)).toEqual([0, 0, 0]);
    world.tick = 3;
    witness.locationId = listener.locationId;
    spreadRumors(world);
    expect(listener.rumors[0]).toMatchObject({ confidence: 84, hops: 1, provenance: 'conversation' });
    expect(sectMate.rumors).toEqual([]); // Only the listener could send this onward; not in the same tick.
    world.tick = 6;
    spreadRumors(world);
    expect(sectMate.rumors[0]).toMatchObject({ confidence: 58, hops: 2, provenance: 'flying_sword', sourceCultivatorId: listener.id });
    expect(stranger.rumors[0]).toMatchObject({ confidence: 70, hops: 1, provenance: 'flying_sword', sourceCultivatorId: witness.id });
    world.tick = 26;
    spreadRumors(world);
    expect(world.cultivators.every((c) => c.rumors.length === 0)).toBe(true);
  });

  it('keeps hidden events initially private and bounds rumor storage', () => {
    const { world, witness, listener, event } = network();
    listener.locationId = witness.locationId;
    witnessEvent(world, { ...event, witnessScope: 'participants' });
    expect(listener.rumors).toEqual([]);
    for (let i = 0; i < 50; i++) witnessEvent(world, { ...event, id: `event-${i}` });
    expect(listener.rumors).toHaveLength(RUMOR_LIMIT);
    expect(new Set(listener.rumors.map((r) => r.id)).size).toBe(RUMOR_LIMIT);
  });

  it('uses fabricated and exaggerated leads without changing credibility into fact', () => {
    const { world, witness, listener, event } = network();
    listener.locationId = witness.locationId;
    witness.personality = '刚正';
    fabricateRumor(world, witness, listener, 'FABRICATE');
    expect(listener.rumors).toEqual([]);
    witness.personality = '阴险';
    expect(computeHeuristicDecision(witness, world, () => 0.1)).toMatchObject({ chosenAction: 'SCHEMING', rumorIntent: 'FABRICATE' });
    fabricateRumor(world, witness, listener, 'FABRICATE');
    expect(witness.rumors[0]).toMatchObject({ provenance: 'fabricated', confidence: 65 });
    const lead = listener.rumors[0];
    expect(lead).toMatchObject({ provenance: 'conversation', confidence: 55, hops: 1 });
    expect(lead.id).toBe(witness.rumors[0].id);
    listener.personality = '刚正';
    const draws = [0.9, 0.1];
    expect(computeHeuristicDecision(listener, world, () => draws.shift() ?? 0.5)).toMatchObject({
      chosenAction: 'EXPLORE', targetLocationId: lead.locationId,
    });
    witnessEvent(world, event);
    world.tick = 2;
    fabricateRumor(world, witness, listener, 'EXAGGERATE');
    expect(listener.rumors.some((r) => r.subject.includes('另有隐情'))).toBe(true);
  });

  it('does not allow JSON decisions to bypass local interaction and processes valid observed events', () => {
    const { world, witness, listener, sectMate } = network();
    witness.personality = '诡诈';
    const targeted: LLMDecisionPayload = {
      chosenAction: 'SCHEMING', innerMonologue: '散播风声', targetCultivatorId: listener.id, rumorIntent: 'FABRICATE',
    };
    expect(applyCultivatorBrainDecision(world, witness, targeted, () => 0.1)).toBeNull();
    expect(listener.rumors).toEqual([]);
    listener.locationId = witness.locationId;
    sectMate.locationId = witness.locationId;
    const choices: Record<string, LLMDecisionPayload> = Object.fromEntries(world.cultivators.map((actor) => [
      actor.id, actor.id === witness.id ? targeted : { chosenAction: 'CULTIVATE', innerMonologue: '静修' },
    ]));
    const next = advanceWorldTick(world, choices, () => 0.5);
    const privateEvent = next.events.find((e) => e.id.endsWith('-scheme'));
    expect(privateEvent?.witnessScope).toBe('participants');
    expect(next.cultivators[1].rumors.some((r) => r.id.includes('forged'))).toBe(true);
    expect(next.cultivators[2].rumors.filter((r) => r.id.includes('forged') || r.id.endsWith('-scheme'))).toEqual([]);
    expect(listener.rumors).toEqual([]);
    expect(advanceWorldTick(world, choices, () => 0.5)).toEqual(next);
  });

  it('supplies the LLM with only the local knowledge ledger', async () => {
    const { world, witness, listener, event } = network();
    witnessEvent(world, event);
    world.events.push(event);
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ innerMonologue: '佯称得宝', chosenAction: 'SCHEMING', rumorIntent: 'FABRICATE' }) } }],
    })));
    vi.stubGlobal('fetch', fetchMock);
    const config = { enabled: true, apiBaseUrl: 'https://example.invalid', apiKey: 'test', model: 'fixture' };
    expect((await queryCultivatorLLMDecision(witness, world, config)).rumorIntent).toBe('FABRICATE');
    await queryCultivatorLLMDecision(listener, world, config);
    expect(fetchMock.mock.calls[0][1].body).toEqual(expect.stringContaining(event.title));
    expect(fetchMock.mock.calls[1][1].body).not.toEqual(expect.stringContaining(event.title));
  });

  it('creates stable distinct rumor origins for repeated God interventions at one tick', () => {
    const { world, witness } = network();
    const command = { type: 'SPAWN_TREASURE' as const, targetLocationId: witness.locationId };
    const twice = executeGodIntervention(executeGodIntervention(world, command), command);
    expect(twice.cultivators[0].rumors).toHaveLength(2);
    expect(new Set(twice.cultivators[0].rumors.map((item) => item.id)).size).toBe(2);
    expect(executeGodIntervention(executeGodIntervention(world, command), command)).toEqual(twice);
  });
});
