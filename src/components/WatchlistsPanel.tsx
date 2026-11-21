import { useEffect, useId, useRef, useState } from 'react';
import { availableWatchTargets, visibleWatchlists, WATCHLIST_BUCKET_MAX_COUNT, WATCHLIST_MAX_WATCHES } from '../engine/watchlistEngine';
import type { applyWatchMutation, WatchlistCommand } from '../engine/watchlistEngine';
import type { WorldEvent, WorldState } from '../types/world';

export interface WatchlistStamp { world: WorldState; branchId: string; actorId: string | null }
type EngineStatus = Extract<ReturnType<typeof applyWatchMutation>, { ok: false }>['code'];
export type WatchlistWriteStatus = EngineStatus | 'saved' | 'readonly' | 'stale' | 'interrupted' | 'error';
export interface WatchlistsPanelProps {
  world: WorldState;
  actorId: string | null;
  branchId: string;
  readOnly: boolean;
  busy: boolean;
  onWrite: (command: WatchlistCommand, stamp: WatchlistStamp, signal: AbortSignal) => Promise<WatchlistWriteStatus>;
}

type PickTarget = ReturnType<typeof availableWatchTargets>[number];
type WatchKind = PickTarget['target']['kind'];
const KINDS: Record<WatchKind, string> = { actor: '人物', site: '地点', sect: '宗门' };
const CATEGORIES: Record<WorldEvent['category'], string> = {
  breakthrough: '破境', combat: '斗法', intrigue: '算计', heavenly: '异象', death: '陨落', diplomacy: '交游',
};
const control = 'min-h-11 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40';
const TARGET_PAGE_SIZE = 8;

export function getWatchTargetPage(targets: readonly PickTarget[], kind: WatchKind, text: string, requestedPage: number) {
  const normalize = (value: string) => value.normalize('NFKC').trim().toLowerCase();
  const query = normalize(text);
  const found = targets.filter(({ target, label }) => target.kind === kind && (!query || normalize(label).includes(query)));
  const pages = Math.max(1, Math.ceil(found.length / TARGET_PAGE_SIZE));
  const page = Math.min(pages - 1, Math.max(0, Number.isSafeInteger(requestedPage) ? requestedPage : 0));
  return { rows: found.slice(page * TARGET_PAGE_SIZE, (page + 1) * TARGET_PAGE_SIZE), page, pages, count: found.length };
}

function resultMessage(status: WatchlistWriteStatus) {
  if (status === 'saved') return '已保存到当前分支。';
  if (status === 'stale') return '分支、角色或当前回合已变化，没有写入；请重新核对。';
  if (status === 'readonly') return '当前为历史只读或正在推演，没有写入。';
  if (status === 'interrupted') return '本次写入已停止。';
  if (status === 'error') return '未能写入，原记录保留。';
  return {
    unknown_target: '该目标已不在可关注范围内。', not_found: '本分支已没有该关注。',
    duplicate: '本分支已关注该目标。', limit: '本分支关注已达保留上限。',
    unknown_digest: '该回合摘要已无法标记，未修改已读状态。',
  }[status];
}

