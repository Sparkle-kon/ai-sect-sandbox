import {useEffect,useRef,useState} from 'react';
import {
  listEraCounterpointCandidateTicks,listEraCounterpointTicks,projectEraCounterpoint,verifyEraCounterpoint,type EraCounterpointSide,
} from '../engine/eraCounterpointEngine';
import type {TimelineBranch,WorldTimeline} from '../engine/timelineEngine';

type Verified = ReturnType<typeof projectEraCounterpoint>;
type Layout = Extract<Verified,{ok:true}>;
type NoProof = Extract<Awaited<ReturnType<typeof verifyEraCounterpoint>>,{ok:false}>['reason']
  | Extract<Verified,{ok:false}>['reason'];
const failure:Record<NoProof,string> = {
  same_branch:'必须分别选择自然分支和作者分支。',
  missing_branch:'先前选择的分支已不在保留窗口。',
  not_native:'所选自然分支不属于可核对的自然出身。',
  not_authored:'所选作者分支没有可核查的独立纪元来源。',
  opening_unretained:'作者纪元开局的自然原帧已不在保留窗口，不能证明同源；不会改选其它月份。',
  baseline_mismatch:'保留的自然原帧与作者开局的核验摘要不一致，不能证明同源。',
  invalid_origin:'作者开局的原始出处无法核实。',
  integrity_unavailable:'当前无法完成原始帧核验，不能给出同读结果。',
  aborted:'本次对读已停止，原分支保持不变。',
  stale_proof:'所选分支已经变化，旧核验不再适用。',
  invalid_tick:'所选年月无可核对的保留帧。',
  unaligned_frame:'两支的精确同月帧已不再对齐；不会改用邻近年月。',
};
const format=({year,month}:{year:number;month:number})=>`${year} 年 ${month} 月`;
const button='min-h-11 max-w-full rounded border border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-slate-100 [overflow-wrap:anywhere] disabled:opacity-45';
const field='min-h-11 min-w-0 w-full rounded border border-slate-700 bg-slate-950 px-2 text-base text-slate-100 disabled:opacity-45';
const PROVENANCE={native_snapshot:'已有实录',authored_opening:'作者设定 · 开局生效',played_snapshot:'作者分支开局后的实录'} as const;
const DUTY={observatory:'观象约定',courier:'封信托付',oath:'天道契书',medicine:'用药承诺'} as const;
const DUTY_STATE:Record<string,string>={offered:'待对方回应',active:'尚未结案',open:'尚未结案',pending:'仍待处理',
  in_transit:'仍在路上',returning:'正在退回',arrived:'已到场，尚未交付',retained:'存留待办',recoverable:'尚待取回',
  scheduled:'依约待到场',waiting:'仍待办理',accepted:'已应承，尚未结案'};

export function EraCounterpointUnavailable({reason}:{reason:NoProof}) {
  return <p role="status" className="rounded border border-amber-800/75 p-2 text-amber-200">
    未取得这次对读的证据。{failure[reason]}
  </p>;
}
function SourceStamp({fact,asOf}:{fact:{kind:keyof typeof PROVENANCE;tick:number};asOf:EraCounterpointSide['asOf']}) {
  return <span className="block text-slate-400">{PROVENANCE[fact.kind]} · 第 {fact.tick} 轮{fact.tick===asOf.tick?` · ${format(asOf)}`:''}</span>;
}
function CounterpointSide({side,openingTick}:{side:EraCounterpointSide;openingTick:number}) {
  return <section className="min-w-0 space-y-2 rounded border border-slate-800 bg-slate-950/55 p-2 [overflow-wrap:anywhere]"
    aria-label={side.source==='native'?'自然分支实据':'作者分支实据'}>
    <div>
      <h6 className="font-semibold text-violet-100">{side.source==='native'?'自然分支':'作者分支'} · {side.label}</h6>
      <p>{format(side.asOf)} · 第 {side.asOf.tick} 轮</p>
      <p className="text-slate-400">这条分支最早保留的快照：{format(side.firstRetained)} · 第 {side.firstRetained.tick} 轮</p>
      {side.earliestPublicFact&&<p className="text-slate-400">现有最早公开实录：{format(side.earliestPublicFact)} · 第 {side.earliestPublicFact.tick} 轮</p>}
    </div>
    <div>
      <h6 className="font-semibold">寒玉脉地权</h6>
      {side.north?<div className="space-y-0.5">
        <p>{side.north.name} · {side.north.ownership.kind==='owned'?'归属'+side.north.ownership.sectName:'已核对为无主'}</p>
        <SourceStamp fact={side.north.ownershipEvidence} asOf={side.asOf}/>
        <p>灵气 {side.north.qi}</p><SourceStamp fact={side.north.qiEvidence} asOf={side.asOf}/>
      </div>:<p className="text-slate-400">此视角没有可出示的地权实据。</p>}
    </div>
    <div>
      <h6 className="font-semibold">实际本地村户</h6>
      {side.village?<div className="space-y-0.5">
        <p>{side.village.name} · 实住 {side.village.population} 人</p>
        <p>实记家户 {side.village.householdGroups} 户 · 在册具名居民 {side.village.registeredResidents} 人</p>
        <SourceStamp fact={side.village.populationEvidence} asOf={side.asOf}/>
        <p>承载 {side.village.capacity} 人</p><SourceStamp fact={side.village.capacityEvidence} asOf={side.asOf}/>
      </div>:<p className="text-slate-400">此视角没有在地村户实据。</p>}
    </div>
    <div>
      <h6 className="font-semibold">本人有权知道的未完承诺</h6>
      {side.obligations.length?<ul className="list-inside list-disc space-y-1">
        {side.obligations.map((item,index)=><li key={index}>{DUTY[item.kind]} · {DUTY_STATE[item.status]??'原约仍未结案'}
          <span className="block text-slate-400">{side.source==='native'?'自然实录':item.openedTick>openingTick?'开局后的实录':'开局前已有实录'} · 第 {item.openedTick} 轮登记
            {item.dueTick!==undefined?` · 约至第 ${item.dueTick} 轮`:''}；本帧查验：{format(side.asOf)}</span>
        </li>)}
      </ul>:<p className="text-slate-400">没有可显示的个人承诺实据；不表示此地没有承诺。</p>}
    </div>
  </section>;
}

