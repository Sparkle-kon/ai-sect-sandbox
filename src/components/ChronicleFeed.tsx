import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ScrollText } from 'lucide-react';
import type { WorldEvent } from '../types/world';
import type { CausalChronicleView } from '../engine/chronicleCausalityEngine';
import type { ChronicleFocusOptions, ChronicleFocusRequest } from '../engine/chronicleFocusEngine';
import { isChronicleStoryFact, type ChronicleLead } from '../engine/chronicleLead';
import { publicChronicleExcerpt, writePublicChronicleScene } from '../engine/chroniclePublicProse';
import type { PublicDialogueProvenance } from '../engine/publicDialogueProvenance';
import { CHRONICLE_READING_SECTIONS, hasChronicleReadingPlace, markChronicleReadingPlace, resumeChronicleReadingPlace,
  type ChronicleReadingContext, type ChronicleReadingPlace } from '../engine/chronicleReadingMark';
import { ChronicleReadingMarkButton, ChronicleReadingResumeButton } from './ChronicleReadingControls';
import { PublicDialogueTranscript } from './PublicDialogueTranscript';
import { DialogueTranscript } from './DialogueTranscript';
import { ProtagonistArchive, protagonistCueTitles, type ProtagonistSuccessionView } from './ProtagonistArchive';

export type ChronicleCategoryFilter = 'all' | WorldEvent['category'];
type ProofSection = 'record' | 'cause' | 'dialogue';
interface OpenProof { eventId: string; sections: ProofSection[] }
export interface ChronicleFeedPosition { listScrollTop: number; pageScrollY: number; openProofs?: OpenProof[]; protagonistArchiveOpen?: boolean }
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
  lead?: ChronicleLead;
  succession?: ProtagonistSuccessionView;
  resolvePublicDialogue?: (eventId: string) => PublicDialogueProvenance | undefined;
  reading?: { context: ChronicleReadingContext; saveOrigin?: ChronicleReadingContext; scopeKey: string;
    isCurrent: () => boolean };
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

const sectionFor = (proof: HTMLDetailsElement, section: ProofSection): HTMLDetailsElement | null =>
  section === 'record' ? proof : proof.querySelector(section === 'cause' ? '[data-chronicle-cause]' : '[data-chronicle-dialogue] details');
const sectionNames = CHRONICLE_READING_SECTIONS;
const useReadingLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function captureOpenProofs(proofs: ReadonlyMap<string, HTMLDetailsElement>): OpenProof[] {
  return Array.from(proofs).flatMap(([eventId, proof]) => proof.open
    ? [{ eventId, sections: sectionNames.filter((section) => sectionFor(proof, section)?.open) }] : []);
}

export function reopenChronicleProofs(proofs: ReadonlyMap<string, HTMLDetailsElement>, position: ChronicleFeedReturn) {
  for (const { eventId, sections } of position.openProofs ?? []) {
    const proof = proofs.get(eventId);
    if (!proof) continue;
    for (const name of sections) {
      const section = sectionFor(proof, name);
      if (section) section.open = true;
    }
  }
}

const readingSectionFor = (proof: HTMLDetailsElement, section: ProofSection): HTMLDetailsElement | null =>
  section !== 'dialogue' ? sectionFor(proof,section) :
    proof.querySelector('[data-chronicle-dialogue="verified"] details, [data-chronicle-dialogue="fragment"] details');

/** Returns only the original, connected control, after restoring its presently authorized evidence. */
export function reopenChronicleReadingPlace(proofs: ReadonlyMap<string, HTMLDetailsElement>, place: ChronicleReadingPlace,
  list: HTMLElement, owners: Pick<WeakMap<HTMLDetailsElement,string>,'get'>): HTMLButtonElement | undefined {
  const proof = proofs.get(place.eventId);
  const button = proof?.querySelector<HTMLButtonElement>('button[data-chronicle-reading-mark]');
  if (!proof || owners.get(proof) !== place.eventId || !list.contains(proof) || !button ||
      !place.sections.includes('record') || !place.sections.every((name) => readingSectionFor(proof, name))) return undefined;
  for (const name of sectionNames) {
    const section = sectionFor(proof, name);
    if (section) section.open = place.sections.includes(name);
  }
  return button;
}

