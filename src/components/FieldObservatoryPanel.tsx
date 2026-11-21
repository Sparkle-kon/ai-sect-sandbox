import { OBSERVATORY_COST, OBSERVATORY_LEAD_TICKS, projectFieldObservatory } from '../engine/fieldObservatoryEngine';
import type { Cultivator, WorldState } from '../types/world';

type View = ReturnType<typeof projectFieldObservatory>;
type Reading = View['runs'][number]['baseline'];

const asDecimal = (value: number) => String(Math.round(value * 10) / 10);
const describe = ({ kind, intensity }: Reading) => `${kind} · 强度 ${asDecimal(intensity * 100)}%`;

export function FieldObservatoryPanel({ world, cultivator }: { world: WorldState; cultivator?: Cultivator }) {
  const { runs, received, metrics } = projectFieldObservatory(world, cultivator);
  if (runs.length === 0 && received.length === 0) return null;
  return (
    <details className="min-w-0 rounded border border-teal-400/20 bg-slate-950/60">
      <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-teal-100">观象台与区域实测校准</summary>
      <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-slate-300">
        <p>临时野外观测与上方图鉴分开。只读；预测不是实况，转递不更新实况。</p>
        {runs.length > 0 && <section aria-label="本人野外观测" className="space-y-1.5">
          <h4 className="font-semibold text-teal-100">本人野外观测</h4>
          <p>每次建台由本人实付 {OBSERVATORY_COST} 灵石，目标为建台后第 {OBSERVATORY_LEAD_TICKS} 轮。仅按已取得的目标实测校准；漏测和未到期均不计入。</p>
          {metrics.scored > 0 ? <p>已校准 {metrics.scored} 次 · 类型命中 {metrics.kindHits}/{metrics.scored}
            {metrics.meanIntensityErrorPp !== undefined && ` · 强度平均绝对误差 ${asDecimal(metrics.meanIntensityErrorPp)} 个百分点`}</p>
            : <p className="text-slate-400">尚无可计分的实际读数。</p>}
          <ol className="max-h-56 space-y-1.5 overflow-y-auto">
            {runs.map((run) => <li key={`${run.locationId}:${run.openedTick}`} className="min-w-0 break-words rounded border border-slate-800 p-2">
              <p className="font-semibold text-teal-100">{run.locationName} · 建台 Tick #{run.openedTick}</p>
              <p>建台基线：{describe(run.baseline)}</p>
              <p>目标 Tick #{run.targetTick} 的基线延续预测：{describe(run.forecast)}（非实测）</p>
              {run.status === 'pending' && <p>等待目标回合的现场读数。</p>}
              {run.status === 'missed' && <p>目标回合漏测 · 不填补读数，不计入校准。</p>}
              {run.status === 'measured' && run.reading && <>
                <p>目标实测 Tick #{run.targetTick}：{describe(run.reading)}</p>
                {run.kindHit !== undefined && <p>类型{run.kindHit ? '命中' : '未命中'}
                  {run.intensityErrorPp !== undefined && ` · 强度绝对误差 ${asDecimal(run.intensityErrorPp)} 个百分点`}</p>}
                {run.relayTick !== undefined && <p>原实测已转递 · Tick #{run.relayTick}。</p>}
              </>}
            </li>)}
          </ol>
        </section>}
        {received.length > 0 && <section aria-label="收到的转递旧观测" className="space-y-1.5 border-t border-slate-800 pt-2">
          <h4 className="font-semibold text-teal-100">收到的旧实测（非当前实况）</h4>
          <ol className="max-h-44 space-y-1.5 overflow-y-auto">
            {received.map((report, index) => <li key={`${report.locationId}:${report.measuredTick}:${report.relayedTick}:${index}`} className="min-w-0 break-words rounded border border-slate-800 p-2">
              <p className="font-semibold text-teal-100">{report.locationName} · 已过时 {report.ageTicks} 轮</p>
              <p>原实测 Tick #{report.measuredTick}：{describe(report.reading)}</p>
              <p>转递 Tick #{report.relayedTick} · 仅传原实测，不是当地现况或预测。</p>
            </li>)}
          </ol>
        </section>}
      </div>
    </details>
  );
}
