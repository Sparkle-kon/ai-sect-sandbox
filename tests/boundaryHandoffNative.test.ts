import { describe, expect, it, vi } from 'vitest';
import { boundaryGapCommand } from '../src/engine/boundaryGapCognition';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableBoundaryGapActions, projectBoundaryGap } from '../src/engine/boundaryGap';
import { boundaryReliefCheckpoint } from '../src/engine/boundaryReliefCheckpoint';
import { availableBoundaryReliefActions, getCurrentBoundaryCoverage, visibleBoundaryReliefs } from '../src/engine/boundaryReliefEngine';
import { publicChronicleSceneEvents } from '../src/engine/chronicleLead';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { availableSectEconomyActions, isGuardPhysicallyOnDuty } from '../src/engine/sectEconomyEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const leaderId = 'npc-1';
const incumbentId = 'elder-taixu-1';
const incomingId = 'elder-taixu-2';
const witnessId = 'npc-2';
const distantId = 'npc-5';
const sectId = 'sect-qingyun';
const hqId = 'loc-taixu';
const postId = 'brush-vein-tile-7-3';
const reliefId = 'boundary-relief-1';
const postPoint = { x: 300, y: 140 };
const action = (chosenAction: LLMDecisionPayload['chosenAction'],
  fields: Partial<LLMDecisionPayload> = {}): LLMDecisionPayload =>
  ({ chosenAction, innerMonologue: '以岗点实到与本宗凭据为准。', ...fields });
const rest = action('REST');
const turn = (world: WorldState, orders: Readonly<Record<string, LLMDecisionPayload>> = {}) =>
  advanceWorldTick(world, Object.fromEntries(world.cultivators.map(({ id }) => [id, orders[id] ?? rest])),
    () => .95, 'utility');
const person = (world: WorldState, id: string) => world.cultivators.find(row => row.id === id)!;
const post = (world: WorldState) => world.locations.find(row => row.id === postId)!;
const caseAt = (world: WorldState) => world.boundaryReliefs.cases.find(row => row.id === reliefId)!;
const explore = (targetLocationId: string) => action('EXPLORE', { targetLocationId });
const reopen = (world: WorldState) => {
  const encoded = encodeEraWorldSave(world);
  const loaded = decodeEraWorldSave(encoded);
  expect(encodeEraWorldSave(loaded)).toBe(encoded);
  return loaded;
};
const coverage = (world: WorldState, viewerId = witnessId) =>
  getCurrentBoundaryCoverage(world, person(world, viewerId), postId);

