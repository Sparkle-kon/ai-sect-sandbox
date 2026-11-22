import { availableFarewellLandingActions,type FarewellLandingOption } from '../engine/farewellLanding';
import {exactFarewellLandingDecision,farewellLandingCommand} from '../engine/farewellLandingCognition';
import type {WorldState} from '../types/world';
export interface GuidedFarewellLandingTurn {
  readonly kind:'farewell-landing';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:FarewellLandingOption;
}
export function resolveGuidedFarewellLandingTurn(order:GuidedFarewellLandingTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='FAREWELL_LANDING')return undefined;
  const owners=world.cultivators.filter(row=>row.id===order.actorId);
  if(owners.length!==1)return undefined;
  const decision=exactFarewellLandingDecision(farewellLandingCommand(order.option),availableFarewellLandingActions(owners[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
