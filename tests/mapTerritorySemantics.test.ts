import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import type { MapTile,WorldState } from '../src/types/world';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { projectMapTerritories } from '../src/components/mapTerritorySemantics';
import { drawMapTerritoryGlyphs,drawTerrain } from '../src/components/terrainMapDraw';
import { createTerrainMapView } from '../src/components/terrainMapView';

function drawingContext() {
  const strokes:Array<{color:string;dash:number[]}>=[],fonts:Array<{code:string;font:string;point:number[]}>=[],fills:string[]=[];
  const raw={canvas:{width:1000,height:600},fillStyle:'',strokeStyle:'',font:'',lineWidth:1,globalAlpha:1,
    lineCap:'butt',textAlign:'center',textBaseline:'middle',dash:[] as number[],
    save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},strokeRect(){},
    setLineDash(dash:number[]){this.dash=[...dash];},
    stroke(){strokes.push({color:this.strokeStyle,dash:[...this.dash]});},
    fillRect(){fills.push(this.fillStyle);},measureText(code:string){return {width:7*code.length};},
    fillText(code:string,x:number,y:number){fonts.push({code,font:this.font,point:[x,y]});}};
  return {ctx:raw as unknown as CanvasRenderingContext2D,strokes,fonts,fills};
}
const wipe=(world:WorldState)=>world.terrain.tiles.forEach(tile=>delete tile.ownerSectId);

describe('same currently seen territory on Canvas and in the text index',()=>{
  it('uses recognized visible HQ tile, falls back to an actual visible boundary, and never renumbers with fog',()=>{
    const world=createInitialWorld(487);
    wipe(world);
    const [hidden,boundary,headquartered]=world.sects;
    const hq=world.locations.find(site=>site.id===headquartered.headquartersId)!;
    const hqTile=terrainTileAt(world,hq.x,hq.y)!;
    const [hiddenTile,borderTile,otherTile,foreign]=world.terrain.tiles.filter(tile=>tile.id!==hqTile.id);
    hiddenTile.ownerSectId=hidden.id;
    borderTile.ownerSectId=boundary.id;
    otherTile.ownerSectId=headquartered.id;
    hqTile.ownerSectId=headquartered.id;
    foreign.ownerSectId='unregistered-owner';
    const now=new Set([borderTile.id,otherTile.id,foreign.id,hqTile.id]);
    const projection=()=>projectMapTerritories(world,(tile)=>now.has(tile.id)?'visible':'explored');
    const visible=projection();
    expect(visible.markers.map(({code,tileId})=>[code,tileId])).toEqual([['宗2',borderTile.id],['宗3',hqTile.id]]);
    expect(visible.byFaction.size).toBe(2);
    expect(visible.markers[1].summary).toContain('当前可见宗门驻地格');
    expect(JSON.stringify(visible.markers)).not.toContain(hidden.name);
    expect(JSON.stringify(visible.markers)).not.toContain('unregistered-owner');
    now.delete(hqTile.id);
    const fallback=projection();
    expect(fallback.markers[1]).toMatchObject({code:'宗3',tileId:otherTile.id,summary:expect.stringContaining('当前可见领地边缘')});
    const before=JSON.stringify(fallback.markers);
    hiddenTile.ownerSectId=boundary.id;
    hqTile.ownerSectId=hidden.id; // Explored ownership changes no pixels, code, or fallback point.
    expect(JSON.stringify(projection().markers)).toBe(before);
  });

  it('stable ordinal labels beyond pattern cycle and no faction cap despite long real roster',()=>{
    const world=createInitialWorld(881);
    wipe(world);
    const shape=world.sects[0];
    while(world.sects.length<21) {
      const index=world.sects.length;
      world.sects.push({...structuredClone(shape),id:`faction-${index}`,name:`宗派${index}`});
    }
    while(world.cultivators.length<526) {
      const index=world.cultivators.length;
      world.cultivators.push({...structuredClone(world.cultivators[0]),id:`roster-${index}`});
    }
    world.sects.forEach((sect,i)=>{world.terrain.tiles[i].ownerSectId=sect.id;});
    const {markers}=projectMapTerritories(world,()=> 'visible');
    expect(markers).toHaveLength(21);
    expect(new Set(markers.map(({code})=>code)).size).toBe(21);
    expect(markers[0].pattern).toBe(markers[5].pattern);
    expect(markers.at(-1)).toMatchObject({ordinal:21,code:'宗21'});
    expect(world.cultivators).toHaveLength(526);
    const narrow=drawingContext();
    drawMapTerritoryGlyphs(narrow.ctx,markers,1000/326);
    expect(narrow.fonts.map(({code})=>code)).toEqual(markers.map(({code})=>code));
    expect(parseFloat(narrow.fonts[0].font.split(' ')[1])*326/1000).toBeCloseTo(12);
  });

  it('draws different achromatic boundary patterns, exposes no explored ghost label, and maintains 12 CSS px across zoom',()=>{
    const world=createInitialWorld(652);
    const [first,second,third]=world.sects;
    wipe(world);
    const [a,b,c]=world.terrain.tiles;
    a.ownerSectId=first.id;b.ownerSectId=second.id;c.ownerSectId=third.id;
    const classify=(tile:MapTile)=>tile===a||tile===b?'visible':tile===c?'explored':'hidden';
    const semantics=projectMapTerritories(world,classify);
    const normal=drawingContext(),magnified=drawingContext();
    drawTerrain(normal.ctx,world,classify,false,0,semantics,3);
    drawMapTerritoryGlyphs(normal.ctx,semantics.markers,3);
    drawMapTerritoryGlyphs(magnified.ctx,semantics.markers,1.5);
    expect(normal.fonts.map(({code})=>code)).toEqual(['宗1','宗2']);
    expect(normal.strokes).toContainEqual({color:'#f8fafc',dash:[]});
    expect(normal.strokes).toContainEqual({color:'#f8fafc',dash:[3,9]});
    expect(normal.strokes.some(({color})=>color===third.color)).toBe(false);
    expect(normal.fonts[0].font).toContain('36px');
    expect(magnified.fonts[0].font).toContain('18px');
  });

  it('matches the canonical fog branch and gives an absent viewer zero current territory',()=>{
    const world=createInitialWorld(856);
    const [viewer]=world.cultivators;
    const base=createTerrainMapView(world,viewer,false);
    const fog=createTerrainMapView(world,viewer,true);
    const hidden=createTerrainMapView(world,undefined,true);
    const actual=projectMapTerritories(world,fog.tileState).markers;
    expect(actual.length).toBeGreaterThan(0);
    expect(actual.length).toBeLessThan(projectMapTerritories(world,base.tileState).markers.length);
    expect(actual.every(({tileId})=>fog.current?.has(tileId))).toBe(true);
    expect(projectMapTerritories(world,hidden.tileState).markers).toEqual([]);
  });
});
