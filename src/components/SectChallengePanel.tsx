import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {listSectChallengeDisciples,listSectChallengeTargets} from '../engine/sectChallenges';
import type {SectChallengeIdentity} from '../types/sectChallenge';
import type {WorldState} from '../types/world';
import {createTerrainMapView} from './terrainMapView';
import {projectVisualDuelArena} from './visualDuelArenaModel';
import {VisualDuelArena} from './VisualDuelArena';

export type SectChallengeRequestAction=(expectedWorld:WorldState,discipleId:string,defenderSectId:string)=>Promise<boolean>;
export type SectChallengeAnswerAction=(expectedWorld:WorldState,offerId:string,accept:boolean)=>Promise<boolean>;

const button='inline-flex min-h-11 min-w-0 items-center justify-center rounded-md border border-stone-600 px-3 text-sm text-stone-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-45';
const accent=`${button} border-amber-400/50 bg-amber-950/55 text-amber-100`;
const select='mt-1 block min-h-11 w-full min-w-0 rounded-md border border-stone-700 bg-stone-950 px-2 text-sm text-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300';

function monthName(world:WorldState,tick:number){
  const date=world.year*12+world.month-1+tick-world.tick;
  return date<0?'':`${Math.floor(date/12)} 年 ${date%12+1} 月`;
}
function names(world:WorldState,offer:SectChallengeIdentity){
  const actor=(id:string)=>world.cultivators.find(row=>row.id===id)?.name??'旧名未载';
  const sect=(id:string)=>world.sects.find(row=>row.id===id)?.name??'另一宗门';
  return {challenger:actor(offer.challengerId),defender:actor(offer.defenderId),
    challengerSect:sect(offer.challengerSectId),defenderSect:sect(offer.defenderSectId),
    site:world.locations.find(row=>row.id===offer.siteId)?.name??'约定山门',actor};
}

