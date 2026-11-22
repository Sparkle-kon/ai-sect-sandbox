import {useId,useState} from 'react';
import type {UpperPassageScrollView} from '../engine/upperPassageScroll';
import {UpperPassageScroll} from './UpperPassageScroll';
import type {UpperPassageOption,UpperPassageView} from '../engine/upperPassageEngine';
import {UPPER_PASSAGE_FEE,UPPER_PASSAGE_NODE_NAMES,UPPER_PASSAGE_PATH,UPPER_PASSAGE_RELIEF_PETITION,UPPER_PASSAGE_STANDARD_PETITION,
  upperPassagePlane,type UpperPassageNodeId,type UpperPassageMove} from '../engine/upperPassageTerms';

export interface UpperPassageControls {
  scopeKey:string;revisionKey:object;choices:readonly UpperPassageOption[];
  pending?:UpperPassageMove;disabled?:boolean;
  onQueue:(choice:UpperPassageOption,source:object)=>boolean;
}
export interface UpperPassageHostControls {
  scopeKey:string;revisionKey:object;actorName:string;essenceCost:number;
  disabled?:boolean;onConfirm:(source:object)=>boolean;
}
const button='min-h-11 rounded border border-violet-700/70 bg-slate-950 px-2 text-xs text-slate-100 disabled:opacity-50';
const labels:Record<UpperPassageMove,string>={enter:'踏入下界门槛',advance:'向前走一步',turnback:'沿来路折返',read:'到阵前核水脉',petition:'依阵录投一次议请'};
const moveName=(view:UpperPassageView,move:UpperPassageMove)=>move==='advance'&&view.direction==='inbound'?'沿返路走一步':labels[move];
function blockedMessage(view:UpperPassageView):string|undefined {
  const plane=upperPassagePlane(view.nodeId);
  if(view.blocked==='closed')return plane?'关口眼下不能穿过。人仍在脚下这一处；其他能走的路仍照原处。':
    '这时没有可通行的门扉。此人仍在原井，没有过界。';
  if(view.blocked==='fee'){
    const needed=plane==='upper'?(view.reading?.loss?UPPER_PASSAGE_RELIEF_PETITION:UPPER_PASSAGE_STANDARD_PETITION):UPPER_PASSAGE_FEE;
    return `目前所持不足以实付${plane==='upper'?'议请':'通行'}的 ${needed} 灵石，没有成交。`;
  }
  return view.blocked==='unqualified'?'目前未核得能通行的资格。这不表示人已跨到另一界。':undefined;
}

export function visibleUpperPassageGraph(node:UpperPassageNodeId):readonly UpperPassageNodeId[] {
  const plane=upperPassagePlane(node);
  return plane?UPPER_PASSAGE_PATH.filter(place=>upperPassagePlane(place)===plane):[];
}
export function UpperPassageGraph({node}:{node:UpperPassageNodeId}) {
  const visible=visibleUpperPassageGraph(node);
  if(!visible.length)return null;
  return <ol aria-label="此处眼前可见的路" className="grid min-w-0 gap-1 rounded border border-violet-900/70 p-2">
    {visible.map((place,index)=><li className="flex min-w-0 items-center gap-2 text-xs" key={place} aria-current={place===node?'location':undefined}>
      <span aria-hidden="true" className="shrink-0 font-mono text-violet-300">{index===0?'●':'└'}</span>
      <span className={place===node?'font-semibold text-violet-100':'text-slate-400'}>{UPPER_PASSAGE_NODE_NAMES[place]}</span>
      {place===node&&<span className="rounded border border-violet-800 px-1 text-violet-100">此人所在</span>}
    </li>)}
  </ol>;
}
function PassageFacts({view}:{view:UpperPassageView}) {
  const plane=upperPassagePlane(view.nodeId),upper=plane==='upper',blocked=blockedMessage(view);
  return <div className="space-y-2">
    {plane?<><p>实在位置：{UPPER_PASSAGE_NODE_NAMES[view.nodeId]}。{view.direction==='inbound'?'正沿原路返回。':'尚循前程。'}</p>
      <UpperPassageGraph node={view.nodeId}/>
    </>:<p>此人仍在寒玉井边。只有实际踏入才付通行的 {UPPER_PASSAGE_FEE} 灵石；只是核看并不入门。</p>}
    {plane&&view.entry&&<p>本次入门原账 · 第 {view.entry.enteredTick} 轮实付 {view.entry.paidStones} 灵石；续行或折返不凭这张旧账多扣一笔。</p>}
    {blocked&&<p role="status" className="text-amber-200">{blocked}</p>}
    {upper&&view.reading&&<div className="space-y-1 rounded border border-violet-900/70 p-2">
      <p>上界阵录 · 第 {view.reading.tick} 轮实见：阵纹指回下界寒玉原井和同一条水脉。这是当时核得的来源，不是下界当前水位。</p>
      {view.reading.loss?<p>阵录确有旧田实收凭据。第 {view.reading.loss.harvestedTick} 轮实收 {view.reading.loss.yield} 份，同案有水亏样本；不凭传言认定。</p>:
        <p>这份阵录没有可核的旧田实收亏损凭据；不能从缺卷判断下界没有过损失。</p>}
    </div>}
    {upper&&view.petition&&<p>本人的议请原账 · 第 {view.petition.tick} 轮实付 {view.petition.paidStones} 灵石。
      {view.petition.outcome==='lower_relief'?'因阵录的原实损证据按较低数受理。':'按普通数受理。'}本单没有向下界发钱或退回旧通行费。
    </p>}
    {upper&&view.upperReserve!==undefined&&<p>本界眼前的留存：{view.upperReserve} 灵石。不是下界宗库。</p>}
  </div>;
}
export function reviewedUpperPassage(staged:{choice:UpperPassageOption;revision:object}|undefined,
  revision:object,choices:readonly UpperPassageOption[]) {
  if(!staged||staged.revision!==revision)return;
  const matches=choices.filter(item=>item.upperPassageMove===staged.choice.upperPassageMove&&
    item.targetUpperPassageNodeId===staged.choice.targetUpperPassageNodeId);
  return matches.length===1?matches[0]:undefined;
}
function PassageOrders({controls,view}:{controls:UpperPassageControls;view:UpperPassageView}) {
  const {revisionKey,choices,pending,disabled,onQueue}=controls;
  const [staged,setStaged]=useState<{choice:UpperPassageOption;revision:object}>();
  const [notice,setNotice]=useState('');
  const reviewId=useId(),next=reviewedUpperPassage(staged,revisionKey,choices);
  const reviewText=(move:UpperPassageMove)=>move==='enter'?`实际入门才付 ${UPPER_PASSAGE_FEE} 灵石，下一月还核路和本人资格。`:
    move==='petition'?`预先不付款。按上界已核阵录，有原实据的议请实付 ${UPPER_PASSAGE_RELIEF_PETITION} 灵石，普通议请 ${UPPER_PASSAGE_STANDARD_PETITION} 灵石，以当月核验为准。`:
    move==='read'?'真到了阵前才写新阵录，不把下界传闻当实时见闻。':'真走一步才改位置，不越过眼下不通的石阶。';
  // Keep options physically scoped even if a caller retains an older native response.
  const current=choices.filter(choice=>view.options.some(value=>value.upperPassageMove===choice.upperPassageMove&&
    value.targetUpperPassageNodeId===choice.targetUpperPassageNodeId));
  const allowed=next&&current.includes(next)?next:undefined;
  return <>
    {pending&&<p role="status">已候下月：{moveName(view,pending)}。尚未过界、读阵或付款。</p>}
    {!pending&&current.length>0&&<details>
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-violet-100">准备下一步</summary>
      <div className="flex flex-wrap gap-1">
        {current.map(choice=><button type="button" className={button}
          key={`${choice.upperPassageMove}:${choice.targetUpperPassageNodeId}`} disabled={disabled}
          aria-pressed={choice===allowed} onClick={()=>{setNotice('');setStaged({choice,revision:revisionKey});}}>{moveName(view,choice.upperPassageMove)}</button>)}
      </div>
      {allowed&&!disabled&&<div className="space-y-1 pt-1" role="group" aria-labelledby={reviewId}>
        <p id={reviewId}>{reviewText(allowed.upperPassageMove)}</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={button} onClick={()=>{setNotice(onQueue(allowed,revisionKey)?
            '记作下月打算；没有立刻走动或付账。':'所在处或路况已变，未记下。');setStaged(undefined);}}>记作下月打算</button>
          <button type="button" className={button} onClick={()=>setStaged(undefined)}>先不做</button>
        </div>
      </div>}
    </details>}
    {notice&&<p role="status">{notice}</p>}
  </>;
}

