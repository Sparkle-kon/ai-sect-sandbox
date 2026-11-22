import { terrainTileAt } from './terrainEngine';
import type { MapPoint, SimulationRegionId, WorldState } from '../types/world';

export const SIMULATION_REGIONS=['west','center','east'] as const satisfies readonly SimulationRegionId[];
export function regionForColumn(column:number,total:number):SimulationRegionId|undefined {
  if(!Number.isSafeInteger(column)||!Number.isSafeInteger(total)||total<3||column<0||column>=total)return undefined;
  return SIMULATION_REGIONS[Math.min(2,Math.floor(column*3/total))];
}
export function regionForPoint(world:WorldState,point:MapPoint):SimulationRegionId|undefined {
  const tile=terrainTileAt(world,point.x,point.y);
  return tile&&regionForColumn(tile.col,world.terrain.columns);
}
