import {useState} from 'react';
import {AlchemyWorkshopCanvas} from './AlchemyWorkshopCanvas';
import type {AlchemyWorkshopFrame} from './alchemyWorkshopVisualModel';
import { projectLocalSeedCulture, projectSeedCulture } from '../engine/seedCultureEngine';
import { SEED_LOT_UNITS, SEED_PLOT_UNITS, SEED_READY_TICKS, SEED_SOURCE_HERBS } from '../engine/seedCultureTerms';
import type { Cultivator, SeedPlot, SeedWeather, WorldState } from '../types/world';

const LOSS: Record<NonNullable<SeedPlot['loss']>['reason'], string> = {
  site_hazard: '田圃遭遇实际灾险', owner_died: '原持有人已故', site_lost: '原地已不可用',
  spoiled: '成熟后未及时实收', failed_germination: '田圃实测未出苗',
};
const number = (x: number) => String(Math.round(x * 10) / 10);

function SeedReading({ reading }: { reading: SeedWeather }) {
  return <span>第 {reading.tick} 轮：{reading.season} · {reading.kind} · 强度 {number(reading.intensity * 100)}% · 土地灵气 {number(reading.soilQi)}</span>;
}

export function SeedCulturePanel({ world, cultivator,workshop }: { world: WorldState; cultivator: Cultivator;workshop?:AlchemyWorkshopFrame }) {
  const [open,setOpen]=useState(false);
  const local = projectLocalSeedCulture(world, cultivator);
  const { lots, plots } = projectSeedCulture(world, cultivator);
  if (!local && !lots.length && !plots.length) return null;
  const batchNumbers = new Map(lots.map(({ id }, index) => [id, index + 1]));

  return <details className="min-w-0 rounded border border-emerald-400/25 bg-slate-950/60" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer break-words px-3 py-2.5 text-xs font-semibold text-emerald-100">留种与实测试验</summary>
    <div className="min-w-0 space-y-2 break-words px-3 pb-3 text-xs leading-relaxed text-slate-300">
      {workshop?.garden&&<AlchemyWorkshopCanvas key={workshop.siteId} frame={workshop} kind="garden" active={open}/>}
      {local && <p>本地田圃实况：生长中 {local.growing} 圃 · 实熟待收 {local.ready} 圃。不公开持有人、种册或产量。</p>}
      {lots.length > 0 && <section aria-label="本人种册与小样实测" className="space-y-1.5">
        <h5 className="font-semibold text-emerald-100">本人种册与小样实测</h5>
        <p>种册实余独立记账，不是随身的成熟翡翠灵叶。每次出苗只说明当次所取小样，不代表整批出苗率。</p>
        <ol className="max-h-64 space-y-1.5 overflow-y-auto">
          {lots.map((lot, index) => <li key={lot.id} className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
            <p className="font-medium text-emerald-100">种册第 {index + 1} 批 · 第 {lot.createdTick} 轮实耗翡翠灵叶 {SEED_SOURCE_HERBS} 株、留种 {SEED_LOT_UNITS} 枚。</p>
            <p>当前种册实余 {lot.remaining} 枚种子。</p>
            {lot.loss && <p className="text-amber-200">第 {lot.loss.tick} 轮实损余种 {lot.loss.units} 枚：{LOSS[lot.loss.reason]}。未转成药材。</p>}
            {lot.tests.length > 0 && <ol aria-label="逐次小样出苗记录" className="space-y-1 border-t border-slate-800 pt-1">
              {lot.tests.map((trial) => <li key={trial.tick} className="rounded bg-slate-900/70 p-1.5">
                <p>第 {trial.tick} 轮实耗小样 {trial.sample} 枚；实见出苗 {trial.sprouted}/{trial.sample}。</p>
                <p className="text-slate-400">原观测：<SeedReading reading={trial.weather} />。</p>
              </li>)}
            </ol>}
          </li>)}
        </ol>
      </section>}
      {plots.length > 0 && <section aria-label="本人田圃与实收历史" className="space-y-1.5">
        <h5 className="font-semibold text-emerald-100">本人田圃与实收</h5>
        <ol className="max-h-64 space-y-1.5 overflow-y-auto">
          {plots.map((plot) => <li key={plot.id} className="min-w-0 space-y-1 rounded border border-slate-800 p-2">
            <p>第 {plot.plantedTick} 轮实种 {SEED_PLOT_UNITS} 枚
              {batchNumbers.has(plot.lotId) && `（种册第 ${batchNumbers.get(plot.lotId)} 批）`}。</p>
            {plot.status === 'growing' && <p>仍在生长；第 {plot.maturesTick} 轮待核验，不视为可收。</p>}
            {plot.status === 'ready' && plot.maturedTick !== undefined && plot.yield !== undefined && <>
              <p className="text-emerald-200">第 {plot.maturedTick} 轮实熟：翡翠灵叶 {plot.yield} 株仍在田圃，尚未移入随身药材。</p>
              <p>第 {plot.maturedTick + SEED_READY_TICKS} 轮起未收则损。</p>
            </>}
            {plot.status === 'harvested' && plot.settledTick !== undefined && plot.yield !== undefined &&
              <p className="text-emerald-200">第 {plot.settledTick} 轮已实收翡翠灵叶 {plot.yield} 株。此为当时交割，不代表现在仍持有。</p>}
            {plot.status === 'lost' && plot.loss && <p className="text-amber-200">
              {plot.settledTick !== undefined && `第 ${plot.settledTick} 轮`}实损 {plot.loss.units} {plot.loss.good === 'jade_seed' ? '枚种子' : '株翡翠灵叶'}：{LOSS[plot.loss.reason]}。未记入实收。
            </p>}
            {plot.weather.length > 0 && <ul aria-label="田圃逐轮原观测" className="space-y-1 text-slate-400">
              {plot.weather.map((reading) => <li key={reading.tick}><SeedReading reading={reading} /></li>)}
            </ul>}
          </li>)}
        </ol>
      </section>}
    </div>
  </details>;
}
