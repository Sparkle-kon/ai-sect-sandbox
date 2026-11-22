import { expect } from 'vitest';
import { createInitialWorld,REALM_BASE_POWER,REALM_LIFESPAN } from '../src/data/initialWorld';
import { knownMapLocations } from '../src/engine/terrainEngine';
import { availableWaterVeinActions } from '../src/engine/waterVeinEngine';
import { availableUpperPassageActions } from '../src/engine/upperPassageEngine';
import type { UpperPassageMove } from '../src/engine/upperPassageTerms';
import { advanceWorldTick,applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMDecisionPayload,WorldState } from '../src/types/world';

export const ascentActorId='npc-1',ascentSite='loc-taixu';
export const travelerId='elder-danxia-1',northSite='loc-vein-north';
export const ascentActor=(world:WorldState,actorId=ascentActorId)=>world.cultivators.find(row=>row.id===actorId)!;
export const command=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({...fields,chosenAction,innerMonologue:'亲历原本所在、应有的行动与年月。'});
const rest=command('REST');

export function ascentMonth(world:WorldState,order:LLMDecisionPayload=rest,roll=.2,id=ascentActorId){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,row.id===id?order:rest])),
    ()=>roll,'utility');
}
export function actualAscentThreshold(wounded=false,stage=9){
  const world=createInitialWorld(1,'spirit-bloom'),body=ascentActor(world);
  // Controlled initial qualification only; all receipts, calendar ticks, waves, transitions and outcomes come from the real turn engine.
  const maxHp=Math.round(REALM_BASE_POWER.渡劫*1.72);
  Object.assign(body,{realm:'渡劫',realmStage:stage,qiProgress:100,maxHp,hp:wounded?Math.round(maxHp*.07):maxHp,
    lifespan:REALM_LIFESPAN.渡劫,combatPower:Math.round(REALM_BASE_POWER.渡劫*1.9)});
  expect(body.locationId).toBe(ascentSite);
  return world;
}

export function genuineReversibleUpper(){
  let world=createInitialWorld(1,'spirit-bloom');
  const elder=ascentActor(world,travelerId),known=knownMapLocations(world,elder);
  const unknown=world.locations.filter(site=>site.id!==elder.locationId&&!known.includes(site));
  const target=known.find(site=>site.id===northSite),i=unknown.findIndex(site=>site.id===northSite);
  expect(!!target||i>=0).toBe(true);
  let draw=0;
  applyCultivatorBrainDecision(world,elder,command('EXPLORE',target?{targetLocationId:northSite}:{}),
    ()=>!target&&draw++===0?(i+.2)/unknown.length:.99);
  expect(elder.locationId).toBe(northSite);
  const village=world.settlements.villages.find(row=>row.locationId===northSite)!;
  const month=(order=rest)=>{world=ascentMonth(world,order,.99,travelerId);};
  month(command('GATHER_HERBS',{targetHerbId:'earth_root'}));
  month(command('VILLAGE_WORKS',{targetSettlementId:village.id,villageWorkKind:'well'}));
  month(command('GATHER_HERBS',{targetHerbId:'earth_root'}));
  month();
  expect(world.villageWorks.projects[0]).toMatchObject({kind:'well',status:'completed'});
  month(command('WATER_VEIN',{waterVeinMove:'open',targetLocationId:northSite}));
  const move=(upperPassageMove:UpperPassageMove)=>{
    const option=availableUpperPassageActions(ascentActor(world,travelerId),world,world.tick+1).find(row=>row.upperPassageMove===upperPassageMove);
    expect(option,`T${world.tick} ${upperPassageMove} at ${ascentActor(world,travelerId).locationId}; openings: ${world.coldWaterVein?.openings.map(row=>row.openedTick).join(",")}`).toBeDefined();
    month(command('UPPER_PASSAGE',{upperPassageMove,targetUpperPassageNodeId:option?.targetUpperPassageNodeId}));
  };
  for(const action of ['enter','advance','advance','advance'] as const)move(action);
  const upper=world;
  expect(ascentActor(upper,travelerId)).toMatchObject({alive:true,positionPlane:'upper'});
  expect(world.upperPassage?.journeys[0]).toMatchObject({actorId:travelerId,paidStones:8});
  move('turnback');
  {
    const reopener=ascentActor(world,'elder-danxia-2'),knownAgain=knownMapLocations(world,reopener);
    const unseen=world.locations.filter(site=>site.id!==reopener.locationId&&!knownAgain.includes(site));
    const seen=knownAgain.some(site=>site.id===northSite),index=unseen.findIndex(site=>site.id===northSite);
    expect(seen||index>=0).toBe(true);
    let draws=0;
    applyCultivatorBrainDecision(world,reopener,command('EXPLORE',seen?{targetLocationId:northSite}:{}),
      ()=>!seen&&draws++===0?(index+.2)/unseen.length:.99);
    expect(reopener.locationId).toBe(northSite);
    for(let i=0;i<14&&!availableWaterVeinActions(ascentActor(world,reopener.id),world,world.tick+1).some(row=>row.waterVeinMove==='open');i++)month();
    world=ascentMonth(world,command('WATER_VEIN',{waterVeinMove:'open',targetLocationId:northSite}),.99,reopener.id);
    expect(world.coldWaterVein?.openings.at(-1)).toMatchObject({openerId:reopener.id,openedTick:world.tick,paidStones:40});
  }
  for(let i=0;i<3&&ascentActor(world,travelerId).positionPlane!==undefined;i++)move('advance');
  expect(ascentActor(world,travelerId)).toMatchObject({alive:true,locationId:northSite});
  expect(ascentActor(world,travelerId).positionPlane).toBeUndefined();
  return {upper,returned:world};
}

export const ascentStart=command('ASCENSION',{ascensionMove:'start'});
export const ascentOrder=(ascensionMove:'guard'|'advance'|'retreat',targetAscensionTrialId:string)=>
  command('ASCENSION',{ascensionMove,targetAscensionTrialId});
export const ascentTrial=(world:WorldState)=>world.ascension!.trials.find(row=>row.actorId===ascentActorId)!;
export function actualAscensionOpen(wounded=false){
  const initial=actualAscentThreshold(wounded);
  const opening=ascentMonth(initial,ascentStart),trial=ascentTrial(opening);
  expect(trial).toMatchObject({actorId:ascentActorId,siteId:ascentSite,startedTick:opening.tick,phase:'warning',openingQiPaid:15,waves:[]});
  return {initial,opening,trial};
}

export function actualAscensionWaves(){
  const native=actualAscensionOpen(),id=native.trial.id;
  const first=ascentMonth(native.opening,ascentOrder('guard',id));
  const second=ascentMonth(first,ascentOrder('advance',id));
  const passed=ascentMonth(second,ascentOrder('guard',id));
  expect(ascentTrial(passed).terminal).toMatchObject({status:'succeeded',tick:passed.tick});
  return {...native,first,second,passed};
}
