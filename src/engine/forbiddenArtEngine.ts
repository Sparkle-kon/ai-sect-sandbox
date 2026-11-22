import {FORBIDDEN_ART_IDS,type ForbiddenArtChoice,type ForbiddenArtCost,type ForbiddenArtId,type ForbiddenArtOrigin,
  type ForbiddenArtOutcome,type ForbiddenArtScar,type ForbiddenDuelContact,type NativeDuelRolls} from '../types/forbiddenArt';
import type {Artifact,Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {FORBIDDEN_ART_CATALOG,forbiddenArtEventId,forbiddenArtScarId,forbiddenDuelContactId} from './forbiddenArtCatalog';
export {forbiddenArtEventId,forbiddenArtScarId,forbiddenDuelContactId} from './forbiddenArtCatalog';
import {activeAvatar} from './avatarEngine';
import {durabilityOf,equippedArtifact} from './artifactEngine';
import {cloneWorldWithColdHistory} from './coldHistoryEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {disasterShelterCheckpoint} from './disasterShelterCheckpoint';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {courierCheckpoint} from './sealedCourierEngine';
import {pilgrimageCheckpoint} from './pilgrimageEngine';
import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import {sparringLocksActor} from './sparringEngine';
import {recordMemory} from './memoryEngine';

const zero:Readonly<ForbiddenArtCost>=Object.freeze({hp:0,lifespan:0,durability:0});
const loyalty=new Set<ForbiddenArtId>(FORBIDDEN_ART_IDS);
const requestFields=new Set(['chosenAction','innerMonologue','targetForbiddenDuelId','forbiddenArtChoice']);
const look=(world:WorldState,id:string):Cultivator|undefined=>{
  const actors=world.cultivators.filter(row=>row.id===id);
  return actors.length===1?actors[0]:undefined;
};
const current=(world:WorldState)=>world.forbiddenDuels??[];

function liveLower(actor:Cultivator|undefined):actor is Cultivator{
  return !!actor?.alive&&actor.hp>0&&actor.positionPlane===undefined;
}
const held=(world:WorldState,actor:Cultivator)=>actor.tribulation?.stage==='lightning'||actor.tribulation?.stage==='heart_demon'||
  activeDanxiaMedicineEscort(world,actor)||sparringLocksActor(world,actor)||courierCheckpoint(world,actor)||
  pilgrimageCheckpoint(world,actor)||disasterShelterCheckpoint(world,actor)||expeditionRescueCheckpoint(world,actor)||
  boundaryReliefCheckpoint(world,actor)||world.escorts.contracts.some(row=>row.status==='active'&&row.escortId===actor.id)||
  world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(actor.id));
const endangered=(owner:Cultivator)=>Number.isFinite(owner.maxHp)&&owner.maxHp>0&&owner.hp/owner.maxHp<.25;
const isChoice=(choice:ForbiddenArtChoice|undefined):choice is ForbiddenArtChoice=>choice==='decline'||choice!==undefined&&loyalty.has(choice);
const touch=(row:ForbiddenDuelContact,id:string)=>row.attackerId===id||row.defenderId===id;
function actualArtifact(owner:Cultivator,artifactId?:string):Artifact|undefined{
  const item=equippedArtifact(owner);
  return item?.id&&(!artifactId||item.id===artifactId)&&item.boundTo===owner.id&&item.soul&&
    (item.tier==='法宝'||item.tier==='通天灵宝')&&durabilityOf(item)>0&&
    owner.artifacts.filter(other=>other.id===item.id).length===1?item:undefined;
}
function exactSite(world:WorldState,id:string):boolean{
  const points=world.locations.filter(site=>site.id===id);
  return points.length===1&&!isScopedExpeditionGate(points[0]);
}
function contactParties(world:WorldState,row:ForbiddenDuelContact){
  if(row.attackerId===row.defenderId||row.ownerId!==row.attackerId&&row.ownerId!==row.defenderId||
    row.id!==forbiddenDuelContactId(row.openedTick,row.attackerId,row.defenderId)||row.openedTick>world.tick||
    row.rolls.length!==4||row.rolls.some(roll=>!Number.isFinite(roll)||roll<0||roll>1)||!exactSite(world,row.siteId))return undefined;
  const attacker=look(world,row.attackerId),defender=look(world,row.defenderId);
  if(!liveLower(attacker)||!liveLower(defender)||attacker.locationId!==row.siteId||defender.locationId!==row.siteId)return undefined;
  const owner=row.ownerId===attacker.id?attacker:defender,opponent=owner===attacker?defender:attacker;
  const artifact=actualArtifact(owner,row.artifactId);
  return artifact?{attacker,defender,owner,opponent,artifact}:undefined;
}
function availableContact(world:WorldState,row:ForbiddenDuelContact){
  if(!current(world).includes(row))return undefined;
  const parties=contactParties(world,row);
  return parties&&!held(world,parties.attacker)&&!held(world,parties.defender)?parties:undefined;
}

