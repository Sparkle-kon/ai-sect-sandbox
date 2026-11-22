import {REALM_ORDER} from '../data/initialWorld';
import {DESTINY_TRAIT_IDS,type DestinyTraitId,type DestinyTraitOffer,type DestinyTraitOptions} from '../types/destinyTrait';
import type {CultivationRealm,Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {activeAvatar} from './avatarEngine';
import {cloneWorldWithColdHistory} from './coldHistoryEngine';
import {DESTINY_TRAIT_CATALOG,type DestinyDuelTrigger} from './destinyTraitCatalog';
import {recordMemory} from './memoryEngine';
import {activeDanxiaMedicineEscort,danxiaMedicineActedThisTick} from './danxiaMedicineTerms';
import {disasterShelterLocksTravel} from './disasterShelterCheckpoint';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {activeCourierForActor,courierActedThisTick} from './sealedCourierEngine';
import {activePilgrimageForActor,pilgrimageActedThisTick} from './pilgrimageEngine';
import {sparringLocksActor} from './sparringEngine';

const TRIAL_REALMS:ReadonlySet<CultivationRealm>=new Set(['金丹','元婴','化神','渡劫']);
const knownTraits:ReadonlySet<DestinyTraitId>=new Set(DESTINY_TRAIT_IDS);
const live=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0&&actor.positionPlane===undefined;
const clamp=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,value));
const sameOptions=(a:readonly DestinyTraitId[],b:readonly DestinyTraitId[])=>a.length===b.length&&a.every((value,i)=>value===b[i]);

export function isDestinyRealmTransition(from:CultivationRealm,to:CultivationRealm):boolean{
  const at=REALM_ORDER.indexOf(from);
  return at>=REALM_ORDER.indexOf('筑基')&&at+1<REALM_ORDER.length&&REALM_ORDER[at+1]===to;
}
export const destinyTraitOfferId=(actorId:string,openedTick:number,realm:CultivationRealm)=>
  `destiny-${actorId}-${openedTick}-${realm}`;
export const destinyTraitSourceEventId=(actorId:string,openedTick:number,realm:CultivationRealm)=>
  `evt-${openedTick}-${actorId}-${TRIAL_REALMS.has(realm)?'tribulation-passed':'break'}`;
export const destinyTraitEarnedEventId=(id:string)=>`evt-${id}-earned`;

function score(seed:number,stamp:Omit<DestinyTraitOffer,'options'>,trait:DestinyTraitId):number{
  const text=JSON.stringify([seed,stamp.actorId,stamp.fromRealm,stamp.realm,stamp.openedTick,stamp.sourceEventId,trait]);
  let n=0x811c9dc5;
  for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),0x01000193);
  n=Math.imul(n^(n>>>16),0x7feb352d);
  n=Math.imul(n^(n>>>15),0x846ca68b);
  return (n^(n>>>16))>>>0;
}

export function destinyTraitOptions(world:Pick<WorldState,'random'>,stamp:Omit<DestinyTraitOffer,'options'>,
  earned:readonly DestinyTraitId[]):DestinyTraitOptions|undefined{
  const excluded=new Set(earned);
  const eligible=DESTINY_TRAIT_IDS.flatMap((id,index)=>excluded.has(id)?[]:[{id,index,roll:score(world.random.seed,stamp,id)}]);
  eligible.sort((a,b)=>a.roll-b.roll||a.index-b.index);
  const [a,b,c]=eligible;
  return a&&b&&c?[a.id,b.id,c.id]:undefined;
}

function actorMatches(world:WorldState,actor:Cultivator){
  const people=world.cultivators.filter(row=>row.id===actor.id);
  return people.length===1&&people[0]===actor;
}
export function destinyTraitSourceEventMatches(event:WorldEvent,stamp:Pick<DestinyTraitOffer,'actorId'|'realm'|'openedTick'|'sourceEventId'>):
  boolean{
  return event.id===stamp.sourceEventId&&stamp.sourceEventId===destinyTraitSourceEventId(stamp.actorId,stamp.openedTick,stamp.realm)&&
    event.tick===stamp.openedTick&&event.category==='breakthrough'&&event.witnessScope===undefined&&!!event.locationId&&
    event.actorIds.length===1&&event.actorIds[0]===stamp.actorId&&
    (TRIAL_REALMS.has(stamp.realm)?event.title==='天劫圆满'&&event.description.endsWith(`踏入【${stamp.realm}】境！`):
      event.title.endsWith(`晋升${stamp.realm}期！`)&&event.description.endsWith(`踏入【${stamp.realm}期】！寿元与战力暴涨！`));
}

