import { useState } from 'react';
import { getFurnaceView } from '../engine/furnaceReservationEngine';
import { projectFurnaceSafety, type FurnaceSafetyView } from '../engine/furnaceSafetyEngine';
import type { Cultivator, WorldState } from '../types/world';

type FurnaceView = NonNullable<ReturnType<typeof getFurnaceView>>;
const PAGE_SIZE = 8;
const button = 'min-h-11 rounded border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 disabled:opacity-40';
const SLOT_STATUS: Record<FurnaceView['slots'][number]['status'], string> = { free: '可用', reserved: '已留位', used: '本回合已用' };
const OWN_STATUS: Record<FurnaceView['ownReservations'][number]['status'], string> = {
  queued: '排队中', reserved: '已留位', used: '已实际使用', cancelled: '预约已取消', expired: '预约已过期',
};
const CLOSE: Record<NonNullable<FurnaceView['ownReservations'][number]['reason']>, string> = {
  owner_cancelled: '本人取消', actor_unavailable: '本人已无法继续', site_unavailable: '炉点失效',
  workshop_closed: '关联委托已结束', queue_expired: '等候期限已到', turn_missed: '留位回合未用',
};
const WORK: Record<FurnaceView['ownUses'][number]['kind'], string> = {
  brew: '炼丹', forge: '锻造', repair: '修复', awaken: '唤醒器灵', workshop: '工坊委制', relic: '遗珍组装',
};
const SAFETY_WORK: Record<FurnaceSafetyView['ownReceipts'][number]['kind'], string> = { inspect: '查验', repair: '修复', reopen: '签署复炉' };

export function FurnaceReservationPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator }) {
  const viewer = world.cultivators.find(({ id }) => id === cultivator.id);
  const safety = viewer && projectFurnaceSafety(world, viewer);
  const view = safety && getFurnaceView(world, viewer);
  const site = view && world.locations.find(({ id }) => id === view.siteId);
  if (!view || !site) return null;
  return <FurnaceQueueReceipt key={`${viewer?.id}:${site.id}`} view={view} siteName={site.name} safety={safety} />;
}

