import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {AVATAR_ORDER_COST,possessAvatar,queueAvatarUpperPassage} from '../src/engine/avatarEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {availableUpperPassageActions,type UpperPassageOption} from '../src/engine/upperPassageEngine';
import {WATER_VEIN_SITE} from '../src/engine/waterVeinTerms';
import {computeHeuristicDecision,requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {legalTraceCandidates} from '../src/engine/decisionTraceEngine';
import {modelDecisionCandidates} from '../src/engine/modelDecisionTurn';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {LLMConfig,LLMDecisionPayload,WorldState} from '../src/types/world';
const elderId='elder-danxia-1';
const action=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'本地实地核对。',...fields});
const water=(waterVeinMove:NonNullable<LLMDecisionPayload['waterVeinMove']>)=>
  action('WATER_VEIN',{waterVeinMove,targetLocationId:WATER_VEIN_SITE});
const actor=(world:WorldState,id=elderId)=>world.cultivators.find(row=>row.id===id)!;
const step=(world:WorldState,decision=action('REST'))=>advanceWorldTick(world,Object.fromEntries(world.cultivators.map(
  row=>[row.id,row.id===elderId?decision:action('REST')])),()=>.99,'utility');
function northFixture(seed=1){
  let world=createInitialWorld(seed,'spirit-bloom');
  const elder=actor(world), known=knownMapLocations(world,elder);
  const unknown=world.locations.filter(row=>row.id!==elder.locationId&&!known.includes(row));
  const candidates=unknown.length?unknown:world.locations.filter(row=>row.id!==elder.locationId);
  const index=candidates.findIndex(row=>row.id===WATER_VEIN_SITE);
  expect(index).toBeGreaterThanOrEqual(0);
  let draw=0;
  applyCultivatorBrainDecision(world,elder,action('EXPLORE'),()=>draw++===0?(index+.2)/candidates.length:.99);
  expect(elder.locationId).toBe(WATER_VEIN_SITE);
  const village=world.settlements.villages.find(row=>row.locationId===WATER_VEIN_SITE)!;
  world=step(world,action('GATHER_HERBS',{targetHerbId:'earth_root'}));
  expect(actor(world).herbs.earth_root).toBe(2);
  world=step(world,action('VILLAGE_WORKS',{targetSettlementId:village.id,villageWorkKind:'well'}));
  expect(world.villageWorks.projects[0]).toMatchObject({settlementId:village.id,startedTick:3,stonesSpent:32,rootsSpent:2});
  expect(actor(world).herbs.earth_root).toBe(0);
  world=step(world,action('GATHER_HERBS',{targetHerbId:'jade_leaf'}));
  world=step(world,action('SEED_CULTURE',{seedMove:'reserve',targetLocationId:WATER_VEIN_SITE}));
  expect(world.villageWorks.projects[0]).toMatchObject({status:'completed',settledTick:5,laborTotal:4,
    receipts:[{tick:4,labor:2},{tick:5,labor:2}]});
  const lot=world.seedCulture.lots[0];
  world=step(world,action('SEED_CULTURE',{seedMove:'test',targetSeedLotId:lot.id}));
  world=step(world,action('SEED_CULTURE',{seedMove:'plant',targetSeedLotId:lot.id}));
  expect(world.seedCulture.plots[0]).toMatchObject({status:'growing',plantedTick:7,maturesTick:10});
  return world;
}
const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-upper-passage'};
const payload=(row:UpperPassageOption)=>action('UPPER_PASSAGE',{
  upperPassageMove:row.upperPassageMove,targetUpperPassageNodeId:row.targetUpperPassageNodeId});
