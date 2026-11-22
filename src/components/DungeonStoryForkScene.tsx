import { useId } from 'react';
import type { DungeonOption } from '../engine/expeditionDungeonEngine';
import type { DungeonCounterfactualRoute, DungeonCounterfactualStep, DungeonCounterfactualView } from '../engine/dungeonCounterfactual';

export interface DungeonStoryForkView {
  label:string;
  sourceTick:number;
  options:readonly DungeonOption[];
  actual?:DungeonCounterfactualStep;
}

interface Props {
  scene:DungeonStoryForkView;
  comparison?:DungeonCounterfactualView;
  busy?:boolean;
  notice?:string;
  onChoose?:(option:DungeonOption)=>void;
  onCompare?:()=>void;
}

const action='min-h-11 w-full min-w-0 rounded-md border border-teal-200/35 bg-slate-950/55 px-2.5 text-left text-sm font-semibold text-teal-50 hover:bg-teal-950/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-200 disabled:opacity-50';
const choices = {
  gather:'先采下一枚玉叶',
  retreat:'循来路退出',
} as const;
function choiceLabel(option:DungeonOption) {
  const move=option.dungeonMove;
  return move==='gather'||move==='retreat'?choices[move]:undefined;
}

function seal(step:DungeonCounterfactualStep) {
  if(step.exit==='escaped')return '赶在封门前真正脱出。';
  if(step.exit==='retreated')return '已经循来路退出秘境。';
  if(step.artifactAwarded)return '已经拿到传承，但此时人还在秘境里。';
  return undefined;
}

function Step({step}:{step:DungeonCounterfactualStep}) {
  const confirmation=seal(step);
  return <div className="space-y-0.5">
    <p className="font-semibold text-teal-50">{step.title}</p>
    <p className="text-slate-200">{step.text}</p>
    {confirmation&&confirmation!==step.text&&<p className="text-xs leading-relaxed text-teal-100">{confirmation}</p>}
  </div>;
}

function Route({route}:{route:DungeonCounterfactualRoute}) {
  const heading=choiceLabel(route.firstOption);
  if(!heading)return null;
  const hasExit=route.steps.some(step=>step.exit==='escaped'||step.exit==='retreated');
  return <section className="min-w-0 space-y-1 rounded-md border border-slate-700/80 px-2 py-1.5">
    <h4 className="text-sm font-semibold text-amber-100">{heading}</h4>
    {route.steps.length>0&&<ol className="space-y-2 border-l border-slate-700/80 pl-2 text-sm leading-relaxed">
      {route.steps.map(step=><li key={step.eventId}><Step step={step}/></li>)}
    </ol>}
    {!hasExit&&<p className="text-xs leading-relaxed text-slate-300">{route.status==='bounded'?
      '这次试走到此为止，未见脱身实录。':'这一路不能再向前，未见脱身实录。'}</p>}
  </section>;
}

/** Read-only counterfactuals stay separate from the single exact live choice. */
export function DungeonStoryForkScene({scene,comparison,busy=false,notice,onChoose,onCompare}:Props) {
  const title=useId(),comparisonTitle=useId();
  const legal=scene.actual?[]:scene.options.filter(option=>choiceLabel(option)&&
    scene.options.filter(row=>row.dungeonMove===option.dungeonMove).length===1);
  const preview=comparison?.sourceTick===scene.sourceTick?comparison:undefined;
  return <section aria-labelledby={title} className="min-w-0 space-y-2.5 rounded-xl border border-teal-400/30 bg-gradient-to-br from-teal-950/45 to-slate-950 p-3 font-serif text-slate-100 [overflow-wrap:anywhere]">
    <header className="space-y-1">
      <p className="text-xs tracking-wide text-teal-200">{scene.label}</p>
      <h3 id={title} className="text-lg font-semibold leading-tight text-teal-50">药园两条路</h3>
    </header>
    {scene.actual?<section aria-label="此行实录" className="space-y-1 rounded-md border border-teal-200/25 px-2 py-1.5 text-sm leading-relaxed">
      <p className="text-xs text-teal-200">此行实录</p>
      <Step step={scene.actual}/>
    </section>:<p className="text-sm leading-relaxed text-slate-100">人已到药园。先采一枚玉叶，再决定是否深入，还是现在沿来路退出？</p>}
    {onChoose&&legal.length>0&&<div role="group" aria-label="此行真正选择" className="grid gap-1.5 sm:grid-cols-2">
      {legal.map(option=><button key={option.dungeonMove} type="button" disabled={busy} className={action}
        onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}>{choiceLabel(option)}</button>)}
    </div>}
    {onCompare&&!preview&&<button type="button" disabled={busy} className={`${action} border-amber-200/30 text-amber-100`}
      onClick={event=>{if(!busy&&event.detail<=1)onCompare();}}>先看两条试走</button>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一幕正在落定。</p>}
    {notice&&<p role="status" className="text-xs text-amber-200">{notice}</p>}
    {preview&&<section aria-labelledby={comparisonTitle} className="space-y-1.5">
      <h4 id={comparisonTitle} className="text-sm font-semibold text-amber-100">试走比较 · 不改原线</h4>
      <p className="text-xs leading-relaxed text-slate-300">以下两路都从同一个原处试走；试走不会替你选，也不会写进此行。</p>
      <div className="grid gap-1.5 sm:grid-cols-2">{preview.routes.map(route=><Route key={route.firstOption.dungeonMove} route={route}/>)}</div>
    </section>}
  </section>;
}
