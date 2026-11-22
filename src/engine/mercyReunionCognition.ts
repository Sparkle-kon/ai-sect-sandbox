import type { Cultivator, LLMDecisionPayload, WorldState } from '../types/world';
import type { MercyReunionOption } from '../types/mercyReunion';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';

export type ConditionalMercyOption={action:'DUEL';duelMercy:'spare';targetCultivatorId:string};
export type StoryMercyOption=MercyReunionOption|ConditionalMercyOption;

export function lawfulConditionalMercy(world:WorldState,actor:Cultivator,target:Cultivator,tick=world.tick){
  const canonical=(body:Cultivator)=>world.cultivators.includes(body)&&world.cultivators.filter(row=>row.id===body.id).length===1;
  return actor.id!==target.id&&actor.positionPlane===undefined&&target.positionPlane===undefined&&
    actor.locationId===target.locationId&&actor.hp>=actor.maxHp*.25&&target.hp<target.maxHp*.25&&
    canonical(actor)&&canonical(target)&&doctrineFoundingPhysicallyAt(world,actor,actor.locationId,tick)&&
    doctrineFoundingPhysicallyAt(world,target,actor.locationId,tick);
}

/** There is no forecast: the command binds only an own conditional intention if real lethality follows. */
export function conditionalMercyChoices(world:WorldState,actor:Cultivator,tick=world.tick+1):ConditionalMercyOption[]{
  if(!actor.alive||actor.positionPlane!==undefined||tick<world.tick||tick>world.tick+1)return [];
  return world.cultivators.filter(other=>other.locationId===actor.locationId&&lawfulConditionalMercy(world,actor,other,tick)&&
    world.relationships.some(link=>((link.fromId===actor.id&&link.toId===other.id)||(link.fromId===other.id&&link.toId===actor.id))&&
      link.affinity<0)).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id.localeCompare(b.id)).slice(0,1)
    .map(target=>({action:'DUEL',duelMercy:'spare',targetCultivatorId:target.id}));
}
export function storyMercyCommand(option:StoryMercyOption){
  if(option.action==='DUEL')return {chosenAction:option.action,duelMercy:option.duelMercy,targetCultivatorId:option.targetCultivatorId} as const;
  return {chosenAction:option.action,mercyReunionMove:option.mercyReunionMove,targetMercyReunionId:option.targetMercyReunionId,
    ...('targetLocationId' in option&&option.targetLocationId?{targetLocationId:option.targetLocationId}:{})} as const;
}
export function exactStoryMercyDecision(raw:unknown,options:readonly StoryMercyOption[],internal=false):LLMDecisionPayload|undefined {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const fields=raw as Record<string,unknown>;
  const match=options.find(option=>{
    const command=storyMercyCommand(option);
    return Object.entries(command).every(([key,value])=>Object.hasOwn(fields,key)&&fields[key]===value)&&
      Object.keys(fields).every(key=>Object.hasOwn(command,key)||internal&&key==='innerMonologue'&&typeof fields[key]==='string');
  });
  return match?{...storyMercyCommand(match),innerMonologue:'只应眼前这一步，谁愿收锋、谁肯同行，都由本人。'}:undefined;
}
