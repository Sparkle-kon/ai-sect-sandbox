import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { possessAvatar } from '../src/engine/avatarEngine';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { activeRoguelikeEncounter } from '../src/engine/roguelikeEncounterEngine';
import { WorldSaveError, decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave, encodeWorldSave, worldSaveByteCount, WORLD_SAVE_MAX_BYTES } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload, WorldState } from '../src/types/world';
import { dungeonActor, dungeonMove, dungeonOccasion, dungeonOccasionIn, enterNativeDungeon } from './expeditionDungeonNativeFixture';

// Expected values were captured by running this same offline harness against b1bd338f569552b5cd031c43ef211640c1cdf35f.
async function signature(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return { utf8Bytes: bytes.byteLength, sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') };
}
const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'extraction-fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '停在实到之处。' };
const restOrders = (world: WorldState) => Object.fromEntries(world.cultivators.map(({id}) => [id, rest]));
function getActor(world: WorldState, id: string) {
  const actor = world.cultivators.find(row => row.id === id);
  if (!actor) throw Error('Missing fixture actor');
  return actor;
}
function encounterFixture(guided = false) {
  const start = createInitialWorld(153);
  const [original] = start.cultivators;
  const site = start.locations.find(({ id }) => id === 'loc-secret-1')!;
  original.exploredTileIds.push(terrainTileAt(start, site.x, site.y)!.id);
  original.secretGoal = '无关的私下念头，不可发送。';
  if (guided) expect(possessAvatar(start, original.id)).toBe(true);
  const world = advanceWorldTick(start, { ...restOrders(start), [original.id]: {
    chosenAction: 'EXPLORE', targetLocationId: site.id, innerMonologue: '由真实已知路线探索。',
  } }, () => .99);
  const actor = getActor(world, original.id);
  const encounter = activeRoguelikeEncounter(world, actor);
  if (!encounter) throw Error('Fixture did not open a native encounter');
  expect(encounter.guided).toBe(guided);
  return { world, actor, encounter };
}

beforeEach(() => llmScheduler.resetTickBudget());
afterEach(() => { vi.unstubAllGlobals(); llmScheduler.resetTickBudget(); });

function stubProvider(reply: () => unknown) {
  const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply()) } }] })));
  vi.stubGlobal('fetch', request);
  return request;
}

async function readWire(transport: ReturnType<typeof stubProvider>) {
  expect(transport).toHaveBeenCalledTimes(1);
  const [url, init] = transport.mock.calls[0];
  if (typeof init?.body !== 'string') throw Error('Expected the unparsed request body to be a string');
  return { url: String(url), method: init.method, headers: init.headers, body: await signature(init.body) };
}

async function requestNext(actor: Cultivator, world: WorldState, onStart = vi.fn()) {
  const decision = await requestCultivatorLLMDecision(actor, world, config, world.tick + 1, { onStart });
  expect(onStart).toHaveBeenCalledTimes(1);
  return decision;
}

describe('SV3-1 wire baseline after engine extraction', () => {
  it('preserves generic local prompt bytes and accepted decision; remote actor is denied on the same wire', async () => {
    const start = createInitialWorld(2031), [original, local, remote] = start.cultivators;
    original.locationId = local.locationId = 'loc-market';
    remote.locationId = 'loc-blood';
    original.hp -= 100;
    const world = advanceWorldTick(start, restOrders(start), () => .99);
    const actor = getActor(world, original.id);
    const reply = (targetCultivatorId: string) => ({ chosenAction: 'SOCIALIZE', targetCultivatorId, innerMonologue: '只与现场有缘之人交谈。' });
    const accepted = stubProvider(() => reply(local.id));
    const decision = await requestNext(actor, world);
    const wire = await readWire(accepted);
    expect({ wire, decision }).toMatchSnapshot();

    llmScheduler.resetTickBudget();
    const denied = stubProvider(() => reply(remote.id));
    await expect(requestNext(actor, world)).resolves.toBeUndefined();
    expect(await readWire(denied)).toEqual(wire);
  });

  it('keeps exact private encounter wire and native settlement; stale and guided frames make no request', async () => {
    const { world, actor, encounter } = encounterFixture();
    const guided = encounterFixture(true);
    const reply = { chosenAction: 'ROGUELIKE_ENCOUNTER', targetRoguelikeEncounterId: encounter.id, roguelikeEncounterChoice: 'bold' };
    const provider = stubProvider(() => reply);
    const onStart = vi.fn();
    for (const tick of [world.tick, world.tick + 2]) {
      await expect(requestCultivatorLLMDecision(actor, world, config, tick, { onStart })).resolves.toBeUndefined();
    }
    await expect(requestCultivatorLLMDecision(guided.actor, guided.world, config, guided.world.tick + 1, { onStart })).resolves.toBeUndefined();
    expect(provider).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    const decision = await requestNext(actor, world, onStart);
    if (!decision) throw Error('Expected model-authorized encounter decision');
    const effect = vi.fn();
    const settled = advanceWorldTick(world, { ...restOrders(world), [actor.id]: decision }, () => .99,
      'deferred', effect, { modelActors: new Set([actor.id]) });
    expect(effect).toHaveBeenCalledWith(actor.id, true);
    expect({ wire: await readWire(provider), decision, settlement: settled.roguelikeEncounters?.find(({id}) => id === encounter.id) }).toMatchSnapshot();
  });

  it('keeps native private dungeon request bytes and exact persisted committed effect', async () => {
    const { entered, world } = enterNativeDungeon();
    const actor = dungeonActor(world);
    const reply = { chosenAction: 'EXPEDITION_DUNGEON', targetOccasionId: dungeonOccasion, targetDungeonRoomId: 'garden', dungeonMove: 'gather' };
    const provider = stubProvider(() => reply);
    await expect(requestCultivatorLLMDecision(dungeonActor(entered), entered, config, entered.tick + 1)).resolves.toBeUndefined();
    expect(provider).not.toHaveBeenCalled();
    const decision = await requestNext(actor, world);
    if (!decision) throw Error('Expected model-authorized dungeon decision');
    const effect = vi.fn();
    const settled = advanceWorldTick(world, { ...restOrders(world), [actor.id]: decision }, () => .99,
      'deferred', effect, { modelActors: new Set([actor.id]) });
    expect(effect).toHaveBeenCalledWith(actor.id, true);
    expect({ wire: await readWire(provider), decision, settlement: dungeonOccasionIn(settled).dungeon?.steps.at(-1) }).toMatchSnapshot();
  });
});

