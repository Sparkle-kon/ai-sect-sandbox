import type { Cultivator, LLMDecisionPayload, WorldEvent } from '../../types/world';
import type { StorytellerMove, StorytellerOption } from '../../types/storytellerDirector';

const thought: Record<StorytellerMove, string> = {
  rest: '先在檐下坐一会儿，听雨落完。',
  cultivate: '趁山中安静，收心走一遍旧功。',
  talk: '眼前正有故人，过去说两句近况。',
  travel: '沿认得的山路走走，到了再说。',
};

export function storytellerCommand(option: StorytellerOption): StorytellerOption {
  return {chosenAction:'STORYTELLER_CHOICE',storytellerOfferId:option.storytellerOfferId,storytellerMove:option.storytellerMove};
}

export function exactStorytellerDecision(raw: unknown, options: readonly StorytellerOption[], internal=false): LLMDecisionPayload | undefined {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const fields=raw as Record<string,unknown>;
  const match=options.find(option=>{
    const command=storytellerCommand(option);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(fields,key)&&fields[key]===value)&&
      Object.keys(fields).every(key=>Object.hasOwn(command,key)||
        internal&&key==='innerMonologue'&&typeof fields[key]==='string');
  });
  return match?{...storytellerCommand(match),innerMonologue:thought[match.storytellerMove]}:undefined;
}

export function storytellerActionApplied(actor: Cultivator, native: LLMDecisionPayload, origin: string, event: WorldEvent | null): boolean {
  if(native.chosenAction!==actor.currentAction)return false;
  if(native.chosenAction==='REST'||native.chosenAction==='CULTIVATE')return actor.alive;
  if(native.chosenAction==='EXPLORE')return actor.alive&&actor.locationId!==origin&&actor.locationId===native.targetLocationId;
  return native.chosenAction==='SOCIALIZE'&&!!native.targetCultivatorId&&
    !!event?.actorIds.includes(actor.id)&&event.actorIds.includes(native.targetCultivatorId);
}
