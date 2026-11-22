import {HEAVENLY_HEATS,HEAVENLY_RECIPE_IDS,type HeavenlyAlchemyAttempt,type HeavenlyAlchemyState,
  type HeavenlyHeat,type HeavenlyQuality,type HeavenlyRecipeId} from '../types/heavenlyAlchemy';
import type {Cultivator,HerbId,LLMDecisionPayload,LocationNode,TribulationTrial,WorldEvent,WorldState} from '../types/world';
import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {disasterShelterLocksTravel} from './disasterShelterCheckpoint';
import {activeEscortForActor} from './escortEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {canUseFurnace,claimFurnaceUse} from './furnaceReservationEngine';
import {activePilgrimageForActor} from './pilgrimageEngine';
import {activeRelocationForActor} from './relocationEngine';
import {activeCourierForActor} from './sealedCourierEngine';
import {sparringLocksActor} from './sparringEngine';
import {
  HEAVENLY_ALCHEMY_MAX_ATTEMPTS,HEAVENLY_ALCHEMY_QUALITY,HEAVENLY_ALCHEMY_RECIPES,HEAVENLY_WARD_TICKS,
  heavenlyAlchemyEventId,heavenlyBrewId,heavenlyPillQuality,
} from './heavenlyAlchemyTerms';

export type HeavenlyAlchemyOption={action:'HEAVENLY_ALCHEMY';targetHeavenlyRecipeId:HeavenlyRecipeId}&(
  |{heavenlyAlchemyMove:'brew';heavenlyAlchemyHeat:HeavenlyHeat;heavenlyAlchemyQuality?:never}
  |{heavenlyAlchemyMove:'take';heavenlyAlchemyQuality:HeavenlyQuality;heavenlyAlchemyHeat?:never}
);
const HERBS:readonly HerbId[]=['jade_leaf','earth_root','star_bloom','shadow_moss'];
const unique=<T extends {id:string}>(rows:readonly T[],id:string):T|undefined=>{
  let found:T|undefined;
  for(const row of rows){if(row.id!==id)continue;if(found)return undefined;found=row;}
  return found;
};
function localFurnaceSite(world:WorldState,actor:Cultivator):LocationNode|undefined{
  if(!actor.alive||actor.hp<=0||actor.positionPlane!==undefined||unique(world.cultivators,actor.id)!==actor||
    actor.tribulation?.stage==='lightning'||actor.tribulation?.stage==='heart_demon'||
    world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(actor.id))||
    world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(actor.id)&&
      !row.dungeon?.members.some(member=>member.actorId===actor.id&&member.leftTick!==undefined)&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(actor.id)))||
    world.forbiddenDuels?.some(row=>row.attackerId===actor.id||row.defenderId===actor.id)||
    activeDanxiaMedicineEscort(world,actor)||activeEscortForActor(world,actor)||activePilgrimageForActor(world,actor)||
    activeRelocationForActor(world,actor)||activeCourierForActor(world,actor)||disasterShelterLocksTravel(world,actor)||
    expeditionRescueCheckpoint(world,actor)||boundaryReliefCheckpoint(world,actor)||sparringLocksActor(world,actor))return undefined;
  const site=unique(world.locations,actor.locationId);
  return site&&site.type!=='secret_realm'&&site.type!=='abyss'&&!isScopedExpeditionGate(site)?site:undefined;
}
const actionBase=(targetHeavenlyRecipeId:HeavenlyRecipeId)=>({action:'HEAVENLY_ALCHEMY' as const,targetHeavenlyRecipeId});
const acted=(state:HeavenlyAlchemyState|undefined,tick:number)=>
  state?.attempts.some(row=>row.tick===tick||row.use?.tick===tick)??false;
const prunable=(row:HeavenlyAlchemyAttempt,wardId?:string)=>row.id!==wardId&&(!row.quality||row.use!==undefined);
const holdable=(state:HeavenlyAlchemyState|undefined)=>!state||state.attempts.length<HEAVENLY_ALCHEMY_MAX_ATTEMPTS||
  state.attempts.some(row=>prunable(row,state.ward?.brewId));
