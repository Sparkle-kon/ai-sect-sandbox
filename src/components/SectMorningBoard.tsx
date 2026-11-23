import type {SectReactionCue} from '../types/sectReaction';
import {useEffect,useMemo,useRef,useState,type DragEvent,type ReactNode} from 'react';
import {SECT_JOB_DEFINITIONS,eligibleSectDisciples,quoteSectJob,visibleSectJobDefinitions} from '../engine/sectJobs';
import {projectSectFestivals} from '../engine/sectFestivals';
import type {SectJobAssignment,SectJobObservation} from '../types/sectJobs';
import type {Cultivator,WorldState} from '../types/world';
import {LocalCourtyardCanvas} from './LocalCourtyardCanvas';
import {drawCanvasCharacterSprite} from './canvasCharacterSprite';
import type {LocalCourtyardActor,LocalCourtyardPlan} from './localCourtyardModel';

export type ConfirmSectJobs=(expectedWorld:WorldState,assignments:readonly SectJobAssignment[])=>Promise<boolean>;
type JobId=SectJobAssignment['jobId'];
type Draft=ReadonlyMap<string,JobId>;
type BoundDraft={world:WorldState;orders:Draft};
type Walk={actor:LocalCourtyardActor;job:JobId;dx:number;dy:number;sequence:number};
const empty:Draft=new Map();
const dragType='application/x-tian-dao-disciple';
const card='xianxia-frame min-w-0 rounded-xl border border-amber-300/25 bg-slate-950/75 px-3 py-3 [overflow-wrap:anywhere]';
const control='min-h-11 min-w-0 rounded-md border border-amber-300/35 text-amber-100 hover:bg-amber-950/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-50';

function PlanningSprite({walk}:{walk:Walk}){
  const marker=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=marker.current;
    if(!canvas)return;
    const context=canvas.getContext('2d');
    if(!context)return;
    const draw=(phase:number)=>{
      context.clearRect(0,0,40,40);
      drawCanvasCharacterSprite(context,20,20,{...walk.actor.sprite,pose:'idle'},34,phase,false,phase>0);
    };
    draw(0);
    const win=canvas.ownerDocument.defaultView;
    if(!win||win.matchMedia?.('(prefers-reduced-motion: reduce)').matches||typeof canvas.animate!=='function'||
      (Math.abs(walk.dx)<1&&Math.abs(walk.dy)<1))return;
    const animation=canvas.animate([
      {transform:`translate(${walk.dx}px,${walk.dy}px)`},
      {transform:'translate(0,0)'},
    ],{duration:440,easing:'ease-out'});
    let key:number|undefined,start:number|undefined;
    const step=(time:number)=>{
      start??=time;draw((time-start+1)/1000);
      if(time-start<440)key=win.requestAnimationFrame(step);else draw(0);
    };
    if(typeof win.requestAnimationFrame==='function')key=win.requestAnimationFrame(step);
    return ()=>{animation.cancel();if(key!==undefined)win.cancelAnimationFrame(key);};
  },[walk]);
  return <canvas ref={marker} aria-hidden="true" width="40" height="40" className="pointer-events-none absolute bottom-0 right-0 z-20 h-9 w-9"/>;
}