export function UpperPassagePanel({view,controls,host,scroll,scrollScopeKey,animateScroll}:{
  view:UpperPassageView;controls?:UpperPassageControls;host?:UpperPassageHostControls;
  scroll?:UpperPassageScrollView;scrollScopeKey?:string;animateScroll?:boolean;
}) {
  const plane=upperPassagePlane(view.nodeId);
  const matchingScroll=scroll?.nodeId===view.nodeId?scroll:undefined;
  const artwork=matchingScroll&&<UpperPassageScroll key={JSON.stringify([scrollScopeKey,matchingScroll.sourceId,matchingScroll.tick,matchingScroll.kind])}
    view={matchingScroll} animate={animateScroll}/>;
  const returned=matchingScroll?.kind==='returned';
  const body=<div className="space-y-2">
    {!returned&&artwork}
    <PassageFacts view={view}/>
    {plane&&host&&<UpperPassageHost key={host.scopeKey} {...host}/>}
    {controls&&<PassageOrders key={controls.scopeKey} controls={controls} view={view}/>}
  </div>;
  return plane?<section className="min-w-0 space-y-2 rounded border border-violet-800/70 bg-slate-950 p-3 text-sm [overflow-wrap:anywhere]">
    <h2 className="font-semibold text-violet-100">{plane==='upper'?'上界所在':'界隙脚下'}</h2>
    {body}
  </section>:<>
    {returned&&artwork}
    <details className="min-w-0 rounded border border-violet-900/70 bg-slate-950/40 p-2 [overflow-wrap:anywhere]">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-violet-100">看井边门槛</summary>
      {body}
    </details>
  </>;
}


export function UpperPassageHost({revisionKey,actorName,essenceCost,disabled,onConfirm}:UpperPassageHostControls) {
  const [staged,setStaged]=useState<object>(),[notice,setNotice]=useState('');
  const label=useId(),valid=staged===revisionKey;
  return <div className="space-y-1 border-t border-violet-900/70 pt-2">
    {!valid&&<button type="button" className={button} disabled={disabled}
      onClick={()=>{setNotice('');setStaged(revisionKey);}}>核对重新入身</button>}
    {valid&&!disabled&&<div className="space-y-1" role="group" aria-labelledby={label}>
      <p id={label}>按原有元息与冷却规矩，重新入在此处的{actorName}本人。真正附身才扣 {essenceCost} 元息；换掉原有附身及待办，不挪身、不重收通行费。</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={button} onClick={()=>{
          setNotice(onConfirm(revisionKey)?'已入此处的同一人。':'此人、所在处或时机改了，未附身。');setStaged(undefined);
        }}>确认入此身</button>
        <button type="button" className={button} onClick={()=>setStaged(undefined)}>只看不入身</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
  </div>;
}
