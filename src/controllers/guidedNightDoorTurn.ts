import { availableNightDoorActions,type NightDoorOption } from '../engine/nightDoor';
import {exactNightDoorDecision,nightDoorCommand} from '../engine/nightDoorCognition';
import type {WorldState} from '../types/world';
export interface GuidedNightDoorTurn {
  readonly kind:'night-door';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:NightDoorOption;
}
export function resolveGuidedNightDoorTurn(order:GuidedNightDoorTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='NIGHT_DOOR')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactNightDoorDecision(nightDoorCommand(order.option),availableNightDoorActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
