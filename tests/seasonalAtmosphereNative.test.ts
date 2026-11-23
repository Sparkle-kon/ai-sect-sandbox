import {describe,expect,it,vi} from 'vitest';
import {projectAtmosphere} from '../src/components/seasonalAtmosphereModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld,REALM_BASE_POWER,REALM_LIFESPAN} from '../src/data/initialWorld';
import {ascensionEventId} from '../src/engine/ascensionTerms';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {localQiWeather} from '../src/engine/weatherEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';
import {actualAscensionWaves,ascentActor,ascentActorId,ascentMonth,ascentOrder,ascentSite,ascentTrial,
  genuineReversibleUpper} from './ascensionNativeFixture';

const npc=(world:WorldState,id='npc-1')=>world.cultivators.find(row=>row.id===id)!;
const place=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id)!;
const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在真年月里闭息。'};
const next=(world:WorldState,want=idle,id='npc-1',cognitive=false)=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===id?want:idle])),()=>.2,'utility',undefined,
  cognitive?{modelActors:new Set([id])}:undefined);
type Options=Parameters<typeof projectAtmosphere>[1];
const projection=(world:WorldState,options:Omit<Options,'view'>,viewer?:Cultivator)=>
  projectAtmosphere(world,{...options,viewer,view:createTerrainMapView(world,viewer,!!viewer)});
const map=(world:WorldState,viewer?:Cultivator,historical=false)=>projection(world,{surface:'map',historical},viewer);
function strict(world:WorldState){
  const bytes=encodeEraWorldSave(world),copy=decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(copy)).toBe(bytes);
  return copy;
}
function passedMajor(realm:'金丹'|'元婴'){
  const initial=createInitialWorld(1,'spirit-bloom'),person=npc(initial);
  // Only controlled initial qualification; original site, every wave, elapsed month, realm advancement
  // and actual public/private receipts come from native monthly simulation.
  const maxHp=Math.round(REALM_BASE_POWER[realm]*1.72);
  Object.assign(person,{realm,realmStage:9,qiProgress:100,maxHp,hp:maxHp,lifespan:REALM_LIFESPAN[realm],
    combatPower:Math.round(REALM_BASE_POWER[realm]*1.9)});
  const opening=next(initial,{...idle,chosenAction:'BREAKTHROUGH'});
  let heart=opening;
  for(let i=0;i<6&&npc(heart).tribulation?.stage==='lightning';i++)heart=next(heart,
    {...idle,chosenAction:'FACE_TRIBULATION',tribulationStance:'guard'});
  expect(npc(heart).tribulation?.stage).toBe('heart_demon');
  const outcome=next(heart,{...idle,chosenAction:'FACE_TRIBULATION',tribulationStance:'focus'});
  expect(npc(outcome).tribulation?.stage).toBe('passed');
  return {initial,opening,heart,outcome};
}