/** The caller supplies the real result and actor's pre-action rank from the shared native path. */
export function maybeOpenDestinyTrait(world:WorldState,actor:Cultivator,beforeRealm:CultivationRealm,beforeStage:number,
  event:WorldEvent|null|undefined):DestinyTraitOffer|undefined{
  if(!event||!live(actor)||beforeStage!==9||actor.realmStage!==1||
    !isDestinyRealmTransition(beforeRealm,actor.realm)||!actorMatches(world,actor)||event.locationId!==actor.locationId||
    event.year!==world.year||event.month!==world.month||!world.locations.some(site=>site.id===actor.locationId))return undefined;
  if(TRIAL_REALMS.has(actor.realm)){
    const trial=actor.tribulation;
    if(trial?.stage!=='passed'||trial.targetRealm!==actor.realm||trial.resolvedTick!==world.tick||
      trial.lastActedTick!==world.tick)return undefined;
  }
  const previous=actor.destinyTraits;
  const earned=previous?.earned??[];
  if(previous?.pending||earned.some(row=>row.realm===actor.realm))return undefined;
  const stamp={id:destinyTraitOfferId(actor.id,world.tick,actor.realm),actorId:actor.id,fromRealm:beforeRealm,
    realm:actor.realm,openedTick:world.tick,sourceEventId:event.id};
  if(!destinyTraitSourceEventMatches(event,stamp))return undefined;
  const options=destinyTraitOptions(world,stamp,earned.map(row=>row.traitId));
  if(!options)return undefined;
  const pending:DestinyTraitOffer={...stamp,options};
  (actor.destinyTraits??={earned:[]}).pending=pending;
  return pending;
}
function mandatoryWork(world:WorldState,actor:Cultivator){
  const id=actor.id;
  return activeDanxiaMedicineEscort(world,actor)||danxiaMedicineActedThisTick(world,actor)||
    activeCourierForActor(world,actor)||courierActedThisTick(world,actor)||
    activePilgrimageForActor(world,actor)||pilgrimageActedThisTick(world,actor)||disasterShelterLocksTravel(world,actor)||
    boundaryReliefCheckpoint(world,actor)||expeditionRescueCheckpoint(world,actor)||sparringLocksActor(world,actor)||
    world.escorts.contracts.some(row=>row.escortId===id&&row.status==='active')||
    world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(id))||
    world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(id))||
    world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(id));
}

export function activeDestinyTraitOffer(world:WorldState,actor:Cultivator):DestinyTraitOffer|undefined{
  const progress=actor.destinyTraits,pending=progress?.pending;
  if(!progress||!pending||!live(actor)||!actorMatches(world,actor)||actor.tribulation?.stage==='lightning'||
    actor.tribulation?.stage==='heart_demon'||pending.actorId!==actor.id||pending.realm!==actor.realm||pending.openedTick>world.tick||
    !isDestinyRealmTransition(pending.fromRealm,pending.realm)||pending.id!==destinyTraitOfferId(actor.id,pending.openedTick,pending.realm)||
    pending.sourceEventId!==destinyTraitSourceEventId(actor.id,pending.openedTick,pending.realm)||
    progress.earned.some(row=>row.realm===pending.realm)||mandatoryWork(world,actor))return undefined;
  const options=destinyTraitOptions(world,pending,progress.earned.map(row=>row.traitId));
  if(!options||!sameOptions(options,pending.options))return undefined;
  const retained=world.events.filter(event=>event.id===pending.sourceEventId);
  return retained.length<=1&&retained.every(event=>destinyTraitSourceEventMatches(event,pending))?pending:undefined;
}
function chooseTrait(actor:Cultivator,offer:DestinyTraitOffer):DestinyTraitId{
  let best=offer.options[0],rank=-Infinity;
  for(const id of offer.options){
    const trait=DESTINY_TRAIT_CATALOG[id];
    const affinity=trait.favored.includes(actor.personality)?2:0;
    const role=actor.personality==='狂傲'||actor.personality==='嗜血'?trait.attack*3+trait.appetite:
      actor.personality==='苟道'?trait.cultivation+trait.guard*4-trait.appetite:trait.cultivation*3+trait.guard;
    const value=affinity+role;
    if(value>rank){rank=value;best=id;}
  }
  return best;
}
export function chooseDestinyTraitDecision(world:WorldState,actor:Cultivator):LLMDecisionPayload|undefined{
  const offer=activeDestinyTraitOffer(world,actor);
  return offer?{chosenAction:'AWAKEN_DESTINY',targetDestinyOfferId:offer.id,destinyTraitChoice:chooseTrait(actor,offer),
    innerMonologue:'劫后安坐片刻，只取自己能承住的一道命光。'}:undefined;
}
function settle(world:WorldState,actor:Cultivator,id:string,traitId:DestinyTraitId,explicitGuide:boolean):WorldEvent|null{
  const offer=activeDestinyTraitOffer(world,actor),progress=actor.destinyTraits;
  if(!offer||!progress||offer.id!==id||!knownTraits.has(traitId)||!offer.options.includes(traitId))return null;
  const guided=activeAvatar(world)===actor;
  if(explicitGuide){
    if(!guided)return null;
  }else if(world.tick<=offer.openedTick||guided&&traitId!==chooseTrait(actor,offer))return null;
  const trait=DESTINY_TRAIT_CATALOG[traitId];
  progress.earned.push({...offer,options:[...offer.options],traitId,chosenTick:world.tick});
  delete progress.pending;
  const title=`${actor.name}觉醒命格「${trait.name}」`;
  const description=`${actor.name}踏入${offer.realm}后凝成命格「${trait.name}」，领悟本命神通「${trait.artName}」。`;
  recordMemory(actor,world.tick,description,8,'cultivation',4);
  return {id:destinyTraitEarnedEventId(offer.id),tick:world.tick,year:world.year,month:world.month,title,description,
    category:'breakthrough',actorIds:[actor.id],locationId:actor.locationId};
}
export function settleDestinyTrait(world:WorldState,actor:Cultivator,id:string,traitId:DestinyTraitId):WorldEvent|null{
  return settle(world,actor,id,traitId,false);
}
export function resolveGuidedDestinyTrait(world:WorldState,id:string,traitId:DestinyTraitId):WorldState{
  const actor=activeAvatar(world);
  const pending=actor&&activeDestinyTraitOffer(world,actor);
  if(!pending||pending.id!==id||!pending.options.includes(traitId))return world;
  const next=cloneWorldWithColdHistory(world),avatar=activeAvatar(next);
  if(!avatar)return world;
  const result=settle(next,avatar,id,traitId,true);
  if(!result)return world;
  next.events=[result,...next.events].slice(0,120);
  return next;
}

