import {describe,expect,it,vi} from 'vitest';
import {buildLocalCourtyard,hitLocalCourtyard} from '../src/components/localCourtyardModel';
import {createTerrainMapView} from '../src/components/terrainMapView';
import {createInitialWorld} from '../src/data/initialWorld';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {availableSettlementActions,SETTLEMENT_RECRUIT_STIPEND} from '../src/engine/settlementEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';
import {acceptedNativeFreight,freightCarrier,freightContract,freightDestination,freightMonth,freightOrigin,freightOther,
  freightSeller,freightShipment} from './marketFreightNativeFixture';

const person=(world:WorldState,id='npc-1')=>world.cultivators.find(row=>row.id===id)!;
const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在实地安顿。'};
const quiet=(world:WorldState):Record<string,LLMDecisionPayload>=>Object.fromEntries(world.cultivators.map(row=>[row.id,idle]));
const move=(targetLocationId:string):LLMDecisionPayload=>({chosenAction:'EXPLORE',targetLocationId,innerMonologue:'亲身到达此处。'});
function at(world:WorldState,siteId:string,viewer?:Cultivator){
  return buildLocalCourtyard(world,createTerrainMapView(world,viewer,!!viewer),siteId,{viewer});
}
function turn(world:WorldState,commands:Record<string,LLMDecisionPayload>={}){
  return advanceWorldTick(world,{...quiet(world),...commands},()=>.99);
}
function era(world:WorldState){
  const source=encodeEraWorldSave(world),parsed=decodeEraWorldSave(source);
  expect(encodeEraWorldSave(parsed)).toBe(source);
  return parsed;
}

