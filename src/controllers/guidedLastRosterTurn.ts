import { availableLastRosterActions,type LastRosterOption } from '../engine/lastRoster';
import {exactLastRosterDecision,lastRosterCommand} from '../engine/lastRosterCognition';
import type {WorldState} from '../types/world';
export interface GuidedLastRosterTurn {
  readonly kind:'last-roster';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:LastRosterOption;
}
export function resolveGuidedLastRosterTurn(order:GuidedLastRosterTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='LAST_ROSTER')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactLastRosterDecision(lastRosterCommand(order.option),availableLastRosterActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
