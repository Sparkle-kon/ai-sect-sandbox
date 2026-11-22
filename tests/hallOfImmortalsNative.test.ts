import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectHallOfImmortals} from '../src/engine/hallOfImmortalsEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {availableUpperPassageActions} from '../src/engine/upperPassageEngine';
import {advanceWorldTick,applyCultivatorBrainDecision,executeGodIntervention} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {actualCommonBond,actualDefenderWinsLethally,actualPrivateBond,bondActor,bondSite,bondTurn,firstId,nearId,observerId,secondId} from './dramaticBondNativeFixture';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静候原处。'};
const action=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,...fields,innerMonologue:'遵照实际所在与当面实事。'});
const frame=(world:WorldState,commands:Readonly<Record<string,LLMDecisionPayload>>={},roll=.10)=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,commands[row.id]??rest])),()=>roll,'utility');
const read=(world:WorldState,throughTick=world.tick)=>projectHallOfImmortals(world,{
  viewerId:observerId,throughTick,currentVisibleActorIds:new Set(world.cultivators.filter(row=>row.alive&&row.positionPlane===undefined).map(row=>row.id)),currentVisibleSiteIds:new Set(world.locations.filter(row=>row.type!=='secret_realm'&&row.type!=='abyss').map(row=>row.id)),
});

