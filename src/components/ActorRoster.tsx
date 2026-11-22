import {useId,useMemo,useState} from 'react';
import {CultivatorPortrait} from './CultivatorPortrait';
import {projectCultivatorPortrait} from './cultivatorPortraitModel';
import {useViewportAtLeast} from './useViewportAtLeast';
import type {Cultivator,WorldState} from '../types/world';
import {createActorRosterIndex,pageActorRoster,partitionActorRosterPage,rosterActorDisambiguator,selectActorRoster,type RosterStatus}
  from './actorRosterIndex';
export {ACTOR_PAGE_SIZE,getActorRosterPage,type RosterStatus} from './actorRosterIndex';

import type {ActorRosterScene} from './rosterStoryRead';
export type {ActorRosterScene} from './rosterStoryRead';
export interface ActorRosterProps {
  world:WorldState;
  selected?:Cultivator;
  onSelect:(id:string)=>void;
  dismissOnSelect?:boolean;
  desktopOpen?:boolean;
  onDesktopOpenChange?:(open:boolean)=>void;
  scopeKey?:string;
  focalId?:string;
  scene?:ActorRosterScene;
  onReadScene?:(scene:ActorRosterScene)=>void;
}
const entry='min-h-11 min-w-0 max-w-full rounded border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300';

export function ActorRoster({scopeKey,...props}:ActorRosterProps) {
  return <Roster key={scopeKey??''} {...props}/>;
}
function Roster({world,selected,onSelect,dismissOnSelect=false,desktopOpen,onDesktopOpenChange,focalId,scene,onReadScene}:Omit<ActorRosterProps,'scopeKey'>){
  const uid=useId();
  const desktop=useViewportAtLeast(768);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [desktopFallback,setDesktopFallback]=useState(true);
  const open=desktop?(desktopOpen??desktopFallback):mobileOpen;
  const toggle=()=>{
    if(!desktop){setMobileOpen(!open);return;}
    if(onDesktopOpenChange)onDesktopOpenChange(!open);
    else setDesktopFallback(!open);
  };
  const [search,setSearch]=useState(''),[status,setStatus]=useState<RosterStatus>('all'),[cursor,setCursor]=useState(0);
  const index=createActorRosterIndex(world);
  const selection=useMemo(()=>selectActorRoster(index,search,status),[index,search,status]);
  const {actors,total,pages,page}=pageActorRoster(selection,cursor);
  const {rows,pinned}=partitionActorRosterPage(index,actors,selected,focalId);
  const rightScene=scene&&onReadScene&&scene.eventId.trim()&&scene.title.trim()?
    pinned.find(row=>row.actor.id===scene.actorId&&(row.selected||row.focal)):undefined;
  const select=(actor:Cultivator)=>{
    if(index.byId.get(actor.id)!==actor)return;
    if(dismissOnSelect&&selected===actor)return;
    if(dismissOnSelect&&!desktop)setMobileOpen(false);
    onSelect(actor.id);
  };
  const actorButton=(actor:Cultivator,isSelected:boolean,pin?:{focal:boolean;selected:boolean})=>{
    const suffix=rosterActorDisambiguator(index,actor);
    // Only bounded displayed rows are illustrated; no portrait catalogue is generated.
    const portrait=desktop&&open?projectCultivatorPortrait(world,actor):undefined;
    return <button type="button" aria-pressed={isSelected} onClick={()=>select(actor)}
      disabled={index.byId.get(actor.id)!==actor}
      className={entry+' flex w-full items-center gap-1.5 py-1 text-left disabled:opacity-40 '+(isSelected?'border-amber-500/60 text-amber-200':'')}>
      {portrait&&<CultivatorPortrait portrait={portrait} className="h-8 w-7"/>}
      <span className="min-w-0">
        {pin?.focal&&<span className="mr-1 inline-block rounded bg-amber-950/70 px-1 text-xs text-amber-200">主角</span>}
        {pin?.selected&&<span className="mr-1 inline-block rounded bg-slate-800 px-1 text-xs text-slate-300">已选人物</span>}
        <span>{actor.name}</span>
        <span className="block text-xs text-slate-400">{actor.alive?actor.realm+' '+actor.realmStage+'层':'已陨落'}{suffix&&' · '+suffix}</span>
      </span>
    </button>;
  };
  return <details open={open} className="min-w-0 rounded-lg border border-slate-800 bg-slate-900" aria-label="修士名册">
    <summary onClick={event=>{event.preventDefault();toggle();}} className="min-h-11 cursor-pointer rounded p-3 text-sm font-semibold text-slate-100 focus-visible:outline focus-visible:outline-amber-300">修士名册 · {world.cultivators.length} 位</summary>
    <div className="min-w-0 space-y-2 border-t border-slate-800 p-2.5 sm:p-3">
      {pinned.length>0&&<ul aria-label="名册中的主角与已选人物" className="min-w-0 space-y-1.5">
        {pinned.map(row=><li key={row.actor.id} className="min-w-0 space-y-1">
          {actorButton(row.actor,row.selected,row)}
          {rightScene===row&&scene&&onReadScene&&<button type="button" className={entry+' w-full text-left'}
            onClick={()=>onReadScene(scene)}>{row.focal?'读主角的这一幕':'读此人的这一幕'}<span className="block text-xs text-slate-400">{scene.title}</span></button>}
        </li>)}
      </ul>}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label htmlFor={uid+'-search'} className="sr-only">搜索修士</label>
        <input id={uid+'-search'} type="search" value={search} onChange={event=>{setSearch(event.target.value);setCursor(0);}}
          className={entry} placeholder="姓名、宗门或境界"/>
        <label htmlFor={uid+'-status'} className="sr-only">生存状态</label>
        <select id={uid+'-status'} className={entry} value={status} onChange={event=>{
          const next=event.currentTarget.value;
          if(next==='all'||next==='living'||next==='fallen'){setStatus(next);setCursor(0);}
        }}>
          <option value="all">全部</option><option value="living">在世</option><option value="fallen">陨落</option>
        </select>
      </div>
      <p className="text-xs text-slate-400" role="status">匹配 {total} 位{total>0&&' · 第 '+(page+1)+'/'+pages+' 页'}</p>
      {rows.length>0&&<ul className="grid min-w-0 grid-cols-2 gap-1.5" aria-label="搜索与分页结果">
        {rows.map((actor,n)=><li key={index.byId.get(actor.id)===actor?actor.id:JSON.stringify([actor.id,n])} className="min-w-0">{actorButton(actor,false)}</li>)}
      </ul>}
      {pages>1&&<div className="grid min-w-0 grid-cols-2 gap-2" aria-label="名册分页">
        <button type="button" className={entry+' disabled:opacity-40'} disabled={page===0} onClick={()=>setCursor(page-1)}>上一页</button>
        <button type="button" className={entry+' disabled:opacity-40'} disabled={page+1===pages} onClick={()=>setCursor(page+1)}>下一页</button>
      </div>}
    </div>
  </details>;
}