function mockModel(){
  let value:object={chosenAction:'REST'};
  const fetch=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({
    choices:[{message:{content:JSON.stringify(value)}}]
  })));
  vi.stubGlobal('fetch',fetch);
  const consult=(world:WorldState,input:object,id=elderId)=>{
    value=input;llmScheduler.resetTickBudget();
    return requestCultivatorLLMDecision(actor(world,id),world,config,world.tick+1);
  };
  return {fetch,consult,prompt:()=>String(fetch.mock.calls.at(-1)?.[1]?.body)};
}
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
describe('one body, two decision lanes, and exact consent',()=>{
  it('offers native scoped entry, sends a minimal upper-only cognitive prompt and cannot dispatch lower actions from the threshold',async()=>{
    const opened=step(northFixture(),water('open')),body=actor(opened), coins=body.spiritStones;
    const option=availableUpperPassageActions(body,opened,opened.tick+1)[0];
    expect(option).toMatchObject({upperPassageMove:'enter',targetUpperPassageNodeId:'realm-passage-lower-step'});
    const model=mockModel();
    expect(await model.consult(opened,payload(option),'elder-danxia-2')).toBeUndefined();
    expect(model.prompt()).not.toContain('只有本人现场的界路准入');
    expect(await model.consult(opened,{...payload(option),targetUpperPassageNodeId:'realm-upper-council'})).toBeUndefined();
    expect(await model.consult(opened,{...payload(option),fee:0})).toBeUndefined();
    const allowed=await model.consult(opened,payload(option));
    expect(allowed).toEqual(payload(option));
    expect(model.prompt()).toContain('只有本人现场的界路准入');
    let threshold=step(opened,allowed);
    expect(actor(threshold)).toMatchObject({id:elderId,locationId:'realm-passage-lower-step',positionPlane:'threshold',spiritStones:coins-8});
    const direct=actor(threshold);
    direct.secretGoal='lower_plane_private_scope_canary';
    const next=availableUpperPassageActions(direct,threshold,threshold.tick+1).find(row=>row.upperPassageMove==='advance')!;
    expect(next.targetUpperPassageNodeId).toBe('realm-passage-upper-step');
    expect(modelDecisionCandidates(threshold).some(row=>row.id===elderId)).toBe(true);
    expect(legalTraceCandidates(threshold,direct)).toEqual([]);
    expect(await model.consult(threshold,{chosenAction:'CULTIVATE'})).toBeUndefined();
    expect(await model.consult(threshold,{...payload(next),targetLocationId:'loc-danxia'})).toBeUndefined();
    expect(await model.consult(threshold,{chosenAction:'REST',targetCultivatorId:'npc-1'})).toBeUndefined();
    expect(await model.consult(threshold,{chosenAction:'REST'})).toMatchObject({chosenAction:'REST'});
    const order=await model.consult(threshold,payload(next));
    expect(order).toEqual(payload(next));
    expect(model.prompt()).toContain('只有这些界路选项');
    expect(model.prompt()).not.toContain('lower_plane_private_scope_canary');
    expect(model.prompt()).not.toContain('loc-danxia');
    expect(model.prompt()).not.toContain('SEED_CULTURE');
    const old={loc:direct.locationId,qi:direct.qiProgress,hp:direct.hp,stones:direct.spiritStones};
    const lower=action('EXPLORE',{targetLocationId:'loc-danxia'});
    expect(applyCultivatorBrainDecision(threshold,direct,lower,()=>.99)).toBeNull();
    expect(applyCultivatorBrainDecision(threshold,direct,action('REST'),()=>.99)).toBeNull();
    expect({loc:direct.locationId,qi:direct.qiProgress,hp:direct.hp,stones:direct.spiritStones}).toEqual(old);
    threshold=step(threshold,order);
    expect(actor(threshold).locationId).toBe('realm-passage-upper-step');
    expect(computeHeuristicDecision(actor(threshold),threshold,()=>.99)).toMatchObject({chosenAction:'REST'});
    const tickAhead=step(threshold);
    expect(computeHeuristicDecision(actor(tickAhead),tickAhead,()=>.99)).toMatchObject({
      chosenAction:'UPPER_PASSAGE',upperPassageMove:'advance',targetUpperPassageNodeId:'realm-upper-gate'});
  });

  it('does not let supplied model payloads choose a held body, queues only essence, and survives a save/read before the paid step',async()=>{
    const opened=step(northFixture(),water('open')), body=actor(opened), coins=body.spiritStones;
    const entry=availableUpperPassageActions(body,opened,opened.tick+1)[0];
    expect(possessAvatar(opened,body.id)).toBe(true);
    const noIntent=step(opened,payload(entry));
    expect(actor(noIntent)).toMatchObject({locationId:WATER_VEIN_SITE,spiritStones:coins});
    expect(noIntent.upperPassage).toBeUndefined();
    const essence=opened.playerAvatar.essence;
    expect(queueAvatarUpperPassage(opened,body.id,{...entry,targetUpperPassageNodeId:'realm-upper-council'})).toBe(false);
    expect(queueAvatarUpperPassage(opened,body.id,entry)).toBe(true);
    expect(opened.playerAvatar.essence).toBe(essence-AVATAR_ORDER_COST);
    expect(body.spiritStones).toBe(coins);
    expect(opened.upperPassage).toBeUndefined();
    const restored=decodeEraWorldSave(encodeEraWorldSave(opened));
    expect(restored.playerAvatar.pendingOrder).toMatchObject({actorId:body.id,...entry});
    const threshold=step(restored);
    expect(actor(threshold)).toMatchObject({locationId:'realm-passage-lower-step',positionPlane:'threshold',spiritStones:coins-8});
    const next=availableUpperPassageActions(actor(threshold),threshold,threshold.tick+1).find(row=>row.upperPassageMove==='advance')!;
    const model=mockModel();
    expect(await model.consult(threshold,payload(next))).toBeUndefined();
    expect(model.fetch).not.toHaveBeenCalled();
    expect(modelDecisionCandidates(threshold).some(row=>row.id===elderId)).toBe(false);
    const unsolicited=step(threshold,payload(next));
    expect(actor(unsolicited).locationId).toBe('realm-passage-lower-step');
    expect(queueAvatarUpperPassage(threshold,body.id,next)).toBe(true);
    const exact=step(threshold);
    expect(actor(exact)).toMatchObject({locationId:'realm-passage-upper-step',positionPlane:'threshold',spiritStones:coins-8});
  });
});
