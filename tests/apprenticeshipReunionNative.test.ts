import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {availableApprenticeshipReunionActions,projectApprenticeshipReunion} from '../src/engine/apprenticeshipReunion';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import type {ApprenticeshipReunionMove} from '../src/types/apprenticeshipReunion';
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
const teacher='npc-1',student='npc-2',original='loc-taixu',market='loc-market';
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const order=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'由本人决定。',...fields});
function turn(world:WorldState,choices:Record<string,LLMDecisionPayload>={},model?:string){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,choices[row.id]??order('REST')])),()=>.99,
    model?'deferred':'utility',undefined,model?{modelActors:new Set([model])}:undefined);
}
function choose(world:WorldState,id:string,move:ApprenticeshipReunionMove){
  const menu=availableApprenticeshipReunionActions(actor(world,id),world);
  const quote=menu.find(row=>row.apprenticeshipReunionMove===move&&
    (move!=='ask'||row.targetCultivatorId===teacher));
  expect(quote).toBeDefined();
  return order(quote!.action,{apprenticeshipReunionMove:move,
    ...(quote!.targetApprenticeshipReunionId?{targetApprenticeshipReunionId:quote!.targetApprenticeshipReunionId}:{}),
    ...(quote!.targetCultivatorId?{targetCultivatorId:quote!.targetCultivatorId}:{})});
}
function opening(){
  let world=createInitialWorld(13071,'classic');
  world=turn(world,{[student]:order('EXPLORE',{targetLocationId:original})});
  while(world.tick<12)world=turn(world,{[teacher]:order('CULTIVATE')});
  return turn(world,{[student]:choose(world,student,'ask')});
}
function reunion(world=opening()){
  const declined=turn(world,{[teacher]:choose(world,teacher,'refuse')});
  expect(declined.apprenticeshipReunions?.cases[0].refusedTick).toBe(14);
  expect(declined.mentorship.offers).toHaveLength(0);
  const departure=turn(declined,{[student]:order('EXPLORE',{targetLocationId:market})});
  const physical=turn(departure,{[teacher]:order('EXPLORE',{targetLocationId:market})});
  expect(physical.apprenticeshipReunions?.cases[0]).toMatchObject({departure:{tick:15,actorId:student,toSiteId:market},
    reunion:{tick:16,actorId:teacher,siteId:market}});
  expect(availableApprenticeshipReunionActions(actor(physical,teacher),physical).some(row=>row.apprenticeshipReunionMove==='teach')).toBe(false);
  const quiet=turn(physical,{[student]:order('SOCIALIZE',{targetCultivatorId:teacher})});
  expect(quiet.apprenticeshipReunions?.cases[0].quiet).toEqual({tick:17,eventId:'evt-17-npc-2-social'});
  return decodeEraWorldSave(encodeEraWorldSave(quiet));
}
describe('actual separate requests, refusal, travels, and quiet reunion',()=>{
  it('does not equate silence with refusal; after real reunion, accepts a genuine taught technique in a separate turn',async()=>{
    const asked=opening(),ignored=turn(turn(asked));
    expect(ignored.apprenticeshipReunions?.cases[0].refusedTick).toBeUndefined();
    expect(projectApprenticeshipReunion(asked,actor(asked,'npc-8'))?.receipt).toBeUndefined();
    const exact=choose(asked,teacher,'refuse'),{innerMonologue:_,...command}=exact;
    const ask=(body:object)=>{
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(body)}}]}))));
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(actor(asked,teacher),asked,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'fixture',model:'fixture'},14);
    };
    expect(await ask({...command,targetApprenticeshipReunionId:'invented-student'})).toBeUndefined();
    expect(await ask({...command,publicHumiliation:true})).toBeUndefined();
    const admitted=await ask(command);
    expect(admitted).toMatchObject(command);
    expect(turn(asked,{[teacher]:admitted!},teacher).apprenticeshipReunions).toEqual(turn(asked,{[teacher]:exact}).apprenticeshipReunions);
    expect(projectApprenticeshipReunion(asked,actor(asked,student))?.past).toBeUndefined();
    const together=reunion(asked),taught=turn(together,{[teacher]:choose(together,teacher,'teach')});
    expect(projectApprenticeshipReunion(together,actor(together,teacher))?.past?.title).toContain('亲口谢绝');
    expect(projectApprenticeshipReunion(together,actor(together,'npc-8'))?.past).toBeUndefined();
    expect(taught.mentorship.offers[0]).toMatchObject({mentorId:teacher,studentId:student,status:'pending'});
    const learned=turn(taught,{[student]:choose(taught,student,'accept_teaching')});
    expect(learned.mentorship.offers[0]).toMatchObject({status:'accepted'});
    expect(learned.mentorship.lineage.find(row=>row.studentId===student)).toMatchObject({mentorId:teacher,lessons:1});
    expect(decodeEraWorldSave(encodeEraWorldSave(learned)).apprenticeshipReunions).toEqual(learned.apprenticeshipReunions);
  });
  it('never publishes a proposed or one-sided exercise; only both paid actual practice reaches the public record',()=>{
    const source=reunion(),offer=turn(source,{[student]:choose(source,student,'public_spar')});
    expect(offer.events.some(e=>e.id.endsWith('-reunion-public-practice'))).toBe(false);
    const consented=turn(offer,{[teacher]:choose(offer,teacher,'accept_spar')});
    const targetSparringId=consented.sparring.agreements[0].id;
    const ready=order('SPARRING',{sparringMove:'ready',targetSparringId});
    const solo=turn(consented,{[student]:ready,[teacher]:order('SPARRING',{sparringMove:'yield',targetSparringId})});
    expect(solo.events.some(e=>e.id.endsWith('-reunion-public-practice'))).toBe(false);
    const done=turn(consented,{[student]:ready,[teacher]:ready});
    expect(done.sparring.agreements[0]).toMatchObject({status:'completed',rounds:[{members:[
      {actorId:student,qiSpent:3},{actorId:teacher,qiSpent:3},
    ]}]});
    expect(done.events.filter(e=>e.id.endsWith('-reunion-public-practice'))).toEqual([
      expect.objectContaining({actorIds:[student,teacher],locationId:market,title:'两人确实完成一轮友好切磋'}),
    ]);
    expect(done.events.find(e=>e.id.endsWith('-reunion-public-practice'))?.witnessScope).toBeUndefined();
    expect(decodeEraWorldSave(encodeEraWorldSave(done)).apprenticeshipReunions).toEqual(done.apprenticeshipReunions);
    const parted=turn(source,{[student]:choose(source,student,'part')});
    expect(parted.sparring.agreements).toHaveLength(0);
    expect(parted.mentorship.lineage).toHaveLength(0);
    expect(parted.apprenticeshipReunions?.cases[0].farewell).toEqual({actorId:student,tick:18});
    expect(actor(parted,teacher).locationId).toBe(market);
  });
});