function liveWard(actor:Cultivator,tick:number){
  const ward=actor.heavenlyAlchemy?.ward;
  return ward&&ward.expiresTick>=tick?ward:undefined;
}
export function availableHeavenlyAlchemyActions(actor:Cultivator,world:WorldState,executionTick=world.tick):HeavenlyAlchemyOption[]{
  if(executionTick!==world.tick&&executionTick!==world.tick+1||acted(actor.heavenlyAlchemy,executionTick))return [];
  const site=localFurnaceSite(world,actor);
  if(!site)return [];
  const options:HeavenlyAlchemyOption[]=[];
  let furnace:boolean|undefined;
  for(const recipeId of HEAVENLY_RECIPE_IDS){
    const recipe=HEAVENLY_ALCHEMY_RECIPES[recipeId];
    if(site.furnaceGrade===3&&holdable(actor.heavenlyAlchemy)&&actor.spiritStones>=recipe.stones&&
      HERBS.every(herb=>actor.herbs[herb]>=(recipe.herbs[herb]??0))&&
      (furnace??=canUseFurnace(world,actor,site.id,'brew',undefined,executionTick))){
      for(const heavenlyAlchemyHeat of HEAVENLY_HEATS)options.push({...actionBase(recipeId),heavenlyAlchemyMove:'brew',heavenlyAlchemyHeat});
    }
    if(recipeId==='tribulation_divine'&&liveWard(actor,executionTick)||
      recipeId==='nine_turn_golden'&&actor.qiProgress>=100&&actor.hp>=actor.maxHp)continue;
    const stock=new Set<HeavenlyQuality>();
    for(const row of actor.heavenlyAlchemy?.attempts??[]){
      if(row.recipeId===recipeId&&row.tick<executionTick&&row.quality&&!row.use)stock.add(row.quality);
    }
    for(const heavenlyAlchemyQuality of stock)options.push({...actionBase(recipeId),heavenlyAlchemyMove:'take',heavenlyAlchemyQuality});
  }
  return options;
}
const actionFields:ReadonlySet<string>=new Set(['chosenAction','innerMonologue','heavenlyAlchemyMove','targetHeavenlyRecipeId',
  'heavenlyAlchemyHeat','heavenlyAlchemyQuality']);
const isLightning=(quality:HeavenlyQuality|undefined):quality is 'immortal'|'peerless'=>quality==='immortal'||quality==='peerless';
export function resolveHeavenlyAlchemyAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload,rng:()=>number):WorldEvent|null{
  if(decision.chosenAction!=='HEAVENLY_ALCHEMY'||Object.keys(decision).some(key=>!actionFields.has(key)))return null;
  const option=availableHeavenlyAlchemyActions(actor,world).find(row=>row.targetHeavenlyRecipeId===decision.targetHeavenlyRecipeId&&
    row.heavenlyAlchemyMove===decision.heavenlyAlchemyMove&&row.heavenlyAlchemyHeat===decision.heavenlyAlchemyHeat&&
    row.heavenlyAlchemyQuality===decision.heavenlyAlchemyQuality);
  const site=option&&localFurnaceSite(world,actor);
  if(!option||!site)return null;
  const recipeId=option.targetHeavenlyRecipeId,recipe=HEAVENLY_ALCHEMY_RECIPES[recipeId];
  const move=option.heavenlyAlchemyMove;
  const base={id:heavenlyAlchemyEventId(actor.id,world.tick,move),tick:world.tick,year:world.year,month:world.month,
    actorIds:[actor.id],locationId:site.id};
  if(move==='brew'){
    if(!claimFurnaceUse(world,actor,site.id,'brew'))return null;
    actor.spiritStones-=recipe.stones;
    for(const herb of HERBS)actor.herbs[herb]-=recipe.herbs[herb]??0;
    const state=actor.heavenlyAlchemy??(actor.heavenlyAlchemy={attempts:[]});
    if(state.ward&&state.ward.expiresTick<world.tick)delete state.ward;
    const heatDraw=rng();
    const roll=Number.isFinite(heatDraw)?Math.max(0,Math.min(999,Math.floor(heatDraw*1000))):0;
    const attempt:HeavenlyAlchemyAttempt={id:heavenlyBrewId(actor.id,world.tick),tick:world.tick,siteId:site.id,
      recipeId,heat:option.heavenlyAlchemyHeat,roll,mastery:actor.techniqueMastery,toxicity:actor.pillToxicity,fireRoot:actor.spiritRoot==='火'};
    const quality=heavenlyPillQuality(attempt);
    if(quality)attempt.quality=quality;
    if(state.attempts.length>=HEAVENLY_ALCHEMY_MAX_ATTEMPTS){
      const index=state.attempts.findIndex(row=>prunable(row,state.ward?.brewId));
      if(index>=0)state.attempts.splice(index,1);
    }
    state.attempts.push(attempt);
    if(!quality)return {...base,category:'breakthrough',title:'高阶炼丹失手',description:`炉息断绝，${recipe.name}未能成丹；原材与炉资已尽。`};
    const grade=HEAVENLY_ALCHEMY_QUALITY[quality].name;
    return {...base,category:isLightning(quality)?'heavenly':'breakthrough',title:isLightning(quality)?'丹雷落定':'高阶灵丹成就',
      description:isLightning(quality)?`炉上玄光一闪，丹雷散去，${recipe.name}凝成${grade}。`:`炉火收束，${recipe.name}凝成${grade}。`};
  }
  const state=actor.heavenlyAlchemy;
  const quality=option.heavenlyAlchemyQuality;
  const actual=state?.attempts.find(row=>row.recipeId===recipeId&&row.tick<world.tick&&row.quality===quality&&!row.use);
  if(!state||!actual)return null;
  actual.use={tick:world.tick,siteId:site.id};
  const effect=HEAVENLY_ALCHEMY_QUALITY[quality];
  if(recipeId==='tribulation_divine'){
    state.ward={brewId:actual.id,expiresTick:world.tick+HEAVENLY_WARD_TICKS};
    actor.pillToxicity=Math.min(100,actor.pillToxicity+effect.wardToxicity);
    return {...base,category:'breakthrough',title:'渡劫神丹入脉',description:'一枚实丹化作护脉一息；仅在期限内亲遇一重真雷时护持，未判渡劫成败。'};
  }
  const oldQi=actor.qiProgress,oldHp=actor.hp;
  actor.qiProgress=Math.min(100,oldQi+effect.goldenQi);
  actor.hp=Math.min(actor.maxHp,oldHp+Math.round(actor.maxHp*effect.goldenHeal));
  actor.pillToxicity=Math.min(100,actor.pillToxicity+effect.goldenToxicity);
  return {...base,category:'breakthrough',title:'九转金丹化开',description:`一枚实丹化开，灵气进${actor.qiProgress-oldQi}，气血复${actor.hp-oldHp}。`};
}

