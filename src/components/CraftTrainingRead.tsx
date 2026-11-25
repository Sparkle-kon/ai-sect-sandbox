import {useId,useState} from 'react';
import {AVATAR_ORDER_COST} from '../engine/avatarEngine';
import {craftTrainingCosts,type CraftTrainingOption} from '../engine/craftTrainingEngine';
import type {CraftTrainingProject} from '../types/craftTraining';
import type {Cultivator,WorldState} from '../types/world';

export interface CraftTrainingControls {
  scopeKey:string;
  revisionKey:object;
  choices:readonly CraftTrainingOption[];
  pending?:CraftTrainingOption;
  disabled?:boolean;
  onQueue:(choice:CraftTrainingOption,revision:object)=>boolean;
}
type Offer=Extract<CraftTrainingOption,{craftTrainingMove:'offer'}>;
type Stage={choice:CraftTrainingOption;revision:object};
const entry='min-h-11 min-w-0 max-w-full rounded border border-amber-500/40 bg-slate-950 px-2 text-amber-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-amber-300 disabled:opacity-50';
const summary='flex min-h-11 cursor-pointer items-center font-semibold text-amber-100 focus-visible:outline focus-visible:outline-amber-300';
const names:Record<CraftTrainingOption['craftTrainingMove'],string>={
  offer:'请两人合练',join:'应下本人工序',decline:'谢绝合练',blank:'亲手铸坯',finish:'接原坯完工',withdraw:'退出合练',
};
const key=(choice:CraftTrainingOption)=>JSON.stringify(choice.craftTrainingMove==='offer'?
  [choice.action,choice.craftTrainingMove,choice.targetCultivatorId,choice.targetCraftTraineeId]:
  [choice.action,choice.craftTrainingMove,choice.targetCraftTrainingId]);
const isOffer=(choice:CraftTrainingOption):choice is Offer=>choice.craftTrainingMove==='offer';
function uniqueChoices(choices:readonly CraftTrainingOption[]){
  const counts=new Map<string,number>();
  for(const choice of choices){const k=key(choice);counts.set(k,(counts.get(k)??0)+1);}
  return choices.filter(choice=>counts.get(key(choice))===1);
}
export function reviewedCraftTraining(stage:Stage|undefined,revision:object,menu:readonly CraftTrainingOption[]){
  if(!stage||stage.revision!==revision)return undefined;
  const values=menu.filter(choice=>key(choice)===key(stage.choice));
  return values.length===1?values[0]:undefined;
}
const visibleName=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id)?.name
  .replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/gu,' ').trim().slice(0,50);
