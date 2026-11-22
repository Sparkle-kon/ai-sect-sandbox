import {artifactPowerMultiplier,wearArtifact} from './artifactEngine';
import {activeSiegeForActor} from './siegeParticipants';
import {hasKnownExpeditionRosterMember,isScopedExpeditionGate} from './expeditionOmenTerms';
import {rescueHoldsExpeditionRoll,rescuedMemberOutOfOccasion} from './expeditionRescueEngine';
import {noteTerrainVisit} from './terrainEngine';
import type {DungeonMove,DungeonRoom,DungeonStep,ExpeditionDungeon} from '../types/expeditionDungeon';
import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldOccasion,WorldState} from '../types/world';

export const DUNGEON_BOSS_MAX_HP=100;
export const DUNGEON_ARRAY_QI=18;
export const DUNGEON_REWARD_STONES=80;
export const DUNGEON_ARTIFACT_NAME='藏星古钥';
const LIVE_WINDOW_ACTIONS=12;
const artifactId=(occasion:WorldOccasion)=>`dungeon-loot-${occasion.id}`;
export interface DungeonOption {
  action:'EXPEDITION_DUNGEON';
  dungeonMove:DungeonMove;
  targetOccasionId:string;
  targetDungeonRoomId:DungeonRoom;
}
export interface ExpeditionDungeonView extends ExpeditionDungeon {
  occasionId:string;
  siteId:string;
  expiresTick:number;
  bossMaxHp:number;
  leaderId?:string;
  options:DungeonOption[];
}
const unique=<T extends {id:string}>(rows:readonly T[],id:string):T|undefined=>{
  let found:T|undefined;
  for(const row of rows){if(row.id!==id)continue;if(found)return undefined;found=row;}
  return found;
};
const live=(actor:Cultivator|undefined):actor is Cultivator=>Boolean(actor?.alive&&actor.hp>0&&actor.positionPlane===undefined);
function linkedVenue(world:WorldState,occasion:WorldOccasion){
  if(occasion.kind!=='expedition'||occasion.status!=='running'||!occasion.omenId||!occasion.anchorSiteId||
    !world.occasions.includes(occasion)||occasion.expiresTick!==occasion.startedTick+LIVE_WINDOW_ACTIONS||
    occasion.registrationClosesTick!==occasion.startedTick+3)return undefined;
  const gate=unique(world.locations,occasion.locationId),exit=unique(world.locations,occasion.anchorSiteId);
  if(!gate||!exit||gate.id!==`${occasion.id}-gate`||!isScopedExpeditionGate(gate)||gate.expeditionOmenId!==occasion.omenId||
    exit.id===gate.id||isScopedExpeditionGate(exit)||exit.type==='secret_realm'||exit.type==='abyss')return undefined;
  const omen=unique(world.expeditionOmens.rows,occasion.omenId);
  return omen?.opening?.occasionId===occasion.id&&omen.siteId===exit.id&&omen.opening.tick===occasion.startedTick?{gate,exit}:undefined;
}
function nativeMember(world:WorldState,occasion:WorldOccasion,actor:Cultivator):boolean{
  return live(actor)&&unique(world.cultivators,actor.id)===actor&&actor.locationId===occasion.locationId&&
    occasion.participantIds.includes(actor.id)&&occasion.remainingIds.includes(actor.id)&&
    actor.tribulation?.stage!=='lightning'&&actor.tribulation?.stage!=='heart_demon'&&!activeSiegeForActor(world,actor)&&
    !rescueHoldsExpeditionRoll(world,occasion.id,actor.id)&&!rescuedMemberOutOfOccasion(world,occasion.id,actor.id)&&
    hasKnownExpeditionRosterMember(world,actor,occasion);
}
function group(world:WorldState,occasion:WorldOccasion):Cultivator[]{
  return (occasion.dungeon?.members??[]).flatMap(member=>{
    if(member.leftTick!==undefined)return [];
    const actor=unique(world.cultivators,member.actorId);
    return actor&&nativeMember(world,occasion,actor)?[actor]:[];
  });
}
/** Hold only an actually invited native co-present entrant on the opening month,
 * instead of silently resolving their legacy roll before they can see the lawful door. */
