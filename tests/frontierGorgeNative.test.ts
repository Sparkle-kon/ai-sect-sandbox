import {afterEach,describe,expect,it,vi} from 'vitest';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';
import {availableFrontierGorgeActions,projectFrontierGorge,resolveFrontierGorgeAction} from '../src/engine/frontierGorge';
import {frontierGorgeCommand} from '../src/engine/frontierGorgeCognition';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {frontierGorgeWeather} from '../src/engine/frontierGorgeWeather';
import {activeFrontierVisit,availableFrontierMovementActions} from '../src/engine/frontierMovementEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

const walker='elder-danxia-1',gate='frontier-north-gate',
  home='frontier-north-home',pass='frontier-north-pass',spring='frontier-north-spring';
const actor=(world:WorldState,id=walker)=>world.cultivators.find(row=>row.id===id)!;
const order=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只走实通的一步。',...fields});
const move=(targetFrontierSiteId:NonNullable<LLMDecisionPayload['targetFrontierSiteId']>)=>
  order('FRONTIER',{frontierMove:'travel',targetFrontierSiteId});
const restful=order('REST');
function month(world:WorldState,decision=restful,model=false){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===walker?decision:restful])),
    ()=>.99,model?'deferred':'utility',undefined,model?{modelActors:new Set([walker])}:undefined);
}
function base(){
  let world=prepareNorthWellHistoricalSource().world;
  world=month(world,order('GATHER_HERBS',{targetHerbId:'earth_root'}));
  world=month(world,order('FRONTIER',{frontierMove:'enter',targetFrontierSiteId:gate}));
  expect(world.tick).toBe(36);
  for(const site of ['frontier-north-lee-west','frontier-north-lee-mid','frontier-north-lee-east',home] as const)
    world=month(world,move(site));
  expect(world.tick).toBe(40);
  expect(actor(world).locationId).toBe(home);
  const before=month(world),visited=month(before,move(pass));
  expect(visited.tick).toBe(42);
  expect(actor(visited).locationId).toBe(pass);
  expect(frontierGorgeWeather(visited,42)).toBeUndefined();
  return {windward:month(visited),leeward:month(month(before))};
}

describe('real gale thresholds on one exposed native north ridge edge',()=>{
  it('closes only the headwind direction of the same actual edge and keeps previous calm crossings legal',()=>{
    const {windward,leeward}=base();
    expect(windward.tick).toBe(43);
    expect(leeward.tick).toBe(43);
    expect(actor(windward).locationId).toBe(pass);
    expect(actor(leeward).locationId).toBe(home);
    expect(frontierGorgeWeather(windward,44)).toEqual({kind:'罡风',intensity:.25,bearing:'west'});
    expect(frontierGorgeWeather(leeward,44)).toEqual(frontierGorgeWeather(windward,44));
    expect(availableFrontierMovementActions(actor(windward),windward,44).some(row=>row.targetFrontierSiteId===home)).toBe(false);
    expect(availableFrontierMovementActions(actor(leeward),leeward,44).some(row=>row.targetFrontierSiteId===pass)).toBe(true);
    expect(actor(month(windward,move(home))).locationId).toBe(pass);
    expect(actor(month(leeward,move(pass))).locationId).toBe(pass);
    expect(projectFrontierGorge(leeward,actor(leeward))).toBeUndefined();
  });

  it('waits without movement or takes exactly one native alternate step, and never marks an unwalked route',()=>{
    const {windward}=base(),bytes=encodeEraWorldSave(windward);
    const choices=availableFrontierGorgeActions(actor(windward),windward);
    expect(choices.map(row=>row.frontierGorgeMove)).toEqual(['detour','wait']);
    expect(projectFrontierGorge(windward,actor(windward))?.crossing).toBeUndefined();
    expect(projectFrontierGorge(windward,actor(windward))?.weather).toBeUndefined();
    expect(projectFrontierGorge(windward,actor(windward,'npc-1'))).toBeUndefined();
    expect(availableFrontierGorgeActions({...actor(windward)},windward)).toEqual([]);
    const acted=(frontierGorgeMove:'wait'|'detour',targetFrontierSiteId:NonNullable<LLMDecisionPayload['targetFrontierSiteId']>)=>
      month(windward,order('FRONTIER_GORGE',{frontierGorgeMove,targetFrontierSiteId}));
    const wait=acted('wait',pass),detour=acted('detour',spring);
    const waiting=month(windward);
    const repeat=order('FRONTIER_GORGE',{frontierGorgeMove:'wait',targetFrontierSiteId:pass});
    expect(resolveFrontierGorgeAction(waiting,actor(waiting),repeat)).not.toBeNull();
    expect(resolveFrontierGorgeAction(waiting,actor(waiting),repeat)).toBeNull();
    expect(wait.tick).toBe(44);
    expect(activeFrontierVisit(wait,walker)?.steps).toEqual(activeFrontierVisit(windward,walker)?.steps);
    expect(projectFrontierGorge(wait,actor(wait))).toMatchObject({receipt:{title:'在峡边等风'},options:[]});
    expect(projectFrontierGorge(wait,actor(wait))?.crossing).toBeUndefined();
    expect(actor(detour).locationId).toBe(spring);
    expect(activeFrontierVisit(detour,walker)?.steps.at(-1)).toEqual({tick:44,siteId:spring});
    expect(activeFrontierVisit(detour,walker)?.steps.length).toBe(activeFrontierVisit(windward,walker)!.steps.length+1);
    expect(projectFrontierGorge(detour,actor(detour))).toMatchObject({receipt:{title:'绕过这一道风口'},
      crossing:{chartId:'chart-north-snow',fromTileId:pass,toTileId:spring}});
    const forged=structuredClone(detour);
    const raw=forged.events.find(row=>row.id===`evt-frontier-movement-${activeFrontierVisit(detour,walker)!.id}-travel-44`)!;
    forged.events.push({...raw});
    expect(projectFrontierGorge(forged,actor(forged))?.crossing).toBeUndefined();
    expect(projectFrontierGorge(month(detour),actor(detour))?.crossing).toBeUndefined();
    expect(encodeEraWorldSave(decodeEraWorldSave(encodeEraWorldSave(detour)))).toBe(encodeEraWorldSave(detour));
    expect(encodeEraWorldSave(windward)).toBe(bytes);
  });
  it('keeps strict Cognitive and trusted Utility on the same one-step detour without accepting an authored route',async()=>{
    const {windward}=base();
    const detour=availableFrontierGorgeActions(actor(windward),windward).find(row=>row.frontierGorgeMove==='detour')!;
    const exact=frontierGorgeCommand(detour);
    const ask=(value:object)=>{
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}))));
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(actor(windward),windward,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'fixture',model:'fixture'},windward.tick+1);
    };
    expect(await ask({...exact,targetFrontierSiteId:home})).toBeUndefined();
    expect(await ask({...exact,route:[pass,home]})).toBeUndefined();
    const selected=await ask(exact);
    expect(selected).toMatchObject(exact);
    const cognitive=month(windward,selected!,true);
    const rest=Object.fromEntries(windward.cultivators.filter(row=>row.id!==walker).map(row=>[row.id,restful]));
    const utility=advanceWorldTick(windward,rest,()=>.99);
    expect(actor(cognitive).locationId).toBe(spring);
    expect(activeFrontierVisit(cognitive,walker)?.steps).toEqual(activeFrontierVisit(utility,walker)?.steps);
    expect(projectFrontierGorge(cognitive,actor(cognitive))?.crossing).toEqual(projectFrontierGorge(utility,actor(utility))?.crossing);
  });

});
