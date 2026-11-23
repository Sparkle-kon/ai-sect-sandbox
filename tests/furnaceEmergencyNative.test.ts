import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableAlchemy } from '../src/engine/alchemyEngine';
import { writeChronicleScene } from '../src/engine/chronicleScene';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { furnaceEmergencyCommand } from '../src/engine/furnaceEmergencyCognition';
import { doctrineFoundingPhysicallyAt } from '../src/engine/doctrineFoundingEngine';
import { availableFurnaceEmergencyActions } from '../src/engine/furnaceEmergency';
import { isFurnaceSafetyClosed } from '../src/engine/furnaceSafetyEngine';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { availableMentorshipActions } from '../src/engine/mentorshipEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { knownMapLocations, terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const mentorId = 'npc-5';
const apprenticeId = 'npc-6';
const furnaceId = 'loc-danxia';
const action = (chosenAction: LLMDecisionPayload['chosenAction'],
  fields: Partial<LLMDecisionPayload> = {}): LLMDecisionPayload =>
  ({ chosenAction, innerMonologue: '只依实际丹炉与在场见证。', ...fields });
const rest = action('REST');
const brew = action('BREW_PILL', { targetPillId: 'foundation' });
// A closed furnace cannot brew or heal its caller, unlike native REST.
const waitInDanger = { [apprenticeId]: brew } as const;
const person = (world: WorldState, id: string) => world.cultivators.find(row => row.id === id)!;
const site = (world: WorldState, id: string) => world.locations.find(row => row.id === id)!;
const turn = (world: WorldState, orders: Readonly<Record<string, LLMDecisionPayload>> = {}, draw = .95) =>
  advanceWorldTick(world, Object.fromEntries(world.cultivators.map(({ id }) => [id, orders[id] ?? rest])),
    () => draw, 'utility');
const reopen = (world: WorldState): WorldState => {
  const encoded = encodeEraWorldSave(world);
  const reopened = decodeEraWorldSave(encoded);
  expect(encodeEraWorldSave(reopened)).toBe(encoded);
  return reopened;
};

function openedHazardFixture() {
  let world = createInitialWorld(1, 'spirit-bloom');
  if (person(world, apprenticeId).locationId !== furnaceId) {
    world = turn(world, { [apprenticeId]: action('EXPLORE', { targetLocationId: furnaceId }) });
  }
  const canOfferTuition = () => availableMentorshipActions(person(world, mentorId), world)
    .some(row => row.action === 'TEACH' && row.targetCultivatorId === apprenticeId);
  for (let attempts = 0; attempts < 40 && !canOfferTuition(); attempts++) {
    world = turn(world, { [mentorId]: action('CULTIVATE') });
  }
  expect(canOfferTuition()).toBe(true);
  world = turn(world, { [mentorId]: action('TEACH', { targetCultivatorId: apprenticeId }) });
  const offer = world.mentorship.offers.find(row => row.mentorId === mentorId && row.studentId === apprenticeId)!;
  world = turn(world, { [apprenticeId]: action('ACCEPT_TUITION', { targetTuitionId: offer.id }) });
  const lineage = world.mentorship.lineage.find(row => row.mentorId === mentorId && row.studentId === apprenticeId)!;
  expect(lineage.formedTick).toBe(14);
  for (const [herb, count] of [['jade_leaf', 2], ['earth_root', 1]] as const) {
    for (let attempts = 0; attempts < 6 && person(world, apprenticeId).herbs[herb] < count; attempts++) {
      expect(availableAlchemy(person(world, apprenticeId), world, world.tick + 1))
        .toContainEqual(expect.objectContaining({ action: 'GATHER_HERBS', targetHerbId: herb }));
      world = turn(world, { [apprenticeId]: action('GATHER_HERBS', { targetHerbId: herb }) }, .1);
    }
    expect(person(world, apprenticeId).herbs[herb]).toBeGreaterThanOrEqual(count);
  }
  expect(availableAlchemy(person(world, apprenticeId), world, world.tick + 1))
    .toContainEqual(expect.objectContaining({ action: 'BREW_PILL', targetPillId: 'foundation' }));
  const herbStock = { ...person(world, apprenticeId).herbs };
  world = turn(world, { [apprenticeId]: brew }, .05);
  expect(world.tick).toBe(17);
  expect(world.furnaceReservations.uses).toContainEqual({
    siteId: furnaceId, actorId: apprenticeId, tick: 17, slot: 1, kind: 'brew',
  });
  expect(person(world, apprenticeId).herbs.jade_leaf).toBe(herbStock.jade_leaf - 2);
  expect(person(world, apprenticeId).herbs.earth_root).toBe(herbStock.earth_root - 1);
  const furnace = site(world, furnaceId);
  const tile = terrainTileAt(world, furnace.x, furnace.y);
  if (!tile) throw new Error('Expected the actual furnace tile');
  const adjacent = { x: (tile.col + 1.5) * 1000 / world.terrain.columns,
    y: (tile.row + .5) * 600 / world.terrain.rows };
  world = applyMapBrush(world, 'paint_vein', [adjacent]);
  const refuge = world.locations.find(row => row.id.startsWith('brush-vein-') &&
    row.x === adjacent.x && row.y === adjacent.y)!;
  expect(refuge).toBeDefined();
  expect(knownMapLocations(world, person(world, apprenticeId)).some(row => row.id === refuge.id)).toBe(true);
  world = applyMapBrush(world, 'beast_tide', [furnace]);
  const hazard = world.mapHazards.find(row => row.kind === 'beast_tide' && row.tileId === tile.id)!;
  world = turn(world, { [apprenticeId]: brew });
  world = reopen(world);
  const safetyCase = world.furnaceSafety.cases.find(row => row.siteId === furnaceId)!;
  expect(world.tick).toBe(18);
  expect(hazard.id).toBe('hazard-2-tile-5-11');
  expect(safetyCase).toMatchObject({
    id: 'furnace-safety-1', hazardId: hazard.id, integrityBefore: 100, integrity: 70, damagedTick: 18,
  });
  expect(isFurnaceSafetyClosed(world, furnaceId)).toBe(true);
  expect(person(world, apprenticeId)).toMatchObject({ locationId: furnaceId, hp: 384 });
  expect(doctrineFoundingPhysicallyAt(world, person(world, apprenticeId), furnaceId, world.tick)).toBe(true);
  expect(world.events.find(row => row.tick === 18 && row.id.endsWith(`-${hazard.id}`))?.damage)
    .toContainEqual(expect.objectContaining({ cultivatorId: apprenticeId, amount: 36 }));
  expect(world.furnaceReservations.uses.some(row => row.tick === 18 && row.actorId === apprenticeId)).toBe(false);
  return { world, hazard, safetyCase, furnace, refuge };
}