export function dungeonEnrollmentHeld(world:WorldState,occasion:WorldOccasion,actor:Cultivator):boolean{
  const dungeon=occasion.dungeon;
  return Boolean(dungeon&&dungeon.closedTick===undefined&&dungeon.room==='garden'&&dungeon.openedTick===world.tick&&
    !dungeon.members.some(row=>row.actorId===actor.id)&&linkedVenue(world,occasion)&&nativeMember(world,occasion,actor));
}
const didMove=(dungeon:ExpeditionDungeon,id:string,tick:number)=>dungeon.steps.some(row=>row.actorId===id&&row.tick===tick);
const didProgress=(dungeon:ExpeditionDungeon,tick:number)=>
  dungeon.steps.some(row=>row.tick===tick&&row.move!=='enter'&&row.move!=='retreat');
const claimed=(dungeon:ExpeditionDungeon)=>dungeon.steps.some(row=>row.move==='claim');
export function activeDungeonForActor(world:WorldState,actor:Cultivator):WorldOccasion|undefined{
  return world.occasions.find(occasion=>occasion.dungeon?.closedTick===undefined&&
    occasion.dungeon?.members.some(row=>row.actorId===actor.id&&row.leftTick===undefined)&&
    linkedVenue(world,occasion)&&nativeMember(world,occasion,actor));
}
export function availableDungeonMoves(world:WorldState,actor:Cultivator,executionTick=world.tick):DungeonOption[]{
  if(executionTick!==world.tick&&executionTick!==world.tick+1||!live(actor))return [];
  return world.occasions.flatMap(occasion=>{
    const venue=linkedVenue(world,occasion);
    if(!venue||executionTick<=occasion.registrationClosesTick||executionTick>=occasion.expiresTick||!nativeMember(world,occasion,actor))return [];
    const dungeon=occasion.dungeon;
    if(dungeon?.closedTick!==undefined||dungeon&&didMove(dungeon,actor.id,executionTick))return [];
    const room=dungeon?.room??'garden';
    const option=(dungeonMove:DungeonMove):DungeonOption=>({action:'EXPEDITION_DUNGEON',
      targetOccasionId:occasion.id,targetDungeonRoomId:room,dungeonMove});
    const member=dungeon?.members.find(row=>row.actorId===actor.id);
    if(!member)return room==='garden'&&(!dungeon||dungeon.members.length<8&&group(world,occasion).length>0)?
      [option('enter')]:[];
    if(!dungeon||member.leftTick!==undefined)return [];
    const moves=[option('retreat')];
    if(executionTick<=member.enteredTick||dungeon.steps.some(row=>row.tick===executionTick&&row.move==='enter')||
      didProgress(dungeon,executionTick)||group(world,occasion)[0]!==actor)return moves;
    const enrollmentGrace=room==='garden'&&executionTick===dungeon.openedTick+1&&occasion.remainingIds.some(id=>{
      if(dungeon.members.some(row=>row.actorId===id))return false;
      const candidate=unique(world.cultivators,id);
      return candidate&&nativeMember(world,occasion,candidate);
    });
    if(room==='garden'&&!enrollmentGrace&&venue.gate.herbs.jade_leaf>=1)moves.unshift(option('gather'));
    if(room==='hall'&&actor.qiProgress>=DUNGEON_ARRAY_QI)moves.unshift(option('break_array'));
    if(room==='sanctum'&&dungeon.bossHp>0&&actor.hp>1)moves.unshift(option('strike'));
    if(room==='sanctum'&&dungeon.bossHp===0&&!claimed(dungeon)&&
      !world.cultivators.some(person=>person.artifacts.some(item=>item.id===artifactId(occasion))))moves.unshift(option('claim'));
    return moves;
  });
}
const names:Record<DungeonMove,{title:string;description:string}>={
  enter:{title:'并入星门探阵',description:'踏入外围药园，未取他人行囊中的财物。'},
  gather:{title:'药园采得灵叶',description:'从实有药圃取出一枚翡翠灵叶，沿原路进入古殿。'},
  break_array:{title:'古殿阵门已开',description:'以内息支付十八点灵气，解开通往传承禁地的实阵。'},
  strike:{title:'传承禁地斗妖王',description:'妖王确受攻势；反击扣除亲身出战者气血。'},
  claim:{title:'妖王伏倒，宝钥入手',description:'待妖王确已倒下，亲手取走藏星古钥及八十灵石。'},
  retreat:{title:'折返星门出口',description:'当事人按已知出口折返，没有代替其他修士脱身。'},
};
function ownEvent(world:WorldState,occasion:WorldOccasion,actor:Cultivator,move:DungeonMove,peers:readonly Cultivator[]):WorldEvent{
  return {id:`evt-${world.tick}-${occasion.id}-dungeon-${move}-${actor.id}`,tick:world.tick,year:world.year,month:world.month,
    title:names[move].title,description:names[move].description,category:'heavenly',
    actorIds:[actor.id,...peers.filter(person=>person.id!==actor.id).map(person=>person.id)],
    locationId:occasion.locationId,witnessScope:'participants'};
}
const hpLoss=(actor:Cultivator,fraction:number)=>Math.max(0,Math.min(actor.hp-1,Math.max(1,Math.round(actor.maxHp*fraction))));
function removeRemaining(occasion:WorldOccasion,id:string):void{
  occasion.remainingIds=occasion.remainingIds.filter(remaining=>remaining!==id);
}
function closeIfEmpty(occasion:WorldOccasion,tick:number):void{
  const dungeon=occasion.dungeon;
  if(!dungeon||dungeon.closedTick!==undefined||dungeon.members.some(row=>row.leftTick===undefined))return;
  dungeon.closedTick=tick;
  dungeon.outcome=dungeon.members.some(row=>row.exit==='collapse')?'collapsed':claimed(dungeon)?'claimed':
    dungeon.members.some(row=>row.exit==='retreated'||row.exit==='rescued')?'retreated':'lost';
}
const dungeonDecisionFields:ReadonlySet<string>=new Set([
  'chosenAction','targetOccasionId','targetDungeonRoomId','dungeonMove','innerMonologue',
]);
export function resolveDungeonAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='EXPEDITION_DUNGEON'||Object.keys(decision).some(key=>!dungeonDecisionFields.has(key)))return null;
  const option=availableDungeonMoves(world,actor).find(row=>row.targetOccasionId===decision.targetOccasionId&&
    row.dungeonMove===decision.dungeonMove&&row.targetDungeonRoomId===decision.targetDungeonRoomId);
  const occasion=option&&unique(world.occasions,option.targetOccasionId),venue=occasion&&linkedVenue(world,occasion);
  if(!option||!occasion||!venue)return null;
  const move=option.dungeonMove;
  const dungeon=occasion.dungeon??(occasion.dungeon={openedTick:world.tick,room:'garden',bossHp:DUNGEON_BOSS_MAX_HP,members:[],steps:[]});
  const peers=group(world,occasion),event=ownEvent(world,occasion,actor,move,peers);
  const stub={tick:world.tick,actorId:actor.id,eventId:event.id};
  let step:DungeonStep;
  if(move==='enter'){
    dungeon.members.push({actorId:actor.id,enteredTick:world.tick});
    step={...stub,move};
  }else if(move==='gather'){
    venue.gate.herbs.jade_leaf--;actor.herbs.jade_leaf++;
    dungeon.room='hall';
    step={...stub,move,jadeLeaf:1};
  }else if(move==='break_array'){
    actor.qiProgress-=DUNGEON_ARRAY_QI;
    dungeon.room='sanctum';
    step={...stub,move,qiPaid:DUNGEON_ARRAY_QI};
  }else if(move==='strike'){
    const bossBefore=dungeon.bossHp;
    const dealt=Math.max(20,Math.min(45,Math.floor(19+Math.sqrt(actor.combatPower*artifactPowerMultiplier(actor))*.85+
      actor.techniqueMastery*.12+Math.min(9,Math.max(0,peers.length-1)*3))));
    dungeon.bossHp=Math.max(0,bossBefore-dealt);
    const lost=dungeon.bossHp>0?hpLoss(actor,.10):0;
    actor.hp-=lost;
    wearArtifact(actor,dungeon.bossHp===0);
    step={...stub,move,bossBefore,bossAfter:dungeon.bossHp,hpLost:lost};
    event.description=dungeon.bossHp>0?`亲身出战者损失${lost}点气血；妖王尚有${dungeon.bossHp}点气血。`:'此招落定，妖王确已伏倒，宝物仍须亲取。';
  }else if(move==='claim'){
    const id=artifactId(occasion);
    actor.spiritStones+=DUNGEON_REWARD_STONES;
    actor.artifacts.push({id,name:DUNGEON_ARTIFACT_NAME,spiritRoot:actor.spiritRoot,tier:'法宝',durability:75,maxDurability:110});
    step={...stub,move,stones:DUNGEON_REWARD_STONES,artifactId:id};
  }else{
    const member=dungeon.members.find(row=>row.actorId===actor.id&&row.leftTick===undefined);
    if(!member)return null;
    actor.locationId=venue.exit.id;
    noteTerrainVisit(world,actor);
    member.leftTick=world.tick;member.exit=claimed(dungeon)?'escaped':'retreated';
    removeRemaining(occasion,actor.id);
    step={...stub,move};
  }
  dungeon.steps.push(step);
  closeIfEmpty(occasion,world.tick);
  return event;
}
/** Reconcile only actual exits caused by the native shared rescue, or confirmed bodily loss. */
export function reconcileExpeditionDungeon(world:WorldState,occasion:WorldOccasion):void{
  const dungeon=occasion.dungeon;
  if(!dungeon||dungeon.closedTick!==undefined)return;
  for(const member of dungeon.members){
    if(member.leftTick!==undefined)continue;
    const actor=unique(world.cultivators,member.actorId);
    if(!actor||!actor.alive||actor.hp<=0){
      member.leftTick=world.tick;member.exit='lost';removeRemaining(occasion,member.actorId);
    }else if(rescuedMemberOutOfOccasion(world,occasion.id,member.actorId)){
      member.leftTick=world.tick;member.exit='rescued';removeRemaining(occasion,member.actorId);
    }
  }
  closeIfEmpty(occasion,world.tick);
}