/** Called at creation of the real current native lightning damage; residue can never answer twice. */
export function spendHeavenlyPillWard(actor:Cultivator,trial:TribulationTrial,tick:number):number{
  const state=actor.heavenlyAlchemy,ward=state?.ward;
  if(!state||!ward||actor.tribulation!==trial||!actor.alive||actor.hp<=0||trial.stage!=='lightning'||trial.lastActedTick!==tick)return 0;
  if(ward.expiresTick<tick){delete state.ward;return 0;}
  const batch=state.attempts.find(row=>row.id===ward.brewId&&row.recipeId==='tribulation_divine'&&row.quality);
  if(!batch?.quality||!batch.use||batch.use.wardSpentTick!==undefined||batch.use.tick>=tick)return 0;
  batch.use.wardSpentTick=tick;
  batch.use.wardTrialId=trial.id;
  batch.use.wardWave=trial.nextWave;
  delete state.ward;
  return HEAVENLY_ALCHEMY_QUALITY[batch.quality].wardReduction;
}
export interface HeavenlyAlchemyView {
  actorId:string;
  siteId:string;
  options:HeavenlyAlchemyOption[];
  stock:{recipeId:HeavenlyRecipeId;quality:HeavenlyQuality;count:number}[];
  attempts:{id:string;tick:number;siteId:string;recipeId:HeavenlyRecipeId;heat:HeavenlyHeat;quality?:HeavenlyQuality;use?:{tick:number;wardSpentTick?:number}}[];
  ward?:{recipeId:'tribulation_divine';quality:HeavenlyQuality;expiresTick:number};
}
export function projectHeavenlyAlchemy(world:WorldState,actor:Cultivator):HeavenlyAlchemyView|undefined{
  const site=localFurnaceSite(world,actor);
  if(!site||site.furnaceGrade!==3&&!actor.heavenlyAlchemy)return undefined;
  const attempts=actor.heavenlyAlchemy?.attempts??[],stock:HeavenlyAlchemyView['stock']=[];
  for(const row of attempts){
    if(!row.quality||row.use)continue;
    const held=stock.find(item=>item.recipeId===row.recipeId&&item.quality===row.quality);
    if(held)held.count++;else stock.push({recipeId:row.recipeId,quality:row.quality,count:1});
  }
  const ward=liveWard(actor,world.tick),source=ward&&attempts.find(row=>row.id===ward.brewId);
  return {actorId:actor.id,siteId:site.id,stock,options:availableHeavenlyAlchemyActions(actor,world,world.tick+1),
    attempts:attempts.slice(-4).reverse().map(({id,tick,siteId,recipeId,heat,quality,use})=>({id,tick,siteId,recipeId,heat,quality,
      ...(use?{use:{tick:use.tick,wardSpentTick:use.wardSpentTick}}:{})})),
    ...(ward&&source?.quality?{ward:{recipeId:'tribulation_divine',quality:source.quality,expiresTick:ward.expiresTick}}:{})};
}
/** The renderer must still enforce its actual site/terrain scope. */
export function heavenlyAlchemyLightning(world:WorldState,event:WorldEvent):{actorId:string;siteId:string;brewId:string;quality:'immortal'|'peerless'}|undefined{
  const [actorId]=event.actorIds;
  if(event.tick!==world.tick||event.year!==world.year||event.month!==world.month||event.actorIds.length!==1||
    event.witnessScope!==undefined||event.category!=='heavenly'||event.id!==heavenlyAlchemyEventId(actorId,event.tick,'brew')||
    !event.locationId||event.title!=='丹雷落定'||!world.events.includes(event)||
    world.events.filter(item=>item.id===event.id).length!==1)return undefined;
  const actor=unique(world.cultivators,actorId);
  const rows=actor?.heavenlyAlchemy?.attempts.filter(row=>row.id===heavenlyBrewId(actorId,event.tick)&&row.siteId===event.locationId&&row.tick===event.tick);
  if(rows?.length!==1||!isLightning(rows[0].quality)||heavenlyPillQuality(rows[0])!==rows[0].quality)return undefined;
  return {actorId,siteId:rows[0].siteId,brewId:rows[0].id,quality:rows[0].quality};
}
