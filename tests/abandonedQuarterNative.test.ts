import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { abandonedQuarterCommand } from '../src/engine/abandonedQuarterCognition';
import { writeChronicleScene } from '../src/engine/chronicleScene';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { availableAbandonedQuarterActions, projectAbandonedQuarter } from '../src/engine/abandonedQuarter';
import { publicChronicleSceneEvents } from '../src/engine/chronicleLead';
import { createHouseholdState, householdCensus, initializeHouseholds } from '../src/engine/householdEngine';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { availableSettlementActions } from '../src/engine/settlementEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';
import { A, B, FROM, TO, nativeCorridorFixture, person, place, plot, town, turn, wait } from './fixtures/villageEvolutionNativeFixture';

const oldSiteId = 'loc-market';
const easternSiteId = 'loc-market-east';
const formerId = 'recruit-village-loc-market-vol-1';
const recruitId = 'settlement-6-recruitment-village-loc-market-village-loc-market-vol-1';
const migrateId = 'settlement-18-migration-village-loc-market-village-loc-market-east';
const native = (chosenAction: LLMDecisionPayload['chosenAction'],
  fields: Partial<LLMDecisionPayload> = {}): LLMDecisionPayload =>
  ({ chosenAction, innerMonologue: '以乡籍和实地所见为据。', ...fields });
const explore = (targetLocationId: string) => native('EXPLORE', { targetLocationId });
const reopen = (world: WorldState) => {
  const encoded = encodeEraWorldSave(world);
  const reopened = decodeEraWorldSave(encoded);
  expect(encodeEraWorldSave(reopened)).toBe(encoded);
  return reopened;
};

/** A viable imported small village, not an authored aftermath. Map geometry and census
 * premises mirror the corridor fixture. No actor placement, inventories, or map knowledge
 * are injected. Every harvest, donation, trip, enrolment, well and freight follows the live engine. */
function beforeLastMigration() {
  let world = createInitialWorld(725, 'classic');
  const origin = plot(world, FROM);
  const recipient = plot(world, TO);
  Object.assign(place(world, FROM), { x: 220, y: 220 });
  Object.assign(place(world, TO), { x: 380, y: 220 });
  for (const village of world.settlements.villages) village.stress = 5;
  origin.population = 2;
  origin.volunteers = origin.volunteers.slice(0, 1);
  recipient.population = 88;
  recipient.capacity = 102;
  world.households = createHouseholdState();
  initializeHouseholds(world);
  world = reopen(world);
  const harvest = native('GATHER_HERBS', { targetHerbId: 'earth_root' });
  for (let n = 0; n < 2; n++) world = turn(world, { [A]: harvest, [B]: harvest });
  expect(person(world, A).herbs.earth_root).toBe(4);
  expect(person(world, B).herbs.earth_root).toBe(4);
  world = turn(world, { [A]: explore(easternSiteId), [B]: explore(oldSiteId) });
  expect([person(world, A).locationId, person(world, B).locationId]).toEqual([easternSiteId, oldSiteId]);
  world = turn(world, { [A]: explore(oldSiteId), [B]: explore(easternSiteId) });
  expect([person(world, A).locationId, person(world, B).locationId]).toEqual([oldSiteId, easternSiteId]);
  const quote = availableSettlementActions(person(world, A), world)
    .find(option => option.action === 'RECRUIT_SETTLER' && option.targetVolunteerId === 'village-loc-market-vol-1')!;
  expect(quote).toBeDefined();
  world = turn(world, { [A]: native('RECRUIT_SETTLER', {
    targetVolunteerId: quote.targetVolunteerId, targetSettlementId: quote.targetSettlementId,
  }) });
  expect(world.settlements.records.find(row => row.id === recruitId)).toMatchObject({
    kind: 'recruitment', tick: 6, people: 1, stones: 25, settlementId: FROM, cultivatorId: formerId,
  });
  expect(person(world, formerId).locationId).toBe(oldSiteId);
  expect(householdCensus(world, FROM)).toMatchObject({ population: 1, adults: 1, namedResidents: 0 });

  const donations = {
    [A]: native('VILLAGE_GRANARY', { granaryMove: 'donate_roots', targetSettlementId: FROM }),
    [B]: native('VILLAGE_GRANARY', { granaryMove: 'donate_stones', targetSettlementId: TO }),
  };
  world = turn(world, { ...donations, [formerId]: explore('loc-taixu') });
  expect(person(world, formerId).locationId).toBe('loc-taixu');
  world = turn(world, donations);
  world = turn(world, {
    [A]: native('VILLAGE_SUPPLY', { villageSupplyMove: 'offer', targetSettlementId: TO }),
    [B]: native('VILLAGE_WORKS', { villageWorkKind: 'well', targetSettlementId: TO }),
  });
  world = turn(world, {
    [B]: native('VILLAGE_SUPPLY', { villageSupplyMove: 'accept', targetVillageSupplyId: 'village-supply-1' }),
  });
  // Controlled persistent stress input as in the independent village economy integration test.
  // The engine, not the fixture, performs every survey, departure and stage transition.
  plot(world, FROM).stress = 72;
  world = wait(world, state => state.villageSupply.agreements[0]?.status === 'completed', 10);
  expect(world.tick).toBe(14);
  expect(world.villageSupply.agreements[0]).toMatchObject({ id: 'village-supply-1', status: 'completed',
    acceptedTick: 10, path: ['tile-5-5', 'tile-6-5', 'tile-7-5', 'tile-8-5', 'tile-9-5'],
    legs: [
      expect.objectContaining({ good: 'earth_root', phase: 'delivered', settledTick: 14, checkpoint: 4 }),
      expect.objectContaining({ good: 'stone', phase: 'delivered', settledTick: 14, checkpoint: 4 }),
    ],
  });
  expect(world.villageWorks.projects[0]).toMatchObject({
    id: 'village-work-1', kind: 'well', status: 'completed', settledTick: 11, stonesSpent: 32, rootsSpent: 2,
  });
  while (world.tick < 17) world = turn(world);
  expect(plot(world, FROM).population).toBe(1);
  expect(world.villageEvolution.migrations.some(row => row.id === migrateId)).toBe(false);
  return reopen(world);
}

