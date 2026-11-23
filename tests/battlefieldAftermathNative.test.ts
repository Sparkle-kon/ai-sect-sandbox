import {afterEach,describe,expect,it,vi} from 'vitest';
import {projectMapEntitySiteDetails} from '../src/components/mapEntitySiteDetails';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {availableBattlefieldAftermathActions,projectBattlefieldAftermath} from '../src/engine/battlefieldAftermath';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {actualSiege,commander,attackSect,defendSect,disciple,location,patriarch,siegeActor,siegeTurn} from './grandSiegeNativeFixture';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import type {BattlefieldAftermathMove} from '../src/types/battlefieldAftermath';
afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静守本处。'};
const intent=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只按眼前实有凭据。',...fields});
function terminal(){
  const initial=createInitialWorld(1,'spirit-bloom');
  const declared=siegeTurn(initial,{
    [commander]:intent('DECLARE_WAR',{targetSectId:defendSect}),
    'npc-5':intent('OFFER_ALLIANCE',{targetSectId:attackSect}),
    [patriarch]:intent('BUILD_FACILITY',{facilityKind:'defense_array'}),
    [disciple]:intent('EXPLORE',{targetLocationId:'loc-market'}),
  });
  expect(siegeActor(declared,disciple).locationId).toBe('loc-market');
  const home=siegeTurn(declared,{[disciple]:intent('EXPLORE',{targetLocationId:location})});
  expect(home.battlefieldAftermath?.approaches).toContainEqual({actorId:disciple,defenderSectId:defendSect,siteId:location,
    fromSiteId:'loc-market',tick:3});
  expect(projectBattlefieldAftermath(home,siegeActor(home,disciple))).toBeUndefined();
  const launched=siegeTurn(siegeTurn(home),{[commander]:intent('LAUNCH_SIEGE',{targetSectId:defendSect})});
  let world=launched;
  while(world.tick<14)world=siegeTurn(world);
  expect(actualSiege(world)).toMatchObject({status:'victory',rounds:7,theatre:{terminal:{battlefield:true,tick:14}}});
  return decodeEraWorldSave(encodeEraWorldSave(world));
}
function choice(world:WorldState,id:string,move:BattlefieldAftermathMove):LLMDecisionPayload{
  const selected=availableBattlefieldAftermathActions(siegeActor(world,id),world).find(row=>row.battlefieldAftermathMove===move);
  expect(selected).toBeDefined();
  return {chosenAction:selected!.action,targetBattlefieldAftermathId:selected!.targetBattlefieldAftermathId,battlefieldAftermathMove:move,
    ...(selected!.targetLocationId?{targetLocationId:selected!.targetLocationId}:{}),
    ...(selected!.targetCultivatorId?{targetCultivatorId:selected!.targetCultivatorId}:{}),innerMonologue:'只自作决定。'};
}
describe('a living witness after the real native terminal round',()=>{
  it('uses the actual witnessed field and exact return approach, with separate own remain and native return',()=>{
    const world=terminal();
    expect(siegeActor(world,commander).locationId).toBe('loc-taixu');
    expect(projectBattlefieldAftermath(world,siegeActor(world,commander))).toBeUndefined();
    expect(projectBattlefieldAftermath(world,siegeActor(world,disciple))?.siteId).toBe(location);
    const field=world.locations.find(row=>row.id===location)!;
    const locals=world.cultivators.filter(row=>row.alive&&row.locationId===field.id);
    const details=(id:string)=>{
      const observer=siegeActor(world,id);
      return projectMapEntitySiteDetails(world,createTerrainMapView(world,observer,false),field,locals,observer);
    };
    expect(details(disciple)).toContainEqual(expect.objectContaining({label:'战后拾愿'}));
    expect(details(commander)).not.toContainEqual(expect.objectContaining({label:'战后拾愿'}));
    expect(projectBattlefieldAftermath(world,siegeActor(world,patriarch))?.options.some(row=>row.battlefieldAftermathMove==='return')).toBe(false);
    const back=choice(world,disciple,'return'),empty=siegeTurn(world,{[disciple]:{...back,targetLocationId:'loc-danxia'}});
    expect(siegeActor(empty,disciple).locationId).toBe(location);
    const actual=siegeTurn(world,{[disciple]:back,[patriarch]:choice(world,patriarch,'remain')});
    expect(siegeActor(actual,disciple).locationId).toBe('loc-market');
    expect(siegeActor(actual,patriarch).locationId).toBe(location);
    expect(actual.battlefieldAftermath?.cases.find(row=>row.actorId===disciple)?.decision).toMatchObject({move:'return',tick:15,targetLocationId:'loc-market'});
    expect(projectBattlefieldAftermath(actual,siegeActor(actual,disciple))?.receipt?.title).toBe('沿旧路回到来处');
    expect(decodeEraWorldSave(encodeEraWorldSave(actual)).battlefieldAftermath).toEqual(actual.battlefieldAftermath);
    const away=siegeTurn(world,{[disciple]:intent('EXPLORE',{targetLocationId:'loc-secret-1'})});
    expect(siegeActor(away,disciple).locationId).toBe('loc-secret-1');
    expect(away.battlefieldAftermath?.cases.find(row=>row.actorId===disciple)).toMatchObject({leftTick:15});
    const revisiting=siegeTurn(decodeEraWorldSave(encodeEraWorldSave(away)),{
      [disciple]:intent('EXPLORE',{targetLocationId:location}),
    });
    expect(siegeActor(revisiting,disciple).locationId).toBe(location);
    expect(projectBattlefieldAftermath(revisiting,siegeActor(revisiting,disciple))).toBeUndefined();
    const duplicate=structuredClone(world);
    const source=duplicate.events.find(event=>event.id===actualSiege(world).theatre!.terminal!.sourceEventId)!;
    duplicate.events.push({...source,witnessScope:'participants'});
    expect(projectBattlefieldAftermath(duplicate,siegeActor(duplicate,disciple))).toBeUndefined();
  });
  it('requires a separate genuine care choice after the offer and applies only actual donor Qi and recipient HP',async()=>{
    const world=terminal(),donor=disciple,offer=choice(world,donor,'offer_care'),recipient=offer.targetCultivatorId!;
    const offered=siegeTurn(world,{[donor]:offer,[recipient]:{...offer,targetBattlefieldAftermathId:'no-such-choice'}});
    expect(siegeActor(offered,donor).qiProgress).toBe(siegeActor(world,donor).qiProgress);
    const reply=choice(offered,recipient,'accept_care');
    const {innerMonologue:_,...exact}=reply;
    const ask=(value:object)=>{
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}))));
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(siegeActor(offered,recipient),offered,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'fixture'},16);
    };
    expect(await ask({...exact,targetCultivatorId:commander})).toBeUndefined();
    expect(await ask({...exact,healedHp:999})).toBeUndefined();
    const valid=await ask(exact);
    expect(valid).toMatchObject(exact);
    const other=Object.fromEntries(offered.cultivators.filter(row=>row.id!==recipient).map(row=>[row.id,rest]));
    const utility=advanceWorldTick(offered,other,()=>.5),cognitive=advanceWorldTick(offered,{...other,[recipient]:valid!},()=>.5,'deferred',undefined,
      {modelActors:new Set([recipient])});
    const paid=cognitive.battlefieldAftermath?.cases.find(row=>row.actorId===recipient)?.decision;
    expect(paid).toMatchObject({move:'accept_care',targetCultivatorId:donor,healedHp:12,tick:16});
    expect(siegeActor(cognitive,donor).qiProgress).toBe(siegeActor(offered,donor).qiProgress-6);
    expect(siegeActor(cognitive,recipient).hp).toBe(siegeActor(offered,recipient).hp+paid!.healedHp!);
    expect(cognitive.battlefieldAftermath).toEqual(utility.battlefieldAftermath);
    expect(decodeEraWorldSave(encodeEraWorldSave(cognitive)).battlefieldAftermath).toEqual(cognitive.battlefieldAftermath);
  });
});
