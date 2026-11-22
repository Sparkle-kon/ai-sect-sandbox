import { afterEach, describe, expect, it, vi } from 'vitest';
import { availableCalamityArrayChoices, CALAMITY_ARRAY_QI, isPrivateCalamityArrayEvent, projectCalamityArrayFlows } from '../src/engine/calamityArray';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { calamityArrayCommand } from '../src/engine/calamityArrayCognition';
import { advanceWorldTick, executeGodIntervention } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';
import { actualGrandSiege, commander, disciple, location, patriarch, siegeActor, siegeTurn } from './grandSiegeNativeFixture';

const advanceTo = (targetLocationId: string): LLMDecisionPayload => ({chosenAction:'EXPLORE',targetLocationId,
  innerMonologue:'走到实有山门看这处灾情。'});
const order = (world:WorldState, actorId:string, stance:'joint'|'local'):LLMDecisionPayload => {
  const choice=availableCalamityArrayChoices(world,siegeActor(world,actorId)).find(item=>item.calamityArrayStance===stance);
  if(!choice)throw Error(`No native ${stance} choice for ${actorId} at ${world.tick}`);
  const {action,...payload}=choice;
  return {chosenAction:action,...payload,innerMonologue:'只依自己的明示选择。'};
};

function nativeTwoSectCalamity(){
  const {declared}=actualGrandSiege();
  let gathered=siegeTurn(declared,{[commander]:advanceTo(location),[disciple]:advanceTo(location)});
  expect([commander,patriarch,disciple].map(id=>siegeActor(gathered,id).locationId)).toEqual([location,location,location]);
  const stone=gathered.locations.find(row=>row.id===location)!;
  for(let i=0;i<3;i++)gathered=applyMapBrush(gathered,'cursed_miasma',[stone]);
  const hazard=gathered.mapHazards.find(row=>row.kind==='cursed_miasma')!;
  expect(hazard).toMatchObject({intensity:3});
  expect(availableCalamityArrayChoices(gathered,siegeActor(gathered,commander))).toEqual([]);
  const seen=siegeTurn(gathered);
  expect(seen.events).toContainEqual(expect.objectContaining({id:`evt-${seen.tick}-${hazard.id}`,locationId:location,title:'瘴气蔓延'}));
  expect(availableCalamityArrayChoices(seen,siegeActor(seen,disciple))).toEqual([]);
  return {seen,hazard};
}
function takeStand(world:WorldState, host:'joint'|'local',guest:'joint'|'local'){
  return siegeTurn(world,{[commander]:order(world,commander,guest),[patriarch]:order(world,patriarch,host)});
}
function vulnerable(world:WorldState){
  const strike={type:'TRIBULATION_STRIKE',targetCultivatorId:disciple} as const;
  return executeGodIntervention(executeGodIntervention(world,strike),strike);
}
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
const own = (world:WorldState,id:string) => siegeActor(world,id);
const atPay = (world:WorldState) => projectCalamityArrayFlows(world,location);

