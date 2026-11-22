import {ROGUELIKE_ENCOUNTER_CHOICES,type RoguelikeEncounterChoice,type RoguelikeEncounterRecord}
  from '../types/roguelikeEncounter';
import type {Cultivator,LLMDecisionPayload,LocationNode,WorldEvent,WorldState} from '../types/world';
import {activeAvatar} from './avatarEngine';
import {cloneWorldWithColdHistory} from './coldHistoryEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import {disasterShelterCheckpoint} from './disasterShelterCheckpoint';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {courierCheckpoint} from './sealedCourierEngine';
import {pilgrimageCheckpoint} from './pilgrimageEngine';
import {recordMemory} from './memoryEngine';
import {regionForPoint} from './simulationRegionGeometry';
import {ROGUELIKE_ENCOUNTER_CATALOG,roguelikeNominalEffect} from './roguelikeEncounterCatalog';
import {currentSectGateTrialAuthority,openSectGateTrialStamp,sectGateReceiptText,sectGateReputationDelta} from './sectGateTrialEngine';

export const ROGUELIKE_ENCOUNTER_HISTORY=96;
export const ROGUELIKE_ENCOUNTER_ACTOR_COOLDOWN=6;
export const ROGUELIKE_ENCOUNTER_NPC_OPENING_THRESHOLD=1; // One in 100 qualifying native arrivals, without touching the simulation RNG.
type Stamp=Pick<RoguelikeEncounterRecord,'actorId'|'fromSiteId'|'siteId'|'openedTick'>;
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
const lowerAlive=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0&&actor.positionPlane===undefined;
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const byActor=(world:WorldState,id:string)=>{
  const matches=world.cultivators.filter(actor=>actor.id===id);
  return matches.length===1?matches[0]:undefined;
};
const openRows=(world:WorldState)=>world.roguelikeEncounters??[];
const isChoice=(choice:RoguelikeEncounterChoice)=>ROGUELIKE_ENCOUNTER_CHOICES.includes(choice);

export function roguelikeEncounterRoll(world:WorldState,record:Stamp,choice?:RoguelikeEncounterChoice|'opening'|'kind'):number{
  const label=JSON.stringify([world.random.seed,record.openedTick,record.actorId,record.fromSiteId,record.siteId,choice??'opening']);
  let value=0x811c9dc5;
  for(let i=0;i<label.length;i++)value=Math.imul(value^label.charCodeAt(i),0x01000193);
  value=Math.imul(value^(value>>>15),0x85ebca6b);
  return ((value^(value>>>13))>>>0)%100;
}
function exactSite(world:WorldState,id:string):LocationNode|undefined{
  const points=world.locations.filter(site=>site.id===id);
  return points.length===1&&!isScopedExpeditionGate(points[0])?points[0]:undefined;
}
export function roguelikeEncounterRoute(world:WorldState,fromSiteId:string,siteId:string):boolean{
  if(fromSiteId===siteId)return false;
  const origin=exactSite(world,fromSiteId),dest=exactSite(world,siteId);
  if(!origin||!dest)return false;
  if(dest.id==='loc-secret-1'&&dest.type==='secret_realm')return true;
  const a=regionForPoint(world,origin),b=regionForPoint(world,dest);
  return !!a&&!!b&&a!==b;
}
function stationary(world:WorldState,actor:Cultivator|undefined,siteId:string):actor is Cultivator{
  if(!lowerAlive(actor)||actor.locationId!==siteId||byActor(world,actor.id)!==actor||
    actor.tribulation?.stage==='lightning'||actor.tribulation?.stage==='heart_demon')return false;
  const id=actor.id;
  return !world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(id))&&
    !world.escorts.contracts.some(row=>row.status==='active'&&row.escortId===id)&&
    !activeDanxiaMedicineEscort(world,actor)&&
    !world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(id))&&
    !world.occasions.some(row=>(row.status==='running'||row.status==='registration')&&row.participantIds.includes(id))&&
    !courierCheckpoint(world,actor)&&!pilgrimageCheckpoint(world,actor)&&!expeditionRescueCheckpoint(world,actor)&&
    !boundaryReliefCheckpoint(world,actor)&&!disasterShelterCheckpoint(world,actor);
}
function witnessFor(world:WorldState,record:RoguelikeEncounterRecord):Cultivator|undefined{
  const witness=record.witnessId&&record.witnessId!==record.actorId?byActor(world,record.witnessId):undefined;
  return stationary(world,witness,record.siteId)?witness:undefined;
}
export function describeRoguelikeEncounter(_world:WorldState,record:RoguelikeEncounterRecord){
  return ROGUELIKE_ENCOUNTER_CATALOG[record.kind];
}
function event(world:WorldState,row:RoguelikeEncounterRecord,phase:'open'|'settled'):WorldEvent{
  if(row.kind==='sect-gate')return {id:`evt-${row.id}-${phase}`,tick:world.tick,year:world.year,month:world.month,
    ...sectGateReceiptText(phase==='settled'?row.choice:undefined),
    category:'intrigue',actorIds:[row.actorId],locationId:row.siteId,witnessScope:'participants'};
  const {title,scene}=ROGUELIKE_ENCOUNTER_CATALOG[row.kind];
  const description=phase==='open'?scene:row.choice==='leave'?'你没有伸手，把这一步留给了将来。':
    row.outcome?.success?'你没有白走这一遭。所得所失，都写在这段亲历里。':
      '此路未如所愿。你从险处抽身，所受的波折都已落在身上。';
  return {id:`evt-${row.id}-${phase}`,tick:world.tick,year:world.year,month:world.month,
    title:phase==='open'?title:`${title}：${row.choice==='leave'?'转身':row.outcome?.success?'得悟':'余波'}`,
    description,category:'intrigue',actorIds:[row.actorId],locationId:row.siteId,witnessScope:'participants'};
}

