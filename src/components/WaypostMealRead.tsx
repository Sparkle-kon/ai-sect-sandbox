import {useId,useState} from 'react';
import {AVATAR_ORDER_COST} from '../engine/avatarEngine';
import {WAYPOST_MEAL_REST,type WaypostMeal,type WaypostMealOption} from '../types/waypostMeal';
import type {Cultivator,PilgrimageJourney} from '../types/world';

export interface WaypostMealControls {
  scopeKey:string;
  revisionKey:object;
  choices:readonly WaypostMealOption[];
  pending?:WaypostMealOption;
  disabled?:boolean;
  onQueue:(choice:WaypostMealOption,revision:object)=>boolean;
}
type WaypostJourneyView=Pick<PilgrimageJourney,'id'|'status'|'organizerId'|'companionId'>;
const buttons='min-h-11 min-w-0 max-w-full rounded border border-teal-500/40 bg-slate-950 px-2 text-teal-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-amber-300 disabled:opacity-50';
const terms:Record<WaypostMealOption['waypostMealMove'],string>={
  offer:'真正开茶约才封本人 1 株翡翠灵叶。只备茶，不恢复气血，也不赶路。',
  accept:'同在山驿且来客实应，才用这株已封的真叶；各按气血缺口回复，最多 '+WAYPOST_MEAL_REST+' 点。分茶不算赶路。',
  decline:'谢绝这席茶，未用的原叶只退给备茶人。',
  withdraw:'撤下茶约，只收回尚在茶约里的原叶。',
};
const key=(choice:WaypostMealOption)=>JSON.stringify(choice.waypostMealMove==='offer'?
  [choice.action,choice.waypostMealMove,choice.targetCultivatorId]:[choice.action,choice.waypostMealMove,choice.targetWaypostMealId]);