function actualPost() {
  let world = createInitialWorld(1, 'spirit-bloom');
  expect(terrainTileAt(world, postPoint.x, postPoint.y)).toMatchObject({ id: 'tile-7-3', ownerSectId: sectId });
  world = applyMapBrush(world, 'paint_vein', [postPoint]);
  expect(post(world)).toMatchObject({ ...postPoint, type: 'spirit_vein', ownerSectId: sectId });
  const dispatch = action('DISPATCH_GUARD', { targetCultivatorId: incumbentId, targetLocationId: postId });
  expect(availableSectEconomyActions(person(world, leaderId), world)).toContainEqual({
    action: 'DISPATCH_GUARD', targetCultivatorId: incumbentId, targetLocationId: postId,
  });
  world = turn(world, { [leaderId]: dispatch, [incomingId]: action('CULTIVATE'), [witnessId]: explore(hqId) });
  expect(world.tick).toBe(2);
  expect(person(world, incumbentId)).toMatchObject({ locationId: hqId,
    guardAssignment: { assignedTick: 2, expiresTick: 8, locationId: postId } });
  expect(isGuardPhysicallyOnDuty(person(world, incumbentId), world)).toBe(false);
  world = turn(world, { [incumbentId]: action('GUARD_DUTY'),
    [incomingId]: action('CULTIVATE'), [witnessId]: explore(postId) });
  expect(world.tick).toBe(3);
  expect(world.events.find(row => row.id === 'evt-3-elder-taixu-1-guard_duty')).toMatchObject({
    locationId: postId, actorIds: [incumbentId], title: '守备到岗',
  });
  expect(isGuardPhysicallyOnDuty(person(world, incumbentId), world)).toBe(true);
  expect(person(world, witnessId)).toMatchObject({ locationId: postId });
  expect(person(world, witnessId).guardAssignment).toBeUndefined();
  expect(person(world, incomingId)).toMatchObject({ locationId: hqId, qiProgress: 100 });
  return reopen(world);
}
function acceptedAt(offerTick: 4 | 6) {
  let world = actualPost();
  while (world.tick < offerTick - 1) world = turn(world);
  expect(availableBoundaryReliefActions(person(world, leaderId), world, world.tick + 1)).toContainEqual({
    action: 'BOUNDARY_RELIEF', boundaryReliefMove: 'offer', targetCultivatorId: incomingId, targetLocationId: postId,
  });
  world = turn(world, { [leaderId]: action('BOUNDARY_RELIEF',
    { boundaryReliefMove: 'offer', targetCultivatorId: incomingId, targetLocationId: postId }) });
  expect(coverage(world)).toMatchObject({ kind: 'incumbent', tick: offerTick });
  expect(world.events.find(row => row.id === `evt-${reliefId}-${offerTick}-offer`))
    .toMatchObject({ witnessScope: 'participants', locationId: hqId });
  world = turn(world, { [incomingId]: action('BOUNDARY_RELIEF',
    { boundaryReliefMove: 'accept', targetBoundaryReliefId: reliefId }) });
  expect(caseAt(world)).toMatchObject({
    status: 'travelling', offeredTick: offerTick, acceptedTick: offerTick + 1, pathIndex: 0,
    incumbentAssignedTick: 2, outboundSteps: 0, strainSpent: 0,
    path: [{ x: 180, y: 150 }, { x: 220, y: 140 }, { x: 260, y: 140 }, postPoint],
  });
  expect(person(world, incomingId).guardAssignment).toBeUndefined();
  return reopen(world);
}

function genuineGap(oldLeaves: boolean) {
  const start = acceptedAt(6);
  const atGap = turn(start, oldLeaves ? { [incumbentId]: explore(hqId) } : {});
  expect(atGap.tick).toBe(8);
  expect(caseAt(atGap)).toMatchObject({ status: 'travelling', firstGapTick: 8,
    coverage: { kind: 'gap', tick: 8 }, outboundSteps: 2, strainSpent: 2 });
  expect(person(atGap, incumbentId).locationId).toBe(oldLeaves ? hqId : postId);
  expect(person(atGap, incumbentId).guardAssignment).toBeUndefined();
  expect(person(atGap, incomingId).guardAssignment).toBeUndefined();
  expect(boundaryReliefCheckpoint(atGap, person(atGap, incomingId))).toEqual({ x: 260, y: 140 });
  expect(coverage(atGap)).toEqual({ postSiteId: postId, tick: 8, kind: 'gap' });
  expect(coverage(atGap, distantId)).toBeUndefined();
  return reopen(atGap);
}

function blockedGap(oldLeaves = true) {
  let world = acceptedAt(6);
  const onRoute = caseAt(world).path[2];
  world = applyMapBrush(applyMapBrush(world, 'cursed_miasma', [onRoute]), 'cursed_miasma', [onRoute]);
  return reopen(turn(world, oldLeaves ? { [incumbentId]: explore(hqId) } : {}));
}
const gapOptions = (world: WorldState, actorId = witnessId) =>
  availableBoundaryGapActions(person(world, actorId), world, world.tick + 1);
type GapMove = ReturnType<typeof gapOptions>[number]['boundaryGapMove'];
const response = (world: WorldState, actorId = witnessId) =>
  world.boundaryGapResponses?.responses.find(row => row.reliefId === reliefId && row.actorId === actorId);
