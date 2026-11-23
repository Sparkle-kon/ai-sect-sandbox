import {afterEach,describe,expect,it,vi} from 'vitest';
import {projectMapEntitySiteDetails} from '../src/components/mapEntitySiteDetails';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {availableVillageReunionActions,projectVillageReunion} from '../src/engine/villageReunion';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import type {VillageReunionMove} from '../src/types/villageReunion';

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
const village='village-loc-market',first=`recruit-${village}-vol-1`,second=`recruit-${village}-vol-2`;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候。'};
const move=(targetLocationId:string):LLMDecisionPayload=>({chosenAction:'EXPLORE',targetLocationId,innerMonologue:'亲自去。'});
function recruit(num:number):LLMDecisionPayload{return {chosenAction:'RECRUIT_SETTLER',targetVolunteerId:`${village}-vol-${num}`,targetSettlementId:village,innerMonologue:'本人自愿才接收。'};}
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
function turn(world:WorldState,choices:Record<string,LLMDecisionPayload>={},modelId?:string){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,choices[row.id]??rest])),()=>.99,
    modelId?'deferred':'utility',undefined,modelId?{modelActors:new Set([modelId])}:undefined);
}
function choice(world:WorldState,id:string,want:VillageReunionMove):LLMDecisionPayload{
  const quote=availableVillageReunionActions(actor(world,id),world).find(row=>row.villageReunionMove===want);
  expect(quote).toBeDefined();
  return {chosenAction:quote!.action,villageReunionMove:want,targetVillageReunionId:quote!.targetVillageReunionId,innerMonologue:'只应自己的选择。'};
}
function reunion(){
  const initial=createInitialWorld(4,'classic');
  const market=turn(initial,{'npc-1':move('loc-market'),'npc-5':move('loc-market')});
  const residents=turn(market);
  const firstJoined=turn(residents,{'npc-1':recruit(1)});
  expect(actor(firstJoined,first).spiritStones).toBe(25);
  const bothJoined=turn(firstJoined,{[first]:move('loc-market-east'),'npc-5':recruit(2)});
  expect(actor(bothJoined,second).spiritStones).toBe(25);
  const reopened=decodeEraWorldSave(encodeEraWorldSave(bothJoined));
  expect(projectVillageReunion(reopened,actor(reopened,first))).toBeUndefined();
  const together=turn(reopened,{[second]:move('loc-market-east')});
  expect(together.tick).toBe(6);
  const viewer=actor(together,first), outsider=actor(together,'npc-8'), eastern=together.locations.find(row=>row.id==='loc-market-east')!;
  expect(projectVillageReunion(together,viewer)).toMatchObject({siteId:eastern.id,siteName:'松灯坊市',receipt:{title:'坊市重遇旧时同乡'}});
  expect(projectVillageReunion(together,outsider)).toBeUndefined();
  const present=together.cultivators.filter(row=>row.alive&&row.locationId===eastern.id);
  const details=(selected:typeof viewer)=>projectMapEntitySiteDetails(together,createTerrainMapView(together,selected,false),eastern,present,selected);
  expect(details(viewer)).toContainEqual(expect.objectContaining({label:'旧村重逢'}));
  expect(details(outsider)).not.toContainEqual(expect.objectContaining({label:'旧村重逢'}));
  expect(projectVillageReunion(together,actor(together,'npc-1'))).toBeUndefined();
  return together;
}
describe('same native village, independently leading different lives',()=>{
  it('does not call two freshly registered residents old neighbors before three actual overlapping months',()=>{
    const initial=createInitialWorld(4,'classic');
    const market=turn(initial,{'npc-1':move('loc-market')});
    const early=turn(market,{'npc-1':recruit(1)});
    expect(early.tick).toBe(3);
    expect(actor(early,first).spiritStones).toBe(25);
    expect(early.villageReunions).toBeUndefined();
    expect(decodeEraWorldSave(encodeEraWorldSave(early)).villageReunions).toBeUndefined();
  });
  it('holds one actual stone until independent exact choice, with genuine provider parity and no new relationship',async()=>{
    const together=reunion(),offer=choice(together,first,'offer');
    const offered=turn(together,{[first]:offer,[second]:{...offer,villageReunionMove:'accept'}});
    expect(actor(offered,first).spiritStones).toBe(actor(together,first).spiritStones-1);
    expect(actor(offered,second).spiritStones).toBe(actor(together,second).spiritStones);
    const accept=choice(offered,second,'accept');
    const ask=(body:object)=>{
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(body)}}]}))));
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(actor(offered,second),offered,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'fixture'},offered.tick+1);
    };
    const {chosenAction,targetVillageReunionId,villageReunionMove}=accept;
    const exact={chosenAction,targetVillageReunionId,villageReunionMove};
    expect(await ask({...exact,targetVillageReunionId:'same-name-alias'})).toBeUndefined();
    expect(await ask({...exact,forgedBond:true})).toBeUndefined();
    const admitted=await ask(exact);
    expect(admitted).toMatchObject(exact);
    const cognitive=turn(offered,{[second]:admitted!},second);
    const trusted=Object.fromEntries(offered.cultivators.filter(row=>row.id!==second).map(row=>[row.id,rest]));
    const utility=advanceWorldTick(offered,trusted,()=>.99);
    expect(actor(cognitive,second).spiritStones).toBe(actor(together,second).spiritStones+1);
    expect(cognitive.villageReunions).toEqual(utility.villageReunions);
    expect(decodeEraWorldSave(encodeEraWorldSave(cognitive)).villageReunions).toEqual(cognitive.villageReunions);
    expect(cognitive.relationships.filter(row=>[first,second].every(id=>JSON.stringify(row).includes(id)))).toEqual([]);
    const eligible=actor(offered,second),copy={...eligible};
    expect(availableVillageReunionActions(copy,offered)).toEqual([]);
  });

  it('keeps own memory private and returns an ignored or declined stone to its actual owner',()=>{
    const together=reunion();
    const remembered=turn(together,{[first]:choice(together,first,'remember')});
    expect(actor(remembered,first).memories.some(row=>row.content.includes('一次意外的照面'))).toBe(true);
    expect(projectVillageReunion(remembered,actor(remembered,second))?.receipt).toBeUndefined();
    const offered=turn(together,{[first]:choice(together,first,'offer')});
    const refused=turn(offered,{[second]:choice(offered,second,'part')});
    expect(actor(refused,first).spiritStones).toBe(actor(together,first).spiritStones);
    expect(actor(refused,second).spiritStones).toBe(actor(together,second).spiritStones);
    expect(decodeEraWorldSave(encodeEraWorldSave(refused)).villageReunions).toEqual(refused.villageReunions);
    const expired=turn(turn(offered));
    expect(actor(expired,first).spiritStones).toBe(actor(together,first).spiritStones);
    expect(actor(expired,second).spiritStones).toBe(actor(together,second).spiritStones);
  });
});
