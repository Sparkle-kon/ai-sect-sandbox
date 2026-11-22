import type { LLMDecisionPayload } from '../types/world';
import type { WitnessInquiryOption } from './witnessInquiry';

export function witnessInquiryCommand(option:WitnessInquiryOption) {
  return {chosenAction:'WITNESS_INQUIRY',witnessInquiryMove:option.witnessInquiryMove,
    targetWitnessClaimId:option.targetWitnessClaimId,
    ...(option.witnessInquiryMove==='ask'?{targetCultivatorId:option.targetCultivatorId}:{})} as const;
}
export function exactWitnessInquiryDecision(raw:unknown,options:readonly WitnessInquiryOption[],
  internal=false):LLMDecisionPayload|undefined {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const data=raw as Record<string,unknown>;
  const match=options.find(option=>{
    const command=witnessInquiryCommand(option);
    return Object.keys(data).every(key=>Object.hasOwn(command,key)||
      internal&&key==='innerMonologue'&&typeof data[key]==='string')&&
      Object.entries(command).every(([key,value])=>Object.hasOwn(data,key)&&data[key]===value);
  });
  return match?{...witnessInquiryCommand(match),innerMonologue:'先辨哪句亲眼所见，哪句只是一纸指证。'}:undefined;
}
