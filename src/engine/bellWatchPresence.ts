import type { BellWatchChoice, BellWatchState } from '../types/bellWatch';
import type { Cultivator, LocationNode, MapPoint, WorldState } from '../types/world';

type Tower = LocationNode & { bellWatch: BellWatchState };
const alive=(actor:Cultivator)=>actor.alive&&actor.hp>0&&actor.positionPlane===undefined;
const inTransit=(choice:BellWatchChoice|undefined):choice is BellWatchChoice=>
  !!choice&&choice.move==='reroute'&&choice.endedTick===undefined;
const travelingAt=(world:WorldState,actor:Cultivator)=>world.locations.find((site):site is Tower=>
  site.bellWatch?.watcherId===actor.id&&inTransit(site.bellWatch.choice));

export function activeBellWatchForActor(world:WorldState,actor:Cultivator):boolean{
  return alive(actor)&&travelingAt(world,actor)!==undefined;
}

export function bellWatchActedThisTick(world:WorldState,actor:Cultivator):boolean{
  return world.locations.some(({bellWatch})=>bellWatch?.watcherId===actor.id&&!!bellWatch.choice&&
    [bellWatch.choice.tick,bellWatch.choice.lastMovedTick,bellWatch.choice.endedTick].includes(world.tick));
}

export function bellWatchCheckpoint(world:WorldState,actor:Cultivator):MapPoint|undefined{
  if(!alive(actor))return undefined;
  const tower=travelingAt(world,actor);
  if(!tower)return undefined;
  const choice=tower.bellWatch.choice;
  if(!choice||choice.pathIndex===0)return {x:tower.x,y:tower.y};
  const tile=world.terrain.tiles.find(({id})=>id===choice.pathTileIds[choice.pathIndex]);
  return tile?{x:(tile.col+.5)*1000/world.terrain.columns,y:(tile.row+.5)*600/world.terrain.rows}:undefined;
}
