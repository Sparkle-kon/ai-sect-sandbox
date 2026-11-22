import {useEffect,useId,useRef,useState} from 'react';
import {Flame,Moon,ScanEye,Scissors} from 'lucide-react';
import type {HeartDemonChoice,HeartDemonFrame} from '../types/heartDemon';

const choices=[
  {id:'sever',name:'斩断尘缘',hint:'不应幻象以减轻心负；割舍这一念也可能折损气运。',Icon:Scissors},
  {id:'wrath',name:'以杀止杀',hint:'若有实据血仇，怒意能助定神；此路也可能加重反噬。',Icon:Flame},
  {id:'face',name:'直面愧疚',hint:'不回避记得的过往。有据可循时，这一念更能稳住心神。',Icon:ScanEye},
] satisfies readonly {id:HeartDemonChoice;name:string;hint:string;Icon:typeof Moon}[];
const focus='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-200';
const action=`min-h-11 min-w-0 rounded-lg border border-violet-300/35 bg-slate-950/70 px-3 py-2 text-left text-sm text-violet-100 hover:bg-violet-950/65 disabled:opacity-50 ${focus}`;

const bondQuestions={
  血仇:'这一剑若只能让恨再活一次，你还愿意出鞘么？',
  道侣:'若踏破此关便能免去离别，你愿拿什么去换？',
  师徒:'若没人再问你这条路对不对，你还敢走下去么？',
  挚友:'若满座皆肯为你喝彩，偏有一人不肯，你便要换一条路么？',
} satisfies Record<Extract<HeartDemonFrame['evidence'],{kind:'bond'}>['role'],string>;
const reflectionQuestions={
  cultivation:'若更高处只容一人立足，你修的究竟是道，还是那一席高处？',
  conflict:'若此间已无胜负可判，你这柄剑还向哪里去？',
  community:'若从此无人记得你曾伸手，那只手还伸不伸出去？',
  heavenly:'若雷声不肯告诉你是非，你还认得自己为何走到这里么？',
} satisfies Record<Extract<HeartDemonFrame['evidence'],{kind:'reflection'}>['theme'],string>;
function heartDemonApparition(evidence:HeartDemonFrame['evidence'],likenessName?:string) {
  if(evidence.kind==='bond'&&likenessName)return {
    figure:`雾里那道影子像极了${likenessName}。眼前只是幻象，并非那人到场。`,
    question:bondQuestions[evidence.role],
  };
  if(evidence.kind==='reflection')return {
    figure:'雾中没有来人。只有一滴檐水，落下去又升回来。',
    question:reflectionQuestions[evidence.theme],
  };
  return {
    figure:'一道影子从积水中坐起，借了你的眉眼，却比你先睁开眼。',
    question:'若把这一身修为都留在倒影里，走出去的那个人，还是你么？',
  };
}

type Result=NonNullable<HeartDemonFrame['result']>;
export function heartDemonOutcomeText(result:Result):string {
  const facts=[
    result.damage>0&&Number.isFinite(result.damage)?`反噬实损 ${result.damage} 点气血`:undefined,
    result.karmaDelta>0?'气运有所增长':result.karmaDelta<0?'气运受损':undefined,
    result.masteryDelta>0?'对所修功法多了一层领悟':result.masteryDelta<0?'对所修功法的领悟受损':undefined,
    result.personalityBefore&&result.personalityAfter&&result.personalityBefore!==result.personalityAfter?
      `性情从${result.personalityBefore}变为${result.personalityAfter}`:undefined,
  ].filter((line):line is string=>!!line);
  if(facts.length>0)return facts.join('；')+'。';
  return '未有另外的损益记入此劫。';
}

export interface HeartDemonTrialTheatreProps {
  frame:HeartDemonFrame;
  actorName:string;
  likenessName?:string;
  guidance?:string;
  busy:boolean;
  onChoose:(choice:HeartDemonChoice)=>boolean;
  onRelease:()=>boolean;
  onAdvance:()=>boolean;
  onContinue:()=>void;
}

