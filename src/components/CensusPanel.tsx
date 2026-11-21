import { useState } from 'react';
import { projectVillageCensus } from '../engine/villageCensusEngine';
import type { Cultivator, WorldState } from '../types/world';

type CensusView = NonNullable<ReturnType<typeof projectVillageCensus>>;
const labelClass = 'text-slate-400';
const signedPeople = (n: number) => `${n > 0 ? '+' : ''}${n} 人`;

export function CensusPanel({ world, cultivator, villageId }: { world: WorldState; cultivator: Cultivator; villageId: string }) {
  const [tick, selectTick] = useState<number>();
  const rows = world.villageCensuses.periods
    .filter((period) => period.tick <= world.tick)
    .sort((a, b) => b.tick - a.tick)
    .flatMap((period) => {
      const view = projectVillageCensus(world, cultivator, villageId, period.tick);
      return view ? [view] : [];
    });
  const selected = rows.find((view) => view.tick === tick) ?? rows[0];
  if (!selected) return null;
  return (
    <details className="min-w-0 rounded border border-emerald-400/20 bg-slate-950/55">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-emerald-200">坊籍核点与人口口径</summary>
      <div className="min-w-0 space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>以下只核对该村的坊籍，不重复计入家户抽样，不是一个世界人口上限。只读，不补写缺失变化。</p>
        {rows.length > 1 && (
          <label className="grid min-w-0 gap-0.5">核点月份
            <select className="min-h-11 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100" value={selected.tick} onChange={(event) => selectTick(Number(event.target.value))}>
              {rows.map((view) => <option key={view.tick} value={view.tick}>第 {view.year} 年 {view.month} 月 · Tick #{view.tick}</option>)}
            </select>
          </label>
        )}
        <p>第 {selected.year} 年 {selected.month} 月 · 账期 Tick #{selected.tick}</p>
        <CensusReconciliation view={selected} />
      </div>
    </details>
  );
}

function CensusReconciliation({ view }: { view: CensusView }) {
  const boundary = view.unobservedCrossings;
  const difference = view.residual;
  const count = (row: CensusView['opening']) => `${row.population} 人 · 未成年 ${row.juveniles} 人`;
  return <>
    <dl aria-label="月度人口核对" className="grid gap-1.5 rounded border border-slate-800 p-2 sm:grid-cols-2">
      <div><dt className={labelClass}>月初登记</dt><dd>{count(view.opening)}</dd></div>
      <div><dt className={labelClass}>凭实录推算</dt><dd>{count(view.expected)}</dd></div>
      <div><dt className={labelClass}>月末实录</dt><dd>{view.closed && view.observed ? count(view.observed) : '尚未结账，不以推算代替实录'}</dd></div>
      {difference && <div><dt className={labelClass}>实录减推算</dt><dd>{difference.population === 0 && difference.juveniles === 0
        ? '无差额'
        : `人口 ${signedPeople(difference.population)} · 未成年 ${signedPeople(difference.juveniles)}（未解释，不补登）`}</dd></div>}
    </dl>
    <div>
      <p className="font-semibold text-emerald-100">已核实的本村变动</p>
      <p>出生 {view.births} 人 · 死亡 {view.deaths} 人 · 自愿入门转出 {view.enlisted} 人</p>
      <p>迁入 {view.incoming} 人 · 迁出 {view.outgoing} 人 · 满龄转为成年 {view.matured} 人（不改变总人口）</p>
      {boundary > 0 && <p className={labelClass}>其中 {boundary} 人跨越观测边界，仅计本村端，不披露未观测对端；已包含在迁入／迁出数内。</p>}
    </div>
    <div className="border-t border-slate-800 pt-2">
      <p className="font-semibold text-emerald-100">本人现场签记（不是月末结账）</p>
      {view.observation ? (
        <>
          <p>签记 Tick #{view.tick} · {count(view.observation.count)}</p>
          {view.observation.sample ? <p>抽查 1 户：匿名成年 {view.observation.sample.adults} 人、未成年 {view.observation.sample.juveniles} 人、具名在籍 {view.observation.sample.namedResidents} 人。抽样已在实有人口口径内，不外推、不另加。</p>
            : <p className={labelClass}>本次无家户抽样记录。</p>}
        </>
      ) : <p className={labelClass}>所选修士本月无可见的现场签记。</p>}
    </div>
  </>;
}
