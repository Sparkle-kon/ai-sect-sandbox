import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {householdCensus} from '../src/engine/householdEngine';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {availableSeasonalHousingActions,seasonalHousingTravelTarget} from '../src/engine/seasonalHousingEngine';
import {resolveSettlementAction} from '../src/engine/settlementEngine';
import {resolveVillageWorksAction} from '../src/engine/villageWorksEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMConfig,LLMDecisionPayload,WorldState} from '../src/types/world';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'test-only'};
const action=(chosenAction:LLMDecisionPayload['chosenAction'],extra:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只按实地房舍与本人同意的记录。',...extra});
const housing=(housingMove:NonNullable<LLMDecisionPayload['housingMove']>,extra:Partial<LLMDecisionPayload>)=>
  action('SEASONAL_HOUSING',{housingMove,...extra});
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const turn=(world:WorldState,choices:Record<string,LLMDecisionPayload>={},utility:readonly string[]=[])=>advanceWorldTick(world,{
  ...Object.fromEntries(world.cultivators.filter(({id})=>!utility.includes(id)).map(({id})=>[id,action('REST')])),...choices,
},()=>.99);
function census(world:WorldState,settlementId:string){
  const village=world.settlements.villages.find(row=>row.id===settlementId)!;
  return {population:village.population,capacity:village.capacity,wholeHouseholds:householdCensus(world,settlementId),roster:world.cultivators.map(({id})=>id)};
}
const response=(value:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));

function realShelterFixture(){
  let world=createInitialWorld(9);
  world.tick=18;
  world.month=8;
  const guest=world.cultivators[0], guestId=guest.id, sect=world.sects.find(row=>row.id===guest.sectId)!;
  const village=world.settlements.villages.find(row=>row.locationId==='loc-market')!,siteId=village.locationId;
  guest.locationId=siteId;guest.herbs.earth_root=8;guest.hp=guest.maxHp;guest.age=40;guest.personality='刚正';
  guest.tribulation=undefined;guest.guardAssignment=undefined;sect.spiritStones=1000;
  for(const town of world.settlements.villages)town.stress=10;
  const volunteer=village.volunteers[0];
  Object.assign(volunteer,{age:25,aptitude:95,willingness:95});
  expect(resolveSettlementAction(world,guest,action('RECRUIT_SETTLER',{targetSettlementId:village.id,
    targetVolunteerId:volunteer.id}))).not.toBeNull();
  const hostId='recruit-'+volunteer.id;
  const household=world.households.members.find(row=>row.recruitedId===hostId)!;
  expect(resolveVillageWorksAction(world,guest,action('VILLAGE_WORKS',{villageWorkKind:'shelter',
    targetSettlementId:village.id}))).not.toBeNull();
  world=turn(world,{[hostId]:action('SOCIALIZE',{targetCultivatorId:guestId})});
  world=turn(world,{[guestId]:action('EXPLORE',{targetLocationId:sect.headquartersId})});
  for(let loop=0;loop<10&&(world.villageWorks.projects[0].status!=='completed'||![3,6,9,12].includes(world.month));loop++)world=turn(world);
  const project=world.villageWorks.projects[0];
  expect(project).toMatchObject({kind:'shelter',status:'completed',settlementId:village.id});
  expect(project.laborTotal).toBeGreaterThan(0);
  expect(project.capacityAfter).toBeGreaterThan(project.capacityBefore!);
  expect(actor(world,guestId).locationId).toBe(sect.headquartersId);
  return {world,hostId,guestId,siteId,originId:sect.headquartersId,settlementId:village.id,householdId:household.householdId,projectId:project.id};
}
function offeredFixture(){
  const f=realShelterFixture();
  const world=turn(f.world,{[f.hostId]:housing('offer',{targetHousingHouseholdId:f.householdId,targetCultivatorId:f.guestId})});
  const claim=world.seasonalHousing.claims[0];
  expect(claim).toMatchObject({status:'offered',shelterProjectId:f.projectId});
  return {...f,world,claimId:claim.id};
}
function actualOccupancy(){
  const f=offeredFixture(),request={targetHousingClaimId:f.claimId};
  const reserved=turn(f.world,{[f.guestId]:housing('accept',request)});
  const arrived=turn(reserved,{[f.guestId]:action('EXPLORE',{targetLocationId:f.siteId})});
  const world=turn(arrived,{[f.guestId]:housing('check_in',request)});
  expect(world.seasonalHousing.claims[0].status).toBe('occupied');
  return {...f,world};
}

