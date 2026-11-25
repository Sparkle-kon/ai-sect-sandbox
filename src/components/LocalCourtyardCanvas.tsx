import {SectReactionGlyph,useSectReactionShake} from './SectReactionGlyph';
import type {SectReactionCue} from '../types/sectReaction';
import {SectQuirkBadges} from './SectQuirkBadges';
import {drawSeasonalAtmosphere} from './seasonalAtmosphereRenderer';
import {useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react';
import {drawLocalCourtyard} from './localCourtyardRenderer';
import {hitLocalCourtyard,type LocalCourtyardActor,type LocalCourtyardPlan,type LocalCourtyardTarget} from './localCourtyardModel';

interface LocalCourtyardCanvasProps {
  plan:LocalCourtyardPlan;
  onReturn?:()=>void;
  embedded?:boolean;
  renderActor?:(actor:LocalCourtyardActor)=>ReactNode;
  reaction?:SectReactionCue;
  idleLife?:boolean;
  /** Delegates to the same native map selection and focus, never moves the subject. */
  onFocusActor?:(id:string)=>boolean;
}
const pageSize=12;
const button='min-h-11 min-w-0 rounded-md border border-amber-300/35 px-3 py-2 text-left text-sm text-amber-50 [overflow-wrap:anywhere] hover:bg-amber-950/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200';

export function LocalCourtyardCanvas({plan,onReturn,onFocusActor,embedded=false,renderActor,reaction,idleLife=false}:LocalCourtyardCanvasProps){
  const title=useId(),detail=useId();
  const heading=useRef<HTMLHeadingElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const scenery=useRef<HTMLDivElement>(null);
  const anchors=embedded&&reaction&&plan.atmosphere?.tick===reaction.tick&&!plan.atmosphere.historical&&reaction.siteId===plan.siteId?
    plan.actors.filter(actor=>actor.id===reaction.actorId):[];
  const actorWithReaction=anchors.length===1?anchors[0]:undefined;
  const visibleReaction=actorWithReaction?reaction:undefined;
  useSectReactionShake(scenery,visibleReaction);
  const [chosen,setChosen]=useState<LocalCourtyardTarget>();
  const [page,setPage]=useState(0);
  const rows=useMemo(()=>{
    const entries=[
      ...plan.actors.map(row=>({kind:'actor' as const,id:row.id,label:row.name,detail:row.realm,quirkLabels:row.quirkLabels})),
      ...plan.villagers.map(row=>({kind:'villager' as const,id:row.id,label:row.name,detail:row.label})),
      ...plan.facilities.map(row=>({kind:'facility' as const,id:row.id,label:row.label,detail:row.detail})),
    ];
    const totals=new Map<string,number>(),seen=new Map<string,number>();
    for(const row of entries){
      const name=`${row.kind}:${row.label}`;
      totals.set(name,(totals.get(name)??0)+1);
    }
    return entries.map(row=>{
      const name=`${row.kind}:${row.label}`;
      const ordinal=(seen.get(name)??0)+1;
      seen.set(name,ordinal);
      return {...row,distinction:(totals.get(name)??0)>1?`同名第 ${ordinal} 位`:undefined};
    });
  },[plan]);
  const selected=chosen&&rows.find(row=>row.kind===chosen.kind&&row.id===chosen.id);
  const lastPage=Math.max(0,Math.ceil(rows.length/pageSize)-1),visiblePage=Math.min(page,lastPage);

  useEffect(()=>{
    if(embedded)return;
    heading.current?.focus({preventScroll:true});
    heading.current?.scrollIntoView?.({block:'nearest'});
  },[embedded]);
  useEffect(()=>{
    if(!selected&&chosen)setChosen(undefined);
  },[chosen,selected]);
  useEffect(()=>{
    const el=canvas.current,win=el?.ownerDocument.defaultView;
    if(!el||!win)return;
    let pen:CanvasRenderingContext2D|null;
    try{pen=el.getContext('2d');}catch{return;}
    if(!pen)return;
    const context=pen,doc=el.ownerDocument,motion=win.matchMedia?.('(prefers-reduced-motion: reduce)');
    const budget=2100,interval=1000/(idleLife?8:12);
    let raf:number|undefined,started:number|undefined,last=-Infinity,visible=true,spent=false,width=0,height=0;
    const canAnimate=()=>!!plan.atmosphere&&!plan.atmosphere.historical&&!motion?.matches&&!doc.hidden&&visible&&
      typeof win.requestAnimationFrame==='function'&&width>0&&height>0;
    const paint=(time=0)=>{
      if(!(width>0&&height>0))return;
      context.setTransform(el.width/plan.width,0,0,el.height/plan.height,0,0);
      if(idleLife)drawLocalCourtyard(context,plan,plan.width,plan.height,time,true);
      else drawLocalCourtyard(context,plan,plan.width,plan.height,time);
      if(plan.atmosphere)drawSeasonalAtmosphere(context,plan.atmosphere,{x:0,y:0,width:plan.width,height:plan.height},time);
    };
    const stop=()=>{
      if(raf!==undefined)win.cancelAnimationFrame(raf);
      raf=undefined;
    };
    const frame=(now:number)=>{
      raf=undefined;
      if(!canAnimate()){paint();return;}
      started??=now;
      const elapsed=now-started;
      if(!idleLife&&elapsed>=budget){spent=true;paint();return;}
      if(now-last>=interval){last=now;paint(elapsed);}
      raf=win.requestAnimationFrame(frame);
    };
    const refresh=()=>{
      stop();
      const rect=el.getBoundingClientRect(),dpr=Math.max(1,Math.min(2,Number.isFinite(win.devicePixelRatio)?win.devicePixelRatio:1));
      width=Number.isFinite(rect.width)?Math.min(960,Math.max(0,rect.width)):0;
      height=Number.isFinite(rect.height)?Math.min(600,Math.max(0,rect.height)):0;
      if(!(width>0&&height>0))return;
      const w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));
      if(w!==el.width)el.width=w;
      if(h!==el.height)el.height=h;
      paint();
      if(canAnimate()&&!spent)raf=win.requestAnimationFrame(frame);
    };
    const resize=typeof ResizeObserver==='function'?new ResizeObserver(refresh):undefined;
    const onScreen=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
      const shown=entries.find(entry=>entry.target===el)?.isIntersecting;
      if(shown===undefined||shown===visible)return;
      visible=shown;refresh();
    }):undefined;
    resize?.observe(el);onScreen?.observe(el);
    win.addEventListener('resize',refresh);doc.addEventListener('visibilitychange',refresh);
    motion?.addEventListener?.('change',refresh);refresh();
    return ()=>{
      stop();resize?.disconnect();onScreen?.disconnect();
      win.removeEventListener('resize',refresh);doc.removeEventListener('visibilitychange',refresh);
      motion?.removeEventListener?.('change',refresh);
    };
  },[plan,idleLife]);

  return <section aria-labelledby={title} data-local-courtyard=""
    className="min-w-0 space-y-3 bg-stone-950/80 px-3 py-3 sm:px-4"
    onKeyDown={event=>{
      if(embedded||!onReturn||event.key!=='Escape'||event.nativeEvent.isComposing)return;
      event.preventDefault();event.stopPropagation();onReturn();
    }}>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        {!embedded&&<p className="text-xs text-amber-200">本地图景</p>}
        <h3 id={title} ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold text-amber-50 [overflow-wrap:anywhere]">{plan.siteName}</h3>
      </div>
      {!embedded&&onReturn&&<button type="button" className={button} onClick={onReturn}>返回九州山河全图</button>}
    </header>
    {!embedded&&<p className="text-xs text-stone-300">人物与设施按眼下可见绘出。水景与庭院布局为示意，不改变山河行程。</p>}
    {!embedded&&plan.population!==undefined&&<p className="text-xs text-stone-300">聚落登记 {plan.population} 人；图中只列实见可辨的人。</p>}
    <div ref={scenery} className="relative">
    <canvas ref={canvas} width={plan.width} height={plan.height} aria-hidden="true"
      className="aspect-[8/5] w-full select-none rounded-lg bg-stone-900"
      onClick={embedded?undefined:event=>{
        const rect=event.currentTarget.getBoundingClientRect();
        if(rect.width<=0||rect.height<=0)return;
        const target=hitLocalCourtyard(plan,{
          x:(event.clientX-rect.left)*plan.width/rect.width,y:(event.clientY-rect.top)*plan.height/rect.height,
        });
        if(!target)return;
        const index=rows.findIndex(row=>row.kind===target.kind&&row.id===target.id);
        if(index<0)return;
        setChosen(target);setPage(Math.floor(index/pageSize));
      }}/>
    {embedded&&renderActor&&plan.actors.map(actor=><div key={actor.id} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
      style={{left:`${actor.x/plan.width*100}%`,top:`${actor.y/plan.height*100}%`}}>{renderActor(actor)}</div>)}
    {visibleReaction&&actorWithReaction&&<div key={visibleReaction.id} aria-hidden="true" data-courtyard-reaction={visibleReaction.kind}
      className="pointer-events-none absolute z-10 h-8 w-8 -translate-x-1/2 -translate-y-full"
      style={{left:`${actorWithReaction.x/plan.width*100}%`,top:`${Math.max(25,actorWithReaction.y-12)/plan.height*100}%`}}>
      <SectReactionGlyph kind={visibleReaction.kind} className="h-full w-full"/>
    </div>}
    </div>
    {!embedded&&selected&&<section id={detail} aria-label="庭院图中所选" className="space-y-1 rounded-md border border-amber-300/25 p-2 text-sm text-stone-200">
      <div aria-live="polite"><p className="font-semibold text-amber-50">{selected.label}</p><p>{selected.detail}{selected.distinction&&` · ${selected.distinction}`}</p></div>
      {selected.kind==='actor'&&<SectQuirkBadges labels={selected.quirkLabels}/>}
      {selected.kind==='actor'&&onFocusActor&&
        <button type="button" className={button} onClick={()=>onFocusActor(selected.id)}>聚焦此人</button>}
    </section>}
    {!embedded&&!!rows.length&&<div className="space-y-1.5">
      <p className="text-xs text-amber-100">庭院人物与设施</p>
      <ul aria-label="庭院人物与设施" className="grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3">
        {rows.slice(visiblePage*pageSize,(visiblePage+1)*pageSize).map(row=>{
          const active=selected===row;
          return <li key={`${row.kind}:${row.id}`} className="min-w-0">
            <button type="button" aria-pressed={active} aria-controls={active?detail:undefined}
              className={`w-full ${button}`} onClick={()=>setChosen({kind:row.kind,id:row.id})}>
              <span>{row.label}</span><span className="block text-xs text-amber-100/80">{row.kind==='facility'?'设施':row.detail}{row.distinction&&` · ${row.distinction}`}</span>
            </button>
          </li>;
        })}
      </ul>
      {lastPage>0&&<div className="flex flex-wrap items-center gap-2 text-xs text-stone-300" aria-label="庭院名单翻页">
        <button type="button" className={button} disabled={!visiblePage} onClick={()=>setPage(visiblePage-1)}>上一页</button>
        <span aria-live="polite">{visiblePage+1} / {lastPage+1}</span>
        <button type="button" className={button} disabled={visiblePage>=lastPage} onClick={()=>setPage(visiblePage+1)}>下一页</button>
      </div>}
    </div>}
  </section>;
}
