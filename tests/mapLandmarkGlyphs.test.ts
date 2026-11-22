import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {drawMapLandmarkGlyph,MAP_LANDMARK_MAX_RADIUS,mapLandmarkMotif} from '../src/components/mapLandmarkGlyphs';
import type {LocationNode} from '../src/types/world';

function recording(){
  const geometry:{command:string;args:number[]}[]=[],tones:string[]=[];
  const points=(command:string)=>(...args:number[])=>{geometry.push({command,args});};
  const mock={save:points('save'),restore:points('restore'),translate:points('translate'),
    beginPath:points('begin'),moveTo:points('move'),lineTo:points('line'),closePath:points('close'),
    arc:points('arc'),quadraticCurveTo:points('quad'),bezierCurveTo:points('curve'),fill:points('fill'),stroke:points('stroke'),
    createRadialGradient:(...args:number[])=>{
      points('gradient')(...args);
      return {addColorStop:(_stop:number,color:string)=>{tones.push(color);}};
    },
  };
  return {ctx:mock as unknown as CanvasRenderingContext2D,geometry,tones};
}

describe('native landmark vectors',()=>{
  it('maps exact canonical starting sites and paints distinct physical kind fallbacks, never reads name',()=>{
    const world=createInitialWorld(556);
    const native=Object.fromEntries(world.locations.map(site=>[site.id,site]));
    expect(mapLandmarkMotif(native['loc-taixu'])).toBe('sword-peak');
    expect(mapLandmarkMotif(native['loc-danxia'])).toBe('pill-cauldron');
    expect(mapLandmarkMotif(native['loc-tianji'])).toBe('astral-dial');
    expect(mapLandmarkMotif(native['loc-blood'])).toBe('blood-moon');
    expect(mapLandmarkMotif(native['loc-market'])).toBe('market-pavilion');
    expect(mapLandmarkMotif(native['loc-secret-1'])).toBe('ancient-portal');
    expect(mapLandmarkMotif(native['loc-vein-north'])).toBe('vein-spring');
    expect(mapLandmarkMotif({id:'loc-taixu',type:'market'})).toBe('market-pavilion');
    expect(mapLandmarkMotif({id:'made-up-identity',type:'sect_hq'})).toBe('mountain-gate');
    expect(mapLandmarkMotif({id:'made-up-abyss',type:'abyss'})).toBe('broken-ravine');

    const alternatives:LocationNode[]=['sect_hq','abyss'].map(type=>
      ({...native['loc-taixu'],id:`example-${type}`,type:type as LocationNode['type']}));
    const examples=['loc-taixu','loc-danxia','loc-tianji','loc-blood','loc-market','loc-secret-1','loc-vein-north']
      .map(id=>native[id]).concat(alternatives);
    const fingerprints=examples.map(site=>{
      const {ctx,geometry}=recording();
      const samePosition={...site,x:12,y:44};
      Object.defineProperty(samePosition,'name',{get(){throw Error('not a proof field');}});
      const before=JSON.stringify(site);
      drawMapLandmarkGlyph(ctx,samePosition);
      expect(JSON.stringify(site)).toBe(before);
      return JSON.stringify(geometry);
    });
    expect(new Set(fingerprints).size).toBe(examples.length);
  });

  it('does not touch old hit extents: a finite painted pin and fixed radius for all static paths',()=>{
    const world=createInitialWorld(771);
    for(const site of world.locations){
      const {ctx,geometry}=recording();
      const pin={...site,x:432,y:293};
      drawMapLandmarkGlyph(ctx,pin);
      expect(geometry.filter(row=>row.command==='translate')).toEqual([{command:'translate',args:[pin.x,pin.y]}]);
      expect(geometry.filter(row=>row.command==='begin').length).toBeLessThanOrEqual(7);
      for(const {command,args} of geometry){
        if(command==='arc')expect(Math.hypot(args[0],args[1])+args[2]).toBeLessThanOrEqual(MAP_LANDMARK_MAX_RADIUS);
        if(command==='gradient')expect(args[5]).toBeLessThanOrEqual(MAP_LANDMARK_MAX_RADIUS);
        if(['line','move','quad','curve'].includes(command))
          for(let i=0;i<args.length;i+=2)expect(Math.hypot(args[i],args[i+1])).toBeLessThanOrEqual(MAP_LANDMARK_MAX_RADIUS);
      }
    }
  });

  it('draws the same silhouette at any Qi, with a bounded actual faction wash and no malformed color',()=>{
    const site=createInitialWorld(2).locations[0];
    const low=recording(),high=recording(),limited=recording(),bad=recording();
    drawMapLandmarkGlyph(low.ctx,{...site,spiritQi:0},'#aabbcc');
    drawMapLandmarkGlyph(high.ctx,{...site,spiritQi:100},'#aabbcc');
    drawMapLandmarkGlyph(limited.ctx,{...site,spiritQi:900},'#aabbcc');
    drawMapLandmarkGlyph(bad.ctx,{...site,spiritQi:Number.NaN},'bad');
    expect(low.geometry).toEqual(high.geometry);
    expect(high.tones).toEqual(limited.tones);
    expect(low.tones).toEqual(['#aabbcc19','#aabbcc00']);
    expect(high.tones).toEqual(['#aabbcc49','#aabbcc00']);
    expect(bad.tones[0]).toMatch(/^#[\da-f]{8}$/iu);
    expect(bad.tones).not.toContain('bad');
  });
});
