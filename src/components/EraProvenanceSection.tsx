import { useId, useState } from 'react';

interface DatedReading {
  year: number;
  month: number;
  title: string;
}

export interface OriginalReading extends DatedReading {
  kind: 'artifact' | 'oath';
  evidence: string;
}

export interface RelayReading extends DatedReading {
  evidence: string;
}

export interface DiscrepancyReading extends DatedReading {
  statements: readonly [
    { witness: string; claim: string },
    { witness: string; claim: string },
  ];
}

export interface EraProvenanceReading {
  originals: readonly OriginalReading[];
  relays: readonly RelayReading[];
  firsthands?: readonly RelayReading[];
  discrepancies: readonly DiscrepancyReading[];
}

const laneLabels = {
  originals: '核看原件',
  relays: '从转述查起',
  testimony: '核听证词',
} as const;
type Lane = keyof typeof laneLabels;
const rowClass = 'space-y-1 rounded border border-slate-800 px-2 py-1.5 text-xs leading-relaxed [overflow-wrap:anywhere]';
const labelClass = 'min-h-11 rounded border border-slate-700 px-2.5 text-xs font-semibold [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300';
const displayed = 8;
const laneLength = (reading: EraProvenanceReading, lane: Lane) => lane === 'testimony'
  ? (reading.firsthands?.length??0) + reading.discrepancies.length
  : reading[lane].length;

function DateLine({year,month}: Pick<DatedReading,'year'|'month'>) {
  return <p className="text-slate-400">仙历 {year} 年 {month} 月</p>;
}

function MoreRecords({ remaining, onReveal }: { remaining: number; onReveal: () => void }) {
  return remaining > 0
    ? <button className={labelClass} type="button" onClick={onReveal}>再读 {Math.min(remaining,displayed)} 条</button>
    : null;
}

export function hasEraProvenance(reading?: EraProvenanceReading): reading is EraProvenanceReading {
  return !!reading && ((Object.keys(laneLabels) as Lane[]).some((lane)=>laneLength(reading,lane)>0));
}

/** Projection has already authorized these records for one branch/frame/reader. This UI does not widen that scope. */
export function EraProvenanceSection({ reading }: { reading: EraProvenanceReading }) {
  const groupId = useId();
  const [chosen, setChosen] = useState<Lane>();
  const [limit, setLimit] = useState(displayed);
  const lanes = (Object.keys(laneLabels) as Lane[]).filter((key) => laneLength(reading,key)>0);
  if (!lanes.length) return null;
  const lane = chosen && lanes.includes(chosen) ? chosen : undefined;

  return <section className="min-w-0 space-y-1.5 border-t border-slate-800 pt-2" aria-labelledby={`${groupId}-heading`}>
    <h5 id={`${groupId}-heading`} className="text-xs font-semibold text-amber-100">百代留痕</h5>
    <p className="text-xs leading-relaxed text-slate-400">卷页可散，旧事未必无迹。只读当前视角能核到的凭据。</p>
    <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="查读旧事的方式">
      {lanes.map((key) => <button key={key} type="button" className={`${labelClass} ${lane===key?'bg-amber-950 text-amber-100':'bg-slate-950 text-slate-200'}`}
        aria-expanded={lane === key} aria-controls={lane === key ? `${groupId}-reading` : undefined}
        onClick={() => { setChosen(lane === key ? undefined : key); setLimit(displayed); }}>{laneLabels[key]}</button>)}
    </div>
    {lane && <div id={`${groupId}-reading`} className="min-w-0 space-y-1.5" aria-label={laneLabels[lane]}>
      <EraProvenanceRows reading={reading} lane={lane} limit={limit} />
      <MoreRecords remaining={laneLength(reading,lane)-limit} onReveal={() => setLimit((n) => n+displayed)} />
    </div>}
  </section>;
}

export function EraProvenanceRows({reading,lane,limit=displayed}: {reading:EraProvenanceReading;lane:Lane;limit?:number}) {
  if (lane==='originals') return <>
    <p className="text-xs text-slate-400">眼下确有原件可查，不将抄本混作真迹。</p>
    <ul className="space-y-1.5">
      {reading.originals.slice(0,limit).map((row,index)=><li className={rowClass} key={index}>
        <p className="font-medium text-amber-100">{row.kind==='artifact'?'遗物原件':'签契原件'} · {row.title}</p>
        <DateLine {...row} />
        <p className="text-slate-300">{row.evidence}</p>
      </li>)}
    </ul>
  </>;
  if (lane==='relays') return <>
    <p className="text-xs text-slate-400">先沿已知转述读下去。转述不是亲历，也不是原件。</p>
    <ul className="space-y-1.5">
      {reading.relays.slice(0,limit).map((row,index)=><li className={rowClass} key={index}>
        <p className="font-medium text-amber-100">{row.title}</p>
        <DateLine {...row} />
        <p className="text-slate-300">{row.evidence}</p>
      </li>)}
    </ul>
  </>;
  const firsthands=reading.firsthands?.slice(0,limit)??[];
  const discrepancies=reading.discrepancies.slice(0,Math.max(0,limit-firsthands.length));
  return <>
    {firsthands.length > 0 && <ul className="space-y-1.5" aria-label="亲历证词">
      {firsthands.map((row,index)=><li className={rowClass} key={index}>
        <p className="font-medium text-amber-100">亲历 · {row.title}</p>
        <DateLine {...row} />
        <p className="text-slate-300">{row.evidence}</p>
      </li>)}
    </ul>}
    {discrepancies.length > 0 && <>
      <p className="text-xs text-slate-400">证词有异。两人说的是同一件事，卷中照录，不替任何一方判真伪。</p>
      <ul className="space-y-1.5" aria-label="说法不一的证词">
      {discrepancies.map((row,index)=><li className={rowClass} key={index}>
        <p className="font-medium text-amber-100">{row.title}</p>
        <DateLine {...row} />
        <dl className="space-y-1 text-slate-300">
          {row.statements.map(({witness,claim},i)=><div className="rounded bg-slate-950/60 p-1.5" key={i}>
            <dt className="font-medium">证词 {i+1} · {witness}</dt><dd>{claim}</dd>
          </div>)}
        </dl>
      </li>)}
      </ul>
    </>}
  </>;
}
