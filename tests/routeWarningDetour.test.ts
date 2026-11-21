import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  createRouteWarningDetourProjection,visibleRouteWarningDetour,
} from '../src/engine/routeWarningDetour';
import type { MapHazard,MapTile } from '../src/types/world';

function fixture(){
  const world=createInitialWorld(319);
  world.tick=20;
  const {columns,rows,tiles}=world.terrain;
  const cell=(row:number,col:number)=>tiles[row*columns+col];
  const point=(tile:MapTile)=>({x:(tile.col+.5)*1000/columns,y:(tile.row+.5)*600/rows});
  const sight=(...known:MapTile[])=>new Set(known.map(tile=>tile.id));
  const input=(from:MapTile,hazard:MapTile,exit?:MapTile)=>({fromTileId:from.id,hazardTileId:hazard.id,exitTileId:exit?.id});
  const danger=(tile:MapTile,expiresTick=world.tick+2):MapHazard=>({
    id:`hazard-${tile.id}`,tileId:tile.id,createdTick:world.tick-1,expiresTick,kind:'beast_tide',intensity:2,
  });
  return {world,cell,point,sight,input,danger};
}

describe('visible local alternatives around one genuinely warned tile',()=>{
  it('deterministically chooses the top/left four-step side when both straight offsets are currently visible',()=>{
    const {world,cell,point,sight,input,danger}=fixture();
    const begin=cell(5,5),warned=cell(5,6),exit=cell(5,7);
    const top=[cell(4,5),cell(4,6),cell(4,7)],bottom=[cell(6,5),cell(6,6),cell(6,7)];
    world.mapHazards=[danger(warned)];
    const original=JSON.stringify(world);
    const known=sight(begin,warned,exit,...bottom,...top);
    const projection=createRouteWarningDetourProjection(world,known);
    expect(projection(input(begin,warned,exit))).toEqual({steps:4,points:[begin,...top,exit].map(point)});
    expect(projection(input(exit,warned,begin))).toEqual({steps:4,points:[exit,...[...top].reverse(),begin].map(point)});
    expect(JSON.stringify(world)).toBe(original);
  });

  it('uses the only adjacent two-edge corner and refuses an ordinary edge or diagonal mark as proof',()=>{
    const {world,cell,point,sight,input}=fixture();
    const begin=cell(5,5),warned=cell(5,6),exit=cell(6,6),corner=cell(6,5);
    const known=sight(begin,warned,exit,corner);
    const projection=createRouteWarningDetourProjection(world,known);
    expect(projection(input(begin,warned,exit))).toEqual({steps:2,points:[begin,corner,exit].map(point)});
    expect(projection(input(begin,warned))).toBeUndefined(); // A→H is not proof of any intended exit.
    expect(projection(input(begin,warned,begin))).toBeUndefined();
    expect(projection(input(begin,warned,corner))).toBeUndefined();
    expect(visibleRouteWarningDetour(world,sight(begin,warned,exit),input(begin,warned,exit))).toBeUndefined();
  });

  it('does not inspect unobserved mutable geometry or hazards and will not recommend a currently observed caution cell',()=>{
    const {world,cell,point,sight,input,danger}=fixture();
    const begin=cell(5,5),warned=cell(5,6),exit=cell(5,7),onlyKnown=[cell(6,5),cell(6,6),cell(6,7)];
    const unseen=cell(4,6);
    const hiddenDanger=danger(unseen);
    Object.defineProperty(unseen,'row',{get:()=>{throw new Error('read unseen geometry');}});
    Object.defineProperty(hiddenDanger,'intensity',{get:()=>{throw new Error('read unseen hazard');}});
    world.mapHazards=[hiddenDanger];
    const known=sight(begin,warned,exit,...onlyKnown,cell(4,5),cell(4,7));
    const evidence=input(begin,warned,exit);
    expect(visibleRouteWarningDetour(world,known,evidence)).toEqual({steps:4,points:[begin,...onlyKnown,exit].map(point)});
    expect(visibleRouteWarningDetour(world,known,evidence,new Set([onlyKnown[1].id]))).toBeUndefined();
    world.mapHazards.push(danger(onlyKnown[1]));
    expect(visibleRouteWarningDetour(world,known,evidence)).toBeUndefined();
    world.mapHazards[1].expiresTick=world.tick;
    expect(visibleRouteWarningDetour(world,known,evidence)?.steps).toBe(4);
    expect(visibleRouteWarningDetour(world,sight(begin,exit,...onlyKnown),evidence)).toBeUndefined(); // Even the warned tile must be in current scope.
  });

  it('never wraps a side through a map border or returns a route to an already hazardous endpoint',()=>{
    const {world,cell,point,sight,input,danger}=fixture();
    const begin=cell(0,6),warned=cell(0,7),exit=cell(0,8),below=[cell(1,6),cell(1,7),cell(1,8)];
    const known=sight(begin,warned,exit,...below);
    expect(visibleRouteWarningDetour(world,known,input(begin,warned,exit))).toEqual({steps:4,points:[begin,...below,exit].map(point)});
    world.mapHazards=[danger(exit)];
    expect(visibleRouteWarningDetour(world,known,input(begin,warned,exit))).toBeUndefined();
    const left=cell(5,0),target=cell(4,0),extra=cell(6,0);
    const inner=[cell(6,1),cell(5,1),cell(4,1)];
    const side=sight(left,target,extra,...inner);
    expect(visibleRouteWarningDetour(world,side,input(extra,left,target))).toEqual({steps:4,points:[extra,...inner,target].map(point)});
  });
});