describe('Hall of Immortals reads genuine native evidence',()=>{
  it('retains the genuine public fall after hot rotation without borrowing private schemes, namesakes or future death',()=>{
    const {clash}=actualCommonBond();
    const secret=actualPrivateBond(clash),control=bondTurn(clash);
    const strike=(world:WorldState)=>executeGodIntervention(world,{type:'TRIBULATION_STRIKE',targetCultivatorId:firstId});
    const a=actualDefenderWinsLethally(strike(secret)),b=actualDefenderWinsLethally(strike(control));
    const actual=read(a.world).memorials.find(row=>row.actorId===firstId);
    const independent=read(b.world).memorials.find(row=>row.actorId===firstId);
    expect(actual).toMatchObject({actorId:firstId,deathTick:a.death.tick,name:bondActor(a.world).name});
    expect(actual?.scenes).toEqual(independent?.scenes);
    expect(read(a.world,a.world.tick-1).memorials.some(row=>row.actorId===firstId)).toBe(false);
    const hidden=projectHallOfImmortals(a.world,{viewerId:observerId,currentVisibleActorIds:new Set(),currentVisibleSiteIds:new Set(['loc-taixu'])});
    expect(hidden.memorials.find(row=>row.actorId===firstId)?.scenes.every(row=>!row.text.includes('万仙坊市'))??true).toBe(true);
    expect(a.world.events.find(row=>row.tick===secret.tick&&row.actorIds.includes(firstId)&&row.witnessScope==='participants')).toBeDefined();
    expect(JSON.stringify(actual?.scenes)).not.toContain('暗中设局');
    expect(a.world.eraHistory.receipts).toContainEqual(expect.objectContaining({
      kind:'death',actorId:firstId,eventId:a.death.id,tick:a.death.tick,locationId:bondSite,
    }));

    let historical=a.world;
    for(let turn=0;turn<80&&historical.events.some(row=>row.id===a.death.id);turn++){
      historical=frame(historical,{
        [secondId]:action('SOCIALIZE',{targetCultivatorId:nearId}),
        [nearId]:action('SOCIALIZE',{targetCultivatorId:secondId}),
      });
    }
    expect(historical.tick).toBeGreaterThan(a.world.tick);
    expect(historical.events.some(row=>row.id===a.death.id)).toBe(false);
    expect(historical.cultivators.find(row=>row.id===nearId)?.alive).toBe(true);
    const before=encodeEraWorldSave(historical),restored=decodeEraWorldSave(before);
    const listed=read(restored).memorials.find(row=>row.actorId===firstId);
    expect(listed?.deathTick).toBe(a.death.tick);
    expect(listed?.scenes.some(row=>row.tick===a.death.tick)).toBe(true);
    expect(read(restored).memorials.some(row=>row.actorId===nearId)).toBe(false);
    expect(encodeEraWorldSave(historical)).toBe(before);
  },20000);

  it('does not rebrand actual paid returnable travel into the upper realm as ascension',()=>{
    const travelId='elder-danxia-1',north='loc-vein-north';
    let world=createInitialWorld(1,'spirit-bloom');
    const actor=()=>world.cultivators.find(row=>row.id===travelId)!;
    const known=knownMapLocations(world,actor());
    const unknown=world.locations.filter(site=>site.id!==actor().locationId&&!known.includes(site));
    const isKnown=known.some(site=>site.id===north);
    const index=unknown.findIndex(site=>site.id===north);
    expect(isKnown||index>=0).toBe(true);
    let draw=0;
    applyCultivatorBrainDecision(world,actor(),action('EXPLORE',isKnown?{targetLocationId:north}:{}),
      ()=>!isKnown&&draw++===0?(index+.2)/unknown.length:.99);
    expect(actor().locationId).toBe(north);
    const settlement=world.settlements.villages.find(row=>row.locationId===north)!;
    const step=(decision=rest)=>{world=frame(world,{[travelId]:decision},.99);};
    step(action('GATHER_HERBS',{targetHerbId:'earth_root'}));
    step(action('VILLAGE_WORKS',{targetSettlementId:settlement.id,villageWorkKind:'well'}));
    step(action('GATHER_HERBS',{targetHerbId:'earth_root'}));
    step();
    expect(world.villageWorks.projects[0]).toMatchObject({kind:'well',status:'completed'});
    step(action('WATER_VEIN',{waterVeinMove:'open',targetLocationId:north}));
    for(const move of ['enter','advance','advance','advance'] as const){
      const option=availableUpperPassageActions(actor(),world,world.tick+1).find(row=>row.upperPassageMove===move)!;
      expect(option).toBeDefined();
      step(action('UPPER_PASSAGE',{upperPassageMove:move,targetUpperPassageNodeId:option.targetUpperPassageNodeId}));
    }
    expect(actor()).toMatchObject({alive:true,positionPlane:'upper'});
    expect(world.upperPassage?.journeys[0]).toMatchObject({actorId:travelId,paidStones:8});
    expect(read(world).ascended).toEqual([]);
    expect(read(world).memorials.some(row=>row.actorId===travelId)).toBe(false);
  });

  it('recognizes an actual public paid furnace success and excludes a later real failed brew',()=>{
    const id='npc-5',siteId='loc-danxia';
    const start=createInitialWorld(1,'spirit-bloom'),body=(world:WorldState)=>world.cultivators.find(row=>row.id===id)!;
    expect(body(start).locationId).toBe(siteId);
    expect(read(start).rankings.alchemy.some(row=>row.actorId===id)).toBe(false);
    const jade=frame(start,{[id]:action('GATHER_HERBS',{targetHerbId:'jade_leaf'})});
    const earth=frame(jade,{[id]:action('GATHER_HERBS',{targetHerbId:'earth_root'})});
    const success=frame(earth,{[id]:action('BREW_PILL',{targetPillId:'foundation'})});
    expect(body(success).pills.foundation-body(earth).pills.foundation).toBe(1);
    expect(success.furnaceReservations.uses).toContainEqual(expect.objectContaining({actorId:id,siteId,kind:'brew',tick:success.tick}));
    expect(body(success).publicAlchemy).toEqual([{siteId,firstTick:success.tick,lastTick:success.tick,successes:1,bestGrade:1}]);
    expect(read(success).rankings.alchemy).toContainEqual(expect.objectContaining({actorId:id,score:1}));
    const moreJade=frame(success,{[id]:action('GATHER_HERBS',{targetHerbId:'jade_leaf'})});
    const failure=frame(moreJade,{[id]:action('BREW_PILL',{targetPillId:'foundation'})},.99);
    expect(failure.events.find(row=>row.tick===failure.tick&&row.id.endsWith(`-${id}-alchemy`))?.title).toContain('炼丹失手');
    expect(body(failure).pills.foundation).toBe(body(moreJade).pills.foundation);
    expect(body(failure).publicAlchemy).toEqual(body(success).publicAlchemy);
    expect(read(decodeEraWorldSave(encodeEraWorldSave(failure))).rankings.alchemy).toEqual(read(success).rankings.alchemy);
  });
});
