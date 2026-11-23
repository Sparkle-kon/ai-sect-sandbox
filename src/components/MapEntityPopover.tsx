import {SectQuirkBadges} from './SectQuirkBadges';
import {CultivatorPortrait} from './CultivatorPortrait';
import {useEffect,useId,useRef,useState,type CSSProperties} from 'react';
import {Crosshair,Mountain,Sparkles,UserRound,X} from 'lucide-react';
import {AVATAR_MESSAGE_LIMIT} from '../engine/avatarEngine';
import type {MapEntityAction,MapEntityRead} from './mapEntityPopoverModel';

export interface MapEntityPopoverProps {
  data:MapEntityRead;
  anchor:{x:number;y:number};
  pinned:boolean;
  readOnly?:boolean;
  actions:readonly MapEntityAction[];
  onClose:()=>void;
  onFocus:()=>void;
  onOpenCourtyard?:(trigger:HTMLButtonElement)=>void;
  onCommit:(action:MapEntityAction,whisperText?:string)=>boolean;
}

const focus='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200';
const button=`min-h-11 min-w-0 max-w-full rounded-md border border-amber-300/30 bg-slate-950/85 px-2.5 text-xs font-medium text-amber-100 [overflow-wrap:anywhere] hover:bg-amber-950/70 disabled:opacity-50 ${focus}`;
const fairPercent=(value:number)=>Number.isFinite(value)?Math.min(100,Math.max(0,value)):50;
const saneGauge=(value:number)=>Number.isFinite(value)?Math.max(0,value):0;
function cardPosition({x,y}:MapEntityPopoverProps['anchor']) {
  const side=fairPercent(y);
  return {
    '--map-card-left':`clamp(.5rem, ${fairPercent(x)}%, calc(100% - 18.5rem))`,
    '--map-card-top':side<52?`clamp(.5rem, ${side}%, calc(100% - .5rem))`:'auto',
    '--map-card-bottom':side>=52?`clamp(.5rem, ${100-side}%, calc(100% - .5rem))`:'auto',
  } as CSSProperties;
}

export const boundedMapWhisper=(text:string)=>text
  .replace(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu,' ').replace(/\s+/gu,' ').trim()
  .slice(0,AVATAR_MESSAGE_LIMIT).replace(/[\uD800-\uDBFF]$/u,'');
type Reviewed={data:MapEntityRead;action:MapEntityAction};
const mapActionFits=(data:MapEntityRead,action:MapEntityAction)=>data.kind==='site'?action==='treasure':action==='lightning'||action==='whisper';
const actionLabel=(action:MapEntityAction)=>({treasure:'降下机缘',lightning:'降下雷劫',whisper:'神念传音'}[action]);
const actionNote=(action:MapEntityAction)=>({
  treasure:'会即刻在此地降下机缘，可能改变当地灵气和在场修士的际遇。',
  lightning:'会让这名修士即刻遭遇神雷，损失气血。',
  whisper:'会改变这名修士的隐秘目标，不是与对方议事。',
}[action]);
export function reviewMapEntityAction(review:Reviewed|undefined,data:MapEntityRead,actions:readonly MapEntityAction[]){
  if(review?.data!==data||!mapActionFits(data,review.action))return undefined;
  const matches=actions.filter(action=>action===review.action);
  return matches.length===1?matches[0]:undefined;
}

