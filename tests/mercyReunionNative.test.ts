import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {storyMercyCommand} from '../src/engine/mercyReunionCognition';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {availableMercyReunionActions,isPrivateMercyReunionEvent,projectMercyReunion} from '../src/engine/mercyReunion';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

const killer='npc-5',spared='npc-2',market='loc-market',refuge='brush-vein-tile-13-12';
const body=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const theCase=(world:WorldState)=>world.mercyReunions?.cases[0];
const cmd=(chosenAction:LLMDecisionPayload['chosenAction'], fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'按实在场。',...fields});
const travel=(targetLocationId:string)=>cmd('EXPLORE',{targetLocationId});
function turn(world:WorldState,orders:Record<string,LLMDecisionPayload>={}){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,orders[row.id]??cmd('REST')])),()=>.1);
}
function raised(){
  const start=createInitialWorld(2031,'classic');
  const marketArrival=turn(start,{[killer]:travel(market),[spared]:travel(market)});
  expect(body(marketArrival,killer).locationId).toBe(market);
  expect(body(marketArrival,spared).locationId).toBe(market);
  const refugeMade=applyMapBrush(marketArrival,'paint_vein',[{x:540,y:500}]);
  const strike={type:'TRIBULATION_STRIKE',targetCultivatorId:spared} as const;
  const threatened=executeGodIntervention(executeGodIntervention(refugeMade,strike),strike);
  expect(body(threatened,spared).hp/body(threatened,spared).maxHp).toBeLessThan(.25);
  const plain=cmd('DUEL',{targetCultivatorId:spared});
  const keepWounded=cmd('GATHER_HERBS',{targetHerbId:'jade_leaf'});
  const left=turn(threatened,{[killer]:{...plain,duelMercy:'spare'},[spared]:keepWounded});
  return {threatened,left,plain,keepWounded};
}
function select(world:WorldState,actorId:string,move:LLMDecisionPayload['mercyReunionMove']){
  const row=availableMercyReunionActions(body(world,actorId),world).find(option=>option.mercyReunionMove===move)!;
  expect(row).toBeDefined();
  return cmd(row.action,{mercyReunionMove:row.mercyReunionMove,targetMercyReunionId:row.targetMercyReunionId,
    ...(row.targetLocationId?{targetLocationId:row.targetLocationId}:{})});
}
function reunited(){
  const {left}=raised();
  const away=turn(left,{[killer]:travel('loc-danxia')});
  expect(body(away,killer).locationId).toBe('loc-danxia');
  expect(theCase(away)?.departure).toMatchObject({actorId:killer,fromSiteId:market,toSiteId:'loc-danxia',tick:away.tick});
  expect(projectMercyReunion(away,body(away,spared))).toBeUndefined();
  const together=turn(away,{[killer]:travel(market)});
  expect(theCase(together)?.reunion).toMatchObject({actorId:killer,siteId:market,tick:together.tick});
  return together;
}
describe('withholds a proven fatal blow, then needs actual later presence',()=>{
  it('Cognitive must replay the recipient’s exact consent, never replace it with a fabricated destination or third party',async()=>{
    const prior=reunited();
    const proposal=turn(prior,{[spared]:select(prior,spared,'aid')});
    const offered=availableMercyReunionActions(body(proposal,killer),proposal).find(row=>row.mercyReunionMove==='accept_aid')!;
    const menu=storyMercyCommand(offered);
    const ask=async(raw:object)=>{
      llmScheduler.resetTickBudget();
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(raw)}}]}))));
      return requestCultivatorLLMDecision(body(proposal,killer),proposal,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'fixture',model:'fixture'},proposal.tick+1);
    };
    expect(await ask({...menu,acceptedBy:spared})).toBeUndefined();
    expect(await ask({...menu,targetLocationId:'loc-danxia'})).toBeUndefined();
    const accepted=await ask(menu);
    expect(accepted).toMatchObject(menu);
    const orders=Object.fromEntries(proposal.cultivators.map(row=>[row.id,row.id===killer?accepted!:cmd('REST')]));
    const cognitive=advanceWorldTick(proposal,orders,()=>.1,'deferred',undefined,{modelActors:new Set([killer])});
    const utility=turn(proposal,{[killer]:select(proposal,killer,'accept_aid')});
    expect(theCase(cognitive)?.outcome).toEqual(theCase(utility)?.outcome);
    expect(theCase(cognitive)?.outcome?.move).toBe('aid');
    expect(body(cognitive,killer).locationId).toBe(refuge);
    expect(body(cognitive,spared).qiProgress).toBe(body(proposal,spared).qiProgress-8);
  });

  it('keeps exactly one HP instead of true death, without looting, and cannot invent a sequel from stationary months',()=>{
    const {threatened,left,plain,keepWounded}=raised();
    const killed=turn(threatened,{[killer]:plain,[spared]:keepWounded});
    expect(body(killed,spared).alive).toBe(false);
    expect(theCase(killed)).toBeUndefined();
    expect(body(left,spared)).toMatchObject({alive:true,hp:1});
    expect(body(left,spared).spiritStones).toBe(body(threatened,spared).spiritStones);
    expect(body(left,killer).transgressions).toBe(body(threatened,killer).transgressions);
    expect(theCase(left)).toMatchObject({victorId:killer,sparedId:spared,hpBefore:body(threatened,spared).hp,
      appliedDamage:body(threatened,spared).hp-1});
    expect(left.events.find(event=>event.title==='剑到命门而收')?.witnessScope).toBe('participants');
    expect(theCase(turn(left))?.reunion).toBeUndefined();
  });

  it('offers stand-down, renewed actual combat, and mutual paid passage only after real remeeting',()=>{
    const source=reunited();
    expect(projectMercyReunion(source,body(source,'npc-6'))).toBeUndefined();
    expect(projectMercyReunion(source,body(source,spared))?.options.map(row=>row.mercyReunionMove)).toEqual(['stand_down','aid','challenge']);
    const stopped=turn(source,{[spared]:select(source,spared,'stand_down')});
    expect(theCase(stopped)?.outcome?.move).toBe('stand_down');
    const challenged=turn(source,{[spared]:select(source,spared,'challenge')});
    expect(theCase(challenged)?.outcome?.move).toBe('challenge');
    const proposal=turn(source,{[spared]:select(source,spared,'aid')});
    expect(body(proposal,spared).locationId).toBe(market);
    expect(body(proposal,killer).locationId).toBe(market);
    expect(theCase(proposal)?.aid).toMatchObject({proposerId:spared,targetId:killer,destinationId:refuge});
    const absentConsent=turn(proposal);
    expect(theCase(absentConsent)?.outcome).toBeUndefined();
    expect(body(absentConsent,spared).locationId).toBe(market);
    expect(body(absentConsent,killer).locationId).toBe(market);
    const accepted=turn(proposal,{[killer]:select(proposal,killer,'accept_aid')});
    expect(theCase(accepted)?.outcome?.move).toBe('aid');
    expect(body(accepted,spared).locationId).toBe(refuge);
    expect(body(accepted,killer).locationId).toBe(refuge);
    expect(body(accepted,spared).qiProgress).toBe(body(proposal,spared).qiProgress-8);
    expect(accepted.events.some(event=>isPrivateMercyReunionEvent(event)&&event.title==='两人同意后到达邻地')).toBe(true);
    expect(encodeEraWorldSave(decodeEraWorldSave(encodeEraWorldSave(accepted)))).toBe(encodeEraWorldSave(accepted));
  });
});
