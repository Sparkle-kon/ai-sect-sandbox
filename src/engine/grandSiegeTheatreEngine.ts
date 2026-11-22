import { ascensionDutyActive } from './ascensionPresence';
import { currentPublic, roundEventId, theatreOf } from './grandSiegeProof';
import type {createTerrainMapView} from '../components/terrainMapView';
import type {GrandSiegeFighter,GrandSiegeHeroMove,GrandSiegeHeroOrder,GrandSiegeHeroOrigin,GrandSiegeRound,GrandSiegeTheatre} from '../types/grandSiege';
import type {Cultivator,LLMDecisionPayload,Sect,SectSiege,WorldEvent,WorldState} from '../types/world';
import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {cloneWorldWithColdHistory} from './coldHistoryEngine';
import {disasterShelterLocksTravel} from './disasterShelterCheckpoint';
import {activeEscortForActor} from './escortEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {activePilgrimageForActor} from './pilgrimageEngine';
import {activeRelocationForActor} from './relocationEngine';
import {activeCourierForActor} from './sealedCourierEngine';
import {sparringLocksActor} from './sparringEngine';
import {isSectActive} from './sectActivity';

type HeroMove=Exclude<GrandSiegeHeroMove,'hold'>;
export const GRAND_SIEGE_HERO_COSTS={
  'elder-rescue':{qi:24,hp:0,wall:28},
  'leader-last-stand':{qi:18,hp:12,wall:22},
} as const;
export const GRAND_SIEGE_CRISIS_WALL=150;
export interface GrandSiegeHeroOption{
  action:'GRAND_SIEGE_HERO';
  targetGrandSiegeId:string;
  grandSiegeHeroMove:GrandSiegeHeroMove;
}
type View=ReturnType<typeof createTerrainMapView>;
export interface GrandSiegeTheatreView{
  siegeId:string;
  siteId:string;
  attackerName:string;
  defenderName:string;
  status:SectSiege['status'];
  arrivedTick?:number;
  round?:GrandSiegeRound;
  terminal?:GrandSiegeTheatre['terminal'];
  options:GrandSiegeHeroOption[];
  queued?:GrandSiegeHeroOrder;
}
const isRankedPair=(a:Sect,b:Sect)=>a.alignment!==b.alignment&&a.alignment!=='中立'&&b.alignment!=='中立';
const uniqueById=<T extends {id:string}>(rows:readonly T[],id:string):T|undefined=>{
  let found:T|undefined;
  for(const row of rows){if(row.id!==id)continue;if(found)return undefined;found=row;}
  return found;
};
function siegeSite(world:WorldState,siege:SectSiege){
  const site=uniqueById(world.locations,siege.destinationId);
  return site&&!isScopedExpeditionGate(site)?site:undefined;
}
function homeSects(world:WorldState,siege:SectSiege){
  const attacker=uniqueById(world.sects,siege.attackerSectId),defender=uniqueById(world.sects,siege.defenderSectId);
  const site=siegeSite(world,siege);
  return isSectActive(attacker)&&isSectActive(defender)&&site&&isRankedPair(attacker,defender)&&
    defender.headquartersId===site.id&&(!site.ownerSectId||site.ownerSectId===defender.id)?{attacker,defender,site}:undefined;
}

