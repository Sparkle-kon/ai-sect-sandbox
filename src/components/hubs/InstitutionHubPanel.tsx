import {useId,useRef,useState,useSyncExternalStore,type KeyboardEvent} from 'react';
import {WorkspaceSections,resolveWorkspaceOpen,type WorkspaceSection} from '../SandboxWorkspace';

export interface InstitutionHubGroup {
  id:string;
  label:string;
  sectionIds:readonly string[];
}
export interface InstitutionHubPanelProps {
  label:string;
  sections:WorkspaceSection[];
  groups:readonly InstitutionHubGroup[];
  initialOpen?:string;
  rememberedOpen?:string|null;
  forcedOpen?:string;
  onOpenChange?:(id:string|null)=>void;
}

const query='(min-width: 640px)';
const viewport=()=>typeof window==='undefined'?undefined:window.matchMedia?.(query);
const readViewport=()=>viewport()?.matches??false;
const readServerViewport=()=>false;
function subscribe(onChange:()=>void){
  const media=viewport();
  if(!media)return ()=>undefined;
  if(typeof media.addEventListener==='function'){
    media.addEventListener('change',onChange);
    return ()=>media.removeEventListener('change',onChange);
  }
  media.addListener?.(onChange);
  return ()=>media.removeListener?.(onChange);
}

export function nextInstitutionHubTab(key:string,current:number,length:number):number|undefined {
  if(length<1)return undefined;
  if(key==='Home')return 0;
  if(key==='End')return length-1;
  if(key==='ArrowRight')return (current+1)%length;
  if(key==='ArrowLeft')return (current+length-1)%length;
  return undefined;
}

function partition(groups:readonly InstitutionHubGroup[],sections:readonly WorkspaceSection[]){
  const byId=new Map(sections.map(section=>[section.id,section]));
  const assigned=new Set<string>();
  const visible=groups.flatMap(group=>{
    const leaves=group.sectionIds.flatMap(id=>{
      const section=byId.get(id);
      if(!section||assigned.has(id))return [];
      assigned.add(id);
      return [section];
    });
    return leaves.length?[{id:group.id,label:group.label,leaves}]:[];
  });
  const ungrouped=sections.filter(section=>!assigned.has(section.id));
  // A newly added existing leaf must remain reachable even before its theme is chosen.
  return ungrouped.length?[...visible,{id:'unfiled',label:'其他',leaves:ungrouped}]:visible;
}

const focus='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300';
const surface='min-w-0 space-y-3 rounded-xl border border-slate-800 bg-slate-900/45 p-3 sm:p-4';

export function DesktopInstitutionHub({
  label,sections,groups,initialOpen,rememberedOpen,forcedOpen,onOpenChange,
}:InstitutionHubPanelProps){
  const uid=useId();
  const tabRefs=useRef<Array<HTMLButtonElement|null>>([]);
  const [local,setLocal]=useState<string|null>();
  const open=resolveWorkspaceOpen(sections,initialOpen,rememberedOpen===undefined?local:rememberedOpen,forcedOpen);
  const leaf=sections.find(section=>section.id===open);
  const forced=leaf!==undefined&&leaf.id===forcedOpen;
  const visible=partition(groups,sections);
  const selected=visible.findIndex(group=>group.leaves.some(section=>section.id===open));
  const pick=(id:string)=>{
    if(forced||open===id)return;
    setLocal(id);
    onOpenChange?.(id);
  };
  const key=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{
    const next=nextInstitutionHubTab(event.key,index,visible.length);
    if(next===undefined)return;
    event.preventDefault();
    if(next!==selected)pick(visible[next].leaves[0].id);
    tabRefs.current[next]?.focus({preventScroll:true});
  };
  return <section aria-labelledby={`${uid}-title`} className={surface}>
    <header className="min-w-0 border-b border-amber-100/10 pb-2">
      <h2 id={`${uid}-title`} className="break-words font-serif text-lg font-semibold tracking-wide text-amber-50">{label}</h2>
    </header>
    {forced?<div role="region" aria-label={leaf.label} className="min-w-0">{leaf.content}</div>:<>
      {visible.length>0&&<div role="tablist" aria-label={`${label} · 主题`} className="flex min-w-0 flex-wrap gap-1.5 border-b border-slate-800 pb-2">
        {visible.map((group,index)=><button key={group.id} id={`${uid}-tab-${group.id}`}
          ref={node=>{tabRefs.current[index]=node;}} type="button" role="tab"
          aria-selected={index===selected} aria-controls={`${uid}-pane-${group.id}`}
          tabIndex={index===(selected<0?0:selected)?0:-1}
          onKeyDown={event=>key(event,index)} onClick={()=>{if(index!==selected)pick(group.leaves[0].id);}}
          className={`min-h-11 min-w-0 rounded-md border px-3 text-sm font-semibold ${focus} ${index===selected
            ?'border-amber-300/40 bg-amber-400/15 text-amber-100':'border-slate-700 bg-slate-950/55 text-slate-300 hover:bg-slate-800'}`}>
          {group.label}
        </button>)}
      </div>}
      {selected<0&&visible.length>0&&<p className="text-sm text-slate-300">选择一个主题，查看对应内容。</p>}
      {visible.map((group,index)=><div key={group.id} id={`${uid}-pane-${group.id}`} role="tabpanel"
        aria-labelledby={`${uid}-tab-${group.id}`} hidden={index!==selected} tabIndex={index===selected?0:undefined}
        className={`min-w-0 space-y-3 rounded-sm ${focus}`}>
        {index===selected&&<>
          {group.leaves.length>1&&<div role="group" aria-label={`${group.label} · 条目`} className="flex min-w-0 flex-wrap gap-1.5">
            {group.leaves.map(section=><button key={section.id} type="button" aria-pressed={section.id===open}
              onClick={()=>pick(section.id)} className={`min-h-11 rounded-md px-2.5 text-sm ${focus} ${section.id===open
                ?'bg-slate-700 text-amber-100':'bg-slate-950/55 text-slate-300 hover:bg-slate-800'}`}>{section.label}</button>)}
          </div>}
          {leaf&&<section aria-label={leaf.label} className="min-w-0">{leaf.content}</section>}
        </>}
      </div>)}
    </>}
  </section>;
}

/** Narrow screens keep the existing focused reading and touch contract. */
export function InstitutionHubPanel({groups,...props}:InstitutionHubPanelProps){
  const desktop=useSyncExternalStore(subscribe,readViewport,readServerViewport);
  return desktop?<DesktopInstitutionHub groups={groups} {...props}/>:<WorkspaceSections {...props}/>;
}
