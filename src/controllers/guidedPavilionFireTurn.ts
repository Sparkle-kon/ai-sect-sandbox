import { availablePavilionFireActions } from '../engine/pavilionFire';
import { exactPavilionFireDecision,pavilionFireCommand } from '../engine/pavilionFireCognition';
import type { PavilionFireOption } from '../types/pavilionFire';
import type { WorldState } from '../types/world';

export interface GuidedPavilionFireTurn {
  readonly kind:'pavilion-fire';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:PavilionFireOption;
}
export function resolveGuidedPavilionFireTurn(order:GuidedPavilionFireTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='PAVILION_FIRE')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactPavilionFireDecision(pavilionFireCommand(order.option),availablePavilionFireActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
