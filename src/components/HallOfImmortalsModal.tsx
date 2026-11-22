import {useEffect,useId,useMemo,useRef,useState,type RefObject} from 'react';
import {projectHallOfImmortals} from '../engine/hallOfImmortalsEngine';
import type {WorldState} from '../types/world';

export interface HallOfImmortalsModalProps {
  world:WorldState;
  open:boolean;
  onClose:()=>void;
  scopeKey:string;
  historical?:boolean;
  currentVisibleSiteIds:ReadonlySet<string>;
  currentVisibleActorIds:ReadonlySet<string>;
  viewerId?:string;
}

type View=ReturnType<typeof projectHallOfImmortals>;
type Category=keyof View['rankings']|'lives';
const tabs=[['power','战力'],['karma','业缘'],['alchemy','丹道'],['lives','列传']] as const;
const descriptions:Record<Category,string>={
  power:'眼下可见的战力。榜序不等于实战胜负。',
  karma:'只列负业未消之人。业力是修行所载，不是罪名。',
  alchemy:'只数可核实的成丹批次，不以名望和资质代替。',
  lives:'有据便记，无据则留白。暂入上界不等于飞升，未归也不等于陨落。',
};
const control='min-h-11 min-w-0 rounded-md border border-amber-300/30 px-2 py-1 text-sm text-amber-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-50';
const pageSize=12;

