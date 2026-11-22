import { availableBattlefieldRevisits, type BattlefieldRevisitOption } from '../engine/battlefieldRevisit';
import { battlefieldRevisitCommand, exactBattlefieldRevisitDecision } from '../engine/battlefieldRevisitCognition';
import type { WorldState } from '../types/world';

export interface GuidedBattlefieldRevisitTurn {
  readonly kind:'battlefield-revisit';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:BattlefieldRevisitOption;
}

export function resolveGuidedBattlefieldRevisitTurn(order:GuidedBattlefieldRevisitTurn,world:WorldState,branchId:string,revision:number) {
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision)return;
  const actors=world.cultivators.filter(row=>row.id===order.actorId);
  if(actors.length!==1)return;
  const decision=exactBattlefieldRevisitDecision(battlefieldRevisitCommand(order.option),
    availableBattlefieldRevisits(world,actors[0],world.tick+1));
  return decision?{actorId:order.actorId,decision}:undefined;
}
