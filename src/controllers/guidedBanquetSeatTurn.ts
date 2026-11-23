import { availableBanquetSeatActions,type BanquetSeatOption } from '../engine/banquetSeats';
import {exactBanquetSeatDecision,banquetSeatCommand} from '../engine/banquetSeatCognition';
import type {WorldState} from '../types/world';
export interface GuidedBanquetSeatTurn {
  readonly kind:'banquet-seat';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:BanquetSeatOption;
}
export function resolveGuidedBanquetSeatTurn(order:GuidedBanquetSeatTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='BANQUET_SEAT')return undefined;
  const bodies=world.cultivators.filter(row=>row.id===order.actorId);
  if(bodies.length!==1)return undefined;
  const decision=exactBanquetSeatDecision(banquetSeatCommand(order.option),availableBanquetSeatActions(bodies[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
