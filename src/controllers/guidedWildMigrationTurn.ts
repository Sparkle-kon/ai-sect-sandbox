import { availableWildMigrationActions,type WildMigrationOption } from '../engine/wildMigration';
import {exactWildMigrationDecision,wildMigrationCommand} from '../engine/wildMigrationCognition';
import type {WorldState} from '../types/world';
export interface GuidedWildMigrationTurn {
  readonly kind:'wild-migration';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:WildMigrationOption;
}
export function resolveGuidedWildMigrationTurn(order:GuidedWildMigrationTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='WILD_MIGRATION')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactWildMigrationDecision(wildMigrationCommand(order.option),availableWildMigrationActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
