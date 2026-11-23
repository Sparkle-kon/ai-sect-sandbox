import {useEffect,useId,useRef,useState,type RefObject} from 'react';
import type {StoryRecapView} from '../engine/storyRecap';
import type {WorldState} from '../types/world';
import {captureRecapReturn,focusRecapReaderHeading,restoreRecapReturn,sameRecapReader,
  type RecapReaderBinding,type RecapReturnPosition} from './chronicleRecapPosition';

interface RecapProps {
  recap?:StoryRecapView;
  loadRecap?:()=>Promise<StoryRecapView|undefined>;
  readerRef:RefObject<HTMLElement>;
  world:WorldState;
  chapterId:string;
  scopeKey?:string;
  viewerId?:string;
}
const button='min-h-11 rounded px-2 text-sm font-medium text-amber-100 hover:bg-amber-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200';

export function ChronicleRecapControls({recap,loadRecap,readerRef,world,chapterId,scopeKey,viewerId}:RecapProps) {
  const [origin,setOrigin]=useState<RecapReturnPosition>();
  const request=useRef<RecapReturnPosition>();
  const [loaded,setLoaded]=useState<{origin:RecapReturnPosition;recap?:StoryRecapView;failed?:true}>();
  const pointerOrigin=useRef<RecapReturnPosition>();
  const dialog=useRef<HTMLDialogElement>(null),title=useRef<HTMLHeadingElement>(null);
  const titleId=useId(),dialogId=useId();
  const binding:RecapReaderBinding={world,chapterId,scopeKey,viewerId};
  const current=useRef(binding);
  current.current=binding;
  const open=!!origin&&!!(loadRecap||recap?.rows.length)&&readerRef.current===origin.reader&&sameRecapReader(origin.binding,binding);
  const effective=loadRecap?(loaded?.origin===origin?loaded?.recap:undefined):recap;
  useEffect(()=>()=>{request.current=undefined;},[]);

  useEffect(()=>{
    if(origin&&!open){
      request.current=undefined;
      setLoaded(undefined);
      setOrigin(undefined);
      if(!loadRecap)focusRecapReaderHeading(readerRef.current);
    }
  },[open,origin,readerRef,loadRecap]);

  useEffect(()=>{
    if(!open||!dialog.current)return;
    const element=dialog.current;
    if(!element.open&&typeof element.showModal==='function')element.showModal();
    title.current?.focus({preventScroll:true});
  },[open]);

  const close=()=>{
    if(!origin)return;
    const here=readerRef.current;
    if(dialog.current?.open)dialog.current.close();
    request.current=undefined;
    setLoaded(undefined);
    setOrigin(undefined);
    if(!here||!restoreRecapReturn(origin,here,current.current))focusRecapReaderHeading(here);
  };

  if(!loadRecap&&!recap?.rows.length)return null;
  return <>
    <button type="button" aria-haspopup="dialog" aria-controls={open?dialogId:undefined} className={button}
      onPointerDown={event=>{
        pointerOrigin.current=undefined;
        const reader=readerRef.current;
        if(!event.isPrimary||event.button!==0||!reader?.isConnected)return;
        pointerOrigin.current=captureRecapReturn(reader,binding,event.currentTarget);
      }}
      onPointerCancel={()=>{pointerOrigin.current=undefined;}}
      onClick={event=>{
        const reader=readerRef.current;
        const beforePointer=event.detail>0?pointerOrigin.current:undefined;
        pointerOrigin.current=undefined;
        if(event.detail>1||request.current||!reader?.isConnected||!sameRecapReader(binding,current.current))return;
        const next=beforePointer?.reader===reader&&sameRecapReader(beforePointer.binding,binding)?
          beforePointer:captureRecapReturn(reader,binding,event.currentTarget);
        request.current=next;
        setOrigin(next);
        if(loadRecap){
          const isCurrent=()=>request.current===next&&readerRef.current===reader&&reader.isConnected&&sameRecapReader(binding,current.current);
          void Promise.resolve().then(()=>isCurrent()?loadRecap():undefined).then(value=>{
            if(isCurrent())setLoaded({origin:next,recap:value});
          }).catch(()=>{if(isCurrent())setLoaded({origin:next,failed:true});});
        }
      }}>本卷小回顾</button>
    {open&&<dialog id={dialogId} ref={dialog} aria-labelledby={titleId}
      className="xianxia-frame xianxia-dialog m-auto max-h-[min(82dvh,40rem)] w-[calc(100%_-_1.5rem)] max-w-xl overflow-auto rounded-xl border border-amber-200/30 bg-slate-950 p-3 text-slate-100 backdrop:bg-slate-950/80 sm:p-4"
      onCancel={event=>{event.preventDefault();close();}}>
      <header className="mb-2 flex flex-wrap items-center justify-between gap-x-2">
        <h4 id={titleId} ref={title} tabIndex={-1} className="font-serif text-base font-semibold text-amber-100 outline-none">本卷小回顾</h4>
        <button type="button" className={button} onClick={close}>返回原处</button>
      </header>
      {effective?.rows.length?<ol className="space-y-3 px-1 font-serif text-sm leading-relaxed">
        {effective.rows.map((row,index)=><li key={index} className="break-words">
          <h5 className="font-semibold text-amber-100">{row.title}</h5>
          <p className="mt-0.5 whitespace-pre-wrap text-slate-200">{row.paragraph}</p>
        </li>)}
      </ol>:<p role="status" className="text-sm text-slate-300">{loaded?.origin===origin?
        loaded?.failed?'本卷暂未读出，请稍后再试。':'当前没有可回顾的见闻。':'正在翻阅本卷…'}</p>}
    </dialog>}
  </>;
}