/** Only the caller's independently successful movement step may open a new local encounter. */
export function maybeOpenRoguelikeEncounter(world:WorldState,actor:Cultivator,originId:string):WorldEvent|undefined{
  if(actor.currentAction!=='EXPLORE'||!stationary(world,actor,actor.locationId)||
    openRows(world).some(row=>row.actorId===actor.id&&
      (row.status==='offered'||world.tick-row.openedTick<ROGUELIKE_ENCOUNTER_ACTOR_COOLDOWN)))return undefined;
  const guided=activeAvatar(world)===actor;
  const stamp={actorId:actor.id,fromSiteId:originId,siteId:actor.locationId,openedTick:world.tick};
  const sectGate=guided?openSectGateTrialStamp(world,actor,originId,stationary):undefined;
  if(sectGate){
    const row:RoguelikeEncounterRecord={id:`roguelike-encounter-${world.tick}-${actor.id}`,...stamp,
      kind:'sect-gate',guided:true,sectGate,status:'offered'};
    (world.roguelikeEncounters??=[]).push(row);
    return event(world,row,'open');
  }
  if(!roguelikeEncounterRoute(world,originId,actor.locationId))return undefined;
  if(!guided&&roguelikeEncounterRoll(world,stamp,'opening')>=ROGUELIKE_ENCOUNTER_NPC_OPENING_THRESHOLD)return undefined;
  const aim=roguelikeEncounterRoll(world,stamp,'kind');
  const witness=aim>=34&&aim<67?world.cultivators.filter(other=>other.id!==actor.id&&other.hp/other.maxHp<.45&&
    stationary(world,other,stamp.siteId)).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||compare(a.id,b.id))[0]:undefined;
  const kind=witness?'wounded-traveler':aim<50?'sword-cave':'sealed-scroll';
  const row:RoguelikeEncounterRecord={id:`roguelike-encounter-${world.tick}-${actor.id}`,...stamp,kind,guided,
    ...(witness?{witnessId:witness.id}:{}),status:'offered'};
  (world.roguelikeEncounters??=[]).push(row);
  return event(world,row,'open');
}

export function activeRoguelikeEncounter(world:WorldState,actor:Cultivator):RoguelikeEncounterRecord|undefined{
  const rows=openRows(world).filter(row=>row.actorId===actor.id&&row.status==='offered'&&row.openedTick<=world.tick&&
    world.tick<=row.openedTick+1&&stationary(world,actor,row.siteId)&&
    (row.kind==='sect-gate'?!!currentSectGateTrialAuthority(world,actor,row,stationary):
      roguelikeEncounterRoute(world,row.fromSiteId,row.siteId)&&(row.kind!=='wounded-traveler'||!!witnessFor(world,row))));
  return rows.length===1?rows[0]:undefined;
}
export function chooseRoguelikeEncounterDecision(world:WorldState,actor:Cultivator):LLMDecisionPayload|undefined{
  const row=activeRoguelikeEncounter(world,actor);
  if(!row||row.kind==='sect-gate')return undefined;
  const condition=actor.hp/actor.maxHp;
  let choice:RoguelikeEncounterChoice='cautious';
  if(row.guided||condition<.25||actor.personality==='苟道'&&condition<.6)choice='leave';
  else if(actor.personality==='狂傲'||actor.personality==='嗜血'||actor.personality==='逍遥'&&condition>=.8||
    actor.personality==='痴情'&&row.kind==='wounded-traveler'&&condition>=.6)choice='bold';
  else if(actor.personality==='诡诈'&&row.kind==='wounded-traveler')choice='leave';
  return {chosenAction:'ROGUELIKE_ENCOUNTER',targetRoguelikeEncounterId:row.id,roguelikeEncounterChoice:choice,
    innerMonologue:choice==='leave'?'不必为陌生的机缘押上性命。':choice==='bold'?'此刻若退，往后未必还有这一线。':'先看清，再伸手。'};
}

function earnAffinity(world:WorldState,actor:Cultivator,witness:Cultivator,delta:number):number{
  if(delta===0)return 0;
  const edge=world.relationships.find(row=>row.fromId===actor.id&&row.toId===witness.id||
    row.fromId===witness.id&&row.toId===actor.id);
  if(!edge){
    world.relationships.push({fromId:actor.id,toId:witness.id,
      type:delta<0?'竞争':actor.sectId&&actor.sectId===witness.sectId?'同门':'挚友',affinity:delta,note:'行路负伤时，记得有人停步相助。'});
    return delta;
  }
  const prior=edge.affinity;
  edge.affinity=clamp(prior+delta,-100,100);
  if(edge.affinity>=80&&edge.type==='竞争')edge.type='挚友';
  return edge.affinity-prior;
}

