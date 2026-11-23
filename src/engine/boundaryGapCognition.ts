import type {BoundaryGapOption} from '../types/boundaryGap';
import type {LLMDecisionPayload} from '../types/world';

const voice:Record<BoundaryGapOption['boundaryGapMove'],string>={
  cover:'我留在关口护眼前的人，不代替哪一面旗。',
  refuse:'我不替空岗接下这个约，也不挡还在路上的人。',
  stay:'我暂不走。这是留在这儿，不是接任。',
};

export const boundaryGapCommand=(option:BoundaryGapOption)=>({
  chosenAction:'BOUNDARY_GAP',boundaryGapMove:option.boundaryGapMove,targetBoundaryGapId:option.targetBoundaryGapId,
  ...(option.targetCultivatorId===undefined?{}:{targetCultivatorId:option.targetCultivatorId}),
} as const);

export function exactBoundaryGapDecision(raw:unknown,menu:readonly BoundaryGapOption[],internal=false):LLMDecisionPayload|undefined {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
  const fields=raw as Record<string,unknown>;
  const match=menu.find(row=>{
    const command=boundaryGapCommand(row);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(fields,key)&&fields[key]===value)&&
      Object.keys(fields).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof fields[key]==='string');
  });
  return match?{...boundaryGapCommand(match),innerMonologue:voice[match.boundaryGapMove]}:undefined;
}
