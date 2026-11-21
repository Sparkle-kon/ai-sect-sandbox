import type { MapPoint,MapTile,WorldState } from '../types/world';

export interface RouteWarningDetourInput {
  fromTileId:string;
  hazardTileId:string;
  exitTileId?:string;
}
export interface RouteWarningDetour {
  points:MapPoint[];
  steps:2|4;
}
const WIDTH=1000,HEIGHT=600;
const orthogonal=(a:MapTile,b:MapTile)=>Math.abs(a.col-b.col)+Math.abs(a.row-b.row)===1;
const order=(a:MapTile,b:MapTile)=>a.row-b.row || a.col-b.col || (a.id<b.id?-1:a.id>b.id?1:0);

/**
 * Local inspection only, never the simulator's route finder. The supplied IDs are the
 * viewer's actual current visible tiles, including in base map mode. No hidden tile's
 * coordinates or mutable hazard fields are used, and no result promises future safety.
 */
export function createRouteWarningDetourProjection(world:WorldState,currentTileIds:ReadonlySet<string>,
  extraVisibleCautionIds:ReadonlySet<string>=new Set()) {
  const {columns,rows,tiles}=world.terrain;
  const byId=new Map<string,MapTile>();
  const byCell=new Map<number,MapTile>();
  const cell=(row:number,col:number)=>row*columns+col;
  const bounded=(row:number,col:number)=>row>=0 && row<rows && col>=0 && col<columns;
  for (const tile of tiles) {
    if (!currentTileIds.has(tile.id) || !Number.isSafeInteger(tile.row) || !Number.isSafeInteger(tile.col) ||
      !bounded(tile.row,tile.col)) continue;
    byId.set(tile.id,tile);
    byCell.set(cell(tile.row,tile.col),tile);
  }
  const caution=new Set<string>();
  for (const id of extraVisibleCautionIds) if (byId.has(id)) caution.add(id);
  for (const hazard of world.mapHazards) {
    if (byId.has(hazard.tileId) && hazard.createdTick<=world.tick && world.tick<hazard.expiresTick && hazard.intensity>=1) {
      caution.add(hazard.tileId);
    }
  }
  const at=(row:number,col:number)=>bounded(row,col)?byCell.get(cell(row,col)):undefined;
  const center=(tile:MapTile):MapPoint=>({x:(tile.col+.5)*WIDTH/columns,y:(tile.row+.5)*HEIGHT/rows});
  return ({fromTileId,hazardTileId,exitTileId}:RouteWarningDetourInput):RouteWarningDetour|undefined=>{
    const begin=byId.get(fromTileId),hazard=byId.get(hazardTileId),exit=exitTileId===undefined?undefined:byId.get(exitTileId);
    if (!begin || !hazard || !exit || begin.id===exit.id || !orthogonal(begin,hazard) || !orthogonal(hazard,exit) ||
      caution.has(begin.id) || caution.has(exit.id)) return undefined;
    const ay=begin.row-hazard.row,ax=begin.col-hazard.col,by=exit.row-hazard.row,bx=exit.col-hazard.col;
    const viable=(tile:MapTile|undefined):tile is MapTile=>!!tile && tile.id!==hazard.id && !caution.has(tile.id);
    if (ay+by!==0 || ax+bx!==0) {
      // Perpendicular entry and exit share exactly one further corner that avoids the known hazard.
      const corner=at(hazard.row+ay+by,hazard.col+ax+bx);
      return viable(corner)?{steps:2,points:[begin,corner,exit].map(center)}:undefined;
    }
    const possible:MapTile[][]=[];
    for (const dir of [-1,1]) {
      const sy=dir*ax,sx=-dir*ay;
      const bend=[at(begin.row+sy,begin.col+sx),at(hazard.row+sy,hazard.col+sx),at(exit.row+sy,exit.col+sx)];
      if (bend.every(viable)) possible.push(bend);
    }
    // Stable row/column precedence, not hazard density in an unobserved side, container order, or RNG.
    possible.sort((a,b)=>order(a[0],b[0]));
    return possible[0]?{steps:4,points:[begin,...possible[0],exit].map(center)}:undefined;
  };
}

export function visibleRouteWarningDetour(world:WorldState,currentTileIds:ReadonlySet<string>,input:RouteWarningDetourInput,
  extraVisibleCautionIds?:ReadonlySet<string>):RouteWarningDetour|undefined {
  return createRouteWarningDetourProjection(world,currentTileIds,extraVisibleCautionIds)(input);
}
