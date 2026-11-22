import {RING_AUDIENCE_AIMS,type RingAudienceAim,type RingAudienceRole,type RingAudienceSession,type RingAudienceStance} from '../types/ringAudience';
import type {Cultivator,WorldEvent,WorldState} from '../types/world';
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
import {isSectActive} from './sectActivity';
import {sparringLocksActor} from './sparringEngine';
import {terrainTileAt} from './terrainEngine';
import {personaLine,privatePersonaText} from './wildPersonaEngine';

import {calculateRingAudienceTurn,ringAudienceInitialStance,ringAudienceInitialWavering,ringAudienceMessage,ringAudienceTone,
  RING_AUDIENCE_COST,RING_AUDIENCE_MAX_SESSIONS,RING_AUDIENCE_MAX_TURNS,RING_AUDIENCE_TABOO_TECHNIQUE,
  type RingAudienceCursor,type RingAudienceExchangeRequest,type RingAudienceOpenRequest} from './ringAudienceTerms';

export * from './ringAudienceTerms';
type Effect=NonNullable<RingAudienceSession['execution']>['effect'];
const roles:ReadonlySet<string>=new Set(['ring','heaven']);
const unique=<T extends {id:string}>(rows:readonly T[],id:string):T|undefined=>{
  let found:T|undefined;
  for(const row of rows){if(row.id!==id)continue;if(found)return undefined;found=row;}
  return found;
};
function nativeTarget(world:WorldState,targetId:string):Cultivator|undefined{
  const actor=unique(world.cultivators,targetId);
  if(!actor||!actor.alive||actor.hp<=0||actor.positionPlane!==undefined||actor.tribulation?.stage==='lightning'||
    actor.tribulation?.stage==='heart_demon')return undefined;
  const site=unique(world.locations,actor.locationId);
  if(!site||site.type==='secret_realm'||site.type==='abyss'||isScopedExpeditionGate(site)||!terrainTileAt(world,site.x,site.y))return undefined;
  if(world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(actor.id))||
    world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(actor.id))||
    world.forbiddenDuels?.some(row=>row.attackerId===actor.id||row.defenderId===actor.id)||
    activeDanxiaMedicineEscort(world,actor)||activeEscortForActor(world,actor)||activeCourierForActor(world,actor)||
    activeRelocationForActor(world,actor)||activePilgrimageForActor(world,actor)||disasterShelterLocksTravel(world,actor)||
    expeditionRescueCheckpoint(world,actor)||boundaryReliefCheckpoint(world,actor)||sparringLocksActor(world,actor))return undefined;
  return actor;
}
const ownBody=(world:WorldState,actor:Cultivator)=>world.playerAvatar.possessedId===actor.id&&
  (world.playerAvatar.possessionUntilTick??0)>world.tick;