export function EraCounterpointReading({result}:{result:Layout}) {
  return <div className="min-w-0 space-y-2" aria-label="已核验的同月对读结果">
    <p className="text-emerald-100">已核对作者开局的自然原帧：{format(result.opening)} · 第 {result.opening.tick} 轮。同源只说明开局基准一致，不说明后来事态相同。</p>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
      <CounterpointSide side={result.natural} openingTick={result.opening.tick}/><CounterpointSide side={result.authored} openingTick={result.opening.tick}/>
    </div>
  </div>;
}

type Props={timeline:WorldTimeline;viewerId?:string;scopeKey?:string};
export function EraCounterpointPanel(props:Props) {
  const [open,setOpen]=useState(false);
  const eligible=props.timeline.branches.filter(row=>row.snapshots.length);
  if(!eligible.some(row=>!row.snapshots.at(-1)?.world.authoredEraOrigin)||
    !eligible.some(row=>!row.parentBranchId&&!!row.snapshots.at(-1)?.world.authoredEraOrigin))return null;
  return <details className="min-w-0 space-y-2 rounded border border-slate-800 bg-slate-950/45 p-2 text-xs leading-relaxed text-slate-300"
    onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-violet-100">自然与作者同读</summary>
    {open&&<EraCounterpointForm key={props.scopeKey??'default'} {...props}/>}
  </details>;
}
function BranchPicker({name,rows,value,onPick}:{name:string;rows:readonly TimelineBranch[];value:string;onPick:(id:string)=>void}) {
  const ordinal=rows.findIndex(row=>row.id===value);
  return <label className="grid min-w-0 gap-1">{name}
    <select className={field} value={ordinal<0?'':String(ordinal)} onChange={event=>{
      onPick(rows.find((_,index)=>String(index)===event.currentTarget.value)?.id??'');
    }}>
      <option value="">请选择</option>
      {rows.map((row,index)=><option key={row.id} value={index}>{row.label}</option>)}
    </select>
  </label>;
}
export function EraCounterpointForm({timeline,viewerId,scopeKey}:Props) {
  const [native,setNative]=useState('');
  const [author,setAuthor]=useState('');
  const [tick,setTick]=useState<number>();
  const [active,setActive]=useState<{abort:AbortController;timeline:WorldTimeline;viewerId?:string;scopeKey?:string}>();
  const [result,setResult]=useState<{timeline:WorldTimeline;viewerId?:string;scopeKey?:string;value:Layout|NoProof}>();
  const job=useRef<AbortController>();
  const exact=useRef({timeline,viewerId,scopeKey});
  exact.current={timeline,viewerId,scopeKey};
  const nativeBranches=timeline.branches.filter(row=>{
    const head=row.snapshots.at(-1)?.world;
    return head&&!head.authoredEraOrigin&&!head.scenarioOrigin&&!head.scenarioAudit;
  });
  const authorBranches=timeline.branches.filter(row=>row.snapshots.length&&!row.parentBranchId&&!!row.snapshots.at(-1)?.world.authoredEraOrigin);
  const naturalBranch=nativeBranches.find(row=>row.id===native);
  const authoredBranch=authorBranches.find(row=>row.id===author);
  const candidateTicks=naturalBranch&&authoredBranch?listEraCounterpointCandidateTicks(timeline,native,author):[];
  const reset=()=>{job.current?.abort();job.current=undefined;setActive(undefined);setResult(undefined);};
  useEffect(()=>()=>{job.current?.abort();job.current=undefined;},[timeline,viewerId,scopeKey]);
  const currentResult=result?.timeline===timeline&&result.viewerId===viewerId&&result.scopeKey===scopeKey?result.value:undefined;
  const stopRead=()=>{reset();setResult({timeline,viewerId,scopeKey,value:'aborted'});};
  const pending=!!active&&active.timeline===timeline&&active.viewerId===viewerId&&active.scopeKey===scopeKey&&
    !active.abort.signal.aborted&&job.current===active.abort;
  const run=async()=>{
    if(pending||job.current||!naturalBranch||!authoredBranch||tick===undefined||!candidateTicks.includes(tick))return;
    const snapshot=exact.current;
    const abort=new AbortController();
    job.current=abort;setActive({...snapshot,abort});setResult(undefined);
    const fresh=()=>job.current===abort&&!abort.signal.aborted&&snapshot.timeline===exact.current.timeline&&
      snapshot.viewerId===exact.current.viewerId&&snapshot.scopeKey===exact.current.scopeKey;
    const shown=(value:Layout|NoProof)=>{if(fresh())setResult({timeline,viewerId,scopeKey,value});};
    try{
      const verification=await verifyEraCounterpoint(timeline,native,author,abort.signal);
      if(!fresh())return;
      if(!verification.ok){shown(verification.reason);return;}
      if(!listEraCounterpointTicks(timeline,verification.proof).includes(tick)){shown('unaligned_frame');return;}
      const answer=projectEraCounterpoint(timeline,verification.proof,tick,
        {naturalViewerId:viewerId,authoredViewerId:viewerId});
      shown(answer.ok?answer:answer.reason);
    }catch{shown('integrity_unavailable');}
    finally{if(job.current===abort){job.current=undefined;setActive(undefined);}}
  };
  return <div aria-label="自然与作者同读选项" className="min-w-0 space-y-2">
    <p className="text-slate-400">只读核验两条分支同月的保留快照。不切换分支，不合并账目，也不补推已经遗失的月份。</p>
    {!nativeBranches.length||!authorBranches.length?<p>需同时保有一条自然分支和一条独立作者分支，才能同读。</p>:<>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <BranchPicker name="自然分支" rows={nativeBranches} value={native}
          onPick={id=>{reset();setNative(id);setTick(undefined);}}/>
        <BranchPicker name="独立作者分支" rows={authorBranches} value={author}
          onPick={id=>{reset();setAuthor(id);setTick(undefined);}}/>
      </div>
      <label className="grid min-w-0 gap-1">精确同月
        <select className={field} disabled={!candidateTicks.length}
          value={tick!==undefined&&candidateTicks.includes(tick)?String(tick):''} onChange={event=>{
            reset();setTick(candidateTicks.find(candidate=>String(candidate)===event.currentTarget.value));
          }}>
          <option value="">请选择年月</option>
          {candidateTicks.map(value=>{
            const frame=authoredBranch?.snapshots.find(row=>row.tick===value)?.world;
            return frame?<option key={value} value={value}>{format(frame)} · 第 {value} 轮</option>:null;
          })}
        </select>
      </label>
      {naturalBranch&&authoredBranch&&!candidateTicks.length&&<p className="text-amber-200">
        没有同时保留的精确同月帧，无法出示对读证据。不会另挑最近年份。
      </p>}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={button} disabled={pending||tick===undefined||!candidateTicks.includes(tick)}
          onClick={()=>void run()}>核对这两条分支</button>
        {pending&&<button type="button" className={button} onClick={stopRead}>停止对读</button>}
      </div>
    </>}
    {pending&&<p role="status">正在核对作者开局和保留的自然原帧…</p>}
    {typeof currentResult==='string'?<EraCounterpointUnavailable reason={currentResult}/>:currentResult&&<EraCounterpointReading result={currentResult}/>}
  </div>;
}