type EmergencyOption = ReturnType<typeof availableFurnaceEmergencyActions>[number];
const options = (world: WorldState, actorId: string) =>
  availableFurnaceEmergencyActions(person(world, actorId), world, world.tick + 1);
const command = (world: WorldState, actorId: string, move: EmergencyOption['furnaceEmergencyMove']) => {
  const option = options(world, actorId).find(row => row.furnaceEmergencyMove === move);
  expect(option).toBeDefined();
  const { furnaceEmergencyMove, targetFurnaceEmergencyId, targetLocationId } = option!;
  return action('FURNACE_EMERGENCY', { furnaceEmergencyMove, targetFurnaceEmergencyId,
    ...(targetLocationId === undefined ? {} : { targetLocationId }) });
};
const pulse = (world: WorldState, hazardId: string, actorId: string, tick = world.tick) =>
  world.events.find(row => row.tick === tick && row.id === `evt-${tick}-${hazardId}`)?.damage
    ?.find(row => row.cultivatorId === actorId)?.amount;

const decision = (world: WorldState) =>
  world.furnaceEmergencies?.cases.find(row => row.studentId === apprenticeId)?.decision;
const sceneReceipt = (world: WorldState, kind: string, tick = world.tick) => {
  const row = world.furnaceEmergencies?.cases.find(row => row.studentId === apprenticeId);
  return world.events.find(event => event.id === `evt-${row?.id}-${kind}-${tick}`);
};