export function MapEntityPopover({data,anchor,pinned,readOnly=false,actions,onClose,onFocus,onOpenCourtyard,onCommit}:MapEntityPopoverProps) {
  const title=useId(),details=useId(),hp=useId(),confirm=useId(),messageId=useId();
  const close=useRef<HTMLButtonElement>(null),messageField=useRef<HTMLTextAreaElement>(null),reviewHeading=useRef<HTMLParagraphElement>(null);
  const [draft,setDraft]=useState<Reviewed>();
  const consumed=useRef<Reviewed>();
  const [message,setMessage]=useState('');
  const [notice,setNotice]=useState<{targetId:string;kind:MapEntityRead['kind'];text:string}>();
  useEffect(()=>{if(pinned)close.current?.focus({preventScroll:true});},[pinned,data.target.id,data.kind]);
  useEffect(()=>{
    if(draft&&(!pinned||readOnly||draft.data!==data)){
      setDraft(undefined);
      setMessage('');
    }
  },[data,draft,pinned,readOnly]);
  const menu=actions.filter(action=>mapActionFits(data,action)&&actions.filter(row=>row===action).length===1);
  const reviewed=pinned&&!readOnly?reviewMapEntityAction(draft,data,menu):undefined;
  const whisper=reviewed==='whisper';
  useEffect(()=>{
    if(!reviewed)return;
    (whisper?messageField.current:reviewHeading.current)?.focus();
  },[reviewed,whisper]);

  const dismissReview=()=>{
    setDraft(undefined);
    setMessage('');
    close.current?.focus({preventScroll:true});
  };

  return <section style={cardPosition(anchor)} aria-labelledby={title} aria-describedby={details}
    onKeyDown={event=>{
      if(!pinned||event.key!=='Escape')return;
      event.preventDefault();event.stopPropagation();
      onClose();
    }}
    className={`absolute inset-x-2 bottom-2 z-20 max-h-[min(42dvh,calc(100%_-_1rem))] min-w-0 space-y-2 overflow-y-auto overscroll-contain
      rounded-xl border border-amber-300/35 bg-slate-950/95 p-3 text-sm text-slate-200 shadow-[0_6px_32px_rgba(0,0,0,0.55)] backdrop-blur
      [overflow-wrap:anywhere] sm:bottom-[var(--map-card-bottom)] sm:left-[var(--map-card-left)] sm:right-auto sm:top-[var(--map-card-top)] sm:w-72
      sm:max-h-[min(46dvh,calc(50%_-_0.5rem))] ${pinned?'pointer-events-auto':'pointer-events-none'}`}>
    <header className="flex items-center gap-2">
      {data.kind==='actor'&&data.portrait&&<CultivatorPortrait portrait={data.portrait} className="h-14 w-12 shrink-0"/>}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-amber-300">
          {data.kind==='actor'?(!data.portrait&&<UserRound aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/>):<Mountain aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/>}
          {data.kind==='actor'?'舆图 · 修士':'舆图 · 山河'}
        </p>
        <h3 id={title} className="mt-0.5 font-serif text-lg font-semibold text-amber-50">{data.name}</h3>
      </div>
      {pinned&&<button ref={close} type="button" className={`${button} flex h-11 w-11 shrink-0 items-center justify-center px-0`}
        aria-label="关闭地图检视卡" onClick={onClose}><X aria-hidden="true" className="h-4 w-4"/></button>}
    </header>
    <div id={details} className="space-y-1.5">
      {data.kind==='actor'?<>
        <p className="text-xs text-slate-200">{data.realm}</p>
        {saneGauge(data.maxHp)>0&&<div className="space-y-0.5">
          <p id={hp} className="text-xs text-slate-300">气血 {Math.min(saneGauge(data.hp),data.maxHp)} / {data.maxHp}</p>
          <meter min={0} max={data.maxHp} value={Math.min(saneGauge(data.hp),data.maxHp)} aria-labelledby={hp}
            className="block h-2 w-full accent-rose-300"/>
        </div>}
        <SectQuirkBadges labels={data.quirkLabels}/>
        {data.actionLabel&&<p className="text-xs text-teal-200">眼下：{data.actionLabel}</p>}
                {(data.monologue||data.persona)&&<div>
          <p className="text-xs text-violet-200">{data.monologue?'仅本人可见 · 心声':'人物演绎 · 并非亲知'}</p>
          <blockquote className="border-l border-amber-400/30 pl-2 font-serif text-sm leading-6 text-slate-300">{data.monologue??data.persona}</blockquote>
        </div>}
      </>:<>
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-300">
          {data.spiritRoot&&<span>灵脉 <strong className="text-amber-100">{data.spiritRoot}</strong></span>}
          <span>灵气 <strong className="text-teal-200">{data.spiritQi}</strong></span>
          {data.population!==undefined&&<span>聚落 {data.population} 人</span>}
          <span>在场修士 {data.residentCount} 人</span>
        </p>
        {data.residents.length>0&&<p className="text-xs text-slate-300">{data.residents.join('、')}
          {data.residentCount>data.residents.length?'等':''}</p>}
        {pinned&&!!data.details?.length&&<details key={data.target.id}
          className="min-w-0 rounded-md border border-slate-800 bg-slate-950/60 px-2">
          <summary className={`min-h-11 cursor-pointer content-center rounded-md text-xs font-semibold text-amber-100 ${focus}`}>此地设施与近况</summary>
          <dl className="space-y-1.5 pb-2 text-xs leading-relaxed text-slate-300">
            {data.details.map(({label,text})=><div key={label} className="min-w-0 border-t border-slate-800 pt-1.5">
              <dt className="font-semibold text-amber-100">{label}</dt><dd>{text}</dd>
            </div>)}
          </dl>
        </details>}
        {data.localFire&&<p className="text-xs leading-relaxed text-amber-100">此处藏经阁火未熄，眼下尚有可行之策。</p>}
        {data.localDispute&&<p className="text-xs leading-relaxed text-amber-100">此地有一纸待核的公开指证。</p>}
        {data.localWitnessFollowup&&<p className="text-xs leading-relaxed text-amber-100">此地旧案已结，还可回看当时的见闻。</p>}
        {data.eventTitles.length>0&&<ul aria-label="此地当月公开见闻" className="list-inside list-disc text-sm leading-6 text-amber-100">
          {data.eventTitles.map((text,index)=><li key={index}>{text}</li>)}
        </ul>}
      </>}
    </div>
    {pinned&&<div className="flex flex-wrap gap-1.5 border-t border-slate-800 pt-2">
      <button type="button" className={`${button} flex items-center gap-1.5`} onClick={onFocus}>
        <Crosshair aria-hidden="true" className="h-4 w-4"/>{data.kind==='actor'?'聚焦追踪':'聚焦此地'}
      </button>
      {data.kind==='site'&&onOpenCourtyard&&<button type="button" className={button}
        onClick={event=>onOpenCourtyard(event.currentTarget)}>本地图景</button>}
      {!readOnly&&menu.map((action,index)=><button type="button" key={index} className={`${button} flex items-center gap-1.5`}
        aria-pressed={reviewed===action} onClick={()=>{setDraft({data,action});setNotice(undefined);setMessage('');}}>
        <Sparkles aria-hidden="true" className="h-3.5 w-3.5"/>{actionLabel(action)}
      </button>)}
    </div>}
    {pinned&&readOnly&&<p className="text-xs text-slate-300">当前视角只读，可聚焦但不能施法。</p>}
    {reviewed&&<form aria-label="确认当前地图对象的操作" className="space-y-1.5 rounded-md border border-amber-500/30 p-2" onSubmit={event=>{
      event.preventDefault();
      const choice=reviewMapEntityAction(draft,data,menu),line=boundedMapWhisper(message);
      if(!draft||consumed.current===draft||!choice||readOnly||!pinned||(choice==='whisper'&&!line))return;
      consumed.current=draft;
      const sent=onCommit(choice,choice==='whisper'?line:undefined);
      setDraft(undefined);setMessage('');
      setNotice({targetId:data.target.id,kind:data.kind,text:sent?(choice==='whisper'?'已施下神念。':'已执行。'):'对象或时机已变，未执行。'});
      close.current?.focus({preventScroll:true});
    }}>
      <p ref={reviewHeading} tabIndex={-1} id={confirm} className="text-xs leading-relaxed">
        {actionLabel(reviewed)}：<strong className="text-amber-100">{data.name}</strong>。{actionNote(reviewed)}
      </p>
      {whisper&&<label htmlFor={messageId} className="grid gap-1 text-xs">
        一句传音
        <textarea ref={messageField} id={messageId} value={message} maxLength={AVATAR_MESSAGE_LIMIT}
          rows={2} onChange={event=>setMessage(event.currentTarget.value)} aria-describedby={confirm}
          className={`min-h-12 w-full min-w-0 rounded-md border border-slate-700 bg-slate-900 p-2 text-base ${focus}`}/>
      </label>}
      <div className="flex flex-wrap gap-1.5">
        <button type="submit" className={button} disabled={whisper&&!boundedMapWhisper(message)} aria-describedby={confirm}>
          {whisper?'确认传音':'确认执行'}
        </button>
        <button type="button" className={button} onClick={dismissReview}>先不做</button>
      </div>
    </form>}
    {pinned&&notice?.targetId===data.target.id&&notice.kind===data.kind&&<p role="status" className="text-xs leading-relaxed text-slate-300">{notice.text}</p>}
  </section>;
}
