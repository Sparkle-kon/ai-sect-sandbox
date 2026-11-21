import { describe,expect,it,vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { drawRouteWarningMarks,paintedRouteWarningGeometry } from '../src/components/routeWarningMapDraw';
import { paintedMapMarks } from '../src/components/mapPaintedSemantics';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { buildMapPresentation } from '../src/components/mapPresentationView';
import type { PublicRouteWarning } from '../src/engine/routeWarningEngine';

const row:PublicRouteWarning={id:'route-warning-1',fromTileId:'tile-1-1',toTileId:'tile-2-1',
  kind:'beast_tide',intensity:2,observedTick:1,postedTick:2,expiresTick:5,corroborated:true,corroboratedTick:3};

describe('map warnings use the same actual marked adjacent scope and non-color symbols',()=>{
  it('paints a specific segment midpoint, adds a corroboration border, and refuses nonadjacent segments',()=>{
    const world=createInitialWorld(41);
    const valid=paintedRouteWarningGeometry(world,[row,{...row,id:'bad',toTileId:'tile-3-3'}]);
    expect(valid).toEqual([{id:row.id,kind:'beast_tide',corroborated:true,expiresTick:5,
      start:{x:60,y:60},end:{x:100,y:60},mid:{x:80,y:60}}]);
    const stroke=vi.fn(),fillText=vi.fn(),rect=vi.fn(),setLineDash=vi.fn();
    const ctx={save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),fill:vi.fn(),
      stroke,fillText,rect,setLineDash};
    drawRouteWarningMarks(ctx as unknown as CanvasRenderingContext2D,valid,1);
    expect(rect).toHaveBeenCalledTimes(2);
    expect(stroke).toHaveBeenCalledTimes(3);
    expect(setLineDash).toHaveBeenCalledWith([2,3]);
    expect(fillText).toHaveBeenCalledTimes(1);
    expect(fillText).toHaveBeenCalledWith('警',80,60);
  });

  it('puts precisely the painted midpoint in route text navigation, never restoring a remembered hidden leg',()=>{
    const world=createInitialWorld(41);
    const geometry=paintedRouteWarningGeometry(world,[row]);
    const full=createTerrainMapView(world,undefined,false);
    const fogged=createTerrainMapView(world,undefined,true);
    expect(paintedMapMarks(world,full,[],[],[],undefined,buildMapPresentation(world,full,[]),[],geometry))
      .toEqual([{id:'route-warning:route-warning-1',kind:'route',title:'驿路警示：兽潮',
        summary:'双线警标，已有独立旁证 · 仅该相邻路段 · 第 5 轮到期 · 不封路',point:{x:80,y:60}}]);
    expect(paintedMapMarks(world,fogged,[],[],[],undefined,buildMapPresentation(world,fogged,[]),[],geometry)).toEqual([]);
  });
});
