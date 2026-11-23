import {afterEach,describe,expect,it,vi} from 'vitest';
import {currentVisibleWildMigrants, visibleBeastsByLocation} from '../src/components/spiritBeastView';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {availableWildMigrationActions,isPrivateWildMigrationEvent,projectWildMigration} from '../src/engine/wildMigration';
import {wildMigrationCommand} from '../src/engine/wildMigrationCognition';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
const origin='loc-blood',destination='brush-vein-tile-20-3',refuge='brush-vein-tile-21-3',
  originActor='npc-3',destinationActor='npc-8',beastId='beast-loc-blood';
const body=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const animal=(world:WorldState)=>world.spiritBeasts.find(row=>row.id===beastId)!;
const stamp=(world:WorldState)=>world.wildMigrations?.records.find(row=>row.beastId===beastId);
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'只守当下。'};
const go=(targetLocationId:string):LLMDecisionPayload=>({chosenAction:'EXPLORE',targetLocationId,innerMonologue:'实地赴查。'});
function step(world:WorldState,set:Record<string,LLMDecisionPayload>={},roll=.99,modelActors?:ReadonlySet<string>){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,set[row.id]??rest])),()=>roll,
    modelActors?'deferred':'utility',undefined,modelActors?{modelActors}:undefined);
}
function crossed(){
  let world=applyMapBrush(createInitialWorld(1,'spirit-bloom'),'paint_vein',[{x:820,y:140}]);
  while(world.tick<16)world=step(world);
  const near=step(world,{[destinationActor]:go(destination)});
  expect(body(near,destinationActor).locationId).toBe(destination);
  expect(animal(near)).toMatchObject({locationId:origin,alive:true,kind:'凶兽'});
  expect(stamp(near)).toBeUndefined();
  const moved=step(near,{},.1);
  expect(moved.tick).toBe(18);
  expect(animal(moved)).toMatchObject({locationId:destination,alive:true,kind:'凶兽'});
  expect(stamp(moved)).toMatchObject({kind:'凶兽',tick:18,from:{siteId:origin,sectId:'sect-bloodmoon'},to:{siteId:destination,sectId:'sect-tianji'},
    sourceEventId:`evt-18-beast-roam-${beastId}`});
  return applyMapBrush(moved,'paint_vein',[{x:860,y:140}]);
}
const choice=(world:WorldState,actorId:string,wanted:'let_pass'|'track'|'drive')=>{
  const option=availableWildMigrationActions(body(world,actorId),world).find(row=>row.wildMigrationMove===wanted)!;
  expect(option).toBeDefined();
  return {...wildMigrationCommand(option),innerMonologue:'只按本人所见。'};
};

