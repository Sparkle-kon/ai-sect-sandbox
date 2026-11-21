import { ROAD_CHARTER_ROOTS, ROAD_CHARTER_STONES, ROAD_CONDITION_MAX, ROAD_MAINTENANCE_ROOTS, ROAD_MAINTENANCE_STONES, ROAD_MIN_PASS_CONDITION, visibleRoads } from '../engine/roadEngine';
import type { Cultivator, WorldState } from '../types/world';
import type { createTerrainMapView } from './terrainMapView';

type RoadView = ReturnType<typeof visibleRoads>[number];

export function RoadMaintenancePanel({ world, view, selected }: {
  world: WorldState;
  view: ReturnType<typeof createTerrainMapView>;
  selected?: Cultivator;
}) {
  const roads = visibleRoads(world, selected).filter((road) =>
    road.openedTick <= world.tick &&
    view.isCurrentLocation(road.anchorSiteId) && view.isCurrentLocation(road.otherSiteId));
  if (roads.length === 0) return null;
  const names = new Map(world.locations.map(({ id, name }) => [id, name]));
  return (
    <section aria-label="驿路修缮与关津权限" className="space-y-1.5 border-t border-slate-800 pt-2">
      <h5 className="font-semibold text-emerald-100">驿路修缮与关津权限</h5>
      <p className="text-slate-400">仅列当前可见两端的驿路，不展示沿途地块。同行成立后，由发起人选择；只有确能减少本段行进回合并实际启程，才由发起人一次承担路权费；普通路线不另收路权费，巡礼原有开支不变。</p>
      <p>开路规定耗资 {ROAD_CHARTER_STONES} 灵石、玄土根 {ROAD_CHARTER_ROOTS} 株；单次修缮规定 {ROAD_MAINTENANCE_STONES} 灵石、玄土根 {ROAD_MAINTENANCE_ROOTS} 株。不是累计支出。</p>
      <ol className="max-h-44 space-y-1.5 overflow-y-auto" aria-label="两端当前可见的驿路记录">
        {roads.map((road) => (
          <li key={road.id} className="min-w-0 break-words rounded border border-slate-800 p-2">
            <p className="font-semibold text-emerald-100">{names.get(road.anchorSiteId) ?? '原宗门驻地'} ⇄ {names.get(road.otherSiteId) ?? '原坊市'}</p>
            <RoadStatus road={road} tick={world.tick} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function RoadStatus({ road, tick }: { road: RoadView; tick: number }) {
  const closed = road.closedTick !== undefined && road.closedTick <= tick;
  return <>
    <p>实际开路 Tick #{road.openedTick} · 路况 {road.condition}/{ROAD_CONDITION_MAX}</p>
    {closed
      ? <p>已关闭 · Tick #{road.closedTick} · {road.closeReason === 'title_lost' ? '驻地权属已变更' : '驿路站点已不可用'}，不再加收路权费。</p>
      : road.condition < ROAD_MIN_PASS_CONDITION
        ? <p>路况未达 {ROAD_MIN_PASS_CONDITION}，现不可使用付费捷径；普通路线仍可检核。</p>
        : <p>路况达到捷径门槛 · 单段路权费 {road.fare} 灵石（条款，非扣款记录）。</p>}
    {road.lastMaintainedTick !== undefined && road.lastMaintainedTick <= tick && <p>最近实际修缮 Tick #{road.lastMaintainedTick}</p>}
    {road.lastPatrolledTick !== undefined && road.lastPatrolledTick <= tick && <p>最近实际巡查 Tick #{road.lastPatrolledTick}</p>}
  </>;
}