type Stage={choice:WaypostMealOption;revision:object};
export function reviewedWaypostMeal(stage:Stage|undefined,revision:object,menu:readonly WaypostMealOption[]){
  if(!stage||stage.revision!==revision)return undefined;
  const matching=menu.filter(choice=>key(choice)===key(stage.choice));
  return matching.length===1?matching[0]:undefined;
}
function belongs(row:WaypostMeal,journey:WaypostJourneyView,actorId:string){
  return row.hostId===actorId&&row.hostVisit.journeyId===journey.id||
    row.guestId===actorId&&row.guestVisit.journeyId===journey.id;
}
export function scopedWaypostMealMenu(choices:readonly WaypostMealOption[],rows:readonly WaypostMeal[],journey:WaypostJourneyView,actorId:string,tick:number){
  if(journey.status!=='active'||journey.organizerId!==actorId)return [];
  const local=choices.filter(choice=>choice.action==='WAYPOST_MEAL'&&(choice.waypostMealMove==='offer'?
    !rows.some(row=>row.status==='offered'&&row.expiresTick>tick+1)&&choice.targetCultivatorId!==actorId&&choice.targetCultivatorId!==journey.companionId:
    rows.some(row=>row.id===choice.targetWaypostMealId&&belongs(row,journey,actorId)&&row.status==='offered'&&
      row.offeredTick<=tick&&row.expiresTick>tick+1&&(choice.waypostMealMove==='withdraw'?row.hostId===actorId:row.guestId===actorId))));
  return local.filter(row=>local.filter(other=>key(other)===key(row)).length===1);
}
const nameOf=(people:ReadonlyMap<string,string>,id:string)=>people.get(id)?.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/gu,' ').trim().slice(0,50);
function actionName(choice:WaypostMealOption,people:ReadonlyMap<string,string>){
  switch(choice.waypostMealMove){
    case 'offer':return '请'+(nameOf(people,choice.targetCultivatorId)??'此地来客')+'分茶';
    case 'accept':return '应下这席茶';
    case 'decline':return '谢绝这席茶';
    case 'withdraw':return '收回茶约';
  }
}
function Receipt({row,people,actorId,tick}:{row:WaypostMeal;people:ReadonlyMap<string,string>;actorId:string;tick:number}){
  const closed=row.closedTick!==undefined&&row.closedTick<=tick;
  const status=closed?row.status:'offered';
  const party=row.hostId===actorId?'本人备茶，'+(nameOf(people,row.guestId)??'来客')+'受邀。':
    (nameOf(people,row.hostId)??'备茶人')+'备茶，本人受邀。';
  const failed=status==='declined'?'来客谢绝，没有分茶。':status==='withdrawn'?'备茶人收了茶约，没有分茶。':
    status==='missed'?'两路没能在原处相候，没有分茶。':'到了约期仍未应下，没有分茶。';
  return <div className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
    <p>{party}</p>
    {status==='offered'?<p>已封存 1 株翡翠灵叶，等原来客在第 {row.expiresTick} 轮前回应。两人尚未分茶。</p>:
      status==='served'?<><p>茶已分，实用 {row.spentLeaves} 株原封翡翠灵叶；这不算启程。</p>
        {row.recovery?.map(receipt=><p key={receipt.actorId}>{receipt.actorId===actorId?'本人':nameOf(people,receipt.actorId)??'另一人'}
          {receipt.actorId===row.hostId?'（备茶）':'（来客）'}实回 {receipt.afterHp-receipt.beforeHp} 点气血。</p>)}</>:
        <p>{failed}{row.returnedLeaves>0&&<>原封叶未用，实退 {row.returnedLeaves} 株给备茶人。</>}</p>}
  </div>;
}
export function WaypostMealRead({meals,journey,actor,people,tick,controls}:{
  meals:readonly WaypostMeal[];journey:WaypostJourneyView;actor:Cultivator;people:ReadonlyMap<string,string>;tick:number;controls?:WaypostMealControls;
}){
  const [stage,setStage]=useState<Stage>(),[notice,setNotice]=useState('');
  const label=useId();
  const rows=meals.filter(row=>row.offeredTick<=tick&&belongs(row,journey,actor.id)).sort((a,b)=>b.offeredTick-a.offeredTick);
  const menu=scopedWaypostMealMenu(controls?.choices??[],rows,journey,actor.id,tick)
    .filter(choice=>choice.waypostMealMove!=='offer'||Boolean(nameOf(people,choice.targetCultivatorId)));
  const pending=controls?.pending;
  const pendingHere=pending&&(pending.waypostMealMove==='offer'?journey.status==='active'&&journey.organizerId===actor.id&&
    pending.targetCultivatorId!==actor.id&&pending.targetCultivatorId!==journey.companionId:
    rows.some(row=>row.id===pending.targetWaypostMealId));
  const choice=controls&&reviewedWaypostMeal(stage,controls.revisionKey,menu);
  if(!rows.length&&!menu.length&&!pendingHere)return null;
  const latest=rows.find(row=>row.status==='offered')??rows[0];
  const older=rows.filter(row=>row!==latest);
  return <section className="min-w-0 space-y-2 rounded border border-teal-500/25 p-2 [overflow-wrap:anywhere]" aria-label="山驿分茶">
    <h6 className="font-semibold text-teal-100">山驿分茶</h6>
    {latest&&<Receipt row={latest} people={people} actorId={actor.id} tick={tick}/>}
    {pendingHere&&pending&&<p role="status">已候下月：{actionName(pending,people)}。原叶和气血此刻未动。</p>}
    {controls&&!pending&&menu.length>0&&<div className="flex flex-wrap gap-1">
      {menu.map(option=><button key={key(option)} type="button" className={buttons} disabled={controls.disabled}
        aria-pressed={choice===option} onClick={()=>{setStage({choice:option,revision:controls.revisionKey});setNotice('');}}>
        {actionName(option,people)}</button>)}
    </div>}
    {choice&&controls&&!pending&&!controls.disabled&&<div role="group" aria-labelledby={label} className="space-y-1">
      <p id={label}>{terms[choice.waypostMealMove]} 排入只耗 {AVATAR_ORDER_COST} 神识，下月须核对两人确在原处。</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={buttons} onClick={()=>{setNotice(controls.onQueue(choice,controls.revisionKey)?
          '已记下打算，原叶未动。':'人、时机或山驿已变，没有记下。');setStage(undefined);}}>记作下月打算</button>
        <button type="button" className={buttons} onClick={()=>setStage(undefined)}>先不做</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
    {older.length>0&&<details className="rounded border border-slate-800 px-2">
      <summary className="flex min-h-11 cursor-pointer items-center focus-visible:outline focus-visible:outline-amber-300">往日的分茶凭据</summary>
      <div className="space-y-1 pb-2">{older.map(row=><Receipt key={row.id} row={row} people={people} actorId={actor.id} tick={tick}/>)}</div>
    </details>}
  </section>;
}
