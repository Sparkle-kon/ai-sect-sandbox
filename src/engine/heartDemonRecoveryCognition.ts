import type {LLMDecisionPayload} from '../types/world';

interface RecoveryOption{readonly action:'REST';readonly targetHeartDemonAftermathId:string}
export function heartDemonRecoveryCommand(option:RecoveryOption){
  return {chosenAction:'REST' as const,targetHeartDemonAftermathId:option.targetHeartDemonAftermathId};
}

/** Provider chooses only whether to use the actual opportunity; the author supplies no result or memory. */
export function exactHeartDemonRecoveryDecision(input:unknown,option:RecoveryOption|undefined):LLMDecisionPayload|undefined{
  if(!option||!input||typeof input!=='object'||Array.isArray(input))return undefined;
  const row=input as Partial<LLMDecisionPayload>;
  if(row.chosenAction!=='REST'||!Object.hasOwn(row,'chosenAction')||
    row.targetHeartDemonAftermathId!==option.targetHeartDemonAftermathId||
    !Object.hasOwn(row,'targetHeartDemonAftermathId')||
    Object.keys(row).some(key=>!['chosenAction','targetHeartDemonAftermathId','innerMonologue'].includes(key)))return undefined;
  return {...heartDemonRecoveryCommand(option),innerMonologue:'只以此刻实际蓄下的真气调息，不给旧事另下结论。'};
}