export function forbiddenArtCost(art:ForbiddenArtId,maxHp:number):ForbiddenArtCost{
  const recipe=FORBIDDEN_ART_CATALOG[art];
  return {hp:recipe.bloodFraction?Math.max(1,Math.round(maxHp*recipe.bloodFraction)):0,
    lifespan:recipe.life,durability:recipe.durability};
}
export interface ForbiddenArtOption {choice:ForbiddenArtChoice;name:string;description:string;cost:ForbiddenArtCost}
const retreat:ForbiddenArtOption=Object.freeze({choice:'decline',name:'不用禁术',description:'按原定交手结算，不扣寿数、精血或禁术器损。',cost:zero});
function options(owner:Cultivator,opponent:Cultivator,artifact:Artifact):ForbiddenArtOption[]{
  if(!endangered(owner))return [retreat];
  const rows:ForbiddenArtOption[]=[];
  for(const choice of FORBIDDEN_ART_IDS){
    const recipe=FORBIDDEN_ART_CATALOG[choice];
    if(recipe.roots&&!recipe.roots.includes(artifact.spiritRoot)||recipe.strongerOpponent&&opponent.combatPower<=owner.combatPower)continue;
    const cost=forbiddenArtCost(choice,owner.maxHp);
    if(cost.hp>0&&owner.hp-cost.hp<1||cost.lifespan>0&&owner.lifespan-cost.lifespan<=owner.age||
      durabilityOf(artifact)<cost.durability+15)continue;
    rows.push({choice,name:recipe.name,description:recipe.description,cost});
  }
  rows.push(retreat);
  return rows;
}

/** This caller is the real prepared native duel, after denial and before any hit/loot calculation is committed. */
export function openForbiddenDuelContact(world:WorldState,attacker:Cultivator,defender:Cultivator,owner:Cultivator,
  rolls:NativeDuelRolls):ForbiddenDuelContact|undefined{
  if(!liveLower(attacker)||!liveLower(defender)||attacker===defender||owner!==attacker&&owner!==defender||
    look(world,attacker.id)!==attacker||look(world,defender.id)!==defender||attacker.locationId!==defender.locationId||
    !exactSite(world,owner.locationId)||!endangered(owner)||held(world,attacker)||held(world,defender)||
    rolls.length!==4||rolls.some(roll=>!Number.isFinite(roll)||roll<0||roll>1))return undefined;
  const artifact=actualArtifact(owner),opponent=owner===attacker?defender:attacker;
  if(!artifact?.id||!options(owner,opponent,artifact).some(row=>row.choice!=='decline'))return undefined;
  pruneInvalidForbiddenDuelContacts(world);
  if(current(world).some(row=>touch(row,attacker.id)||touch(row,defender.id)))return undefined;
  const openedTick=world.tick;
  const row:ForbiddenDuelContact={id:forbiddenDuelContactId(openedTick,attacker.id,defender.id),
    attackerId:attacker.id,defenderId:defender.id,ownerId:owner.id,artifactId:artifact.id,siteId:owner.locationId,
    openedTick,rolls:[...rolls],guided:activeAvatar(world)===owner};
  (world.forbiddenDuels??=[]).push(row);
  return row;
}
export function pruneInvalidForbiddenDuelContacts(world:WorldState):void{
  const previous=world.forbiddenDuels;
  if(!previous)return;
  const next=previous.filter(row=>!!contactParties(world,row));
  if(!next.length)delete world.forbiddenDuels;
  else if(next.length!==previous.length)world.forbiddenDuels=next;
}
export function forbiddenDuelForParticipant(world:WorldState,actor:Cultivator):ForbiddenDuelContact|undefined{
  if(!world.forbiddenDuels?.length)return undefined;
  const rows=current(world).filter(row=>touch(row,actor.id));
  return rows.length===1&&look(world,actor.id)===actor&&!!contactParties(world,rows[0])?rows[0]:undefined;
}
export function activeForbiddenDuel(world:WorldState,actor:Cultivator):ForbiddenDuelContact|undefined{
  const row=forbiddenDuelForParticipant(world,actor);
  return row?.ownerId===actor.id&&availableContact(world,row)?row:undefined;
}
export function availableForbiddenArtOptions(world:WorldState,row:ForbiddenDuelContact):readonly ForbiddenArtOption[]{
  const parties=availableContact(world,row);
  return parties?options(parties.owner,parties.opponent,parties.artifact):[];
}
function choose(owner:Cultivator,eligible:readonly ForbiddenArtOption[]):ForbiddenArtChoice{
  const destructive=owner.personality==='嗜血'||owner.personality==='狂傲';
  const protective=owner.personality==='苟道'||owner.personality==='痴情'||owner.personality==='诡诈';
  let best:ForbiddenArtChoice='decline',weight=-Infinity;
  for(const option of eligible){
    if(option.choice==='decline')continue;
    const art=FORBIDDEN_ART_CATALOG[option.choice];
    const strength=(art.scoreMultiplier-1)*(destructive?10:3);
    const guard=(1-art.incomingMultiplier)*(protective?5:2);
    const survival=(art.escape?(protective?4:destructive?0.1:2.3):0)+(art.lastStand?(protective?3:destructive?0.4:2):0);
    const cost=option.cost.lifespan*.09+(option.cost.hp/Math.max(1,owner.hp))*.50;
    const score=strength+guard+survival-cost;
    if(score>weight){weight=score;best=option.choice;}
  }
  return best;
}
export function chooseForbiddenArtDecision(world:WorldState,actor:Cultivator):LLMDecisionPayload|undefined{
  const row=activeForbiddenDuel(world,actor);
  if(!row||row.guided)return undefined;
  return {chosenAction:'FORBIDDEN_ART',targetForbiddenDuelId:row.id,forbiddenArtChoice:choose(actor,availableForbiddenArtOptions(world,row)),
    innerMonologue:'已看清这场交手，只从器灵真能担下的手段里选。'};
}

