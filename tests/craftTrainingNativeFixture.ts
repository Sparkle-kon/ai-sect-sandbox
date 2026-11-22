import {createInitialWorld} from '../src/data/initialWorld';
import {availableCraftTrainingActions} from '../src/engine/craftTrainingEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

export const craftKeeper='npc-1',craftFirst='npc-2',craftSecond='elder-taixu-1',craftSite='loc-taixu',craftSect='sect-qingyun';
export const craftActor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const craftProject=(world:WorldState)=>world.craftTraining?.projects[0];
export function craftAssert(value:unknown,message:string):asserts value{if(!value)throw Error(message);}
export const craftDecision=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只凭本人签名、亲手实练与实账。',...fields});
export function craftMonth(world:WorldState,orders:Readonly<Record<string,LLMDecisionPayload>>={},wounded=false){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive&&row.hp>0).map(row=>
    [row.id,orders[row.id]??(wounded&&row.id===craftSecond?craftDecision('GATHER_HERBS',{targetHerbId:'jade_leaf'}):craftDecision('REST'))])),
    ()=>.99,'utility',undefined,{captureTrace:false,capturePresentation:false});
}
export function craftChoice(world:WorldState,id:string,move:NonNullable<LLMDecisionPayload['craftTrainingMove']>):LLMDecisionPayload{
  const option=availableCraftTrainingActions(craftActor(world,id),world,world.tick+1).find(row=>row.craftTrainingMove===move&&
    (row.craftTrainingMove!=='offer'||row.targetCultivatorId===craftFirst&&row.targetCraftTraineeId===craftSecond));
  craftAssert(option,`No actual ${move} for ${id} at T${world.tick}`);
  const {action,...terms}=option;
  return craftDecision(action,terms);
}
export function prepareNativeCraftTraining(wounded=false){
  let world=createInitialWorld(1,'spirit-bloom');
  // Controlled seed: the first trainee begins at his own HQ. The deliberately failing branch has a genuine injury
  // and novice starting mastery; native actions never edit health, receipts, date, slot, grade, agreements or inventory.
  craftActor(world,craftFirst).locationId=craftSite;
  if(wounded){
    const trainee=craftActor(world,craftSecond);
    trainee.techniqueMastery=0;
    trainee.hp=Math.floor(trainee.maxHp*.4);
  }
  world=craftMonth(world,{[craftKeeper]:craftDecision('BUILD_FACILITY',{facilityKind:'alchemy_hall'})},wounded);
  craftAssert(world.sects.find(row=>row.id===craftSect)?.facilities.alchemy_hall===1,'Native keeper must really build actual hall');
  world=craftMonth(world,{[craftKeeper]:craftDecision('GATHER_HERBS',{targetHerbId:'earth_root'})},wounded);
  craftAssert(craftActor(world,craftKeeper).herbs.earth_root>=2,'Keeper must actually acquire two roots');
  return world;
}
export function offeredNativeCraftTraining(wounded=false){
  const before=prepareNativeCraftTraining(wounded);
  const world=craftMonth(before,{[craftKeeper]:craftChoice(before,craftKeeper,'offer')},wounded);
  const row=craftProject(world);
  craftAssert(row,'No native training offer');
  return {before,world,row};
}
export function fundedNativeCraftTraining(wounded=false){
  const offered=offeredNativeCraftTraining(wounded);
  const first=craftMonth(offered.world,{[craftFirst]:craftChoice(offered.world,craftFirst,'join')},wounded);
  const world=craftMonth(first,{[craftSecond]:craftChoice(first,craftSecond,'join')},wounded);
  const row=craftProject(world);
  craftAssert(row,'No native funded training');
  return {...offered,offered:offered.world,first,world,row};
}
export function blankNativeCraftTraining(wounded=false){
  const funded=fundedNativeCraftTraining(wounded);
  const world=craftMonth(funded.world,{[craftFirst]:craftChoice(funded.world,craftFirst,'blank')},wounded);
  const row=craftProject(world);
  craftAssert(row,'No native blank');
  return {...funded,funded:funded.world,world,row};
}
export function finishedNativeCraftTraining(wounded=false){
  const blank=blankNativeCraftTraining(wounded);
  const world=craftMonth(blank.world,{[craftSecond]:craftChoice(blank.world,craftSecond,'finish')},wounded);
  const row=craftProject(world);
  craftAssert(row,'No native finish');
  return {...blank,blank:blank.world,world,row};
}