function settle(world:WorldState,actor:Cultivator,encounterId:string,choice:RoguelikeEncounterChoice,
  explicitGuide:boolean):WorldEvent|null{
  if(!isChoice(choice))return null;
  const row=activeRoguelikeEncounter(world,actor);
  if(!row||row.id!==encounterId)return null;
  if(world.tick===row.openedTick){
    if(!explicitGuide||!row.guided||activeAvatar(world)!==actor)return null;
  }else if(explicitGuide||row.guided&&choice!=='leave')return null;

  if(row.kind==='sect-gate'){
    if(!explicitGuide)return null;
    const sect=currentSectGateTrialAuthority(world,actor,row,stationary);
    if(!sect)return null;
    const sectReputationDelta=sectGateReputationDelta(sect.alignment,choice,sect.reputation);
    sect.reputation+=sectReputationDelta;
    row.status='resolved';row.resolvedTick=world.tick;row.choice=choice;
    row.outcome={success:choice!=='leave',qiDelta:0,hpDelta:0,karmaDelta:0,lifespanDelta:0,affinityDelta:0,sectReputationDelta};
    return event(world,row,'settled');
  }

  const {success,effect}=roguelikeNominalEffect(row.kind,choice,roguelikeEncounterRoll(world,row,choice));
  const qi=actor.qiProgress,hp=actor.hp,karma=actor.karma,years=actor.lifespan;
  if(effect.qi)actor.qiProgress=clamp(qi+effect.qi,0,100);
  if(effect.hpRate)actor.hp=clamp(hp+Math.round(actor.maxHp*effect.hpRate),Math.min(1,hp),actor.maxHp);
  if(effect.karma)actor.karma=clamp(karma+effect.karma,-100,100);
  if(effect.years)actor.lifespan=clamp(years+effect.years,effect.years<0?Math.min(years,actor.age+1):0,1_000_000_000);
  const witness=witnessFor(world,row);
  const affinityDelta=witness?earnAffinity(world,actor,witness,effect.affinity):0;
  row.status='resolved';row.resolvedTick=world.tick;row.choice=choice;
  row.outcome={success,qiDelta:actor.qiProgress-qi,hpDelta:actor.hp-hp,karmaDelta:actor.karma-karma,
    lifespanDelta:actor.lifespan-years,affinityDelta};
  const receipt=event(world,row,'settled');
  if(choice!=='leave')recordMemory(actor,world.tick,`${receipt.title}。\n${receipt.description}`,7,'cultivation',success?3:-2);
  return receipt;
}

export function settleRoguelikeEncounter(world:WorldState,actor:Cultivator,encounterId:string,choice:RoguelikeEncounterChoice):WorldEvent|null{
  return settle(world,actor,encounterId,choice,false);
}
export function resolveGuidedRoguelikeChoice(world:WorldState,encounterId:string,choice:RoguelikeEncounterChoice):WorldState{
  const avatar=activeAvatar(world),offering=avatar&&activeRoguelikeEncounter(world,avatar);
  if(!offering?.guided||offering.id!==encounterId||offering.openedTick!==world.tick||!isChoice(choice))return world;
  const next=cloneWorldWithColdHistory(world),nextAvatar=activeAvatar(next);
  if(!nextAvatar)return world;
  const settled=settle(next,nextAvatar,encounterId,choice,true);
  if(!settled)return world;
  next.events=[settled,...next.events].slice(0,120);
  return next;
}
export function finalizeRoguelikeEncounters(world:WorldState):void{
  const rows=world.roguelikeEncounters;
  if(!rows)return;
  for(const row of rows){
    if(row.status!=='offered')continue;
    const actor=byActor(world,row.actorId);
    if(world.tick>=row.openedTick+1||!stationary(world,actor,row.siteId)||
      row.kind==='wounded-traveler'&&!witnessFor(world,row)||
      row.kind==='sect-gate'&&(!actor||!currentSectGateTrialAuthority(world,actor,row,stationary))){
      row.status='expired';row.resolvedTick=world.tick;
    }
  }
  const hot=new Set<string>();
  for(const item of world.events){
    const match=/^evt-(roguelike-encounter-.+)-(?:open|settled)$/u.exec(item.id);
    if(match)hot.add(match[1]);
  }
  const old=rows.filter(row=>row.status!=='offered'&&row.resolvedTick!==world.tick&&!hot.has(row.id))
    .sort((a,b)=>(b.resolvedTick??0)-(a.resolvedTick??0)||compare(b.id,a.id));
  if(old.length>ROGUELIKE_ENCOUNTER_HISTORY){
    const drop=new Set(old.slice(ROGUELIKE_ENCOUNTER_HISTORY));
    world.roguelikeEncounters=rows.filter(row=>!drop.has(row));
  }
}