const active=(session:RingAudienceSession)=>session.status==='open'||session.status==='sealed';
function realLeader(world:WorldState,actor:Cultivator):Cultivator|undefined{
  const sect=unique(world.sects,actor.sectId);
  if(!isSectActive(sect)||!sect.leaderId||sect.leaderId===actor.id||actor.locationId!==sect.headquartersId)return undefined;
  const leader=nativeTarget(world,sect.leaderId);
  return leader?.sectRank==='掌门'&&leader.sectId===sect.id&&leader.locationId===actor.locationId?leader:undefined;
}
function aimAllowed(world:WorldState,actor:Cultivator,aim:RingAudienceAim):boolean{
  const sect=unique(world.sects,actor.sectId);
  if(aim==='learn_taboo')return actor.qiProgress>=20&&actor.technique.id!==RING_AUDIENCE_TABOO_TECHNIQUE;
  if(!isSectActive(sect)||sect.leaderId===actor.id||actor.sectRank==='掌门')return false;
  return aim==='leave_sect'||Boolean(realLeader(world,actor));
}
export function availableRingAudienceAims(world:WorldState,targetId:string,role:RingAudienceRole):RingAudienceAim[]{
  if(!roles.has(role)||!world.playerAvatar||world.playerAvatar.audience?.sessions.some(active))return [];
  const target=nativeTarget(world,targetId);
  return target&&!ownBody(world,target)&&world.playerAvatar.essence>=RING_AUDIENCE_COST[role]?
    RING_AUDIENCE_AIMS.filter(aim=>aimAllowed(world,target,aim)):[];
}
function sessionTarget(world:WorldState,session:RingAudienceSession):Cultivator|undefined{
  const actor=nativeTarget(world,session.targetId);
  if(!actor||ownBody(world,actor)||actor.sectId!==session.openingSectId||!aimAllowed(world,actor,session.aim))return undefined;
  if(session.aim==='challenge_master'&&realLeader(world,actor)?.id!==session.leaderId)return undefined;
  return actor;
}
export function openRingAudience(world:WorldState,request:RingAudienceOpenRequest):WorldState{
  if(!availableRingAudienceAims(world,request.targetId,request.role).includes(request.aim))return world;
  const target=nativeTarget(world,request.targetId);
  if(!target)return world;
  const personality=target.personality,initial=ringAudienceInitialWavering(personality,request.aim);
  const next=cloneWorldWithColdHistory(world);
  const state=next.playerAvatar.audience??(next.playerAvatar.audience={nextId:1,sessions:[]});
  const leader=request.aim==='challenge_master'?realLeader(world,target):undefined;
  state.sessions.push({id:`ring-audience-${state.nextId++}`,role:request.role,targetId:target.id,aim:request.aim,
    openedTick:world.tick,openingSectId:target.sectId,personalityAtOpening:personality,initialWavering:initial,wavering:initial,
    stance:ringAudienceInitialStance,status:'open',turns:[],...(leader?{leaderId:leader.id}:{})});
  if(state.sessions.length>RING_AUDIENCE_MAX_SESSIONS)state.sessions.splice(0,state.sessions.length-RING_AUDIENCE_MAX_SESSIONS);
  return next;
}
function byCursor(world:WorldState,request:RingAudienceCursor):RingAudienceSession|undefined{
  const session=unique(world.playerAvatar.audience?.sessions??[],request.sessionId);
  return session?.role===request.role&&session.targetId===request.targetId&&session.turns.length===request.expectedTurn?session:undefined;
}
const notes:Record<RingAudienceStance,string>={
  steady:'此话我听见了，眼下还不能答应。',
  wavering:'这事我原不肯想，如今须再权衡。',
  accepts:'我愿应下此议。只是此刻尚未去做。',
  rebels:'我的道由我自己走。这番话，到此为止。',
};
const unvoiced=new WeakMap<WorldState,WorldState>();
export const isFreshRingAudienceExchange=(previous:WorldState,native:WorldState):boolean=>unvoiced.get(native)===previous;
export function exchangeRingAudience(world:WorldState,request:RingAudienceExchangeRequest):WorldState{
  const message=ringAudienceMessage(request.message),session=byCursor(world,request);
  if(!message||!session||session.status!=='open'||session.openedTick!==world.tick||session.stance==='accepts'||
    session.turns.length>=RING_AUDIENCE_MAX_TURNS||world.playerAvatar.essence<RING_AUDIENCE_COST[session.role])return world;
  const actor=sessionTarget(world,session);
  if(!actor)return world;
  const tone=ringAudienceTone(message),index=session.turns.length+1,cost=RING_AUDIENCE_COST[session.role];
  const result=calculateRingAudienceTurn(session.aim,session.role,session.personalityAtOpening,session.wavering,index,tone);
  const next=cloneWorldWithColdHistory(world),record=byCursor(next,request);
  if(!record)return world;
  const reply=personaLine({id:actor.id,personality:record.personalityAtOpening,destinyTraits:actor.destinyTraits},'thought')+notes[result.stance];
  next.playerAvatar.essence-=cost;
  record.turns.push({index,tick:world.tick,message,reply,source:'utility',tone,before:session.wavering,
    after:result.after,stance:result.stance,cost});
  record.wavering=result.after;
  record.stance=result.stance;
  if(result.stance==='rebels'){record.status='declined';record.closedTick=world.tick;}
  unvoiced.set(next,world);
  return next;
}
export function revoiceRingAudienceTurn(world:WorldState,request:RingAudienceCursor,rawReply:unknown):WorldState{
  const text=privatePersonaText(rawReply),session=byCursor(world,request),turn=session?.turns.at(-1);
  if(!text||!unvoiced.has(world)||!session||!turn||turn.source!=='utility'||turn.tick!==world.tick||
    session.openedTick!==world.tick||!sessionTarget(world,session))return world;
  const next=cloneWorldWithColdHistory(world),entry=byCursor(next,request)?.turns.at(-1);
  if(!entry)return world;
  entry.reply=text+turn.reply;
  entry.source='llm';
  return next;
}
export function closeRingAudience(world:WorldState,request:RingAudienceCursor):WorldState{
  const source=byCursor(world,request);
  if(!source||!active(source)||source.openedTick!==world.tick)return world;
  const next=cloneWorldWithColdHistory(world),session=byCursor(next,request);
  if(!session)return world;
  session.status='closed';
  session.closedTick=world.tick;
  delete session.sealedTick;
  return next;
}
export function sealRingAudience(world:WorldState,request:RingAudienceCursor):WorldState{
  const source=byCursor(world,request);
  if(!source||source.status!=='open'||source.stance!=='accepts'||source.openedTick!==world.tick||!sessionTarget(world,source))return world;
  const next=cloneWorldWithColdHistory(world),session=byCursor(next,request);
  if(!session)return world;
  session.status='sealed';
  session.sealedTick=world.tick;
  return next;
}
/** Private player-owned branch read; does not consult legacy avatar dialogue or public story. */
export function projectRingAudience(world:WorldState,role:RingAudienceRole,targetId?:string|null):RingAudienceSession|undefined{
  if(!roles.has(role))return undefined;
  const sessions=world.playerAvatar.audience?.sessions??[];
  for(let i=sessions.length-1;i>=0;i--){
    const row=sessions[i];
    if(row.role===role&&(!targetId||row.targetId===targetId))return structuredClone(row);
  }
  return undefined;
}
const executionGrants=new WeakMap<RingAudienceSession,{world:WorldState;tick:number}>();
export function pendingRingAudienceExecution(world:WorldState,actor:Cultivator):RingAudienceSession|undefined{
  const row=world.playerAvatar.audience?.sessions.find(session=>session.status==='sealed'&&session.targetId===actor.id&&
    session.sealedTick!==undefined&&session.sealedTick+1===world.tick);
  if(!row||sessionTarget(world,row)!==actor)return undefined;
  executionGrants.set(row,{world,tick:world.tick});
  return row;
}
const effects:Readonly<Record<RingAudienceAim,Effect>>={leave_sect:'left',learn_taboo:'learned',challenge_master:'confronted'};
export function finishRingAudienceExecution(world:WorldState,session:RingAudienceSession,event:WorldEvent,effect:Effect):boolean{
  const grant=executionGrants.get(session);
  if(grant?.world!==world||grant.tick!==world.tick||!world.playerAvatar.audience?.sessions.includes(session)||
    session.status!=='sealed'||session.sealedTick===undefined||
    session.sealedTick+1!==world.tick||effect!==effects[session.aim]||event.tick!==world.tick||event.year!==world.year||
    event.month!==world.month||event.actorIds[0]!==session.targetId||!event.locationId)return false;
  const actor=unique(world.cultivators,session.targetId);
  if(!actor||event.locationId!==actor.locationId)return false;
  const expected=`evt-${world.tick}-${actor.id}`;
  if(effect==='confronted'){
    if(event.actorIds.length!==2||event.actorIds[1]!==session.leaderId||!event.duelWinnerId||!event.actorIds.includes(event.duelWinnerId)||
      !(event.category==='combat'&&event.id===`${expected}-duel`||event.category==='death'&&event.id===`${expected}-kill`))return false;
  }else if(event.id!==`${expected}-audience-${effect}`||event.actorIds.length!==1||event.witnessScope!=='participants'||
    (effect==='left'?(actor.sectId!==''||event.category!=='diplomacy'):actor.technique.id!==RING_AUDIENCE_TABOO_TECHNIQUE||
      event.category!=='breakthrough'))return false;
  executionGrants.delete(session);
  session.status='executed';
  session.closedTick=world.tick;
  session.execution={tick:world.tick,effect,eventId:event.id};
  return true;
}
export function expireRingAudiences(world:WorldState):void{
  for(const row of world.playerAvatar.audience?.sessions??[]){
    if(!active(row)||row.openedTick>=world.tick)continue;
    row.status='expired';
    row.closedTick=world.tick;
  }
}
