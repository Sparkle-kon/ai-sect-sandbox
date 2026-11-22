import { availableFrontierNightHuntActions } from '../engine/frontierNightHunt';
import { exactFrontierNightHuntDecision, frontierNightHuntCommand } from '../engine/frontierNightHuntCognition';
import type { FrontierNightHuntOption } from '../types/frontierNightHunt';
import type { WorldState } from '../types/world';

export interface GuidedFrontierNightHuntTurn {
  readonly kind:'frontier-night-hunt';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:FrontierNightHuntOption;
}
export function resolveGuidedFrontierNightHuntTurn(order:GuidedFrontierNightHuntTurn,world:WorldState,branchId:string,revision:number) {
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||
    order.option.action!=='FRONTIER_NIGHT_HUNT')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactFrontierNightHuntDecision(frontierNightHuntCommand(order.option),
    availableFrontierNightHuntActions(bodies[0],world,world.tick+1));
  return decision?{actorId:order.actorId,decision}:undefined;
}