const guidedNow=(world:WorldState,row:ForbiddenDuelContact,owner:Cultivator)=>row.guided&&activeAvatar(world)===owner;
export type ForbiddenDuelResolution=
  | {kind:'invalid'} | {kind:'waiting'} | {kind:'ready';choice:ForbiddenArtChoice;origin:ForbiddenArtOrigin};
export function prepareForbiddenDuelResolution(world:WorldState,row:ForbiddenDuelContact,decision?:LLMDecisionPayload,
  modelInput=false):ForbiddenDuelResolution{
  const exact=contactParties(world,row);
  if(!exact||!current(world).includes(row))return {kind:'invalid'};
  if(!availableContact(world,row)||world.tick<=row.openedTick)return {kind:'waiting'};
  const choices=availableForbiddenArtOptions(world,row),isAvailable=(choice:ForbiddenArtChoice)=>choices.some(option=>option.choice===choice);
  if(row.guided){
    if(row.queued){
      if(row.queued.tick>=world.tick)return {kind:'waiting'};
      return {kind:'ready',choice:isAvailable(row.queued.choice)?row.queued.choice:'decline',origin:'player'};
    }
    if(guidedNow(world,row,exact.owner))return {kind:'waiting'};
    return {kind:'ready',choice:'decline',origin:'utility'};
  }
  if(modelInput&&decision?.chosenAction==='FORBIDDEN_ART'&&decision.targetForbiddenDuelId===row.id&&
    isChoice(decision.forbiddenArtChoice)&&isAvailable(decision.forbiddenArtChoice)&&
    Object.entries(decision).every(([key,value])=>value===undefined||requestFields.has(key))){
    return {kind:'ready',choice:decision.forbiddenArtChoice,origin:'model'};
  }
  return {kind:'ready',choice:choose(exact.owner,choices),origin:'utility'};
}

export interface ForbiddenArtActivation {
  readonly choice:ForbiddenArtChoice;readonly origin:ForbiddenArtOrigin;readonly paid:ForbiddenArtCost;
  readonly scoreMultiplier:number;readonly incomingMultiplier:number;readonly escape:boolean;readonly lastStand:boolean;
}
const spent=new WeakMap<ForbiddenArtActivation,{world:WorldState;contact:ForbiddenDuelContact}>();
export function consumeForbiddenDuelContact(world:WorldState,row:ForbiddenDuelContact,choice:ForbiddenArtChoice,
  origin:ForbiddenArtOrigin):ForbiddenArtActivation|undefined{
  const parties=availableContact(world,row);
  if(!parties||world.tick<=row.openedTick)return undefined;
  const {owner,artifact}=parties;
  const menu=availableForbiddenArtOptions(world,row),picked=menu.find(option=>option.choice===choice);
  if(!picked)return undefined;
  if(row.guided){
    if(row.queued){
      const expected=menu.some(option=>option.choice===row.queued?.choice)?row.queued.choice:'decline';
      if(row.queued.tick>=world.tick||choice!==expected||origin!=='player')return undefined;
    }else if(guidedNow(world,row,owner)||choice!=='decline'||origin!=='utility')return undefined;
  }else if(origin==='player'||origin==='utility'&&choice!==choose(owner,menu))return undefined;
  const remaining=current(world).filter(entry=>entry!==row);
  if(remaining.length)world.forbiddenDuels=remaining;
  else delete world.forbiddenDuels;
  const paid=Object.freeze({...picked.cost});
  if(choice==='decline')return {choice,origin,paid,scoreMultiplier:1,incomingMultiplier:1,escape:false,lastStand:false};
  const art=FORBIDDEN_ART_CATALOG[choice];
  owner.hp-=paid.hp;owner.lifespan-=paid.lifespan;
  artifact.durability=durabilityOf(artifact)-paid.durability;
  const activation:ForbiddenArtActivation=Object.freeze({choice,origin,paid,scoreMultiplier:art.scoreMultiplier,
    incomingMultiplier:art.incomingMultiplier,escape:art.escape===true,lastStand:art.lastStand===true});
  spent.set(activation,{world,contact:row});
  return activation;
}

