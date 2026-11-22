import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {availableFarewellLandingActions,isPrivateFarewellLandingEvent,projectFarewellLanding} from '../src/engine/farewellLanding';
import {farewellLandingCommand} from '../src/engine/farewellLandingCognition';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

afterEach(()=>{vi.unstubAllGlobals();llmScheduler.resetTickBudget();});

const mourner='npc-5',dead='npc-2',market='loc-market',east='loc-market-east',dock='frontier-east-dock';
const body=(world:WorldState,id=mourner)=>world.cultivators.find(row=>row.id===id)!;
const cmd=(chosenAction:LLMDecisionPayload['chosenAction'], fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'按实际行止。',...fields});
const travel=(targetLocationId:string)=>cmd('EXPLORE',{targetLocationId});
const rest=cmd('REST');
function month(world:WorldState,orders:Record<string,LLMDecisionPayload>={},roll=.1){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,orders[row.id]??rest])),()=>roll);
}
function journey(){
  const initial=createInitialWorld(2031,'classic');
  let world=month(initial,{[mourner]:travel(market),[dead]:travel(market)});
  expect(body(world).locationId).toBe(market);
  expect(body(world,dead).locationId).toBe(market);
  world=month(world,{[mourner]:cmd('SOCIALIZE',{targetCultivatorId:dead})});
  const shared=`evt-${world.tick}-${mourner}-social`;
  expect(world.witnessedPersonalStory.scenes.find(row=>row.eventId===shared)?.actorIds).toEqual([mourner,dead]);
  world=month(world,{[mourner]:cmd('GATHER_HERBS',{targetHerbId:'earth_root'})});
  const strike={type:'TRIBULATION_STRIKE',targetCultivatorId:dead} as const;
  world=executeGodIntervention(executeGodIntervention(world,strike),strike);
  const deceased=month(world,{[mourner]:cmd('DUEL',{targetCultivatorId:dead}),[dead]:cmd('GATHER_HERBS',{targetHerbId:'jade_leaf'})});
  expect(body(deceased,dead)).toMatchObject({alive:false,hp:0});
  const death=`evt-${deceased.tick}-${mourner}-kill`;
  expect(deceased.eraHistory.receipts).toContainEqual(expect.objectContaining({kind:'death',actorId:dead,eventId:death}));
  expect(projectFarewellLanding(deceased,body(deceased))).toBeUndefined();
  const known=knownMapLocations(deceased,body(deceased));
  let atEast:WorldState;
  if(known.some(place=>place.id===east))atEast=month(deceased,{[mourner]:travel(east)});
  else{
    const unknown=deceased.locations.filter(place=>place.id!==body(deceased).locationId&&!known.includes(place));
    const i=unknown.findIndex(place=>place.id===east);
    expect(i).toBeGreaterThanOrEqual(0);
    atEast=month(deceased,{[mourner]:cmd('EXPLORE')},(i+.25)/unknown.length);
  }
  expect(body(atEast).locationId).toBe(east);
  const admitted=month(atEast,{[mourner]:cmd('FRONTIER',{frontierMove:'enter',targetFrontierSiteId:'frontier-east-gate'})});
  expect(body(admitted).spiritStones).toBe(body(atEast).spiritStones-8);
  let arrived=admitted;
  for(const locationId of ['frontier-east-causeway',dock] as const)
    arrived=month(arrived,{[mourner]:cmd('FRONTIER',{frontierMove:'travel',targetFrontierSiteId:locationId})});
  expect(body(arrived)).toMatchObject({positionPlane:'frontier',locationId:dock});
  return {arrived,death,shared};
}
const choice=(farewellLandingMove:'keep_light'|'farewell')=>cmd('FAREWELL_LANDING',{farewellLandingMove,targetFarewellDeceasedId:dead});

