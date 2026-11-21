import type { projectAlignedWeather } from '../engine/alignedWeatherEngine';
import type { AlignedWeatherComparison } from '../types/world';

type Pair = ReturnType<typeof projectAlignedWeather>[number];
type Sample = NonNullable<Pair['first']>;
const STATUS: Record<AlignedWeatherComparison['status'], string> = {
  offered: '待独立同意，尚未并读', compared: '两份原读数已并读',
  declined: '邀约被谢绝，未并读', withdrawn: '邀约已撤回，未并读', expired: '邀约已到期，未并读',
};
export const stationLabel = (station?: 'center' | 'edge') => station === 'edge' ? '台缘' : '台心';
const shownIntensity = (x: number) => String(Math.round(x * 1000) / 10);
function NativeReading({ report }: { report: Sample }) {
  return <>{stationLabel(report.station)} · {report.reading.kind} · 强度 {shownIntensity(report.reading.intensity)}%</>;
}

export function AlignedWeatherReceipts({ comparisons }: { comparisons: readonly Pair[] }) {
  if (!comparisons.length) return null;
  return <section aria-label="同刻异读与观象复核" className="min-w-0 space-y-1.5 break-words border-t border-slate-800 pt-2">
    <h4 className="font-semibold text-teal-100">同刻异读与观象复核</h4>
    <p>同一处、同一轮，两份旧实测各自留档。不合成读数，也不把旧实测当作当前天象或预测。</p>
    <ol className="max-h-64 space-y-1.5 overflow-y-auto">
      {comparisons.map((row) => {
        const paired = row.status === 'compared' && row.first && row.second ? { first: row.first, second: row.second } : undefined;
        const rounding = paired && paired.first.reading.intensity !== paired.second.reading.intensity &&
          shownIntensity(paired.first.reading.intensity) === shownIntensity(paired.second.reading.intensity);
        return <li key={row.id} className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
          <p className="font-semibold text-teal-100">{row.siteName} · {row.role === 'proposer' ? '本人发起' : '本人受邀'} · {STATUS[row.status]}</p>
          <p>原实测第 {row.measuredTick} 轮（距今 {row.ageTicks} 轮） · 第 {row.offeredTick} 轮邀约
            {row.status === 'offered' && ` · 第 ${row.expiresTick} 轮起失效`}
            {row.settledTick !== undefined && ` · 第 ${row.settledTick} 轮${paired ? '实际并读' : '结案'}`}。</p>
          {paired ? <>
            <ul aria-label="两份独立旧实测" className="grid gap-1 sm:grid-cols-2">
              <li className="rounded bg-slate-900/70 p-1.5">第一份：<NativeReading report={paired.first} /></li>
              <li className="rounded bg-slate-900/70 p-1.5">第二份：<NativeReading report={paired.second} /></li>
            </ul>
            {row.outcome === 'agrees' && <p className="text-emerald-200">两份原读数一致。仅限该次实测，不代表其他地点或时段。</p>}
            {row.outcome === 'uncertain' && <p className="text-amber-200">原读数有差异，仍不确定；不取平均，也不判哪份是真值。
              {rounding && '显示值经取整后相同，原记录的强度仍有差异。'}</p>}
          </> : row.first ? <p>仅本人原读数：<NativeReading report={row.first} />。不显示对方读数。</p>
            : <p>没有获准并读的测值；此邀约不代表对方已有读数。</p>}
        </li>;
      })}
    </ol>
  </section>;
}