/** An interrupted, genuinely dead candidate has no new skill; earned lifelong proof remains. */
export function finalizeDestinyTraitOffers(world:WorldState):void{
  for(const actor of world.cultivators){
    const progress=actor.destinyTraits;
    if(!progress?.pending||actor.alive&&actor.hp>0&&actor.realm===progress.pending.realm)continue;
    delete progress.pending;
    if(!progress.earned.length)delete actor.destinyTraits;
  }
}

function learned(actor:Cultivator):DestinyTraitId[]{
  if(!actor.destinyTraits?.earned.length)return [];
  return [...new Set(actor.destinyTraits.earned.map(row=>row.traitId).filter(id=>knownTraits.has(id)))];
}
function triggers(condition:DestinyDuelTrigger,actor:Cultivator,opponent:Cultivator):boolean{
  switch(condition){
    case 'always':return true;
    case 'wounded':return actor.hp>0&&actor.hp/Math.max(1,actor.maxHp)<.5;
    case 'healthy':return actor.hp/Math.max(1,actor.maxHp)>=.8;
    case 'against-stronger':return opponent.combatPower>actor.combatPower;
    case 'equal-footing':return Math.abs(actor.combatPower-opponent.combatPower)/Math.max(1,actor.combatPower,opponent.combatPower)<=.2;
  }
}
export function destinyCultivationMultiplier(actor:Cultivator):number{
  return 1+clamp(learned(actor).reduce((total,id)=>total+DESTINY_TRAIT_CATALOG[id].cultivation,0),0,.35);
}
/** Applied only alongside an actual CULTIVATE gain; never grants pills or an absent detox. */
export function destinyCultivationDetox(actor:Cultivator):number{
  return learned(actor).includes('alchemy-poison-transmutation')&&Number.isFinite(actor.pillToxicity)
    ?clamp(actor.pillToxicity,0,3):0;
}
export function destinyDuelPower(actor:Cultivator,opponent:Cultivator):{multiplier:number;arts:string[]}{
  let increase=0;
  const arts:string[]=[];
  for(const id of learned(actor)){
    const trait=DESTINY_TRAIT_CATALOG[id];
    if(!(trait.attack||trait.guard)||!triggers(trait.trigger,actor,opponent))continue;
    increase+=trait.attack;
    arts.push(trait.artName);
  }
  return {multiplier:1+clamp(increase,0,.38),arts};
}
export function destinyDuelDamageMultiplier(defender:Cultivator,attacker:Cultivator):number{
  return 1-clamp(learned(defender).reduce((total,id)=>{
    const trait=DESTINY_TRAIT_CATALOG[id];
    return total+(triggers(trait.trigger,defender,attacker)?trait.guard:0);
  },0),0,.34);
}
export function destinyDuelAppetite(actor:Cultivator,defender:Cultivator):number{
  return clamp(learned(actor).reduce((total,id)=>{
    const trait=DESTINY_TRAIT_CATALOG[id];
    return total+(triggers(trait.trigger,actor,defender)?trait.appetite:0);
  },0),-.4,.4);
}
