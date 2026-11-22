import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { AVATAR_ORDER_COST, AVATAR_POSSESSION_COST } from '../engine/avatarEngine';
import type { AvatarOrder } from '../types/world';
import type { StoryPlayerRole } from './storyPlayerController';

export interface PlayerStoryEntryProps {
  titleRef?: Ref<HTMLHeadingElement>;
  role: StoryPlayerRole;
  revision: object;
  busy?: boolean;
  onBack: () => void;
  onTools: () => void;
  openings?:ReactNode;
  onFollow?: () => boolean;
  onEnter?: () => boolean;
  onOrder?: (action: AvatarOrder) => boolean;
}

const action = 'min-h-11 min-w-0 max-w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-50';
const primary = 'min-h-11 min-w-0 max-w-full rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-amber-950 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-50';
const ORDERS = { REST: '调息', CULTIVATE: '修炼' } as const;

export function PlayerStoryEntry({role,revision,busy=false,titleRef,onEnter,onFollow,onOrder,onBack,onTools,openings}: PlayerStoryEntryProps) {
  const [review,setReview]=useState<{revision:object}>();
  const [notice,setNotice]=useState<{revision:object;text:string}>();
  const tried=useRef<typeof review>();
  const reviewButton=useRef<HTMLButtonElement>(null);
  const firstOrderButton=useRef<HTMLButtonElement>(null);
  const queuedReceipt=useRef<HTMLParagraphElement>(null);
  const focusAfterAction=useRef<'order'|'receipt'>();
  useEffect(()=>{
    if(focusAfterAction.current==='order')firstOrderButton.current?.focus({preventScroll:true});
    if(focusAfterAction.current==='receipt')queuedReceipt.current?.focus({preventScroll:true});
    focusAfterAction.current=undefined;
  },[revision]);
  const reviewId=useId();
  const canEnter=role.kind==='observer'&&role.canEnter&&!!onEnter;
  const currentReview=canEnter&&review?.revision===revision?review:undefined;
  const cancelReview=()=>{setReview(undefined);reviewButton.current?.focus({preventScroll:true});};
  const say=(text:string)=>setNotice({revision,text});
  return (
    <section aria-label="走进故事" className="mx-auto w-full min-w-0 max-w-xl space-y-4 px-4 pb-8 pt-4 text-slate-100 sm:px-6 sm:pt-8">
      <header className="flex min-w-0 items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <h1 tabIndex={-1} ref={titleRef} className="font-serif text-lg font-semibold text-amber-50 [overflow-wrap:anywhere]">走进故事</h1>
        <button type="button" className={action} disabled={busy} onClick={onBack}>回到故事</button>
      </header>
      <div className="min-w-0 space-y-2 rounded-2xl border border-amber-300/25 bg-slate-900/80 p-4 [overflow-wrap:anywhere] sm:p-6">
        {role.kind==='ensemble' ? <>
          <h2 className="font-serif text-xl font-semibold text-amber-50">主角未定</h2>
          <p className="text-sm leading-relaxed text-slate-300">故事还没有明朗的主线。可以回去看下个月，也可以先看看山河和已有的修士。</p>
        </> : <>
          <h2 className="font-serif text-xl font-semibold text-amber-50">{role.kind==='observer'?(role.opening?'开局可选人物':'主角'):role.isLead?'主角':'入世人物'}：{role.name}</h2>
          {role.kind==='observer'&&!canEnter&&<>
            <p className="text-sm leading-relaxed text-slate-300">{role.unavailable??'这位人物此刻不能入世。'}{role.opening?'也可以保持旁观，不改变世界。':'可以先读主角在场见到的事；只读，不改变世界。'}</p>
            {onFollow&&<button type="button" className={primary} disabled={busy} onClick={()=>{
              if(!onFollow())say('此时无法打开主角见闻，没有改变世界。');
            }}>跟随主角的见闻</button>}
          </>}
          {role.kind==='observer'&&canEnter&&<>
            <p className="text-sm leading-relaxed text-slate-300">{role.opening?'此人是刚入门的修士，不是预定的主角。':'从旁观切换为入世，就能为下个月选一次行动。'}</p>
            <button type="button" className={primary} disabled={busy} ref={reviewButton} aria-expanded={!!currentReview}
              aria-controls={currentReview?reviewId:undefined} onClick={()=>{
                setNotice(undefined);setReview(currentReview?undefined:{revision});
              }}>以{role.name}入世</button>
            {currentReview&&onEnter&&<div id={reviewId} role="group" aria-label="确认入世" className="space-y-2 rounded-lg border border-amber-400/35 p-2 text-sm text-slate-300">
              <p>确认会使用 {AVATAR_POSSESSION_COST} 神识暂时引导这位修士，不会推进月份，也不会替你选择行动。</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={primary} disabled={busy} onClick={()=>{
                  if(busy||tried.current===currentReview)return;tried.current=currentReview;
                  setReview(undefined);if(onEnter())focusAfterAction.current='order';else {
                    say('暂不能入世，未切换人物。');reviewButton.current?.focus({preventScroll:true});
                  }
                }}>确认入世</button>
                <button type="button" className={action} onClick={cancelReview}>先不入世</button>
              </div>
            </div>}
          </>}
          {role.kind==='playing'&&<>
            <p className="text-sm leading-relaxed text-slate-300">你正在引导{role.name}。为下个月选一次行动，或者不下令，让人物自己选择。</p>
            {role.queued ? <p ref={queuedReceipt} tabIndex={-1} role="status" className="text-sm text-amber-200">已安排下个月{role.queued==='other'?'的一项行动':ORDERS[role.queued]}。回到故事按「看下个月」才过月。</p>
              : role.canOrder&&onOrder ? <>
                <p className="text-xs text-slate-400">排入一项用 {AVATAR_ORDER_COST} 神识；到下个月还要核对当时条件。</p>
                <div className="flex flex-wrap gap-2">
                  {(['REST','CULTIVATE'] as const).map(order=><button type="button" key={order} ref={order==='REST'?firstOrderButton:undefined} className={action} disabled={busy} onClick={()=>{
                    if(onOrder(order)){focusAfterAction.current='receipt';setNotice(undefined);}else say('这项行动未能安排，没有推进月份。');
                  }}>下月{ORDERS[order]}</button>)}
                </div>
              </> : <p className="text-sm text-slate-300">{role.unavailable??'此刻不能再安排行动，仍可回到故事。'}</p>}
          </>}
        </>}
        {notice?.revision===revision&&<p role="status" className="text-sm text-amber-200">{notice.text}</p>}
      </div>
      {openings}
      <details className="group min-w-0 rounded-lg border border-slate-800 px-3 text-sm text-slate-300 [overflow-wrap:anywhere]">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">更多工具<span aria-hidden="true" className="shrink-0 group-open:rotate-90">›</span></summary>
        <button type="button" className={`${action} mb-3`} disabled={busy} onClick={onTools}>查看地图、纪事与存档</button>
      </details>
    </section>
  );
}
