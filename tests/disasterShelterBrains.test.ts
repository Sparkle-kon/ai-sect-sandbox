import {afterEach,describe,expect,it,vi} from 'vitest';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {disasterShelterCheckpoint} from '../src/engine/disasterShelterCheckpoint';
import {computeHeuristicDecision,requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {presentAtVillageGranary} from '../src/engine/villageGranaryEngine';
import {applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import type {LLMConfig,LLMDecisionPayload} from '../src/types/world';
import {harmedNativeShelter,shelterAccepted,shelterActor,shelterCase,shelterDecision,shelterGuest,shelterHost,shelterRequire,shelterTilePoint,shelterTurn} from './disasterShelterNativeFixture';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'shelter-fixture'};
const reply=(decision:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(decision)}}]}));
afterEach(()=>vi.unstubAllGlobals());

describe('native shelter permissions in both brains and on the real map',()=>{
  it('both brains can choose from the native legal roster; strict model cannot claim arrival, select an outsider or sign twice',async()=>{
    const {world:before,home,hostSite}=harmedNativeShelter();
    const host=shelterActor(before,shelterHost),guest=shelterActor(before,shelterGuest);
    const offer=shelterDecision('DISASTER_SHELTER',{disasterShelterMove:'offer',targetCultivatorId:shelterGuest});
    const ask=vi.fn(async()=>reply(offer));
    vi.stubGlobal('fetch',ask);
    const utilityExecution=shelterTurn(before);
    expect(computeHeuristicDecision(shelterActor(utilityExecution,shelterHost),utilityExecution,()=>.99)).toMatchObject({chosenAction:'DISASTER_SHELTER',disasterShelterMove:'offer',targetCultivatorId:shelterGuest});
    for(const extra of [{arrivedTick:before.tick},{people:16},{targetDisasterShelterId:'imagined'},
      {targetCultivatorId:shelterHost},{path:['tile-first','tile-second']}]) {
      ask.mockImplementation(async()=>reply({...offer,...extra}));
      await expect(requestCultivatorLLMDecision(host,before,config,before.tick+1)).resolves.toBeUndefined();
    }
    ask.mockImplementation(async()=>reply(offer));
    await expect(requestCultivatorLLMDecision(guest,before,config,before.tick+1)).resolves.toBeUndefined();
    const fromModel=await requestCultivatorLLMDecision(host,before,config,before.tick+1);
    shelterRequire(fromModel,'Strict parsed model offer');
    expect(fromModel).toEqual(offer);
    const offered=shelterTurn(before,{[shelterHost]:fromModel});
    const row=shelterCase(offered);
    shelterRequire(row,'Original native offer');
    const accept=shelterDecision('DISASTER_SHELTER',{disasterShelterMove:'accept',targetDisasterShelterId:row.id});
    ask.mockImplementation(async()=>reply(accept));
    await expect(requestCultivatorLLMDecision(shelterActor(offered,shelterHost),offered,config,offered.tick+1)).resolves.toBeUndefined();
    const signed=await requestCultivatorLLMDecision(shelterActor(offered,shelterGuest),offered,config,offered.tick+1);
    shelterRequire(signed,'Only named signer may accept');
    expect(signed).toEqual(accept);
    const reserved=shelterTurn(offered,{[shelterGuest]:signed});
    expect(shelterCase(reserved)).toMatchObject({status:'reserved',pathIndex:0});
    expect(shelterActor(reserved,shelterGuest).locationId).toBe(home.id);
    expect(shelterActor(reserved,shelterHost).locationId).toBe(hostSite.id);

    const walking=shelterTurn(reserved);
    const actual=shelterActor(walking,shelterGuest),stranger=shelterActor(walking,'npc-1');
    const point=disasterShelterCheckpoint(walking,actual);
    shelterRequire(point,'Actual begun outward route');
    expect(createTerrainMapView(walking,actual,false).trailPositions.get(actual.id)).toEqual(point);
    expect(createTerrainMapView(walking,stranger,false).liveActors.some(actor=>actor.id===shelterGuest)).toBe(false);
    expect(presentAtVillageGranary(walking,actual)).toBeUndefined();
    const attempt:LLMDecisionPayload=shelterDecision('EXPLORE',{targetLocationId:hostSite.id});
    expect(applyCultivatorBrainDecision(walking,actual,attempt,()=>.99)).toBeNull();
    expect(disasterShelterCheckpoint(walking,actual)).toEqual(point);
    const calls=ask.mock.calls.length;
    await expect(requestCultivatorLLMDecision(actual,walking,config,walking.tick+1)).resolves.toBeUndefined();
    expect(ask).toHaveBeenCalledTimes(calls);
  });
  it('does not reuse the departure exemption for a new distinct danger on the very same home tile',()=>{
    const {world:reserved,row,home,path}=shelterAccepted();
    const point=shelterTilePoint(reserved,path[0]);
    let world=applyMapBrush(applyMapBrush(reserved,'beast_tide',[point]),'beast_tide',[point]);
    const competing=world.mapHazards.find(hazard=>hazard.tileId===path[0]&&hazard.kind==='beast_tide');
    shelterRequire(competing?.intensity===2&&competing.id!==row.hazard.id,'Independent newly native origin hazard');
    for(let step=world.tick+1;step<competing.expiresTick;step++){
      world=shelterTurn(world);
      expect(shelterCase(world)).toMatchObject({status:'reserved',pathIndex:0,steps:[]});
      expect(shelterActor(world,shelterGuest).locationId).toBe(home.id);
    }
    const clear=shelterTurn(world);
    expect(clear.tick).toBe(competing.expiresTick);
    expect(shelterCase(clear)).toMatchObject({status:'outbound',pathIndex:1,departedTick:clear.tick});
  });

  it('uses the actual checkpoint for native hazards and closes a death without advancing any travel',()=>{
    const {world:reserved,path}=shelterAccepted();
    const walking=shelterTurn(reserved);
    const atHomeTile=shelterTilePoint(walking,path[0]);
    const atCheckpoint=shelterTilePoint(walking,path[1]);
    const initial=shelterActor(walking,shelterGuest);
    let world=applyMapBrush(walking,'meteor',[atHomeTile]);
    expect(shelterActor(world,shelterGuest).hp).toBe(initial.hp);
    for(let attempt=0;attempt<6&&shelterActor(world,shelterGuest).alive;attempt++)
      world=applyMapBrush(world,'meteor',[atCheckpoint]);
    expect(world.tick).toBe(walking.tick);
    expect(shelterActor(world,shelterGuest)).toMatchObject({alive:false,hp:0});
    expect(shelterCase(world)).toMatchObject({status:'lost',pathIndex:1,closedTick:world.tick,steps:shelterCase(walking)?.steps});
    expect(shelterCase(world)?.arrivedTick).toBeUndefined();
    expect(shelterCase(world)?.returnedTick).toBeUndefined();
    const raw=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
  });
});
