import { useEffect, useMemo, useState } from 'react';
import {
  TERRAIN_QUIET_TICKS, TERRAIN_RECOVERY_LIMIT, TERRAIN_RECOVERY_ROOTS, TERRAIN_RECOVERY_STONES,
  TERRAIN_STRESS_TICKS, visibleTerrainSuccession,
} from '../engine/terrainSuccessionEngine';
import type { Cultivator, MapTile, WorldState } from '../types/world';
import type { createTerrainMapView } from './terrainMapView';
import { observedRouteTargets, proveObservedTerrainRoute } from './observedRouteProof';
import type { ObservedRouteProof } from './observedRouteProof';
import { RoadMaintenancePanel } from './RoadMaintenancePanel';
import { RouteWarningPanel } from './RouteWarningPanel';

type TerrainView = ReturnType<typeof createTerrainMapView>;
type Cell = ReturnType<typeof visibleTerrainSuccession>[number];
const PHASE: Record<Cell['phase'], string> = { stressed: '持续受损', recovering: '正在恢复', recovered: '已恢复至当地上限', scarred: '保留永久损伤' };
const LIMIT = 8;
const control = 'min-h-11 min-w-0 rounded border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:opacity-40';
const tileLabel = (tile: MapTile) => `第 ${tile.row + 1} 行、第 ${tile.col + 1} 列`;

export function TerrainRouteReceipt({ proof, alternate }: { proof: ObservedRouteProof; alternate?: boolean }) {
  if (proof.kind === 'invalid') return <p>{alternate ? '绕行地格无效，须不是起点或终点且当前可见。' : '请选择两个不同的当前可见地点。'}</p>;
  if (proof.kind !== 'connected') return <p>当前观测范围不足以证明{alternate ? '绕行可通' : '连通'}；不等于道路已阻断。</p>;
  const sample = proof.tiles.slice(0, LIMIT);
  return (
    <div className="space-y-0.5">
      <p className="font-semibold text-emerald-200">{alternate ? '已核实绕行可通' : '已核实路线连通'} · 穿越 {Math.max(0, proof.tiles.length - 1)} 步地格</p>
      <p className="break-words">{sample.map(tileLabel).join(' → ')}{proof.tiles.length > sample.length && ` · 另有 ${proof.tiles.length - sample.length} 个已观测地格`}</p>
    </div>
  );
}