function genuineRuins() {
  const world = reopen(turn(beforeLastMigration()));
  expect(world.villageEvolution.migrations.find(row => row.id === migrateId)).toMatchObject({
    tick: 18, people: 1, fromSettlementId: FROM, toSettlementId: TO, fromBefore: 1, fromAfter: 0,
    toBefore: 91, toAfter: 92, leftJuveniles: 0, leftNamed: 0, agreementId: 'village-supply-1',
    households: [{ householdId: 'household-village-loc-market-first', adults: 1 }],
  });
  expect(world.settlements.records.find(row => row.id === migrateId)).toMatchObject({
    kind: 'migration', people: 1, settlementId: FROM, targetSettlementId: TO,
  });
  expect(world.villageCensuses.periods.find(row => row.tick === 18)?.movements.find(row => row.id === migrateId))
    .toMatchObject({ kind: 'migration', people: 1, villageId: FROM, targetVillageId: TO });
  expect(town(world, FROM)).toMatchObject({ status: 'ruin', changes: [
    { tick: 18, from: 'village', to: 'ruin', reason: 'depopulated', population: 0, sourceRecordId: migrateId },
  ] });
  expect(householdCensus(world, FROM)).toMatchObject({ population: 0, adults: 0, namedResidents: 0, juveniles: 0 });
  expect(householdCensus(world, TO)?.groups).toContainEqual(expect.objectContaining({
    id: 'household-village-loc-market-first', adults: 1, migratedIn: 1,
  }));
  expect(world.events.find(row => row.id === `evt-${migrateId}`)).toMatchObject({
    tick: 18, locationId: oldSiteId, title: '循已证通路迁居', actorIds: [],
  });
  expect(publicChronicleSceneEvents(world).map(row => row.id)).toContain(`evt-${migrateId}`);
  return world;
}
const options = (world: WorldState, actorId: string) =>
  availableAbandonedQuarterActions(person(world, actorId), world);