export function SectChallengePanel({world,busy,onRequest,onAnswer}:{
  world:WorldState;busy:boolean;onRequest?:SectChallengeRequestAction;onAnswer?:SectChallengeAnswerAction;
}){
  const section=useId();
  const [expanded,setExpanded]=useState(false);
  const [discipleId,setDisciple]=useState('');
  const [defenderSectId,setTarget]=useState('');
  const [waiting,setWaiting]=useState(false);
  const [watching,setWatching]=useState<string>();
  const [notice,setNotice]=useState('');
  const inFlight=useRef(false),mounted=useRef(true),current=useRef(world);
  current.current=world;
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  const challenges=world.sectManagement?.challenges;
  const pending=challenges?.pending;
  const latest=challenges?.history.at(-1);
  const duelNames=pending&&names(world,pending);
  const latestNames=latest&&names(world,latest);
  const roster=useMemo(()=>expanded&&!pending?listSectChallengeDisciples(world):[],[expanded,pending,world]);
  const disciple=roster.find(row=>row.id===discipleId);
  const targets=useMemo(()=>disciple?listSectChallengeTargets(world,disciple.id):[],[disciple,world]);
  const target=targets.find(row=>row.sectId===defenderSectId);
  const disabled=busy||waiting;
  const arena=useMemo(()=>latest?.outcome==='completed'?projectVisualDuelArena(world,createTerrainMapView(world,undefined,false),
    {kind:'sect_challenge',eventId:latest.eventId},{historical:latest.resolvedTick!==world.tick}):undefined,[latest,world]);

  async function perform(call:()=>Promise<boolean>,success:string){
    if(disabled||inFlight.current)return;
    const expected=world;
    inFlight.current=true;setWaiting(true);setNotice('');
    try{
      const ok=await call();
      if(!mounted.current)return;
      if(!ok){
        if(current.current===expected)setNotice('这封帖没递成，请再看看山门来帖。');
        return;
      }
      setNotice(success);setExpanded(false);setDisciple('');setTarget('');
    }catch{
      if(mounted.current&&current.current===expected)setNotice('这封帖没递成，请再看看山门来帖。');
    }finally{
      inFlight.current=false;
      if(mounted.current)setWaiting(false);
    }
  }

  return <section aria-label="山门来帖" className="min-w-0 space-y-2 rounded-xl border border-amber-300/25 bg-stone-950/90 p-3">
    <div className="flex flex-wrap items-center justify-between gap-x-2">
      <h2 className="font-serif font-semibold text-amber-100">山门来帖</h2>
      {!pending&&onRequest&&<button type="button" className={button} aria-expanded={expanded} aria-controls={section}
        onClick={()=>{setExpanded(value=>!value);setNotice('');}}>
        {expanded?'收起':'递踢馆帖'}
      </button>}
    </div>
    {pending&&duelNames&&<article className="space-y-1 rounded-md border border-amber-300/25 bg-amber-950/25 p-2.5">
      <h3 className="break-words font-serif text-amber-100">
        {pending.direction==='inbound'?`${duelNames.challengerSect}来帖`:`已向${duelNames.defenderSect}递帖`}
      </h3>
      <p className="break-words text-sm text-stone-200">{duelNames.challenger} 对 {duelNames.defender} · 约在{duelNames.site}</p>
      <p className="text-xs text-stone-300">
        {pending.phase==='traveling'?(
          '两边都应了帖，尚未比试。等到了约定的山门再分高下。'
        ):pending.direction==='inbound'?'对方等候回帖。':'对方尚未回帖。'}
        {world.tick<pending.expiresTick?` 还余 ${pending.expiresTick-world.tick} 月。`:' 帖上期限已到。'}
      </p>
      {pending.direction==='inbound'&&pending.phase==='awaiting_response'&&onAnswer&&<div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className={accent} disabled={disabled||world.tick>=pending.expiresTick}
          onClick={()=>void perform(()=>onAnswer(world,pending.id,true),'已回帖应战，等对方到山门。')}>应战</button>
        <button type="button" className={button} disabled={disabled||world.tick>=pending.expiresTick}
          onClick={()=>void perform(()=>onAnswer(world,pending.id,false),'已回绝来帖。')}>回绝</button>
      </div>}
    </article>}
    {expanded&&!pending&&<div id={section} className="min-w-0">
      {roster.length===0?<p className="text-sm text-stone-300">眼下没有可出门比试的弟子。</p>:
        <form className="space-y-2" onSubmit={event=>{
          event.preventDefault();
          if(disciple&&target&&onRequest)void perform(()=>onRequest(world,disciple.id,target.sectId),'帖子已递出，等对方回话。');
        }}>
          <label className="block text-xs text-stone-300">选出战弟子
            <select value={disciple?.id??''} disabled={disabled} className={select}
              onChange={event=>{setDisciple(event.currentTarget.value);setTarget('');setNotice('');}}>
              <option value="">请选择弟子</option>
              {roster.map(row=><option key={row.id} value={row.id}>{row.name} · {row.realm}</option>)}
            </select>
          </label>
          {disciple&&<label className="block text-xs text-stone-300">向哪个宗门递帖
            <select value={target?.sectId??''} disabled={disabled||targets.length===0} className={select}
              onChange={event=>{setTarget(event.currentTarget.value);setNotice('');}}>
              <option value="">{targets.length?'请选择宗门':'眼下没有可递帖的宗门'}</option>
              {targets.map(row=><option key={row.sectId} value={row.sectId}>{row.sectName}</option>)}
            </select>
          </label>}
          {target&&<p className="break-words text-sm text-stone-200">约在{target.siteName}，请{target.defenderName}应战。等对方应帖，弟子再动身。</p>}
          <button type="submit" className={accent} disabled={!disciple||!target||!onRequest||disabled}>送出踢馆帖</button>
        </form>}
    </div>}
    {latest&&latestNames&&<article aria-label="最近一封踢馆帖" className="space-y-1 rounded-md border border-stone-700 bg-stone-900/70 p-2.5">
      <p className="break-words text-xs text-stone-300">{monthName(world,latest.resolvedTick)} · {latestNames.challengerSect} 对 {latestNames.defenderSect} · {latestNames.site}</p>
      {latest.outcome==='completed'?<>
        <p className="break-words text-sm text-amber-100">{latestNames.actor(latest.winnerId)}胜出。{latestNames.actor(latest.loserId)}受伤，气血 -{latest.injury}。</p>
        {latest.reputationMoved>0&&<p className="text-xs text-stone-300">胜方宗门名望 +{latest.reputationMoved}，败方 -{latest.reputationMoved}。</p>}
        {arena&&<button type="button" className={button} aria-expanded={watching===latest.id}
          onClick={()=>setWatching(value=>value===latest.id?undefined:latest.id)}>{watching===latest.id?'收起斗法':'看斗法'}</button>}
        {arena&&watching===latest.id&&<VisualDuelArena frame={arena}/>}
      </>:<p className="text-sm text-stone-300">{latest.outcome==='refused'?'这封帖已回绝，未有比试。':'帖子过期，未有比试。'}</p>}
    </article>}
    {!pending&&!latest&&!expanded&&<p className="text-xs text-stone-300">山门还没收到战帖，也可让弟子先去递一封。</p>}
    {notice&&<p role="status" className="text-xs text-amber-200">{notice}</p>}
  </section>;
}
