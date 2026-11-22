import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {BIOME_PALETTE,createTerrainMapView} from '../src/components/terrainMapView';
import {WorldMapCanvas} from '../src/components/WorldMapCanvas';
import {DEFAULT_CAMERA} from '../src/components/mapCamera';
import {StrategicMinimap,strategicMinimapKeyboardPoint,strategicMinimapPointerPoint,strategicMinimapViewport}
  from '../src/components/StrategicMinimap';

const noop=()=>undefined;

describe('strategic minimap on the original chart',()=>{
  it('supplies one touch-sized mode toggle on narrow and retains the exact old keyboard locator name',()=>{
    const world=createInitialWorld(9),view=createTerrainMapView(world,world.cultivators[0],true);
    const local=renderToStaticMarkup(<StrategicMinimap world={world} view={view} camera={DEFAULT_CAMERA}
      strategic={false} onToggle={noop} onPoint={noop}/>);
    const broad=renderToStaticMarkup(<StrategicMinimap world={world} view={view} camera={DEFAULT_CAMERA}
      strategic onToggle={noop} onPoint={noop}/>);
    expect(local.match(/aria-label="小地图：点击定位"/g)).toHaveLength(1);
    expect(local).toMatch(/aria-label="切换全景视图" aria-pressed="false"[^>]*min-h-11 min-w-11/);
    expect(local).toMatch(/<details class="group[^"]*"><summary class="[^"]*min-h-11/);
    expect(local).not.toMatch(/<details[^>]*open(?:=| |>)/);
    expect(local).toContain('舆图罗盘');
    expect(local).not.toMatch(/\babsolute\b|\bfixed\b|hidden sm:block/);
    expect(local).toContain('viewBox="0 0 1000 600"');
    expect(broad).toMatch(/aria-label="返回本域视图" aria-pressed="true"/);
    expect(broad).not.toContain('hidden sm:block');
  });

  it('keeps expandable navigation and the mode switch outside the painted Canvas frame on both layouts',()=>{
    const world=createInitialWorld(9);
    for(const compact of [true,false]){
      const html=renderToStaticMarkup(<WorldMapCanvas world={world} selectedCultivatorId={world.cultivators[0].id}
        onSelectCultivator={noop} compact={compact}/>);
      const canvas=html.indexOf('data-map-canvas-frame');
      const dock=html.indexOf('data-map-navigation-dock');
      expect(canvas).toBeGreaterThan(-1);
      expect(dock).toBeGreaterThan(canvas);
      expect(html.slice(canvas,dock)).toMatch(/<\/canvas><\/div><div $/);
      const navigation=html.slice(dock,html.indexOf('</details>',dock));
      expect(navigation).toContain('舆图罗盘');
      expect(navigation).toContain('小地图：点击定位');
      expect(navigation).not.toMatch(/\babsolute\b|\bfixed\b/);
      expect(html.match(/aria-label="切换全景视图"/g)).toHaveLength(1);
    }
  });

  it('draws the true camera rectangle but never reads historical or hidden biome values',()=>{
    const world=createInitialWorld(9),actor=world.cultivators[0];
    actor.exploredTileIds=[world.terrain.tiles.at(-1)!.id];
    const view=createTerrainMapView(world,actor,true);
    const unobserved=world.terrain.tiles.filter(tile=>view.tileState(tile)!=='visible');
    expect(unobserved.some(tile=>view.tileState(tile)==='explored')).toBe(true);
    expect(unobserved.some(tile=>view.tileState(tile)==='hidden')).toBe(true);
    for(const tile of unobserved)Object.defineProperty(tile,'biome',{get(){throw Error('unobserved biome leaked');}});
    const camera={zoom:2,x:-200,y:-100};
    expect(strategicMinimapViewport(camera)).toEqual({x:100,y:50,width:500,height:300});
    const html=renderToStaticMarkup(<StrategicMinimap world={world} view={view} camera={camera}
      strategic={false} onToggle={noop} onPoint={noop}/>);
    expect(html).toContain('x="104" y="54" width="492" height="292"');
    expect(html).toContain('fill="#202833"');
    expect(html).toContain('fill="#0b1016"');
    expect(html.match(/<rect /g)).toHaveLength(1);
    const terrainPaths=[...html.matchAll(/<path fill="([^"]+)" d="([^"]+)"/g)];
    const oldColors=new Set(Object.values(BIOME_PALETTE).map(row=>row.swatch));
    expect(terrainPaths.length).toBeLessThanOrEqual(8);
    expect(terrainPaths.every(([,ink])=>!oldColors.has(ink))).toBe(true);
    const area=terrainPaths.flatMap(([,,path])=>[...path.matchAll(/M[\d.]+ [\d.]+h([\d.]+)v([\d.]+)h-[\d.]+Z/g)])
      .reduce((sum,[,w,h])=>sum+Number(w)*Number(h),0);
    expect(area).toBe(1000*600);
  });

  it('converts exact client coordinates and never sends the camera to a hidden pointer or keyboard destination',()=>{
    const world=createInitialWorld(9),actor=world.cultivators[0];
    const view=createTerrainMapView(world,actor,true);
    const mouse={left:20,top:12,width:100,height:60};
    const publicView=createTerrainMapView(world,undefined,false);
    expect(strategicMinimapPointerPoint(world,publicView,mouse,{x:51,y:36})).toEqual({x:310,y:240});
    expect(strategicMinimapPointerPoint(world,publicView,mouse,{x:19,y:36})).toBeUndefined();
    const hidden=world.terrain.tiles.find(tile=>view.tileState(tile)==='hidden')!;
    const cellX=(hidden.col+0.5)*100/world.terrain.columns,cellY=(hidden.row+0.5)*60/world.terrain.rows;
    expect(strategicMinimapPointerPoint(world,view,mouse,{x:mouse.left+cellX,y:mouse.top+cellY})).toBeUndefined();
    const keyboard=strategicMinimapKeyboardPoint(world,view,DEFAULT_CAMERA);
    expect(keyboard).toBeDefined();
    expect(view.tileState(terrainTileAt(world,keyboard!.x,keyboard!.y)!)).toBe('visible');
    expect(strategicMinimapKeyboardPoint(world,createTerrainMapView(world,undefined,true),DEFAULT_CAMERA)).toBeUndefined();
  });
});
