import { availableFrontierGorgeActions,type FrontierGorgeOption } from '../engine/frontierGorge';
import { exactFrontierGorgeDecision, frontierGorgeCommand } from '../engine/frontierGorgeCognition';
import type { WorldState } from '../types/world';
export interface GuidedFrontierGorgeTurn {
  readonly kind:'frontier-gorge';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:FrontierGorgeOption;
}
export function resolveGuidedFrontierGorgeTurn(order:GuidedFrontierGorgeTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='FRONTIER_GORGE')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactFrontierGorgeDecision(frontierGorgeCommand(order.option),availableFrontierGorgeActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
