import type {WorldState} from '../types/world';
import type {SectComedyChoiceCommand} from '../types/sectComedy';
import {projectSectComedyContinuations} from '../engine/sectComedyContinuations';
import {SectComicEffects} from './SectComicRead';

export type SectComedyChoiceAction=(expected:WorldState,command:SectComedyChoiceCommand)=>boolean;

export function SectComedyContinuations({world,busy,action}:{world:WorldState;busy:boolean;action?:SectComedyChoiceAction}){
  const stories=projectSectComedyContinuations(world);
  if(!stories.length)return null;
  return <section aria-label="登门旧事" className="grid min-w-0 gap-2">
    {stories.map(story=><article key={story.id} className="xianxia-frame min-w-0 space-y-2 rounded-lg border border-amber-300/25 bg-slate-950/75 p-3 [overflow-wrap:anywhere]">
      <h2 className="font-serif text-base text-amber-100">{story.title}</h2>
      <p className="text-sm leading-6 text-stone-200">{story.line}</p>
      {story.resolved?<p role="status" className="text-sm text-emerald-100">{story.resolved}</p>:story.choices.length>0&&
        <div className="flex flex-wrap gap-2">{story.choices.map(choice=><button type="button" key={choice.id}
          disabled={busy||!action||!choice.available} className="xianxia-control min-h-11 rounded border border-amber-300/40 px-2.5 text-sm text-amber-100 disabled:opacity-50"
          onClick={()=>action?.(world,{id:story.id,choiceId:choice.id})}>{choice.label}</button>)}</div>}
      {story.effects&&<SectComicEffects effects={story.effects} world={world}/>}
    </article>)}
  </section>;
}