describe('two native sect leaders at an actually built array and witnessed shared miasma',()=>{
  it('charges only realized choice channels and saves only real bodies that survive a lethal ordinary strike',()=>{
    const {seen,hazard}=nativeTwoSectCalamity();
    const joint=takeStand(seen,'joint','joint'), split=takeStand(seen,'joint','local');
    const quiet=siegeTurn(seen);
    expect(joint.events.filter(isPrivateCalamityArrayEvent).filter(row=>row.tick===joint.tick)).toHaveLength(2);
    expect(atPay(joint)).toEqual([]);
    expect(own(joint,commander).qiProgress).toBe(own(quiet,commander).qiProgress);
    const jointWounded=vulnerable(joint), splitWounded=vulnerable(split), quietWounded=vulnerable(quiet);
    expect(own(jointWounded,disciple).hp).toBeGreaterThan(0);
    const together=siegeTurn(jointWounded), apart=siegeTurn(splitWounded), absent=siegeTurn(quietWounded);
    const originalAbsent=absent.events.find(row=>row.id===`evt-${absent.tick}-${hazard.id}`)!;
    expect(originalAbsent.damage).toContainEqual({cultivatorId:disciple,amount:own(quietWounded,disciple).hp});
    expect(own(absent,disciple).alive).toBe(false);
    expect(own(together,disciple).alive).toBe(true);
    expect(own(apart,disciple).alive).toBe(false);
    expect(atPay(together).map(row=>[row.actorId,row.stance,row.paidQi]).sort()).toEqual([
      [commander,'joint',CALAMITY_ARRAY_QI],[patriarch,'joint',CALAMITY_ARRAY_QI],
    ]);
    expect(atPay(apart).map(row=>[row.actorId,row.stance])).toEqual([[commander,'local']]);
    expect(atPay(absent)).toEqual([]);
    const paid=together.events.find(row=>row.id.startsWith('evt-calamity-array-paid-'))!;
    expect(atPay({...together,events:[...together.events,{...paid}]})).toEqual([]);
    expect(projectCalamityArrayFlows(together,'loc-market')).toEqual([]);

    expect(own(together,commander).qiProgress).toBe(own(absent,commander).qiProgress-CALAMITY_ARRAY_QI);
    expect(own(together,patriarch).qiProgress).toBe(own(absent,patriarch).qiProgress-CALAMITY_ARRAY_QI);
    expect(own(apart,patriarch).qiProgress).toBe(own(absent,patriarch).qiProgress);
    expect(apart.events).toContainEqual(expect.objectContaining({title:'退瘴之后，各持一议'}));
  });

  it('rejects duplicate/private originals and does not move that result to another village',()=>{
    const {seen,hazard}=nativeTwoSectCalamity();
    const original=seen.events.find(row=>row.id===`evt-${seen.tick}-${hazard.id}`)!;
    const duplicate={...seen,events:[...seen.events,{...original}]};
    expect(availableCalamityArrayChoices(duplicate,own(duplicate,commander))).toEqual([]);
    const hidden={...seen,events:seen.events.map(row=>row===original?{...row,witnessScope:'participants' as const}:row)};
    expect(availableCalamityArrayChoices(hidden,own(hidden,commander))).toEqual([]);
    expect(projectCalamityArrayFlows(siegeTurn(takeStand(seen,'joint','joint')),'loc-market')).toEqual([]);
  });

  it('settles actual autonomous Utility choices and separately exact accepted Cognitive choices through the same native resolver',async()=>{
    const {seen,hazard}=nativeTwoSectCalamity();
    const wait:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候，不加入。'};
    const others=Object.fromEntries(seen.cultivators.filter(row=>row.id!==commander&&row.id!==patriarch).map(row=>[row.id,wait]));
    const utility=advanceWorldTick(seen,others,()=>.5,'utility');
    const decode=(actorId:string,stance:'joint'|'local',bad=false)=>{
      const options=availableCalamityArrayChoices(seen,own(seen,actorId));
      const choice=options.find(row=>row.calamityArrayStance===stance)!;
      const command=calamityArrayCommand(choice);
      const transport=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(bad?
        {...command,targetCalamityHazardId:`${hazard.id}-new`}:command)}}]})));
      vi.stubGlobal('fetch',transport);
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(own(seen,actorId),seen,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',
        model:'fixture'},seen.tick+1);
    };
    expect(await decode(commander,'joint',true)).toBeUndefined();
    const left=await decode(commander,'joint'),right=await decode(patriarch,'joint');
    expect(left).toMatchObject({chosenAction:'CALAMITY_ARRAY',calamityArrayStance:'joint',targetCalamityHazardId:hazard.id});
    expect(right).toMatchObject({chosenAction:'CALAMITY_ARRAY',calamityArrayStance:'joint',targetCalamityHazardId:hazard.id});
    const cognitive=advanceWorldTick(seen,{...others,[commander]:left!,[patriarch]:right!},()=>.5,'deferred',undefined,
      {modelActors:new Set([commander,patriarch])});
    expect(cognitive.events.filter(row=>isPrivateCalamityArrayEvent(row)&&row.tick===cognitive.tick)).toHaveLength(2);
    const resolved=siegeTurn(vulnerable(cognitive));
    expect(atPay(resolved).map(row=>row.actorId).sort()).toEqual([commander,patriarch]);
    expect(own(resolved,disciple).alive).toBe(true);
    expect(utility.events.filter(row=>isPrivateCalamityArrayEvent(row)&&row.tick===utility.tick)).toHaveLength(2);
  });
});
