import { availableAbandonedQuarterActions,type AbandonedQuarterOption } from '../engine/abandonedQuarter';
import {exactAbandonedQuarterDecision,abandonedQuarterCommand} from '../engine/abandonedQuarterCognition';
import type {WorldState} from '../types/world';
export interface GuidedAbandonedQuarterTurn {
  readonly kind:'abandoned-quarter';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:AbandonedQuarterOption;
}
export function resolveGuidedAbandonedQuarterTurn(order:GuidedAbandonedQuarterTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='ABANDONED_QUARTER')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactAbandonedQuarterDecision(abandonedQuarterCommand(order.option),availableAbandonedQuarterActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
