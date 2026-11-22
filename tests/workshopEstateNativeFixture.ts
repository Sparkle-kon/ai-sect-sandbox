import {expect} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {availableEstateActions} from '../src/engine/estateEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {availableWorkshopActions,workshopTerms} from '../src/engine/workshopEngine';
import type {LLMDecisionPayload,WorkshopQualityFloor,WorldState} from '../src/types/world';

export const estatePatronId='npc-1',estateMakerId='elder-taixu-1',estateHeirId='npc-2',estateWorkshopSite='loc-market';
export const estateActor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const estateWork=(world:WorldState)=>world.workshops.orders.find(row=>row.patronId===estatePatronId&&row.makerId===estateMakerId)!;
export const patronEstate=(world:WorldState)=>world.estates.entries.find(entry=>entry.deceasedId===estatePatronId)!;
export const nativeEstateTerms=workshopTerms('法器',1);
export const estateOrder=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'凭已有遗托、实地工坊和本人凭据行事。',...fields});
export function estateMonth(world:WorldState,orders:Record<string,LLMDecisionPayload>={}){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive&&row.hp>0).map(row=>
    [row.id,orders[row.id]??estateOrder('REST')])),()=>.99,'utility',undefined,{captureTrace:false,capturePresentation:false});
}
export function estateVisit(world:WorldState,id:string,site:string){
  const actor=estateActor(world,id);
  if(actor.locationId===site)return;
  const known=knownMapLocations(world,actor),knownTarget=known.some(row=>row.id===site);
  const pool=world.locations.filter(row=>row.id!==actor.locationId&&!(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const unknown=pool.filter(row=>!known.includes(row)),candidates=unknown.length?unknown:pool;
  const index=candidates.findIndex(row=>row.id===site);
  expect(knownTarget||index>=0).toBe(true);
  let draws=0;
  applyCultivatorBrainDecision(world,actor,estateOrder('EXPLORE',knownTarget?{targetLocationId:site}:{}),
    ()=>!knownTarget&&draws++===0?(index+.2)/candidates.length:.99);
  expect(actor.locationId).toBe(site);
}
export function buildEstatePhysicalBlank(qualityFloor:WorkshopQualityFloor='standard'){
  let world=createInitialWorld(1,'spirit-bloom');
  const patron=estateActor(world,estatePatronId);
  // Disclosed setup only: move one starting life to its last calendar year. Native Jan death, court, cash and workshop
  // transitions are genuine. No edited lifetime, year/tick, stock, work receipt or appointment.
  patron.age=patron.lifespan-1;
  world=estateMonth(world,{[estatePatronId]:estateOrder('GATHER_HERBS',{targetHerbId:'earth_root'})});
  expect(estateActor(world,estatePatronId).herbs.earth_root).toBeGreaterThanOrEqual(nativeEstateTerms.totalHerbs);
  for(const id of [estatePatronId,estateMakerId,estateHeirId])estateVisit(world,id,estateWorkshopSite);
  expect(availableEstateActions(estateActor(world,estatePatronId),world).some(row=>
    row.action==='NAME_HEIR'&&row.targetCultivatorId===estateHeirId)).toBe(true);
  world=estateMonth(world,{[estatePatronId]:estateOrder('NAME_HEIR',{targetCultivatorId:estateHeirId})});
  expect(estateActor(world,estatePatronId).namedHeirId).toBe(estateHeirId);
  while(world.tick<9)world=estateMonth(world);
  const choice=availableWorkshopActions(estateActor(world,estatePatronId),world).find(row=>row.workshopMove==='offer'&&
    row.targetCultivatorId===estateMakerId&&row.workshopTier==='法器'&&row.workshopQuantity===1&&row.workshopQualityFloor===qualityFloor);
  expect(choice).toBeDefined();
  world=estateMonth(world,{[estatePatronId]:estateOrder('WORKSHOP',{
    workshopMove:'offer',targetCultivatorId:estateMakerId,workshopTier:'法器',workshopQuantity:1,workshopQualityFloor:qualityFloor,
  })});
  const id=estateWork(world)?.id;
  expect(id).toBeDefined();
  const cash=estateActor(world,estatePatronId).spiritStones;
  world=estateMonth(world,{[estateMakerId]:estateOrder('WORKSHOP',{workshopMove:'accept',targetWorkshopId:id})});
  expect(estateWork(world)).toMatchObject({id,acceptedTick:11,status:'active',escrowStones:nativeEstateTerms.totalStones,
    escrowHerbs:nativeEstateTerms.totalHerbs,makerId:estateMakerId});
  expect(estateActor(world,estatePatronId).spiritStones).toBe(cash-nativeEstateTerms.totalStones);
  world=estateMonth(world,{[estateMakerId]:estateOrder('WORKSHOP',{workshopMove:'work',targetWorkshopId:id})});
  expect(estateWork(world)).toMatchObject({id,escrowStones:nativeEstateTerms.totalStones-nativeEstateTerms.blankFuel,escrowHerbs:1,
    work:[{tick:12,stage:'blank',piece:1,makerId:estateMakerId,stonesUsed:nativeEstateTerms.blankFuel,herbsUsed:1}]});
  return world;
}

export function estateOpenAfterNativeDeath(qualityFloor:WorkshopQualityFloor='standard',trySimultaneousCancel=false){
  const before=buildEstatePhysicalBlank(qualityFloor);
  const world=estateMonth(before,trySimultaneousCancel?{[estateMakerId]:estateOrder('WORKSHOP',{
    workshopMove:'cancel',targetWorkshopId:estateWork(before).id,
  })}:{});
  expect(world.tick).toBe(13);
  expect(estateActor(world,estatePatronId)).toMatchObject({alive:false,hp:0});
  expect(world.events.some(row=>row.id==='evt-13-npc-1-oldage'&&row.category==='death')).toBe(true);
  expect(patronEstate(world)).toMatchObject({status:'open',openedTick:13,namedHeirId:estateHeirId});
  return {before,world};
}
export function estateActualDischarge(qualityFloor:WorkshopQualityFloor='standard'){
  const {before,world:open}=estateOpenAfterNativeDeath(qualityFloor);
  const estate=patronEstate(open);
  expect(availableEstateActions(estateActor(open,estateHeirId),open).some(row=>
    row.action==='CLAIM_ESTATE'&&row.targetEstateId===estate.id)).toBe(true);
  let world=estateMonth(open,{[estateHeirId]:estateOrder('CLAIM_ESTATE',{targetEstateId:estate.id})});
  while(world.tick<estate.closesTick)world=estateMonth(world);
  expect(patronEstate(world)).toMatchObject({status:'settled',beneficiaryId:estateHeirId,settledTick:18,
    claims:[{actorId:estateHeirId,tick:14}]});
  return {before,open,world};
}
