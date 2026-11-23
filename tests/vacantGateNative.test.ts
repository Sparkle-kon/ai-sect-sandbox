import {afterEach,describe,expect,it,vi} from 'vitest';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {availableVacantGateActions,isPrivateVacantGateEvent,projectVacantGate} from '../src/engine/vacantGate';
import {vacantGateCommand} from '../src/engine/vacantGateCognition';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {actualGrandSiege,actualSiege,commander,defendSect,disciple,location,patriarch,siegeActor,siegeSect,siegeTurn} from './grandSiegeNativeFixture';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

const elder='elder-blood-1',refuge='brush-vein-tile-21-11';
function impending(){
  const {arrived}=actualGrandSiege();
  const terrain=applyMapBrush(arrived,'paint_vein',[{x:860,y:460}]);
  const lightning={type:'TRIBULATION_STRIKE',targetCultivatorId:patriarch} as const;
  const weak=executeGodIntervention(executeGodIntervention(terrain,lightning),lightning);
  expect(siegeActor(weak,patriarch).hp).toBeGreaterThan(0);
  const fallen=applyMapBrush(weak,'meteor',[{x:820,y:440}]);
  expect(siegeActor(fallen,patriarch)).toMatchObject({alive:false,hp:0,locationId:location});
  expect(siegeSect(fallen).leaderId).toBe(patriarch);
  expect(fallen.events).toContainEqual(expect.objectContaining({tick:fallen.tick,locationId:location,category:'death',
    title:'星陨降地',actorIds:expect.arrayContaining([patriarch])}));
  expect([disciple,elder].map(id=>siegeActor(fallen,id).locationId)).toEqual([location,location]);
  expect([disciple,elder].every(id=>siegeActor(fallen,id).alive)).toBe(true);
  return fallen;
}
function choose(world:WorldState,actorId:string,move:'guard'|'withdraw'):LLMDecisionPayload{
  const match=availableVacantGateActions(siegeActor(world,actorId),world).find(row=>row.vacantGateMove===move)!;
  expect(match).toBeDefined();
  return {chosenAction:match.action,innerMonologue:'只有自己作主。',targetVacantGateSiegeId:match.targetVacantGateSiegeId,
    vacantGateMove:move,...(match.targetLocationId?{targetLocationId:match.targetLocationId}:{})};
}

