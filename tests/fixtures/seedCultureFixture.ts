import { createInitialWorld } from '../../src/data/initialWorld';
import { resolveAlchemy } from '../../src/engine/alchemyEngine';
import { resolveSeedCultureAction } from '../../src/engine/seedCultureEngine';
import { advanceWorldTick } from '../../src/engine/worldEngine';
import type { LLMDecisionPayload, SeedCultureMove, WorldState } from '../../src/types/world';

export const seedPerson=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const seedSite=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id)!;
export const seedPayload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'核对有限样本与田圃的实物。',...fields});
export const seedDecision=(seedMove:SeedCultureMove,id:string)=>seedPayload('SEED_CULTURE',seedMove==='reserve'?
  {seedMove,targetLocationId:id}:seedMove==='harvest'?{seedMove,targetSeedPlotId:id}:{seedMove,targetSeedLotId:id});
export const seedTurn=(world:WorldState,decisions:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(({id})=>[id,decisions[id]??seedPayload('REST')])),()=>.99);

export function seedCultureBase(seed=18) {
  const world=createInitialWorld(seed);
  world.tick=26;world.month=4;
  const site=world.locations.find(row=>row.id==='loc-vein-north')!;
  const [owner]=world.cultivators;
  const competitor=world.cultivators.find(row=>row.id!==owner.id&&row.sectId===owner.sectId)!;
  const outsider=world.cultivators.find(row=>row.sectId!==owner.sectId)!;
  site.ownerSectId=owner.sectId;
  site.herbCapacity.jade_leaf=Math.max(8,site.herbCapacity.jade_leaf);
  site.herbs.jade_leaf=8;
  for(const actor of [owner,competitor,outsider]){
    actor.locationId=site.id;actor.age=33;actor.lifespan=120;actor.hp=actor.maxHp;
    actor.tribulation=undefined;actor.guardAssignment=undefined;actor.herbs.jade_leaf=0;
    actor.combatPower=Math.max(2000,actor.combatPower);
  }
  for(const actor of [owner,competitor]){
    if(!resolveAlchemy(world,actor,seedPayload('GATHER_HERBS',{targetHerbId:'jade_leaf'}),()=>.99))
      throw Error('fixture actual mature gathered herbs');
  }
  return {world,siteId:site.id,ownerId:owner.id,competitorId:competitor.id,outsiderId:outsider.id};
}

export function reservedSeedCulture(seed=18){
  const f=seedCultureBase(seed);
  f.world.tick++;
  for(const id of [f.ownerId,f.competitorId]){
    if(!resolveSeedCultureAction(f.world,seedPerson(f.world,id),seedDecision('reserve',f.siteId)))throw Error('fixture reserve');
  }
  const reserved=f.world.seedCulture.lots.find(row=>row.ownerId===f.ownerId)!;
  const competing=f.world.seedCulture.lots.find(row=>row.ownerId===f.competitorId)!;
  return {...f,lotId:reserved.id,competingLotId:competing.id};
}

export function testedSeedCulture(seed=18){
  const f=reservedSeedCulture(seed);
  f.world.tick++;
  for(const [person,lot] of [[f.ownerId,f.lotId],[f.competitorId,f.competingLotId]]){
    if(!resolveSeedCultureAction(f.world,seedPerson(f.world,person),seedDecision('test',lot)))throw Error('fixture test');
  }
  return f;
}

export function plantedSeedCulture(seed=18){
  const f=testedSeedCulture(seed);
  f.world.tick++;
  if(!resolveSeedCultureAction(f.world,seedPerson(f.world,f.ownerId),seedDecision('plant',f.lotId)))throw Error('fixture plant');
  return {...f,plotId:f.world.seedCulture.plots[0].id};
}

export function matureSeedCulture(seed=18){
  const f=plantedSeedCulture(seed);
  let {world}=f;
  for(let i=0;i<3;i++)world=seedTurn(world);
  return {...f,world};
}
