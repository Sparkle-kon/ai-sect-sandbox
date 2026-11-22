import {activeAvatar} from '../engine/avatarEngine';
import {availableHeartDemonRecovery,heartDemonRecoveryEventId,heartDemonRecoveryQi,type HeartDemonRecoveryOption} from '../engine/heartDemonAftermathEngine';
import type {LLMDecisionPayload,WorldState} from '../types/world';

export interface GuidedHeartDemonRecoveryTurn {
  readonly kind:'heart-demon-recovery';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:HeartDemonRecoveryOption;
}

export function resolveGuidedHeartDemonRecoveryTurn(request:GuidedHeartDemonRecoveryTurn,world:WorldState,branchId:string,revision:number):
  {actorId:string;decision:LLMDecisionPayload}|undefined{
  if(world!==request.world||branchId!==request.branchId||revision!==request.revision)return undefined;
  const actor=activeAvatar(world);
  if(!actor||actor.id!==request.actorId||world.cultivators.filter(row=>row.id===actor.id).length!==1)return undefined;
  const option=availableHeartDemonRecovery(world,actor,world.tick+1);
  if(!option||request.option.action!==option.action||request.option.targetHeartDemonAftermathId!==option.targetHeartDemonAftermathId)return undefined;
  return {actorId:actor.id,decision:{chosenAction:'REST',targetHeartDemonAftermathId:option.targetHeartDemonAftermathId,
    innerMonologue:'不去追逐幻象，只把眼前这一念看清。'}};
}

export function hasGuidedHeartDemonRecoveryReceipt(request:GuidedHeartDemonRecoveryTurn,result:WorldState):boolean{
  const bodies=result.cultivators.filter(row=>row.id===request.actorId);
  const aftermath=bodies.length===1?bodies[0].heartDemonAftermath:undefined,recovery=aftermath?.recovery;
  if(!aftermath||!recovery||result.tick!==request.world.tick+1||aftermath.trialId!==request.option.targetHeartDemonAftermathId||
    recovery.tick!==result.tick||recovery.qiPaid!==heartDemonRecoveryQi(aftermath)||
    recovery.eventId!==heartDemonRecoveryEventId(aftermath.trialId,result.tick))return false;
  const witnesses=result.events.filter(row=>row.id===recovery.eventId);
  const [witness]=witnesses;
  return witnesses.length===1&&witness.tick===result.tick&&witness.year===result.year&&witness.month===result.month&&witness.category==='intrigue'&&witness.witnessScope==='participants'&&
    witness.locationId===recovery.siteId&&witness.actorIds.length===1&&witness.actorIds[0]===request.actorId;
}
