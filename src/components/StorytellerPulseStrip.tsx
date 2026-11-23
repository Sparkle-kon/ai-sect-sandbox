import type { projectStorytellerPulse } from '../engine/storytellerDirector';

type Pulse = NonNullable<ReturnType<typeof projectStorytellerPulse>>;
type Point = Pulse['points'][number];

const SPAN = 23;
const CHART = { width: 144, height: 32, inset: 3 } as const;
const labelDate = (point: Point) => `仙历 ${point.year} 年 ${point.month} 月`;

const valid = (point: Point): boolean =>
  Number.isSafeInteger(point.tick) && point.tick >= 0 && Number.isSafeInteger(point.year) &&
  Number.isSafeInteger(point.month) && point.month >= 1 && point.month <= 12 &&
  Number.isInteger(point.tension) && point.tension >= 0 && point.tension <= 100;

function coordinates(tick: number, tension: number, endTick: number) {
  const { width, height, inset } = CHART;
  const x = inset + (width - inset * 2) * (tick - (endTick - SPAN)) / SPAN;
  const y = height - inset - (height - inset * 2) * tension / 100;
  return { x, y };
}

export function StorytellerPulseStrip({ view }: { readonly view: Pulse }) {
  const { current } = view;
  if (!valid(current)) return null;
  const counts = new Map<number, number>();
  for (const point of view.points) counts.set(point.tick, (counts.get(point.tick) ?? 0) + 1);
  const days = view.points.filter(point => valid(point) && counts.get(point.tick) === 1 &&
    point.tick <= current.tick && point.tick >= current.tick - SPAN).sort((a, b) => a.tick - b.tick);
  if (!days.some(point => point.tick === current.tick && point.tension === current.tension &&
    point.year === current.year && point.month === current.month)) return null;
  const path = days.map((point, index) => {
    const { x, y } = coordinates(point.tick, point.tension, current.tick);
    const command = days[index - 1]?.tick === point.tick - 1 ? 'L' : 'M';
    return `${command}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  const recent = coordinates(current.tick, current.tension, current.tick);
  const { width, height, inset } = CHART;

  return <details className="group col-span-2 min-w-0 rounded-md border border-amber-400/25 bg-slate-900/70 lg:order-4 lg:col-span-1">
    <summary className="grid min-h-[44px] cursor-pointer list-none grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded px-2 py-1
      focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-xs font-semibold text-amber-100">{view.title}</span>
          <span className="text-xs tabular-nums text-amber-200">{current.tension} / 100</span>
          <span aria-hidden="true" className="inline-block text-amber-300 group-open:rotate-180">⌄</span>
        </span>
        <span className="block text-xs text-slate-300">{labelDate(current)}</span>
      </span>
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false" className="block h-8 w-full min-w-0">
        <path d={`M${inset} ${height / 2}H${width - inset} M${inset} ${height - inset}H${width - inset}`}
          fill="none" stroke="#334155" strokeWidth="1"/>
        <path d={path} fill="none" stroke="#eac58a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {days.filter((point, index) => index + 1 < days.length && days[index - 1]?.tick !== point.tick - 1 &&
          days[index + 1]?.tick !== point.tick + 1).map(point => {
          const { x, y } = coordinates(point.tick, point.tension, current.tick);
          return <circle key={point.tick} cx={x} cy={y} r="1.35" fill="#d7ab67" />;
        })}
        <circle cx={recent.x} cy={recent.y} r="2.6" fill="#fde7a4" />
      </svg>
    </summary>
    <div className="space-y-2 border-t border-amber-400/15 px-2 pb-2 pt-1.5 text-xs leading-5 text-slate-200 [overflow-wrap:anywhere]">
      <p><strong className="text-amber-100">{current.beatLabel}</strong></p>
      <p>{current.reasonLabel ?? '这一月没有新抉择。'}</p>
      <ol reversed role="list" aria-label="最近二十四月内的天势记录" tabIndex={days.length > 5 ? 0 : undefined}
        className="max-h-32 space-y-0.5 overflow-y-auto rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200">
        {[...days].reverse().map(point => <li key={point.tick} className="flex flex-wrap justify-between gap-x-2">
          <span>{labelDate(point)} · {point.beatLabel}</span>
          <span className="shrink-0 tabular-nums text-amber-200">{point.tension} / 100</span>
        </li>)}
      </ol>
    </div>
  </details>;
}
