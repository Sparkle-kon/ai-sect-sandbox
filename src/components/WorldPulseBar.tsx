import {StorytellerPulseStrip} from './StorytellerPulseStrip';
import type {projectStorytellerPulse} from '../engine/storytellerDirector';
import {useId} from 'react';
import {CloudSnow,Flame,Leaf,Sparkles,Swords,TriangleAlert,Wind} from 'lucide-react';
import type {WorldPulseRisk,WorldPulseView} from './worldPulseModel';

const seasons={春:Leaf,夏:Flame,秋:Wind,冬:CloudSnow};
const signs={trial:'渡劫中',siege:'围攻中',clash:'本月交锋'} satisfies Record<WorldPulseRisk['kind'],string>;
const bounded=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const finite=(value:number|undefined):value is number=>typeof value==='number'&&Number.isFinite(value);
const short=(value:number)=>value.toLocaleString('zh-CN',{maximumFractionDigits:1});
const signed=(value:number)=>value>0?`+${short(value)}`:short(value);

function Fortune({side,score}:{side:'正道'|'魔道';score:WorldPulseView['righteous']}){
  const label=useId();
  const mean=score.count>0&&finite(score.mean)?bounded(score.mean,-100,100):undefined;
  return <div className="min-w-0 space-y-0.5">
    <p id={label} className="flex flex-wrap justify-between gap-x-1 text-xs">
      <span className={side==='正道'?'font-medium text-teal-200':'font-medium text-rose-200'}>{side}</span>
      <span className="tabular-nums text-slate-200">{mean===undefined?'暂无':signed(mean)}</span>
    </p>
    {mean!==undefined&&<meter min={-100} max={100} low={-25} high={25} optimum={100} value={mean}
      aria-labelledby={label} title={`${side}气运均值：${signed(mean)}，范围负一百至正一百`}
      className="block h-2 w-full"/>}
  </div>;
}

export function WorldPulseBar({view,storyteller,historical=false,canFocus=true,onFocusAlert}:{
  view:WorldPulseView;
  storyteller?:ReturnType<typeof projectStorytellerPulse>;
  historical?:boolean;
  canFocus?:boolean;
  onFocusAlert:(risk:WorldPulseRisk)=>void;
}){
  const heading=useId(),fortune=useId();
  const Season=seasons[view.season];
  const weather=view.weather;
  const weatherIntensity=finite(weather?.intensity)?Math.round(bounded(weather.intensity,0,1)*100):undefined;
  const champion=view.champion;
  const rows=view.risks.slice(0,3);
  const more=Math.max(0,view.additionalRisks)+Math.max(view.risks.length-rows.length,0);

  return <section aria-labelledby={heading}
    className="xianxia-frame w-full min-w-0 space-y-2 rounded-xl border border-teal-300/20 bg-slate-950/90 px-3 py-2 text-slate-100 [overflow-wrap:anywhere]">
    <div className={`grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 ${storyteller?
      'lg:grid-cols-[minmax(0,1fr)_minmax(0,.85fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-start':
      'lg:grid-cols-[minmax(0,1fr)_minmax(0,.85fr)_minmax(0,1fr)] lg:items-center'}`}>
      <div className="min-w-0">
        <h2 id={heading} className="flex flex-wrap items-center gap-x-1.5 text-xs font-semibold tracking-wide text-amber-100">
          天地气运 {historical&&<span className="font-normal tracking-normal text-slate-400">历史一帧</span>}
        </h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-200">
          <Season aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-teal-200"/>
          <span>{view.season}季</span>
          {weather&&<span className="text-teal-200">{weather.siteName} · {weather.kind}{weatherIntensity!==undefined?` ${weatherIntensity}%`:''}</span>}
        </p>
      </div>
      <div className="min-w-0 text-xs lg:order-3">
        <p className="flex items-center gap-1 text-slate-400"><Swords aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/>
          {view.coverage==='world'?'天下第一人':'所见战力首位'}
        </p>
        {champion?<p className="mt-0.5 text-slate-300">
          <strong className="text-amber-100">{champion.name}</strong> · {champion.realm}{finite(champion.power)?` · 战力 ${short(champion.power)}`:''}
        </p>:<p className="mt-0.5 text-slate-400">暂无可辨</p>}
      </div>
      <div className="col-span-2 min-w-0 rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1.5 lg:order-2 lg:col-span-1"
        role="group" aria-labelledby={fortune}>
        <p id={fortune} className="mb-0.5 text-xs text-slate-300">正魔气运均值 <span className="text-slate-400">−100 至 +100</span></p>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <Fortune side="正道" score={view.righteous}/>
          <Fortune side="魔道" score={view.demonic}/>
        </div>
      </div>
      {storyteller&&<StorytellerPulseStrip view={storyteller}/>}
    </div>
    {rows.length===0?<p className="text-xs text-slate-400">当前范围未见高危。</p>:
      <ul aria-label="当前范围的高危与交锋" className="flex min-w-0 flex-wrap items-center gap-1.5">
        {rows.map(risk=>{
          const text=`${risk.siteName} · ${risk.label||signs[risk.kind]}`;
          const style=`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 text-left text-xs
            ${risk.kind==='clash'?'border-slate-600 bg-slate-800/60 text-slate-200':'border-amber-400/35 bg-amber-950/60 text-amber-100'}`;
          const Icon=risk.kind==='clash'?Swords:TriangleAlert;
          const body=<><Icon aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${risk.kind!=='clash'&&!historical?'motion-safe:animate-pulse [animation-iteration-count:1]':''}`}/><span>{text}</span></>;
          return <li key={risk.id} className="min-w-0 max-w-full">
            {canFocus?<button type="button" aria-label={`在地图定位：${text}`} onClick={()=>onFocusAlert(risk)}
              className={`${style} min-h-11 hover:bg-amber-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200`}>{body}</button>:
              <span className={`${style} min-h-8 py-1`}>{body}</span>}
          </li>;
        })}
        {more>0&&<li className="flex items-center gap-1 text-xs text-slate-400"><Sparkles aria-hidden="true" className="h-3 w-3"/>另有 {more} 条记录</li>}
      </ul>}
  </section>;
}
