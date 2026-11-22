import {RING_AUDIENCE_MAX_TURNS,RING_AUDIENCE_MESSAGE_LIMIT,ringAudienceMessage} from '../engine/ringAudienceTerms';
import {useId,useRef,useState} from 'react';
import type {RingAudienceAim,RingAudienceRole,RingAudienceSession,RingAudienceStance,RingAudienceStatus} from '../types/ringAudience';

export interface RingAudienceCursor {sessionId:string;targetId:string;role:RingAudienceRole;expectedTurn:number}
export interface RingAudiencePanelProps {
  role:RingAudienceRole;
  target?:{id:string;name:string};
  aims:readonly RingAudienceAim[];
  session?:RingAudienceSession;
  busy:boolean;
  exchangeCost:number;
  canExchange?:boolean;
  modelReady?:boolean;
  onOpen:(request:{role:RingAudienceRole;targetId:string;aim:RingAudienceAim})=>void;
  onExchange:(request:RingAudienceCursor&{message:string})=>Promise<boolean>|boolean;
  onSeal:(request:RingAudienceCursor)=>void;
  onClose:(request:RingAudienceCursor)=>void;
}
const aimText:Record<RingAudienceAim,string>={leave_sect:'劝其离开宗门',learn_taboo:'问及禁篇',challenge_master:'劝其向掌门问剑'};
const stanceText:Record<RingAudienceStance,string>={steady:'心意未动',wavering:'心意动摇',accepts:'口头应允',rebels:'起了逆意'};
const statusText:Record<RingAudienceStatus,string>={open:'话还没说完',sealed:'已定下约定，尚未践行',declined:'对方已经拒绝',
  closed:'此话已止，未定约',executed:'已见践行',expired:'时机已过，未见践行'};
const executionText:Record<NonNullable<RingAudienceSession['execution']>['effect'],string>={
  left:'此人已离开原宗门。',learned:'此人已习得禁篇。',confronted:'此人已向掌门问剑。此事不等于夺位。',
};
const button='min-h-11 rounded-md border border-violet-500/50 px-3 py-2 text-xs font-medium text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-40';

function AudienceReply({cursor,cost,busy,modelReady,onExchange}:{cursor:RingAudienceCursor;cost:number;busy:boolean;modelReady?:boolean;onExchange:RingAudiencePanelProps['onExchange']}) {
  const label=useId();
  const inFlight=useRef(false);
  const [draft,setDraft]=useState('');
  const [pending,setPending]=useState(false);
  const [failed,setFailed]=useState(false);
  const message=ringAudienceMessage(draft);
  return <form className="space-y-2" onSubmit={async event=>{
    event.preventDefault();
    if(busy||inFlight.current||!message)return;
    inFlight.current=true;
    setPending(true);
    setFailed(false);
    try {
      if(await onExchange({...cursor,message}))setDraft('');
      else setFailed(true);
    } catch {setFailed(true);}
    finally {inFlight.current=false;setPending(false);}
  }}>
    <label className="block text-xs text-violet-100" htmlFor={label}>你想怎么说？</label>
    <textarea id={label} value={draft} onChange={event=>setDraft(event.currentTarget.value)}
      disabled={busy||pending} maxLength={2*RING_AUDIENCE_MESSAGE_LIMIT} rows={2}
      aria-describedby={modelReady?`${label}-notice`:undefined}
      className="min-h-11 w-full min-w-0 resize-y rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"/>
    <p className="text-xs text-slate-400">这段话只用于交谈，不是行动指令。</p>
    {modelReady&&<p id={`${label}-notice`} className="text-xs text-slate-400">本次所言可能发送给已配置的模型，用于润色答话。</p>}
    <button type="submit" className={button} disabled={busy||pending||!message}>{pending?'候答中…':`说出此话（${cost} 神识）`}</button>
    {failed&&<p role="status" className="text-xs text-amber-200">这句话未能记下。请核对此刻的交谈。</p>}
  </form>;
}

export function RingAudiencePanel({role,target,aims,session,busy,exchangeCost,canExchange=true,modelReady,onOpen,onExchange,onSeal,onClose}:RingAudiencePanelProps) {
  const heading=useId();
  if(!target)return null;
  const current=session?.role===role&&session.targetId===target.id?session:undefined;
  if(!current&&!aims.length)return null;
  const title=role==='ring'?'戒中密谈':'天音问心';
  const isOpen=current?.status==='open';
  const cursor:RingAudienceCursor|undefined=current&&{sessionId:current.id,role,targetId:target.id,expectedTurn:current.turns.length};
  return <details aria-labelledby={heading} className="min-w-0 rounded-lg border border-violet-500/30 bg-slate-950/60 px-3">
    <summary id={heading} className="min-h-11 cursor-pointer content-center break-words text-sm font-semibold text-violet-100">{title} · {target.name}</summary>
    <div className="space-y-3 pb-3" aria-busy={busy}>
      {current&&<>
        <p className="break-words text-xs text-slate-300">{aimText[current.aim]} · {statusText[current.status]}</p>
        {current.status!=='executed'&&<div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
          <span>{stanceText[current.stance]}</span>
          <meter aria-label="修士心念动摇" min={0} max={100} value={current.wavering} className="h-2 w-24 accent-violet-400"/>
        </div>}
        {current.execution&&current.status==='executed'&&<p className="break-words text-sm text-emerald-200">{executionText[current.execution.effect]}</p>}
        {!!current.turns.length&&<ol aria-label="此番交谈" className="space-y-2">
          {current.turns.map(turn=><li key={turn.index} className="space-y-1 rounded bg-slate-900 px-2 py-1.5 text-xs leading-relaxed">
            <p className="whitespace-pre-wrap break-words text-slate-300">你：{turn.message}</p>
            <p className="whitespace-pre-wrap break-words text-violet-100">{target.name}：{turn.reply}</p>
          </li>)}
        </ol>}
      </>}
      {isOpen&&cursor&&<>
        {current?.stance!=='accepts'&&(cursor.expectedTurn<RING_AUDIENCE_MAX_TURNS?(canExchange?<AudienceReply key={JSON.stringify(cursor)} cursor={cursor} cost={exchangeCost} busy={busy}
          modelReady={modelReady} onExchange={onExchange}/>:<p className="text-xs text-slate-400">神识不足，暂不能续谈。</p>):<p className="text-xs text-slate-400">此番话已说尽。</p>)}
        <div className="flex flex-wrap gap-2">
          {current?.stance==='accepts'&&<button type="button" className={button} disabled={busy} onClick={()=>onSeal(cursor)}>定下约定</button>}
          <button type="button" className={button} disabled={busy} onClick={()=>onClose(cursor)}>就此收声</button>
        </div>
        {current?.stance==='accepts'&&<p className="text-xs text-slate-400">应允不等于践行。定约后，仍须等人物亲自行动。</p>}
      </>}
      {current?.status==='sealed'&&cursor&&<button type="button" className={button} disabled={busy} onClick={()=>onClose(cursor)}>收回约定</button>}
      {!isOpen&&current?.status!=='sealed'&&!!aims.length&&<div role="group" className="flex flex-wrap gap-2" aria-label="此刻可谈之事">
        {aims.map(aim=><button type="button" key={aim} className={button} disabled={busy} onClick={()=>onOpen({role,targetId:target.id,aim})}>{aimText[aim]}</button>)}
      </div>}
    </div>
  </details>;
}