export function TerrainSuccessionPanel({ world, view, selected }: { world: WorldState; view: TerrainView; selected?: Cultivator }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [avoid, setAvoid] = useState('');
  const [cursor, setCursor] = useState(0);
  const [inspect, setInspect] = useState<{
    world: WorldState; view: TerrainView; route: ObservedRouteProof; alternate?: ObservedRouteProof;
  }>();
  useEffect(() => { setInspect(undefined); }, [world, view]);
  const terrain = useMemo(() => new Map(world.terrain.tiles.map((tile) => [tile.id, tile])), [world.terrain.tiles]);
  const cells = useMemo(() => visibleTerrainSuccession(world, selected).flatMap((cell) => {
    const tile = terrain.get(cell.tileId);
    return tile && view.tileState(tile) === 'visible' ? [{ cell, tile }] : [];
  }), [world, selected, terrain, view]);
  const sites = observedRouteTargets(view);
  const pageCount = Math.max(1, Math.ceil(cells.length / LIMIT));
  const page = Math.min(cursor, pageCount - 1);
  const shown = cells.slice(page * LIMIT, (page + 1) * LIMIT);
  const result = inspect?.world === world && inspect?.view === view ? inspect : undefined;
  const selectedFrom = sites.some(({ id }) => id === from) ? from : '';
  const selectedTo = sites.some(({ id }) => id === to) ? to : '';
  const selectedAvoid = cells.some(({ tile }) => tile.id === avoid) ? avoid : '';

  return (
    <details className="min-w-0 rounded border border-emerald-400/20 bg-slate-950/70">
      <summary className="min-h-11 cursor-pointer break-words px-2.5 py-2.5 text-xs font-semibold text-emerald-200">地脉修复与路线检核</summary>
      <div className="space-y-2 px-2.5 pb-2.5 text-xs leading-relaxed text-slate-300">
        <p>只显示所选修士目前可观测的演替。连续受压 {TERRAIN_STRESS_TICKS} 轮可能留下永久损伤；修复需等灾害解除，单次实耗 {TERRAIN_RECOVERY_STONES} 灵石及玄土根 {TERRAIN_RECOVERY_ROOTS} 株，同一受损周期最多 {TERRAIN_RECOVERY_LIMIT} 次；连续平静 {TERRAIN_QUIET_TICKS} 轮后可见自然变化。</p>
        {shown.length > 0 ? <ol aria-label="当前可观测地脉演替" className="space-y-1.5">
          {shown.map(({ cell, tile }) => (
            <li key={cell.tileId} className="min-w-0 break-words rounded border border-slate-800 p-2">
              <p className="font-semibold text-emerald-100">{tileLabel(tile)} · {PHASE[cell.phase]} · 现为{cell.currentBiome}</p>
              <p>基线 {cell.baselineBiome}／{cell.baselineQi} 灵气 · 当前 {cell.currentQi} · 现有恢复上限 {cell.recoveryCap}</p>
              <p>受压连续 {cell.consecutiveStress} 轮 · 最近受压 Tick #{cell.lastStressTick} · 平静 {cell.quietTicks} 轮</p>
              <p>可恢复损失 {cell.recoverableLoss} · 永久损失 {cell.permanentLoss} · 已实作 {cell.workCount} 次
                {cell.lastWorkedTick !== undefined && cell.lastWorkedTick <= world.tick && ` · 最近施工 Tick #${cell.lastWorkedTick}`}
              </p>
            </li>
          ))}
        </ol> : <p className="text-slate-400">此时未观测到地脉演替记录。</p>}
        {pageCount > 1 && <div className="flex flex-wrap gap-1.5" aria-label="演替记录分页">
          <button type="button" className={control} disabled={page === 0} onClick={() => setCursor(page - 1)}>上一页</button>
          <button type="button" className={control} disabled={page + 1 === pageCount} onClick={() => setCursor(page + 1)}>下一页</button>
        </div>}
        <RoadMaintenancePanel world={world} view={view} selected={selected} />
        <div className="space-y-1.5 border-t border-slate-800 pt-2">
          <h5 className="font-semibold text-emerald-100">实测可见路线</h5>
          <p className="text-slate-400">使用实际地形路线计算，不设新障碍。迷雾开启时只检查当前可见地格；绕行检核另外避开所选地格。</p>
          <RouteWarningPanel world={world} viewer={selected} observed={view.current} />
          <div className="grid min-w-0 gap-1.5 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1">可见起点
              <select className={control} value={selectedFrom} onChange={(event) => { setFrom(event.target.value); setInspect(undefined); }}>
                <option value="">请选择</option>{sites.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
              </select>
            </label>
            <label className="grid min-w-0 gap-1">可见终点
              <select className={control} value={selectedTo} onChange={(event) => { setTo(event.target.value); setInspect(undefined); }}>
                <option value="">请选择</option>{sites.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
              </select>
            </label>
          </div>
          {cells.length > 0 && <label className="grid min-w-0 gap-1">绕行时避开（可选）
            <select className={control} value={selectedAvoid} onChange={(event) => { setAvoid(event.target.value); setInspect(undefined); }}>
              <option value="">不验绕行</option>
              {cells.map(({ tile }) => <option value={tile.id} key={tile.id}>{tileLabel(tile)}</option>)}
            </select>
          </label>}
          <button type="button" className={control} disabled={!selectedFrom || !selectedTo || selectedFrom === selectedTo} onClick={() => {
            setInspect({ world, view, route: proveObservedTerrainRoute(world, view, selectedFrom, selectedTo),
              alternate: selectedAvoid ? proveObservedTerrainRoute(world, view, selectedFrom, selectedTo, selectedAvoid) : undefined });
          }}>检核线路</button>
          {result && <div role="status" className="space-y-1.5">
            <p>检核范围：此时点 Tick #{world.tick}。</p>
            <TerrainRouteReceipt proof={result.route} />
            {result.alternate && <TerrainRouteReceipt proof={result.alternate} alternate />}
          </div>}
        </div>
      </div>
    </details>
  );
}
