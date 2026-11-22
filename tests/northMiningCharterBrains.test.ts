import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {AVATAR_ORDER_COST,possessAvatar,queueAvatarNorthMiningCharter} from '../src/engine/avatarEngine';
import {computeHeuristicDecision,requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {availableNorthMiningCharterActions,type NorthMiningOption} from '../src/engine/northMiningCharterEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import type {LLMConfig,LLMDecisionPayload,WorldState} from '../src/types/world';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'mock-north-mining'};
const north='loc-vein-north';
const sponsorId='elder-danxia-1';
const minerId='npc-6';
const setId='village-loc-vein-north';
const villagerId='recruit-village-loc-vein-north-vol-1';
const actor=(world:WorldState,actorId:string)=>world.cultivators.find(row=>row.id===actorId)!;
const wallet=(world:WorldState)=>world.sects.find(row=>row.id===actor(world,sponsorId).sectId)!.spiritStones;
const action=(chosenAction:LLMDecisionPayload['chosenAction'],extra:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'在井边按自己有权核验的采契选择办理。',...extra});
const payload=(option:NorthMiningOption)=>{const {action:chosenAction,...fields}=option;return action(chosenAction,fields);};
const turn=(world:WorldState,orders:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,Object.fromEntries(
  world.cultivators.map(row=>[row.id,Object.hasOwn(orders,row.id)?orders[row.id]:action('REST')])),()=>.99,'utility');

function arrive(world:WorldState,actorId:string){
  const person=actor(world,actorId),known=knownMapLocations(world,person);
  if(person.locationId===north)return;
  if(known.some(row=>row.id===north))applyCultivatorBrainDecision(world,person,action('EXPLORE',{targetLocationId:north}),()=>.99);
  else {
    const unknown=world.locations.filter(row=>row.id!==person.locationId&&!known.includes(row));
    const candidates=unknown.length?unknown:world.locations.filter(row=>row.id!==person.locationId);
    const index=candidates.findIndex(row=>row.id===north);
    expect(index).toBeGreaterThanOrEqual(0);
    let count=0;
    applyCultivatorBrainDecision(world,person,action('EXPLORE'),()=>count++===0?(index+.2)/candidates.length:.99);
  }
  expect(person.locationId).toBe(north);
}

function preparedEvidence(){
  let world=createInitialWorld(725,'spirit-bloom');
  arrive(world,sponsorId);
  const advance=(order:LLMDecisionPayload)=>{world=turn(world,{[sponsorId]:order});};
  advance(action('GATHER_HERBS',{targetHerbId:'earth_root'}));
  advance(action('VILLAGE_WORKS',{targetSettlementId:setId,villageWorkKind:'well'}));
  advance(action('GATHER_HERBS',{targetHerbId:'jade_leaf'}));
  advance(action('SEED_CULTURE',{seedMove:'reserve',targetLocationId:north}));
  const lot=world.seedCulture.lots.find(row=>row.ownerId===sponsorId)!;
  advance(action('SEED_CULTURE',{seedMove:'test',targetSeedLotId:lot.id}));
  advance(action('SEED_CULTURE',{seedMove:'plant',targetSeedLotId:lot.id}));
  advance(action('WATER_VEIN',{waterVeinMove:'open',targetLocationId:north}));
  advance(action('REST'));advance(action('REST'));
  expect(world.tick).toBe(10);
  expect(world.seedCulture.plots[0]?.weather.some(row=>row.waterDeficit===3)).toBe(true);
  arrive(world,minerId);
  world=turn(world,{
    [minerId]:action('WATER_VEIN',{waterVeinMove:'mine',targetLocationId:north}),
    [sponsorId]:action('RECRUIT_SETTLER',{targetSettlementId:setId,targetVolunteerId:'village-loc-vein-north-vol-1'}),
  });
  expect(world.coldWaterVein?.mining.some(row=>row.actorId===minerId)).toBe(true);
  expect(world.households.members.some(row=>row.recruitedId===villagerId&&row.status==='recruited')).toBe(true);
  arrive(world,villagerId);
  return world;
}

