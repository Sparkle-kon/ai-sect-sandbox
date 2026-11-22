import { useMemo, useState } from 'react';
import { EraProvenanceSection, hasEraProvenance, type EraProvenanceReading } from './EraProvenanceSection';
import type { EraHistoryQuery, EraHistoryView } from '../engine/eraHistoryIndex';

export type EraHistoryCursor = { tick: number; eventId: string };
export interface EraHistoryOption { query: EraHistoryQuery; label: string }
export interface EraHistoryPanelProps {
  scopeKey: string;
  options: readonly EraHistoryOption[];
  readProvenance?: () => EraProvenanceReading;
  read: (query: EraHistoryQuery, before?: EraHistoryCursor, limit?: number) => readonly EraHistoryView[];
}
const PAGE_SIZE = 12;
const sourceLabel: Record<EraHistoryView['source'], string> = {
  live_event: '原始纪事尚存',
  public_archive: '近期原件已不在，公开卷册仍有留本',
  native_receipt: '未找到可核读的原始纪事，仍有原生凭据',
  source_lost: '原件已不可查，仅存当时登记的索引',
};
const subjectLabel: Record<EraHistoryQuery['kind'], string> = {
  actor: '人物', sect: '宗门', settlement: '村镇', workshop: '工坊订单',
};
const appointmentLabel = { election: '选举', challenge: '挑战', coup: '夺位' } as const;
const orderLabel = { completed: '结案', expired: '到期', cancelled: '终止' } as const;
const control = 'min-h-11 min-w-0 max-w-full rounded border border-slate-700 bg-slate-950 px-2 text-slate-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-50';
const sameQuery = (a: EraHistoryQuery, b: EraHistoryQuery) => a.kind === b.kind && a.id === b.id;

function receiptText(receipt: EraHistoryView['receipt'], query: EraHistoryQuery) {
  switch (receipt.kind) {
    case 'death': return '记载修士陨落';
    case 'succession': return `记载宗门掌门继任 · ${appointmentLabel[receipt.method]}`;
    case 'migration': {
      const direction = query.kind !== 'settlement' ? '迁徙' : receipt.toSettlementId === query.id ? '迁入' : '迁出';
      return `记载村民${direction} · ${receipt.people} 人`;
    }
    case 'workshop': return `工坊原单${orderLabel[receipt.status]} · 实际交割 ${receipt.delivered} 件`;
  }
}

export function EraHistoryReceipts({ rows, query }: { rows: readonly EraHistoryView[]; query: EraHistoryQuery }) {
  if (!rows.length) return <p className="text-xs text-slate-400">本分支现存的可查凭据里，没有这一项的记录。</p>;
  return (
    <ol aria-label="本分支可查的年代旧事" className="min-w-0 space-y-1.5">
      {rows.map(({ receipt, source }) => (
        <li key={receipt.eventId} className="space-y-0.5 rounded border border-slate-800 p-2 text-xs leading-relaxed [overflow-wrap:anywhere]">
          <p className="font-medium text-amber-100">{receiptText(receipt, query)}</p>
          <p className="text-slate-300">仙历 {receipt.year} 年 {receipt.month} 月 · 第 {receipt.tick} 轮</p>
          <p className="text-slate-400">{sourceLabel[source]}。</p>
        </li>
      ))}
    </ol>
  );
}

export function EraHistoryPanel({ scopeKey, options, read, readProvenance }: EraHistoryPanelProps) {
  return <EraHistoryPortal key={scopeKey} options={options} read={read} readProvenance={readProvenance} />;
}

function EraHistoryPortal({ options, read, readProvenance }: Omit<EraHistoryPanelProps, 'scopeKey'>) {
  const [open, setOpen] = useState(false);
  const provenance=useMemo(()=>open&&options.length>0?readProvenance?.():undefined,[open,options.length,readProvenance]);
  const [selected, setSelected] = useState<EraHistoryQuery>();
  const [trail, setTrail] = useState<EraHistoryCursor[]>([]);
  const matches = selected ? options.filter(({ query }) => sameQuery(query, selected)) : [];
  const exact = matches.length === 1 ? matches[0] : undefined;
  const lastCursor = trail.at(-1);
  const page = open && exact ? read(exact.query, lastCursor, PAGE_SIZE + 1) : [];
  const displayed = page.slice(0, PAGE_SIZE);
  const last = displayed.at(-1)?.receipt;
  if (!options.length) return null;

  return (
    <details className="min-w-0 rounded border border-amber-500/25 bg-slate-950/50"
      onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer px-2 py-2.5 text-xs font-semibold text-amber-100 [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">查阅年代旧事</summary>
      <div className="space-y-2 px-2 pb-2">
        <p className="text-xs text-slate-400">只查当前阅读分支中可核对的凭据。索引不会补写缺失的原件。</p>
        <label className="grid gap-1 text-xs text-slate-300">选择要查的对象
          <select className={`${control} w-full text-base`} value={exact ? String(options.indexOf(exact)) : ''}
            onChange={(event) => {
              const choice = options.find((_, ordinal) => String(ordinal) === event.currentTarget.value);
              setSelected(choice?.query);
              setTrail([]);
            }}>
            <option value="">请选择</option>
            {options.map(({ query, label }, ordinal) => (
              <option key={`${query.kind}:${query.id}`} value={ordinal}>{subjectLabel[query.kind]} · {label}</option>
            ))}
          </select>
        </label>
        {open && exact && <>
          <EraHistoryReceipts rows={displayed} query={exact.query} />
          {(trail.length > 0 || page.length > PAGE_SIZE) && <div className="flex flex-wrap gap-1">
            {trail.length > 0 && <button type="button" className={`${control} text-xs`} onClick={() => setTrail((value) => value.slice(0, -1))}>返回较近记录</button>}
            {page.length > PAGE_SIZE && last && <button type="button" className={`${control} text-xs`}
              onClick={() => setTrail((value) => [...value, { tick: last.tick, eventId: last.eventId }])}>查看更早记录</button>}
          </div>}
        </>}
        {open && hasEraProvenance(provenance) && <EraProvenanceSection reading={provenance} />}
      </div>
    </details>
  );
}
