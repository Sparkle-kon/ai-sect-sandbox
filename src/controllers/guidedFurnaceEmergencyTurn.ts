import { availableFurnaceEmergencyActions,type FurnaceEmergencyOption } from '../engine/furnaceEmergency';
import {exactFurnaceEmergencyDecision,furnaceEmergencyCommand} from '../engine/furnaceEmergencyCognition';
import type {WorldState} from '../types/world';
export interface GuidedFurnaceEmergencyTurn {
  readonly kind:'furnace-emergency';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:FurnaceEmergencyOption;
}
export function resolveGuidedFurnaceEmergencyTurn(order:GuidedFurnaceEmergencyTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='FURNACE_EMERGENCY')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactFurnaceEmergencyDecision(furnaceEmergencyCommand(order.option),availableFurnaceEmergencyActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
