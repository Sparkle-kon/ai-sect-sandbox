import {SectQuirkBadges} from './SectQuirkBadges';
import {useEffect,useId,useRef,useState} from 'react';
import {Crosshair,Sparkles} from 'lucide-react';
import {AVATAR_MESSAGE_LIMIT} from '../engine/avatarEngine';
import {CultivatorPortrait} from './CultivatorPortrait';
import {boundedMapWhisper} from './MapEntityPopover';
import type {MapEntityAction,MapEntityTarget} from './mapEntityPopoverModel';
import type {MapSidebarDossierRead} from './mapSidebarDossierModel';

export interface MapSidebarDossierProps {
  data:MapSidebarDossierRead;
  onReadActor?:()=>void;
  onFocus?:()=>void;
  onCommit?:(target:MapEntityTarget,action:MapEntityAction,text?:string)=>boolean;
}
type Choice=MapSidebarDossierRead['actions'][number];
type Draft={data:MapSidebarDossierRead;choice:Choice};
const focus='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200';
const button=`inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-md border border-amber-300/30 bg-slate-950/80 px-2.5 py-1 text-sm font-medium text-amber-100 hover:border-amber-200 disabled:opacity-50 [overflow-wrap:anywhere] ${focus}`;
const actionNames:Record<MapEntityAction,string>={whisper:'神念传音',treasure:'降下机缘',lightning:'降下雷劫'};
const actionNotes:Record<MapEntityAction,string>={
  whisper:'会改变此人的隐秘目标，不是向对方征求同意。',
  treasure:'会当即在此地降下机缘，可能改变当地灵气与在场修士的际遇。',
  lightning:'会使此人当即遭受神雷并损失气血。',
};
const bounded=(value:number,max:number)=>Number.isFinite(value)?Math.min(Math.max(value,0),max):0;
const labelOf=(value:number)=>Number.isInteger(value)?String(value):String(Math.round(value*10)/10);
const sameChoice=(left:Choice,right:Choice)=>left.action===right.action&&left.target.kind===right.target.kind&&left.target.id===right.target.id;
function nameOf(data:MapSidebarDossierRead,choice:Choice){
  if(choice.action==='treasure'){
    const site=data.site;
    return choice.target.kind==='site'&&site?.target.id===choice.target.id?site.name:undefined;
  }
  const actor=data.actor;
  return choice.target.kind==='actor'&&actor?.target.id===choice.target.id?actor.name:undefined;
}

export function reviewedMapSidebarAction(review:Draft|undefined,data:MapSidebarDossierRead):Choice|undefined{
  if(!review||review.data!==data||!nameOf(data,review.choice))return undefined;
  const matches=data.actions.filter(choice=>sameChoice(choice,review.choice));
  return matches.length===1?matches[0]:undefined;
}

function Gauge({label,value,max,suffix,tone}:{label:string;value:number;max:number;suffix?:string;tone:string}){
  const id=useId();
  const actual=bounded(value,max);
  return <div className="space-y-1">
    <p id={id} className="flex justify-between gap-1 text-xs text-slate-300"><span>{label}</span>
      <span className="tabular-nums text-slate-100">{suffix?`${labelOf(actual)}${suffix}`:`${labelOf(actual)} / ${labelOf(max)}`}</span>
    </p>
    <meter min={0} max={max} value={actual} aria-labelledby={id} className={`block h-2.5 w-full ${tone}`}/>
  </div>;
}