type Motif = View['memorials'][number]['scenes'][number]['kind'];
const ink:Record<Motif,string>={
  origin:'m7 33 13-7 9 7m-10-7V17h9v12m-13-6 9-10 8 10',
  bond:'M53 24q6-11 12 0t12 0q6-11 12 0',
  encounter:'M66 28V12m-8 8h16m-14-6 12 12m0-12L60 26',
  duel:'m63 13 19 17m-4-17L62 30m0-5 5 5m10-5 5 5',
  destiny:'M68 25c-10-2-8-10 0-14 9 4 10 12 0 14m0 3v5',
  ending:'M56 31h27m-23-5h19m-15-6h11',
};
function MountainSeal({kind,ascended=false}:{kind?:Motif;ascended?:boolean}){
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 96 40" data-immortal-seal={ascended?"open":undefined}
    className={kind?'h-8 w-16 shrink-0 text-amber-400/60':'h-12 w-28 shrink-0 text-amber-300/60'}>
    {ascended?<path d="M66 17V9l9-5 9 5v13M63 9h24m-18 5h12m-8 2 2 7 2-7m-7 1-3 7m14-7 3 7"
      fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>:kind?<path d={ink[kind]} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>:<circle cx="68" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth=".7"/>}
    <path d="M2 35 23 23 33 30 51 10 77 32 85 27 94 35Z" fill="currentColor" opacity=".19"/>
    <path d="m2 35 21-12 10 7L51 10l26 22 8-5 9 8M16 36h66M41 22l10-12 10 12-8-2-5 2-3-2" fill="none" stroke="currentColor" strokeWidth=".9" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
const normalize=(label:string)=>label.normalize('NFKC').toLocaleLowerCase('zh').trim();

type Biography=View['memorials'][number]|View['ascended'][number];
export function BiographyScroll({row,titleRef,onReturn}:{row:Biography;titleRef?:RefObject<HTMLHeadingElement>;onReturn:()=>void}){
  const lifeTitleId=useId();
  const ascended='ascensionTick' in row;
  const ending=ascended?'飞升':'陨落';
  return <article className="space-y-3" aria-labelledby={lifeTitleId}>
      <button type="button" className={control} onClick={onReturn}>返回榜卷</button>
      <header className="flex min-w-0 items-center justify-between gap-2 border-b border-amber-300/25 pb-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-amber-400">历代列传 · {ending}</p>
          <h3 id={lifeTitleId} ref={titleRef} tabIndex={-1} className="font-serif text-xl font-bold text-amber-100 outline-none [overflow-wrap:anywhere]">{row.name}传</h3>
          <p className="text-sm text-slate-300 [overflow-wrap:anywhere]">{[row.title,row.realm].filter(Boolean).join(' · ')}</p>
        </div>
        <MountainSeal ascended={ascended}/>
      </header>
      <ol className="space-y-3 border-l border-amber-500/30 pl-3">
        {row.scenes.map((scene,index)=><li key={`${scene.tick}:${index}`} className="rounded-md bg-slate-900/80 p-3">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-serif text-base font-semibold leading-snug text-amber-100 [overflow-wrap:anywhere]">{scene.title}</h4>
            <MountainSeal kind={scene.kind} ascended={ascended&&scene.kind==='ending'}/>
          </div>
          <p className="mb-1 text-xs text-slate-400">{scene.year}年{scene.month}月</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200 [overflow-wrap:anywhere]">{scene.text}</p>
        </li>)}
      </ol>
      {!row.scenes.length&&<p className="text-sm text-slate-300">此生行迹，眼下尚无可核卷页。</p>}
    </article>;
}

export function HallOfImmortalsRead({view}:{view:View}){
  const [category,setCategory]=useState<Category>('power');
  const [actorId,setActorId]=useState<string>();
  const [query,setQuery]=useState('');
  const [limit,setLimit]=useState(pageSize);
  const heading=useRef<HTMLHeadingElement>(null);
  const returnId=useRef<string>();
  const returnButton=useRef<HTMLButtonElement>(null);
  const lives=useMemo(()=>[...view.memorials.map(row=>({row,ending:'陨落' as const})),...view.ascended.map(row=>({row,ending:'飞升' as const}))],[view]);
  const chosen=actorId&&lives.find(({row})=>row.actorId===actorId);
  useEffect(()=>{
    if(chosen)heading.current?.focus();
    else if(returnId.current){returnButton.current?.focus();returnId.current=undefined;}
  },[actorId,Boolean(chosen)]);
  const openLife=(id:string)=>{returnId.current=id;setActorId(id);};
  const returnToList=()=>setActorId(undefined);
  const scoreLabel=category==='alchemy'?'核实成丹':category==='karma'?'业力':'战力';
  const search=normalize(query);
  const filtered=search?lives.filter(({row})=>normalize(`${row.name} ${row.title} ${row.realm}`).includes(search)):lives;
  const ranked=category==='lives'?[]:view.rankings[category];
  const count=category==='lives'?filtered.length:ranked.length;
  return <div className="space-y-4 px-3 pb-4 pt-3 sm:px-5">
    {chosen?<BiographyScroll row={chosen.row} titleRef={heading} onReturn={returnToList}/>:<>
      <div role="group" aria-label="封神榜卷类别" className="grid grid-cols-4 gap-1.5">
        {tabs.map(([key,label])=><button key={key} type="button" aria-pressed={category===key}
          onClick={()=>{setCategory(key);setLimit(pageSize);}} className={`${control} aria-pressed:bg-amber-900/70 aria-pressed:text-white`}>{label}</button>)}
      </div>
      <p className="text-sm leading-relaxed text-slate-300">{descriptions[category]}</p>
      {category==='lives'?<>
        <label className="block space-y-1 text-sm text-slate-200">
          <span>寻列传</span>
          <input value={query} type="search" onChange={event=>{setQuery(event.currentTarget.value);setLimit(pageSize);}}
            placeholder="姓名、称号或境界" className={`${control} block w-full bg-slate-950 text-base`}/>
        </label>
        <ul aria-label="历代列传" className="space-y-1.5">
          {filtered.slice(0,limit).map(({row,ending})=><li key={row.actorId}>
            <button type="button" className={`${control} block w-full bg-slate-900 text-left`}
              ref={returnId.current===row.actorId?returnButton:undefined} onClick={()=>openLife(row.actorId)}>
              <span className="mr-2 font-semibold">{row.name}</span><span className="text-xs text-slate-300">{[ending,row.title,row.realm].filter(Boolean).join(' · ')}</span>
            </button>
          </li>)}
        </ul>
        {!filtered.length&&<p className="text-sm text-slate-300">{search?'未找到相符列传。':'所见卷宗尚无可证的陨落或飞升列传。'}</p>}
      </>:<>
        <ol aria-label={`${scoreLabel}榜`} className="space-y-1.5">
          {ranked.slice(0,limit).map((row,index)=><li key={row.actorId}
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-slate-900 px-2.5 py-2.5">
            <span className="w-6 font-serif text-amber-300">{index+1}</span>
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <p className="text-sm font-semibold text-amber-100">{row.name}</p>
              <p className="text-xs text-slate-400">{[row.title,row.realm].filter(Boolean).join(' · ')}</p>
            </div>
            <p className="text-right text-sm font-semibold tabular-nums text-slate-200"><span className="sr-only">{scoreLabel} </span>{row.score}{category==='alchemy'?' 批':''}</p>
          </li>)}
        </ol>
        {!ranked.length&&<p className="text-sm text-slate-300">此栏暂无线索可入榜。</p>}
      </>}
      {count>limit&&<button type="button" className={control} onClick={()=>setLimit(n=>n+pageSize)}>继续翻阅</button>}
    </>}
  </div>;
}

export function HallOfImmortalsModal({world,open,onClose,scopeKey,historical,currentVisibleSiteIds,currentVisibleActorIds,viewerId}:HallOfImmortalsModalProps){
  const dialog=useRef<HTMLDialogElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  const id=useId();
  const view=useMemo(()=>open?projectHallOfImmortals(world,{currentVisibleSiteIds,currentVisibleActorIds,viewerId}):undefined,
    [open,world,currentVisibleSiteIds,currentVisibleActorIds,viewerId]);
  useEffect(()=>{
    const current=dialog.current;
    if(!open||!current)return;
    const previous=current.ownerDocument.activeElement;
    if(!current.open)current.showModal();
    closeButton.current?.focus();
    return ()=>{
      if(current.open)current.close();
      if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();
    };
  },[open]);
  if(!view)return null;
  return <dialog ref={dialog} aria-labelledby={id}
    className="m-auto max-h-[90dvh] w-[min(94vw,44rem)] overflow-y-auto overscroll-contain rounded-xl border border-amber-400/45 bg-slate-950 p-0 text-slate-100 shadow-2xl backdrop:bg-black/75"
    onCancel={event=>{event.preventDefault();onClose();}}>
    <header className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-amber-400/30 bg-slate-950 px-3 py-2.5 sm:px-5">
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-widest text-amber-400">{historical?'所读旧卷':'当世所见'}</p>
        <h2 id={id} className="font-serif text-lg font-bold leading-tight text-amber-100 [overflow-wrap:anywhere]">天机封神榜 · 历代列传</h2>
      </div>
      <button ref={closeButton} type="button" className={`${control} shrink-0`} aria-label="合上封神榜与列传" onClick={onClose}>合卷</button>
    </header>
    <HallOfImmortalsRead key={`${scopeKey}:${viewerId??''}`} view={view}/>
  </dialog>;
}
