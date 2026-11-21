import { useEffect, useRef, useState } from 'react';
import { ScrollText } from 'lucide-react';
import type { WorldEvent } from '../types/world';
import type { CausalChronicleView } from '../engine/chronicleCausalityEngine';
import type { ChronicleFocusOptions, ChronicleFocusRequest } from '../engine/chronicleFocusEngine';
import { DialogueTranscript } from './DialogueTranscript';

export type ChronicleCategoryFilter = 'all' | WorldEvent['category'];
export interface ChronicleFeedPosition { listScrollTop: number; pageScrollY: number }
export interface ChronicleFeedReturn extends ChronicleFeedPosition { token: number; request: ChronicleFocusRequest }

interface ChronicleFeedProps {
  events: WorldEvent[];
  category?: ChronicleCategoryFilter;
  onCategoryChange?: (value: ChronicleCategoryFilter) => void;
  focusOptions?: (eventId: string) => ChronicleFocusOptions;
  onJump?: (request: ChronicleFocusRequest, position: ChronicleFeedPosition) => void;
  returnPosition?: ChronicleFeedReturn;
  onReturnHandled?: (token: number) => void;
  focusNotice?: string;
  causality?: (eventId: string) => CausalChronicleView | undefined;
}

const CATEGORY_BADGE: Record<
  WorldEvent['category'],
  { label: string; className: string }
> = {
  breakthrough: {
    label: '破境机缘',
    className: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  combat: {
    label: '惊天斗法',
    className: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
  intrigue: {
    label: '暗流算计',
    className: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  },
  heavenly: {
    label: '天道异象',
    className: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  death: {
    label: '道消陨落',
    className: 'bg-red-600/30 text-red-200 border-red-500/50',
  },
  diplomacy: {
    label: '论道交游',
    className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
};

const control = 'min-h-11 min-w-0 max-w-full rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300';
const kindLabel: Record<ChronicleFocusRequest['kind'], string> = { site: '地图', actor: '人物', sect: '宗门' };

export const findChronicleReturnTarget = <T extends { dataset: DOMStringMap }>(
  elements: ArrayLike<T>, request: ChronicleFocusRequest,
): T | undefined => Array.from(elements).find(({ dataset }) =>
  dataset.eventId === request.eventId && dataset.targetKind === request.kind && dataset.targetId === request.targetId);

export function ChronicleFeed({
  events, category, onCategoryChange, focusOptions, onJump, returnPosition, onReturnHandled, focusNotice, causality,
}: ChronicleFeedProps) {
  const [localCategory, setLocalCategory] = useState<ChronicleCategoryFilter>('all');
  const filter = category ?? localCategory;
  const visible = filter === 'all' ? events : events.filter((entry) => entry.category === filter);
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLSelectElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const handled = useRef<number>();
  const onHandled = useRef(onReturnHandled);
  onHandled.current = onReturnHandled;

  useEffect(() => {
    if (!returnPosition || handled.current === returnPosition.token) return;
    let second: number | undefined;
    // The feed is lazy and can remount when the workspace comes back. Wait for its layout.
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        const list = listRef.current;
        if (!list) return;
        const original = findChronicleReturnTarget(list.querySelectorAll<HTMLButtonElement>('button[data-chronicle-focus]'), returnPosition.request);
        (original ?? filterRef.current ?? headingRef.current)?.focus({ preventScroll: true });
        list.scrollTop = returnPosition.listScrollTop;
        window.scrollTo({ top: returnPosition.pageScrollY, left: 0, behavior: 'instant' });
        handled.current = returnPosition.token;
        onHandled.current?.(returnPosition.token);
      });
    });
    return () => {
      window.cancelAnimationFrame(first);
      if (second !== undefined) window.cancelAnimationFrame(second);
    };
  }, [returnPosition]);

  return (
    <div className="flex h-[340px] min-w-0 flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-start gap-2">
          <ScrollText aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-400" />
          <h3 tabIndex={-1} ref={headingRef} className="min-w-0 break-words text-xs font-bold text-slate-200">修仙界天机编年史 (World Chronicle)</h3>
        </div>
        <span className="text-[11px] text-slate-400">共记录 {events.length} 条因果</span>
        {(onCategoryChange || category !== undefined) && <label className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-slate-300">
          纪事分类
          <select ref={filterRef} className={control} value={filter} onChange={(event) => {
            const value = event.currentTarget.value;
            if (value !== 'all' && !Object.hasOwn(CATEGORY_BADGE, value)) return;
            const next = value as ChronicleCategoryFilter;
            if (category === undefined) setLocalCategory(next);
            onCategoryChange?.(next);
            if (listRef.current) listRef.current.scrollTop = 0;
          }}>
            <option value="all">全部</option>
            {(Object.keys(CATEGORY_BADGE) as WorldEvent['category'][]).map((value) => <option key={value} value={value}>{CATEGORY_BADGE[value].label}</option>)}
          </select>
        </label>}
      </div>
      {focusNotice && <p role="status" className="mb-1 break-words text-xs text-amber-200">{focusNotice}</p>}
      <div ref={listRef} aria-label="纪事列表" className="min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {!visible.length && <p className="p-2 text-xs text-slate-400">这个分类暂无纪事。</p>}
        {visible.map((evt) => {
          const badge = CATEGORY_BADGE[evt.category];
          const options = evt.witnessScope !== 'participants' && onJump ? focusOptions?.(evt.id) : undefined;
          const cause = evt.witnessScope !== 'participants' ? causality?.(evt.id) : undefined;
          return (
            <article key={evt.id} className="min-w-0 space-y-1 rounded-lg border border-slate-800/80 bg-slate-950/80 p-2.5">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}>{badge.label}</span>
                  <span className="min-w-0 break-words text-xs font-semibold text-slate-100">{evt.title}</span>
                </div>
                <span className="whitespace-nowrap text-[11px] text-slate-400">仙历 {evt.year}年{evt.month}月</span>
              </div>
              <p className="break-words text-xs leading-relaxed text-slate-300">{evt.description}</p>
              {options && options.links.length > 0 && <div className="flex min-w-0 flex-wrap gap-1" aria-label="可查看的纪事词条">
                {options.links.filter((link) => link.eventId === evt.id).map(({ label, eventId, kind, targetId }) => (
                  <button type="button" key={`${kind}:${targetId}`} data-chronicle-focus
                    data-event-id={eventId} data-target-kind={kind} data-target-id={targetId}
                    className={`${control} break-words py-1 text-left text-amber-100`}
                    onClick={() => onJump?.({ eventId, kind, targetId }, { listScrollTop: listRef.current?.scrollTop ?? 0, pageScrollY: window.scrollY })}>
                    {kindLabel[kind]}：{label}
                  </button>
                ))}
              </div>}
              {options?.withheld && <p className="text-xs text-slate-400">部分词条当前不可定位，不显示未核实位置。</p>}
              {cause?.entry.eventId === evt.id && (cause.previous.length > 0 || cause.entry.outcome !== undefined) && <ChronicleCausalityReceipt view={cause} />}
              {evt.dialogue && <DialogueTranscript dialogue={evt.dialogue} />}
            </article>
          );
        })}
      </div>
    </div>
  );
}

