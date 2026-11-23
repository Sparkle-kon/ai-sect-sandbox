import {useEffect,useId,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {SectPlayerChatComposer,type SectPlayerChatControls} from './SectPlayerChatComposer';
import {projectSectPlayerChat} from '../engine/sectPlayerChat';
import {projectSectChat,type SectChatMessageView} from '../engine/sectChat';
import {SECT_CHAT_MONTH_LIMIT,SECT_CHAT_POST_LIMIT,SECT_CHAT_ROOMS,sectChatModelEndpoint,type SectChatRoomId} from '../types/sectChat';
import {SECT_PLAYER_CHAT_MONTH_LIMIT,SECT_PLAYER_CHAT_POST_LIMIT} from '../types/sectPlayerChat';
import type {LLMConfig,WorldState} from '../types/world';
import {CultivatorPortrait} from './CultivatorPortrait';
import {projectCultivatorPortrait} from './cultivatorPortraitModel';

const WIDE='(min-width: 1440px)';
const isWide=()=>typeof window!=='undefined'&&window.matchMedia?.(WIDE)?.matches===true;
function watchWide(update:()=>void){
  const query=window.matchMedia?.(WIDE);
  query?.addEventListener?.('change',update);
  return ()=>query?.removeEventListener?.('change',update);
}

interface LocalChatRead {
  readonly room:SectChatRoomId;
  readonly seen:readonly string[];
}

function readLocal(key:string):LocalChatRead{
  try{
    const raw:unknown=JSON.parse(window.sessionStorage.getItem(key)??'null');
    if(raw&&typeof raw==='object'&&'room' in raw&&'seen' in raw){
      const room=SECT_CHAT_ROOMS.find(id=>id===raw.room);
      if(room&&Array.isArray(raw.seen)){
        return {room,seen:raw.seen.filter((id):id is string=>typeof id==='string'&&id.length<=256)
          .slice(-(SECT_CHAT_MONTH_LIMIT*SECT_CHAT_POST_LIMIT+SECT_PLAYER_CHAT_MONTH_LIMIT*SECT_PLAYER_CHAT_POST_LIMIT))};
      }
    }
  }catch{/* Reading a chat still works when this browser disables storage. */}
  return {room:'own',seen:[]};
}

function dateLabel(world:WorldState,tick:number):string{
  const month=world.year*12+world.month-1+tick-world.tick;
  return month>=0?`${Math.floor(month/12)} 年 ${month%12+1} 月`:'';
}

export interface SectChatModelControls {
  readonly config:LLMConfig;
  readonly onChange:(config:LLMConfig)=>void;
}

function SectChatModelSettings({config,onChange,busy}:SectChatModelControls&{busy:boolean}){
  const form=useId(),notice=useId();
  const [expanded,setExpanded]=useState(false);
  const enabled=config.sectChatEnabled===true;
  const ready=!!sectChatModelEndpoint(config.apiBaseUrl)&&!!config.apiKey.trim();
  const control='min-h-11 min-w-0 w-full rounded border border-stone-600 bg-stone-950 px-2 text-sm text-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-60';

  return <div className="border-t border-stone-700 pt-1">
    <button type="button" aria-expanded={expanded} aria-controls={form} onClick={()=>setExpanded(value=>!value)}
      className="flex min-h-11 w-full items-center justify-between gap-2 rounded px-1 text-left text-xs text-stone-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
      <span>群聊设置</span>
      <span className="text-amber-200">{enabled&&ready?'大模型已开启':'离线对白'}</span>
    </button>
    <div id={form} hidden={!expanded}>
      {expanded&&<fieldset disabled={busy} className="min-w-0 space-y-1.5 rounded-md bg-stone-900/80 p-2 disabled:opacity-70">
        <legend className="sr-only">群聊模型设置</legend>
        <p id={notice} className="text-xs leading-5 text-stone-300">只把九州群与坊市群的公开见闻和相关角色资料发给所填服务。本宗群和掌门私聊留在游戏里。模型只写对白，不改结算；可能产生 API 费用。刷新页面后需重新设置。</p>
        <label className="flex min-h-11 items-center gap-2 rounded border border-stone-700 px-2 text-sm text-amber-100">
          <input type="checkbox" checked={enabled} className="size-4 shrink-0 accent-amber-300" aria-describedby={notice}
            onChange={event=>onChange({...config,sectChatEnabled:event.currentTarget.checked})}/>
          <span>让大模型代写群聊</span>
        </label>
        {enabled&&!ready&&<p className="text-xs text-amber-200">请填写有效的 API 地址和密钥。在此之前仍用离线对白。</p>}
        <label className="block space-y-1 text-xs text-stone-300"><span>API 地址</span>
          <input type="url" spellCheck={false} value={config.apiBaseUrl} className={control}
            onChange={event=>onChange({...config,apiBaseUrl:event.currentTarget.value})}/>
        </label>
        <label className="block space-y-1 text-xs text-stone-300"><span>API 密钥</span>
          <input type="password" autoComplete="off" value={config.apiKey} className={control}
            onChange={event=>onChange({...config,apiKey:event.currentTarget.value})}/>
        </label>
        <label className="block space-y-1 text-xs text-stone-300"><span>模型名称</span>
          <input type="text" spellCheck={false} placeholder="留空使用默认模型" value={config.model} className={control}
            onChange={event=>onChange({...config,model:event.currentTarget.value})}/>
        </label>
      </fieldset>}
    </div>
  </div>;
}

export function SectChatPanel({world,scope,busy,onOpenSource,model,posting}:{
  world:WorldState;scope:string;busy:boolean;onOpenSource?:(expectedWorld:WorldState,postId:string)=>boolean;
  model?:SectChatModelControls;
  posting?:SectPlayerChatControls;
}){
  const panelId=useId(),roomTitle=useId(),list=useRef<HTMLOListElement>(null);
  const failure=useRef<HTMLParagraphElement>(null);
  const previousRoom=useRef<SectChatRoomId>();
  const wide=useSyncExternalStore(watchWide,isWide,()=>false);
  const [open,setOpen]=useState(false);
  const storageKey=`sect-chat-read:${scope}`;
  const [read,setRead]=useState<LocalChatRead>(()=>readLocal(storageKey));
  const [failed,setFailed]=useState<{world:WorldState;postId:string}>();
  const rooms=useMemo(()=>{
    const playerPosts=projectSectPlayerChat(world);
    return projectSectChat(world).map(room=>{
      const native=room.posts.map(post=>({...post,player:false,exposed:false}));
      const written=playerPosts.flatMap(post=>{
        if(post.roomId!==room.id)return [];
        const senderId=post.identity==='leader'?world.sectManagement?.leaderId:undefined;
        return [{id:post.id,tick:post.tick,senderId:senderId??post.identity,name:post.name,text:post.text,
          player:true,exposed:post.exposed,sourceEventId:post.sourceEventId,replyTo:undefined} satisfies
          Pick<SectChatMessageView,'id'|'tick'|'senderId'|'name'|'text'|'sourceEventId'|'replyTo'>&{player:true;exposed:boolean}];
      });
      return {...room,posts:[...native,...written].sort((a,b)=>a.tick-b.tick)};
    });
  },[world]);
  const selected=rooms.find(room=>room.id===read.room)??rooms[0];
  const shown=wide||open;
  const seen=useMemo(()=>new Set(read.seen),[read.seen]);
  const unread=(posts:readonly {id:string;player:boolean}[])=>posts.filter(post=>!post.player&&!seen.has(post.id)).length;
  const total=rooms.reduce((count,room)=>count+unread(room.posts),0);
  const latest=selected?.posts.at(-1)?.id;
  const portraits=useMemo(()=>{
    const projected=new Map<string,ReturnType<typeof projectCultivatorPortrait>>();
    if(shown)for(const post of selected?.posts??[]){
      if(projected.has(post.senderId))continue;
      const candidates=world.cultivators.filter(actor=>actor.id===post.senderId&&(actor.name===post.name||post.player&&actor.id===world.sectManagement?.leaderId));
      projected.set(post.senderId,projectCultivatorPortrait(world,candidates.length===1?candidates[0]:undefined));
    }
    return projected;
  },[world,shown,selected]);

  useEffect(()=>{
    if(!shown||!selected)return;
    const ids=selected.posts.map(post=>post.id);
    const retained=new Set(rooms.flatMap(room=>room.posts.map(post=>post.id)));
    setRead(previous=>{
      const known=new Set(previous.seen.filter(id=>retained.has(id)));
      for(const id of ids)known.add(id);
      if(known.size===previous.seen.length&&previous.seen.every(id=>known.has(id)))return previous;
      return {...previous,seen:[...known]};
    });
  },[shown,selected,rooms]);
  useEffect(()=>{
    try{window.sessionStorage.setItem(storageKey,JSON.stringify(read));}
    catch{/* Browsing still works with local storage turned off. */}
  },[storageKey,read]);
  useEffect(()=>{
    const node=list.current;
    if(!shown||!node||!selected){previousRoom.current=undefined;return;}
    if(previousRoom.current!==selected.id||node.scrollHeight-node.scrollTop-node.clientHeight<96)node.scrollTop=node.scrollHeight;
    previousRoom.current=selected.id;
  },[shown,selected?.id,latest]);
  useEffect(()=>{if(failed?.world===world)failure.current?.focus({preventScroll:true});},[failed,world]);
  if(!selected)return null;

  return <aside aria-label="仙门群聊" data-sect-chat="" className="min-w-0 rounded-xl border border-amber-300/25 bg-stone-950/90 p-2.5 min-[1440px]:sticky min-[1440px]:top-28">
    <button type="button" aria-expanded={shown} aria-controls={panelId} onClick={()=>setOpen(value=>!value)}
      className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md px-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 min-[1440px]:hidden">
      <span className="font-serif font-semibold text-amber-100">仙门群聊</span>
      <span className="flex items-center gap-2 text-xs text-stone-300">
        {total>0&&<span className="inline-flex items-center gap-1" aria-live="polite">
          <span aria-hidden="true" className="size-2 rounded-full bg-rose-400"/>{total} 条未读
        </span>}
        <span>{open?'收起':'展开'}</span>
      </span>
    </button>
    <div id={panelId} hidden={!shown} className="space-y-2">
      <h2 className="hidden font-serif text-lg font-semibold text-amber-100 min-[1440px]:block">仙门群聊</h2>
      <div role="group" aria-label="选择群聊" className="grid min-w-0 grid-cols-2 gap-1">
        {rooms.map(room=>{
          const count=unread(room.posts);
          return <button key={room.id} type="button" aria-pressed={room.id===selected.id}
            className="flex min-h-11 min-w-0 items-center justify-between gap-1 rounded-md border border-stone-700 px-2 py-1 text-left text-xs text-stone-200 [overflow-wrap:anywhere] aria-pressed:border-amber-300/70 aria-pressed:bg-amber-950/55 aria-pressed:text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
            onClick={()=>{setRead(previous=>({...previous,room:room.id}));setFailed(undefined);}}>
            <span>{room.label}</span>
            {count>0&&<span data-sect-chat-unread="" className="shrink-0 rounded-full bg-rose-950 px-1.5 py-0.5 text-rose-100"
              aria-label={`${count} 条未读`}>{count}</span>}
          </button>;
        })}
      </div>
      <h3 id={roomTitle} className="font-serif text-sm font-semibold text-amber-100">{selected.label}</h3>
      {selected.posts.length===0?<p className="rounded-md bg-stone-900/75 p-2 text-sm text-stone-300">这处还没人开口。</p>:
        <ol ref={list} aria-labelledby={roomTitle}
          className="max-h-[min(54dvh,30rem)] min-w-0 space-y-2 overflow-y-auto overscroll-contain pr-1">
          {selected.posts.map((post,index)=>{
            const date=index===0||selected.posts[index-1].tick!==post.tick?dateLabel(world,post.tick):'';
            const portrait=portraits.get(post.senderId);
            const hasJump=!post.player&&!!post.sourceEventId&&!!onOpenSource;
            const prior=post.replyTo?selected.posts.findIndex(row=>row.id===post.replyTo):-1;
            const replyName=prior>=0&&prior<index?selected.posts[prior].name:undefined;
            return <li key={post.id} data-sect-chat-message="" className="min-w-0 [overflow-wrap:anywhere]">
              {date&&<p className="mb-1 text-center text-[11px] text-stone-400">{date}</p>}
              <div className="flex min-w-0 items-start gap-2">
                <div aria-hidden="true" className="grid size-9 shrink-0 place-items-center overflow-hidden rounded border border-amber-300/30 bg-amber-950/60 font-serif text-amber-100">
                  {portrait?<CultivatorPortrait portrait={portrait} className="h-9 w-9"/>:Array.from(post.name)[0]??'·'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 flex flex-wrap items-baseline gap-x-1.5 text-xs font-medium text-amber-100">
                    {post.name}
                    {post.exposed&&<span className="text-rose-200">马甲已被识破</span>}
                    {replyName&&<span className="text-stone-400">回 {replyName}</span>}
                  </p>
                  {hasJump?<button type="button" disabled={busy} className="block min-h-11 max-w-full rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-left text-sm leading-6 text-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-60"
                    onClick={()=>setFailed(onOpenSource?.(world,post.id)?undefined:{world,postId:post.id})}>
                    {post.text}<span className="ml-1 text-xs text-amber-200">看纪事 ›</span>
                  </button>:<p className={`rounded-md px-2 py-1.5 text-sm leading-6 text-stone-100 ${post.player?'bg-emerald-950/45':'bg-stone-900'}`}>{post.text}</p>}
                  {failed?.world===world&&failed.postId===post.id&&<p ref={failure} tabIndex={-1} role="status"
                    className="text-xs text-amber-200">暂时翻不到这段纪事。</p>}
                </div>
              </div>
            </li>;
          })}
        </ol>}
      {shown&&posting&&(selected.id==='own'||selected.id==='jiuzhou')&&<SectPlayerChatComposer key={selected.id}
        world={world} room={selected.id} roomLabel={selected.label} busy={busy} posting={posting}
        modelReady={model?.config.sectChatEnabled===true&&!!sectChatModelEndpoint(model.config.apiBaseUrl)&&!!model.config.apiKey.trim()}/>}
      {shown&&model&&<SectChatModelSettings {...model} busy={busy}/>}
    </div>
  </aside>;
}