export function ChronicleFeed({
  events, category, onCategoryChange, focusOptions, onJump, returnPosition, onReturnHandled, focusNotice, causality, lead, succession, resolvePublicDialogue, reading,
}: ChronicleFeedProps) {
  const [localCategory, setLocalCategory] = useState<ChronicleCategoryFilter>('all');
  const filter = category ?? localCategory;
  const visible = events.filter((entry) => isChronicleStoryFact(entry, Number.MAX_SAFE_INTEGER) &&
    (filter === 'all' || entry.category === filter));
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLSelectElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const protagonistArchive = useRef<HTMLDetailsElement>(null);
  const proofRefs = useRef(new Map<string, HTMLDetailsElement>());
  // Stable native identifiers can encode private roster or ledger keys; never put them in record markup.
  const proofOwners = useRef(new WeakMap<HTMLDetailsElement,string>());
  const handled = useRef<number>();
  const onHandled = useRef(onReturnHandled);
  onHandled.current = onReturnHandled;

  const readingOperation = useRef(0);
  const readingFrame = useRef(reading);
  const [readingStatus, setReadingStatus] = useState<{ scope: string; filter: ChronicleCategoryFilter; text: string }>();
  const [readingPending, setReadingPending] = useState(false);
  const scopeKey = reading?.scopeKey;
  useReadingLayout(() => {
    setReadingPending(false);
    setReadingStatus(undefined);
    return () => { readingOperation.current += 1; readingFrame.current = undefined; };
  }, [scopeKey,filter]);
  useReadingLayout(() => { readingFrame.current = reading; }, [scopeKey,filter,reading]);

  const currentReading = (op: number, useOrigin: boolean) => {
    const frame = readingFrame.current;
    return readingOperation.current === op && frame && frame.isCurrent() ?
      (useOrigin ? frame.saveOrigin : frame.context) : undefined;
  };
  const updateReadingStatus = (op: number, text: string) => {
    if (readingOperation.current !== op || scopeKey === undefined) return;
    setReadingPending(false);
    if (currentReading(op,false)) setReadingStatus({scope:scopeKey,filter,text});
  };
  const readingUnavailable = '此处暂时不能续读。没有打开其他场景。';
  const saveReading = (eventId: string) => {
    const proof = proofRefs.current.get(eventId);
    const list = listRef.current;
    if (!reading || readingPending || !proof?.open || proofOwners.current.get(proof) !== eventId || !list?.contains(proof) || !reading.isCurrent()) return;
    const op = ++readingOperation.current;
    setReadingPending(true);
    setReadingStatus(undefined);
    const position = { sections: sectionNames.filter(name => readingSectionFor(proof,name)?.open),
      listScrollTop:list.scrollTop, pageScrollY:window.scrollY };
    void markChronicleReadingPlace(reading.context.scope,reading.context.world,eventId,position,
      {current:() => currentReading(op,false)}).then(ok => updateReadingStatus(op,ok ? '已记住此场。' : '未能记住此场。'));
  };
  const resumeReading = async () => {
    if (!reading || readingPending || !reading.isCurrent()) return;
    const op = ++readingOperation.current;
    setReadingPending(true);
    setReadingStatus(undefined);
    const useOrigin = !hasChronicleReadingPlace(reading.context.scope) && reading.saveOrigin !== undefined;
    const start = useOrigin ? reading.saveOrigin : reading.context;
    const place = start && await resumeChronicleReadingPlace(start.scope,start.world,{current:() => currentReading(op,useOrigin)});
    const list = listRef.current;
    if (!place || !list || !currentReading(op,useOrigin)) { updateReadingStatus(op,readingUnavailable); return; }
    if (filter !== 'all' && !proofRefs.current.has(place.eventId)) {
      updateReadingStatus(op,'这个分类没有记住的场景。可切到「全部」后重试。');
      return;
    }
    const target = reopenChronicleReadingPlace(proofRefs.current,place,list,proofOwners.current);
    if (!target) { updateReadingStatus(op,readingUnavailable); return; }
    target.focus({preventScroll:true});
    list.scrollTop = place.listScrollTop;
    window.scrollTo({top:place.pageScrollY,left:0,behavior:'instant'});
    target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    updateReadingStatus(op,'已回到记住的场景。');
  };
  const canResume = reading && (hasChronicleReadingPlace(reading.context.scope) ||
    reading.saveOrigin && hasChronicleReadingPlace(reading.saveOrigin.scope));

  useEffect(() => {
    if (!returnPosition || handled.current === returnPosition.token) return;
    let second: number | undefined;
    // The feed is lazy and can remount when the workspace comes back. Wait for its layout.
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        const list = listRef.current;
        if (!list) return;
        const original = findChronicleReturnTarget(list.querySelectorAll<HTMLButtonElement>('button[data-chronicle-focus]'), returnPosition.request);
        reopenChronicleProofs(proofRefs.current, returnPosition);
        if (protagonistArchive.current) protagonistArchive.current.open = returnPosition.protagonistArchiveOpen === true;
        if (original) {
          const proof = proofRefs.current.get(returnPosition.request.eventId);
          if (proof) proof.open = true;
        }
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

  const scenes = visible.map((fact) => ({ fact, scene: writePublicChronicleScene(fact) }));
  const active = filter === 'all' ? succession?.active : undefined;
  const exactLead = succession === undefined || active?.actorId === lead?.actorId ? lead : undefined;
  const leadProofs = filter === 'all' && exactLead ? (() => {
    const sceneById = new Map(scenes.filter(({ fact }) => fact.actorIds.includes(exactLead.actorId) &&
      fact.tick >= exactLead.firstTick && fact.tick <= exactLead.lastTick)
      .map(({ fact, scene }) => [fact.id, scene]));
    return [...new Set(exactLead.eventIds)].flatMap((id) => {
      const scene = sceneById.get(id);
      return scene ? [scene] : [];
    });
  })() : [];
  const leadName = active?.name ?? (succession === undefined && leadProofs.length >= 2 ? exactLead?.name : undefined);
  const leadTitles = leadProofs.length >= 2 ? [leadProofs[0].title, leadProofs[leadProofs.length - 1].title] :
    active ? protagonistCueTitles(active) : [];

  return (
    <div className="flex h-[340px] min-w-0 flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-start gap-2">
          <ScrollText aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-400" />
          <h3 tabIndex={-1} ref={headingRef} className="min-w-0 break-words text-sm font-bold text-slate-100">山河见闻</h3>
        </div>
        {canResume && <ChronicleReadingResumeButton onClick={() => void resumeReading()} disabled={readingPending} />}
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
      {readingStatus && readingStatus.scope === scopeKey && readingStatus.filter === filter &&
        <p role="status" className="mb-1 break-words text-xs text-slate-300">{readingStatus.text}</p>}
      {focusNotice && <p role="status" className="mb-1 break-words text-xs text-amber-200">{focusNotice}</p>}
      <div ref={listRef} aria-label="纪事列表" className="min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {leadName && <aside aria-label="这一卷的主线" className="min-w-0 rounded-lg border border-amber-400/25 bg-amber-950/25 px-2.5 py-2">
          <p className="break-words font-serif text-sm leading-relaxed text-slate-300">这一卷，先随<strong className="text-amber-100">{leadName}</strong>
            {leadTitles.length >= 2 ? `：从〈${leadTitles[0]}〉读到〈${leadTitles[leadTitles.length - 1]}〉。` :
              leadTitles.length === 1 ? `，读到〈${leadTitles[0]}〉。` : '。'}</p>
        </aside>}
        {filter === 'all' && succession && <ProtagonistArchive succession={succession} disclosureRef={protagonistArchive} />}
        {!visible.length && <p className="p-2 text-xs text-slate-400">这个分类暂无见闻。</p>}
        {scenes.map(({ fact: evt, scene }) => {
          const badge = CATEGORY_BADGE[evt.category];
          const options = onJump ? focusOptions?.(evt.id) : undefined;
          const cause = causality?.(evt.id);
          const provenance = resolvePublicDialogue?.(evt.id);
          const description = publicChronicleExcerpt(evt.description);
          return (
            <article key={evt.id} className="min-w-0 space-y-1 rounded-lg border border-slate-800/80 bg-slate-950/80 p-2.5">
              <h4 className="min-w-0 break-words font-serif text-sm font-semibold leading-snug text-slate-100">{scene.title}</h4>
              {scene.paragraph && scene.paragraph !== scene.title &&
                <p className="break-words font-serif text-sm leading-relaxed text-slate-200">{scene.paragraph}</p>}
              <details ref={(node) => {
                if (node) { proofRefs.current.set(evt.id,node); proofOwners.current.set(node,evt.id); }
                else proofRefs.current.delete(evt.id);
              }}
                className="min-w-0 rounded border border-slate-800/80 bg-slate-900/45">
                <summary className="min-h-11 cursor-pointer break-words px-2 py-3 text-xs text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">实录与线索</summary>
                <div className="space-y-1.5 px-2 pb-2 text-xs text-slate-300">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}>{badge.label}</span>
                    <span className="break-words text-[11px] text-slate-400">仙历 {evt.year}年{evt.month}月 · Tick #{evt.tick}</span>
                  </div>
                  <p className="break-words"><strong>{publicChronicleExcerpt(evt.title) || '原实录'}</strong>{description && <>：{description}</>}</p>
                  {options && options.links.length > 0 && <div className="flex min-w-0 flex-wrap gap-1" aria-label="可查看的纪事词条">
                    {options.links.filter((link) => link.eventId === evt.id).map(({ label, eventId, kind, targetId }) => (
                      <button type="button" key={`${kind}:${targetId}`} data-chronicle-focus
                        data-event-id={eventId} data-target-kind={kind} data-target-id={targetId}
                        className={`${control} break-words py-1 text-left text-amber-100`}
                        onClick={() => onJump?.({ eventId, kind, targetId }, { listScrollTop: listRef.current?.scrollTop ?? 0,
                          pageScrollY: window.scrollY, openProofs: captureOpenProofs(proofRefs.current),
                          protagonistArchiveOpen: protagonistArchive.current?.open })}>
                        {kindLabel[kind]}：{label}
                      </button>
                    ))}
                  </div>}
                  {options?.withheld && <p className="text-xs text-slate-400">部分词条当前不可定位，不显示未核实位置。</p>}
                  {cause?.entry.eventId === evt.id && (cause.previous.length > 0 || cause.entry.outcome !== undefined) && <ChronicleCausalityReceipt view={cause} />}
                  {provenance && <div data-chronicle-dialogue={provenance.status}><PublicDialogueTranscript provenance={provenance} /></div>}
                  {!resolvePublicDialogue && evt.dialogue && <div data-chronicle-dialogue><DialogueTranscript dialogue={evt.dialogue} /></div>}
                  {reading && <ChronicleReadingMarkButton disabled={readingPending} onClick={() => saveReading(evt.id)} />}
                </div>
              </details>
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
  return <details className="min-w-0 rounded border border-slate-800 bg-slate-900/55" data-chronicle-cause>
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
