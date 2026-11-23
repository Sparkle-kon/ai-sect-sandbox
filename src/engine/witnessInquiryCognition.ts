import type { Cultivator, LLMDecisionPayload, WorldState } from '../types/world';
import { activeAvatar } from './avatarEngine';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { availableWitnessInquiryActions } from './witnessInquiry';
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


const habitualReader=(actor:Cultivator)=>actor.personality==='刚正'||actor.personality==='逍遥';
const willingReader=(actor:Cultivator)=>actor.personality==='苟道'||actor.personality==='痴情';

export function utilityPublicWitnessInquiry(world:WorldState,actor:Cultivator):LLMDecisionPayload|undefined{
  const story=world.storyteller;
  if(!story||story.style==='still_water'||!world.witnesses.claims.length)return;
  const possessed=activeAvatar(world)?.id;
  const eligible=(person:Cultivator)=>person.alive&&person.hp>=person.maxHp*.7&&
    person.positionPlane===undefined&&person.locationId===actor.locationId&&
    story.focusActorId!==person.id&&possessed!==person.id;
  if(!eligible(actor)||(!habitualReader(actor)&&!willingReader(actor)))return;
  const choices=availableWitnessInquiryActions(actor,world,world.tick);
  const answer=choices.find(row=>row.witnessInquiryMove==='ask');
  if(answer)return exactWitnessInquiryDecision(witnessInquiryCommand(answer),choices);
  const reading=choices.find(row=>row.witnessInquiryMove==='inspect');
  if(!reading)return;
  // Choose one fallback using present bodies, not their private receipt history. A local who reads
  // this turn does not stop being present and therefore cannot hand the same slot to the next NPC.
  if(!habitualReader(actor)&&world.cultivators.some(other=>eligible(other)&&
    (habitualReader(other)||willingReader(other)&&other.id<actor.id)&&
    doctrineFoundingPhysicallyAt(world,other,actor.locationId,world.tick)))return;
  return exactWitnessInquiryDecision(witnessInquiryCommand(reading),choices);
}
