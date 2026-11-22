import type { CampaignAssemblyOption } from './campaignAssembly';
import type { LLMDecisionPayload } from '../types/world';

export function exactCampaignAssemblyDecision(raw:unknown,options:readonly CampaignAssemblyOption[],
  internal=false):LLMDecisionPayload|undefined{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const data=raw as Record<string,unknown>;
  const chosen=options.find(({command})=>
    Object.keys(data).every(key=>Object.hasOwn(command,key)||
      internal&&key==='innerMonologue'&&typeof data[key]==='string')&&
    Object.entries(command).every(([key,value])=>Object.hasOwn(data,key)&&data[key]===value));
  return chosen?{...chosen.command,innerMonologue:'旗至哪一面，便按这一身所在作答。'}:undefined;
}

/** The internal case tag is not a model field. It forces execution-time revalidation. */
export function tagCampaignAssemblyDecision(decision:LLMDecisionPayload,options:readonly CampaignAssemblyOption[]) {
  const option=options.find(row=>row.kind!=='guard'&&exactCampaignAssemblyDecision(decision,[row],true));
  return option?{...decision,targetCampaignAssemblySiegeId:option.siegeId}:undefined;
}
