import { describe, expect, it } from 'vitest';
import { drawLushTilemap, LUSH_TERRAIN_PALETTE } from '../src/components/lushTilemapRenderer';
import { drawMapArchitecturalSprite } from '../src/components/mapArchitecturalSprites';
import type { LushTilemapPlan } from '../src/components/lushTilemapModel';

function capture(draw:(ctx:CanvasRenderingContext2D)=>void):unknown[][] {
  const commands:unknown[][]=[];
  const gradient=(...args:number[])=>{
    commands.push(['gradient',...args]);
    return {addColorStop:(offset:number,color:string)=>{ commands.push(['stop',offset,color]); }};
  };
  const pen=new Proxy({createLinearGradient:gradient,createRadialGradient:gradient},{
    get(target,key){return Reflect.get(target,key)??((...args:unknown[])=>{commands.push([key,...args]);});},
    set(_target,key,value:unknown){commands.push([key,typeof value==='object'?'gradient':value]);return true;},
  });
  draw(pen as unknown as CanvasRenderingContext2D);
  return commands;
}
const hasColor=(commands:unknown[][],color:string)=>commands.some(([kind,value])=>kind==='fillStyle'&&value===color);

describe('lower world painted landscape and authorized facades',()=>{
  const blank:LushTilemapPlan={tiles:[],architecture:[],seams:[],roads:[]};

  it('draws distinct colored biomes, with decorative water and snow only when allowed by the plan',()=>{
    const tiles=(Object.keys(LUSH_TERRAIN_PALETTE) as Array<keyof typeof LUSH_TERRAIN_PALETTE>).map((biome,i)=>({
      tileId:'tile-'+i, biome, x:i*66,y:0,width:66,height:64,grain:182321,
    }));
    const ordinary=tiles.map(tile=>capture(ctx=>drawLushTilemap(ctx,{...blank,tiles:[tile]})));
    expect(new Set(ordinary.map(rows=>JSON.stringify(rows))).size).toBe(tiles.length);
    expect(ordinary.some(rows=>hasColor(rows,'#488994')||hasColor(rows,'#b9cbc1'))).toBe(false);
    const [mountain,marsh]=tiles;
    const scene={...blank,tiles:[{...mountain,frost:true as const},{...marsh,moisture:true as const}]};
    const wet=capture(ctx=>drawLushTilemap(ctx,scene));
    expect(hasColor(wet,'#488994')).toBe(true);
    expect(hasColor(wet,'#b9cbc1')).toBe(true);
    expect(wet).toEqual(capture(ctx=>drawLushTilemap(ctx,scene)));
    expect(wet.filter(([kind])=>kind==='clip')).toHaveLength(2);
  });

  it('paints indexed stone roads, not paths fabricated from neighboring tiles',()=>{
    expect(capture(ctx=>drawLushTilemap(ctx,blank)).some(([kind,value])=>kind==='strokeStyle'&&value==='#b8a184')).toBe(false);
    const tiles=[{tileId:'tile-0',biome:'灵山' as const,x:0,y:0,width:42,height:42,grain:0}];
    const roads=[{roadId:'native',points:[{x:6,y:20},{x:30,y:20}]}];
    const commands=capture(ctx=>drawLushTilemap(ctx,{...blank,tiles,roads}));
    expect(commands.filter(([kind])=>kind==='clip')).toHaveLength(2);
    expect(commands).toContainEqual(['strokeStyle','#b8a184']);
    expect(commands).toContainEqual(['moveTo',6,20]);
    expect(commands).toContainEqual(['lineTo',30,20]);
  });

  it('keeps the same hit pin while replacing only the authoritative facade',()=>{
    const site={id:'loc-danxia',type:'sect_hq',spiritRoot:'火',x:321,y:214} as const;
    const terrace=capture(ctx=>drawMapArchitecturalSprite(ctx,site,undefined,{kind:'terrace'}));
    const gate=capture(ctx=>drawMapArchitecturalSprite(ctx,site,undefined,{kind:'gate'}));
    const abandoned=capture(ctx=>drawMapArchitecturalSprite(ctx,site,undefined,{kind:'terrace',abandoned:true}));
    expect(terrace).toContainEqual(['translate',321,214]);
    expect(terrace).toContainEqual(['arc',0,0,22.5,0,Math.PI*2]);
    expect(hasColor(terrace,'#e98a65')).toBe(true);
    expect(hasColor(gate,'#e98a65')).toBe(false);
    expect(hasColor(abandoned,'#e98a65')).toBe(false);
  });
});