/** Existing native occasion closure still moves real bodies; this layer records only actual collapse injuries. */
export function closeExpeditionDungeon(world:WorldState,occasion:WorldOccasion):WorldEvent|undefined{
  reconcileExpeditionDungeon(world,occasion);
  const dungeon=occasion.dungeon;
  if(!dungeon||dungeon.closedTick!==undefined)return undefined;
  const hit:string[]=[];
  for(const member of dungeon.members){
    if(member.leftTick!==undefined)continue;
    const actor=unique(world.cultivators,member.actorId);
    member.leftTick=world.tick;
    if(live(actor)&&actor.locationId===occasion.locationId&&!rescueHoldsExpeditionRoll(world,occasion.id,actor.id)){
      const lost=hpLoss(actor,.18);
      actor.hp-=lost;
      member.hpLost=lost;member.exit='collapse';hit.push(actor.id);
    }else member.exit='lost';
  }
  closeIfEmpty(occasion,world.tick);
  if(!hit.length)return undefined;
  return {id:`evt-${world.tick}-${occasion.id}-dungeon-collapse`,tick:world.tick,year:world.year,month:world.month,
    title:'星门倾颓',description:'仍在原处的修士遭受崩塌冲击；未替任何人编造逃生或胜果。',
    category:'heavenly',actorIds:hit,witnessScope:'participants',locationId:occasion.locationId};
}
export function projectExpeditionDungeon(world:WorldState,viewer:Cultivator|undefined,occasionId?:string):ExpeditionDungeonView|undefined{
  if(!live(viewer)||unique(world.cultivators,viewer.id)!==viewer)return undefined;
  const occasion=occasionId?unique(world.occasions,occasionId):
    world.occasions.find(row=>row.status==='running'&&row.kind==='expedition'&&row.participantIds.includes(viewer.id)&&row.locationId===viewer.locationId)??
    [...world.occasions].reverse().find(row=>row.dungeon?.members.some(member=>member.actorId===viewer.id));
  if(!occasion||occasion.kind!=='expedition'||!occasion.omenId)return undefined;
  const dungeon=occasion.dungeon;
  const member=dungeon?.members.some(row=>row.actorId===viewer.id);
  const options=availableDungeonMoves(world,viewer,world.tick+1).filter(row=>row.targetOccasionId===occasion.id);
  if(!member&&(!linkedVenue(world,occasion)||!nativeMember(world,occasion,viewer)||!options.some(row=>row.dungeonMove==='enter')))return undefined;
  // An eligible onlooker sees an entrance, not the private record of earlier actors.
  const state=member&&dungeon?dungeon:{openedTick:world.tick,room:'garden' as const,bossHp:DUNGEON_BOSS_MAX_HP,members:[],steps:[]};
  return {...structuredClone(state),occasionId:occasion.id,siteId:occasion.locationId,expiresTick:occasion.expiresTick,
    bossMaxHp:DUNGEON_BOSS_MAX_HP,leaderId:member?group(world,occasion)[0]?.id:undefined,options};
}