describe('one actual weather-rated migration and two independent local responses',()=>{
  it('does not expose the remote shore to origin and only drives the same living capable destination animal',()=>{
    const world=crossed(),unchanged=encodeEraWorldSave(world);
    const from=projectWildMigration(world,body(world,originActor));
    const to=projectWildMigration(world,body(world,destinationActor));
    expect(from).toMatchObject({side:'origin'});expect(from?.localKind).toBeUndefined();
    expect(JSON.stringify(from)).not.toContain(destination);
    expect(from?.options.map(row=>row.wildMigrationMove)).toEqual(['let_pass','track']);
    expect(to).toMatchObject({side:'destination',localKind:'凶兽'});
    expect(to?.options.map(row=>row.wildMigrationMove)).toEqual(['let_pass','track','drive']);
    expect(projectWildMigration(world,body(world,'npc-1'))).toBeUndefined();
    const observed=step(world,{[originActor]:choice(world,originActor,'track'),[destinationActor]:choice(world,destinationActor,'let_pass')});
    expect(animal(observed).locationId).toBe(destination);
    expect(stamp(observed)?.responses).toEqual([expect.objectContaining({side:'origin',actorId:originActor,move:'track',paidQi:0}),
      expect.objectContaining({side:'destination',actorId:destinationActor,move:'let_pass',paidQi:0})]);
    const driven=step(world,{[originActor]:choice(world,originActor,'track'),[destinationActor]:choice(world,destinationActor,'drive')});
    expect(animal(driven)).toMatchObject({id:beastId,locationId:refuge,alive:true,hp:animal(observed).hp});
    expect(animal(driven).tamedBy).toBeUndefined();
    expect(body(driven,destinationActor).qiProgress).toBe(body(observed,destinationActor).qiProgress-8);
    expect(stamp(driven)?.responses[0]).toEqual(stamp(observed)?.responses[0]);
    expect(stamp(driven)?.responses[1]).toMatchObject({side:'destination',move:'drive',paidQi:8,destinationId:refuge});
    expect(driven.events.filter(isPrivateWildMigrationEvent)).toHaveLength(2);
    expect(availableWildMigrationActions(body(driven,originActor),driven)).toEqual([]);
    expect(encodeEraWorldSave(decodeEraWorldSave(encodeEraWorldSave(driven)))).toBe(encodeEraWorldSave(driven));
    expect(encodeEraWorldSave(world)).toBe(unchanged);
  });

  it('draws the body only where the canonical observer can see it, even with map fog disabled',()=>{
    const world=crossed(), from=body(world,originActor), to=body(world,destinationActor);
    const projection=(viewer:typeof from|undefined,fog:boolean)=>{
      const map=createTerrainMapView(world,viewer,fog);
      return currentVisibleWildMigrants(world,visibleBeastsByLocation(world,map,viewer));
    };
    expect(projection(from,false).size).toBe(0);
    expect(projection(undefined,false).size).toBe(0);
    expect(projection({...to},false).size).toBe(0);
    for(const fog of [true,false]){
      const glyphs=projection(to,fog);
      expect(glyphs.get(origin)).toBeUndefined();
      expect(glyphs.get(destination)?.map(row=>row.id)).toEqual([beastId]);
      expect(glyphs.get(refuge)).toBeUndefined();
    }
  });

  it('rejects a later arrival, duplicate source, and invented model route; actual choice still reaches the native path',async()=>{
    const world=crossed(),migration=stamp(world)!;
    const duplicate=structuredClone(world);
    duplicate.events.push({...duplicate.events.find(event=>event.id===migration.sourceEventId)!});
    expect(projectWildMigration(duplicate,body(duplicate,originActor))).toBeUndefined();
    expect(projectWildMigration(duplicate,body(duplicate,destinationActor))).toBeUndefined();
    const late=step(world,{'elder-tianji-1':go(destination)});
    expect(body(late,'elder-tianji-1').locationId).toBe(destination);
    expect(projectWildMigration(late,body(late,'elder-tianji-1'))).toBeUndefined();
    const exact=availableWildMigrationActions(body(world,destinationActor),world).find(row=>row.wildMigrationMove==='drive')!;
    const command=wildMigrationCommand(exact);
    const request=(value:object)=>{
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}))));
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(body(world,destinationActor),world,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'fixture',model:'fixture'},world.tick+1);
    };
    expect(await request({...command,targetLocationId:origin})).toBeUndefined();
    expect(await request({...command,route:[destination,refuge]})).toBeUndefined();
    const selected=await request(command);
    expect(selected).toMatchObject(command);
    const next=step(world,{[destinationActor]:selected!},.99,new Set([destinationActor]));
    expect(animal(next).locationId).toBe(refuge);
    const quiet=Object.fromEntries(world.cultivators.filter(row=>row.id!==destinationActor).map(row=>[row.id,rest]));
    const utility=advanceWorldTick(world,quiet,()=>.99);
    expect(stamp(utility)?.responses).toContainEqual(expect.objectContaining({side:'destination',actorId:destinationActor,move:'let_pass',paidQi:0}));
    expect(animal(utility).locationId).toBe(destination);
  });
});
