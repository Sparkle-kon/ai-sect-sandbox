import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableAlchemy } from '../src/engine/alchemyEngine';
import { publicChronicleSceneEvents } from '../src/engine/chronicleLead';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { projectReliefHomecoming } from '../src/engine/reliefHomecoming';
import { availableSettlementActions } from '../src/engine/settlementEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { villageEvolutionLocalSettlement } from '../src/engine/villageEvolutionEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

afterEach(() => { vi.unstubAllGlobals(); llmScheduler.resetTickBudget(); });

const siteId = 'loc-market';
const eastId = 'loc-market-east';
const villageId = 'village-loc-market';
const keeper = 'recruit-village-loc-market-vol-1';
const traveler = 'recruit-village-loc-market-vol-2';
const firstSponsor = 'npc-1';
const secondSponsor = 'npc-5';
const lateWitness = 'npc-6';
const remote = 'npc-8';
const hazardId = 'hazard-1-tile-12-12';
const disasterId = 'settlement-7-disaster-village-loc-market-hazard-1-tile-12-12';
const reliefId = 'settlement-8-relief-village-loc-market-recruit-village-loc-market-vol-1';
const decision = (chosenAction: LLMDecisionPayload['chosenAction'],
  fields: Partial<LLMDecisionPayload> = {}): LLMDecisionPayload =>
  ({ chosenAction, innerMonologue: '只用坊籍、亲见和实际支付来记这一夜。', ...fields });
const rest = decision('REST');
const turn = (world: WorldState, orders: Readonly<Record<string, LLMDecisionPayload>> = {}) =>
  advanceWorldTick(world, Object.fromEntries(world.cultivators.map(({ id }) => [id, orders[id] ?? rest])),
    () => .99, 'utility');
const person = (world: WorldState, id: string) => world.cultivators.find(row => row.id === id)!;
const village = (world: WorldState) => world.settlements.villages.find(row => row.id === villageId)!;
const household = (world: WorldState, id: string) => world.households.members.find(row => row.recruitedId === id)!;
const explore = (targetLocationId: string) => decision('EXPLORE', { targetLocationId });
const enlist = (n: 1 | 2) => decision('RECRUIT_SETTLER', {
  targetSettlementId: villageId, targetVolunteerId: `${villageId}-vol-${n}`,
});
const reopen = (world: WorldState) => {
  const encoded = encodeEraWorldSave(world);
  const result = decodeEraWorldSave(encoded);
  expect(encodeEraWorldSave(result)).toBe(encoded);
  return result;
};