export function openGrandSiegeTheatre(world:WorldState,siege:SectSiege,event:WorldEvent):void{
  const sides=homeSects(world,siege);
  if(!sides||!world.sieges.includes(siege)||siege.theatre||siege.status!=='marching'||siege.rounds!==0||
    siege.startedTick!==world.tick||!currentPublic(world,event)||event.title!=='宗门集结攻山'||
    event.id!==`evt-${world.tick}-dip-${siege.attackerSectId}-${siege.defenderSectId}-launch_siege`||
    event.locationId!==sides.attacker.headquartersId)return;
  siege.theatre={openedTick:world.tick,sourceLaunchId:event.id,rounds:[]};
}
export function recordGrandSiegeArrival(world:WorldState,siege:SectSiege,event:WorldEvent):void{
  const theatre=theatreOf(world,siege);
  if(!theatre||theatre.arrivedTick!==undefined||theatre.terminal||siege.status!=='sieging'||!homeSects(world,siege)||
    world.tick<=theatre.openedTick+1||siege.lastResolvedTick!==world.tick||!currentPublic(world,event)||
    event.id!==roundEventId(world.tick,siege.id)||event.title!=='联军抵达山门'||event.locationId!==siege.destinationId)return;
  theatre.arrivedTick=world.tick;
}
export function isGrandSiegeFighterPresent(world:WorldState,actor:Cultivator,siteId:string){
  return actor.alive&&actor.hp>0&&actor.positionPlane===undefined&&!ascensionDutyActive(world,actor)&&actor.locationId===siteId&&
    actor.tribulation?.stage!=='lightning'&&actor.tribulation?.stage!=='heart_demon'&&
    !activeDanxiaMedicineEscort(world,actor)&&!activeEscortForActor(world,actor)&&!activeCourierForActor(world,actor)&&
    !activeRelocationForActor(world,actor)&&!activePilgrimageForActor(world,actor)&&!disasterShelterLocksTravel(world,actor)&&
    !expeditionRescueCheckpoint(world,actor)&&!boundaryReliefCheckpoint(world,actor)&&!sparringLocksActor(world,actor)&&
    !world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(actor.id))&&
    !world.forbiddenDuels?.some(row=>row.attackerId===actor.id||row.defenderId===actor.id);
}
function hasAlliance(world:WorldState,own:string,actorSectId:string){
  return own===actorSectId||world.diplomacy.some(row=>row.pact==='alliance'&&
    (row.sectAId===own&&row.sectBId===actorSectId||row.sectAId===actorSectId&&row.sectBId===own));
}
function orderedFighters(actors:Cultivator[],sectId:string){
  return actors.sort((a,b)=>Number(b.sectId===sectId)-Number(a.sectId===sectId)||
    b.combatPower-a.combatPower||a.id.localeCompare(b.id));
}
const stamp=(actor:Cultivator):GrandSiegeFighter=>({actorId:actor.id,sectId:actor.sectId,rank:actor.sectRank});
const validRoll=(n:number)=>Number.isFinite(n)&&n>=0&&n<1;
const pendingRounds=new WeakMap<GrandSiegeRound,{world:WorldState;siege:SectSiege;heroTried?:true}>();
const inFlight=new WeakSet<SectSiege>();
export function beginGrandSiegeRound(world:WorldState,siege:SectSiege,raiders:readonly Cultivator[],localDefenders:readonly Cultivator[],
  attackRoll:number,defenseRoll:number):GrandSiegeRound|undefined{
  const theatre=theatreOf(world,siege),sides=homeSects(world,siege);
  if(!theatre||!sides||theatre.arrivedTick===undefined||theatre.arrivedTick>=world.tick||theatre.terminal||
    siege.status!=='sieging'||inFlight.has(siege)||siege.lastResolvedTick!==world.tick||siege.rounds!==theatre.rounds.length+1||
    siege.rounds>7||!validRoll(attackRoll)||!validRoll(defenseRoll))return undefined;
  const canon=new Map<string,Cultivator|undefined>();
  for(const actor of world.cultivators)canon.set(actor.id,canon.has(actor.id)?undefined:actor);
  const filter=(candidates:readonly Cultivator[],own:string,attack:boolean)=>{
    const accepted=new Set<string>();
    return orderedFighters(candidates.filter(actor=>{
      if(canon.get(actor.id)!==actor||accepted.has(actor.id)||siege.participantIds.includes(actor.id)!==attack||
        !isGrandSiegeFighterPresent(world,actor,siege.destinationId)||!hasAlliance(world,own,actor.sectId))return false;
      accepted.add(actor.id);return true;
    }),own);
  };
  const attackers=filter(raiders,siege.attackerSectId,true),defenders=filter(localDefenders,siege.defenderSectId,false);
  const {arrayHp,arrayMaxHp}=sides.defender;
  const round:GrandSiegeRound={round:siege.rounds,tick:world.tick,sourceEventId:roundEventId(world.tick,siege.id),
    wallBefore:arrayHp,wallAfter:arrayHp,wallMax:arrayMaxHp,attackers:attackers.map(stamp),defenders:defenders.map(stamp)};
  const frontAttacker=attackers.find(actor=>actor.hp>=2),frontDefender=defenders.find(actor=>actor.hp>=2);
  if(round.round===1&&frontAttacker&&frontDefender){
    const power=(actor:Cultivator,roll:number)=>actor.combatPower*(.4+.6*actor.hp/Math.max(1,actor.maxHp))*(.82+.36*roll);
    const winner=power(frontAttacker,attackRoll)>=power(frontDefender,defenseRoll)?frontAttacker:frontDefender;
    const damage=(actor:Cultivator)=>Math.min(Math.floor(actor.hp-1),Math.max(1,Math.min(12,Math.round(actor.maxHp*(winner===actor?.03:.06)))));
    const attackerDamage=damage(frontAttacker),defenderDamage=damage(frontDefender);
    frontAttacker.hp-=attackerDamage;frontDefender.hp-=defenderDamage;
    round.clash={attackerId:frontAttacker.id,defenderId:frontDefender.id,winnerId:winner.id,attackerDamage,defenderDamage};
  }
  inFlight.add(siege);
  pendingRounds.set(round,{world,siege});
  return round;
}
function heroMove(actor:Cultivator,world:WorldState,siege:SectSiege):HeroMove|undefined{
  const theatre=theatreOf(world,siege),sides=homeSects(world,siege);
  if(!theatre||!sides||theatre.terminal||theatre.arrivedTick===undefined||theatre.arrivedTick>world.tick||
    siege.status!=='sieging'||theatre.rounds.some(round=>round.hero!==undefined)||
    sides.defender.arrayHp<=0||sides.defender.arrayHp>GRAND_SIEGE_CRISIS_WALL||
    actor.sectId!==sides.defender.id||uniqueById(world.cultivators,actor.id)!==actor||!isGrandSiegeFighterPresent(world,actor,sides.site.id)||
    world.sieges.some(row=>row!==siege&&(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(actor.id)))return undefined;
  const move=actor.sectRank==='太上长老'?'elder-rescue':actor.sectRank==='掌门'&&
    sides.defender.leaderId===actor.id?'leader-last-stand':undefined;
  if(!move)return undefined;
  const cost=GRAND_SIEGE_HERO_COSTS[move];
  return actor.qiProgress>=cost.qi&&actor.hp>cost.hp?move:undefined;
}
const guided=(world:WorldState,actorId:string)=>world.playerAvatar?.possessedId===actorId&&
  (world.playerAvatar.possessionUntilTick??0)>world.tick;
function optionsFor(actor:Cultivator,world:WorldState,siege:SectSiege):GrandSiegeHeroOption[]{
  const move=heroMove(actor,world,siege);
  if(!move||siege.theatre?.queued)return [];
  const moves:readonly GrandSiegeHeroMove[]=[move,'hold'];
  return moves.map(grandSiegeHeroMove=>({action:'GRAND_SIEGE_HERO',targetGrandSiegeId:siege.id,grandSiegeHeroMove}));
}
export function availableGrandSiegeHeroActions(actor:Cultivator,world:WorldState):GrandSiegeHeroOption[]{
  return world.sieges.filter(siege=>siege.status==='sieging').flatMap(siege=>optionsFor(actor,world,siege));
}
export function hasQueuedGrandSiegeHero(world:WorldState,actor:Cultivator):boolean{
  return world.sieges.some(siege=>siege.theatre?.queued?.actorId===actor.id&&Boolean(heroMove(actor,world,siege)));
}
const prefersHold=(actor:Cultivator)=>actor.personality==='苟道'||actor.hp<actor.maxHp*.25;
export function chooseGrandSiegeHeroDecision(world:WorldState,actor:Cultivator):LLMDecisionPayload|undefined{
  if(guided(world,actor.id))return undefined;
  const choices=availableGrandSiegeHeroActions(actor,world);
  const chosen=choices.find(row=>prefersHold(actor)?row.grandSiegeHeroMove==='hold':row.grandSiegeHeroMove!=='hold');
  return chosen&&{chosenAction:chosen.action,targetGrandSiegeId:chosen.targetGrandSiegeId,
    grandSiegeHeroMove:chosen.grandSiegeHeroMove,innerMonologue:chosen.grandSiegeHeroMove==='hold'?'敌势未明，我不妄耗一身灵息。':'阵脚已松，此刻不撑，更待何时？'};
}
export function queueGrandSiegeHero(world:WorldState,actorId:string,siegeId:string,move:GrandSiegeHeroMove):WorldState{
  const actor=uniqueById(world.cultivators,actorId);
  if(!actor||!guided(world,actorId)||!availableGrandSiegeHeroActions(actor,world).some(row=>row.targetGrandSiegeId===siegeId&&row.grandSiegeHeroMove===move))return world;
  const next=cloneWorldWithColdHistory(world),theatre=uniqueById(next.sieges,siegeId)?.theatre;
  if(!theatre)return world;
  theatre.queued={actorId,move,queuedTick:world.tick};
  return next;
}
export function applyGrandSiegeHero(world:WorldState,siege:SectSiege,round:GrandSiegeRound,baseHarm:number,
  model?:{actorId:string;decision:LLMDecisionPayload},onModelHold?:(actorId:string)=>void):number{
  const theatre=theatreOf(world,siege),pending=pendingRounds.get(round);
  if(!theatre||pending?.world!==world||pending.siege!==siege||pending.heroTried)return baseHarm;
  pending.heroTried=true;
  const queued=theatre.queued;
  if(queued&&queued.queuedTick<world.tick)delete theatre.queued;
  const actualHarm=Math.min(baseHarm,round.wallBefore);
  if(!Number.isFinite(actualHarm)||actualHarm<=0||theatre.rounds.some(row=>row.hero))return baseHarm;
  const parties=round.defenders.map(stamp=>uniqueById(world.cultivators,stamp.actorId)).filter((actor):actor is Cultivator=>Boolean(actor));
  const choiceFor=(actor:Cultivator,move:GrandSiegeHeroMove|undefined,origin:GrandSiegeHeroOrigin)=>{
    const realMove=heroMove(actor,world,siege);
    return move&&move!=='hold'&&move===realMove?{actor,move,origin}:undefined;
  };
  let choice:ReturnType<typeof choiceFor>;
  const guide=parties.find(actor=>guided(world,actor.id)&&heroMove(actor,world,siege));
  if(queued){
    const actor=parties.find(candidate=>candidate.id===queued.actorId);
    if(actor&&queued.queuedTick+1===world.tick)choice=choiceFor(actor,queued.move,'player');
  }else if(!guide&&model&&model.decision.chosenAction==='GRAND_SIEGE_HERO'&&model.decision.targetGrandSiegeId===siege.id){
    const actor=parties.find(candidate=>candidate.id===model.actorId);
    if(actor&&!guided(world,actor.id)){
      if(model.decision.grandSiegeHeroMove==='hold'&&heroMove(actor,world,siege))onModelHold?.(actor.id);
      else choice=choiceFor(actor,model.decision.grandSiegeHeroMove,'model');
    }
  }else if(!guide){
    const actor=parties.filter(actor=>!guided(world,actor.id)&&heroMove(actor,world,siege)&&!prefersHold(actor))
      .sort((a,b)=>Number(b.sectRank==='太上长老')-Number(a.sectRank==='太上长老')||a.id.localeCompare(b.id))[0];
    if(actor)choice=choiceFor(actor,heroMove(actor,world,siege),'utility');
  }
  if(!choice)return baseHarm;
  const cost=GRAND_SIEGE_HERO_COSTS[choice.move],wallSaved=Math.min(actualHarm,cost.wall);
  const {actor}=choice;
  actor.qiProgress-=cost.qi;
  actor.hp-=cost.hp;
  round.hero={actorId:actor.id,move:choice.move,origin:choice.origin,rank:actor.sectRank,paidQi:cost.qi,paidHp:cost.hp,wallSaved};
  return actualHarm-wallSaved;
}
export function finishGrandSiegeRound(world:WorldState,siege:SectSiege,round:GrandSiegeRound,event:WorldEvent,wallAfter:number):void{
  const theatre=theatreOf(world,siege),pending=pendingRounds.get(round);
  if(!theatre||pending?.world!==world||pending.siege!==siege||round.round!==theatre.rounds.length+1||
    !currentPublic(world,event)||event.id!==round.sourceEventId||event.locationId!==siege.destinationId||
    !Number.isFinite(wallAfter)||wallAfter<0||wallAfter>round.wallBefore)return;
  pendingRounds.delete(round);
  inFlight.delete(siege);
  round.wallAfter=wallAfter;
  theatre.rounds.push(round);
  if(theatre.queued&&theatre.queued.queuedTick<world.tick)delete theatre.queued;
}

export function projectGrandSiegeTheatres(world:WorldState,view:View,viewerId?:string|null):GrandSiegeTheatreView[]{
  const viewer=viewerId?uniqueById(world.cultivators,viewerId):undefined;
  return world.sieges.flatMap(siege=>{
    const theatre=siege.theatre,site=siegeSite(world,siege);
    if(!theatre||!site||!view.seenLocations.includes(site)||!view.isCurrentLocation(site.id))return [];
    const attacker=uniqueById(world.sects,siege.attackerSectId),defender=uniqueById(world.sects,siege.defenderSectId);
    if(!attacker||!defender)return [];
    const round=theatre.rounds.at(-1),ownsGuide=viewer&&guided(world,viewer.id);
    return [{siegeId:siege.id,siteId:site.id,status:siege.status,attackerName:attacker.name,defenderName:defender.name,
      arrivedTick:theatre.arrivedTick,round:round&&structuredClone(round),terminal:theatre.terminal&&{...theatre.terminal},
      options:ownsGuide?optionsFor(viewer,world,siege):[],
      queued:ownsGuide&&theatre.queued?.actorId===viewer.id?{...theatre.queued}:undefined}];
  });
}
