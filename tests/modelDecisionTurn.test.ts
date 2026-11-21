import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createFairModelTurnState, commitFairModelTurn } from '../src/engine/fairModelTurnEngine';
import { modelDecisionCandidates, runModelDecisionTurn } from '../src/engine/modelDecisionTurn';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { Cultivator, LLMDecisionPayload, WorldState } from '../src/types/world';

const valid: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '练功后休息。' };
const livingIds = (world: WorldState) => world.cultivators.filter(({ alive, hp }) => alive && hp > 0).map(({ id }) => id);

function deferred<T>() {
  let resolve!: (result: T) => void;
  return { promise: new Promise<T>((done) => { resolve = done; }), resolve };
}

afterEach(() => vi.useRealTimers());

describe('fair model batch and exact canonical Utility routing', () => {
  it('prompts only the planned slots in a 526-person world, retaining every actor and unchanged Utility when no returned order is validated', async () => {
    const world = createInitialWorld(6031);
    const source = world.cultivators[0];
    world.cultivators.push(...Array.from({ length: 526 - world.cultivators.length }, (_, i) => ({
      ...structuredClone(source), id: `large-fair-${i + 1}`, name: `长局修士${i + 1}`, sectId: '',
      sectRank: '外门弟子' as const, locationId: 'loc-vein-north', age: 24, lifespan: 150,
    })));
    const eligible = modelDecisionCandidates(world);
    expect(eligible).toHaveLength(526);
    const request = vi.fn(async (_actor: Cultivator, _signal: AbortSignal, started: () => void) => { started(); return undefined; });
    const initial = createFairModelTurnState();
    const batch = await runModelDecisionTurn({
      state: initial, eligible, admission: { slots: 2, reason: 'budget' }, signal: new AbortController().signal, request,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(batch).toMatchObject({ stale: false, limit: 'budget', startedActorIds: batch.plannedActorIds });
    expect(batch.orders.size).toBe(0);
    const actual = advanceWorldTick(world, Object.fromEntries(batch.orders), undefined, 'deferred');
    const baseline = advanceWorldTick(world, undefined, undefined, 'deferred');
    expect(actual).toEqual(baseline);
    expect(actual.cultivators).toHaveLength(526);
    const state = commitFairModelTurn(initial, { ...batch, livingActorIds: livingIds(actual) });
    const nextBatch = await runModelDecisionTurn({ state, eligible: modelDecisionCandidates(actual),
      signal: new AbortController().signal, admission: { slots: 2, reason: 'budget' }, request });
    expect(nextBatch.startedActorIds).toHaveLength(2);
    expect(nextBatch.startedActorIds.some((id) => batch.startedActorIds.includes(id))).toBe(false);
  }, 20_000);

  it('keeps only in-window started proposals, falls back on timeout, and never writes a late result', async () => {
    vi.useFakeTimers();
    const world = createInitialWorld();
    const late = deferred<LLMDecisionPayload>();
    let selected = 0;
    const batch = runModelDecisionTurn({
      state: createFairModelTurnState(), eligible: modelDecisionCandidates(world), signal: new AbortController().signal,
      admission: { slots: 3, reason: 'queue' }, deadlineMs: 15,
      request: async (_actor, signal, started) => {
        selected++;
        if (selected === 1) { started(); return valid; }
        if (selected === 2) { started(); return late.promise; }
        signal.addEventListener('abort', started, { once: true }); // A queued callback cannot claim a now-cancelled start.
        return late.promise;
      },
    });
    await vi.advanceTimersByTimeAsync(16);
    const accepted = await batch;
    expect(accepted.stale).toBe(false);
    expect(accepted.limit).toBe('deadline');
    expect(accepted.orders.size).toBe(1);
    expect(accepted.startedActorIds).toEqual(accepted.plannedActorIds.slice(0, 2));
    late.resolve(valid);
    await Promise.resolve();
    expect(accepted.orders.size).toBe(1);
    expect(accepted.startedActorIds).toHaveLength(2);
  });

  it('invalidates a whole changed branch/config instead of applying even a previously valid proposal', async () => {
    const signal = new AbortController();
    const world = createInitialWorld();
    const late = deferred<LLMDecisionPayload>();
    let selected = 0;
    const result = runModelDecisionTurn({
      state: createFairModelTurnState(), eligible: modelDecisionCandidates(world), signal: signal.signal, admission: { slots: 2 },
      request: async (_actor, _signal, started) => {
        started();
        return ++selected === 1 ? valid : late.promise;
      },
    });
    await Promise.resolve();
    signal.abort();
    const turn = await result;
    expect(turn.stale).toBe(true);
    expect(turn.startedActorIds).toHaveLength(2);
    expect(turn.orders.size).toBe(0);
    late.resolve(valid);
    await Promise.resolve();
    expect(turn.orders.size).toBe(0);
  });

  it('avoids prompts on full cooldown and skips actors known to be unavailable to the decision path', async () => {
    const world = createInitialWorld();
    const [gone, old, ordered] = world.cultivators;
    world.month = 12;
    gone.alive = false;
    gone.hp = 0;
    old.age = old.lifespan - 1;
    world.playerAvatar.possessedId = ordered.id;
    world.playerAvatar.possessionUntilTick = world.tick + 3;
    world.playerAvatar.pendingOrder = { actorId: ordered.id, action: 'REST', queuedTick: world.tick };
    const seen = modelDecisionCandidates(world);
    expect(seen.map(({ id }) => id)).not.toContain(gone.id);
    expect(seen.map(({ id }) => id)).not.toContain(old.id);
    expect(seen.map(({ id }) => id)).not.toContain(ordered.id);
    const request = vi.fn(async () => valid);
    const result = await runModelDecisionTurn({
      state: createFairModelTurnState(), eligible: seen, signal: new AbortController().signal,
      admission: { slots: 0, reason: 'backoff' }, request,
    });
    expect(result).toMatchObject({ limit: 'backoff', startedActorIds: [], plannedActorIds: [], stale: false });
    expect(request).not.toHaveBeenCalled();
  });
});