function beforeRelief() {
  let world = createInitialWorld(4, 'classic');
  world = turn(world, { [firstSponsor]: explore(siteId), [secondSponsor]: explore(siteId), [lateWitness]: explore(eastId) });
  world = turn(world);
  world = turn(world, { [firstSponsor]: enlist(1) });
  expect(person(world, keeper)).toMatchObject({ name: '陈清禾', locationId: siteId, spiritStones: 25 });
  expect(availableAlchemy(person(world, keeper), world, world.tick + 1)).toContainEqual({
    action: 'GATHER_HERBS', targetHerbId: 'jade_leaf',
  });
  world = turn(world, { [keeper]: decision('GATHER_HERBS', { targetHerbId: 'jade_leaf' }), [secondSponsor]: enlist(2) });
  expect(world.tick).toBe(5);
  expect(person(world, keeper).herbs.jade_leaf).toBe(2);
  expect(person(world, traveler)).toMatchObject({ name: '乔闻竹', locationId: siteId, spiritStones: 25 });
  expect(household(world, keeper)).toMatchObject({
    householdId: 'household-village-loc-market-first', settlementId: villageId, registeredTick: 1, settledTick: 4,
  });
  expect(household(world, traveler)).toMatchObject({
    householdId: 'household-village-loc-market-second', settlementId: villageId, registeredTick: 1, settledTick: 5,
  });
  world = turn(world, { [traveler]: explore(eastId) });
  expect(person(world, traveler).locationId).toBe(eastId);
  expect(person(world, keeper).locationId).toBe(siteId);
  const market = world.locations.find(row => row.id === siteId)!;
  world = applyMapBrush(world, 'beast_tide', [market]);
  world = turn(world);
  expect(world.tick).toBe(7);
  expect(world.mapHazards.find(row => row.id === hazardId)).toMatchObject({
    kind: 'beast_tide', intensity: 1, createdTick: 6, expiresTick: 10,
  });
  expect(world.settlements.records.find(row => row.id === disasterId)).toMatchObject({
    kind: 'disaster', people: 1, settlementId: villageId, tick: 7,
  });
  expect(village(world)).toMatchObject({ population: 65, stress: 23, lastDisasterTick: 7 });
  expect(availableSettlementActions(person(world, keeper), world)).toContainEqual({
    action: 'DELIVER_RELIEF', targetSettlementId: villageId,
  });
  return reopen(world);
}
function paidRelief() {
  const prior = beforeRelief();
  const world = reopen(turn(prior, { [keeper]: decision('DELIVER_RELIEF', { targetSettlementId: villageId }) }));
  expect(world.tick).toBe(8);
  expect(world.settlements.records.find(row => row.id === reliefId)).toMatchObject({
    kind: 'relief', actorId: keeper, settlementId: villageId, tick: 8, people: 0, stones: 12, herbs: 2,
  });
  expect(world.civicMemorials.deeds.find(row => row.reliefRecordId === reliefId)).toMatchObject({
    subjectId: keeper, tick: 8, enrolledTick: 4, stones: 12, herbs: 2, siteId, settlementId: villageId,
    witnessIds: [firstSponsor, secondSponsor],
  });
  expect(person(prior, keeper).spiritStones - person(world, keeper).spiritStones).toBe(12);
  expect(person(prior, keeper).herbs.jade_leaf - person(world, keeper).herbs.jade_leaf).toBe(2);
  expect(village(world)).toMatchObject({ population: 65, stress: 0, lastReliefTick: 8 });
  expect(villageEvolutionLocalSettlement(world, person(world, keeper))?.id).toBe(villageId);
  expect([traveler, lateWitness, remote].map(id => person(world, id).locationId)).toEqual([eastId, eastId, 'loc-tianji']);
  expect(publicChronicleSceneEvents(world).map(row => row.id)).toContain(`evt-${reliefId}`);
  return world;
}

