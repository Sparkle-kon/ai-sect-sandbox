import {afterEach,describe,expect,it,vi} from 'vitest';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {combineSectJobModifiers,SECT_JOB_IDS,SECT_QUIRK_CATALOG,sectQuirkComedyTags} from '../src/engine/sectQuirkCatalog';
import {hasOrdinaryIntentHistory,hasRankedOrdinaryIntentAuthority,rankOrdinaryIntents} from '../src/engine/ordinaryIntentEngine';
import {llmScheduler} from '../src/engine/llmScheduler';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {SECT_QUIRK_IDS} from '../src/types/sectManagement';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'原地调息。'};
const config={enabled:true,apiKey:'fixture-only',apiBaseUrl:'https://provider.invalid/v1',model:'quirk-fixture'};
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
const body=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id)!;
function setup(){
  const world=createManagedSectWorld(2031,'classic','qingyun-odd-jobs',0)!;
  const [id,peer,other]=world.sectManagement!.foundingDiscipleIds;
  const actor=body(world,id);
  actor.personality='刚正';
  actor.qiProgress=0;
  actor.quirks=['chatterbox','drama'];
  body(world,peer).quirks=['miser'];
  body(world,other).quirks=['jinx'];
  return {world,actor,peer,other,distant:world.cultivators.find(row=>row.locationId==='loc-blood')!.id};
}
const orders=(world:WorldState,except?:string):Record<string,LLMDecisionPayload>=>
  Object.fromEntries(world.cultivators.filter(row=>row.id!==except).map(row=>[row.id,rest]));
const social=(id:string):LLMDecisionPayload=>({chosenAction:'SOCIALIZE',targetCultivatorId:id,innerMonologue:'与同门聊两句。'});
function response(value:LLMDecisionPayload){
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));
}

describe('authored quirks adjust lawful actions without granting new authority',()=>{
  it('defines all twelve quirks over the shared ten jobs, combines two traits in fixed order, and caps modifiers',()=>{
    expect(Object.keys(SECT_QUIRK_CATALOG)).toEqual([...SECT_QUIRK_IDS]);
    for(const row of Object.values(SECT_QUIRK_CATALOG)){
      expect(row.name).toBeTruthy();
      expect(row.blurb).toBeTruthy();
      expect(row.comedyTags.length).toBeGreaterThan(0);
      expect(Object.keys(row.jobModifiers).every(job=>SECT_JOB_IDS.some(id=>id===job))).toBe(true);
    }
    expect(combineSectJobModifiers(['glutton','lost'],'gather')).toEqual({success:-20,mishap:30,windfall:35});
    expect(combineSectJobModifiers(['lost','glutton'],'gather')).toEqual(combineSectJobModifiers(['glutton','lost'],'gather'));
    expect(combineSectJobModifiers(['glutton','neat_freak'],'kitchen')).toEqual({success:40,mishap:1,windfall:16});
    expect(sectQuirkComedyTags(['neat_freak','glutton'])).toEqual(['food','distracted','order']);
    expect(combineSectJobModifiers(['miser','miser'],'stall')).toEqual({success:0,mishap:0,windfall:0});
  });

  it('changes a managed NPC’s top actual action and executes native social in a history-free Utility round',()=>{
    const {world,actor}=setup();
    const noMode=structuredClone(world);
    delete noMode.sectManagement;
    const normal=rankOrdinaryIntents(noMode,body(noMode,actor.id),noMode.tick+1);
    const quirky=rankOrdinaryIntents(world,actor,world.tick+1);
    const keys=(list:typeof normal)=>new Set(list.map(({action,targetCultivatorId,targetLocationId,targetHerbId})=>
      [action,targetCultivatorId,targetLocationId,targetHerbId].join(':')));
    expect(keys(quirky)).toEqual(keys(normal));
    expect(hasOrdinaryIntentHistory(world,actor)).toBe(false);
    expect(hasRankedOrdinaryIntentAuthority(world,actor)).toBe(true);
    expect(hasRankedOrdinaryIntentAuthority(noMode,body(noMode,actor.id))).toBe(false);
    expect(normal[0].action).toBe('GATHER_HERBS');
    expect(quirky[0]).toMatchObject({action:'SOCIALIZE',factors:expect.arrayContaining([{kind:'quirk',points:16}])});
    const after=advanceWorldTick(world,orders(world,actor.id),()=>.99);
    expect(body(after,actor.id).currentAction).toBe('SOCIALIZE');
    expect(after.events).toContainEqual(expect.objectContaining({id:`evt-${after.tick}-${actor.id}-social`,
      actorIds:[actor.id,quirky[0].targetCultivatorId]}));
  });

  it('shares own rankings only with the mocked Cognitive model and rechecks physical presence before applying',async()=>{
    const {world,actor,peer,distant}=setup();
    const desired=social(peer);
    vi.stubGlobal('fetch',vi.fn(async(_input,init:RequestInit)=>{
      const request=JSON.parse(String(init.body)) as {messages:{role:string;content:string}[]};
      const option=request.messages.find(row=>row.role==='user')?.content.split('\n')
        .find(line=>line.includes('日常选项'))??'';
      expect(option).toContain('话痨');
      expect(option).toContain('爱演');
      expect(option).not.toContain('财迷');
      expect(option).not.toContain(distant);
      expect(option).toContain('"kind":"quirk"');
      return response(desired);
    }));
    const admitted=await requestCultivatorLLMDecision(actor,world,config,world.tick+1);
    expect(admitted).toMatchObject(desired);
    if(!admitted)throw new Error('mock provider did not return one of this NPC’s present choices');
    const active=advanceWorldTick(world,{...orders(world),[actor.id]:admitted},()=>.99,'deferred',undefined,{modelActors:new Set([actor.id])});
    expect(active.events).toContainEqual(expect.objectContaining({id:`evt-${active.tick}-${actor.id}-social`,actorIds:[actor.id,peer]}));

    const departure=structuredClone(world),first=body(departure,peer);
    departure.cultivators=[first,...departure.cultivators.filter(row=>row!==first)];
    const effect=vi.fn();
    const after=advanceWorldTick(departure,{...orders(departure),[actor.id]:admitted,
      [peer]:{...rest,chosenAction:'EXPLORE',targetLocationId:'loc-market'}},()=>.99,'deferred',effect,{modelActors:new Set([actor.id])});
    expect(body(after,peer).locationId).toBe('loc-market');
    expect(effect).toHaveBeenCalledWith(actor.id,false);
    expect(after.events.some(row=>row.tick===after.tick&&row.actorIds[0]===actor.id&&row.actorIds[1]===peer)).toBe(false);

    vi.stubGlobal('fetch',vi.fn(async()=>response(social(distant))));
    await expect(requestCultivatorLLMDecision(actor,world,config,world.tick+1)).resolves.toBeUndefined();
  });
});
