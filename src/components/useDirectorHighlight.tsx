import {projectSceneStage,type SceneStageFrame} from './sceneStageModel';
import type {WorldState} from '../types/world';
import {useEffect,useId,useMemo,useRef,useState,type RefObject} from 'react';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {projectDirectorHighlight,resolveDirectorHighlight} from '../engine/director/directorHighlights';
import {isHighlight} from '../engine/director/highlight';

type Sim=ReturnType<typeof useWorldSimulationController>;
type CurrentHighlight=NonNullable<ReturnType<typeof projectDirectorHighlight>>;
type Consequence=CurrentHighlight['options'][number]['consequences'][number];

const consequenceText:Record<Consequence,string>={
  item:'法宝',technique:'功法',bond:'羁绊',injury:'气血',breakthrough:'境界',lifespan:'寿元',reputation:'名望',
  sect:'宗门',sequel:'后续机缘',death_risk:'生死',stones_major:'灵石',
};

export function DirectorHighlightCard({view,actorName,siteName,busy=false,onChoose}:{
  view:CurrentHighlight;
  actorName:string;
  siteName?:string;
  busy?:boolean;
  onChoose:(optionId:string,focused:boolean)=>boolean;
}){
  const heading=useId(),scope=useRef({view,chosen:false});
  if(scope.current.view!==view)scope.current={view,chosen:false};
  const lease=scope.current;
  if(!isHighlight(view))return null;
  return <section aria-labelledby={heading} className="xianxia-frame min-w-0 space-y-2 rounded-xl border border-amber-400/60 bg-slate-950/85 p-3 [overflow-wrap:anywhere]">
    <p className="text-xs text-amber-200">{actorName}{siteName?` · ${siteName}`:''}</p>
    <h3 id={heading} className="font-serif text-lg font-semibold text-amber-50">{view.title}</h3>
    <p className="font-serif text-sm leading-7 text-slate-200">{view.teaser}</p>
    <div role="group" aria-label="这一幕，由你决定" className="grid gap-2 sm:grid-cols-2">
      {view.options.map(option=><button type="button" key={option.id} disabled={busy}
        className="xianxia-control min-h-[44px] min-w-0 rounded-md border border-amber-300/40 px-2 py-1 text-sm text-amber-50
          hover:bg-amber-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-60"
        onClick={event=>{
          if(busy||event.detail>1||scope.current!==lease||lease.chosen)return;
          lease.chosen=true;
          let acquired=false;
          try{acquired=onChoose(option.id,event.currentTarget===document.activeElement);}
          finally{if(!acquired)lease.chosen=false;}
        }}
        onKeyDown={event=>{if(event.repeat&&(event.key==='Enter'||event.key===' '))event.preventDefault();}}>
        {option.label}
        {option.consequences.length>0&&<span className="block text-xs text-amber-200">
          关乎{[...new Set(option.consequences)].map(tag=>consequenceText[tag]).join('、')}
        </span>}
      </button>)}
    </div>
  </section>;
}

export function projectDirectorHighlightStage(world:WorldState,view:CurrentHighlight):SceneStageFrame|undefined{
  const actor=world.cultivators.find(row=>row.id===view.actorId);
  if(!actor||actor.locationId!==view.siteId||view.openedTick!==world.tick)return;
  const admitted=projectDirectorHighlight(world,actor);
  if(!admitted||admitted.kind!==view.kind||admitted.sourceId!==view.sourceId||admitted.siteId!==view.siteId)return;
  const frame=projectSceneStage(world,{viewer:actor,localSceneActor:actor});
  return frame.siteId===view.siteId&&frame.cast[0]?.id===actor.id?frame:undefined;
}

export function useDirectorHighlight(sim:Sim,active:boolean,blocked:boolean,surface:'story'|'cockpit',
  returnFocus:RefObject<HTMLElement>){
  const {world,timeline,preview,saveContextVersion,isRunning,setIsRunning}=sim;
  const revision=saveContextVersion.current,branchId=timeline.activeBranchId;
  const visible=active&&!preview&&!blocked;
  const scope=useRef({visible,surface,stamp:0});
  if(scope.current.visible!==visible||scope.current.surface!==surface)scope.current={visible,surface,stamp:scope.current.stamp+1};
  const stamp=scope.current.stamp;
  const view=useMemo(()=>{
    const candidate=visible?projectDirectorHighlight(world):undefined;
    return candidate&&isHighlight(candidate)?candidate:undefined;
  },[world,visible]);
  const stage=useMemo(()=>view?projectDirectorHighlightStage(world,view):undefined,[world,view]);
  const outcome=useRef<{world:typeof world;stamp:number;focused:boolean;message:string}>();
  const [failure,setFailure]=useState<typeof world>();
  const lastPause=useRef<{branchId:string;revision:number;key:string}>();
  const key=view&&`${view.kind}:${view.sourceId}:${view.openedTick}`;

  useEffect(()=>{
    if(!key||!isRunning)return;
    const previous=lastPause.current;
    if(previous?.branchId===branchId&&previous.revision===revision&&previous.key===key)return;
    lastPause.current={branchId,revision,key};
    setIsRunning(false);
  },[branchId,revision,key,isRunning,setIsRunning]);

  useEffect(()=>{
    const settled=outcome.current;
    if(settled?.world===world&&settled.stamp===stamp&&settled.focused&&document.activeElement===document.body)
      returnFocus.current?.focus({preventScroll:true});
  },[world,stamp,returnFocus]);

  const result=visible&&outcome.current?.world===world&&outcome.current.stamp===stamp?outcome.current:undefined;
  if(result&&!view)return {card:<p role="status" className="rounded-md border border-teal-400/30 p-2 text-sm text-teal-100">{result.message}</p>};
  if(!view)return undefined;
  const actor=world.cultivators.find(row=>row.id===view.actorId);
  const siteName=world.locations.find(row=>row.id===view.siteId)?.name;
  if(!actor)return undefined;
  const busy=isRunning||sim.isStepping||sim.fastForwardLocked;
  const choose=(optionId:string,focused:boolean):boolean=>{
    if(busy||scope.current.stamp!==stamp||!scope.current.visible||sim.history.current!==timeline||
      !sim.canUseSaveContext(world,revision)||sim.fastForwardRun.current||sim.campaignGuard.current||
      !view.options.some(option=>option.id===optionId))return false;
    const next=resolveDirectorHighlight(world,view.key,optionId);
    if(next===world){setFailure(world);return false;}
    const pending=next.storyteller?.pendingHighlightChoice;
    const queued=pending?.optionId===optionId&&pending.key.sourceId===view.sourceId&&pending.key.openedTick===view.openedTick;
    outcome.current={world:next,stamp,focused,message:queued?'已作出选择。下个月，再看这一步会走到哪里。':'这一回，你已作出选择。'};
    if(sim.updateWorld(current=>current===world?next:current)!==next){outcome.current=undefined;return false;}
    setFailure(undefined);
    return true;
  };
  return {stage,card:<>
    <DirectorHighlightCard view={view} actorName={actor.name} siteName={siteName} busy={busy} onChoose={choose}/>
    {failure===world&&<p role="status" className="text-xs text-amber-200">眼下未能成事，请另选一条路。</p>}
  </>};
}