function firstIntent(world:WorldState) {
  for(const id of [villagerId,minerId,sponsorId]){
    const proposal=availableNorthMiningCharterActions(actor(world,id),world,world.tick+1).find(row=>row.northMiningMove==='propose');
    if(proposal)return {id,proposal};
  }
  throw Error('Native water/field/mine and actual three roles did not yield a proposal.');
}

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
describe('local charter consent in both brains and avatar execution',()=>{
  it('advertises only the native exact role choices; accepts neither fabricated facts nor possessed-body provider signatures',async()=>{
    const world=preparedEvidence(),{id,proposal}=firstIntent(world),holder=actor(world,id),remote=actor(world,'npc-1');
    expect(availableNorthMiningCharterActions(remote,world,world.tick+1)).toEqual([]);
    let content:object=payload(proposal);
    const transport=vi.fn(async (_url:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({
      choices:[{message:{content:JSON.stringify(content)}}]
    })));
    vi.stubGlobal('fetch',transport);
    const consult=async(person=holder)=>{
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(person,world,config,world.tick+1);
    };
    const proposalDecision=await consult();
    expect(proposalDecision).toEqual(payload(proposal));
    expect(String(transport.mock.calls.at(-1)?.[1]?.body)).toContain('北脉采契只复制本人的现场许可');
    expect(await consult(remote)).toBeUndefined();
    expect(String(transport.mock.calls.at(-1)?.[1]?.body)).not.toContain('北脉采契只复制本人的现场许可');
    for(const extra of [{northMiningMove:'sign'},{role:'sect'},{paidStones:0},{route:['tile-11-10']},
      {targetLocationId:north},{targetNorthMiningCharterId:'charter-forged'}]){
      content={...payload(proposal),...extra};
      expect(await consult()).toBeUndefined();
    }
    const withoutPossession=turn(world,{[id]:proposalDecision!});
    const signing=availableNorthMiningCharterActions(actor(withoutPossession,villagerId),withoutPossession,withoutPossession.tick+1)
      .find(row=>row.northMiningMove==='sign');
    expect(signing).toBeDefined();
    expect(wallet(withoutPossession)).toBe(wallet(turn(world)));
    content=payload(signing!);
    llmScheduler.resetTickBudget();
    const nativeSign=await requestCultivatorLLMDecision(actor(withoutPossession,villagerId),withoutPossession,config,withoutPossession.tick+1);
    expect(nativeSign).toEqual(payload(signing!));
    const signed=turn(withoutPossession,{[villagerId]:nativeSign!});
    expect(signed.northMiningCharters?.charters[0]?.signatures).toMatchObject([{role:'household',actorId:villagerId}]);
    expect(signed.northMiningCharters?.charters[0]?.status).toBe('proposed');
    expect(possessAvatar(world,id)).toBe(true);
    content=payload(proposal);
    expect(await consult()).toBeUndefined();
    expect(computeHeuristicDecision(holder,world,()=>.99).chosenAction).not.toBe('NORTH_MINING_CHARTER');
    const unsolicited=turn(world,{[id]:payload(proposal)});
    expect(availableNorthMiningCharterActions(actor(unsolicited,villagerId),unsolicited,unsolicited.tick+1)
      .some(row=>row.northMiningMove==='sign')).toBe(false);
  });

  it('a pure queue does not propose or sign; its saved exact avatar intent is consumed next month, but fails after losing physical access',()=>{
    const world=preparedEvidence(),{id,proposal}=firstIntent(world);
    expect(possessAvatar(world,id)).toBe(true);
    const activeWallet=wallet(world),essence=world.playerAvatar.essence;
    expect(queueAvatarNorthMiningCharter(world,id,proposal)).toBe(true);
    expect(queueAvatarNorthMiningCharter(world,id,proposal)).toBe(false);
    expect(wallet(world)).toBe(activeWallet);
    expect(world.playerAvatar.essence).toBe(essence-AVATAR_ORDER_COST);
    expect(availableNorthMiningCharterActions(actor(world,villagerId),world,world.tick+1)
      .some(row=>row.northMiningMove==='sign')).toBe(false);
    const restored=decodeWorldSave(encodeWorldSave(world));
    expect(restored.playerAvatar.pendingOrder).toMatchObject({actorId:id,...proposal});
    const forged=structuredClone(restored);
    Object.assign(forged.playerAvatar.pendingOrder!,{northMiningMove:'sign',targetNorthMiningCharterId:'invented'});
    expect(()=>encodeWorldSave(forged)).toThrow();
    const lost=structuredClone(restored);actor(lost,id).locationId='loc-danxia';
    const unspend=turn(lost);
    expect(unspend.playerAvatar.pendingOrder).toBeUndefined();
    expect(wallet(unspend)).toBe(wallet(turn({...lost,playerAvatar:{...lost.playerAvatar,pendingOrder:undefined}})));
    expect(availableNorthMiningCharterActions(actor(unspend,villagerId),unspend,unspend.tick+1)
      .some(row=>row.northMiningMove==='sign')).toBe(false);
    const proposed=turn(restored);
    const holder=actor(proposed,villagerId);
    const sign=availableNorthMiningCharterActions(holder,proposed,proposed.tick+1).find(row=>row.northMiningMove==='sign');
    expect(sign).toBeDefined();
    expect(proposed.playerAvatar.possessedId).toBe(holder.id);
    const implicit=turn(proposed,{[holder.id]:payload(sign!)});
    expect(implicit.northMiningCharters?.charters[0]?.signatures).toEqual([]);
    expect(queueAvatarNorthMiningCharter(proposed,holder.id,sign!)).toBe(true);
    expect(proposed.northMiningCharters?.charters[0]?.signatures).toEqual([]);
    const authed=turn(proposed);
    expect(authed.northMiningCharters?.charters[0]?.signatures).toMatchObject([{role:'household',actorId:holder.id}]);
  });
});