const sceneAt = (world: WorldState) => world.reliefHomecomings?.scenes.find(row => row.reliefRecordId === reliefId);
const view = (world: WorldState, id: string) => projectReliefHomecoming(world, person(world, id));
const kinds = (world: WorldState, id: string) => view(world, id)?.beats.map(beat => [beat.kind, beat.tick]) ?? [];
async function provider(world: WorldState, actorId: string, reply: Partial<LLMDecisionPayload>) {
  llmScheduler.resetTickBudget();
  const logged: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as { messages: { content: string }[] };
    logged.push(...body.messages.map(message => message.content));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
  }));
  const accepted = await requestCultivatorLLMDecision(person(world, actorId), world,
    { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' }, world.tick + 1);
  expect(logged.length).toBeGreaterThan(0);
  const raw = logged.join('\n').match(/【只限你在旧村亲见的片刻】(.*?)。只当见闻/s)?.[1];
  const witnessed = raw === undefined ? undefined : JSON.parse(raw) as string[];
  return { accepted, witnessed };
}

describe('a quiet night seen after real village relief (P22-6)', () => {
  it('starts with an ordinary original household member delivering actual resources after a real disaster', () => {
    const paid = paidRelief();
    expect(sceneAt(paid)).toMatchObject({ disasterRecordId: disasterId, hazardId, hazardExpiresTick: 10,
      reliefRecordId: reliefId, reliefTick: 8, departureTick: 6, travelerId: traveler,
      helperId: keeper, villageId, siteId, deedId: 'civic-deed-1',
      aidWitnessIds: expect.arrayContaining([firstSponsor, secondSponsor]),
    });
    expect(sceneAt(paid)?.aidWitnessIds).not.toContain(lateWitness);
    expect(sceneAt(paid)?.aidWitnessIds).not.toContain(traveler);
    expect(sceneAt(paid)?.aidWitnessIds).not.toContain(remote);
    expect(sceneAt(paid)?.return).toBeUndefined();
    expect(view(paid, keeper)).toBeUndefined(); // The active beast tide is not a quiet night.
    expect(view(paid, lateWitness)).toBeUndefined();
  });

  it('branches at an actual return versus continued absence, not a remote rumor or replenished resident count', () => {
    const paid = paidRelief();
    const late = reopen(turn(paid, { [lateWitness]: explore(siteId) }));
    expect(person(late, lateWitness).locationId).toBe(siteId);
    expect(person(late, traveler).locationId).toBe(eastId);
    expect(view(late, lateWitness)).toBeUndefined();
    expect(sceneAt(late)?.return).toBeUndefined();
    const returned = reopen(turn(late, { [traveler]: explore(siteId) }));
    const stillAway = reopen(turn(late));
    expect(returned.tick).toBe(10);
    expect([person(returned, traveler).locationId, person(stillAway, traveler).locationId]).toEqual([siteId, eastId]);
    expect(person(returned, keeper).locationId).toBe(siteId);
    expect(returned.mapHazards.find(row => row.id === hazardId)).toBeUndefined();
    expect(village(returned).population).toBe(village(stillAway).population);
    expect(returned.events.some(row => row.tick === 10 && row.id.includes('-relief-'))).toBe(false);
    expect(sceneAt(returned)?.return).toMatchObject({
      tick: 10, witnessIds: expect.arrayContaining([keeper, lateWitness, firstSponsor, secondSponsor]),
    });
    expect(sceneAt(returned)?.return?.witnessIds).not.toContain(remote);
    expect(sceneAt(stillAway)?.return).toBeUndefined();
    expect(kinds(returned, keeper)).toEqual([['relief', 8], ['return', 10]]);
    expect(kinds(returned, firstSponsor)).toEqual([['relief', 8], ['return', 10]]);
    expect(kinds(returned, lateWitness)).toEqual([['return', 10]]);
    expect(view(returned, remote)).toBeUndefined();
    expect(kinds(stillAway, keeper)).toEqual([['relief', 8]]);
    expect(view(stillAway, lateWitness)).toBeUndefined();
    expect(view(stillAway, remote)).toBeUndefined();
    expect(publicChronicleSceneEvents(returned).some(row => row.tick === 10 &&
      row.actorIds.includes(traveler) && row.title.includes('归'))).toBe(false);
  });

  it('neither turns an available relief action into a paid act nor an unlinked visit into the quiet relief chapter', () => {
    const prior = beforeRelief();
    const unpaid = reopen(turn(prior));
    expect(unpaid.settlements.records.some(row => row.id === reliefId)).toBe(false);
    expect(person(unpaid, keeper).spiritStones).toBe(25);
    expect(person(unpaid, keeper).herbs.jade_leaf).toBe(2);
    const visitor = turn(unpaid, { [lateWitness]: explore(siteId) });
    const arrived = reopen(turn(visitor, { [traveler]: explore(siteId) }));
    expect(person(arrived, traveler).locationId).toBe(siteId);
    expect(arrived.reliefHomecomings?.scenes ?? []).toEqual([]);
    expect(view(arrived, keeper)).toBeUndefined();
    expect(view(arrived, lateWitness)).toBeUndefined();
  });

  it('shares native model-tagged return but supplies only each person’s own facts to the actual provider', async () => {
    const late = turn(paidRelief(), { [lateWitness]: explore(siteId) });
    const request = await provider(late, traveler, explore(siteId));
    expect(request.witnessed).toBeUndefined(); // Before arriving, the traveler saw no aftermath.
    expect(request.accepted).toMatchObject({ chosenAction: 'EXPLORE', targetLocationId: siteId });
    const modelWorld = reopen(advanceWorldTick(late, Object.fromEntries(late.cultivators.map(({ id }) =>
      [id, id === traveler ? request.accepted! : rest])), () => .99, 'deferred', undefined, { modelActors: new Set([traveler]) }));
    const utility = turn(late, { [traveler]: explore(siteId) });
    expect(person(modelWorld, traveler).locationId).toBe(siteId);
    expect(sceneAt(modelWorld)).toEqual(sceneAt(utility));
    const restOnly = { chosenAction: 'REST' } as const;
    const oldPrompt = await provider(modelWorld, keeper, restOnly);
    const latePrompt = await provider(modelWorld, lateWitness, restOnly);
    const remotePrompt = await provider(modelWorld, remote, restOnly);
    expect(oldPrompt.witnessed).toEqual(view(modelWorld, keeper)?.beats.map(beat => beat.line));
    expect(oldPrompt.witnessed).toHaveLength(2);
    expect(latePrompt.witnessed).toEqual(view(modelWorld, lateWitness)?.beats.map(beat => beat.line));
    expect(latePrompt.witnessed).toHaveLength(1);
    expect(latePrompt.witnessed?.[0]).not.toMatch(/十二枚|两份翡翠/);
    expect(remotePrompt.witnessed).toBeUndefined();
  });

});
