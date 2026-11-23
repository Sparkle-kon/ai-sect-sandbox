import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createDecisionReplayTape } from '../src/engine/decisionTraceEngine';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { applyWatchMutation } from '../src/engine/watchlistEngine';
import { projectWitnessedPersonalStory } from '../src/engine/witnessedPersonalStory';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload, WorldEvent, WorldState } from '../src/types/world';
import { dungeonActor, dungeonOccasion, dungeonOccasionIn, enterNativeDungeon } from './expeditionDungeonNativeFixture';
import { apprenticeId, beforeNativeFurnaceDamage, brew, furnaceId } from './worldTickPipelineFurnaceFixture';

// Golden observations captured from the exact parent tree d25248a664e5a8da07eeaad40cd69427c8f9d39b.
const probe = vi.hoisted(() => ({ active: undefined as undefined | {
  witness(event: WorldEvent, world: WorldState): void;
  archive(events: readonly WorldEvent[]): void;
  map(events: readonly WorldEvent[]): void;
  replay(args: readonly unknown[]): void;
} }));
vi.mock('../src/engine/rumorEngine', async importOriginal => {
  const native = await importOriginal<typeof import('../src/engine/rumorEngine')>();
  return { ...native, witnessEvent: (...args: Parameters<typeof native.witnessEvent>) => {
    probe.active?.witness(args[1], args[0]);
    native.witnessEvent(...args);
  } };
});
vi.mock('../src/engine/novelGenerator', async importOriginal => {
  const native = await importOriginal<typeof import('../src/engine/novelGenerator')>();
  return { ...native, archiveChronicleEvents: (...args: Parameters<typeof native.archiveChronicleEvents>) => {
    probe.active?.archive(args[1]);
    native.archiveChronicleEvents(...args);
  } };
});
vi.mock('../src/engine/mapMotionEngine', async importOriginal => {
  const native = await importOriginal<typeof import('../src/engine/mapMotionEngine')>();
  return { ...native, deriveMapPresentation: (...args: Parameters<typeof native.deriveMapPresentation>) => {
    probe.active?.map(args[2]);
    return native.deriveMapPresentation(...args);
  } };
});
vi.mock('../src/engine/decisionTraceEngine', async importOriginal => {
  const native = await importOriginal<typeof import('../src/engine/decisionTraceEngine')>();
  return { ...native, rememberReplayDecision: (...args: Parameters<typeof native.rememberReplayDecision>) => {
    probe.active?.replay(args.slice(1, 7));
    native.rememberReplayDecision(...args);
  } };
});

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '只在原地静候。' };
const quiet = (world: WorldState) => Object.fromEntries(world.cultivators.map(({id}) => [id, rest]));
const ids = (events: readonly WorldEvent[]) => events.map(({ id }) => id);
async function signature(raw: string) {
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return { utf8Bytes: bytes.length, sha256: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') };
}
const hash = (value: unknown) => signature(JSON.stringify(value));

afterEach(() => {
  probe.active = undefined;
  vi.unstubAllGlobals();
  llmScheduler.resetTickBudget();
});

type ObserveOptions = {
  orders?: Record<string, LLMDecisionPayload>;
  mode?: 'utility' | 'deferred';
  modelActors?: ReadonlySet<string>;
  witnessActors?: readonly string[];
  injected?: number;
  includeWatchHook?: boolean;
  capturePresentation?: boolean;
  captureTrace?: boolean;
};

async function observe(rawInput: string, options: ObserveOptions = {}) {
  const input = decodeEraWorldSave(rawInput);
  expect(encodeEraWorldSave(input)).toBe(rawInput);
  const order: string[] = [];
  const witness: unknown[] = [];
  const archive: WorldEvent[][] = [];
  const archiveInputs: (readonly WorldEvent[])[] = [];
  let mapInput: readonly WorldEvent[] | undefined;
  let watchInput: readonly WorldEvent[] | undefined;
  let completedInput: readonly WorldEvent[] | undefined;
  const map: WorldEvent[][] = [];
  const replay: unknown[] = [];
  const actorSteps: unknown[] = [];
  const effects: [string, boolean][] = [];
  const watch: WorldEvent[][] = [];
  const completed: WorldEvent[][] = [];
  const draws: number[] = [];
  probe.active = {
    witness(event, world) {
      order.push('witness:' + event.id);
      witness.push({ event: structuredClone(event), actors: options.witnessActors?.map(id => {
        const actor = world.cultivators.find(row => row.id === id);
        return [id, actor?.locationId, actor?.alive];
      }) });
    },
    archive(events) { order.push('archive'); archiveInputs.push(events); archive.push(structuredClone([...events])); },
    map(events) { order.push('map'); mapInput = events; map.push(structuredClone([...events])); },
    replay(args) { order.push('replay:' + String(args[0])); replay.push(structuredClone(args)); },
  };
  const mode = options.mode ?? 'utility';
  const rng = options.injected;
  let world: WorldState;
  try {
    world = advanceWorldTick(input, options.orders, rng === undefined ? undefined : () => {
      draws.push(rng);
      return rng;
    }, mode, (id, applied) => {
      order.push('effect:' + id); effects.push([id, applied]);
    }, {
      tape: createDecisionReplayTape(input, mode), modelActors: options.modelActors,
      capturePresentation: options.capturePresentation, captureTrace: options.captureTrace,
      onActor: (id, candidates, applied) => {
        order.push('actor:' + id); actorSteps.push([id, structuredClone(candidates), applied]);
      },
      ...(options.includeWatchHook ? { onWatchBatch: (events: readonly WorldEvent[]) => {
        order.push('watch'); watchInput = events; watch.push(structuredClone([...events]));
      } } : {}),
      onCompletedEvents: events => { order.push('completed'); completedInput = events; completed.push(structuredClone([...events])); },
    });
  } finally {
    probe.active = undefined;
  }
  expect(encodeEraWorldSave(input)).toBe(rawInput);
  expect(completed).toHaveLength(1);
  const raw = archive.reduce((largest, batch) => batch.length > largest.length ? batch : largest, []);
  const rawInputReference = archiveInputs[archive.indexOf(raw)];
  const completedRows = completed[0];
  expect(completedInput).not.toBe(rawInputReference);
  expect(raw.length).toBeGreaterThan(0);
  expect(order.indexOf('archive')).toBeLessThan(order.indexOf('completed'));
  if (options.capturePresentation !== false) {
    expect(map).toHaveLength(1);
    expect(order.indexOf('completed')).toBeLessThan(order.indexOf('map'));
    expect(mapInput).toBe(rawInputReference);
    expect(map[0]).toEqual(raw);
  } else {
    expect(map).toHaveLength(0);
    expect(world.mapPresentation).toEqual({ tick: world.tick, trails: [], effects: [] });
  }
  if (options.includeWatchHook) {
    expect(watchInput).toBe(rawInputReference);
    expect(watch).toEqual([raw]);
    expect(order.indexOf('watch')).toBeLessThan(order.indexOf('completed'));
  }
  const rawIds = new Set(ids(raw));
  const supplemental = completedRows.filter(row => !rawIds.has(row.id));
  const data = { order, witness, archive, map, replay, actorSteps, effects, watch, completed, draws,
    live: world.events, savedArchive: world.chronicleArchive, presentation: world.mapPresentation,
    trace: world.decisionTrace, watches: world.watchlists, council: world.councils };
  const streams = Object.fromEntries(await Promise.all(Object.entries(data).map(async ([key, value]) => [key, await hash(value)] as const)));
  return { world, effects, raw, supplemental, completed: completedRows, actorSteps, order, witness, signature: {
    input: await signature(rawInput), output: await signature(encodeEraWorldSave(world)),
    randomBefore: input.random, randomAfter: world.random, streams,
    calendar: [world.tick, world.year, world.month], rawCount: raw.length,
    completedCount: completedRows.length, liveCount: world.events.length, supplemental: ids(supplemental),
  } };
}

describe('ordered native month: exact pre-extraction authority and event outputs', () => {
  it('witnesses the same-name observer present when the act settles, never their same-month late arrival', async () => {
    const base = createInitialWorld(764);
    const [speaker, target, present, late] = base.cultivators;
    for (const actor of [speaker, target, present, late]) {
      actor.locationId = 'loc-market'; actor.hp = actor.maxHp; actor.age = 28; actor.lifespan = 120;
    }
    present.name = late.name = '闻静';
    late.locationId = 'loc-taixu';
    const result = await observe(encodeEraWorldSave(base), { witnessActors: [present.id, late.id], orders: {
      ...quiet(base),
      [speaker.id]: { chosenAction: 'SOCIALIZE', targetCultivatorId: target.id, innerMonologue: '实际在场。' },
      [late.id]: { chosenAction: 'EXPLORE', targetLocationId: 'loc-market', innerMonologue: '照实跨站。' },
    } });
    const source = `evt-${result.world.tick}-${speaker.id}-social`;
    expect(result.order.indexOf('witness:' + source)).toBeLessThan(result.order.indexOf('actor:' + late.id));
    expect(result.world.cultivators.find(row => row.id === late.id)?.locationId).toBe('loc-market');
    const scenes = (id: string) => projectWitnessedPersonalStory(result.world, id)?.scenes.map(row => row.eventId);
    expect(scenes(present.id)).toContain(source);
    expect(scenes(late.id)).not.toContain(source);
    expect(result.signature).toMatchSnapshot();
  });

  it('processes native brush damage before furnace allocation or the actor’s repeated brew', async () => {
    const { world, hazard } = beforeNativeFurnaceDamage();
    expect(world.tick).toBe(17);
    expect(apprenticeId).toBe('npc-6');
    const result = await observe(encodeEraWorldSave(world), { injected: .95, orders: { ...quiet(world), [apprenticeId]: brew } });
    const injury = `evt-18-${hazard.id}`, closure = 'evt-furnace-safety-1-closed-18';
    expect(result.order).toContain('witness:' + injury);
    expect(result.order.indexOf('witness:' + injury)).toBeLessThan(result.order.indexOf('actor:' + apprenticeId));
    expect(result.raw.find(row => row.id === injury)?.damage).toContainEqual(expect.objectContaining({ cultivatorId: apprenticeId, amount: 36 }));
    expect(result.raw).toContainEqual(expect.objectContaining({ id: closure, locationId: furnaceId }));
    expect(result.world.furnaceReservations.uses.some(row => row.tick === 18 && row.actorId === apprenticeId)).toBe(false);
    expect(result.world.furnaceSafety.cases[0]).toMatchObject({ integrityBefore: 100, integrity: 70, damagedTick: 18 });
    expect(result.signature).toMatchSnapshot();
  });

  it('keeps an uncapped busy native month separate from the capped live feed and annual council supplements', async () => {
    let base = createInitialWorld(50421);
    while (base.tick < 12) base = advanceWorldTick(base, quiet(base));
    expect(base.month).toBe(12);
    const [target, exemplar] = base.cultivators;
    const locationId = 'loc-market';
    target.locationId = locationId;
    target.qiProgress = 0;
    const residents = Array.from({ length: 126 }, (_, index) => ({
      ...structuredClone(exemplar), id: `busy-native-${index}`, name: `坊中修士${index}`, locationId,
      qiProgress: 0, age: 28, lifespan: 120, memories: [],
    }));
    base.cultivators.push(...residents);
    const added = applyWatchMutation(base, target.id, { kind: 'add_watch', target: { kind: 'site', id: locationId } });
    if (!added.ok) throw Error(added.code);
    const rawInput = encodeEraWorldSave(added.world);
    const orders = { ...quiet(added.world), ...Object.fromEntries(residents.map(({ id }) => [id, {
      chosenAction: 'SOCIALIZE', targetCultivatorId: target.id, innerMonologue: '一同在坊中论道。'
    } satisfies LLMDecisionPayload])) };
    const offline = await observe(rawInput, { orders, includeWatchHook: true, captureTrace: false });
    const deferred = await observe(rawInput, { orders, mode: 'deferred', capturePresentation: false });
    const nativeSocial = residents.map(({id}) => `evt-${offline.world.tick}-${id}-social`);
    expect(offline.world.events.length).toBe(120);
    expect(offline.raw.length).toBeGreaterThan(120);
    expect(offline.raw.filter(row => nativeSocial.includes(row.id)).map(({id}) => id)).toEqual(nativeSocial);
    expect(offline.completed.length).toBeGreaterThan(120);
    expect(offline.world.events.some(row => row.id === nativeSocial.at(-1))).toBe(false);
    expect(offline.world.councils.some(row => row.tick === 13)).toBe(true);
    expect(offline.supplemental.length).toBeGreaterThan(0);
    expect(deferred.world.councils.some(row => row.tick === 13)).toBe(false);
    expect(deferred.supplemental.some(row => row.id.includes('council'))).toBe(false);
    expect(offline.actorSteps.length).toBeGreaterThan(120);
    expect({ offline: offline.signature, deferred: deferred.signature }).toMatchSnapshot();
  });

  it('retains accepted strict provider choice and actual deferred native receipt, alongside Utility', async () => {
    const { world } = enterNativeDungeon();
    const rawInput = encodeEraWorldSave(world);
    const prepared = decodeEraWorldSave(rawInput);
    const actor = dungeonActor(prepared);
    const reply = { chosenAction: 'EXPEDITION_DUNGEON', targetOccasionId: dungeonOccasion, targetDungeonRoomId: 'garden', dungeonMove: 'gather' };
    const transport = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] })));
    vi.stubGlobal('fetch', transport);
    llmScheduler.resetTickBudget();
    const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'fixture' };
    const onStart = vi.fn();
    const decision = await requestCultivatorLLMDecision(actor, prepared, config, prepared.tick + 1, { onStart });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(decision).toMatchObject(reply);
    if (!decision) throw Error('Expected native validated dungeon move');
    const deferred = await observe(rawInput, { mode: 'deferred', modelActors: new Set([actor.id]), orders: { ...quiet(prepared), [actor.id]: decision } });
    const { [actor.id]: _, ...utilityOrders } = quiet(prepared);
    const utility = await observe(rawInput, { orders: utilityOrders });
    expect(deferred.effects).toContainEqual([actor.id, true]);
    const result = dungeonOccasionIn(deferred.world).dungeon?.steps.at(-1);
    expect(result).toMatchObject({ move: 'gather', tick: deferred.world.tick, jadeLeaf: 1 });
    expect(result).toEqual(dungeonOccasionIn(utility.world).dungeon?.steps.at(-1));
    expect(deferred.completed).toContainEqual(expect.objectContaining({ id: result?.eventId, witnessScope: 'participants' }));
    expect(deferred.world.chronicleArchive.anchors.some(row => row.id === result?.eventId)).toBe(false);
    expect(deferred.world.decisionTrace.records).toContainEqual(expect.objectContaining({ actorId: actor.id,
      tick: deferred.world.tick, source: 'model', chosenAction: 'redacted', applied: true }));
    expect({ decision, deferred: deferred.signature, utility: utility.signature }).toMatchSnapshot();
  });
});
