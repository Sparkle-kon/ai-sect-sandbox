import {describe,expect,it,vi} from 'vitest';
import {projectDungeonBoard} from '../src/components/dungeonBoardModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {resolveGuidedDungeonTurn} from '../src/controllers/guidedDungeonTurn';
import {availableDungeonMoves} from '../src/engine/expeditionDungeonEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';
import {actualNativeDungeonGate,dungeonActor,dungeonCompanion,dungeonExplorer,dungeonMonth,dungeonMove,
  dungeonOccasion,dungeonOccasionIn,dungeonOrder,dungeonOrigin,dungeonOutsider,enterNativeDungeon} from './expeditionDungeonNativeFixture';

const body=(world:WorldState,id=dungeonExplorer)=>dungeonActor(world,id);
const history=(world:WorldState,viewer?:Cultivator,historical=false,occasionId=dungeonOccasion)=>
  projectDungeonBoard(world,createTerrainMapView(world,viewer,!!viewer),occasionId,{viewer,historical});
const map=(world:WorldState,id=dungeonExplorer)=>history(world,body(world,id));
const onlyRest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在亲至的房间守候。'};
const quiet=(world:WorldState):Record<string,LLMDecisionPayload>=>Object.fromEntries(world.cultivators.map(row=>[row.id,onlyRest]));
function strict(world:WorldState){
  const bytes=encodeEraWorldSave(world),copy=decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(copy)).toBe(bytes);
  return copy;
}
async function reply(world:WorldState,actor:Cultivator,response:object){
  llmScheduler.resetTickBudget();
  const fetch=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]})));
  vi.stubGlobal('fetch',fetch);
  try{
    const result=await requestCultivatorLLMDecision(actor,world,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
      apiKey:'fixture-only',model:'fixture'},world.tick+1);
    expect(fetch).toHaveBeenCalledTimes(1);
    return result;
  }finally{vi.unstubAllGlobals();llmScheduler.resetTickBudget();}
}
const states=(value:ReturnType<typeof projectDungeonBoard>)=>value?.rooms.map(({id,state})=>[id,state]);
const types=(value:ReturnType<typeof projectDungeonBoard>)=>value?.options.map(row=>row.dungeonMove);
function defeat(start:WorldState){
  let current=start;
  for(let i=0;i<4&&dungeonOccasionIn(current).dungeon!.bossHp>0;i++)current=dungeonMove(current,'strike','sanctum');
  expect(dungeonOccasionIn(current).dungeon!.bossHp).toBe(0);
  return current;
}