type Option = ReturnType<typeof options>[number];
const command = (world: WorldState, actorId: string, move: Option['abandonedQuarterMove']) => {
  const option = options(world, actorId).find(row => row.abandonedQuarterMove === move)!;
  expect(option).toBeDefined();
  return native('ABANDONED_QUARTER', { abandonedQuarterMove: move,
    targetAbandonedQuarterId: option.targetAbandonedQuarterId,
    ...(option.targetLocationId === undefined ? {} : { targetLocationId: option.targetLocationId }),
  });
};
const visit = (world: WorldState, actorId: string) =>
  world.abandonedQuarters?.visits.find(row => row.actorId === actorId);
const assertPrivate = (world: WorldState, actorId: string, suffix: string, locationId: string) => {
  const id = `evt-${visit(world, actorId)?.id}-${suffix}-${world.tick}`;
  expect(world.events.find(row => row.id === id)).toMatchObject({
    actorIds: [actorId], witnessScope: 'participants', locationId,
  });
  expect(publicChronicleSceneEvents(world).map(row => row.id)).not.toContain(id);
};

describe('the actual last civilian adult leaves an empty quarter (P22-4)', () => {
  it('does not turn the existing sponsor or historical households into present visitors', () => {
    const ruined = genuineRuins();
    expect(person(ruined, A).locationId).toBe(oldSiteId);
    expect(person(ruined, formerId).locationId).toBe('loc-taixu');
    for (const actorId of [A, B, formerId]) {
      expect(visit(ruined, actorId)).toBeUndefined();
      expect(options(ruined, actorId)).toEqual([]);
    }
  });

  it('uses independent real entries and identifies only the visitor with an exact prior local enlistment as former', () => {
    const ruined = genuineRuins();
    const returnee = reopen(turn(ruined, { [formerId]: explore(oldSiteId) }));
    const newcomer = reopen(turn(ruined, { [B]: explore(oldSiteId) }));
    expect(person(returnee, formerId).locationId).toBe(oldSiteId);
    expect(person(newcomer, B).locationId).toBe(oldSiteId);
    expect(visit(returnee, formerId)).toMatchObject({
      actorId: formerId, settlementId: FROM, siteId: oldSiteId, fromSiteId: 'loc-taixu',
      enteredTick: 19, migrationId: migrateId, formerRecruitmentId: recruitId,
    });
    expect(visit(newcomer, B)).toMatchObject({
      actorId: B, settlementId: FROM, siteId: oldSiteId, fromSiteId: easternSiteId,
      enteredTick: 19, migrationId: migrateId,
    });
    expect(visit(newcomer, B)?.formerRecruitmentId).toBeUndefined();
    assertPrivate(returnee, formerId, 'entered', oldSiteId);
    assertPrivate(newcomer, B, 'entered', oldSiteId);
    expect(projectAbandonedQuarter(returnee, person(returnee, formerId))?.standing).toBe('former_resident');
    expect(projectAbandonedQuarter(newcomer, person(newcomer, B))?.standing).toBe('visitor');
    for (const choice of [returnee, newcomer]) {
      expect(householdCensus(choice, FROM)?.population).toBe(0);
      expect(options(choice, A)).toEqual([]);
    }
    expect(options(returnee, formerId).map(row => row.abandonedQuarterMove).sort()).toEqual(['inspect', 'leave', 'stay']);
  });

  it('uses the same real option list in Utility and Cognitive JSON without inventing residents or movement',async()=>{
    const ruined=genuineRuins(), arrived=turn(ruined,{[B]:explore(oldSiteId)});
    const newborn=person(arrived,B);
    const optionsNow=options(arrived,B);
    const inspect=optionsNow.find(row=>row.abandonedQuarterMove==='inspect');
    if(!inspect)throw new Error('Expected real visitor in civilian ruins');
    const exact=abandonedQuarterCommand(inspect);
    const rest=native('REST');
    const ordinary=Object.fromEntries(arrived.cultivators.filter(row=>row.id!==B).map(row=>[row.id,rest]));
    const utility=advanceWorldTick(arrived,ordinary,()=>.95,'utility');
    expect(person(utility,B).currentAction).toBe('ABANDONED_QUARTER');
    const respond=(raw:object)=>{
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(raw)}}]}))));
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(newborn,arrived,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'test',model:'test'},arrived.tick+1);
    };
    try {
      expect(await respond({...exact,claimedResidents:40})).toBeUndefined();
      expect(await respond({...exact,targetAbandonedQuarterId:'not-the-arrival'})).toBeUndefined();
      const admitted=await respond(exact);
      expect(admitted).toMatchObject(exact);
      if(!admitted)throw new Error('Expected exact real option');
      const cognitive=advanceWorldTick(arrived,{...ordinary,[B]:admitted},()=>.95,'utility',undefined,{modelActors:new Set([B])});
      expect(visit(cognitive,B)?.inspectedTick).toBe(arrived.tick+1);
      expect(person(cognitive,B).locationId).toBe(oldSiteId);
      expect(plot(cognitive,FROM).population).toBe(0);
      const founding=ruined.events.find(row=>row.title==='原址成为遗址');
      expect(founding).toBeDefined();
      if(founding)expect(writeChronicleScene(founding).paragraph).toContain('不是今天还住在这里的人');
    } finally { vi.unstubAllGlobals(); }
  });

  it('preserves separate inspect, stay and real leave outcomes without reviving the census', () => {
    const ruined = genuineRuins();
    const entered = reopen(turn(ruined, { [B]: explore(oldSiteId) }));
    const inspect = reopen(turn(entered, { [B]: command(entered, B, 'inspect') }));
    const stay = reopen(turn(entered, { [B]: command(entered, B, 'stay') }));
    const departure = command(entered, B, 'leave');
    expect(departure.targetLocationId).toBe(easternSiteId);
    const leave = reopen(turn(entered, { [B]: departure }));
    expect(visit(inspect, B)).toMatchObject({ inspectedTick: 20 });
    expect(visit(inspect, B)?.stayedTick).toBeUndefined();
    expect(visit(stay, B)).toMatchObject({ stayedTick: 20 });
    expect(visit(stay, B)?.inspectedTick).toBeUndefined();
    expect(visit(leave, B)?.left).toEqual({ tick: 20, destinationId: easternSiteId, byChoice: true });
    expect(person(inspect, B).locationId).toBe(oldSiteId);
    expect(person(stay, B).locationId).toBe(oldSiteId);
    expect(person(leave, B).locationId).toBe(easternSiteId);
    assertPrivate(inspect, B, 'inspect', oldSiteId);
    assertPrivate(stay, B, 'stay', oldSiteId);
    assertPrivate(leave, B, 'leave', easternSiteId);
    expect(options(leave, B)).toEqual([]);
    const rejected = reopen(turn(entered, { [A]: departure }));
    expect(person(rejected, A).locationId).toBe(oldSiteId);
    expect(visit(rejected, A)).toBeUndefined();
    expect(visit(rejected, B)?.left).toBeUndefined();
    for (const branch of [inspect, stay, leave]) {
      expect(plot(branch, FROM).population).toBe(0);
      expect(town(branch, FROM).status).toBe('ruin');
    }
  });

  it('refuses both a genuinely blocked migration and a genuinely meteor-only ruin', () => {
    const before = beforeLastMigration();
    const middle = before.terrain.tiles.find(row => row.id === 'tile-7-5')!;
    const point = { x: (middle.col + .5) * 1000 / before.terrain.columns,
      y: (middle.row + .5) * 600 / before.terrain.rows };
    const blocked = reopen(turn(applyMapBrush(applyMapBrush(before, 'cursed_miasma', [point]), 'cursed_miasma', [point])));
    expect(plot(blocked, FROM).population).toBe(1);
    expect(town(blocked, FROM).status).toBe('village');
    expect(options(blocked, A)).toEqual([]);
    const { w: single } = nativeCorridorFixture(true);
    const meteor = wait(applyMapBrush(single, 'meteor', [place(single, FROM)]),
      state => town(state, FROM)?.status === 'ruin', 6);
    const sourceId = town(meteor, FROM).changes.at(-1)?.sourceRecordId;
    expect(meteor.settlements.records.find(row => row.id === sourceId)?.kind).toBe('disaster');
    const landed = reopen(turn(meteor, { [B]: explore(oldSiteId) }));
    expect(person(landed, B).locationId).toBe(oldSiteId);
    expect(visit(landed, B)).toBeUndefined();
    expect(options(landed, B)).toEqual([]);
  });
});
