import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {drawLocalCourtyard} from './localCourtyardRenderer';
import {hitLocalCourtyard,type LocalCourtyardPlan,type LocalCourtyardTarget} from './localCourtyardModel';

interface LocalCourtyardCanvasProps {
  plan:LocalCourtyardPlan;
  onReturn:()=>void;
  /** Delegates to the same native map selection and focus, never moves the subject. */
  onFocusActor?:(id:string)=>boolean;
}
const pageSize=12;
const button='min-h-11 min-w-0 rounded-md border border-amber-300/35 px-3 py-2 text-left text-sm text-amber-50 [overflow-wrap:anywhere] hover:bg-amber-950/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200';

export function LocalCourtyardCanvas({plan,onReturn,onFocusActor}:LocalCourtyardCanvasProps){
  const title=useId(),detail=useId();
  const heading=useRef<HTMLHeadingElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const [chosen,setChosen]=useState<LocalCourtyardTarget>();
  const [page,setPage]=useState(0);
  const rows=useMemo(()=>{
    const entries=[
      ...plan.actors.map(row=>({kind:'actor' as const,id:row.id,label:row.name,detail:row.realm})),
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
    heading.current?.focus({preventScroll:true});
    heading.current?.scrollIntoView?.({block:'nearest'});
  },[]);
  useEffect(()=>{
    if(!selected&&chosen)setChosen(undefined);
  },[chosen,selected]);
  useEffect(()=>{
    const el=canvas.current;
    if(!el)return;
    const context=el.getContext('2d');
    if(!context)return;
    const paint=()=>{
      const rect=el.getBoundingClientRect();
      if(rect.width<=0||rect.height<=0)return;
      const dpr=Math.max(1,Math.min(2,el.ownerDocument.defaultView?.devicePixelRatio??1));
      const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
      if(w!==el.width)el.width=w;
      if(h!==el.height)el.height=h;
      context.setTransform(w/plan.width,0,0,h/plan.height,0,0);
      drawLocalCourtyard(context,plan,plan.width,plan.height,0);
    };
    paint();
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(paint):undefined;
    observer?.observe(el);
    return ()=>observer?.disconnect();
  },[plan]);

  return <section aria-labelledby={title} data-local-courtyard=""
    className="min-w-0 space-y-3 bg-stone-950/80 px-3 py-3 sm:px-4"
    onKeyDown={event=>{
      if(event.key!=='Escape'||event.nativeEvent.isComposing)return;
      event.preventDefault();event.stopPropagation();onReturn();
    }}>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs text-amber-200">本地图景</p>
        <h3 id={title} ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold text-amber-50 [overflow-wrap:anywhere]">{plan.siteName}</h3>
      </div>
      <button type="button" className={button} onClick={onReturn}>返回九州山河全图</button>
    </header>
    <p className="text-xs text-stone-300">人物与设施按眼下可见绘出。水景与庭院布局为示意，不改变山河行程。</p>
    {plan.population!==undefined&&<p className="text-xs text-stone-300">聚落登记 {plan.population} 人；图中只列实见可辨的人。</p>}
    <canvas ref={canvas} width={plan.width} height={plan.height} aria-hidden="true"
      className="aspect-[8/5] w-full select-none rounded-lg bg-stone-900"
      onClick={event=>{
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
    {selected&&<section id={detail} aria-label="庭院图中所选" className="space-y-1 rounded-md border border-amber-300/25 p-2 text-sm text-stone-200">
      <div aria-live="polite"><p className="font-semibold text-amber-50">{selected.label}</p><p>{selected.detail}{selected.distinction&&` · ${selected.distinction}`}</p></div>
      {selected.kind==='actor'&&onFocusActor&&
        <button type="button" className={button} onClick={()=>onFocusActor(selected.id)}>聚焦此人</button>}
    </section>}
    {!!rows.length&&<div className="space-y-1.5">
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
