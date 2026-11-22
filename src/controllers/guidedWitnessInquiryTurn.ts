import {availableWitnessInquiryActions,type WitnessInquiryOption} from '../engine/witnessInquiry';
import {exactWitnessInquiryDecision,witnessInquiryCommand} from '../engine/witnessInquiryCognition';
import type {WorldState} from '../types/world';

export interface GuidedWitnessInquiryTurn {
  readonly kind:'witness-inquiry';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:WitnessInquiryOption;
}
export function resolveGuidedWitnessInquiryTurn(order:GuidedWitnessInquiryTurn,world:WorldState,branchId:string,revision:number) {
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.action!=='WITNESS_INQUIRY')return undefined;
  const actors=world.cultivators.filter(row=>row.id===order.actorId);
  if(actors.length!==1)return undefined;
  const decision=exactWitnessInquiryDecision(witnessInquiryCommand(order.option),availableWitnessInquiryActions(actors[0],world));
  return decision?{actorId:order.actorId,decision}:undefined;
}
