import {useEffect,useId,useRef,useState} from 'react';
import type {AscensionOption,AscensionView} from '../engine/ascensionEngine';

import {ASCENSION_OPEN_QI,ASCENSION_QI,ASCENSION_WAVES} from '../engine/ascensionTerms';
import type {AscensionMove,AscensionTrial} from '../types/ascension';

export interface AscensionControls {
  busy?:boolean;
  guide?:(option:AscensionOption)=>Promise<boolean>;
}

const action='min-h-11 min-w-0 rounded-md border border-indigo-300/40 px-3 py-1.5 text-left text-sm text-indigo-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-200 disabled:opacity-50';

function AscensionInk({opened}:{opened:boolean}){
  return <svg viewBox="0 0 64 52" aria-hidden="true" focusable="false" className="h-12 w-16 shrink-0 text-indigo-200">
    <path d="M10 42h44M14 39V18l18-9 18 9v21m-33-21h30M22 39V24h20v15M31 12v5"
      fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round"/>
    {opened?<path d="M32 21v21M27 24l-3 15m13-15 3 15M20 13l-4-4m29 4 4-4M30 5l2-3 2 3" fill="none" stroke="#fde68a" strokeWidth="1.05" strokeLinecap="round"/>:
      <path d="M24 25h16v14H24Zm8 0v14m-3-7h6" fill="none" stroke="currentColor" strokeWidth=".85" opacity=".7"/>}
  </svg>;
}

const choiceLabel:Record<AscensionMove,string>={
  start:`引下飞升天劫（耗 ${ASCENSION_OPEN_QI} 真气）`,
  guard:`凝神守御（耗 ${ASCENSION_QI.guard} 真气）`,
  advance:`迎雷而上（耗 ${ASCENSION_QI.advance} 真气）`,
  retreat:'退离此劫',
};
const ascensionChoice=(option:AscensionOption)=>choiceLabel[option.ascensionMove];

function AscensionProof({trial}:{trial:AscensionTrial}){
  const terminal=trial.terminal;
  return <div className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
    {trial.phase==='warning'&&<p className="text-sm leading-relaxed text-indigo-100">天劫已起，尚未落下第一道雷。此时还未打开仙门。</p>}
    {trial.phase==='lightning'&&<p className="text-sm leading-relaxed text-indigo-100">已历 {trial.waves.length} / {ASCENSION_WAVES} 道雷，仙门尚未开启。</p>}
    {terminal?.status==='succeeded'&&trial.phase==='succeeded'&&<p className="font-serif text-base leading-relaxed text-amber-100">此人渡尽雷关，随仙门接引而去，不再身行下界。</p>}
    {terminal?.status==='retreated'&&<p className="text-sm leading-relaxed text-slate-200">此人已退离飞升之劫，本次未开仙门。</p>}
    {terminal?.status==='failed'&&<p className="text-sm leading-relaxed text-rose-200">{terminal.reason==='interrupted'?'此劫中断，未见飞升。':'此人未能渡过天雷，本次未开仙门。'}</p>}
    <p className="text-xs text-slate-300">起劫实耗 {trial.openingQiPaid} 真气{terminal?` · 结于仙历 ${terminal.year} 年 ${terminal.month} 月`:''}。</p>
    {!!trial.waves.length&&<ol aria-label="已落天雷实录" className="space-y-1.5 text-xs text-slate-200">
      {trial.waves.map(wave=><li key={wave.wave} className="rounded-md border border-slate-800 bg-slate-950/65 p-2.5">
        <p className="mb-0.5 font-semibold text-indigo-100">第 {wave.wave} 道雷 · {wave.stance==='guard'?'守御':'迎雷'}</p>
        <p>气血 {wave.beforeHp} → {wave.afterHp}，实损 {wave.beforeHp-wave.afterHp} · 实耗 {wave.qiPaid} 真气</p>
      </li>)}
    </ol>}
  </div>;
}

export function AscensionPanel({view,controls,onListen}:{view:AscensionView;controls?:AscensionControls;onListen?:()=>Promise<boolean>}){
  const heading=useId();
  const [working,setWorking]=useState(false);
  const [listening,setListening]=useState(false);
  const [problem,setProblem]=useState<string>();
  const inFlight=useRef(false);
  const audioInFlight=useRef(false);
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const busy=working||!!controls?.busy;
  const trial=view.trial;
  const succeeded=trial?.phase==='succeeded'&&trial.terminal?.status==='succeeded';
  const live=!!controls?.guide;
  if(!trial&&!(live&&view.options.length))return null;
  const guide=async(option:AscensionOption)=>{
    if(!controls?.guide||busy||inFlight.current||!view.options.includes(option))return;
    inFlight.current=true;
    setWorking(true);
    setProblem(undefined);
    try {if(!await controls.guide(option)&&mounted.current)setProblem('此令未成，请核对眼下劫势与自身余力。');}
    catch {if(mounted.current)setProblem('未能续行飞升之劫。');}
    finally {inFlight.current=false;if(mounted.current)setWorking(false);}
  };
  const listen=async()=>{
    if(!succeeded||!onListen||audioInFlight.current)return;
    audioInFlight.current=true;
    setListening(true);
    setProblem(undefined);
    try {if(!await onListen()&&mounted.current)setProblem('这段仙乐未能播放。');}
    catch {if(mounted.current)setProblem('这段仙乐未能播放。');}
    finally {audioInFlight.current=false;if(mounted.current)setListening(false);}
  };
  return <section aria-labelledby={heading} className="min-w-0 space-y-3 rounded-xl border border-indigo-300/35 bg-gradient-to-b from-indigo-950/65 to-slate-950/85 p-3">
    <header className="flex min-w-0 items-center gap-2.5">
      <AscensionInk opened={!!succeeded}/>
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <p className="text-xs font-semibold tracking-wider text-indigo-200">九霄终关</p>
        <h4 id={heading} className="mt-0.5 font-serif text-lg font-semibold leading-snug text-indigo-50">{succeeded?'仙门接引':'飞升天劫'}</h4>
      </div>
    </header>
    {trial&&<AscensionProof trial={trial}/>}
    {live&&view.options.length>0&&<div className="min-w-0 space-y-1.5" aria-busy={busy}>
      <p className="text-xs text-slate-300">{working?'正在行过此月…':'选一项，行过一月。'}</p>
      <div role="group" aria-label="当下可行" className="flex flex-wrap gap-2">
        {view.options.map(option=><button key={JSON.stringify(option)} type="button" className={action}
          disabled={busy} onClick={()=>void guide(option)}>{ascensionChoice(option)}</button>)}
      </div>
    </div>}
    {succeeded&&onListen&&<button type="button" className={action} disabled={listening} onClick={()=>void listen()}>
      {listening?'正在唤起仙乐…':'听一段接引仙乐'}
    </button>}
    {problem&&<p role="status" className="text-xs text-amber-200">{problem}</p>}
  </section>;
}