const prose:Record<ForbiddenArtOutcome,string>={
  reversal:'这一式真正改变了强弱，原先濒危之人反压一头。',
  escape:'这一式实在此地断开交手；没有易地，没有胜者，也没有战利品。',
  survived:'险势压身，仍留下一线生机；这不是反败为胜。',
  fallen:'代价已付，仍未扛住余势，败亡如实写在此战。',
};
export function recordForbiddenArtOutcome(world:WorldState,row:ForbiddenDuelContact,activation:ForbiddenArtActivation,
  result:ForbiddenArtOutcome):WorldEvent|undefined{
  const proof=spent.get(activation),choice=activation.choice;
  if(!proof||proof.world!==world||proof.contact!==row||choice==='decline')return undefined;
  spent.delete(activation);
  const owner=look(world,row.ownerId);
  if(!owner)return undefined;
  const opponentId=row.ownerId===row.attackerId?row.defenderId:row.attackerId;
  const scar:ForbiddenArtScar={id:forbiddenArtScarId(row.id,choice),contactId:row.id,artId:choice,ownerId:owner.id,
    opponentId,artifactId:row.artifactId,siteId:row.siteId,openedTick:row.openedTick,tick:world.tick,
    paid:{...activation.paid},result,origin:activation.origin};
  const scars=owner.forbiddenScars??=[];
  if(!scars.some(before=>before.artId===choice))scars.push({...scar,paid:{...scar.paid}});
  const art=FORBIDDEN_ART_CATALOG[choice];
  const description=`${owner.name}祭出本命器灵，施「${art.name}」。${prose[result]}`;
  recordMemory(owner,world.tick,description,9,'combat',result==='fallen'?-5:result==='reversal'?4:1);
  return {id:forbiddenArtEventId(row.id),tick:world.tick,year:world.year,month:world.month,
    title:`${art.name}·${result==='escape'?'断开交锋':result==='reversal'?'逆势回锋':result==='survived'?'绝地余息':'余招已尽'}`,
    description,category:'combat',actorIds:[row.attackerId,row.defenderId],locationId:row.siteId,forbiddenArt:scar};
}

const label=(value:string)=>value.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,' ').trim().slice(0,80);
export interface GuidedForbiddenDuelView{
  contact:Omit<ForbiddenDuelContact,'rolls'>;ownerName:string;opponentName:string;artifactName:string;options:readonly ForbiddenArtOption[];
}
export function projectGuidedForbiddenDuel(world:WorldState):GuidedForbiddenDuelView|undefined{
  if(!world.forbiddenDuels?.length)return undefined;
  const avatar=activeAvatar(world);
  if(!avatar)return undefined;
  const contact=activeForbiddenDuel(world,avatar);
  const parties=contact&&availableContact(world,contact);
  if(!contact||!parties||!guidedNow(world,contact,avatar))return undefined;
  const {rolls: _nativeProof,...visible}=contact;
  return {contact:structuredClone(visible),ownerName:label(avatar.name),opponentName:label(parties.opponent.name),
    artifactName:label(parties.artifact.name),options:options(avatar,parties.opponent,parties.artifact)
      .map(row=>({...row,cost:{...row.cost}}))};
}
function own(world:WorldState,ownerId:string,contactId:string,choice:ForbiddenArtChoice){
  const avatar=activeAvatar(world);
  if(avatar?.id!==ownerId)return undefined;
  const row=activeForbiddenDuel(world,avatar);
  return row?.id===contactId&&row.guided&&!row.queued&&availableForbiddenArtOptions(world,row).some(option=>option.choice===choice)?row:undefined;
}
export function queueGuidedForbiddenArt(world:WorldState,ownerId:string,contactId:string,choice:ForbiddenArtChoice):WorldState{
  if(!isChoice(choice)||!own(world,ownerId,contactId,choice))return world;
  const updated=cloneWorldWithColdHistory(world),row=own(updated,ownerId,contactId,choice);
  if(!row)return world;
  row.queued={choice,tick:world.tick};
  return updated;
}