describe('local courtyard uses physical native presence and authorizes no new mechanics',()=>{
  it('shows exact current canonical grounds and facilities, never the forged, remembered, historical, or other-plane site',()=>{
    const world=createInitialWorld(1),viewer=person(world);
    const da='loc-taixu';
    const today=createTerrainMapView(world,viewer,true);
    const before=encodeEraWorldSave(world);
    const plan=buildLocalCourtyard(world,today,da,{viewer})!;
    expect(plan).toMatchObject({siteId:da,siteName:'太虚剑峰',columns:16,rows:10,width:640,height:400});
    expect(plan.tiles).toHaveLength(160);
    const body=plan.actors.find(row=>row.id===viewer.id)!;
    expect(body).toMatchObject({id:viewer.id,name:viewer.name,realm:`${viewer.realm}${viewer.realmStage}层`});
    expect(hitLocalCourtyard(plan,{x:body.x,y:body.y-7})).toEqual({kind:'actor',id:viewer.id});
    expect(hitLocalCourtyard(plan,{x:Infinity,y:11})).toBeUndefined();
    expect(plan.facilities.map(row=>row.kind)).toEqual(expect.arrayContaining(['gate','pavilion','furnace','herbs']));
    expect(plan.facilities.some(row=>row.kind==='array')).toBe(false);
    const gateFacility=plan.facilities.find(row=>row.kind==='gate')!;
    const realSect=world.sects.find(row=>row.headquartersId===da)!;
    expect(gateFacility.detail).toContain(realSect.name);
    expect(hitLocalCourtyard(plan,gateFacility)).toEqual({kind:'facility',id:gateFacility.id});
    const built=turn(world,{[viewer.id]:{chosenAction:'BUILD_FACILITY',facilityKind:'defense_array',innerMonologue:'原地实修护山阵。'}});
    const realArray=built.sects.find(row=>row.id===realSect.id)!;
    expect(realArray.facilities.defense_array).toBe(1);
    expect(realArray.arrayHp).toBeGreaterThan(0);
    expect(built.events.some(row=>row.tick===built.tick&&row.actorIds.includes(viewer.id)&&row.title.includes('护山阵'))).toBe(true);
    expect(at(built,da,person(built,viewer.id))?.facilities).toContainEqual(expect.objectContaining({kind:'array',label:'护山阵'}));
    expect(new Set(plan.facilities.map(row=>row.id)).size).toBe(plan.facilities.length);
    const out=person(world,'npc-3');
    expect(out.locationId).not.toBe(da);
    expect(at(world,da,out)).toBeUndefined();
    expect(buildLocalCourtyard(world,today,da,{viewer,historical:true})).toBeUndefined();
    expect(buildLocalCourtyard(world,today,da,{viewer:{...viewer}})).toBeUndefined();
    expect(at(world,'forged-courtyard')).toBeUndefined();
    const row=world.locations.find(row=>row.id===da)!;
    const duplicated={...world,locations:[...world.locations,{...row}]};
    expect(at(duplicated,da,viewer)).toBeUndefined();
    const gate={...row,id:'unknown-courtyard-gate',type:'secret_realm' as const,expeditionOmenId:'forged-omen'};
    expect(at({...world,locations:[...world.locations,gate]},gate.id)).toBeUndefined();
    const upper={...viewer,positionPlane:'upper' as const};
    const upstairs={...world,cultivators:world.cultivators.map(row=>row.id===upper.id?upper:row)};
    expect(at(upstairs,da,upper)).toBeUndefined();
    const moved=turn(world,{[viewer.id]:move('loc-market')});
    const actual=person(moved,viewer.id);
    const viewed=createTerrainMapView(moved,actual,true);
    expect(actual.exploredTileIds).toContain(terrainTileAt(moved,row.x,row.y)?.id);
    expect(terrainTileAt(moved,row.x,row.y)&&viewed.tileState(terrainTileAt(moved,row.x,row.y)!)).toBe('explored');
    expect(at(moved,da,actual)).toBeUndefined();
    expect(at(moved,'loc-market',actual)?.actors.some(row=>row.id===viewer.id)).toBe(true);
    expect(encodeEraWorldSave(world)).toBe(before);
  });

  it('paints Danxia ornamental water and a bridge without adding citizens, terrain locations or hit targets',()=>{
    const world=createInitialWorld(1),before=encodeEraWorldSave(world);
    const plan=at(world,'loc-danxia')!;
    expect(plan.theme).toBe('pill_valley');
    expect(plan.season).toBe('spring');
    expect(plan.tiles.filter(row=>row.ground==='water')).toHaveLength(9);
    expect(plan.tiles.filter(row=>row.ground==='bridge')).toEqual([{col:13,row:5,ground:'bridge'}]);
    expect(hitLocalCourtyard(plan,{x:580,y:60})).toBeUndefined();
    expect(plan.facilities.some(row=>/水|桥/.test(row.label))).toBe(false);
    expect(plan.actors.every(row=>plan.tiles.find(t=>t.col===row.col&&t.row===row.row)?.ground!=='water')).toBe(true);
    expect(new Set(plan.actors.map(row=>row.row)).size).toBeGreaterThan(1);
    for(const item of plan.facilities){
      expect(hitLocalCourtyard(plan,{x:item.x,y:item.y})).toEqual({kind:'facility',id:item.id});
    }
    expect(at({...world,month:10},'loc-danxia')?.season).toBe('winter');
    expect(at(world,'loc-market')?.tiles.some(row=>row.ground==='water')).toBe(false);
    expect(encodeEraWorldSave(world)).toBe(before);
  });

  it('uses identical nonmutating courtyard outputs from validated Cognitive and ordinary Utility travel',async()=>{
    const start=createInitialWorld(1),hero=person(start);
    const travel=move('loc-market'),basic=turn(start,{[hero.id]:travel}),before=encodeEraWorldSave(start);
    llmScheduler.resetTickBudget();
    const provider=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(travel)}}]})));
    vi.stubGlobal('fetch',provider);
    let result:LLMDecisionPayload|undefined;
    try{
      result=await requestCultivatorLLMDecision(hero,start,{enabled:true,
        apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture-only',model:'fixture'},start.tick+1);
      expect(provider).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject(travel);
    }finally{vi.unstubAllGlobals();llmScheduler.resetTickBudget();}
    if(!result)throw new Error('Native model must choose the exact eligible route');
    const model=advanceWorldTick(start,{...quiet(start),[hero.id]:result},()=>.99,'deferred',undefined,{modelActors:new Set([hero.id])});
    expect(person(basic).locationId).toBe('loc-market');
    expect(person(model).locationId).toBe('loc-market');
    expect(model.mapPresentation?.trails.find(row=>row.cultivatorId===hero.id))
      .toMatchObject({fromLocationId:hero.locationId,toLocationId:'loc-market'});
    const native=at(basic,'loc-market',person(basic))!,cognitive=at(model,'loc-market',person(model))!;
    expect(cognitive).toEqual(native);
    expect(native.actors.filter(row=>row.id===hero.id)).toHaveLength(1);
    expect(JSON.stringify(native)).not.toContain(travel.innerMonologue);
    expect(at(basic,hero.locationId,person(basic))).toBeUndefined();
    const restored=era(basic);
    expect(at(restored,'loc-market',person(restored))).toEqual(native);
    expect(encodeEraWorldSave(start)).toBe(before);
  });

  it('draws only native eligible named adult volunteers and converts only an actually paid candidate to a present cultivator',()=>{
    let world=createInitialWorld(2031);
    const sponsor='npc-5',market='loc-market';
    while(world.tick<28)world=turn(world);
    world=turn(world,{[sponsor]:move(market)});
    const who=person(world,sponsor);
    expect(who.locationId).toBe(market);
    const village=world.settlements.villages.find(row=>row.locationId===market)!;
    const exact=availableSettlementActions(who,world).filter(row=>row.action==='RECRUIT_SETTLER'&&row.targetSettlementId===village.id);
    expect(exact.length).toBeGreaterThan(0);
    const nativePlan=at(world,market,who)!;
    expect(nativePlan.population).toBe(village.population);
    expect(nativePlan.villagers.map(row=>row.id).sort()).toEqual(exact.map(row=>row.targetVolunteerId).sort());
    for(const option of exact){
      const candidate=village.volunteers.find(row=>row.id===option.targetVolunteerId)!;
      expect(candidate.age).toBeGreaterThanOrEqual(18);
      expect(world.households.members.find(row=>row.volunteerId===candidate.id)).toMatchObject({
        settlementId:village.id,status:'resident',
      });
      expect(nativePlan.villagers.some(row=>row.id===candidate.id&&row.name===candidate.name)).toBe(true);
    }
    expect(at(world,market)?.villagers).toEqual([]);
    expect(at(world,market)?.population).toBeUndefined();
    const sameLocationNoSponsor=structuredClone(world);
    for(const faction of sameLocationNoSponsor.sects)if(faction.id===who.sectId)faction.spiritStones=0;
    const poor=person(sameLocationNoSponsor,sponsor);
    expect(availableSettlementActions(poor,sameLocationNoSponsor).some(row=>row.action==='RECRUIT_SETTLER')).toBe(false);
    expect(at(sameLocationNoSponsor,market,poor)?.villagers).toEqual([]);
    expect(at(world,market,person(world,'npc-3'))).toBeUndefined();
    for(const token of ['secretGoal','innerMonologue','birthTick','householdId'])expect(JSON.stringify(nativePlan)).not.toContain(token);
    const [consenting]=exact;
    const {action,...fields}=consenting;
    const recruited=turn(world,{[sponsor]:{...fields,chosenAction:action,innerMonologue:'尊重本人应允。'}});
    const recruitId=`recruit-${consenting.targetVolunteerId}`;
    const receipt=recruited.settlements.records.find(row=>row.cultivatorId===recruitId);
    expect(receipt).toMatchObject({kind:'recruitment',tick:recruited.tick,settlementId:village.id,
      people:1,stones:SETTLEMENT_RECRUIT_STIPEND,actorId:who.id});
    const after=at(recruited,market,person(recruited,sponsor))!;
    expect(after.villagers.some(row=>row.id===consenting.targetVolunteerId)).toBe(false);
    expect(after.actors.filter(row=>row.id===recruitId)).toHaveLength(1);
    expect(nativePlan.actors.some(row=>row.id===recruitId)).toBe(false);
    const restored=era(recruited);
    expect(at(restored,market,person(restored,sponsor))).toEqual(after);
  });

  it('does not paint a paid actual freight guide at either endpoint until physical arrival',()=>{
    const accepted=acceptedNativeFreight(),start=accepted.world;
    let moving=start;
    for(let i=0;i<5&&(freightContract(moving)?.pathIndex??0)===0;i++)moving=freightMonth(moving);
    const contract=freightContract(moving)!;
    expect(contract.status).toBe('active');
    expect(contract.pathIndex).toBeGreaterThan(0);
    expect(contract.pathIndex).toBeLessThan(contract.path.length-1);
    expect(contract.feePaid).toBeGreaterThan(0);
    expect(person(moving,freightCarrier).locationId).toBe(freightOrigin);
    for(const site of [freightOrigin,freightDestination]){
      expect(at(moving,site)?.actors.some(row=>row.id===freightCarrier)).toBe(false);
    }
    const seller=person(moving,freightSeller),byStander=person(moving,freightOther);
    expect(at(moving,freightOrigin,seller)?.actors.some(row=>row.id===freightCarrier)).toBe(false);
    expect(at(moving,freightOrigin,byStander)?.actors.some(row=>row.id===freightCarrier)).toBe(false);
    let delivered=moving;
    for(let i=0;i<12&&freightShipment(delivered)?.status==='in_transit';i++)delivered=freightMonth(delivered);
    expect(freightShipment(delivered)?.status).toBe('delivered');
    expect(person(delivered,freightCarrier).locationId).toBe(freightDestination);
    expect(at(delivered,freightDestination)?.actors.filter(row=>row.id===freightCarrier)).toHaveLength(1);
    expect(at(delivered,freightOrigin)?.actors.some(row=>row.id===freightCarrier)).toBe(false);
  });

  it('retains a complete crowded native-shape roster rather than treating 160 courtyard tiles as a population cap',()=>{
    const world=createInitialWorld(1),origin='loc-taixu';
    const hero=person(world);
    const baseCount=at(world,origin)?.actors.length??0;
    const crowd=structuredClone(world);
    // Disclosed stress input only: 272 independently identified living actors at the same canonical place.
    crowd.cultivators.push(...Array.from({length:272},(_,i)=>({
      ...structuredClone(hero),id:`stress-courtyard-${i}`,name:`石砚${i}`,
    })));
    const plan=at(crowd,origin)!;
    expect(plan.tiles).toHaveLength(160);
    expect(plan.actors).toHaveLength(baseCount+272);
    expect(new Set(plan.actors.map(row=>row.id)).size).toBe(plan.actors.length);
    expect(plan.actors.filter(row=>row.id.startsWith('stress-courtyard-'))).toHaveLength(272);
    expect(plan.actors.every(row=>row.col>=0&&row.col<16&&row.row>=0&&row.row<10)).toBe(true);
    const reversed={...crowd,cultivators:[...crowd.cultivators].reverse()};
    expect(at(reversed,origin)).toEqual(plan);
  });
});