export function HeartDemonTrialTheatre({frame,actorName,likenessName,guidance,busy,onChoose,onRelease,onAdvance,onContinue}:HeartDemonTrialTheatreProps){
  const title=useId(),intro=useId(),heading=useRef<HTMLHeadingElement>(null);
  const [message,setMessage]=useState('');
  const result=frame.result;
  const status=result?'result':frame.cancelledTick!==undefined?'cancelled':frame.releasedTick!==undefined?'released':frame.queued?'queued':'choosing';
  const apparition=status==='choosing'?heartDemonApparition(frame.evidence,likenessName):undefined;
  const queued=choices.find(choice=>choice.id===frame.queued?.choice);
  useEffect(()=>{
    setMessage('');
    heading.current?.focus({preventScroll:true});
    heading.current?.scrollIntoView?.({block:'nearest',behavior:'instant'});
  },[frame.id,status]);
  const invoke=(commit:()=>boolean)=>{if(!busy&&!commit())setMessage('原来的时机已变，没有执行。');};
  return <section aria-labelledby={title} className="relative isolate min-w-0 space-y-2.5 overflow-hidden rounded-2xl border
    border-violet-400/35 bg-gradient-to-br from-violet-950/80 via-slate-950 to-slate-950 p-3.5 text-slate-100 [overflow-wrap:anywhere] sm:p-5">
    <div aria-hidden="true" className="pointer-events-none absolute -right-9 -top-14 -z-10 h-44 w-44 rounded-full border border-violet-200/20 shadow-[0_0_3rem_rgba(167,139,250,.18)]"/>
    <header className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs text-violet-200"><Moon size={15} aria-hidden="true" className="shrink-0"/>{actorName} · 劫雷之后</p>
      <h2 id={title} tabIndex={-1} ref={heading} className={`font-serif text-xl font-semibold text-amber-50 sm:text-2xl ${focus}`}>心魔劫</h2>
    </header>
    {apparition&&<>
      <div id={intro} className="space-y-1.5 font-serif text-sm leading-relaxed text-slate-200 sm:text-base">
        {guidance&&<p className="text-sm text-violet-200">{guidance}</p>}
        <p>雷声断了。{apparition.figure}</p>
        <p className="border-l border-violet-400/40 pl-2 text-violet-100"><span className="mr-1 text-xs text-violet-300">幻象质问</span>“{apparition.question}”</p>
      </div>
      <div role="group" aria-label="引导修士如何面对心魔" aria-describedby={intro} className="grid gap-1.5">
        {choices.map(({id,name,hint,Icon})=><button type="button" key={id} disabled={busy}
          className={`${action} min-h-12 w-full`} onClick={event=>{if(event.detail<=1)invoke(()=>onChoose(id));}}
          onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}>
          <span className="flex items-center gap-1.5 font-serif font-semibold"><Icon size={14} aria-hidden="true" className="shrink-0"/>{name}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-300">{hint}</span>
        </button>)}
      </div>
      <button type="button" disabled={busy} className={`${action} w-full border-slate-700 text-slate-300`}
        onClick={event=>{if(event.detail<=1)invoke(onRelease);}}>让此人自行过劫</button>
      <p className="text-xs text-slate-400">交还引导不会替他选路，也不会立刻改变此劫。</p>
    </>}
    {status==='queued'&&queued&&<>
      <p role="status" className="rounded-lg border border-violet-400/30 p-2 text-sm text-violet-100">
        已记下：{queued.name}。心魔仍在，还未见结果。
      </p>
      <button type="button" disabled={busy} className={`${action} min-h-12 w-full text-center font-semibold`}
        onClick={event=>{if(event.detail<=1)invoke(onAdvance);}}
        onKeyDown={event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault();}}>推进一月，面对心魔</button>
    </>}
    {status==='result'&&result&&<div className="rounded-lg border border-violet-400/30 bg-slate-950/65 p-3">
      <p className="font-serif text-lg text-amber-100">{result.outcome==='passed'?'破劫成功':result.outcome==='died'?'未能熬过反噬':'道心未稳，受了反噬'}</p>
      <p className="mt-1 font-serif text-sm leading-relaxed text-slate-200">{heartDemonOutcomeText(result)}</p>
    </div>}
    {status==='cancelled'&&<p className="text-sm text-slate-300">此劫受外力中断，没有执行新的破劫选择。</p>}
    {status==='released'&&<p className="text-sm text-slate-300">引导已经交还，此劫尚无结果。</p>}
    {(status==='result'||status==='cancelled'||status==='released')&&<button type="button" disabled={busy} onClick={onContinue}
      className={`${action} w-full text-center`}>收起这一幕</button>}
    {busy&&<p role="status" className="text-xs text-slate-400">这一幕尚在落定。</p>}
    {message&&<p role="status" className="text-xs text-amber-100">{message}</p>}
  </section>;
}
