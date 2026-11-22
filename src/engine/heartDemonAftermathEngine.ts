import type {HeartDemonAftermath} from '../types/heartDemon';
import type {Cultivator,TribulationTrial,WorldEvent,WorldState} from '../types/world';
import {heartDemonFrameId,heartDemonResultEventId} from './heartDemonEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {disasterShelterLocksTravel} from './disasterShelterCheckpoint';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import {activeSiegeForActor} from './siegeParticipants';

import {HEART_DEMON_AFTERMATH_MONTHS,heartDemonRecoveryEventId,heartDemonRecoveryQi} from './heartDemonAftermathTerms';
export {HEART_DEMON_AFTERMATH_MONTHS,heartDemonRecoveryEventId,heartDemonRecoveryQi,isHeartDemonRecoveryEvent} from './heartDemonAftermathTerms';

const copy={
  sever:{title:'斩影留痕',scene:'幻影断了。再听人叩门时，手却还停在门闩上。'},
  wrath:{title:'余火未熄',scene:'幻境已经散去，胸中的火却还没有冷。'},
  face:{title:'映心初定',scene:'敢回望幻象之后，这一次，听见人声没有立即回避。'},
} as const;

function canonicalActor(world:WorldState,actor:Cultivator):boolean{
  let found=false;
  for(const row of world.cultivators){
    if(row.id!==actor.id)continue;
    if(found||row!==actor)return false;
    found=true;
  }
  return found;
}

export function recordHeartDemonAftermath(world:WorldState,actor:Cultivator,trial:TribulationTrial,event:WorldEvent):void{
  const frame=trial.heartDemon,result=frame?.result;
  if(!frame||!result||actor.tribulation!==trial||!actor.alive||actor.hp<=0||actor.positionPlane!==undefined||
     result.outcome==='died'||result.resolvedTick!==world.tick||trial.resolvedTick!==world.tick||
     (result.outcome==='passed'?trial.stage!=='passed':trial.stage!=='failed')||
     frame.id!==heartDemonFrameId(trial.id)||frame.actorId!==actor.id||frame.cancelledTick!==undefined||
     frame.openedTick>=world.tick||event.id!==heartDemonResultEventId(frame.id)||event.tick!==world.tick||
     event.locationId!==frame.siteId||event.category!=='intrigue'||event.witnessScope!=='participants'||
     event.actorIds.length!==1||event.actorIds[0]!==actor.id||
     (actor.heartDemonAftermath?.resolvedTick??-1)>=world.tick)return;
  actor.heartDemonAftermath={trialId:trial.id,resultEventId:event.id,siteId:frame.siteId,resolvedTick:world.tick,
    choice:result.choice,outcome:result.outcome,endsTick:world.tick+HEART_DEMON_AFTERMATH_MONTHS};
}

export function activeHeartDemonAftermath(world:WorldState,actor:Cultivator,executionTick=world.tick):HeartDemonAftermath|undefined{
  const row=actor.heartDemonAftermath;
  return row&&actor.alive&&actor.hp>0&&actor.positionPlane===undefined&&!row.recovery&&
    executionTick>row.resolvedTick&&executionTick<=row.endsTick?row:undefined;
}
export interface HeartDemonRecoveryOption {action:'REST';targetHeartDemonAftermathId:string}
function recoverySite(world:WorldState,actor:Cultivator){
  if(actor.tribulation?.stage==='lightning'||actor.tribulation?.stage==='heart_demon'||
    world.ascension?.trials.some(row=>row.actorId===actor.id&&(row.phase==='warning'||row.phase==='lightning'))||
    activeDanxiaMedicineEscort(world,actor)||activeSiegeForActor(world,actor)||disasterShelterLocksTravel(world,actor)||
    expeditionRescueCheckpoint(world,actor)||boundaryReliefCheckpoint(world,actor))return undefined;
  const sites=world.locations.filter(row=>row.id===actor.locationId);
  const [site]=sites;
  return sites.length===1&&!isScopedExpeditionGate(site)&&
    (site.type==='sect_hq'||site.type==='market'||site.type==='spirit_vein')?site:undefined;
}

export function availableHeartDemonRecovery(world:WorldState,actor:Cultivator,executionTick=world.tick):HeartDemonRecoveryOption|undefined{
  const row=activeHeartDemonAftermath(world,actor,executionTick);
  return row&&actor.qiProgress>=heartDemonRecoveryQi(row)&&canonicalActor(world,actor)&&recoverySite(world,actor)?
    {action:'REST',targetHeartDemonAftermathId:row.trialId}:undefined;
}

/** Dispatch only on an explicitly targeted real REST month, after the native duty gates. */
export function resolveHeartDemonRecovery(world:WorldState,actor:Cultivator,targetHeartDemonAftermathId:string):WorldEvent|null{
  const option=availableHeartDemonRecovery(world,actor);
  const row=actor.heartDemonAftermath;
  if(!option||!row||option.targetHeartDemonAftermathId!==targetHeartDemonAftermathId)return null;
  const qiBefore=actor.qiProgress,qiPaid=heartDemonRecoveryQi(row),siteId=actor.locationId,tick=world.tick;
  const eventId=heartDemonRecoveryEventId(row.trialId,tick);
  actor.qiProgress-=qiPaid;
  row.recovery={tick,siteId,qiBefore,qiPaid,eventId};
  return {id:eventId,tick,year:world.year,month:world.month,title:'静室收心',
    description:'灵气走完一周天。不再追逐幻象，只把眼前这一念看明白。往后，再不任余波替自己作主。',
    category:'intrigue',actorIds:[actor.id],locationId:siteId,witnessScope:'participants'};
}

export interface HeartDemonAftermathView {
  actorId:string;title:string;scene:string;status:'active'|'recovered'|'elapsed';
  resolvedTick:number;endsTick:number;recoveredTick?:number;qiCost:number;recovery?:HeartDemonRecoveryOption;
}

export function projectHeartDemonAftermath(world:WorldState,viewer:Cultivator|undefined,actor=viewer):HeartDemonAftermathView|undefined{
  if(!viewer||actor!==viewer||!actor.alive||actor.hp<=0||actor.positionPlane!==undefined||!canonicalActor(world,actor))return undefined;
  const row=actor.heartDemonAftermath;
  if(!row||row.resolvedTick>world.tick)return undefined;
  const story=copy[row.choice];
  return {actorId:actor.id,title:story.title,scene:row.outcome==='failed'?`劫后伤势未平。${story.scene}`:story.scene,
    resolvedTick:row.resolvedTick,endsTick:row.endsTick,
    status:row.recovery?'recovered':world.tick>row.endsTick?'elapsed':'active',
    recoveredTick:row.recovery?.tick,qiCost:heartDemonRecoveryQi(row),
    recovery:availableHeartDemonRecovery(world,actor,world.tick+1)};
}
