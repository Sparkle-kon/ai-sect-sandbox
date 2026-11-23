import {useEffect,useRef,useState} from 'react';
import {HEAVENLY_ALCHEMY_HEAT,HEAVENLY_ALCHEMY_QUALITY} from '../engine/heavenlyAlchemyTerms';
import type {AlchemyWorkshopFrame} from './alchemyWorkshopVisualModel';
import {alchemyGardenPageSize,drawAlchemyFurnace,drawSeedGarden} from './alchemyWorkshopRenderer';

const duration=1150;
const frameInterval=1000/15;

export function AlchemyWorkshopCanvas({frame,kind,active=true}:{
  frame:AlchemyWorkshopFrame;kind:'furnace'|'garden';active?:boolean;
}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const played=useRef<string>();
  const [gardenPage,setGardenPage]=useState(0);
  const garden=frame.garden,furnace=frame.furnace;
  const amount=garden?garden.plots.length+garden.anonymousGrowing+garden.anonymousReady:0;
  const pages=Math.max(1,Math.ceil(amount/alchemyGardenPageSize));
  const page=Math.min(gardenPage,pages-1);
  const hasResult=kind==='furnace'&&frame.furnace?.mode==='receipt'&&!!frame.furnace.result;
  const operation=hasResult?`${frame.siteId}:${frame.tick}:${furnace?.operator?.id??''}:${furnace?.heat??''}`:undefined;

  useEffect(()=>{
    const element=canvas.current,view=element?.ownerDocument.defaultView;
    if(!active||!element||!view)return;
    let ctx:CanvasRenderingContext2D|null;
    try{ctx=element.getContext('2d');}catch{return;}
    if(!ctx)return;
    const pen=ctx,doc=element.ownerDocument;
    const motion=view.matchMedia?.('(prefers-reduced-motion: reduce)');
    let width=0,height=0,raf:number|undefined,start:number|undefined,previous=-Infinity;
    const draw=(progress?:number)=>{
      if(width<=0||height<=0)return;
      pen.setTransform(element.width/width,0,0,element.height/height,0,0);
      if(kind==='furnace'&&furnace) drawAlchemyFurnace(pen,furnace,width,height,progress);
      if(kind==='garden'&&garden) drawSeedGarden(pen,garden,width,height,page);
    };
    const stop=()=>{
      if(raf!==undefined)view.cancelAnimationFrame(raf);
      raf=undefined;
    };
    const allowed=()=>!doc.hidden&&!motion?.matches&&width>0&&height>0&&typeof view.requestAnimationFrame==='function';
    const animate=(now:number)=>{
      raf=undefined;
      if(!allowed()){draw();return;}
      start??=now;
      const elapsed=now-start;
      if(elapsed>=duration){draw();return;}
      if(now-previous>=frameInterval){previous=now;draw(elapsed/duration);}
      raf=view.requestAnimationFrame(animate);
    };
    const update=()=>{
      const bounds=element.getBoundingClientRect();
      width=Number.isFinite(bounds.width)?Math.max(0,Math.round(Math.min(960,bounds.width))):0;
      height=Number.isFinite(bounds.height)?Math.max(0,Math.round(Math.min(540,bounds.height))):0;
      if(width&&height){
        const ratio=Number.isFinite(view.devicePixelRatio)?Math.min(2,Math.max(1,view.devicePixelRatio)):1;
        const pw=Math.round(width*ratio),ph=Math.round(height*ratio);
        if(element.width!==pw)element.width=pw;
        if(element.height!==ph)element.height=ph;
      }
      if(!allowed())stop();
      draw();
      if(allowed()&&operation!==undefined&&played.current!==operation){
        played.current=operation;
        raf=view.requestAnimationFrame(animate);
      }
    };
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(update):undefined;
    observer?.observe(element);
    view.addEventListener('resize',update);doc.addEventListener('visibilitychange',update);
    motion?.addEventListener?.('change',update);
    update();
    return ()=>{
      stop();observer?.disconnect();view.removeEventListener('resize',update);doc.removeEventListener('visibilitychange',update);
      motion?.removeEventListener?.('change',update);
    };
  },[furnace,garden,kind,active,operation,page]);
  if(kind==='furnace'&&!furnace||kind==='garden'&&!garden)return null;
  const caption=kind==='furnace'&&furnace
    ? furnace.status==='closed'?'停炉，火膛未燃。'
      :furnace.status==='reopening'?'已签复炉，本轮仍停炉。'
      :furnace.mode==='preview'&&furnace.heat?`火候示意：${HEAVENLY_ALCHEMY_HEAT[furnace.heat].name}。尚未耗材，不能预知成色。`
      :furnace.mode==='receipt'&&furnace.heat?`本轮实录：${HEAVENLY_ALCHEMY_HEAT[furnace.heat].name}。
          ${furnace.result?.quality?`实成${HEAVENLY_ALCHEMY_QUALITY[furnace.result.quality].name}。`:'此炉未成丹。'}${furnace.result?.lightning?'实见丹雷。':''}`
      :`装设 ${furnace.grade} 阶丹炉。炉火未起。`
    : `同地田圃：生长中 ${garden?.growing??0} 圃，实熟待收 ${garden?.ready??0} 圃。生长阶段为观测示意。`;
  return <figure data-alchemy-workshop={kind} className="m-0 min-w-0 space-y-1 overflow-hidden rounded-lg border border-amber-300/25 bg-slate-950/60">
    <div className="relative aspect-[2/1] w-full overflow-hidden bg-[#222735]">
      <canvas ref={canvas} width={640} height={320} aria-hidden="true" className="absolute inset-0 block size-full"/>
    </div>
    {kind==='garden'&&pages>1&&<div className="flex min-w-0 flex-wrap items-center gap-2 px-2 text-xs text-slate-200" aria-label="田圃图分页">
      <button type="button" className="min-h-11 rounded border border-slate-700 px-2 disabled:opacity-50" disabled={page===0}
        onClick={()=>setGardenPage(page-1)}>上一组田圃</button>
      <span aria-live="polite">第 {page+1}/{pages} 组</span>
      <button type="button" className="min-h-11 rounded border border-slate-700 px-2 disabled:opacity-50" disabled={page>=pages-1}
        onClick={()=>setGardenPage(page+1)}>下一组田圃</button>
    </div>}
    <figcaption className="px-2 pb-1.5 text-xs text-slate-200 [overflow-wrap:anywhere]">{frame.siteName} · {caption}</figcaption>
  </figure>;
}