describe('seasonal atmosphere renders only current native authorized truths',()=>{
  it('follows the real quarter and site weather through 12 native months without altering clocks, RNG, terrain or save',()=>{
    const quarters=['spring','summer','autumn','winter'] as const;
    const nativeQuarters=['春','夏','秋','冬'] as const;
    let world=createInitialWorld(1);
    for(let month=1;month<=12;month++){
      const stable=encodeEraWorldSave(world),rng=JSON.stringify(world.random);
      expect(world.month).toBe(month);
      const observer=npc(world),site=place(world,observer.locationId);
      const quarter=Math.floor((month-1)/3);
      const condition=localQiWeather(world,site);
      expect(condition.season).toBe(nativeQuarters[quarter]);
      const court=projection(world,{surface:'courtyard',siteId:site.id},observer);
      expect(court).toMatchObject({tick:world.tick,season:quarters[quarter],kind:condition.kind,intensity:condition.intensity});
      expect(projection(world,{surface:'courtyard',siteId:site.id},observer)).toEqual(court);
      const cloned=strict(world),copy=projection(cloned,{surface:'courtyard',siteId:site.id},npc(cloned));
      expect(copy).toEqual(court);
      const publicSky=map(world,observer);
      expect(publicSky.sites.every(row=>createTerrainMapView(world,observer,true).isCurrentLocation(row.id))).toBe(true);
      expect(publicSky.phenomena).toEqual([]);
      expect(JSON.stringify(world.random)).toBe(rng);
      expect(encodeEraWorldSave(world)).toBe(stable);
      world=next(world);
    }
  });

  it('never maps an unseen north effect, private/forged site, or historical live local forecast into the current stage',()=>{
    let world=createInitialWorld(1);
    while(world.tick<10)world=next(world);
    const north='loc-vein-north',local=npc(world,'npc-2'),remote=npc(world,'npc-3'),site=place(world,north);
    expect(local.locationId).toBe(north);
    const view=createTerrainMapView(world,remote,true);
    expect(view.isCurrentLocation(north)).toBe(false);
    const actual=localQiWeather(world,site);
    const own=projection(world,{surface:'courtyard',siteId:north},local);
    expect(own).toMatchObject({season:'winter',kind:actual.kind,intensity:actual.intensity,north:true});
    const denied=projection(world,{surface:'courtyard',siteId:north},remote);
    expect(denied.phenomena).toEqual([]);
    expect(denied.north).toBe(false);
    expect(denied.sites.some(row=>row.id===north)).toBe(false);
    expect(projection(world,{surface:'stage',siteId:'made-up-location',sourceId:'forged'},local).intensity).toBe(0);
    const upper={...local,positionPlane:'upper' as const};
    const offPlane={...world,cultivators:world.cultivators.map(row=>row.id===local.id?upper:row)};
    expect(map(offPlane,upper).sites).toEqual([]);
    const clone=projection(world,{surface:'courtyard',siteId:north},{...local});
    expect(clone.phenomena).toEqual([]);
    expect(clone.sites.some(row=>row.id===north)).toBe(false);
    const archive=projection(world,{surface:'stage',siteId:north,historical:true,season:'autumn'},local);
    expect(archive).toMatchObject({historical:true,season:'autumn',phenomena:[]});
    expect(archive.sites).toEqual([]);
  });

  it.each([['金丹','元婴','nascent',7],['元婴','化神','soul',8]] as const)(
    'uses native %s → %s sworn result once in the current scoped surface', (before,after,kind,tick)=>{
      const {opening,heart,outcome}=passedMajor(before);
      const world=strict(outcome),actor=npc(world),site=place(world,actor.locationId);
      expect(actor).toMatchObject({realm:after,realmStage:1,tribulation:{targetRealm:after,stage:'passed',resolvedTick:tick}});
      const event=world.events.find(row=>row.id===`evt-${tick}-npc-1-tribulation-passed`)!;
      expect(event).toMatchObject({tick,category:'breakthrough',locationId:site.id,actorIds:[actor.id]});
      expect(event.witnessScope).toBeUndefined();
      expect(map(opening,npc(opening)).phenomena).toEqual([]);
      expect(map(heart,npc(heart)).phenomena).toEqual([]);
      const exact=map(world,actor).phenomena;
      expect(exact).toEqual([expect.objectContaining({siteId:site.id,x:site.x,y:site.y,kind})]);
      const stage=projection(world,{surface:'stage',siteId:site.id,sourceId:event.id},actor);
      expect(stage.phenomena).toEqual(exact);
      expect(projection(world,{surface:'courtyard',siteId:site.id},actor).phenomena).toEqual(exact);
      expect(projection(world,{surface:'stage',siteId:site.id,sourceId:'evt-init-1'},actor).phenomena).toEqual([]);
      const secret=world.events.find(row=>row.tick===tick&&row.witnessScope==='participants')!;
      expect(projection(world,{surface:'stage',siteId:site.id,sourceId:secret.id},actor).phenomena).toEqual([]);
      const unprivileged=npc(world,'npc-5');
      expect(map(world,unprivileged).phenomena).toEqual([]);
      expect(map(world,actor,true).phenomena).toEqual([]);
      expect(map(next(world),undefined).phenomena).toEqual([]);
      const invalidDate={...world,events:world.events.map(row=>row===event?{...row,month:row.month-1}:row)};
      const privateEvent={...world,events:world.events.map(row=>row===event?{...row,witnessScope:'participants' as const}:row)};
      const duplicate={...world,events:[...world.events,{...event}]};
      const badVenue={...world,events:world.events.map(row=>row===event?{...row,locationId:'loc-market'}:row)};
      for(const disputed of [invalidDate,privateEvent,duplicate,badVenue])
        expect(map(disputed,actor).phenomena).toEqual([]);
      expect(projection(world,{surface:'stage',siteId:'loc-market',sourceId:event.id},actor).phenomena).toEqual([]);
    },
  );

  it('matches the native Utility result after one legal Cognitive heart choice without interpreting its private text',async()=>{
    const {heart,outcome}=passedMajor('金丹'),actor=npc(heart);
    const command={chosenAction:'FACE_TRIBULATION',targetHeartTrialId:actor.tribulation!.id,heartDemonChoice:'face'} as const;
    llmScheduler.resetTickBudget();
    const provider=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(command)}}]})));
    vi.stubGlobal('fetch',provider);
    let valid:LLMDecisionPayload|undefined;
    try{
      valid=await requestCultivatorLLMDecision(actor,heart,{enabled:true,apiBaseUrl:'https://provider.invalid/v1',
        apiKey:'fixture-only',model:'fixture'},heart.tick+1);
      expect(provider).toHaveBeenCalledTimes(1);
      expect(valid).toMatchObject(command);
    }finally{vi.unstubAllGlobals();llmScheduler.resetTickBudget();}
    if(!valid)throw new Error('Native Cognitive heart decision not admitted');
    const online=strict(next(heart,valid,actor.id,true)),same=strict(outcome);
    const authentic=map(online,npc(online)).phenomena;
    expect(authentic).toEqual(map(same,npc(same)).phenomena);
    expect(authentic).toEqual([expect.objectContaining({kind:'nascent',siteId:'loc-taixu'})]);
    expect(JSON.stringify(authentic)).not.toMatch(/heart|独白|愧疚/);
  });

  it('renders only the irreversible successful paid three-wave ascension at authorized remembered source, not a warning or round',()=>{
    const {opening,first,second,passed,trial}=actualAscensionWaves();
    const retreat=ascentMonth(opening,ascentOrder('retreat',trial.id));
    const reversible=genuineReversibleUpper().upper;
    for(const interim of [opening,first,second,retreat,reversible])expect(map(interim).phenomena).toEqual([]);
    const full=strict(passed),departed=ascentActor(full),source=ascentTrial(full);
    expect(departed).toMatchObject({alive:true,positionPlane:'immortal'});
    expect(source.waves).toHaveLength(3);
    expect(source.waves.map(row=>row.qiPaid)).toEqual([8,4,8]);
    const eventId=ascensionEventId(ascentActorId,full.tick,'succeeded');
    expect(source.terminal).toMatchObject({tick:full.tick,eventId,status:'succeeded'});
    const site=place(full,ascentSite),observer=npc(full,'elder-taixu-1');
    const result=map(full,observer).phenomena;
    expect(result).toEqual([expect.objectContaining({kind:'ascension',siteId:ascentSite,x:site.x,y:site.y})]);
    expect(projection(full,{surface:'stage',siteId:ascentSite,sourceId:eventId},observer).phenomena).toEqual(result);
    expect(map(full,npc(full,'npc-5')).phenomena).toEqual([]);
    expect(map(full,observer,true).phenomena).toEqual([]);
    const changed=structuredClone(full);
    ascentTrial(changed).waves.pop();
    expect(map(changed,npc(changed,observer.id)).phenomena).toEqual([]);
  });
});
