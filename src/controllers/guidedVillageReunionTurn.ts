import { availableVillageReunionActions,type VillageReunionOption } from '../engine/villageReunion';
import {exactVillageReunionDecision,villageReunionCommand} from '../engine/villageReunionCognition';
import type {WorldState} from '../types/world';
export interface GuidedVillageReunionTurn {
  readonly kind:'village-reunion';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:VillageReunionOption;
}
export function resolveGuidedVillageReunionTurn(order:GuidedVillageReunionTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='VILLAGE_REUNION')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactVillageReunionDecision(villageReunionCommand(order.option),availableVillageReunionActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
