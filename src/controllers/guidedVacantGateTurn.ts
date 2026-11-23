import { availableVacantGateActions,type VacantGateOption } from '../engine/vacantGate';
import {exactVacantGateDecision,vacantGateCommand} from '../engine/vacantGateCognition';
import type {WorldState} from '../types/world';
export interface GuidedVacantGateTurn {
  readonly kind:'vacant-gate';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:VacantGateOption;
}
export function resolveGuidedVacantGateTurn(order:GuidedVacantGateTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='VACANT_GATE')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactVacantGateDecision(vacantGateCommand(order.option),availableVacantGateActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
