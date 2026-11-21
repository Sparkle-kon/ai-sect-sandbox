import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { availableCourierActions, COURIER_SERVICE_FEE, courierCheckpoint, visibleCouriers } from '../src/engine/sealedCourierEngine';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick, applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const config = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '暂留各人的实际所在点' };
const order = <T extends Pick<LLMDecisionPayload, 'courierMove'>>(args: T): LLMDecisionPayload =>
  ({ ...args, chosenAction: 'SEALED_COURIER', innerMonologue: '按现实封存地址和身份交付' });
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(709);
  world.tick = 18; world.month = 6;
  const [sender, localCandidate, recipient, outsider] = world.cultivators;
  const origin = world.locations.find(({ id }) => id === world.sects.find(({ id }) => id === sender.sectId)?.headquartersId)!;
  const destination = world.locations.find(({ id }) => id === world.sects.find(({ id }) => id === recipient.sectId)?.headquartersId)!;
  sender.locationId = localCandidate.locationId = origin.id;
  recipient.locationId = destination.id;
  sender.spiritStones = 100;
  const opening = availableCourierActions(sender, world).find(({ courierMove, targetCultivatorId, dispatchCue }) =>
    courierMove === 'send' && targetCultivatorId === recipient.id && dispatchCue === 'request_audience')!;
  expect(opening).toBeDefined();
  const porter = world.cultivators.find(({ id }) => id === opening.targetCourierId)!;
  porter.spiritStones = 40;
  const apply = (person: typeof sender, decision: LLMDecisionPayload) => applyCultivatorBrainDecision(world, person, decision, () => .99);
  return { world, sender, porter, recipient, outsider, opening, origin, destination, apply };
}
function step(state: WorldState, courierId?: string) {
  const forced: Record<string, LLMDecisionPayload> = Object.fromEntries(state.cultivators.map(({ id }) => [id, rest]));
  if (courierId) forced[courierId] = { ...rest, chosenAction: 'EXPLORE', targetLocationId: 'loc-market' };
  return advanceWorldTick(state, forced, () => .99);
}

describe('physical sealed courier in both brain paths and visible map', () => {
  it('pays one real fee on consent, waits for physical arrival, and delivers only to the named recipient', async () => {
    const { world, sender, porter, recipient, outsider, opening, destination, apply } = fixture();
    const reply = (value: LLMDecisionPayload) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
    const fetchMock = vi.fn(async () => reply(order({ ...opening, targetCultivatorId: 'imaginary-recipient' })));
    vi.stubGlobal('fetch', fetchMock);
    const source = vi.fn();
    await queryCultivatorLLMDecision(sender, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    fetchMock.mockImplementation(async () => reply(order(opening)));
    const sent = await queryCultivatorLLMDecision(sender, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(apply(sender, sent)).toMatchObject({ actorIds: [], witnessScope: 'participants' });
    expect(sender.spiritStones).toBe(100);
    expect(porter.spiritStones).toBe(40);
    expect(visibleCouriers(world, recipient)).toEqual([]);
    const accepts = computeHeuristicDecision(porter, world, () => .99);
    expect(accepts).toMatchObject({ chosenAction: 'SEALED_COURIER', courierMove: 'accept' });
    expect(apply(porter, accepts)).not.toBeNull();
    expect(apply(porter, accepts)).toBeNull();
    expect(sender.spiritStones).toBe(100 - COURIER_SERVICE_FEE);
    expect(porter.spiritStones).toBe(40 + COURIER_SERVICE_FEE);
    expect(visibleCouriers(world, porter)[0]?.payload).toBeUndefined();

    let next = step(world, porter.id);
    const activePorter = next.cultivators.find(({ id }) => id === porter.id)!;
    const checkpoint = courierCheckpoint(next, activePorter)!;
    expect(checkpoint).toBeDefined();
    expect(visibleCouriers(next, recipient)).toEqual([]);
    const observed = createTerrainMapView(next, activePorter, true);
    expect(observed.trailPositions.get(porter.id)).toEqual(checkpoint);
    expect(mapActorPositions(observed.seenLocations, observed.liveActors, observed.trailPositions)
      .some(({ actor, x, y }) => actor.id === porter.id && x === checkpoint.x && y === checkpoint.y)).toBe(true);
    next = decodeWorldSave(encodeWorldSave(next));
    for (let left = 20; left > 0 && next.couriers.dispatches[0].status === 'in_transit'; left--) next = step(next, porter.id);
    expect(next.couriers.dispatches[0]).toMatchObject({ status: 'delivered', feePaid: COURIER_SERVICE_FEE, deliveredTick: next.tick, path: [] });
    expect(next.cultivators.find(({ id }) => id === porter.id)?.locationId).toBe(destination.id);
    expect(next.mapPresentation.trails.some(({ cultivatorId }) => cultivatorId === porter.id)).toBe(false);
    expect(visibleCouriers(next, recipient)).toEqual([expect.objectContaining({ role: 'recipient',
      payload: { kind: 'private_cue', cue: 'request_audience' } })]);
    expect(visibleCouriers(next, outsider)).toEqual([]);
    const publicShell = next.events.filter(({ id }) => id.startsWith('evt-sealed-dispatch'));
    expect(publicShell.length).toBeGreaterThan(0);
    expect(publicShell.every(({ actorIds, locationId, description }) => actorIds.length === 0 && !locationId && !description.includes('request_audience'))).toBe(true);
    expect(decodeWorldSave(encodeWorldSave(next)).couriers).toEqual(next.couriers);
  });

  it('reconciles a real death at the physical midpoint without revealing any enclosed message or charging twice', () => {
    const { world, sender, porter, recipient, opening, origin, apply } = fixture();
    expect(apply(sender, order(opening))).not.toBeNull();
    expect(apply(porter, computeHeuristicDecision(porter, world, () => .99))).not.toBeNull();
    const enRoute = step(world, porter.id);
    const subject = enRoute.cultivators.find(({ id }) => id === porter.id)!;
    const point = courierCheckpoint(enRoute, subject)!;
    subject.hp = 1;
    const atOldDesk = applyMapBrush(enRoute, 'meteor', [origin]);
    expect(atOldDesk.cultivators.find(({ id }) => id === porter.id)?.alive).toBe(true);
    const atActualPoint = applyMapBrush(enRoute, 'meteor', [point]);
    expect(atActualPoint.cultivators.find(({ id }) => id === porter.id)?.alive).toBe(false);
    expect(atActualPoint.couriers.dispatches[0]).toMatchObject({ status: 'lost', reason: 'courier_death', path: [],
      feePaid: COURIER_SERVICE_FEE, settledTick: enRoute.tick });
    expect(visibleCouriers(atActualPoint, recipient)).toEqual([]);
    expect(decodeWorldSave(encodeWorldSave(atActualPoint)).couriers).toEqual(atActualPoint.couriers);
    const forged = structuredClone(atActualPoint);
    forged.couriers.dispatches[0].feePaid = 0;
    expect(() => encodeWorldSave(forged)).toThrow(/couriers.dispatches.references/);
  });
});
