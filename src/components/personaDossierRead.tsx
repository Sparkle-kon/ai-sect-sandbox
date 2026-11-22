import {Brain,Sparkles} from 'lucide-react';
import {activeAvatar} from '../engine/avatarEngine';
import {personaLine,privatePersonaText} from '../engine/wildPersonaEngine';
import type {Cultivator,WorldState} from '../types/world';

export function canReadOwnPersona(world:WorldState,actor:Cultivator,live:boolean) {
  return live&&actor.alive&&actor.hp>0&&world.cultivators.filter(person=>person.id===actor.id).length===1&&activeAvatar(world)===actor;
}

/** Keep old ordinary records, but neither the original whisper nor a reflection derived from it may leave the current owner. */
export function personaDossierMemories(actor:Cultivator,own:boolean) {
  if(own)return actor;
  const privateIds=new Set([...actor.memories,...actor.coreMemories].filter(row=>row.category==='whisper').map(row=>row.id));
  if(!privateIds.size)return actor;
  return {...actor,
    memories:actor.memories.filter(row=>!privateIds.has(row.id)),
    coreMemories:actor.coreMemories.filter(row=>!privateIds.has(row.id)),
    reflections:actor.reflections.filter(row=>!row.sourceMemoryIds.some(id=>privateIds.has(id))),
  };
}

export function PersonaDossierRead({world,actor,live}:{world:WorldState;actor:Cultivator;live:boolean}){
  if(!world.cultivators.includes(actor))return null;
  const own=canReadOwnPersona(world,actor,live);
  const thought=own?privatePersonaText(actor.innerMonologue):undefined;
  const goal=own?privatePersonaText(actor.secretGoal):undefined;
  return <section aria-label={own?'本人心声':'人物演绎'} className="min-w-0 space-y-1.5 rounded-lg border border-indigo-500/30 bg-slate-950/90 p-3 [overflow-wrap:anywhere]">
    <h4 className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
      <Brain aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/>
      {own?'仅本人可见 · 角色心声':'人物演绎 · 并非亲知'}
    </h4>
    <p className="font-serif text-sm leading-relaxed text-slate-200">“{thought??personaLine(actor,'thought')}”</p>
    {goal&&<p className="flex items-baseline gap-1 text-xs text-amber-200">
      <Sparkles aria-hidden="true" className="h-3 w-3 shrink-0"/>深层执念：{goal}
    </p>}
  </section>;
}
