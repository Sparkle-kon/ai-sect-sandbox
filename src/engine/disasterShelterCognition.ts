import type {Cultivator,LLMDecisionPayload,WorldState} from '../types/world';
import type {DisasterShelterOption} from '../types/disasterShelter';
import {availableDisasterShelterActions} from './disasterShelterEngine';
import {disasterShelterCheckpoint,disasterShelterLocksTravel,disasterShelterOpen} from './disasterShelterCheckpoint';

const controlled=(actor:Cultivator,world:WorldState,tick:number)=>
  world.playerAvatar.possessedId===actor.id&&(world.playerAvatar.possessionUntilTick??0)>tick;
const text={
  offer:'我愿给原村受灾的另一户代表留一处乡舍；等他本人答应，不先记到。',
  accept:'我本人应下借泊，只沿早已走通的路撤离，不把留在家里的人算上。',
  decline:'这项借泊我本人谢绝，不替家人答应。',
  withdraw:'我收回尚未动身的借泊，不假写有人已经走了。',
  return:'等故村和沿途确实能走，我按原路返家；未走到不记回乡。',
} as const;
export function disasterShelterTargets(row:DisasterShelterOption){
  return row.disasterShelterMove==='offer'?{disasterShelterMove:row.disasterShelterMove,targetCultivatorId:row.targetCultivatorId}:
    {disasterShelterMove:row.disasterShelterMove,targetDisasterShelterId:row.targetDisasterShelterId};
}
export function disasterShelterProviderOptions(actor:Cultivator,world:WorldState,tick:number):DisasterShelterOption[]{
  return controlled(actor,world,tick)||disasterShelterCheckpoint(world,actor)?[]:availableDisasterShelterActions(actor,world,tick);
}
export function decodeDisasterShelterDecision(parsed:Partial<LLMDecisionPayload>,actor:Cultivator,
  options:readonly DisasterShelterOption[]):LLMDecisionPayload|undefined{
  if(parsed.chosenAction!=='DISASTER_SHELTER')return undefined;
  const choice=options.find(row=>row.disasterShelterMove===parsed.disasterShelterMove&&
    row.targetCultivatorId===parsed.targetCultivatorId&&row.targetDisasterShelterId===parsed.targetDisasterShelterId);
  if(!choice)return undefined;
  const field=choice.disasterShelterMove==='offer'?'targetCultivatorId':'targetDisasterShelterId';
  if(Object.keys(parsed).some(key=>!['chosenAction','innerMonologue','disasterShelterMove',field].includes(key)))return undefined;
  const speech=(typeof parsed.innerMonologue==='string'?parsed.innerMonologue.trim().slice(0,160):'')||actor.innerMonologue||text[choice.disasterShelterMove];
  return {chosenAction:choice.action,...disasterShelterTargets(choice),innerMonologue:speech};
}
export function utilityDisasterShelterDecision(actor:Cultivator,world:WorldState,allowOffer=true):LLMDecisionPayload|undefined{
  if(actor.guardAssignment)return undefined;
  if(disasterShelterCheckpoint(world,actor))return {chosenAction:'REST',innerMonologue:'只等实路开通，不在留籍旧址行动。'};
  if(controlled(actor,world,world.tick))return undefined;
  const ownOpen=world.disasterShelter?.cases.some(row=>disasterShelterOpen(row)&&
    (row.host.actorId===actor.id||row.guest.actorId===actor.id));
  const newHazard=allowOffer&&world.mapHazards.some(row=>row.intensity>=2&&row.createdTick<=world.tick&&world.tick<row.expiresTick);
  if(!ownOpen&&!newHazard)return undefined;
  const options=availableDisasterShelterActions(actor,world);
  const prefersShelter=actor.personality!=='嗜血';
  for(const move of ['return',prefersShelter?'accept':'decline','offer'] as const){
    if(move==='offer'&&(!allowOffer||!prefersShelter))continue;
    const choices=options.filter(row=>row.disasterShelterMove===move);
    if(choices.length===1)return {chosenAction:choices[0].action,...disasterShelterTargets(choices[0]),innerMonologue:text[move]};
  }
  return disasterShelterLocksTravel(world,actor)?{chosenAction:'REST',innerMonologue:'在亲到处等候，不擅报动身、借住或回乡。'}:undefined;
}