describe('native vacancy at an already arrived, actually fought mountain gate',()=>{
  it('charges only independent, physically eligible survivors for actual wall damage prevented and does not elect anyone',()=>{
    const source=impending(),original=encodeEraWorldSave(source);
    expect(projectVacantGate(source,siegeActor(source,disciple))).toMatchObject({lostRole:'leader'});
    expect(projectVacantGate(source,siegeActor(source,elder))).toMatchObject({lostRole:'leader'});
    expect(projectVacantGate(source,siegeActor(source,patriarch))).toBeUndefined();
    expect(projectVacantGate(source,siegeActor(source,'npc-1'))).toBeUndefined();
    // The exact unaccepted comparison consumes these actors' turns without ordinary REST healing
    // (healing would itself change measured defensive power before the round).
    const denied=(id:string)=>({...choose(source,id,'withdraw'),targetLocationId:'loc-market'});
    const ignored=siegeTurn(source,{[disciple]:denied(disciple),[elder]:denied(elder)});
    const onlyOne=siegeTurn(source,{[disciple]:choose(source,disciple,'guard'),[elder]:denied(elder)});
    const both=siegeTurn(source,{[disciple]:choose(source,disciple,'guard'),[elder]:choose(source,elder,'guard')});
    const reports=both.vacantGate?.records??[];
    expect(reports).toHaveLength(2);
    for(const id of [disciple,elder]){
      const row=reports.find(record=>record.actorId===id)!;
      expect(row).toMatchObject({move:'guard',lostActorId:patriarch,paidQi:8,roundTick:both.tick});
      expect(siegeActor(ignored,id).qiProgress-siegeActor(both,id).qiProgress).toBe(8);
      expect(actualSiege(both).theatre?.rounds[0].defenders.some(body=>body.actorId===id)).toBe(true);
    }
    expect(siegeSect(both).arrayHp-siegeSect(ignored).arrayHp).toBe(reports.reduce((sum,row)=>sum+row.wallSaved!,0));
    expect(siegeActor(ignored,elder).qiProgress).toBe(siegeActor(onlyOne,elder).qiProgress);
    expect(siegeSect(both).succession).toEqual(siegeSect(ignored).succession);
    expect(encodeEraWorldSave(decodeEraWorldSave(encodeEraWorldSave(both)))).toBe(encodeEraWorldSave(both));
    expect(encodeEraWorldSave(source)).toBe(original);
  });

  it('makes only the requesting defender retreat one true adjacent step, without attributing absence or victory to others',()=>{
    const source=impending(),order=choose(source,disciple,'withdraw');
    expect(order.targetLocationId).toBe(refuge);
    const forged=siegeTurn(source,{[disciple]:{...order,targetLocationId:'loc-market'}});
    expect(forged.vacantGate).toBeUndefined();
    const after=siegeTurn(source,{[disciple]:order,[elder]:choose(source,elder,'guard')});
    const round=actualSiege(after).theatre?.rounds[0];
    expect(siegeActor(after,disciple).locationId).toBe(refuge);
    expect(round?.defenders.some(body=>body.actorId===disciple)).toBe(false);
    expect(siegeActor(after,elder).locationId).toBe(location);
    expect(round?.defenders.some(body=>body.actorId===elder)).toBe(true);
    expect(after.events.filter(isPrivateVacantGateEvent)).toHaveLength(3);
    expect(after.events.filter(event=>event.id.endsWith('-withdraw-appeal'))).toEqual([
      expect.objectContaining({actorIds:[disciple,elder,'elder-blood-2'],witnessScope:'participants',locationId:location}),
    ]);
    expect(projectVacantGate(after,siegeActor(after,elder))?.notice).toContain('不是号令');
    expect(projectVacantGate(after,siegeActor(after,'npc-1'))?.notice).toBeUndefined();
    expect(decodeEraWorldSave(encodeEraWorldSave(after)).vacantGate).toEqual(after.vacantGate);
    expect(projectVacantGate(after,siegeActor(after,disciple))?.receipt?.title).toBe('自行撤到相邻安全处');
    const both=siegeTurn(source,{[disciple]:order,[elder]:choose(source,elder,'withdraw')});
    expect([disciple,elder].map(id=>siegeActor(both,id).locationId)).toEqual([refuge,refuge]);
    expect(both.vacantGate?.records.filter(row=>row.move==='withdraw').map(row=>row.actorId).sort()).toEqual([elder,disciple]);
    expect(projectVacantGate(both,siegeActor(both,elder))?.notice).toBeDefined();
    expect(decodeEraWorldSave(encodeEraWorldSave(both)).vacantGate).toEqual(both.vacantGate);
    const disputed=structuredClone(source);
    const native=disputed.events.find(event=>event.title==='星陨降地'&&event.category==='death')!;
    disputed.events.push({...native});
    expect(projectVacantGate(disputed,siegeActor(disputed,disciple))).toBeUndefined();
  });
  it('requires the actual current HQ duty of a fallen dispatch appointee when the incumbent survives',()=>{
    const home=actualGrandSiege().home;
    const act=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
      ({chosenAction,innerMonologue:'按实有名册行动。',...fields});
    const assigned=siegeTurn(home,{[patriarch]:act('DISPATCH_GUARD',{targetCultivatorId:elder,targetLocationId:location})});
    expect(siegeActor(assigned,elder).guardAssignment).toEqual({locationId:location,assignedTick:4,expiresTick:10});
    const launched=siegeTurn(assigned,{[commander]:act('LAUNCH_SIEGE',{targetSectId:defendSect})});
    const assembled=siegeTurn(launched);
    const present=siegeTurn(assembled,{[elder]:act('GUARD_DUTY',{targetLocationId:location})});
    expect(actualSiege(present).status).toBe('sieging');
    expect(present.events).toContainEqual(expect.objectContaining({id:`evt-7-${elder}-guard_duty`,locationId:location}));
    const terrain=applyMapBrush(present,'paint_vein',[{x:860,y:460}]);
    const strike={type:'TRIBULATION_STRIKE',targetCultivatorId:elder} as const;
    const weak=executeGodIntervention(executeGodIntervention(terrain,strike),strike);
    const fresh=applyMapBrush(weak,'meteor',[{x:820,y:440}]);
    expect(siegeActor(fresh,elder).alive).toBe(false);
    expect(siegeActor(fresh,patriarch).alive).toBe(true);
    expect(projectVacantGate(fresh,siegeActor(fresh,disciple))?.lostRole).toBe('ward_keeper');
    const noDuty=structuredClone(fresh);
    noDuty.events=noDuty.events.filter(event=>event.id!==`evt-7-${elder}-guard_duty`);
    expect(projectVacantGate(noDuty,siegeActor(noDuty,disciple))).toBeUndefined();
    const result=siegeTurn(fresh,{[disciple]:choose(fresh,disciple,'guard')});
    expect(siegeSect(result).leaderId).toBe(patriarch);
    expect(result.vacantGate?.records[0]).toMatchObject({lostRole:'ward_keeper',lostActorId:elder,paidQi:8,
      wardProof:{dispatcherId:patriarch,dispatchTick:4,dutyTick:7}});
    expect(decodeEraWorldSave(encodeEraWorldSave(result)).vacantGate).toEqual(result.vacantGate);
    const forged=structuredClone(result);
    forged.events=forged.events.filter(event=>event.id!==`evt-7-${elder}-guard_duty`);
    expect(()=>decodeEraWorldSave(encodeEraWorldSave(forged))).toThrow(/vacantGate\.ward/);
  });

  it('lets the strict Cognitive responder choose only its true round, matching trusted Utility without inventing command',async()=>{
    const source=impending(),who=siegeActor(source,disciple);
    const exact=vacantGateCommand(availableVacantGateActions(who,source).find(row=>row.vacantGateMove==='guard')!);
    const ask=(value:object)=>{
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}))));
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(who,source,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'fixture'},source.tick+1);
    };
    expect(await ask({...exact,targetVacantGateSiegeId:'invented'})).toBeUndefined();
    expect(await ask({...exact,wallSaved:999})).toBeUndefined();
    const selected=await ask(exact);
    expect(selected).toMatchObject(exact);
    const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候。'};
    const quiet=Object.fromEntries(source.cultivators.filter(row=>row.id!==disciple).map(row=>[row.id,rest]));
    const cognitive=advanceWorldTick(source,{...quiet,[disciple]:selected!},()=>.5,'deferred',undefined,{modelActors:new Set([disciple])});
    const utility=advanceWorldTick(source,quiet,()=>.5);
    expect(cognitive.vacantGate?.records).toEqual(utility.vacantGate?.records);
    expect(utility.vacantGate?.records[0]).toMatchObject({actorId:disciple,paidQi:8,move:'guard'});
    expect(siegeSect(cognitive).arrayHp).toBe(siegeSect(utility).arrayHp);
  });

});
