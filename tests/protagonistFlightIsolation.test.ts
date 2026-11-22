import {afterEach, describe, expect, it, vi} from 'vitest';
import {llmScheduler} from '../src/engine/llmScheduler';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {decodeWorldSave, encodeWorldSave} from '../src/engine/storageEngine';
import type {LLMConfig, WorldState} from '../src/types/world';
import {actualFlight, advance, body} from './protagonistFlightNativeFixture';

const config: LLMConfig = {enabled: true, apiBaseUrl: 'https://flight.invalid/v1', apiKey: 'fixture', model: 'fixture'};
let opened: WorldState | undefined;
const frame = () => structuredClone(opened ??= actualFlight().pursuit);
const reopen = (world: WorldState) => decodeWorldSave(encodeWorldSave(world));

afterEach(() => vi.unstubAllGlobals());

describe('the pursuit and passage keep their exact current native authority', () => {
  it('does not treat a current summary anchor as proof of the pursuit victory or damage', () => {
    const world = frame();
    const contactId = world.protagonistFlights![0].contactEventId;
    expect(world.events.some(row => row.id === contactId)).toBe(true);
    expect(world.chronicleArchive.anchors.some(row => row.id === contactId)).toBe(true);
    expect(reopen(world).protagonistFlights).toEqual(world.protagonistFlights);
    world.events = world.events.filter(row => row.id !== contactId);
    expect(() => reopen(world)).toThrow(/protagonistFlights/);
  });

  it('cannot spell a recent missing stride receipt from the journey ID and calendar number', () => {
    const world = advance(frame());
    const mark = world.protagonistFlights![0].rounds[0];
    expect(mark).toMatchObject({outcome: 'moved', tick: world.tick});
    expect(world.events.find(row => row.id === mark.sourceEventId)).toMatchObject({
      tick: world.tick, category: 'diplomacy', witnessScope: 'participants',
    });
    expect(reopen(world).protagonistFlights).toEqual(world.protagonistFlights);
    world.events = world.events.filter(row => row.id !== mark.sourceEventId);
    expect(() => reopen(world)).toThrow(/protagonistFlights/);
  });

  it('rejects an exact event ID whose native month was changed in the retained passage receipt', () => {
    const world = advance(frame());
    const mark = world.protagonistFlights![0].rounds[0];
    const raw = world.events.find(row => row.id === mark.sourceEventId)!;
    expect(raw.month).toBe(world.month);
    raw.month = raw.month === 1 ? 2 : 1;
    expect(() => reopen(world)).toThrow(/protagonistFlights/);
  });

  it('does not fall back to the ordinary pilgrimage provider for the same opening on a non-next-month request', async () => {
    const world = frame();
    const provider = vi.fn(async () => new Response(JSON.stringify({choices: [{message: {
      content: JSON.stringify({chosenAction: 'REST'}),
    }}]})));
    vi.stubGlobal('fetch', provider);
    for (const tick of [world.tick, world.tick + 2]) {
      llmScheduler.resetTickBudget();
      await expect(requestCultivatorLLMDecision(body(world), world, config, tick)).resolves.toBeUndefined();
    }
    expect(provider).not.toHaveBeenCalled();
  });
});
