import { availableApprenticeshipReunionActions,type ApprenticeshipReunionOption } from '../engine/apprenticeshipReunion';
import {exactApprenticeshipReunionDecision,apprenticeshipReunionCommand} from '../engine/apprenticeshipReunionCognition';
import type {WorldState} from '../types/world';
export interface GuidedApprenticeshipReunionTurn {
  readonly kind:'apprenticeship-reunion';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:ApprenticeshipReunionOption;
}
export function resolveGuidedApprenticeshipReunionTurn(order:GuidedApprenticeshipReunionTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='APPRENTICESHIP_REUNION')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactApprenticeshipReunionDecision(apprenticeshipReunionCommand(order.option),availableApprenticeshipReunionActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
