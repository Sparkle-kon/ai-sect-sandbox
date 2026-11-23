import { useEffect, useId, useMemo, useRef } from 'react';
import { buildWorldAnalytics } from '../engine/analyticsEngine';
import type { TimelineSnapshot } from '../engine/timelineEngine';
import type { WorldState } from '../types/world';

type Analytics = ReturnType<typeof buildWorldAnalytics>;
type Cause = Analytics['mortality']['byCause'][number]['cause'];
const CAUSES: Record<Cause, { label: string; color: string }> = {
  tribulation: { label: '渡劫', color: '#a78bfa' },
  combat: { label: '斗法', color: '#fb7185' },
  lifespan: { label: '寿元耗尽', color: '#fbbf24' },
  hazard: { label: '地形灾害', color: '#fb923c' },
  expedition: { label: '秘境远征', color: '#22d3ee' },
  beast: { label: '野兽', color: '#4ade80' },
  politics: { label: '宗门政变', color: '#60a5fa' },
  unknown: { label: '原因未知', color: '#94a3b8' },
};

const card = 'min-w-0 space-y-2 rounded-lg border border-slate-800 bg-slate-900/65 p-3';
const disclosure = 'cursor-pointer text-xs font-medium text-indigo-200 underline decoration-indigo-400/40 underline-offset-2';
const numerals = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const integer = (value: number) => numerals.format(value);
const chartColor = (value: string) => /^#[a-f0-9]{3,8}$/i.test(value) ? value : '#a5b4fc';
const realmColors = ['#67e8f9', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#c084fc', '#f472b6', '#fb7185', '#fdba74'];

function PopulationHistory({ population }: { population: Analytics['population'] }) {
  const { points, byRealm } = population;
  if (points.length === 0) return null;
  const first = points[0].tick;
  const last = points[points.length - 1].tick;
  const scale = Math.max(1, ...points.map((point) => point.byRealm.reduce((sum, row) => sum + row.living, 0)));
  const gap = 296 / Math.max(1, last - first);
  const barWidth = Math.max(1, Math.min(16, gap * 0.7));
  const x = (tick: number) => tick === first && first === last ? 174 : 26 + (tick - first) * gap;
  return (
    <details className="border-t border-slate-800 pt-2">
      <summary className={disclosure}>查看历史境界分布</summary>
      <p className="mt-1 text-xs text-slate-400">在世人数按境界堆叠；只显示实际快照。</p>
      <svg viewBox="0 0 348 96" role="img" aria-label="按实际历史快照堆叠各境界在世人数" className="mx-auto block w-full max-w-md">
        <line x1="18" y1="72" x2="330" y2="72" stroke="#475569" />
        <text x="15" y="14" fill="#cbd5e1" fontSize="10">{scale} 人</text>
        <text x={x(first)} y="86" textAnchor="middle" fill="#cbd5e1" fontSize="10">#{first}</text>
        {first !== last && <text x={x(last)} y="86" textAnchor="middle" fill="#cbd5e1" fontSize="10">#{last}</text>}
        {points.map((point) => {
          let bottom = 72;
          return <g key={point.tick}>{point.byRealm.map(({ realm, living }, index) => {
            const height = living / scale * 48;
            bottom -= height;
            return <rect key={realm} x={x(point.tick) - barWidth / 2} y={bottom} width={barWidth} height={height} fill={realmColors[index % realmColors.length]} />;
          })}</g>;
        })}
      </svg>
      <ul className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-300">
        {byRealm.map(({ realm }, index) => <li key={realm} className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: realmColors[index % realmColors.length] }} />{realm}
        </li>)}
      </ul>
      <details className="mt-2">
        <summary className={disclosure}>查看各刻实际人数（在世／陨落）</summary>
        <div className="mt-1 max-h-44 overflow-auto">
          <table className="w-full whitespace-nowrap text-left text-xs text-slate-300">
            <caption className="sr-only">历史境界人口，在世／陨落</caption>
            <thead><tr><th scope="col" className="pr-2">Tick</th>{byRealm.map(({ realm }) => <th key={realm} scope="col" className="pr-2">{realm}</th>)}</tr></thead>
            <tbody>{points.map((point) => <tr key={point.tick}><th scope="row">#{point.tick}</th>
              {point.byRealm.map(({ realm, living, fallen }) => <td key={realm} className="pr-2">{living}／{fallen}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </details>
  );
}

function RealmChart({ population }: { population: Analytics['population'] }) {
  const rows = population.byRealm.slice().reverse();
  const max = Math.max(1, ...rows.flatMap(({ living, fallen }) => [living, fallen]));
  const height = 35 + rows.length * 24;
  return (
    <section className={card} aria-label="境界人口金字塔">
      <h3 className="text-sm font-semibold text-slate-100">境界人口金字塔</h3>
      <p className="text-xs text-slate-300"><span className="text-cyan-200">在世 {population.living}</span> · <span className="text-rose-200">陨落 {population.fallen}</span></p>
      <svg viewBox={`0 0 348 ${height}`} role="img" aria-label="按境界对比人数，在世向左、陨落向右" className="mx-auto block w-full max-w-md">
        <text x="32" y="16" fill="#a5f3fc" fontSize="11">在世 ←</text>
        <text x="316" y="16" fill="#fecdd3" fontSize="11" textAnchor="end">→ 陨落</text>
        <path d={`M143,24V${height - 5} M205,24V${height - 5}`} stroke="#475569" strokeWidth="1" />
        {rows.map(({ realm, living, fallen }, index) => {
          const y = 34 + index * 24;
          const liveWidth = living / max * 111;
          const fallenWidth = fallen / max * 111;
          return (
            <g key={realm}>
              <rect x={143 - liveWidth} y={y - 9} width={liveWidth} height="14" fill="#0891b2" rx="2" />
              <rect x="205" y={y - 9} width={fallenWidth} height="14" fill="#e11d48" rx="2" />
              <text x="174" y={y + 1} fill="#e2e8f0" fontSize="11" textAnchor="middle">{realm}</text>
              <text x="26" y={y + 1} fill="#cffafe" fontSize="10" textAnchor="end">{living}</text>
              <text x="322" y={y + 1} fill="#ffe4e6" fontSize="10">{fallen}</text>
            </g>
          );
        })}
      </svg>
      <details>
        <summary className={disclosure}>查看人数表</summary>
        <table className="mt-2 w-full text-left text-xs text-slate-300">
          <caption className="sr-only">各境界在世与陨落人数</caption>
          <thead><tr><th scope="col">境界</th><th scope="col">在世</th><th scope="col">陨落</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.realm}><th scope="row">{row.realm}</th><td>{row.living}</td><td>{row.fallen}</td></tr>)}</tbody>
        </table>
      </details>
      <PopulationHistory population={population} />
    </section>
  );
}

function TreasuryChart({ treasury }: { treasury: Analytics['treasury'] }) {
  const { sects, points } = treasury;
  const first = points[0]?.tick ?? 0;
  const last = points.at(-1)?.tick ?? first;
  const max = Math.max(1, ...points.flatMap(({ balances }) => Object.values(balances)));
  const x = (tick: number) => first === last ? 180 : 32 + (tick - first) / (last - first) * 296;
  const y = (value: number) => 126 - value / max * 100;

  return (
    <section className={card} aria-label="宗门公库变化">
      <h3 className="text-sm font-semibold text-slate-100">宗门公库变化</h3>
      <p className="text-xs text-slate-400">仅绘制本时间线已保存的真实灵石余额，缺失刻度不补线。</p>
      {points.length > 0 && sects.length > 0 ? (
        <>
          <svg viewBox="0 0 360 155" role="img" aria-label={`宗门公库灵石余额折线，Tick #${first} 至 #${last}`} className="mx-auto block w-full max-w-lg">
            <path d="M32,26V126H328 M32,76H328" fill="none" stroke="#475569" strokeWidth="1" />
            <text x="31" y="16" fill="#cbd5e1" fontSize="10">{integer(max)} 灵石</text>
            <text x="28" y="129" textAnchor="end" fill="#cbd5e1" fontSize="10">0</text>
            <text x={x(first)} y="145" textAnchor={first === last ? 'middle' : 'start'} fill="#cbd5e1" fontSize="10">#{first}</text>
            {last !== first && <text x={x(last)} y="145" textAnchor="end" fill="#cbd5e1" fontSize="10">#{last}</text>}
            {sects.map((sect) => {
              let previous: { tick: number; balance: number } | undefined;
              return <g key={sect.id}>{points.map((point) => {
                const balance = point.balances[sect.id];
                if (balance === undefined) { previous = undefined; return null; }
                const prior = previous;
                previous = { tick: point.tick, balance };
                return (
                  <g key={point.tick} fill={chartColor(sect.color)} stroke={chartColor(sect.color)}>
                    {prior && prior.tick + 1 === point.tick && <line x1={x(prior.tick)} y1={y(prior.balance)} x2={x(point.tick)} y2={y(balance)} strokeWidth="2" />}
                    <circle cx={x(point.tick)} cy={y(balance)} r="2" />
                  </g>
                );
              })}</g>;
            })}
          </svg>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
            {sects.map((sect) => <li key={sect.id} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: chartColor(sect.color) }} />{sect.name}
            </li>)}
          </ul>
          <details>
            <summary className={disclosure}>查看实际余额表</summary>
            <div className="mt-2 max-h-48 overflow-auto">
              <table className="w-full whitespace-nowrap text-left text-xs text-slate-300">
                <caption className="sr-only">按 Tick 保存的实际公库余额</caption>
                <thead><tr><th scope="col" className="pr-2">Tick</th>{sects.map((sect) => <th key={sect.id} scope="col" className="pr-2">{sect.name}</th>)}</tr></thead>
                <tbody>{points.map((point) => <tr key={point.tick}><th scope="row">#{point.tick}</th>
                  {sects.map((sect) => <td key={sect.id} className="pr-2">{point.balances[sect.id] === undefined ? '无记录' : integer(point.balances[sect.id])}</td>)}
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        </>
      ) : <p className="text-xs text-slate-400">暂无公库时间序列。</p>}
    </section>
  );
}

function MortalityChart({ mortality, coverage }: { mortality: Analytics['mortality']; coverage: Analytics['coverage'] }) {
  const circumference = 2 * Math.PI * 37;
  let offset = 0;
  return (
    <section className={card} aria-label="观察窗口死亡原因">
      <h3 className="text-sm font-semibold text-slate-100">观察窗口死亡原因</h3>
      <p className="text-xs text-slate-300">Tick #{coverage.firstTick}–#{coverage.lastTick} · 已观察 {mortality.total} 人
        {coverage.leftCensoredDeaths > 0 ? ` · 窗口前已陨落 ${coverage.leftCensoredDeaths} 人（不计入图中）` : ''}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {mortality.total > 0 && (
          <svg viewBox="0 0 112 112" role="img" aria-label="按死亡原因所占比例的圆环图" className="w-28 shrink-0">
            <circle cx="56" cy="56" r="37" fill="none" stroke="#334155" strokeWidth="14" />
            {mortality.byCause.filter(({ count }) => count > 0).map(({ cause, count }) => {
              const length = count / mortality.total * circumference;
              const from = offset;
              offset += length;
              return <circle key={cause} cx="56" cy="56" r="37" fill="none" stroke={CAUSES[cause].color} strokeWidth="14"
                transform="rotate(-90 56 56)" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-from} />;
            })}
            <text x="56" y="61" fontSize="16" textAnchor="middle" fill="#f8fafc">{mortality.total}</text>
          </svg>
        )}
        <ul className="grid min-w-0 flex-1 grid-cols-1 gap-x-3 gap-y-1 text-xs text-slate-300 min-[360px]:grid-cols-2">
          {mortality.byCause.map(({ cause, count }) => (
            <li key={cause} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CAUSES[cause].color }} />
              {CAUSES[cause].label} {count}
            </li>
          ))}
        </ul>
      </div>
      {mortality.total === 0 && <p className="text-xs text-slate-400">此窗口未观察到死亡转变。</p>}
      {mortality.records.length > 0 && (
        <details>
          <summary className={disclosure}>查看观察记录与区间</summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-slate-300">
            {mortality.records.map((record) => <li key={record.actorId} className="break-words">
              {record.name} · {CAUSES[record.cause].label} · Tick #{record.fromTick}–#{record.throughTick}
            </li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

function FameBoard({ label, people }: { label: string; people: Analytics['hallOfFame']['living'] }) {
  return (
    <section className={card} aria-label={label}>
      <h3 className="text-sm font-semibold text-slate-100">{label}</h3>
      <p className="text-xs text-slate-400">按记录的战力排序。</p>
      {people.length === 0 ? <p className="text-xs text-slate-400">暂无入榜记录。</p> : (
        <ol className="space-y-1.5 text-xs text-slate-300">
          {people.map((person) => <li key={person.actorId} className="rounded bg-slate-950/60 p-2">
            <p className="break-words font-semibold text-slate-100">{person.rank}. {person.name}</p>
            <p className="mt-0.5 break-words">{person.realm} {person.realmStage} 层 · 战力 {integer(person.combatPower)} · 贡献 {integer(person.contribution)}</p>
          </li>)}
        </ol>
      )}
    </section>
  );
}

export function AnalyticsModal({ world, history, open, onClose }: {
  world: WorldState;
  history?: readonly TimelineSnapshot[];
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const analysis = useMemo(() => open ? buildWorldAnalytics(world, history?.filter(({ tick }) => tick <= world.tick)) : undefined,
    [open, world, history]);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const current = dialog.current;
    const before = document.activeElement;
    if (!current.open) current.showModal();
    return () => {
      if (current.open) current.close();
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, [open]);

  if (!analysis) return null;
  const { coverage, population, treasury, mortality, hallOfFame } = analysis;
  return (
    <dialog ref={dialog} aria-labelledby={titleId} className="xianxia-frame xianxia-dialog m-auto max-h-[88vh] w-[min(94vw,56rem)] overflow-auto rounded-2xl border border-indigo-500/40 bg-slate-950 p-0 text-slate-100 shadow-2xl backdrop:bg-black/70"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="space-y-3 p-3 sm:p-5">
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 pb-2">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-indigo-100">天机数据大屏</h2>
            <p className="text-xs text-slate-300">当前视图 Tick #{world.tick} · 有效快照 {coverage.snapshotCount} 帧 · 缺失 {coverage.missingTicks} 刻
              {!coverage.completeFromStart ? ' · 并非从创世起完整覆盖' : ' · 从创世起连续覆盖'}
            </p>
          </div>
          <button type="button" aria-label="关闭天机数据大屏" onClick={onClose} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200">关闭</button>
        </header>
        <div className="grid gap-2 lg:grid-cols-2"><RealmChart population={population} /><TreasuryChart treasury={treasury} /></div>
        <MortalityChart mortality={mortality} coverage={coverage} />
        <div className="grid gap-2 sm:grid-cols-2">
          <FameBoard label="封神榜 · 在世" people={hallOfFame.living} />
          <FameBoard label="陨落榜 · 已陨" people={hallOfFame.fallen} />
        </div>
      </div>
    </dialog>
  );
}