export function SectMorningBoard({world,busy,plan,moving,onConfirmJobs,buildings,observations,reaction}:{
  world:WorldState;busy:boolean;plan?:LocalCourtyardPlan;moving?:ReadonlySet<string>;onConfirmJobs:ConfirmSectJobs;buildings:ReactNode;observations?:readonly SectJobObservation[];reaction?:SectReactionCue;
}){
  const members=useMemo(()=>eligibleSectDisciples(world),[world]);
  const jobs=useMemo(()=>visibleSectJobDefinitions(world),[world]);
  const festivals=useMemo(()=>projectSectFestivals(world),[world]);
  const sprites=useMemo(()=>new Map(plan?.actors.map(row=>[row.id,row])),[plan]);
  const memberById=useMemo(()=>new Map(members.map(row=>[row.id,row])),[members]);
  const [selected,setSelected]=useState<{world:WorldState;id:string}>();
  const [draft,setDraft]=useState<BoundDraft>();
  const [walk,setWalk]=useState<Walk>();
  const [notice,setNotice]=useState<{world:WorldState;text:string}>();
  const [pending,setPending]=useState<WorldState>();
  const [committed,setCommitted]=useState<WorldState>();
  const drag=useRef<{world:WorldState;actor:Cultivator}>();
  const flight=useRef<{world:WorldState;accepted?:boolean}>();
  const latest=useRef(world);
  latest.current=world;
  const sequence=useRef(0);
  const actor=selected?.world===world?memberById.get(selected.id):undefined;
  const blocked=busy||pending===world||committed===world;
  const draftOrders=draft?.world===world?draft.orders:empty;
  const usable=(member:Cultivator,job:JobId)=>quoteSectJob(world,member,job).kind!=='blocked';
  const locked=()=>busy||flight.current?.world===world||committed===world||latest.current!==world;
  const [dragging,setDragging]=useState<{world:WorldState;id:string}>();
  const dragMember=dragging?.world===world?memberById.get(dragging.id):undefined;
  const jobFocus=dragMember??actor;
  const currentPlans=useMemo(()=>new Map(jobFocus?jobs.map(job=>[job.id,quoteSectJob(world,jobFocus,job.id)]):[]),
    [world,jobFocus,jobs]);

  const assign=(member:Cultivator,job:JobId,destination:HTMLElement)=>{
    if(locked()||memberById.get(member.id)!==member)return;
    const candidate=quoteSectJob(world,member,job);
    if(candidate.kind==='blocked'){setNotice({world,text:`${SECT_JOB_DEFINITIONS[job].label}：${candidate.reason}`});return;}
    setSelected({world,id:member.id});setNotice(undefined);
    setDraft(previous=>{
      const orders=new Map(previous?.world===world?previous.orders:empty);
      orders.set(member.id,job);return {world,orders};
    });
    const sprite=sprites.get(member.id);
    const canvas=destination.closest('[data-sect-morning]')?.querySelector<HTMLCanvasElement>('[data-local-courtyard] canvas');
    if(!sprite||!plan||!canvas){setWalk(undefined);return;}
    const courtyard=canvas.getBoundingClientRect(),target=destination.getBoundingClientRect();
    const dx=courtyard.left+sprite.x/plan.width*courtyard.width-(target.right-18);
    const dy=courtyard.top+sprite.y/plan.height*courtyard.height-(target.bottom-18);
    setWalk({actor:sprite,job,dx,dy,sequence:++sequence.current});
  };

  const select=(id:string)=>{
    if(locked()||!memberById.has(id))return;
    setSelected({world,id});setNotice(undefined);
  };
  const dragStart=(event:DragEvent<HTMLButtonElement>,member:Cultivator)=>{
    if(locked()||!sprites.has(member.id)||!event.dataTransfer){event.preventDefault();return;}
    drag.current={world,actor:member};
    event.dataTransfer.effectAllowed='move';
    event.dataTransfer.setData(dragType,member.id);
    setDragging({world,id:member.id});select(member.id);
  };
  const dragEnd=()=>{drag.current=undefined;setDragging(undefined);};
  const drop=(event:DragEvent<HTMLButtonElement>,job:JobId)=>{
    const source=drag.current;
    if(source?.world!==world||event.dataTransfer?.getData(dragType)!==source.actor.id)return;
    event.preventDefault();dragEnd();
    assign(source.actor,job,event.currentTarget);
  };
  const undo=()=>{
    if(locked()||!actor||!draftOrders.has(actor.id))return;
    setDraft(previous=>{
      const orders=new Map(previous?.world===world?previous.orders:empty);
      orders.delete(actor.id);return {world,orders};
    });
    setWalk(previous=>previous?.actor.id===actor.id?undefined:previous);setNotice(undefined);
  };
  const confirm=async()=>{
    if(locked())return;
    const assignments:SectJobAssignment[]=[];
    for(const [discipleId,jobId] of draftOrders){
      const member=memberById.get(discipleId);
      if(!member||!usable(member,jobId)){setNotice({world,text:'差事单有变，请重新点选。'});return;}
      assignments.push({discipleId,jobId});
    }
    const attempt={world,accepted:false};
    flight.current=attempt;setPending(world);setNotice(undefined);
    try{
      attempt.accepted=await onConfirmJobs(world,assignments);
      if(latest.current===world&&attempt.accepted)setCommitted(world);
    }catch{
      attempt.accepted=false;
    }finally{
      if(flight.current===attempt&&!attempt.accepted)flight.current=undefined;
      if(latest.current===world){
        setPending(undefined);
        if(!attempt.accepted)setNotice({world,text:'晨会没能开成，差事还留着，可以再试。'});
      }
    }
  };
  const selectedJob=actor&&draftOrders.get(actor.id);
  const selectedPlan=selectedJob&&actor&&actor===jobFocus?currentPlans.get(selectedJob):undefined;
  const remaining=members.length-draftOrders.size;
  const activeWalk=draft?.world===world?walk:undefined;
  const inside=members.filter(member=>sprites.has(member.id));
  const outside=members.filter(member=>!sprites.has(member.id));
  const settled=observations?.flatMap(row=>{
    if(row.tick!==world.tick)return [];
    const names=world.cultivators.filter(member=>member.id===row.discipleId);
    return names.length===1?[{...row,name:names[0].name}]:[];
  })??[];
  const phaseLabel={performed:'已办',on_route:'进行中',unavailable:'未办'} as const;
  const chip=(member:Cultivator,desktop:boolean)=><button type="button" aria-label={`点选 ${member.name}`}
    aria-pressed={actor===member} disabled={blocked} data-morning-disciple={desktop?'sprite':'name'}
    className={`${control} px-2 text-xs aria-pressed:border-amber-300 aria-pressed:bg-amber-950 ${desktop?'pointer-events-auto relative hidden min-w-11 cursor-grab border-transparent bg-transparent lg:block':'bg-slate-950/80'}`}
    draggable={desktop&&!blocked} onDragStart={event=>dragStart(event,member)} onDragEnd={dragEnd} onClick={()=>select(member.id)}>
    {desktop?<span className="pointer-events-none absolute left-1/2 top-8 max-w-24 -translate-x-1/2 truncate rounded bg-slate-950/90 px-1.5 py-0.5 text-xs text-amber-100">{member.name}</span>:member.name}
  </button>;

  return <div data-sect-morning="" className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
    <section className={card} aria-label="宗门庭院">
      {plan?<LocalCourtyardCanvas plan={plan} embedded reaction={reaction} renderActor={person=>{
        const member=memberById.get(person.id);return member?chip(member,true):null;
      }}/>:<p className="text-sm text-slate-300">此刻未见山门内的景象。</p>}
      {inside.length>0&&<ul className="mb-2 flex flex-wrap gap-1.5 lg:hidden" aria-label="庭院弟子">
        {inside.map(member=><li key={member.id}>{chip(member,false)}</li>)}
      </ul>}
      {outside.length>0&&<div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="不在庭院的弟子">
        <span className="text-xs text-slate-300">不在庭院：</span>{outside.map(member=><span className="inline-flex items-center gap-1" key={member.id}>{chip(member,false)}
          <span className="text-xs text-slate-400">{moving?.has(member.id)?'在路上':member.locationId!==plan?.siteId?'在外':'未入席'}</span></span>)}
      </div>}
      {buildings}
    </section>
    <section className={card} aria-label="晨会差事">
      <h2 className="font-serif text-lg font-semibold text-amber-100">掌门晨会</h2>
      {festivals.length>0&&<details className="mt-1 rounded-md border border-amber-300/25 bg-amber-950/20 px-2">
        <summary className="min-h-11 cursor-pointer content-center text-xs text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
          江湖节庆{festivals[0]&&` · ${festivals[0].month}月 ${festivals[0].title}`}
        </summary>
        <ul aria-label="江湖节庆日历" className="space-y-2 pb-2 text-xs text-slate-200">
          {festivals.map(festival=><li key={festival.id}>
            <span className="text-amber-100">{festival.year}年{festival.month}月 · {festival.title}</span>
            {jobs.some(job=>job.id===festival.jobId)&&<span className="ml-1 text-amber-200">本次晨会有此差事</span>}
            <p className="mt-0.5">{festival.detail}</p>
          </li>)}
        </ul>
      </details>}
      <p aria-live="polite" className="my-1.5 text-sm text-slate-200">
        {actor?<>{actor.name}：{selectedJob?SECT_JOB_DEFINITIONS[selectedJob].label:'还没领差事'}{selectedPlan?.kind==='native'&&selectedPlan.phase==='on_route'&&(selectedPlan.decision.chosenAction==='EXPLORE'?' · 先赶路':' · 先办前一程')}</>:
          members.length?'先点弟子，再点差事牌。':'眼下没有可派工的弟子。'}
        {!actor&&members.length>0&&<span className="hidden lg:inline">也可把弟子拖到差事牌上。</span>}
      </p>
      <div className="grid min-w-0 grid-cols-2 gap-1.5">
        {jobs.map(job=>{
          const candidate=currentPlans.get(job.id),ready=candidate&&candidate.kind!=='blocked';
          const seasonal=festivals.find(festival=>festival.jobId===job.id);
          const currentMarker=activeWalk?.job===job.id?activeWalk:undefined;
          const assigned=members.filter(member=>draftOrders.get(member.id)===job.id);
          return <button key={job.id} type="button" aria-label={job.label} title={candidate?.kind==='blocked'?candidate.reason:job.intent} disabled={blocked}
            aria-disabled={blocked||!jobFocus} data-festival-job={seasonal?.id} data-unavailable={jobFocus&&!ready||undefined} className={`${control} relative break-words px-2 py-1.5 text-left text-sm aria-disabled:opacity-60 ${currentMarker?'pr-10':''}`}
            onDragOver={event=>{if(!blocked&&drag.current?.world===world&&usable(drag.current.actor,job.id)){
              event.preventDefault();event.dataTransfer.dropEffect='move';
            }}} onDrop={event=>drop(event,job.id)} onClick={event=>{if(actor)assign(actor,job.id,event.currentTarget);}}>
            {job.label}
            {seasonal&&<span className="block text-xs text-amber-200">节庆差事</span>}
            {jobFocus&&!ready&&<span className="block text-xs text-slate-400">暂不能领</span>}
            {assigned.length>0&&<span className="block text-xs text-amber-200">{assigned.map(member=>member.name).join('、')}</span>}
            {currentMarker&&<PlanningSprite key={currentMarker.sequence} walk={currentMarker}/>}
          </button>;
        })}
      </div>
      {selectedJob&&<button type="button" className={`${control} mt-2 px-2 text-xs`} disabled={blocked} onClick={undo}>撤回这件差事</button>}
      <p className="my-2 text-xs text-slate-300">已派 {draftOrders.size} 人，{remaining} 人自行安排。</p>
      {notice?.world===world&&<p role="status" className="mb-2 text-sm text-rose-200">{notice.text}</p>}
      <button type="button" className={`${control} w-full px-3 text-sm font-semibold`} disabled={blocked} onClick={()=>void confirm()}>
        {pending===world||committed===world?'晨会已交卷':'开晨会，过一个月'}
      </button>
      {settled.length>0&&<details className="mt-2 rounded-md border border-amber-300/20 px-2">
        <summary className="min-h-11 cursor-pointer content-center text-sm text-amber-100">上月差事 · {settled.length} 件</summary>
        <ul className="space-y-1 pb-2 text-xs text-slate-300">
          {settled.map(row=><li key={row.discipleId}>
            <span className="text-amber-100">{row.name} · {SECT_JOB_DEFINITIONS[row.jobId].label} · {phaseLabel[row.phase]}</span>
            <p>{row.line}</p>
          </li>)}
        </ul>
      </details>}
    </section>
  </div>;
}
