import {describe,expect,it} from 'vitest';
import {mapScenicAnimationAllowed,mapScenicFrameDelay} from '../src/components/mapScenicScheduler';

const visible={reducedMotion:false,pageVisible:true,surfaceActive:true,width:390,height:234};
const idle={moving:false,heat:false,ambient:false,width:390};

describe('scenic motion shares the existing map cadence',()=>{
  it('runs only for a measurable active surface explicitly not in reduced motion',()=>{
    expect(mapScenicAnimationAllowed(visible)).toBe(true);
    expect(mapScenicAnimationAllowed({...visible,reducedMotion:undefined})).toBe(false);
    expect(mapScenicAnimationAllowed({...visible,reducedMotion:true})).toBe(false);
    expect(mapScenicAnimationAllowed({...visible,pageVisible:false})).toBe(false);
    expect(mapScenicAnimationAllowed({...visible,surfaceActive:false})).toBe(false);
    for(const invalid of [0,-1,NaN,Infinity,-Infinity]){
      expect(mapScenicAnimationAllowed({...visible,width:invalid})).toBe(false);
      expect(mapScenicAnimationAllowed({...visible,height:invalid})).toBe(false);
    }
  });

  it('does not change either native delay when the scenic layer is also rendered',()=>{
    for(const width of [360,390,639.99,640,1280]){
      expect(mapScenicFrameDelay({...idle,moving:true,width})).toBe(33);
      expect(mapScenicFrameDelay({...idle,moving:true,heat:true,ambient:true,width})).toBe(33);
      expect(mapScenicFrameDelay({...idle,heat:true,width})).toBe(80);
      expect(mapScenicFrameDelay({...idle,heat:true,ambient:true,width})).toBe(80);
    }
  });

  it('caps decorative-only redraws and requests no cadence for a static or unmeasurable map',()=>{
    expect(mapScenicFrameDelay(idle)).toBe(Infinity);
    expect(mapScenicFrameDelay({...idle,ambient:true,width:0})).toBe(Infinity);
    expect(mapScenicFrameDelay({...idle,moving:true,heat:true,ambient:true,width:NaN})).toBe(Infinity);
    expect(mapScenicFrameDelay({...idle,ambient:true,width:390})).toBeGreaterThanOrEqual(1000/8);
    expect(mapScenicFrameDelay({...idle,ambient:true,width:639.9})).toBe(125);
    expect(mapScenicFrameDelay({...idle,ambient:true,width:640})).toBeGreaterThanOrEqual(1000/12);
    expect(mapScenicFrameDelay({...idle,ambient:true,width:1920})).toBe(84);
  });
});
