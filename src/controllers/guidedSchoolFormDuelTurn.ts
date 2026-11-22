import { schoolFormDuelView } from '../engine/schoolFormDuel';
import { exactSchoolFormDecision, schoolFormCommand } from '../engine/schoolFormDuelCognition';
import type { SchoolFormDuelChoice } from '../types/schoolFormDuel';
import type { WorldState } from '../types/world';

export interface GuidedSchoolFormDuelTurn {
  readonly kind:'school-form-duel';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly contactId:string;
  readonly choice:SchoolFormDuelChoice;
}
export function resolveGuidedSchoolFormDuelTurn(order:GuidedSchoolFormDuelTurn,world:WorldState,branchId:string,revision:number) {
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision)return undefined;
  const actors=world.cultivators.filter(row=>row.id===order.actorId);
  const view=actors.length===1&&schoolFormDuelView(world,actors[0]);
  if(!view||view.contactId!==order.contactId)return undefined;
  const decision=exactSchoolFormDecision(schoolFormCommand(order.contactId,order.choice),view.contactId,view.options);
  return decision?{actorId:order.actorId,decision}:undefined;
}