describe('SV3-1 storage baseline after engine extraction', () => {
  it('preserves exact versioned bytes for initial legacy, genuine unresolved encounter and native dungeon progress', async () => {
    const { world } = enterNativeDungeon();
    const moved = dungeonMove(world, 'gather', 'garden');
    const closed = dungeonMove(moved, 'retreat', 'hall');
    expect(dungeonOccasionIn(closed).dungeon?.outcome).toBe('retreated');
    const cases = { legacy: createInitialWorld(2031), encounter: encounterFixture().world, moved, closed };
    const extract = async (state: WorldState) => {
      const plain = encodeWorldSave(state);
      const era = encodeEraWorldSave(state);
      expect(plain.startsWith('{"format":"ai-sect-sandbox","version":1,"world":')).toBe(true);
      expect(worldSaveByteCount(state)).toBe(new TextEncoder().encode(plain).byteLength);
      expect(encodeWorldSave(decodeWorldSave(plain))).toBe(plain);
      expect(encodeEraWorldSave(decodeEraWorldSave(era))).toBe(era);
      return { plain: await signature(plain), era: await signature(era) };
    };
    expect(Object.fromEntries(await Promise.all(Object.entries(cases).map(async ([key, state]) => [key, await extract(state)] as const)))).toMatchSnapshot();
  });

  it('keeps the original error class and first error path across malformed inputs and invalid native authority', () => {
    const world = createInitialWorld(2031);
    const envelope = JSON.parse(encodeWorldSave(world)) as { version: number; world: WorldState };
    const withWrongReference = structuredClone(envelope);
    withWrongReference.world.cultivators[0].locationId = 'unknown-site';
    const withDuplicate = structuredClone(withWrongReference);
    withDuplicate.world.locations[1].id = withDuplicate.world.locations[0].id;
    const privateNative = enterNativeDungeon().world;
    const step = dungeonOccasionIn(privateNative).dungeon!.steps[0];
    step.eventId = 'forged-private-event';
    const capture = (run: () => unknown) => {
      try { run(); } catch (error) {
        expect(error).toBeInstanceOf(WorldSaveError);
        if (!(error instanceof WorldSaveError)) throw error;
        expect(error.constructor).toBe(WorldSaveError);
        return { name: error.name, code: error.code, message: error.message };
      }
      throw Error('Expected corrupt save rejection');
    };
    const oversizedUnicode = '山'.repeat(Math.floor(WORLD_SAVE_MAX_BYTES / 3) + 1);
    expect({
      oversizedPlain: capture(() => decodeWorldSave(oversizedUnicode)),
      allowedEraSizeThenInvalidJson: capture(() => decodeEraWorldSave(oversizedUnicode)),
      malformed: capture(() => decodeWorldSave('{')),
      versionFirst: capture(() => decodeWorldSave(JSON.stringify({ ...withDuplicate, version: 99, credential: 'private' }))),
      envelopeUnknown: capture(() => decodeWorldSave(JSON.stringify({ ...withDuplicate, credential: 'private' }))),
      nestedUnknownFirst: capture(() => decodeWorldSave(JSON.stringify({
        ...withDuplicate, world: { ...withDuplicate.world, credential: 'private' },
      }))),
      duplicateFirst: capture(() => decodeWorldSave(JSON.stringify(withDuplicate))),
      reference: capture(() => decodeWorldSave(JSON.stringify(withWrongReference))),
      privateNative: capture(() => encodeWorldSave(privateNative)),
    }).toMatchSnapshot();
  });
});
