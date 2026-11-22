import {useId,useMemo,useState} from 'react';
import {confirmChapterExcerpt,prepareChapterExcerpt,projectChapterExcerpt,type ChapterExcerptDraft,
  type ChapterExcerptProjection} from './chapterExcerptModel';
import type {WorldState} from '../types/world';

export interface ChapterExcerptPanelProps {
  world:WorldState;
  chapterId:string;
  scopeKey?:string;
  viewerId?:string;
}
type Preview={world:WorldState;draft:ChapterExcerptDraft;selected:readonly string[]};
type TextFile={filename:string;text:string};
const action='min-h-11 max-w-full rounded border border-amber-500/45 bg-slate-950 px-2.5 py-1 text-amber-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-amber-300 disabled:opacity-50';
const revokable=(url:string)=>{try{URL.revokeObjectURL(url);}catch{/* Browser denied cleanup; no local data is persisted by this panel. */}};

/** Triggers an ordinary browser-local text download; it never reports that a file has reached disk. */
export function requestChapterExcerptDownload(file:TextFile):boolean{
  if(!file.filename.endsWith('.txt')||/[\\/\x00-\x1f\x7f]/u.test(file.filename)||!file.text)return false;
  let url:string|undefined,link:HTMLAnchorElement|undefined,submitted=false;
  try{
    url=URL.createObjectURL(new Blob([file.text],{type:'text/plain;charset=utf-8'}));
    link=document.createElement('a');
    link.href=url;
    link.download=file.filename;
    link.hidden=true;
    document.body.append(link);
    link.click();
    submitted=true;
    return true;
  }catch{
    return false;
  }finally{
    try{link?.remove();}catch{/* The document may already be going away. */}
    if(url){
      const cleanup=url;
      if(submitted)setTimeout(()=>revokable(cleanup),1000);
      else revokable(cleanup);
    }
  }
}
function sameSelection(a:readonly string[],b:readonly string[]){
  return a.length===b.length&&a.every((id,index)=>id===b[index]);
}
export function ChapterExcerptChoices({projection,selected,onSelect}:{
  projection:ChapterExcerptProjection;selected:readonly string[];onSelect:(id:string,checked:boolean)=>void;
}){
  const title=useId();
  return <div className="space-y-2">
    {projection.excludedCount>0&&<p className="text-slate-300">另有 {projection.excludedCount} 幕不符合节选条件，不列出内容。</p>}
    {projection.rows.length>0?<fieldset aria-labelledby={title} className="min-w-0 space-y-1">
      <legend id={title} className="font-semibold text-slate-200">选要带走的场景</legend>
      {projection.rows.map(row=><label key={row.id} className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded border border-slate-700 px-2
        focus-within:outline focus-within:outline-amber-300 [overflow-wrap:anywhere]">
        <input type="checkbox" className="h-4 w-4 shrink-0 accent-amber-400" checked={selected.includes(row.id)}
          onChange={event=>onSelect(row.id,event.currentTarget.checked)}/>
        <span className="min-w-0">{row.title}</span>
      </label>)}
    </fieldset>:<p>这章暂无可节选的场景。</p>}
  </div>;
}
export function ChapterExcerptPreview({text,onConfirm}:{text:string;onConfirm:()=>void}){
  const heading=useId();
  return <section className="min-w-0 space-y-2" aria-labelledby={heading}>
    <h5 id={heading} className="font-semibold text-amber-100">将下载的文字</h5>
    <pre className="max-h-72 min-w-0 overflow-y-auto whitespace-pre-wrap rounded border border-slate-700 p-2 font-serif text-sm leading-6 [overflow-wrap:anywhere]">{text}</pre>
    <button type="button" className={action} onClick={onConfirm}>确认下载 .txt</button>
  </section>;
}
export function ChapterExcerptPanel(props:ChapterExcerptPanelProps){
  const {scopeKey,chapterId,viewerId}=props;
  if(!scopeKey)return null;
  return <ExcerptFold {...props} scopeKey={scopeKey} key={JSON.stringify([scopeKey,chapterId,viewerId??null])}/>;
}
function ExcerptFold({world,chapterId,scopeKey,viewerId}:ChapterExcerptPanelProps&{scopeKey:string}){
  const [open,setOpen]=useState(false),[selected,setSelected]=useState<readonly string[]>([]),
    [preview,setPreview]=useState<Preview>(),[notice,setNotice]=useState('');
  const projection=useMemo(()=>open?projectChapterExcerpt(world,chapterId,scopeKey,viewerId):undefined,[open,world,chapterId,scopeKey,viewerId]);
  const picks=projection?.rows.filter(row=>selected.includes(row.id)).map(row=>row.id)??[];
  const displayed=preview?.world===world&&sameSelection(preview.selected,picks)?preview:undefined;
  const update=(id:string,checked:boolean)=>{
    setSelected(current=>checked?[...new Set([...current,id])]:current.filter(value=>value!==id));
    setPreview(undefined);setNotice('');
  };
  const previewExcerpt=()=>{
    if(!projection||!picks.length)return;
    const draft=prepareChapterExcerpt(projection,picks);
    setNotice(draft?'':'这些场景此时不能组成节选，请重新选择。');
    setPreview(draft?{world,draft,selected:picks}:undefined);
  };
  const download=()=>{
    if(!displayed){setNotice('片段或读境已变，请重新预览。');return;}
    let file:TextFile|undefined;
    try{file=confirmChapterExcerpt(world,chapterId,scopeKey,viewerId,displayed.draft);}
    catch{setNotice('未能重新核对节选，没有请求下载。请重新预览。');setPreview(undefined);return;}
    if(!file||file.text!==displayed.draft.text){setNotice('片段或读境已变，没有请求下载。请重新预览。');setPreview(undefined);return;}
    setNotice(requestChapterExcerptDownload(file)?
      '已请求浏览器下载 .txt，未改变游戏或存档。':'浏览器未能请求下载，游戏和存档未改变。');
  };
  return <details onToggle={event=>{
    const shown=event.currentTarget.open;
    setOpen(shown);
    if(!shown){setPreview(undefined);setNotice('');}
  }} className="min-w-0 rounded border border-amber-400/25 bg-slate-950/65">
    <summary className="flex min-h-11 cursor-pointer items-center px-2 text-sm font-semibold text-amber-100
      focus-visible:outline focus-visible:outline-amber-300">故事节选</summary>
    {open&&!projection&&<p className="px-2 pb-2 text-sm text-slate-300">这章当前不能核对节选。</p>}
    {open&&projection&&<div className="min-w-0 space-y-2 px-2 pb-2 text-sm text-slate-100">
      <p>只取勾选的场景与出处。先看纯文字，确认后才下载。</p>
      <ChapterExcerptChoices projection={projection} selected={picks} onSelect={update}/>
      {selected.length>picks.length&&<p>先前勾选有场景已不可用，本次不纳入。</p>}
      {picks.length>0&&<p className="text-slate-300">已选 {picks.length} 幕。</p>}
      <button type="button" className={action} disabled={!picks.length} onClick={previewExcerpt}>预览纯文字节选</button>
      {preview&&!displayed&&<p role="status">读境已变，请重新预览。</p>}
      {displayed&&<ChapterExcerptPreview text={displayed.draft.text} onConfirm={download}/>}
      {notice&&<p role="status">{notice}</p>}
    </div>}
  </details>;
}
