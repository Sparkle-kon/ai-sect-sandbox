import { availableBoundaryGapActions,type BoundaryGapOption } from '../engine/boundaryGap';
import {exactBoundaryGapDecision,boundaryGapCommand} from '../engine/boundaryGapCognition';
import type {WorldState} from '../types/world';
export interface GuidedBoundaryGapTurn {
  readonly kind:'boundary-gap';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:BoundaryGapOption;
}
export function resolveGuidedBoundaryGapTurn(order:GuidedBoundaryGapTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='BOUNDARY_GAP')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactBoundaryGapDecision(boundaryGapCommand(order.option),availableBoundaryGapActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
