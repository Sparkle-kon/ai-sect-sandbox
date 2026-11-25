import type {WorldState} from '../types/world';
import {projectCourtCat,type CourtCatCommand} from '../engine/sectCourtCat';

export type CourtCatAction=(expected:WorldState,command:CourtCatCommand)=>boolean;
export function SectCourtCat({world,busy,action}:{world:WorldState;busy:boolean;action?:CourtCatAction}){
  const cat=projectCourtCat(world);
  if(!cat)return null;
  return <details data-sect-court-cat="" className="my-2 rounded-lg border border-amber-300/35 bg-stone-950/90 px-2">
    <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-amber-100 focus-visible:outline focus-visible:outline-amber-300">
      <svg aria-hidden="true" viewBox="0 0 36 28" className="h-7 w-9 shrink-0 text-amber-200" fill="currentColor">
        <path d="M6 16c0-4 2-6 4-7L9 3l6 4 6-4-1 6c3 1 5 4 5 8s-3 7-8 7H9c-5 0-7-3-6-7l2 1c-1 2 0 3 2 4z"/>
        <path d="M24 19q8-2 5-7q-2-2-5 0l-1-2q6-4 9 1c3 6-3 11-8 11z"/>
        <circle cx="14" cy="13" r="1" fill="#22190f"/><circle cx="20" cy="13" r="1" fill="#22190f"/>
      </svg>{cat.name} · {cat.adopted?'山门灵宠':'钻进了廊下'}
    </summary>
    {cat.adopted?<p className="pb-2 text-xs text-stone-200">它如今大大方方趴在廊柱旁，从此有人给它留碗。</p>:
      <div className="space-y-2 pb-2 text-xs">
        <p className="text-stone-200">它盯着掌门的袖口。亲近 {cat.visits}/3</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" className="min-h-11 rounded border border-amber-300/30 px-2 text-amber-100 disabled:opacity-50"
            disabled={busy||!action||!cat.canFeed} onClick={()=>action?.(world,{kind:'feed_cat'})}>喂它 · {cat.treat} 灵石</button>
          <button type="button" className="min-h-11 rounded border border-amber-300/30 px-2 text-amber-100 disabled:opacity-50"
            disabled={busy||!action||!cat.canShoo} onClick={()=>action?.(world,{kind:'shoo_cat'})}>吓跑它</button>
        </div>
      </div>}
  </details>;
}
