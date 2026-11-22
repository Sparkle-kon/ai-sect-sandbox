import { availableMercyReunionActions } from '../engine/mercyReunion';
import {conditionalMercyChoices,exactStoryMercyDecision,storyMercyCommand,type StoryMercyOption} from '../engine/mercyReunionCognition';
import type {WorldState} from '../types/world';
export interface GuidedMercyReunionTurn{
  readonly kind:'mercy-reunion';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:StoryMercyOption;
}
export function resolveGuidedMercyReunionTurn(order:GuidedMercyReunionTurn,world:WorldState,branchId:string,revision:number){
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision)return undefined;
  const people=world.cultivators.filter(row=>row.id===order.actorId);
  if(people.length!==1)return undefined;
  const available=order.option.action==='DUEL'?conditionalMercyChoices(world,people[0]):availableMercyReunionActions(people[0],world);
  const lookup=exactStoryMercyDecision(storyMercyCommand(order.option),available);
  return lookup?{actorId:order.actorId,decision:lookup}:undefined;
}