export function WatchlistsPanel({ world, actorId, branchId, readOnly, busy, onWrite }: WatchlistsPanelProps) {
  const prefix = useId();
  const [kind, setKind] = useState<WatchKind>('actor');
  const [query, setQuery] = useState('');
  const [candidate, setCandidate] = useState('');
  const [pickPage, setPickPage] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<WatchlistWriteStatus>();
  const active = useRef<AbortController>();
  const watching = visibleWatchlists(world, actorId);
  const allowed = readOnly || !actorId ? [] : availableWatchTargets(world, actorId).filter(({ target }) => !watching.some(({ watch }) =>
    watch.target.kind === target.kind && watch.target.id === target.id));
  const options = getWatchTargetPage(allowed, kind, query, pickPage);
  const target = options.rows.find(({ target }) => target.id === candidate)?.target;
  const blocked = readOnly || busy || pending || !actorId;
  const atLimit = watching.length >= WATCHLIST_MAX_WATCHES;

  useEffect(() => {
    setPending(false);
    setNotice(undefined);
    setCandidate('');
    setPickPage(0);
    return () => { active.current?.abort(); active.current = undefined; };
  }, [branchId, actorId, readOnly]);

  const send = async (command: WatchlistCommand) => {
    if (blocked || active.current) return;
    const stamp: WatchlistStamp = { world, branchId, actorId };
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setNotice(undefined);
    try {
      const result = await onWrite(command, stamp, controller.signal);
      if (!controller.signal.aborted && active.current === controller) {
        setNotice(result);
        if (result === 'saved' && command.kind === 'add_watch') setCandidate('');
      }
    } catch {
      if (!controller.signal.aborted) setNotice('error');
    } finally {
      if (active.current === controller) {
        active.current = undefined;
        if (!controller.signal.aborted) setPending(false);
      }
    }
  };

  if (!actorId) return null;
  return (
    <details className="min-w-0 rounded border border-cyan-400/20 bg-slate-950/65">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-cyan-100">静默关注与推演摘要</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>Tick #{world.tick} · {readOnly ? '历史只读' : '当前分支'}。仅记录关注之后完成的回合；同轮按公开事件类别合并。不会发送消息、提醒或推送。</p>
        {!readOnly && <div className="space-y-1.5 rounded border border-slate-800 p-2">
          <div className="grid min-w-0 gap-1.5 sm:grid-cols-2">
            <label htmlFor={`${prefix}-kind`} className="grid min-w-0 gap-1">关注类型
              <select id={`${prefix}-kind`} className={control} value={kind} disabled={blocked} onChange={(event) => {
                if (!Object.hasOwn(KINDS, event.currentTarget.value)) return;
                setKind(event.currentTarget.value as WatchKind); setQuery(''); setCandidate(''); setPickPage(0);
              }}>
                {Object.entries(KINDS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </label>
            <label htmlFor={`${prefix}-search`} className="grid min-w-0 gap-1">搜索可关注目标
              <input id={`${prefix}-search`} className={control} value={query} disabled={blocked} type="search" onChange={(event) => {
                setQuery(event.currentTarget.value); setCandidate(''); setPickPage(0);
              }} />
            </label>
          </div>
          <label htmlFor={`${prefix}-target`} className="grid min-w-0 gap-1">选择目标
            <select id={`${prefix}-target`} className={control} disabled={blocked || options.rows.length === 0}
              value={target?.id ?? ''} onChange={(event) => setCandidate(event.currentTarget.value)}>
              <option value="">请选择</option>
              {options.rows.map(({ target: item, label }) => <option value={item.id} key={item.id}>{label}</option>)}
            </select>
          </label>
          <p className="text-slate-400">匹配 {options.count} 项{options.count > 0 && ` · 第 ${options.page + 1}/${options.pages} 页`}</p>
          {options.pages > 1 && <div className="flex flex-wrap gap-1.5" aria-label="关注目标分页">
            <button type="button" className={control} disabled={blocked || options.page === 0} onClick={() => {
              setPickPage(options.page - 1); setCandidate('');
            }}>上一页</button>
            <button type="button" className={control} disabled={blocked || options.page + 1 === options.pages} onClick={() => {
              setPickPage(options.page + 1); setCandidate('');
            }}>下一页</button>
          </div>}
          <button type="button" className={control} disabled={blocked || atLimit || !target}
            onClick={() => { if (target) void send({ kind: 'add_watch', target }); }}>添加关注</button>
          {atLimit && <p className="text-amber-200">当前分支已达到关注上限，移除不再需要的关注后可再添加。</p>}
        </div>}
        {notice && <p role="status" className={notice === 'saved' ? 'text-cyan-200' : 'text-amber-200'}>{resultMessage(notice)}</p>}
        {watching.length === 0 ? <p className="text-slate-400">此时此分支暂无可查的关注。</p> : (
          <ul aria-label="本人可查的分支关注" className="max-h-[29rem] space-y-2 overflow-y-auto">
            {watching.map(({ watch, label, digests, unread }) => {
              const recent = [...digests].filter(({ tick }) => tick <= world.tick).sort((a, b) => b.tick - a.tick).slice(0, 6);
              const newest = recent[0]?.tick;
              return (
                <li key={watch.id} className="min-w-0 space-y-1.5 break-words rounded border border-slate-800 p-2">
                  <p className="font-semibold text-cyan-100">{KINDS[watch.target.kind]} · {label} · 未读 {unread} 轮</p>
                  <p className="text-slate-400">关注始于 Tick #{watch.createdTick}</p>
                  {recent.length > 0 ? (
                    <ol aria-label="近期已完成回合摘要" className="space-y-1">
                      {recent.map(({ tick, buckets }) => <li key={tick}>Tick #{tick}{tick > watch.readThroughTick ? '（未读）' : '（已读）'} · {
                        buckets.map(({ category, count }) => `${CATEGORIES[category]} ${count >= WATCHLIST_BUCKET_MAX_COUNT ? `${WATCHLIST_BUCKET_MAX_COUNT}+` : count} 件`).join(' · ')
                      }</li>)}
                    </ol>
                  ) : <p className="text-slate-400">尚无关注之后完成的回合摘要。</p>}
                  {!readOnly && <div className="flex flex-wrap gap-1.5">
                    {newest !== undefined && newest > watch.readThroughTick && (
                      <button type="button" className={control} disabled={blocked}
                        onClick={() => void send({ kind: 'mark_read', watchId: watch.id, throughTick: newest })}>截至 Tick #{newest} 均标记已读</button>
                    )}
                    <button type="button" className={control} disabled={blocked} onClick={() => void send({ kind: 'remove_watch', watchId: watch.id })}>移除关注</button>
                  </div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