export function FurnaceQueueReceipt({ view, siteName, safety }: { view: FurnaceView; siteName: string; safety?: FurnaceSafetyView }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(view.queue.length / PAGE_SIZE));
  const shownPage = Math.min(page, pages - 1);
  const ownPosition = view.queue.find(({ isOwn }) => isOwn)?.position;
  const own = view.ownReservations.find(({ status }) => status === 'queued' || status === 'reserved');
  const ownReceipts = view.ownReservations.filter(({ status }) => status !== 'queued' && status !== 'reserved')
    .sort((a, b) => (b.closedTick ?? b.requestedTick) - (a.closedTick ?? a.requestedTick)).slice(0, PAGE_SIZE);
  const ownUses = view.ownUses.slice().sort((a, b) => b.tick - a.tick || a.slot - b.slot).slice(0, PAGE_SIZE);
  const installedGrade = safety?.installedGrade ?? view.installedCapacity;
  const closed = view.closed || (safety !== undefined && safety.status !== 'open');
  const free = closed ? 0 : view.slots.filter(({ status }) => status === 'free').length;
  return <details className="min-w-0 rounded border border-indigo-400/20 bg-slate-950/60">
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-indigo-200">同刻炉位与预约</summary>
    <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
      <p className="break-words">当前可查炉点：{siteName} · Tick #{view.tick}
        {installedGrade && ` · 装设 ${installedGrade} 阶`} · 本回合可用炉位 {free} 个{!closed && `（共 ${view.capacity} 个）`}</p>
      <p>预约只排炉位，不托管灵石、药材或器物。委托原料仍由原委托独立托管。此处只读。</p>
      {closed && <p className="break-words font-medium text-amber-200">{safety?.status === 'reopening'
        ? '已签署复炉，本回合仍停用；下一回合起才可重新分配炉位。'
        : '炉点停用，本回合不分配炉位，也不能用炉。'}</p>}
      {safety?.damagedTick !== undefined && <div className="space-y-1 border-t border-slate-800 pt-2">
        <p className="break-words">兽潮损炉 Tick #{safety.damagedTick} · 炉体完好度 {safety.integrity}/100
          {safety.reopenedTick !== undefined && ` · 复炉签署 Tick #${safety.reopenedTick}`}</p>
        {(safety.lastInspectedTick !== undefined || safety.lastRepairTick !== undefined) &&
          <p>{safety.lastInspectedTick !== undefined && `查验 Tick #${safety.lastInspectedTick}`}
            {safety.lastInspectedTick !== undefined && safety.lastRepairTick !== undefined && ' · '}
            {safety.lastRepairTick !== undefined && `最近修复 Tick #${safety.lastRepairTick}`}</p>}
        {safety.ownReceipts.length > 0 && <ul aria-label="本人实际炉务凭据" className="space-y-0.5">
          {safety.ownReceipts.slice(-PAGE_SIZE).map((row) => <li key={`${row.tick}:${row.kind}`}>
            Tick #{row.tick} · 本人{SAFETY_WORK[row.kind]}{row.integrityBefore !== row.integrityAfter && ` · 完好度 ${row.integrityBefore} → ${row.integrityAfter}`}
          </li>)}
        </ul>}
      </div>}
      {!closed && <ol aria-label="本回合炉位状态" className="grid min-w-0 gap-1 sm:grid-cols-3">
        {view.slots.map((slot) => <li key={slot.slot} className="break-words rounded border border-slate-800 p-1.5">
          炉位 {slot.slot} · {SLOT_STATUS[slot.status]}{slot.isOwn ? ' · 本人' : ''}
        </li>)}
      </ol>}
      <div className="space-y-1 border-t border-slate-800 pt-2">
        <h5 className="font-semibold text-indigo-100">{closed ? '停炉期间的有效队列' : '当前实际队列'} · {view.queue.length} 位</h5>
        {view.queue.length === 0 ? <p className="text-slate-400">暂无排队预约。</p> : <ol aria-label="依实际顺序排列的等候预约" className="space-y-0.5"
          start={view.queue[shownPage * PAGE_SIZE]?.position ?? 1}>
          {view.queue.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE).map((row) => <li key={row.position} className="break-words rounded border border-slate-800 px-2 py-1">
            第 {row.position} 位{row.isOwn ? '（本人）' : ''} · 申请 Tick #{row.requestedTick} · 截止 Tick #{row.expiresTick} 前
          </li>)}
        </ol>}
        {pages > 1 && <div aria-label="炉位队列分页" className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={button} disabled={shownPage === 0} onClick={() => setPage(shownPage - 1)}>上一页</button>
          <span>第 {shownPage + 1}/{pages} 页</span>
          <button type="button" className={button} disabled={shownPage + 1 === pages} onClick={() => setPage(shownPage + 1)}>下一页</button>
        </div>}
      </div>
      {(own || ownReceipts.length > 0 || ownUses.length > 0) && <div className="space-y-1 border-t border-slate-800 pt-2">
        <h5 className="font-semibold text-indigo-100">本人预约与实际用炉</h5>
        {own && <p>{OWN_STATUS[own.status]} · 申请 Tick #{own.requestedTick}
          {own.status === 'queued' && ownPosition !== undefined && ` · 目前排第 ${ownPosition} 位`}
          {own.assignedTick !== undefined && ` · 留位 Tick #${own.assignedTick}`}
          {own.slot !== undefined && ` · 炉位 ${own.slot}`}
          {own.status === 'queued' && ` · 截止 Tick #${own.expiresTick} 前`}
        </p>}
        {own?.suspendedTicks && own.suspendedTicks > 0 ? <p className="break-words">
          {own.lastSuspendedTick === view.tick && closed && '本回合等候时限已暂停。'}原预约与排队顺序保留，已顺延 {own.suspendedTicks} 回合。
        </p> : null}
        {own?.workshopOrderId && <p>此预约关联工坊委制；委托原截止不因停炉顺延。</p>}
        {ownReceipts.length > 0 && <ul aria-label="本人最近预约结果" className="space-y-0.5">
          {ownReceipts.map((row) => <li key={row.id} className="break-words">{OWN_STATUS[row.status]}{row.closedTick !== undefined && ` · Tick #${row.closedTick}`}
            {row.reason && ` · ${CLOSE[row.reason]}`}
            {row.slot !== undefined && (row.status === 'cancelled' || row.status === 'expired') && ' · 已解除实际留位'}
            {(row.suspendedTicks ?? 0) > 0 && ` · 曾顺延 ${row.suspendedTicks} 回合`}</li>)}
        </ul>}
        {ownUses.length > 0 && <ul aria-label="本人最近实际用炉凭证" className="space-y-0.5">
          {ownUses.map((row) => <li key={`${row.tick}:${row.slot}`}>Tick #{row.tick} · 炉位 {row.slot} · 实际作业：{WORK[row.kind]}</li>)}
        </ul>}
      </div>}
    </div>
  </details>;
}