const open=(row:CraftTrainingProject)=>row.status==='offered'||row.status==='funded'||row.status==='blank';
function ownAction(row:CraftTrainingProject,actor:Cultivator,choice:CraftTrainingOption){
  if(isOffer(choice)||choice.targetCraftTrainingId!==row.id)return false;
  const [first,second]=row.traineeIds;
  switch(choice.craftTrainingMove){
    case 'join':return row.status==='offered'&&(actor.id===first&&row.firstJoinedTick===undefined||actor.id===second&&row.secondJoinedTick===undefined);
    case 'decline':return row.status==='offered'&&(actor.id===first&&row.firstJoinedTick===undefined||actor.id===second&&row.secondJoinedTick===undefined);
    case 'blank':return row.status==='funded'&&actor.id===first;
    case 'finish':return row.status==='blank'&&actor.id===second;
    case 'withdraw':return open(row)&&(actor.id===row.keeperId||actor.id===first||actor.id===second);
  }
}
function OfferPicker({world,choices,disabled,onChoose}:{world:WorldState;choices:readonly Offer[];disabled?:boolean;onChoose:(choice:Offer)=>void}){
  const [firstId,setFirst]=useState<string>(),[otherId,setOther]=useState<string>();
  const active=choices.filter(row=>row.targetCultivatorId!==row.targetCraftTraineeId&&
    Boolean(visibleName(world,row.targetCultivatorId))&&Boolean(visibleName(world,row.targetCraftTraineeId)));
  const firsts=[...new Set(active.map(row=>row.targetCultivatorId))];
  const first=firstId&&firsts.includes(firstId)?firstId:undefined;
  const seconds=first?active.filter(row=>row.targetCultivatorId===first).map(row=>row.targetCraftTraineeId):[];
  const second=otherId&&seconds.includes(otherId)?otherId:undefined;
  const chosen=active.find(row=>row.targetCultivatorId===first&&row.targetCraftTraineeId===second);
  if(!active.length)return null;
  const select=(label:string,list:readonly string[],id:string|undefined,onChange:(id:string|undefined)=>void)=><label className="grid min-w-0 gap-1">
    {label}
    <select className={entry+' w-full'} value={id?String(list.indexOf(id)):''} disabled={disabled||!list.length}
      onChange={event=>onChange(list.find((_,index)=>String(index)===event.currentTarget.value))}>
      <option value="">请选择</option>
      {list.map((candidate,i)=>{
        const name=visibleName(world,candidate);
        const repeated=list.some(other=>other!==candidate&&visibleName(world,other)===name);
        return <option key={candidate} value={i}>{name}{repeated&&'（同名 '+(i+1)+'）'}</option>;
      })}
    </select>
  </label>;
  return <div className="space-y-2">
    <p>一份实料做一方坯，两名学员各认一道工序，不替对方落名。</p>
    <div className="grid min-w-0 grid-cols-2 gap-1.5">
      {select('先铸坯',firsts,first,id=>{setFirst(id);setOther(undefined);})}
      {select('后完工',seconds,second,setOther)}
    </div>
    {chosen&&<button type="button" className={entry} disabled={disabled} onClick={()=>onChoose(chosen)}>{names.offer}</button>}
  </div>;
}
function quote(choice:CraftTrainingOption){
  const {stones,roots,blankStones,finishStones}=craftTrainingCosts();
  switch(choice.craftTrainingMove){
    case 'offer':return '点定先铸坯和后完工的两位学员，各人还须亲自应下。只发约，不开炉。';
    case 'join':return '两位都实应后才封存掌坊人 '+stones+' 灵石和 '+roots+' 株玄土根；学成另有考校。';
    case 'decline':return '谢绝接这道工序，不记学成，也不生器物。';
    case 'blank':return '真铸这一方坯才用托管 '+blankStones+' 灵石和 1 株玄土根；只记当场实作。';
    case 'finish':return '以同一方坯完工，实际耗托管 '+finishStones+' 灵石和 1 株玄土根；验质后才知能否得器。';
    case 'withdraw':return '停下未作的工序，只按真账退未耗的余料；已做所得按实保留。';
  }
}
function ProjectRead({world,row}:{world:WorldState;row:CraftTrainingProject}){
  const [first,second]=row.traineeIds;
  const closed:Partial<Record<CraftTrainingProject['status'],string>>={
    declined:'已有学员谢绝，没有替他落名。',withdrawn:'有人退出，未作的工序不再补记。',
    expired:'合练到期，没做的依旧没做。',unavailable:'原人或原炉不能继续，未作工序不记。',
  };
  const named=(id:string)=>visibleName(world,id)??'原署名未详';
  const finish=row.finish?.actorId===second&&row.finish.blankId===row.blank?.id?row.finish:undefined;
  const ready=row.status==='offered'?'应约还没齐，尚未开炉。':row.status==='funded'?'两人已亲自应下，已实封托管，尚未成坯。':
    row.status==='blank'?'已实成一方坯，等第二位接这方原坯。':row.status==='completed'?(finish?.artifactId?'两道工序均已实作。器物已实际交付给掌坊人。':'两道工序均已实作，暂未见器物交付凭据。'):
    row.status==='failed'?'完工后没达到成器门槛，不凭空添器。':closed[row.status];
  return <div className="min-w-0 space-y-1.5 rounded border border-slate-800 p-2">
    <p className="text-amber-100">{world.locations.find(site=>site.id===row.siteId)?.name??'原工坊'} · {named(row.keeperId)}掌炉</p>
    <p>{named(first)}铸坯：{row.firstJoinedTick!==undefined?'已应约':'未应约'}。{named(second)}接炉：{row.secondJoinedTick!==undefined?'已应约':'未应约'}。</p>
    <p>{ready}</p>
    {(row.escrowStones>0||row.escrowRoots>0)&&<p>当前实存托管：{row.escrowStones} 灵石、{row.escrowRoots} 株玄土根。</p>}
    {(row.refundedStones>0||row.refundedRoots>0)&&<p>只实退原掌坊人未耗的 {row.refundedStones} 灵石、{row.refundedRoots} 株玄土根。</p>}
    {([['铸坯',row.blank,first],['完工',finish,second]] as const).map(([label,receipt,id])=>receipt?.actorId===id?
      <p key={label}>{named(id)}实作{label}，耗 {receipt.stonesUsed} 灵石、{receipt.rootsUsed} 株玄土根。
        {receipt.masteryAfter>receipt.masteryBefore?
          ' 本人技艺实长 '+(receipt.masteryAfter-receipt.masteryBefore)+' 点。':' 本次未另增技艺。'}</p>:null)}
    {finish&&<p className="text-slate-300">实际验质：{finish.grade==='fine'?'精良':finish.grade==='standard'?'合格':'未成器'}，实测 {finish.qualityScore} 分。</p>}
  </div>;
}
export function CraftTrainingRead({world,viewer,rows,controls}:{world:WorldState;viewer:Cultivator;rows:readonly CraftTrainingProject[];controls?:CraftTrainingControls}){
  const [stage,setStage]=useState<Stage>(),[notice,setNotice]=useState('');
  const label=useId();
  const current=[...rows].filter(row=>row.keeperId===viewer.id||row.traineeIds.includes(viewer.id)).sort((a,b)=>b.offeredTick-a.offeredTick);
  const pending=controls?.pending;
  const menu=uniqueChoices(controls?.choices??[]).filter(option=>option.action==='CRAFT_TRAINING'&&
    (isOffer(option)||current.some(row=>ownAction(row,viewer,option))));
  if(!current.length&&!pending&&!menu.length)return null;
  const focused=current.find(open)??current[0],others=current.filter(row=>row!==focused);
  const selected=controls&&reviewedCraftTraining(stage,controls.revisionKey,menu);
  const choose=(choice:CraftTrainingOption)=>{if(controls){setStage({choice,revision:controls.revisionKey});setNotice('');}};
  const actions=(row:CraftTrainingProject)=>!pending&&menu.filter(choice=>ownAction(row,viewer,choice)).map(choice=>
    <button type="button" key={key(choice)} className={entry} disabled={controls?.disabled} aria-pressed={selected===choice}
      onClick={()=>choose(choice)}>{names[choice.craftTrainingMove]}</button>);
  return <details className="min-w-0 space-y-2 rounded border border-amber-500/30 bg-slate-950 px-2 pb-2 [overflow-wrap:anywhere]">
    <summary className={summary}>合练铸坯</summary>
    {focused&&<section className="space-y-1"><ProjectRead world={world} row={focused}/><div className="flex flex-wrap gap-1">{actions(focused)}</div></section>}
    {!pending&&<OfferPicker key={controls?.scopeKey} world={world} choices={menu.filter(isOffer)} onChoose={choose} disabled={controls?.disabled}/>}
    {pending&&<p role="status">已候下月：{names[pending.craftTrainingMove]}。资材与工序此刻未动。</p>}
    {selected&&controls&&!controls.disabled&&!pending&&<div role="group" aria-labelledby={label} className="space-y-1 rounded border border-slate-800 p-2">
      <p id={label}>{quote(selected)} 排入只耗 {AVATAR_ORDER_COST} 神识，下月仍须核对炉、原料和署名本人。</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={entry} onClick={()=>{setNotice(controls.onQueue(selected,controls.revisionKey)?
          '已记下打算，资材未动。':'人、炉或时机已变，没有记下。');setStage(undefined);}}>记作下月打算</button>
        <button type="button" className={entry} onClick={()=>setStage(undefined)}>先不做</button>
      </div>
    </div>}
    {notice&&<p role="status">{notice}</p>}
    {others.length>0&&<details className="rounded border border-slate-800 px-2">
      <summary className={summary}>往日合练实录</summary>
      <div className="space-y-1 pb-2">{others.map(row=><section key={row.id} className="space-y-1">
        <ProjectRead world={world} row={row}/><div className="flex flex-wrap gap-1">{actions(row)}</div>
      </section>)}</div>
    </details>}
  </details>;
}