export function MapSidebarDossier({data,onReadActor,onFocus,onCommit}:MapSidebarDossierProps){
  const {actor,site}=data;
  const heading=useId(),explanation=useId(),messageId=useId();
  const [draft,setDraft]=useState<Draft>();
  const [message,setMessage]=useState('');
  const [notice,setNotice]=useState<{data:MapSidebarDossierRead;text:string}>();
  const headline=useRef<HTMLParagraphElement>(null),entry=useRef<HTMLTextAreaElement>(null);
  const trigger=useRef<HTMLButtonElement|null>(null);
  const consumed=useRef<Draft>();
  const review=onCommit&&reviewedMapSidebarAction(draft,data);
  const reviewName=review&&nameOf(data,review);
  const whisper=review?.action==='whisper';
  const choices=onCommit?data.actions.filter(item=>nameOf(data,item)&&data.actions.filter(row=>sameChoice(item,row)).length===1):[];
  useEffect(()=>{
    if(draft&&!review){setDraft(undefined);setMessage('');}
  },[draft,review]);
  useEffect(()=>{
    if(review)(whisper?entry.current:headline.current)?.focus({preventScroll:true});
  },[review,whisper]);

  const clear=()=>{
    setDraft(undefined);setMessage('');
    if(trigger.current?.isConnected)trigger.current.focus({preventScroll:true});
  };

  return <aside aria-label="当前修士" aria-labelledby={heading}
    className="xianxia-frame min-w-0 self-start space-y-3 overflow-hidden rounded-xl border border-amber-900/50 bg-gradient-to-br from-amber-950/25 via-slate-950 to-slate-950 p-3.5 text-slate-200 [overflow-wrap:anywhere] sm:p-4">
    <header className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-b border-amber-900/45 pb-2.5">
      <h2 id={heading} className="font-serif text-sm font-semibold tracking-wide text-amber-100">舆图人物</h2>
      <p className="text-xs text-amber-200">{data.leadName?`本卷主角：${data.leadName}`:'尚无主角'}</p>
    </header>
    <div className="flex min-w-0 items-start gap-2.5">
      {actor?.portrait&&<CultivatorPortrait portrait={actor.portrait} className="h-[4.5rem] w-16"/>}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400">当前选中</p>
        <h3 className="font-serif text-xl font-semibold leading-snug text-slate-50">{actor?.name??'未选中可见修士'}</h3>
        {actor&&<p className="mt-1 flex flex-wrap gap-1.5 text-xs">
          <span className="rounded border border-amber-300/30 px-1.5 py-0.5 text-amber-100">{actor.realm}</span>
          {data.sectName&&<span className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-200">{data.sectName}</span>}
        </p>}
        <SectQuirkBadges labels={actor?.quirkLabels}/>
      </div>
    </div>

    {actor&&data.destiny.length>0&&<ul aria-label="已觉醒命格" className="flex flex-wrap gap-1.5 text-xs">
      {data.destiny.map(trait=><li key={trait} className="rounded-md border border-violet-300/25 bg-violet-950/25 px-1.5 py-1 text-violet-100">{trait}</li>)}
    </ul>}
    {actor&&<div className="grid gap-2">
      {Number.isFinite(actor.maxHp)&&actor.maxHp>0&&<Gauge label="气血" value={actor.hp} max={actor.maxHp} tone="accent-rose-300"/>}
      {data.qi!==undefined&&Number.isFinite(data.qi)&&<Gauge label="真气" value={data.qi} max={100} suffix="%" tone="accent-teal-300"/>}
    </div>}
    {actor?.actionLabel&&<p className="text-xs text-teal-200">眼下：{actor.actionLabel}</p>}
    {actor&&(actor.monologue||actor.persona)&&<div className="space-y-1 rounded-lg border border-indigo-400/20 bg-indigo-950/30 p-2.5">
      <p className="text-xs font-semibold text-indigo-200">{actor.monologue?'仅本人可见 · 心声':'人物演绎 · 并非亲知'}</p>
      <blockquote className="font-serif text-sm leading-6 text-slate-100">{actor.monologue??actor.persona}</blockquote>
    </div>}

    {actor&&(data.artifact||data.dao)&&<details className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/70 px-2.5">
      <summary className={`min-h-11 cursor-pointer content-center rounded-md font-serif text-sm font-semibold text-amber-100 ${focus}`}>道途与法宝</summary>
      <dl className="space-y-1.5 pb-2 text-sm text-slate-200">
        {data.artifact&&<div><dt className="text-xs text-slate-400">{data.artifact.bound?'本命法宝':'身携法宝'}</dt>
          <dd>{data.artifact.name}{data.artifact.quality?` · ${data.artifact.quality}`:''}</dd></div>}
        {data.dao&&<div><dt className="text-xs text-slate-400">所行道途</dt>
          <dd>{data.dao.name}{data.dao.rank?` · ${data.dao.rank}`:''}</dd></div>}
      </dl>
    </details>}

    {site&&<section aria-label="所在地见闻" className="space-y-1.5 border-t border-slate-800 pt-2">
      <h4 className="font-serif text-sm font-semibold text-amber-100">{site.name} · 所在地</h4>
      <p className="text-xs leading-relaxed text-slate-300">
        {site.spiritRoot?`灵脉 ${site.spiritRoot} · `:''}灵气 {site.spiritQi}
        {site.population!==undefined?` · 聚落 ${site.population} 人`:''}
      </p>
      {site.eventTitles.length>0&&<ul aria-label="此地当月公开见闻" className="list-inside list-disc space-y-0.5 text-xs leading-relaxed text-slate-200">
        {site.eventTitles.map(title=><li key={title}>{title}</li>)}
      </ul>}
      {!!site.details?.length&&<details className="rounded-md border border-slate-800 px-2">
        <summary className={`min-h-11 cursor-pointer content-center rounded-md text-xs font-medium text-amber-200 ${focus}`}>此地设施与近况</summary>
        <dl className="space-y-1 pb-2 text-xs leading-relaxed">
          {site.details.map(({label,text})=><div key={label}><dt className="inline font-semibold text-slate-200">{label}：</dt>
            <dd className="inline text-slate-300">{text}</dd></div>)}
        </dl>
      </details>}
    </section>}

    {(actor&&(onFocus||onReadActor)||choices.length>0)&&<div role="group" aria-label="舆图快捷操作" className="flex min-w-0 flex-wrap gap-1.5 border-t border-slate-800 pt-2">
      {actor&&onFocus&&<button type="button" className={button} onClick={onFocus}><Crosshair size={14} aria-hidden="true"/>聚焦修士</button>}
      {actor&&onReadActor&&<button type="button" className={button} onClick={onReadActor}>人物详情</button>}
      {choices.map(choice=><button key={choice.action+':'+choice.target.kind+':'+choice.target.id} type="button" className={button}
        aria-pressed={!!review&&sameChoice(choice,review)} onClick={event=>{
          trigger.current=event.currentTarget;setNotice(undefined);setMessage('');setDraft({data,choice});
        }}><Sparkles size={13} aria-hidden="true"/>{actionNames[choice.action]}</button>)}
    </div>}
    {review&&reviewName&&<form aria-label="确认当前舆图操作" className="min-w-0 space-y-2 rounded-md border border-amber-500/30 p-2"
      onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();clear();}}}
      onSubmit={event=>{
        event.preventDefault();
        const choice=reviewedMapSidebarAction(draft,data),line=boundedMapWhisper(message);
        if(!onCommit||!draft||consumed.current===draft||!choice||(choice.action==='whisper'&&!line))return;
        consumed.current=draft;
        const sent=onCommit(choice.target,choice.action,choice.action==='whisper'?line:undefined);
        setNotice({data,text:sent?'已执行。':'对象或时机已变，未执行。'});
        clear();
      }}>
      <p ref={headline} tabIndex={-1} id={explanation} className="text-sm leading-relaxed">
        {actionNames[review.action]}：<strong className="text-amber-100">{reviewName}</strong>。{actionNotes[review.action]}
      </p>
      {whisper&&<label htmlFor={messageId} className="grid gap-1 text-xs text-slate-200">
        一句传音
        <textarea ref={entry} id={messageId} aria-describedby={explanation} rows={2} maxLength={AVATAR_MESSAGE_LIMIT}
          value={message} onChange={event=>setMessage(event.currentTarget.value)}
          className={`min-h-12 w-full min-w-0 rounded-md border border-slate-700 bg-slate-900 p-2 text-base ${focus}`}/>
      </label>}
      <div className="flex flex-wrap gap-1.5">
        <button type="submit" className={button} aria-describedby={explanation} disabled={whisper&&!boundedMapWhisper(message)}>
          {whisper?'确认传音':'确认执行'}
        </button>
        <button type="button" className={button} onClick={clear}>先不做</button>
      </div>
    </form>}
    {notice?.data===data&&<p role="status" className="text-xs text-slate-300">{notice.text}</p>}
  </aside>;
}
