import type {Cultivator,MapPoint,WorldState} from '../types/world';

/** Use only the native moving carrier and actual crossed cursor, never the quote or an earlier origin address. */
export function marketFreightCheckpoint(world:WorldState,actor:Cultivator):MapPoint|undefined{
  if(!actor.alive||actor.hp<=0||actor.positionPlane!==undefined)return undefined;
  const row=world.escorts.contracts.find(contract=>contract.status==='active'&&contract.escortId===actor.id&&
    contract.freight?.carrierId===actor.id&&contract.freight.dispatch&&contract.pathIndex>=contract.freight.dispatch.pathIndex);
  const point=row?.path[row.pathIndex];
  return point&&Number.isFinite(point.x)&&Number.isFinite(point.y)?{x:point.x,y:point.y}:undefined;
}
export function canSeeMarketFreightCheckpoint(world:WorldState,actor:Cultivator,viewer:Cultivator|undefined):boolean{
  return !!viewer&&world.cultivators.includes(viewer)&&world.escorts.contracts.some(row=>row.status==='active'&&
    row.escortId===actor.id&&row.freight?.carrierId===actor.id&&row.freight.dispatch&&
    (row.clientId===viewer.id||actor.id===viewer.id));
}