beforeEach(()=>llmScheduler.resetTickBudget());
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('one genuine seasonal stay across native decision turns',()=>{
  it('accepts a compact next-turn mock answer only; Utility actually explores and signs in later, without counting a resident',async()=>{
    const f=offeredFixture(),{world,claimId,guestId,hostId,siteId,originId,settlementId}=f;
    const guest=actor(world,guestId);
    const outsider=world.cultivators.find(row=>row.id!==guestId&&row.id!==hostId)!;
    outsider.name=guest.name;
    const exact=housing('accept',{targetHousingClaimId:claimId});
    const provider=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>response(exact));
    vi.stubGlobal('fetch',provider);
    const before=JSON.stringify(world);
    await expect(requestCultivatorLLMDecision(guest,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(outsider,world,config,world.tick+1)).resolves.toBeUndefined();
    const selected=await requestCultivatorLLMDecision(guest,world,config,world.tick+1);
    expect(selected).toEqual(exact);
    const content=JSON.parse(String(provider.mock.calls.at(-1)?.[1]?.body)) as {messages:{content:string}[]};
    const permissionLine=content.messages[1].content.split('\n').find(line=>line.includes('"housingMove":"accept"'))!;
    expect(permissionLine).toContain('"targetHousingClaimId":"'+claimId+'"');
    expect(permissionLine).not.toContain(actor(world,hostId).name);
    expect(permissionLine).not.toContain(f.projectId);
    expect(permissionLine).not.toContain(originId);
    for(const forged of [
      {...exact,targetHousingClaimId:'housing-claim-9999'}, {...exact,targetLocationId:siteId}, {...exact,residents:2,bedCount:9},
      {...exact,housingMove:'check_in'}, {...exact,targetHousingHouseholdId:f.householdId},
    ]){
      provider.mockResolvedValueOnce(response(forged));
      await expect(requestCultivatorLLMDecision(guest,world,config,world.tick+1)).resolves.toBeUndefined();
    }
    expect(JSON.stringify(world)).toBe(before);
    const reserved=turn(world,{[guestId]:selected!}), baseline=turn(world);
    expect(reserved.seasonalHousing.claims[0]).toMatchObject({status:'reserved',acceptedTick:reserved.tick});
    expect(reserved.seasonalHousing.claims[0].arrival).toBeUndefined();
    expect(reserved.seasonalHousing.claims[0].checkedInTick).toBeUndefined();
    expect(actor(reserved,guestId).locationId).toBe(originId);
    expect(census(reserved,settlementId)).toEqual(census(baseline,settlementId));
    expect(seasonalHousingTravelTarget(reserved,actor(reserved,guestId),reserved.tick+1)).toBe(siteId);

    const arrived=turn(reserved,{},[guestId]);
    const ordinaryArrival=turn(baseline,{[guestId]:action('EXPLORE',{targetLocationId:siteId})});
    expect(actor(arrived,guestId)).toMatchObject({currentAction:'EXPLORE',locationId:siteId});
    expect(arrived.seasonalHousing.claims[0]).toMatchObject({status:'reserved',
      arrival:{tick:arrived.tick,fromSiteId:originId,toSiteId:siteId}});
    expect(arrived.seasonalHousing.claims[0].checkedInTick).toBeUndefined();
    expect(availableSeasonalHousingActions(actor(arrived,guestId),arrived).some(row=>row.housingMove==='check_in')).toBe(false);

    const occupied=turn(arrived,{},[guestId]), ordinaryStayed=turn(ordinaryArrival);
    expect(occupied.seasonalHousing.claims[0]).toMatchObject({status:'occupied',checkedInTick:occupied.tick});
    expect(census(occupied,settlementId)).toEqual(census(ordinaryStayed,settlementId));
    const left=turn(occupied,{[guestId]:action('EXPLORE',{targetLocationId:originId})});
    const ordinaryLeft=turn(ordinaryStayed,{[guestId]:action('EXPLORE',{targetLocationId:originId})});
    expect(left.seasonalHousing.claims[0]).toMatchObject({status:'moved_out',departure:{tick:left.tick,fromSiteId:siteId,toSiteId:originId}});
    expect(census(left,settlementId)).toEqual(census(ordinaryLeft,settlementId));
    expect(left.events.filter(row=>row.id.includes(claimId)).every(row=>row.witnessScope==='participants')).toBe(true);
    expect(provider).toHaveBeenCalledTimes(8);
  });

  it('cannot check in from nominal site alone; actual season or hazard closures never claim a departure',()=>{
    const f=offeredFixture(), targets={targetHousingClaimId:f.claimId};
    const reserved=turn(f.world,{[f.guestId]:housing('accept',targets)});
    const noArrival=structuredClone(reserved);
    actor(noArrival,f.guestId).locationId=f.siteId;
    const probe=turn(noArrival,{[f.guestId]:housing('check_in',targets)});
    expect(probe.seasonalHousing.claims[0].checkedInTick).toBeUndefined();
    expect(probe.seasonalHousing.claims[0].arrival).toBeUndefined();
    expect(actor(probe,f.guestId).locationId).toBe(f.siteId);

    const occupied=actualOccupancy(), site=occupied.world.locations.find(row=>row.id===occupied.siteId)!;
    let elapsed=occupied.world;
    while(elapsed.tick<occupied.world.seasonalHousing.claims[0].seasonEndTick)elapsed=turn(elapsed);
    expect(elapsed.seasonalHousing.claims[0]).toMatchObject({status:'closed',reason:'season_ended'});
    expect(elapsed.seasonalHousing.claims[0].departure).toBeUndefined();
    expect(actor(elapsed,occupied.guestId).locationId).toBe(occupied.siteId);
    const brush=applyMapBrush(applyMapBrush(occupied.world,'beast_tide',[site]),'beast_tide',[site]);
    const danger=turn(brush);
    expect(danger.seasonalHousing.claims[0]).toMatchObject({status:'closed',reason:'unsafe_shelter',
      hazard:{kind:'beast_tide'}});
    expect(danger.seasonalHousing.claims[0].departure).toBeUndefined();
    expect(actor(danger,occupied.guestId).locationId).toBe(occupied.siteId);
  });
});
