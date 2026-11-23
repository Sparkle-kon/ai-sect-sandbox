import type {ReactNode} from 'react';
import {CultivatorPortrait} from './CultivatorPortrait';
import type {SceneStageFrame} from './sceneStageModel';

export function StoryStageDialogue({portrait,children}:{portrait?:SceneStageFrame['portrait'];children:ReactNode}){
  if(!portrait)return <>{children}</>;
  return <div className="grid min-w-0 grid-cols-[minmax(4.75rem,31%)_minmax(0,1fr)] items-start gap-2.5 sm:grid-cols-[minmax(6rem,30%)_minmax(0,1fr)] sm:gap-3">
    <figure data-stage-portrait className="m-0 min-w-0 max-w-40 overflow-hidden rounded-lg border border-amber-200/40 bg-slate-950/80 p-1 shadow-sm">
      <CultivatorPortrait portrait={portrait.appearance} presentation="stage" className="h-auto w-full"/>
      <figcaption className="mt-1 space-y-0.5 break-words px-0.5 text-center leading-tight">
        <p className="text-xs font-semibold text-amber-50">{portrait.name}</p>
        <p className="text-xs text-amber-200">{portrait.realm}</p>
      </figcaption>
    </figure>
    <div className="min-w-0 space-y-2">{children}</div>
  </div>;
}
