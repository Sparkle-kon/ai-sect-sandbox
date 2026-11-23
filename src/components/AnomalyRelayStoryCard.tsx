import {useId} from 'react';
import type {AnomalyRelayView} from '../engine/anomalyRelay';

const channels={
  witness:['亲见','兽潮在此起。此处所记，是当时亲眼所见。'],
  conversation:['当面传闻','到这一月，才在此地当面听得兽潮的消息。'],
  flying_sword:['飞剑传讯','飞剑的消息到此，接着说的是同一场兽潮。'],
} as const;

export function AnomalyRelayStoryCard({view}:{view:AnomalyRelayView}){
  const heading=useId();
  if(!view.scenes.length)return null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-3 rounded-lg border border-emerald-300/25 bg-gradient-to-br from-emerald-950/35 via-slate-900 to-slate-950 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <h3 id={heading} className="font-serif text-lg font-semibold text-emerald-50">{view.complete?'一场天变，三地闻钟':'一场天变'}</h3>
    <ol className="space-y-3">
      {view.scenes.map((scene,index)=>{
        const [channel,line]=channels[scene.channel];
        return <li key={index} className="border-l border-emerald-300/25 pl-2">
          <p className="text-xs text-emerald-200">{scene.siteName} · 仙历 {scene.year} 年 {scene.month} 月 · {channel}</p>
          <p className="font-serif text-sm leading-relaxed text-slate-200">{line}</p>
        </li>;
      })}
    </ol>
    {view.complete&&<p className="font-serif text-sm leading-relaxed text-emerald-100">三地闻讯先后不同，记下的却是同一场兽潮。</p>}
  </section>;
}
