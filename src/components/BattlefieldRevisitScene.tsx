import {useId} from 'react';
import type {BattlefieldRevisitOption} from '../engine/battlefieldRevisit';

export interface BattlefieldRevisitReceipt {
  readonly title:string;
  readonly description:string;
}
interface BattlefieldRevisitSceneProps {
  label:string;
  options:readonly BattlefieldRevisitOption[];
  receipt?:BattlefieldRevisitReceipt;
  busy?:boolean;
  notice?:string;
  seekName?:(option:BattlefieldRevisitOption)=>string|undefined;
  onChoose?:(option:BattlefieldRevisitOption)=>void;
}

const button='min-h-11 min-w-0 rounded-md border border-amber-200/30 bg-slate-950/60 px-2 py-1.5 text-left text-sm text-amber-50 hover:bg-amber-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50';

/** A witnessed return to the battlefield, not standing proof of more casualties or victory. */
export function BattlefieldRevisitScene({label,options,receipt,busy=false,notice,seekName,onChoose}:BattlefieldRevisitSceneProps){
  const title=useId();
  if(!options.length&&!receipt)return null;
  return <section aria-labelledby={title} className="min-w-0 space-y-2 rounded-lg border border-amber-300/25 bg-gradient-to-br from-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <header className="space-y-0.5">
      <p className="text-xs tracking-wide text-amber-200">{label}</p>
      <h3 id={title} className="font-serif text-lg font-semibold text-amber-50">重到旧阵前</h3>
    </header>
    {receipt?<div className="space-y-0.5 text-sm leading-relaxed">
      <p className="font-semibold text-amber-100">{receipt.title}</p>
      <p className="font-serif text-slate-200">{receipt.description}</p>
    </div>:<p className="font-serif text-sm leading-relaxed text-slate-200">眼前还是旧日交手之处。阵眼那道伤，是你亲眼见它留下的。</p>}
    {!receipt&&onChoose&&options.length>0&&<div role="group" aria-label="重访旧阵的选择" className="grid gap-1.5 sm:grid-cols-2">
      {options.map(option=>{
        const repair=option.battlefieldRevisitMove==='repair';
        const name=repair?undefined:seekName?.(option);
        return <button type="button" key={JSON.stringify(option)} className={button} disabled={busy}
          onClick={event=>{if(!busy&&event.detail<=1)onChoose(option);}}>
          <span className="font-semibold">{repair?'试着修复护山阵':name?`寻${name}`:'寻回旧日同伴'}</span>
          <span className="block text-xs leading-relaxed text-slate-300">{repair?'真正修阵才实耗 8 真气。':'只寻那位曾在此交手的旧识，不凭传闻定生死。'}</span>
        </button>;
      })}
    </div>}
    {busy&&<p role="status" className="text-xs text-slate-400">此行还在落定。</p>}
    {notice&&<p role="status" className="text-xs text-amber-200">{notice}</p>}
  </section>;
}
