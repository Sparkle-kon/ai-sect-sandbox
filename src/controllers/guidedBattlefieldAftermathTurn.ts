import { availableBattlefieldAftermathActions,type BattlefieldAftermathOption } from '../engine/battlefieldAftermath';
import {exactBattlefieldAftermathDecision,battlefieldAftermathCommand} from '../engine/battlefieldAftermathCognition';
import type {WorldState} from '../types/world';
export interface GuidedBattlefieldAftermathTurn {
  readonly kind:'battlefield-aftermath';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:BattlefieldAftermathOption;
}
export function resolveGuidedBattlefieldAftermathTurn(order:GuidedBattlefieldAftermathTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='BATTLEFIELD_AFTERMATH')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactBattlefieldAftermathDecision(battlefieldAftermathCommand(order.option),availableBattlefieldAftermathActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
