import {useEffect,useMemo,useRef,useState} from 'react';
import {Heart,MessageCircle,EyeOff} from 'lucide-react';
import {projectSectMoments} from '../engine/sectMoments';
import {isSectMomentComment,SECT_MOMENTS_COMMENT_LENGTH,SECT_MOMENTS_COMMENT_LIMIT,
  type SectMomentCommand,type SectMomentPost} from '../types/sectMoments';
import type {WorldState} from '../types/world';
import {CultivatorPortrait} from './CultivatorPortrait';
import {projectCultivatorPortrait} from './cultivatorPortraitModel';
import {SceneStageCanvas} from './SceneStageCanvas';
import {projectSectMomentScene} from './sectMomentScene';

export type SectMomentsAction=(expectedWorld:WorldState,command:SectMomentCommand)=>Promise<boolean>;

const badge:Readonly<Record<SectMomentPost['kind'],string>>={
  breakthrough:'破境',artifact:'法宝',food:'饭香',travel:'行旅',
};
const PAGE_SIZE=4;
const button='inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-45';
const actionButton=`${button} text-stone-300 hover:bg-stone-800`;

function dateLabel(world:WorldState,tick:number){
  const month=world.year*12+world.month-1+tick-world.tick;
  return month<0?'':`${Math.floor(month/12)} 年 ${month%12+1} 月`;
}