describe('real staffed furnace danger (P22-3)', () => {
  it('starts from a native paid lesson and brew, then the actual painted tide wounds and closes the furnace', () => {
    const { world, hazard, safetyCase, refuge } = openedHazardFixture();
    expect(world.furnaceEmergencies?.cases).toContainEqual(expect.objectContaining({
      safetyId: safetyCase.id, siteId: furnaceId, studentId: apprenticeId, mentorId, usedTick: 17,
      damagedTick: 18, hazardId: hazard.id, injuryEventId: `evt-18-${hazard.id}`, injuryHp: 36,
    }));
    expect(options(world, apprenticeId).map(row => row.furnaceEmergencyMove).sort()).toEqual([
      'brace', 'request_rescue', 'retreat',
    ]);
    const source = world.furnaceEmergencies?.cases.find(row => row.studentId === apprenticeId)!;
    const sourceOffer = world.mentorship.offers.find(row => row.id === source.tuitionId);
    expect(sourceOffer).toMatchObject({ status: 'accepted', resolvedTick: 14, mentorId, studentId: apprenticeId });
    expect(world.events.find(event => event.id === 'evt-furnace-safety-1-closed-18')).toMatchObject({
      title: '兽潮实损，炉事暂止', locationId: furnaceId, tick: 18,
    });
    expect(options(world, mentorId)).toEqual([]);
    expect(options(world, 'npc-1')).toEqual([]);
    expect(command(world, apprenticeId, 'retreat').targetLocationId).toBe(refuge.id);
  });

  it('lets the utility engine and the strict provider choose from the same live menu without inventing a result', async () => {
    const {world} = openedHazardFixture();
    const student=person(world,apprenticeId), candidates=options(world,apprenticeId);
    const rests=Object.fromEntries(world.cultivators.filter(row=>row.id!==apprenticeId).map(row=>[row.id,rest]));
    const utility=advanceWorldTick(world,rests,()=>.95,'utility');
    expect(person(utility,apprenticeId).currentAction).toBe('FURNACE_EMERGENCY');
    expect(candidates.some(row=>row.furnaceEmergencyMove===decision(utility)?.move)).toBe(true);
    const legal=candidates.find(row=>row.furnaceEmergencyMove==='retreat');
    if(!legal)throw new Error('Expected an observed adjacent exit');
    const exact=furnaceEmergencyCommand(legal);
    const ask=(raw:object)=>{
      const fetch=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(raw)}}]})));
      vi.stubGlobal('fetch',fetch);
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(student,world,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'fixture',model:'fixture'},19);
    };
    try{
      expect(await ask({...exact,forceMentor:true})).toBeUndefined();
      expect(await ask({...exact,targetLocationId:'loc-wanxian'})).toBeUndefined();
      const admitted=await ask(exact);
      expect(admitted).toMatchObject(exact);
      if(!admitted)throw new Error('Expected exact quote from observed options');
      const all=Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===apprenticeId?admitted:rest]));
      const cognitive=advanceWorldTick(world,all,()=>.95,'utility',undefined,{modelActors:new Set([apprenticeId])});
      const native=turn(world,{[apprenticeId]:command(world,apprenticeId,'retreat')});
      expect(decision(cognitive)).toEqual(decision(native));
      expect(person(cognitive,apprenticeId).locationId).toBe(person(native,apprenticeId).locationId);
    }finally{vi.unstubAllGlobals();}
  });

  it('moves only the apprentice to the exact adjacent refuge while remaining keeps the native next wound', () => {
    const { world, hazard, safetyCase, refuge } = openedHazardFixture();
    const stay = turn(turn(world, waitInDanger), waitInDanger);
    const retreatT19 = turn(world, { [apprenticeId]: command(world, apprenticeId, 'retreat') });
    expect(person(retreatT19, apprenticeId)).toMatchObject({ locationId: refuge.id, hp: 348 });
    expect(person(retreatT19, mentorId).locationId).toBe(furnaceId);
    expect(decision(retreatT19)).toMatchObject({ move: 'retreat', refugeId: refuge.id, crossedTick: 19 });
    expect(sceneReceipt(retreatT19, 'retreat')).toMatchObject({
      actorIds: [apprenticeId], locationId: refuge.id, witnessScope: 'participants',
    });
    expect(writeChronicleScene(sceneReceipt(retreatT19, 'retreat')!).paragraph).toBe('');
    expect(pulse(retreatT19, hazard.id, apprenticeId)).toBe(36);
    const retreatT20 = reopen(turn(retreatT19, waitInDanger));
    expect(person(retreatT20, apprenticeId)).toMatchObject({ locationId: refuge.id, hp: 348 });
    expect(pulse(retreatT20, hazard.id, apprenticeId)).toBeUndefined();
    expect(person(stay, apprenticeId)).toMatchObject({ locationId: furnaceId, hp: 312 });
    expect(pulse(stay, hazard.id, apprenticeId)).toBe(36);
    expect(retreatT20.furnaceSafety.cases.find(row => row.id === safetyCase.id)).toEqual(safetyCase);
  });

  it('braces one actual next pulse without rewriting the closure or granting a brew slot', () => {
    const { world, hazard, safetyCase } = openedHazardFixture();
    const braceT19 = turn(world, { [apprenticeId]: command(world, apprenticeId, 'brace') });
    const waitT19 = turn(world, waitInDanger);
    expect(pulse(braceT19, hazard.id, apprenticeId)).toBe(pulse(waitT19, hazard.id, apprenticeId));
    expect(person(braceT19, apprenticeId)).toMatchObject({ locationId: furnaceId, hp: 348 });
    expect(decision(braceT19)).toEqual({ move: 'brace', tick: 19 });
    expect(sceneReceipt(braceT19, 'applied')).toBeUndefined();
    const gather = action('GATHER_HERBS', { targetHerbId: 'earth_root' });
    expect(availableAlchemy(person(waitT19, mentorId), waitT19, 20))
      .toContainEqual(expect.objectContaining({ action: 'GATHER_HERBS', targetHerbId: 'earth_root' }));
    const agreedGather = { ...waitInDanger, [mentorId]: gather };
    const braceT20 = reopen(turn(braceT19, agreedGather));
    const waitT20 = turn(waitT19, agreedGather);
    expect(decision(braceT20)).toMatchObject({ appliedTick: 20, preventedHp: 12, storedRoot: 1 });
    expect(sceneReceipt(braceT20, 'applied')).toMatchObject({
      actorIds: [apprenticeId], locationId: furnaceId, witnessScope: 'participants',
    });
    expect(site(waitT20, furnaceId).herbs.earth_root - site(braceT20, furnaceId).herbs.earth_root).toBe(1);
    expect(pulse(braceT20, hazard.id, apprenticeId)).toBe(24);
    expect(pulse(waitT20, hazard.id, apprenticeId)).toBe(36);
    expect(person(braceT20, apprenticeId).hp - person(waitT20, apprenticeId).hp).toBe(12);
    expect(person(waitT20, apprenticeId).qiProgress - person(braceT20, apprenticeId).qiProgress).toBe(8);
    expect(pulse(braceT20, hazard.id, apprenticeId, 18)).toBe(36);
    expect(braceT20.furnaceSafety.cases.find(row => row.id === safetyCase.id)).toEqual(safetyCase);
    expect(isFurnaceSafetyClosed(braceT20, furnaceId)).toBe(true);
    expect(braceT20.furnaceReservations.uses.some(row => row.actorId === apprenticeId && row.tick >= 18)).toBe(false);
    const expiry = reopen(turn(braceT20, waitInDanger));
    expect(expiry.mapHazards.some(row => row.id === hazard.id)).toBe(false);
    expect(isFurnaceSafetyClosed(expiry, furnaceId)).toBe(true);
    expect(decision(expiry)).toMatchObject({ appliedTick: 20, storedRoot: 1, returnedTick: 21 });
    expect(sceneReceipt(expiry, 'returned')).toMatchObject({ actorIds: [apprenticeId], locationId: furnaceId });
    const ordinaryRegrowth = expiry.resourceFlow.months.find(month => month.tick === expiry.tick)?.entries
      .filter(flow => flow.kind === 'production' && flow.reason === 'herb_regrowth' &&
        flow.good === 'earth_root' && flow.refId === furnaceId)
      .reduce((sum, flow) => sum + flow.amount, 0);
    expect(ordinaryRegrowth).toBe(1);
    expect(site(expiry, furnaceId).herbs.earth_root)
      .toBe(site(braceT20, furnaceId).herbs.earth_root + ordinaryRegrowth! + 1);
    const subsequent = reopen(turn(expiry, waitInDanger));
    expect(subsequent.events.filter(event => event.id.includes('furnace-emergency') && event.id.includes('-returned-')))
      .toEqual([sceneReceipt(expiry, 'returned')]);
  });

  it('treats asking, independent consent and actual arrival as distinct consequences', () => {
    const { world, hazard, safetyCase, refuge } = openedHazardFixture();
    const requested = reopen(turn(world, { [apprenticeId]: command(world, apprenticeId, 'request_rescue') }));
    expect(person(requested, apprenticeId)).toMatchObject({ locationId: furnaceId, hp: 348 });
    expect(person(requested, mentorId).locationId).toBe(furnaceId);
    expect(decision(requested)).toEqual({ move: 'request_rescue', tick: 19, refugeId: refuge.id });
    expect(sceneReceipt(requested, 'request_rescue')).toMatchObject({
      actorIds: [apprenticeId, mentorId], locationId: furnaceId, witnessScope: 'participants',
    });
    expect(sceneReceipt(requested, 'crossed')).toBeUndefined();
    expect(options(requested, mentorId).map(row => row.furnaceEmergencyMove)).toEqual(['accept_rescue']);
    expect(options(requested, 'npc-1')).toEqual([]);
    const consent = command(requested, mentorId, 'accept_rescue');
    const impostor = turn(requested, { ...waitInDanger, 'npc-1': consent });
    expect(person(impostor, apprenticeId)).toMatchObject({ locationId: furnaceId, hp: 312 });
    expect(person(impostor, mentorId).locationId).toBe(furnaceId);
    const accepted = turn(requested, { ...waitInDanger, [mentorId]: consent });
    expect(pulse(accepted, hazard.id, apprenticeId)).toBe(36);
    expect(decision(accepted)).toMatchObject({ acceptedTick: 20 });
    expect(decision(accepted)?.crossedTick).toBeUndefined();
    expect(person(accepted, apprenticeId).locationId).toBe(furnaceId);
    expect(person(accepted, mentorId).locationId).toBe(furnaceId);
    expect(sceneReceipt(accepted, 'accept_rescue')).toMatchObject({
      actorIds: [apprenticeId, mentorId], locationId: furnaceId, witnessScope: 'participants',
    });
    expect(sceneReceipt(accepted, 'crossed')).toBeUndefined();
    const arrived = reopen(turn(accepted, waitInDanger));
    expect(person(arrived, apprenticeId)).toMatchObject({ locationId: refuge.id, hp: 312 });
    expect(person(arrived, mentorId).locationId).toBe(refuge.id);
    expect(decision(arrived)).toMatchObject({ acceptedTick: 20, crossedTick: 21, refugeId: refuge.id });
    expect(sceneReceipt(arrived, 'crossed')).toMatchObject({
      actorIds: [apprenticeId, mentorId], locationId: refuge.id,
    });
    expect(sceneReceipt(arrived, 'crossed')?.witnessScope).toBeUndefined();
    expect(writeChronicleScene(sceneReceipt(arrived, 'crossed')!).paragraph).toContain('丹炉仍封着');
    // A request cannot acquire an outcome merely by changing the durable date.
    const invented=structuredClone(accepted);
    const inventedDecision=decision(invented);
    if(!inventedDecision)throw new Error('Expected actual pending aid');
    inventedDecision.crossedTick=20;
    expect(()=>decodeEraWorldSave(encodeEraWorldSave(invented))).toThrow();

    expect(sceneReceipt(arrived, 'crossed')?.description).not.toMatch(/求援|答应|伤|药材/);
    const unsafeRefuge = applyMapBrush(accepted, 'beast_tide', [refuge]);
    const blocked = reopen(turn(unsafeRefuge, waitInDanger));
    expect(decision(blocked)).toMatchObject({ acceptedTick: 20 });
    expect(decision(blocked)?.crossedTick).toBeUndefined();
    expect(sceneReceipt(blocked, 'crossed')).toBeUndefined();
    expect(person(blocked, apprenticeId).locationId).toBe(furnaceId);
    expect(person(blocked, mentorId).locationId).toBe(furnaceId);
    expect(arrived.furnaceSafety.cases.find(row => row.id === safetyCase.id)).toEqual(safetyCase);
    expect(person(reopen(turn(impostor, waitInDanger)), apprenticeId).locationId).toBe(furnaceId);
  });
});

