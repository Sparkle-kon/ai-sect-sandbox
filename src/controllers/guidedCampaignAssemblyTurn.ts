import { availableCampaignAssemblyActions, type CampaignAssemblyOption } from '../engine/campaignAssembly';
import { exactCampaignAssemblyDecision, tagCampaignAssemblyDecision } from '../engine/campaignAssemblyCognition';
import type { WorldState } from '../types/world';

export interface GuidedCampaignAssemblyTurn {
  readonly kind:'campaign-assembly';
  readonly world:WorldState;
  readonly branchId:string;
  readonly revision:number;
  readonly actorId:string;
  readonly option:CampaignAssemblyOption;
}
export function resolveGuidedCampaignAssemblyTurn(order:GuidedCampaignAssemblyTurn,world:WorldState,branchId:string,revision:number) {
  if(order.world!==world||order.branchId!==branchId||order.revision!==revision||order.option.kind==='guard')return undefined;
  const actors=world.cultivators.filter(row=>row.id===order.actorId);
  if(actors.length!==1)return undefined;
  const available=availableCampaignAssemblyActions(actors[0],world).filter(option=>
    option.kind===order.option.kind&&option.siegeId===order.option.siegeId);
  const decision=exactCampaignAssemblyDecision(order.option.command,available);
  const tagged=decision&&tagCampaignAssemblyDecision(decision,available);
  return tagged?{actorId:order.actorId,decision:tagged}:undefined;
}