describe('native dungeon board is a witnessed room map, not another simulation',()=>{
  it('shows only an entrance to a genuinely invited candidate, then the actual garden and hall after verified physical steps',()=>{
    const {opening,enrolled,entered}=actualNativeDungeonGate();
    expect(map(opening)).toBeUndefined();
    expect(map(enrolled)).toBeUndefined();
    expect(body(entered).locationId).toBe(dungeonOccasionIn(entered).locationId);
    const eligible=map(entered)!;
    expect(eligible).toMatchObject({entrance:true,steps:[],members:[]});
    expect(types(eligible)).toEqual(['enter']);
    expect(eligible.at).toBeUndefined();expect(eligible.actor).toBeUndefined();
    expect(eligible.boss).toBeUndefined();expect(eligible.treasure).toBeUndefined();
    expect(eligible.rooms.filter(row=>row.id!=='garden').every(row=>row.state==='hidden'&&row.label===undefined)).toBe(true);
    expect(map(entered,dungeonOutsider)).toBeUndefined();
    expect(history(entered,undefined)).toBeUndefined();
    expect(history(entered,{...body(entered)})).toBeUndefined();
    const garden=strict(dungeonMove(entered,'enter','garden'));
    const now=map(garden)!;
    expect(states(now)).toEqual([['garden','current'],['hall','hidden'],['sanctum','hidden']]);
    expect(now).toMatchObject({at:'garden',actor:{id:dungeonExplorer},steps:[{move:'enter'}]});
    expect(types(now)).toEqual(['gather','retreat']);
    const priorStock=body(garden).herbs.jade_leaf;
    const hall=dungeonMove(garden,'gather','garden');
    expect(body(hall).herbs.jade_leaf-priorStock).toBe(1);
    const reached=map(hall)!;
    expect(states(reached)).toEqual([['garden','visited'],['hall','current'],['sanctum','hidden']]);
    expect(reached).toMatchObject({at:'hall',actor:{id:dungeonExplorer}});
    expect(types(reached)).toEqual(['break_array','retreat']);
    expect(reached.boss).toBeUndefined();expect(reached.treasure).toBeUndefined();
    expect(reached.rooms.find(row=>row.id==='sanctum')?.label).toBeUndefined();
    const hiddenEvent={...hall,events:hall.events.map(row=>row.id===dungeonOccasionIn(hall).dungeon?.steps.at(-1)?.eventId?
      {...row,actorIds:[dungeonOutsider]}:row)};
    const denied=map(hiddenEvent);
    expect(denied?.at).not.toBe('hall');
    expect(denied?.steps.some(row=>row.move==='gather')??false).toBe(false);
    expect(history(hall,body(hall),false,'occasion-made-up')).toBeUndefined();
  });

  it('tracks real array debit, actual boss strikes, single exact chest receipt and real exit without fabricating loot',()=>{
    const {world:garden}=enterNativeDungeon();
    const raw=encodeEraWorldSave(garden);
    const hall=dungeonMove(garden,'gather','garden'),sanctum=strict(dungeonMove(hall,'break_array','hall'));
    const paid=dungeonOccasionIn(sanctum).dungeon!.steps.at(-1)!;
    expect(paid).toMatchObject({move:'break_array',qiPaid:18,tick:sanctum.tick});
    expect(body(hall).qiProgress-body(sanctum).qiProgress).toBe(18);
    const open=map(sanctum)!;
    expect(states(open)).toEqual([['garden','visited'],['hall','visited'],['sanctum','current']]);
    expect(open).toMatchObject({at:'sanctum',actor:{id:dungeonExplorer},boss:{hp:100,maxHp:100},treasure:'sealed'});
    expect(types(open)).toEqual(['strike','retreat']);
    const one=dungeonMove(sanctum,'strike','sanctum');
    const hit=dungeonOccasionIn(one).dungeon!.steps.at(-1)!;
    expect(hit).toMatchObject({move:'strike',bossBefore:100,bossAfter:expect.any(Number)});
    if(hit.move!=='strike')throw new Error('Missing exact native strike receipt');
    expect(hit.bossAfter).toBeLessThan(hit.bossBefore);
    expect(map(one)?.boss).toEqual({hp:hit.bossAfter,maxHp:100});
    expect(map(one)?.treasure).toBe('sealed');
    const paused=dungeonMonth(one);
    expect(paused.tick).toBe(one.tick+1);
    expect(dungeonOccasionIn(paused).dungeon!.steps).toEqual(dungeonOccasionIn(one).dungeon!.steps);
    expect(map(paused)).toMatchObject({at:'sanctum',boss:{hp:hit.bossAfter,maxHp:100},treasure:'sealed'});
    const won=defeat(one),before=body(won).spiritStones;
    expect(map(won)).toMatchObject({boss:{hp:0,maxHp:100},treasure:'claimable'});
    expect(types(map(won))).toEqual(['claim','retreat']);
    expect(dungeonOccasionIn(won).dungeon!.steps.some(row=>row.move==='claim')).toBe(false);
    const got=strict(dungeonMove(won,'claim','sanctum'));
    const claim=dungeonOccasionIn(got).dungeon!.steps.at(-1)!;
    expect(claim).toMatchObject({move:'claim',stones:80,tick:got.tick});
    if(claim.move!=='claim')throw new Error('Missing real native treasure');
    expect(body(got).spiritStones-before).toBe(claim.stones);
    expect(body(got).artifacts.filter(row=>row.id===claim.artifactId)).toHaveLength(1);
    expect(map(got)?.treasure).toBe('claimed');
    expect(types(map(got))).toEqual(['retreat']);
    const noProvenClaim={...got,events:[...got.events,...got.events.filter(row=>row.id===claim.eventId)]};
    const ambiguous=map(noProvenClaim);
    expect(ambiguous?.treasure).not.toBe('claimed');
    expect(ambiguous?.treasure).not.toBe('claimable');
    expect(types(ambiguous)??[]).not.toContain('claim');
    const escaped=strict(dungeonMove(got,'retreat','sanctum'));
    expect(body(escaped).locationId).toBe(dungeonOrigin);
    const terminal=map(escaped)!;
    expect(terminal).toMatchObject({outcome:'claimed',options:[]});
    expect(terminal.actor).toBeUndefined();
    expect(terminal.at).toBeUndefined();
    expect(terminal.boss).toBeUndefined();
    expect(states(terminal)).toEqual([['garden','visited'],['hall','visited'],['sanctum','visited']]);
    const impossible=dungeonMove(escaped,'claim','sanctum');
    expect(dungeonOccasionIn(impossible).dungeon?.steps.filter(row=>row.move==='claim')).toEqual([claim]);
    expect(body(impossible).artifacts.filter(row=>row.id===claim.artifactId)).toHaveLength(1);
    expect(encodeEraWorldSave(garden)).toBe(raw);
  });

  it('clips later private rooms and loot for a native earlier withdrawn companion, even after reopening',()=>{
    const {entered}=actualNativeDungeonGate(true);
    const opening=dungeonMove(entered,'enter','garden');
    const candidate=map(opening,dungeonCompanion)!;
    expect(candidate).toMatchObject({entrance:true,steps:[],members:[]});
    expect(candidate.actor).toBeUndefined();
    expect(candidate.at).toBeUndefined();
    expect(types(candidate)).toEqual(['enter']);
    const joined=dungeonMove(opening,'enter','garden',dungeonCompanion);
    expect(map(joined,dungeonCompanion)).toMatchObject({at:'garden',actor:{id:dungeonCompanion}});
    const split=dungeonMonth(joined,{[dungeonCompanion]:dungeonOrder('retreat','garden'),
      [dungeonExplorer]:dungeonOrder('gather','garden')});
    const authentic=dungeonOccasionIn(split).dungeon!;
    expect(authentic.members.find(row=>row.actorId===dungeonCompanion)).toMatchObject({
      leftTick:split.tick,exit:'retreated',
    });
    expect(body(split,dungeonCompanion).locationId).toBe(dungeonOrigin);
    expect(authentic.steps.find(row=>row.move==='gather')).toMatchObject({tick:split.tick,actorId:dungeonExplorer});
    const next=authentic.steps.find(row=>row.move==='gather')!;
    expect(split.events.find(row=>row.id===next.eventId)?.actorIds).toEqual([dungeonExplorer]);
    const sanctum=dungeonMove(split,'break_array','hall');
    const claim=dungeonMove(defeat(sanctum),'claim','sanctum');
    const deeper=dungeonOccasionIn(claim).dungeon!;
    expect(deeper.steps.at(-1)).toMatchObject({move:'claim',stones:80});
    expect(map(claim)?.treasure).toBe('claimed');
    const recovered=strict(claim);
    const old=history(recovered,body(recovered,dungeonCompanion),true)!;
    expect(old.historical).toBe(true);
    expect(states(old)).toEqual([['garden','visited'],['hall','hidden'],['sanctum','hidden']]);
    expect(old.rooms.filter(row=>row.state==='hidden').every(row=>row.label===undefined)).toBe(true);
    expect(old.at).toBeUndefined();expect(old.actor).toBeUndefined();
    expect(old.boss).toBeUndefined();expect(old.treasure).toBeUndefined();
    expect(old.options).toEqual([]);
    expect(old.steps.every(row=>row.tick<=split.tick&&row.move!=='gather'&&row.move!=='claim'&&row.move!=='strike')).toBe(true);
    const replicatedWitness={...recovered,events:recovered.events.map(event=>event.id===next.eventId?
      {...event,actorIds:[...event.actorIds,dungeonCompanion]}:event)};
    const spliced=history(replicatedWitness,body(replicatedWitness,dungeonCompanion),true);
    expect(spliced?.rooms.find(room=>room.id==='hall')?.label).toBeUndefined();
    expect(spliced?.steps.some(step=>step.eventId===next.eventId)??false).toBe(false);
    expect(history(recovered,body(recovered,dungeonOutsider),true)).toBeUndefined();
  });

  it('keeps the typed board identical through validated Cognitive or Utility, denying wrong room and branch requests',async()=>{
    const {world:garden}=enterNativeDungeon();
    const actor=body(garden),available=availableDungeonMoves(garden,actor,garden.tick+1);
    const choice=available.find(row=>row.dungeonMove==='gather')!;
    const {action,...fields}=choice;
    const wire={chosenAction:action,...fields};
    expect(await reply(garden,actor,{...wire,targetDungeonRoomId:'sanctum'})).toBeUndefined();
    expect(await reply(garden,actor,{...wire,bossHp:0,loot:'虚构宝箱'})).toBeUndefined();
    const valid=await reply(garden,actor,wire);
    expect(valid).toMatchObject(wire);
    if(!valid)throw new Error('Exact native paid gather must be admitted');
    const request={world:garden,branchId:'main',revision:3,actorId:actor.id,option:choice};
    expect(resolveGuidedDungeonTurn(request,garden,'sibling',3)).toBeUndefined();
    expect(resolveGuidedDungeonTurn(request,garden,'main',4)).toBeUndefined();
    expect(resolveGuidedDungeonTurn(request,structuredClone(garden),'main',3)).toBeUndefined();
    expect(resolveGuidedDungeonTurn({...request,actorId:dungeonOutsider},garden,'main',3)).toBeUndefined();
    const guided=resolveGuidedDungeonTurn(request,garden,'main',3)!;
    const basic=dungeonMonth(garden,{[actor.id]:guided.decision});
    const online=advanceWorldTick(garden,{...quiet(garden),[actor.id]:valid},()=>.99,'utility',undefined,{modelActors:new Set([actor.id])});
    expect(map(online)).toEqual(map(basic));
    expect(map(online)).toMatchObject({at:'hall',steps:expect.arrayContaining([expect.objectContaining({move:'gather',jadeLeaf:1})])});
    const moved=structuredClone(online);
    body(moved).locationId='loc-market';
    expect(map(moved)?.at).toBeUndefined();
    expect(map(moved)?.actor).toBeUndefined();
  });
});