it('keeps the active furnace incident after real same-month brush traffic rotates both exact public sources',()=>{
  const {world,hazard,safetyCase}=openedHazardFixture();
  const injuryId=`evt-18-${hazard.id}`,closureId=`evt-${safetyCase.id}-closed-18`;
  const expected=options(world,apprenticeId);
  expect(expected.map(row=>row.furnaceEmergencyMove)).toEqual(['brace','retreat','request_rescue']);
  let crowded=world;
  for(let count=0;count<125;count++)crowded=applyMapBrush(crowded,'paint_vein',[{x:900,y:540}]);
  expect(crowded.events.some(row=>row.id===injuryId||row.id===closureId)).toBe(false);
  expect(crowded.chronicleArchive.anchors.filter(row=>row.id===injuryId||row.id===closureId)).toHaveLength(2);
  const reopened=reopen(crowded);
  expect(options(reopened,apprenticeId)).toEqual(expected);
  const declined=structuredClone(reopened);
  declined.events.unshift({...world.events.find(row=>row.id===injuryId)!,witnessScope:'participants'});
  expect(options(declined,apprenticeId)).toEqual([]);
  const duplicate=structuredClone(reopened);
  duplicate.chronicleArchive.anchors.push({...duplicate.chronicleArchive.anchors.find(row=>row.id===injuryId)!});
  expect(options(duplicate,apprenticeId)).toEqual([]);
  const prepared=turn(reopened,{[apprenticeId]:command(reopened,apprenticeId,'brace')});
  const applied=reopen(turn(prepared,waitInDanger));
  expect(decision(applied)).toMatchObject({appliedTick:20,preventedHp:12});
});
