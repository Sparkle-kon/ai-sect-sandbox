import {useEffect,useId,useRef,useState,type RefObject} from 'react';
import {HIGH_DRAMA_PRESETS,highDramaPreset,type HighDramaPreset} from '../engine/highDramaPresetTerms';
import type {BuiltinScenarioPresetId} from '../types/world';

export interface HighDramaPresetPickerProps {
  scopeKey:string;
  revision?:object;
  disabled?:boolean;
  onStart:(id:BuiltinScenarioPresetId,signal?:AbortSignal)=>Promise<boolean>;
}

const focus='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300';
const action=`min-h-11 min-w-0 rounded-lg border border-slate-700 px-3 text-sm text-slate-200 [overflow-wrap:anywhere] disabled:opacity-50 ${focus}`;

export function HighDramaPresetPreview({preset,id,previewHeading,starting=false,failed=false,onConfirm,onReturn}:{
  preset:HighDramaPreset;id:string;previewHeading?:RefObject<HTMLHeadingElement>;starting?:boolean;failed?:boolean;
  onConfirm:()=>void;onReturn:()=>void;
}){
  return <div className="space-y-3" aria-labelledby={`${id}-preview`}>
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wider text-amber-300">先读这一幕</p>
          <h3 id={`${id}-preview`} ref={previewHeading} tabIndex={-1} className="font-serif text-lg font-semibold leading-snug text-amber-50 [overflow-wrap:anywhere]">{preset.title}</h3>
          <p className="text-sm leading-relaxed text-slate-200 [overflow-wrap:anywhere]">{preset.description}</p>
          <p className="text-sm leading-relaxed text-amber-100 [overflow-wrap:anywhere]">{preset.intent}</p>
        </div>
        <p className="text-sm leading-relaxed text-slate-200">这会另开一个世界，替换当前局和分支。想保留旧局，请先导出存档。</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${action} border-amber-300 bg-amber-300 font-semibold text-amber-950`} disabled={starting} onClick={onConfirm}>确认开始新局</button>
          <button type="button" className={action} disabled={starting} onClick={onReturn}>返回剧本列表</button>
        </div>
        {starting&&<p role="status" className="text-sm text-slate-300">正在打开新局…</p>}
        {failed&&<p role="status" className="text-sm text-amber-200">新局未开启。当前局的状态可能已变，请核对后再试。</p>}
      </div>;
}

function PresetPicker({disabled=false,onStart,revision}:Omit<HighDramaPresetPickerProps,'scopeKey'>){
  const id=useId();
  const launcher=useRef<HTMLButtonElement>(null);
  const previewHeading=useRef<HTMLHeadingElement>(null);
  const previousChoice=useRef<BuiltinScenarioPresetId>();
  const previousChoiceButton=useRef<HTMLButtonElement>(null);
  const [opened,setOpened]=useState(false);
  const [review,setReview]=useState<{id:BuiltinScenarioPresetId;revision?:object}>();
  const chosen=review&&review.revision===revision?review.id:undefined;
  const [failed,setFailed]=useState(false);
  const [starting,setStarting]=useState(false);
  const resultEpoch=useRef(0);
  const preset=highDramaPreset(chosen);
  const committing=useRef(false);
  const pending=useRef<AbortController>();

  useEffect(()=>()=>{resultEpoch.current++;pending.current?.abort();},[]);
  useEffect(()=>{
    if(disabled){resultEpoch.current++;pending.current?.abort();setOpened(false);setReview(undefined);setFailed(false);setStarting(false);committing.current=false;}
  },[disabled]);

  useEffect(()=>{
    if(preset)previewHeading.current?.focus();
    else if(opened&&previousChoice.current){previousChoiceButton.current?.focus();previousChoice.current=undefined;}
  },[opened,preset]);

  const close=()=>{
    setOpened(false);setReview(undefined);setFailed(false);previousChoice.current=undefined;
    launcher.current?.focus();
  };
  const confirm=async()=>{
    if(!preset||disabled||committing.current)return;
    const epoch=++resultEpoch.current;
    const request=new AbortController();
    pending.current=request;
    committing.current=true;
    setStarting(true);
    setFailed(false);
    try{
      const started=await onStart(preset.id,request.signal);
      if(resultEpoch.current!==epoch)return;
      if(started){close();return;}
      setFailed(true);
    } catch {if(resultEpoch.current===epoch)setFailed(true);}
    finally {if(pending.current===request)pending.current=undefined;if(resultEpoch.current===epoch){committing.current=false;setStarting(false);}}
  };

  return <section className="min-w-0 border-t border-slate-800 pt-2.5" aria-label="另择开局">
    <button ref={launcher} type="button" aria-expanded={opened&&!disabled} aria-controls={opened&&!disabled?id:undefined}
      disabled={disabled||starting} onClick={()=>opened?close():setOpened(true)}
      className={`${action} border-transparent text-slate-300 hover:bg-slate-900`}>
      {opened&&!disabled?'合上开局卷':'另选开局剧本'}
    </button>
    {opened&&!disabled&&<div id={id} aria-busy={starting} className="mt-2 min-w-0 space-y-3 rounded-xl border border-amber-300/30 bg-gradient-to-b from-amber-950/30 to-slate-950 px-3 py-3 sm:px-4">
       {preset?<HighDramaPresetPreview preset={preset} id={id} previewHeading={previewHeading} starting={starting} failed={failed}
        onConfirm={()=>void confirm()} onReturn={()=>{setReview(undefined);setFailed(false);}}/>:<>
        <h2 className="font-serif text-lg font-semibold text-amber-100">三卷新篇</h2>
        <p className="text-sm leading-relaxed text-slate-300">开局只定局势，主角仍会从故事中走出来。</p>
        <ul className="space-y-2">
          {HIGH_DRAMA_PRESETS.map(item=><li key={item.id}>
            <button ref={previousChoice.current===item.id?previousChoiceButton:undefined} type="button"
              className={`${action} block w-full bg-slate-950/80 py-2 text-left font-medium text-amber-100`}
              onClick={()=>{previousChoice.current=item.id;setReview({id:item.id,revision});setFailed(false);}}>
              {item.title}
            </button>
          </li>)}
        </ul>
      </>}
    </div>}
  </section>;
}

export function HighDramaPresetPicker({scopeKey,...props}:HighDramaPresetPickerProps){
  return <PresetPicker key={scopeKey} {...props}/>;
}
