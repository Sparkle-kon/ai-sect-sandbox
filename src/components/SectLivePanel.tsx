import {useEffect,useMemo,useRef,useState} from 'react';
import {projectSectLive} from '../engine/sectLive';
import {isSectLiveText,SECT_LIVE_GIFT_COST,SECT_LIVE_GIFT_REPUTATION,SECT_LIVE_PLAYER_LINE_LIMIT,SECT_LIVE_TEXT_LENGTH,
  type SectLiveCommand} from '../types/sectLive';
import type {WorldState} from '../types/world';
import {projectSectLiveScene} from './sectLiveScene';
import {SceneStageCanvas} from './SceneStageCanvas';
import {VisualDuelArena} from './VisualDuelArena';

export type SectLiveAction=(world:WorldState,command:SectLiveCommand)=>Promise<boolean>;

const button='inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-45';

function dateLabel(world:WorldState,tick:number){
  const month=world.year*12+world.month-1+tick-world.tick;
  return month<0?'':`${Math.floor(month/12)} 年 ${month%12+1} 月`;
}

export function SectLivePanel({world,busy,onAction}:{world:WorldState;busy:boolean;onAction?:SectLiveAction}){
  const view=useMemo(()=>projectSectLive(world),[world]);
  const [selectedId,setSelectedId]=useState<string>();
  const selected=view.shows.find(row=>row.show.id===selectedId)??view.shows[0];
  const showId=selected?.show.id;
  const scene=useMemo(()=>selected?projectSectLiveScene(world,selected.show):undefined,[world,selected]);
  const [draft,setDraft]=useState('');
  const [follow,setFollow]=useState(true);
  const [pending,setPending]=useState(false);
  const [notice,setNotice]=useState('');
  const list=useRef<HTMLOListElement>(null);
  const current=useRef({world,showId});
  current.current={world,showId};
  const inFlight=useRef(false);
  const mounted=useRef(true);
  useEffect(()=>{
    mounted.current=true;
    return ()=>{mounted.current=false;};
  },[]);
  const lastId=selected?.lines.at(-1)?.id;
  useEffect(()=>{
    if(follow&&list.current)list.current.scrollTop=list.current.scrollHeight;
  },[follow,showId,lastId]);

  const ready=!busy&&!pending&&!!onAction&&selected?.live===true;
  const words=draft.trim();
  const canWrite=(selected?.show.playerLines?.length??0)<SECT_LIVE_PLAYER_LINE_LIMIT;
  async function send(command:SectLiveCommand){
    if(!ready||!onAction||inFlight.current||command.showId!==showId||
        (command.kind==='gift'?selected?.giftCost!==SECT_LIVE_GIFT_COST:!canWrite||!isSectLiveText(command.text)))return;
    const expected=world;
    inFlight.current=true;
    setPending(true);setNotice('');
    try{
      const ok=await onAction(expected,command);
      if(!mounted.current||current.current.showId!==command.showId)return;
      if(!ok){
        if(current.current.world===expected)setNotice('这次没有送达，请看看是否仍在开播。');
        return;
      }
      if(command.kind==='danmaku')setDraft(value=>value.trim()===command.text?'':value);
      else setNotice('灵石已送到，名望添了一点。');
    }catch{
      if(mounted.current&&current.current.world===expected&&current.current.showId===command.showId)
        setNotice('这次没有送达，请再试一次。');
    }finally{
      inFlight.current=false;
      if(mounted.current)setPending(false);
    }
  }

  if(!selected)return <section aria-label="天机直播间" className="min-w-0">
    <p className="rounded-md bg-stone-900/75 p-3 text-sm text-stone-300">天机阁还没开镜，改日再来瞧。</p>
  </section>;
  return <section aria-label="天机直播间" className="min-w-0 space-y-2">
    {view.shows.length>1&&<label className="block text-xs text-stone-300">
      选一场
      <select value={selected.show.id} className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-stone-700 bg-stone-900 px-2 text-sm text-stone-100"
        onChange={event=>{setSelectedId(event.currentTarget.value);setDraft('');setNotice('');}}>
        {view.shows.map(row=><option key={row.show.id} value={row.show.id}>
          {row.live?'直播':'回放'} · {row.title} · {dateLabel(world,row.show.tick)}
        </option>)}
      </select>
    </label>}
    <header className="flex min-w-0 items-baseline justify-between gap-2">
      <h3 className="min-w-0 break-words font-serif text-sm font-semibold text-amber-100">{selected.title}</h3>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${selected.live?'bg-rose-950 text-rose-200':'bg-stone-800 text-stone-300'}`}>
        {selected.live?'直播中':'旧场回放'}
      </span>
    </header>
    <div className="grid min-w-0 gap-2 min-[1800px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0" aria-label="直播画面" role="group">
        {scene?.kind==='arena'?<VisualDuelArena frame={scene.frame}/>:scene?<SceneStageCanvas frame={scene.frame}/>:
          <p className="rounded-md bg-stone-900/75 p-3 text-sm text-stone-300">画面已收镜，场里的话还留着。</p>}
      </div>
      <div className="min-w-0 rounded-md border border-stone-700 bg-stone-900/70 px-2 pb-2">
        <div className="flex items-center justify-between gap-1">
          <h4 className="font-serif text-xs text-amber-100">弹幕</h4>
          <button type="button" aria-pressed={!follow} className={`${button} text-xs text-stone-300`}
            onClick={()=>setFollow(value=>!value)}>{follow?'暂停滚动':'继续滚动'}</button>
        </div>
        <ol ref={list} aria-label="滚动弹幕" aria-live={follow?'polite':'off'}
          className="max-h-32 min-w-0 space-y-1 overflow-y-auto overscroll-contain pr-1" tabIndex={0}>
          {selected.lines.length===0&&<li className="text-xs text-stone-400">这场还没有人开口。</li>}
          {selected.lines.map(line=><li key={line.id} className="break-words text-xs leading-5 text-stone-200">
            <span className={`font-medium ${line.player?'text-emerald-200':'text-amber-100'}`}>{line.name}：</span>{line.text}
          </li>)}
        </ol>
      </div>
    </div>
    {selected.live&&onAction?<div className="space-y-2">
      {canWrite?<form className="flex min-w-0 flex-wrap items-end gap-1.5" onSubmit={event=>{
        event.preventDefault();
        if(isSectLiveText(words))void send({kind:'danmaku',showId:selected.show.id,text:words});
      }}>
        <label className="min-w-0 grow text-xs text-stone-300">
          发弹幕 · {[...words].length}/{SECT_LIVE_TEXT_LENGTH}
          <input value={draft} disabled={!ready} onChange={event=>setDraft(event.currentTarget.value)}
            className="mt-1 block min-h-11 w-full rounded-md border border-stone-700 bg-stone-950 px-2 text-sm text-stone-100
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"/>
        </label>
        <button type="submit" disabled={!ready||!isSectLiveText(words)} className={`${button} border border-amber-400/50 bg-amber-950/55 text-amber-100`}>
          送出
        </button>
      </form>:<p className="text-xs text-stone-400">这一场的弹幕已经写满。</p>}
      {selected.giftCost===SECT_LIVE_GIFT_COST?<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-300">
        <button type="button" disabled={!ready} className={`${button} border border-amber-400/50 bg-amber-950/55 text-amber-100`}
          onClick={()=>void send({kind:'gift',showId:selected.show.id})}>打赏 {SECT_LIVE_GIFT_COST} 灵石</button>
        <span>从公库支出 · 宗门名望 +{SECT_LIVE_GIFT_REPUTATION}</span>
      </div>:<p className="text-xs text-stone-400">{selected.show.gift?'这场已送过灵石。':
          view.treasury!==undefined&&view.treasury<SECT_LIVE_GIFT_COST?'公库的灵石还不够打赏。':'这场暂不收打赏。'}</p>}
    </div>:<p className="text-xs text-stone-400">{selected.live?'此刻只看画面。':'此场已收镜，可回看，不能发弹幕或打赏。'}</p>}
    {notice&&<p role="status" className="text-xs text-amber-200">{notice}</p>}
  </section>;
}
