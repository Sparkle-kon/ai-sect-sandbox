import {useId,useRef,useState} from 'react';
import type {PilgrimageOption} from '../engine/pilgrimageEngine';
import type {ProtagonistFlightView} from '../engine/protagonistFlightEngine';
import type {FlightOutcome,FlightReason} from '../types/protagonistFlight';

const moments:Record<FlightOutcome,string>={
  moved:'脚下又多赶过一段路。离脱身是否还远，要看下一步。',
  reached:'这一步踏过了险路尽头，终于抵达可落脚的去处。',
  held:'这一步未能走成。只能留在原处，再看退路。',
  camped:'同行者停步立营，这一回没有再往前赶。',
  aided:'同行有人出手照应。这一回留下援手，没有多走一步。',
  retreated:'这一段奔逃到此为止，并未抵达原定去处。',
};
const cause:Record<FlightReason,string>={
  guide_lost:'向导的援手接不上了。',withdrawn:'当事人已选退路。',destination_lost:'原先可落脚的去处已不可达。',
  journey_ended:'原先约好的同行已结束。',leader_lost:'原带路人已不能再领路。',time_elapsed:'留给这段奔逃的时机已经过去。',
};
const actions:Partial<Record<PilgrimageOption['pilgrimageMove'],string>>={
  advance:'继续赶路',camp:'就地扎营',resume:'拔营再走',relieve:'照应同行人',withdraw:'收步撤离',dismantle:'撤去临时营地',
};
const touch='min-h-11 min-w-0 rounded-md border border-amber-300/40 bg-slate-950/45 px-3 py-1.5 text-left text-sm font-medium text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 disabled:opacity-50';

export function ProtagonistFlightScene({view,options=[],controls,placeName,roadName}:{
  view:ProtagonistFlightView;
  options?:readonly PilgrimageOption[];
  controls?:{busy:boolean;guide:(option:PilgrimageOption)=>Promise<boolean>};
  placeName?:(id:string)=>string|undefined;
  roadName?:(id:string)=>string|undefined;
}){
  const id=useId();
  const [waiting,setWaiting]=useState(false);
  const [failed,setFailed]=useState(false);
  const inFlight=useRef(false);
  const last=view.rounds.at(-1);
  const place=last?.locationId&&placeName?.(last.locationId);
  const label=view.status==='reached'?'已脱险':view.status==='retreated'?'已撤退':view.status==='unfinished'?'此幕暂止':view.nextRound?`第 ${view.nextRound} 回合`:'仍在途中';
  const narration=last?moments[last.outcome]:'追势逼近，眼下要紧的是认准真正能走的路。';
  const command=async(option:PilgrimageOption)=>{
    if(view.status!=='active'||!controls||controls.busy||inFlight.current||!options.includes(option))return;
    inFlight.current=true;
    setWaiting(true);setFailed(false);
    try{setFailed(!await controls.guide(option));}
    catch{setFailed(true);}
    finally{inFlight.current=false;setWaiting(false);}
  };
  return <article aria-labelledby={id} className="min-w-0 space-y-2.5 rounded-xl border border-amber-400/35 bg-gradient-to-br from-amber-950/35 to-slate-950 p-3.5 [overflow-wrap:anywhere]">
    <p className="text-xs font-semibold tracking-wider text-amber-300">主线一幕 · {label}</p>
    <h3 id={id} className="font-serif text-lg font-semibold leading-tight text-amber-100">{view.title}</h3>
    <p className="font-serif text-base leading-7 text-slate-100">{narration}{last?.reason&&cause[last.reason]}{view.status==='unfinished'?'三回合走完，未见抵达或撤离实录。':''}</p>
    {place&&<p className="text-xs leading-relaxed text-slate-300">{last?.outcome==='reached'?'抵达':'最近记下的落脚处'}：{place}</p>}
    {view.status==='active'&&controls&&options.some(option=>actions[option.pilgrimageMove])&&<div className="space-y-1.5" aria-busy={waiting}>
      <p className="text-xs text-slate-300">{waiting?'这一步正在发生…':'择一步，行过一月。'}</p>
      <div role="group" aria-label="此刻能走的路" className="flex min-w-0 flex-wrap gap-1.5">
        {options.flatMap(option=>{
          const text=actions[option.pilgrimageMove];
          if(!text)return [];
          const road=option.targetRoadId&&roadName?.(option.targetRoadId);
          return <button type="button" key={JSON.stringify(option)} className={touch}
            disabled={controls.busy||waiting} onClick={()=>void command(option)}>{option.targetRoadId?road?`取驿道：${road}`:'取驿道前行':text}</button>;
        })}
      </div>
    </div>}
    {failed&&<p role="status" className="text-xs text-amber-200">这一步未能成行，请再看眼下的路。</p>}
  </article>;
}
