import {describe,expect,it} from 'vitest';
import {MAP_HEIGHT,MAP_WIDTH,mapToScreen} from '../src/components/mapCamera';
import {MAP_COMBAT_CAPTION_SLOTS,mapCombatCaptionPosition} from '../src/components/mapCombatLabelLayout';

const requireCaption=(value:ReturnType<typeof mapCombatCaptionPosition>)=>{
  if(value===undefined)throw Error('Expected valid caption point');
  return value;
};

describe('logical map combat caption layout',()=>{
  it('centers on an actual projected anchor and stacks distinct stable slots without mutating it',()=>{
    const projection=Object.freeze(mapToScreen({x:-500,y:-260,zoom:2},{x:500,y:260}));
    const placed=Array.from({length:MAP_COMBAT_CAPTION_SLOTS},(_,slot)=>
      requireCaption(mapCombatCaptionPosition(projection,slot,.5,1,72)));
    expect(placed.map(point=>point.x)).toEqual([500,500,500]);
    expect(placed.map(point=>point.y)).toEqual([238,220,202]);
    expect(projection).toEqual({x:500,y:260});
  });

  it('keeps clipped left/right/top/bottom stacks readable at narrow logical-to-CSS scale',()=>{
    for(const widthCss of [360,390,1000]){
      const scale=MAP_WIDTH/widthCss;
      for(const corner of [{x:0,y:0},{x:MAP_WIDTH,y:0},{x:0,y:MAP_HEIGHT},{x:MAP_WIDTH,y:MAP_HEIGHT}]){
        for(const progress of [0,.5,1]){
          const visible=Array.from({length:MAP_COMBAT_CAPTION_SLOTS},(_,slot)=>
            requireCaption(mapCombatCaptionPosition(corner,slot,progress,scale,64)));
          for(const item of visible){
            expect(item.x/scale-32).toBeGreaterThanOrEqual(6-1e-10);
            expect(item.x/scale+32).toBeLessThanOrEqual(widthCss-6+1e-10);
            expect(item.y/scale).toBeGreaterThanOrEqual(12-1e-10);
            expect(item.y/scale).toBeLessThanOrEqual(MAP_HEIGHT/scale-12+1e-10);
          }
          expect(Math.abs(visible[0].y-visible[1].y)/scale).toBeCloseTo(18);
          expect(Math.abs(visible[1].y-visible[2].y)/scale).toBeCloseTo(18);
        }
      }
    }
  });

  it('rises on a stable side for the entire animation and clamps a noisy clock',()=>{
    for(const anchor of [{x:100,y:48},{x:100,y:80},{x:100,y:500}]){
      const start=requireCaption(mapCombatCaptionPosition(anchor,0,0,1,64));
      const end=requireCaption(mapCombatCaptionPosition(anchor,0,1,1,64));
      expect(Math.sign(start.y-anchor.y)).toBe(Math.sign(end.y-anchor.y));
      expect(end.y).toBeLessThan(start.y);
      expect(mapCombatCaptionPosition(anchor,0,-1,1,64)).toEqual(start);
      expect(mapCombatCaptionPosition(anchor,0,NaN,1,64)).toEqual(start);
      expect(mapCombatCaptionPosition(anchor,0,Infinity,1,64)).toEqual(end);
    }
  });

  it('omits offscreen, overwide, tiny-viewport, and out-of-range captions instead of inventing an anchor',()=>{
    expect(mapCombatCaptionPosition({x:-.01,y:250},0,0,1,64)).toBeUndefined();
    expect(mapCombatCaptionPosition({x:60,y:MAP_HEIGHT+.01},0,0,1,64)).toBeUndefined();
    expect(mapCombatCaptionPosition({x:60,y:NaN},0,0,1,64)).toBeUndefined();
    for(const slot of [-1,.5,3,Infinity])expect(mapCombatCaptionPosition({x:60,y:100},slot,0,1,64)).toBeUndefined();
    expect(mapCombatCaptionPosition({x:60,y:100},0,0,NaN,64)).toBeUndefined();
    expect(mapCombatCaptionPosition({x:60,y:100},0,0,1,Infinity)).toBeUndefined();
    expect(mapCombatCaptionPosition({x:60,y:100},0,0,3,330)).toBeUndefined();
    expect(mapCombatCaptionPosition({x:60,y:100},0,0,17,12)).toBeUndefined();
  });
});
