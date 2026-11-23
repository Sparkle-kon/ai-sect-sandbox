import { availablePilgrimageForkActions,type PilgrimageForkOption } from '../engine/pilgrimageFork';
import {exactPilgrimageForkDecision,pilgrimageForkCommand} from '../engine/pilgrimageForkCognition';
import type {WorldState} from '../types/world';
export interface GuidedPilgrimageForkTurn {
  readonly kind:'pilgrimage-fork';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:PilgrimageForkOption;
}
export function resolveGuidedPilgrimageForkTurn(order:GuidedPilgrimageForkTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='PILGRIMAGE_FORK')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactPilgrimageForkDecision(pilgrimageForkCommand(order.option),availablePilgrimageForkActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