const causalFactLabel: Record<CausalChronicleView['entry']['kind'], string> = {
  siege_launched: '发起围攻', truce_signed: '停战签订', sect_vacancy: '掌门职位出缺', sect_election: '掌门选举',
  market_buy_order: '挂出买单', market_sell_order: '挂出卖单', market_shipment: '商队启程', market_settlement: '交易结算',
};
const causalRelationLabel: Record<CausalChronicleView['previous'][number]['relation'], string> = {
  withdrew_siege: '停战实际撤回的围攻', filled_vacancy: '选举实际填补的空缺',
  matched_buy_order: '实际撮合的买单', matched_sell_order: '实际撮合的卖单', settled_shipment: '实际结算的商队',
};
const causalOutcomeLabel: Record<NonNullable<CausalChronicleView['entry']['outcome']>, string> = {
  truce_with_withdrawal: '停战生效，并有围攻实际撤回', truce_signed: '停战生效',
  elected: '已正式选出掌门', local_fill: '已在本地交割', delivered: '商队已到货交割',
  route_loss: '路途货损', escort_failed: '护送失败，货物未交割', endpoint_missing: '站点已失效，未完成交割', market_closed: '坊市关闭，未完成交割',
};

function ChronicleCausalityReceipt({ view }: { view: CausalChronicleView }) {
  return <details className="min-w-0 rounded border border-slate-800 bg-slate-900/55">
    <summary className="min-h-11 cursor-pointer break-words px-2 py-2 text-xs font-semibold text-amber-100">逆查可证原因</summary>
    <div className="space-y-1.5 px-2 pb-2 text-xs leading-relaxed text-slate-300">
      <p>按公开实录逆查：先看结果，再看确有凭据的前因。</p>
      <CausalTrace node={view} />
      <p className="text-slate-400">只展示当前可核验的链路。止于此处不代表没有更早原因；不以同名纪事补链。</p>
    </div>
  </details>;
}

function CausalTrace({ node }: { node: CausalChronicleView }) {
  return <>
    <p className="break-words"><span className="font-semibold text-slate-200">{causalFactLabel[node.entry.kind]} · Tick #{node.entry.tick}</span>
      {node.entry.outcome !== undefined && ` · 实际结果：${causalOutcomeLabel[node.entry.outcome]}`}</p>
    {node.previous.length > 0 && <ol className="space-y-1 border-l border-slate-700 pl-2" aria-label="已核验的前因">
      {node.previous.map(({ relation, node: predecessor }) => <li key={`${relation}:${predecessor.entry.eventId}`} className="min-w-0">
        <p className="break-words text-amber-200">{causalRelationLabel[relation]}</p>
        <CausalTrace node={predecessor} />
      </li>)}
    </ol>}
  </>;
}