describe('an independently proved loss and a real paid shore arrival',()=>{
  it('keeps a scoped light only after one real stone, or actually says farewell without funding it',()=>{
    const {arrived,death,shared}=journey();
    const start=encodeEraWorldSave(arrived);
    expect(projectFarewellLanding(arrived,body(arrived))?.options.map(row=>row.farewellLandingMove)).toEqual(['keep_light','farewell']);
    expect(projectFarewellLanding(arrived,body(arrived))?.light).toBeUndefined();
    const lit=month(arrived,{[mourner]:choice('keep_light')});
    const plain=month(arrived,{[mourner]:choice('farewell')});
    expect([body(lit).spiritStones,body(plain).spiritStones]).toEqual([body(arrived).spiritStones-1,body(arrived).spiritStones]);
    expect(lit.farewellLandings?.records).toEqual([expect.objectContaining({actorId:mourner,deceasedId:dead,deathEventId:death,sharedEventId:shared,
      siteId:dock,paidStones:1,lightUntilTick:lit.tick+3})]);
    expect(plain.farewellLandings?.records).toEqual([expect.objectContaining({actorId:mourner,deceasedId:dead,paidStones:0})]);
    expect(projectFarewellLanding(lit,body(lit))?.light).toEqual({chartId:'chart-east-offshore',tileId:dock});
    expect(projectFarewellLanding(plain,body(plain))?.light).toBeUndefined();
    expect(projectFarewellLanding(lit,body(lit,'npc-6'))).toBeUndefined();
    expect(availableFarewellLandingActions(body(lit),lit)).toEqual([]);
    expect(projectFarewellLanding(month(lit),body(lit))).toBeUndefined(); // stale body reference
    const end=month(month(month(lit)));
    expect(projectFarewellLanding(end,body(end))?.light).toBeUndefined();
    const away=month(lit,{[mourner]:cmd('FRONTIER',{frontierMove:'travel',targetFrontierSiteId:'frontier-east-causeway'})});
    expect(projectFarewellLanding(away,body(away))).toBeUndefined();
    expect(body(lit,dead)).toEqual(body(plain,dead));
    expect(lit.events.some(event=>isPrivateFarewellLandingEvent(event)&&event.actorIds[0]===mourner)).toBe(true);
    expect(encodeEraWorldSave(decodeEraWorldSave(encodeEraWorldSave(lit)))).toBe(encodeEraWorldSave(lit));
    expect(encodeEraWorldSave(arrived)).toBe(start);
  });

  it('fails closed on duplicated death, missing mutual history and a substituted body',()=>{
    const {arrived,death,shared}=journey();
    const alternate=structuredClone(arrived);
    alternate.events.push({...alternate.events.find(row=>row.id===death)!});
    expect(projectFarewellLanding(alternate,body(alternate))).toBeUndefined();
    const noShared=structuredClone(arrived);
    noShared.witnessedPersonalStory.scenes=noShared.witnessedPersonalStory.scenes.filter(row=>row.eventId!==shared);
    expect(projectFarewellLanding(noShared,body(noShared))).toBeUndefined();
    expect(projectFarewellLanding(arrived,{...body(arrived)})).toBeUndefined();
    const forged=month(arrived,{[mourner]:{...choice('keep_light'),targetFarewellDeceasedId:'npc-6'}});
    expect(forged.farewellLandings).toBeUndefined();
  });
  it('uses exactly the same actual native choice under strict Cognitive and trusted Utility, without authoring a dead person',async()=>{
    const {arrived}=journey();
    const quietOthers=Object.fromEntries(arrived.cultivators.filter(row=>row.id!==mourner).map(row=>[row.id,rest]));
    const utility=advanceWorldTick(arrived,quietOthers,()=>.1);
    const native=utility.farewellLandings?.records[0];
    expect(native).toBeDefined();
    const exact=availableFarewellLandingActions(body(arrived),arrived).find(row=>row.farewellLandingMove===native?.move)!;
    const option=farewellLandingCommand(exact);
    const ask=(value:object)=>{
      vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}))));
      llmScheduler.resetTickBudget();
      return requestCultivatorLLMDecision(body(arrived),arrived,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'fixture',model:'fixture'},arrived.tick+1);
    };
    expect(await ask({...option,targetFarewellDeceasedId:'npc-6'})).toBeUndefined();
    expect(await ask({...option,resurrection:true,ghost:'none'})).toBeUndefined();
    const accepted=await ask(option);
    expect(accepted).toMatchObject(option);
    const cognitive=advanceWorldTick(arrived,{...quietOthers,[mourner]:accepted!},()=>.1,'deferred',undefined,
      {modelActors:new Set([mourner])});
    expect(cognitive.farewellLandings).toEqual(utility.farewellLandings);
    expect(body(cognitive,mourner).spiritStones).toBe(body(utility,mourner).spiritStones);
    expect(body(cognitive,dead)).toEqual(body(utility,dead));
  });

});
