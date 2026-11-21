import { visibleQiWeather } from '../engine/weatherEngine';
import type { QiWeatherReading } from '../engine/weatherEngine';
import type { Cultivator, WorldState } from '../types/world';
import { createTerrainMapView } from './terrainMapView';
import { FieldObservatoryPanel } from './FieldObservatoryPanel';

const KIND_STYLE: Record<QiWeatherReading['kind'], string> = {
  平息: 'text-slate-300', 灵潮: 'text-teal-200', 罡风: 'text-amber-200', 霜息: 'text-sky-200',
};

const level = (intensity: number) => Math.round(intensity * 100);

export function WeatherAtlasPanel({ world, cultivator }: { world: WorldState; cultivator: Cultivator | undefined }) {
  const view = createTerrainMapView(world, cultivator, true);
  const observations = new Map((cultivator?.alive ? visibleQiWeather(world, cultivator) : [])
    .filter(({ locationId }) => view.isCurrentLocation(locationId)).map((entry) => [entry.locationId, entry]));
  const sites = view.seenLocations.slice().sort((a, b) =>
    Number(b.id === cultivator?.locationId) - Number(a.id === cultivator?.locationId) ||
    Number(observations.has(b.id)) - Number(observations.has(a.id)));
  return (
    <section className="min-w-0 space-y-2 rounded-xl border border-teal-500/25 bg-slate-900/70 p-3 text-slate-100 sm:p-4" aria-label="四时灵潮图鉴">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-teal-100">四时灵潮图鉴</h3>
        <p className="break-words text-xs text-slate-300">
          {cultivator ? `${cultivator.name}的视野 · 当前实测 ${observations.size} 处` : '选择修士后查看其能观测的地点。'}
        </p>
        <p className="text-xs text-slate-400">实测与预测分开。预测不是当前实况；未观测地点不提供当地读数。</p>
      </header>
      {sites.length === 0 ? (
        <p className="text-xs text-slate-400">{cultivator ? '该修士尚无可见或已探索的地点。' : '未选中修士，无观察数据。'}</p>
      ) : (
        <div className="max-h-[24rem] space-y-1.5 overflow-y-auto">
          {sites.map((location) => {
            const site = observations.get(location.id);
            const current = site?.observed.tick === world.tick ? site.observed : undefined;
            const forecast = current ? (site?.forecast ?? []).filter(({ tick }) => tick > world.tick) : [];
            return (
              <details key={location.id} className="min-w-0 rounded border border-slate-800 bg-slate-950/60 p-2">
                <summary className="cursor-pointer break-words text-xs text-slate-100">
                  {location.name} · {current ? <span className={KIND_STYLE[current.kind]}>已观测：{current.kind}</span> : '当前未观测'}
                </summary>
                <div className="mt-2 space-y-2 text-xs text-slate-300">
                  {current ? (
                    <section aria-label={`${location.name}的当前观测`} className="space-y-1">
                      <h4 className="font-semibold text-teal-100">实测 · Tick #{current.tick}</h4>
                      <p>{current.season} · {current.kind} · 强度 {level(current.intensity)}%</p>
                      <meter aria-label={`${location.name}实测强度`} min={0} max={1} value={current.intensity} className="h-2 w-full max-w-40" />
                    </section>
                  ) : (
                    <p className="text-slate-400">已知地点，但当前没有可用观测，不显示当地实况或预测。</p>
                  )}
                  {forecast.length > 0 && (
                    <section aria-label={`${location.name}的未来预测`} className="space-y-1 border-t border-slate-800 pt-2">
                      <h4 className="font-semibold text-sky-200">未来预测 · 非实测</h4>
                      <ul className="grid gap-1 sm:grid-cols-3">
                        {forecast.map(({ tick, season, kind, intensity }) => (
                          <li key={tick} className="break-words rounded bg-slate-900/90 p-1.5">
                            <span className="block text-slate-400">Tick #{tick} · {season}</span>
                            <span className={KIND_STYLE[kind]}>{kind}</span> · 强度 {level(intensity)}%
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
      <FieldObservatoryPanel world={world} cultivator={cultivator} />
    </section>
  );
}