export function SectMomentsPanel({world,busy,onAction}:{world:WorldState;busy:boolean;onAction?:SectMomentsAction}){
  const view=useMemo(()=>projectSectMoments(world),[world]);
  const [limit,setLimit]=useState(PAGE_SIZE);
  const [opened,setOpened]=useState<string>();
  const [draft,setDraft]=useState('');
  const [hiddenOpen,setHiddenOpen]=useState(false);
  const [pending,setPending]=useState(false);
  const [notice,setNotice]=useState('');
  const inFlight=useRef(false);
  const currentWorld=useRef(world);
  currentWorld.current=world;
  const mounted=useRef(true);
  useEffect(()=>{
    mounted.current=true;
    return ()=>{mounted.current=false;};
  },[]);

  const disabled=busy||pending||!onAction;
  async function send(command:SectMomentCommand){
    if(!onAction||busy||inFlight.current)return;
    const expected=world;
    inFlight.current=true;
    setPending(true);setNotice('');
    try{
      const ok=await onAction(expected,command);
      if(!mounted.current)return;
      if(!ok){
        if(currentWorld.current===expected)setNotice('这回没能记下，请再试一次。');
        return;
      }
      if(command.kind==='comment')setDraft(value=>value.trim()===command.text?'':value);
      if(command.kind==='block'){
        setHiddenOpen(true);setOpened(undefined);setDraft('');
      }
    }catch{
      if(mounted.current&&currentWorld.current===expected)setNotice('这回没能记下，请再试一次。');
    }finally{
      inFlight.current=false;
      if(mounted.current)setPending(false);
    }
  }

  return <section aria-label="修仙朋友圈" className="min-w-0 space-y-2">
    {view.posts.length===0&&<p className="rounded-md bg-stone-900/75 p-3 text-sm text-stone-300">朋友圈还空着，等道友带点新鲜见闻回来。</p>}
    {notice&&<p className="px-1 text-xs text-amber-200" role="status">{notice}</p>}
    {view.posts.length>0&&<ol aria-label="朋友圈动态" className="max-h-[min(58dvh,36rem)] min-w-0 space-y-2 overflow-y-auto overscroll-contain pr-1">
      {view.posts.slice(0,limit).map(({post,authorName,caption,likes,comments})=>{
        const actor=world.cultivators.find(row=>row.id===post.authorId);
        const portrait=projectCultivatorPortrait(world,actor);
        const frame=projectSectMomentScene(world,post);
        const reading=opened===post.id;
        const comment=draft.trim(),length=[...comment].length;
        const maxComments=(post.playerComments?.length??0)>=SECT_MOMENTS_COMMENT_LIMIT;
        return <li key={post.id} className="min-w-0 rounded-lg border border-stone-700/85 bg-stone-900/80 p-2.5 [overflow-wrap:anywhere]">
          <article aria-label={`${authorName}的${badge[post.kind]}动态`}>
            <header className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center overflow-hidden rounded border border-amber-300/30 bg-amber-950/60 font-serif text-amber-100">
                {portrait?<CultivatorPortrait portrait={portrait} className="size-9"/>:Array.from(authorName)[0]??'·'}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-serif text-sm font-semibold text-amber-100">{authorName}</h3>
                <p className="text-[11px] text-stone-400">{dateLabel(world,post.tick)}{post.audience?' · 席间可见':''}</p>
              </div>
              <span className="shrink-0 rounded border border-amber-400/30 px-1.5 py-0.5 text-xs text-amber-100">{badge[post.kind]}</span>
            </header>
            <p className="my-2 text-sm leading-6 text-stone-100">{caption}</p>
            {frame&&<div role="group" aria-label={frame.siteName?`${frame.siteName}留影`:'此景留影'} className="mb-1 w-full max-w-[14rem]">
              <SceneStageCanvas frame={frame}/>
            </div>}
            <div className="flex min-w-0 flex-wrap items-center gap-x-1 border-t border-stone-700/75">
              <button type="button" aria-pressed={post.playerLiked===true} disabled={disabled}
                className={`${actionButton} aria-pressed:text-rose-200`} onClick={()=>void send({kind:'like',postId:post.id})}>
                <Heart className="size-4 shrink-0" aria-hidden="true" fill={post.playerLiked?'currentColor':'none'}/>
                {post.playerLiked?'取消赞':'点赞'} <span>{likes}</span>
              </button>
              <button type="button" disabled={pending} aria-expanded={reading} className={actionButton} onClick={()=>{
                setOpened(reading?undefined:post.id);setDraft('');setNotice('');
              }}>
                <MessageCircle className="size-4 shrink-0" aria-hidden="true"/>评论 <span>{comments.length}</span>
              </button>
              {onAction&&post.authorId!==world.sectManagement?.leaderId&&<button type="button" disabled={disabled}
                aria-label={`拉黑 ${authorName}`} className={`${actionButton} ml-auto`} onClick={()=>void send({kind:'block',authorId:post.authorId})}>
                <EyeOff className="size-4 shrink-0" aria-hidden="true"/>拉黑
              </button>}
            </div>
            {reading&&<div className="space-y-2 border-t border-stone-700/75 pt-2">
              {comments.length>0?<ul aria-label="已留的评论" className="space-y-1">
                {comments.map((comment,index)=><li key={`${comment.authorId}-${index}`} className="text-xs leading-5 text-stone-200">
                  <span className="font-medium text-amber-100">{comment.name}：</span>{comment.text}
                </li>)}
              </ul>:<p className="text-xs text-stone-400">还没有道友留言。</p>}
              {onAction&&!maxComments&&<form className="flex flex-wrap items-end gap-1.5" onSubmit={event=>{
                event.preventDefault();
                if(isSectMomentComment(comment))void send({kind:'comment',postId:post.id,text:comment});
              }}>
                <label className="min-w-0 grow text-xs text-stone-300">
                  留一句话 <span className={length>SECT_MOMENTS_COMMENT_LENGTH?'text-rose-200':'text-stone-400'}>· {length}/{SECT_MOMENTS_COMMENT_LENGTH}</span>
                  <textarea rows={2} disabled={disabled} value={draft} onChange={event=>setDraft(event.currentTarget.value)}
                    className="mt-1 block min-h-11 w-full resize-y rounded border border-stone-600 bg-stone-950 px-2 py-2 text-sm text-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"/>
                </label>
                <button type="submit" disabled={disabled||!isSectMomentComment(comment)}
                  className={`${button} border border-amber-400/50 bg-amber-950/55 text-amber-100`}>送出</button>
              </form>}
              {maxComments&&<p className="text-xs text-stone-400">这一则已经留过三句话了。</p>}
            </div>}
          </article>
        </li>;
      })}
      {view.posts.length>limit&&<li>
        <button type="button" className={`${actionButton} w-full border border-stone-700`} onClick={()=>setLimit(value=>value+PAGE_SIZE)}>再翻几则</button>
      </li>}
    </ol>}
    {view.blockedAuthors.length>0&&<div className="border-t border-stone-700 pt-1">
      <button type="button" className={actionButton} aria-expanded={hiddenOpen} onClick={()=>setHiddenOpen(value=>!value)}>
        已拉黑的道友（{view.blockedAuthors.length}）
      </button>
      {hiddenOpen&&<ul aria-label="已拉黑的道友" className="space-y-1">
        {view.blockedAuthors.map(actor=><li key={actor.id} className="flex min-w-0 items-center gap-2 px-2 text-sm text-stone-300">
          <span className="min-w-0 grow break-words">{actor.name}</span>
          <button type="button" disabled={disabled} className={actionButton} aria-label={`取消拉黑 ${actor.name}`}
            onClick={()=>void send({kind:'unblock',authorId:actor.id})}>取消拉黑</button>
        </li>)}
      </ul>}
    </div>}
  </section>;
}