const gapCommand = (world: WorldState, move: GapMove, actorId = witnessId) => {
  const option = gapOptions(world, actorId).find(row => row.boundaryGapMove === move)!;
  expect(option).toBeDefined();
  return action('BOUNDARY_GAP', { boundaryGapMove: move, targetBoundaryGapId: option.targetBoundaryGapId,
    ...(option.targetCultivatorId === undefined ? {} : { targetCultivatorId: option.targetCultivatorId }) });
};
const privateResponse = (world: WorldState, move: GapMove | 'applied', actorIds: string[]) => {
  const id = `evt-boundary-gap-${reliefId}-${witnessId}-${move}-${world.tick}`;
  expect(world.events.find(row => row.id === id)).toMatchObject({
    locationId: postId, witnessScope: 'participants', actorIds,
  });
  expect(publicChronicleSceneEvents(world).map(row => row.id)).not.toContain(id);
};
const waitInPlace = action('BREW_PILL', { targetPillId: 'foundation' });
const damageAt = (world: WorldState, hazardId: string, actorId: string) =>
  world.events.find(event => event.id === `evt-${world.tick}-${hazardId}`)?.damage
    ?.find(hit => hit.cultivatorId === actorId)?.amount;

describe('two flags on a single actual mountain pass (P22-5)', () => {
  it('swaps a real outgoing posting only after independently accepted and paid arrival, without claiming the retired body vanished', () => {
    const accepted = acceptedAt(4);
    const onRoad = reopen(turn(accepted));
    expect(onRoad.tick).toBe(6);
    expect(boundaryReliefCheckpoint(onRoad, person(onRoad, incomingId))).toEqual({ x: 260, y: 140 });
    expect(person(onRoad, incomingId)).toMatchObject({ locationId: hqId, qiProgress: 98 });
    expect(coverage(onRoad)).toMatchObject({ kind: 'incumbent', tick: 6 });
    expect(coverage(onRoad, distantId)).toBeUndefined();
    expect(person(onRoad, incomingId).guardAssignment).toBeUndefined();

    const arrived = reopen(turn(onRoad));
    expect(caseAt(arrived)).toMatchObject({ status: 'completed', closedTick: 7, outboundSteps: 3, strainSpent: 3,
      coverage: { kind: 'relief', tick: 7, guardId: incomingId } });
    expect(caseAt(arrived).firstGapTick).toBeUndefined();
    expect(person(arrived, incomingId)).toMatchObject({ locationId: postId, qiProgress: 97,
      guardAssignment: { locationId: postId, assignedTick: 7, expiresTick: 13 } });
    expect(person(arrived, incumbentId).locationId).toBe(postId);
    expect(person(arrived, incumbentId).guardAssignment).toBeUndefined();
    expect(isGuardPhysicallyOnDuty(person(arrived, incomingId), arrived)).toBe(true);
    expect(coverage(arrived)).toEqual({ postSiteId: postId, tick: 7, kind: 'relief' });
    expect(coverage(arrived, distantId)).toBeUndefined();
    expect(visibleBoundaryReliefs(arrived, person(arrived, witnessId))).toEqual([]);
    const nativeReceipt = `evt-${reliefId}-7-handover`;
    expect(arrived.events.find(row => row.id === nativeReceipt)).toMatchObject({
      locationId: postId, actorIds: [leaderId, incumbentId, incomingId], witnessScope: 'participants',
    });
    expect(publicChronicleSceneEvents(arrived).map(row => row.id)).not.toContain(nativeReceipt);
  });

  it('separates original assignment expiry, physical departure and the following real replacement', () => {
    const stayedInPerimeter = genuineGap(false);
    const leftPerimeter = genuineGap(true);
    for (const base of [stayedInPerimeter, leftPerimeter]) {
      const arrived = reopen(turn(base));
      expect(caseAt(arrived)).toMatchObject({ status: 'completed', firstGapTick: 8, closedTick: 9,
        coverage: { kind: 'relief', tick: 9, guardId: incomingId } });
      expect(coverage(arrived)).toEqual({ postSiteId: postId, tick: 9, kind: 'relief' });
      expect(coverage(arrived, distantId)).toBeUndefined();
      expect(person(arrived, incumbentId).locationId).toBe(person(base, incumbentId).locationId);
      expect(post(arrived).ownerSectId).toBe(sectId);
      expect(arrived.sects.find(sect => sect.id === sectId)?.headquartersId).toBe(hqId);
    }
  });

  it('keeps only a local vacancy after a real obstacle and actual paid reverse route', () => {
    let world = blockedGap();
    expect(coverage(world)).toEqual({ postSiteId: postId, tick: 8, kind: 'gap' });
    expect(boundaryReliefCheckpoint(world, person(world, incomingId))).toEqual({ x: 220, y: 140 });
    expect(person(world, incomingId).guardAssignment).toBeUndefined();
    while (world.tick < 11) world = turn(world);
    world = reopen(world);
    expect(caseAt(world)).toMatchObject({ status: 'expired', closeReason: 'late', closedTick: 11,
      firstGapTick: 8, pathIndex: 0, outboundSteps: 1, returnSteps: 1, strainSpent: 2 });
    expect(world.events.some(row => row.id.startsWith(`evt-${reliefId}`) && row.id.endsWith('-handover'))).toBe(false);
    expect(person(world, incomingId)).toMatchObject({ locationId: hqId, qiProgress: 98 });
    expect(person(world, incomingId).guardAssignment).toBeUndefined();
    expect(coverage(world)).toEqual({ postSiteId: postId, tick: 11, kind: 'gap' });
    expect(coverage(world, distantId)).toBeUndefined();
    expect(post(world).ownerSectId).toBe(sectId);
    expect(world.sects.find(sect => sect.id === sectId)?.headquartersId).toBe(hqId);
  });

  it('lets a local bystander refuse or stay privately without appointing a keeper or moving anybody', () => {
    const gap = genuineGap(true);
    expect(projectBoundaryGap(gap, person(gap, witnessId))).toMatchObject({ status: 'gap', siteId: postId });
    expect(gapOptions(gap).map(row => row.boundaryGapMove)).toEqual(expect.arrayContaining(['refuse', 'stay']));
    expect(gapOptions(gap, distantId)).toEqual([]);
    expect(projectBoundaryGap(gap, person(gap, distantId))).toBeUndefined();
    const refused = reopen(turn(gap, { [witnessId]: gapCommand(gap, 'refuse') }));
    const stayed = reopen(turn(gap, { [witnessId]: gapCommand(gap, 'stay') }));
    const attempts = reopen(turn(gap, { [distantId]: gapCommand(gap, 'stay') }));
    expect(response(attempts, distantId)).toBeUndefined();
    expect(response(attempts)).toBeUndefined();
    for (const [world, move] of [[refused, 'refuse'], [stayed, 'stay']] as const) {
      expect(response(world)).toMatchObject({ reliefId, postSiteId: postId, actorId: witnessId, gapTick: 8, tick: 9, move });
      expect(response(world)?.applied).toBeUndefined();
      expect(person(world, witnessId)).toMatchObject({ locationId: postId, qiProgress: 82 });
      expect(person(world, witnessId).guardAssignment).toBeUndefined();
      expect(person(world, incumbentId).locationId).toBe(hqId);
      privateResponse(world, move, [witnessId]);
      expect(projectBoundaryGap(world, person(world, witnessId))).toMatchObject({ status: 'relieved', siteId: postId });
      expect(projectBoundaryGap(world, person(world, distantId))).toBeUndefined();
      expect(caseAt(world)).toMatchObject({ firstGapTick: 8, closedTick: 9, coverage: { kind: 'relief', guardId: incomingId } });
      expect(coverage(world, distantId)).toBeUndefined();
    }
  });

  it('lets Utility and Cognitive JSON choose a local response without inventing flags or injuries',async()=>{
    const gap=genuineGap(true);
    const stays=gapOptions(gap).find(row=>row.boundaryGapMove==='stay');
    if(!stays)throw new Error('Expected an actually co-present observer');
    const exact=boundaryGapCommand(stays);
    const normal=Object.fromEntries(gap.cultivators.filter(row=>row.id!==witnessId).map(row=>[row.id,rest]));
    const utility=advanceWorldTick(gap,normal,()=>.95,'utility');
    expect(person(utility,witnessId).currentAction).toBe('BOUNDARY_GAP');
    const quote=(raw:object)=>{
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(raw)}}]}))));
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(person(gap,witnessId),gap,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'test',model:'test'},gap.tick+1);
    };
    try{
      expect(await quote({...exact,claimedGuard:true})).toBeUndefined();
      expect(await quote({...exact,targetBoundaryGapId:'missing-edge'})).toBeUndefined();
      expect(await quote({...exact,targetCultivatorId:incomingId})).toBeUndefined();
      const admitted=await quote(exact);
      if(!admitted)throw new Error('Expected the real local option');
      const model=advanceWorldTick(gap,{...normal,[witnessId]:admitted},()=>.95,'utility',undefined,{modelActors:new Set([witnessId])});
      expect(response(model)).toMatchObject({move:'stay',tick:9,gapTick:8});
      expect(person(model,witnessId).guardAssignment).toBeUndefined();
      expect(post(model).ownerSectId).toBe(sectId);
      expect(coverage(model)?.kind).toBe('relief');
    }finally{vi.unstubAllGlobals();}
  });

  it('debits actual cover only for the next real hit; a handover before the pulse does not rewrite it', () => {
    const prepareHazard = (world: WorldState) => {
      const marked = applyMapBrush(world, 'beast_tide', [post(world)]);
      const hazard = marked.mapHazards.find(row => row.kind === 'beast_tide' && row.tileId === 'tile-7-3')!;
      expect(hazard).toMatchObject({ createdTick: 8, intensity: 1 });
      return { marked, hazardId: hazard.id };
    };
    const { marked, hazardId } = prepareHazard(blockedGap(false));
    const cover = gapCommand(marked, 'cover');
    expect(cover.targetCultivatorId).toBe(incumbentId);
    const physicallyStay = { [witnessId]: waitInPlace, [incumbentId]: waitInPlace };
    const armed = reopen(turn(marked, { ...physicallyStay, [witnessId]: cover }));
    const ordinary = turn(marked, physicallyStay);
    expect(response(armed)).toMatchObject({
      actorId: witnessId, postSiteId: postId, reliefId, gapTick: 8, tick: 9, move: 'cover', targetCultivatorId: incumbentId,
    });
    expect(response(armed)?.applied).toBeUndefined();
    privateResponse(armed, 'cover', [witnessId]);
    expect(damageAt(armed, hazardId, incumbentId)).toBe(damageAt(ordinary, hazardId, incumbentId));
    expect(person(armed, witnessId).qiProgress).toBe(person(ordinary, witnessId).qiProgress);
    const acted = reopen(turn(armed, physicallyStay));
    const ordinaryHit = turn(ordinary, physicallyStay);
    expect(response(acted)?.applied).toMatchObject({ tick: 10, hazardId, preventedHp: 12 });
    privateResponse(acted, 'applied', [witnessId, incumbentId]);
    expect(damageAt(ordinaryHit, hazardId, incumbentId)! - damageAt(acted, hazardId, incumbentId)!).toBe(12);
    expect(damageAt(ordinaryHit, hazardId, witnessId)).toBe(damageAt(acted, hazardId, witnessId));
    expect(person(acted, incumbentId).qiProgress).toBe(person(ordinaryHit, incumbentId).qiProgress);
    expect(person(acted, incumbentId).guardAssignment).toBeUndefined();
    expect(person(acted, incumbentId).locationId).toBe(postId);
    expect(person(ordinaryHit, witnessId).qiProgress - person(acted, witnessId).qiProgress).toBe(6);
    expect(person(acted, witnessId).guardAssignment).toBeUndefined();
    expect(coverage(acted)).toMatchObject({ kind: 'gap', tick: 10 });
    expect(post(acted).ownerSectId).toBe(sectId);
    expect(acted.sects.find(sect => sect.id === sectId)?.headquartersId).toBe(hqId);

    const { marked: replaced, hazardId: laterHit } = prepareHazard(genuineGap(true));
    const armedBeforeArrival = reopen(turn(replaced, { [witnessId]: gapCommand(replaced, 'cover') }));
    expect(caseAt(armedBeforeArrival)).toMatchObject({ status: 'completed', closedTick: 9 });
    const noEmergency = reopen(turn(armedBeforeArrival, { [witnessId]: waitInPlace }));
    const noCover = turn(turn(replaced, { [witnessId]: waitInPlace }), { [witnessId]: waitInPlace });
    expect(response(noEmergency)?.applied).toBeUndefined();
    expect(damageAt(noEmergency, laterHit, witnessId)).toBe(damageAt(noCover, laterHit, witnessId));
    expect(person(noEmergency, witnessId).qiProgress).toBe(person(noCover, witnessId).qiProgress);
  });

});
