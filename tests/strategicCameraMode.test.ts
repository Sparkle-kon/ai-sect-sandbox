import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {DEFAULT_CAMERA,MAX_ZOOM} from '../src/components/mapCamera';
import {focusMapPoint} from '../src/components/mapKeyboard';
import {isStrategicCameraModeCurrent,toggleStrategicCameraMode,type StrategicCameraScope} from '../src/components/strategicCameraMode';

const fixture=()=>{
  const world=createInitialWorld();
  const viewer=world.cultivators[0];
  const visible=world.locations.find(row=>row.id===viewer.locationId);
  if(!visible)throw Error('Expected a registered starting location');
  const scope:StrategicCameraScope={world,scopeKey:'7:main:live',viewerId:viewer.id,fog:true};
  return {world,scope,visible};
};

describe('scoped strategic map camera',()=>{
  it('returns to the exact prior detail camera on the same frame without storing mutable camera/scope aliases',()=>{
    const {world,scope}=fixture();
    const local=Object.freeze({x:-319,y:-211,zoom:2});
    const active=toggleStrategicCameraMode(undefined,scope,local);
    expect(active.camera).toBe(DEFAULT_CAMERA);
    expect(active.mode?.scope).not.toBe(scope);
    expect(active.mode?.scope.world).toBe(world);
    expect(active.mode?.localCamera).not.toBe(local);
    expect(isStrategicCameraModeCurrent(active.mode,scope)).toBe(true);
    expect(toggleStrategicCameraMode(active.mode,scope,active.camera)).toEqual({camera:local});
  });

  it('stays full during an ordinary live month but returns only to a newly authorized point, not a stale camera',()=>{
    const {world,scope,visible}=fixture();
    const active=toggleStrategicCameraMode(undefined,scope,{x:-600,y:-500,zoom:3});
    // Separate retained frame represents the changed authority; its calendar is not used by the camera.
    const next={...scope,world:structuredClone(world)};
    expect(isStrategicCameraModeCurrent(active.mode,next)).toBe(true);
    expect(toggleStrategicCameraMode(active.mode,next,active.camera,visible)).toEqual({camera:focusMapPoint(DEFAULT_CAMERA,visible)});
    expect(toggleStrategicCameraMode(active.mode,next,active.camera)).toEqual({camera:DEFAULT_CAMERA});
  });

  it('invalidates branch, historical scope, viewer, and fog instead of replaying an unrelated camera',()=>{
    const {world,scope}=fixture();
    const active=toggleStrategicCameraMode(undefined,scope,{x:-700,y:-390,zoom:3});
    for(const next of [{...scope,scopeKey:'7:side:live'},{...scope,scopeKey:'7:main:1'},
      {...scope,viewerId:world.cultivators[1].id},{...scope,viewerId:null},{...scope,fog:false}]){
      expect(isStrategicCameraModeCurrent(active.mode,next)).toBe(false);
      const fresh=toggleStrategicCameraMode(active.mode,next,active.camera);
      expect(fresh.camera).toBe(DEFAULT_CAMERA);
      expect(fresh.mode?.scope).toEqual(next);
      expect(fresh.mode?.localCamera).toBe(DEFAULT_CAMERA);
    }
    expect(isStrategicCameraModeCurrent(undefined,scope)).toBe(false);
  });

  it('uses an exact real focused landmark when starting at scale 1, and a full fallback when no authorized point exists',()=>{
    const {scope,visible}=fixture();
    const fromLocal=toggleStrategicCameraMode(undefined,scope,DEFAULT_CAMERA,visible);
    expect(toggleStrategicCameraMode(fromLocal.mode,scope,fromLocal.camera)).toEqual({camera:focusMapPoint(DEFAULT_CAMERA,visible)});
    const noPoint=toggleStrategicCameraMode(undefined,scope,DEFAULT_CAMERA);
    expect(toggleStrategicCameraMode(noPoint.mode,scope,noPoint.camera,visible)).toEqual({camera:focusMapPoint(DEFAULT_CAMERA,visible)});
    expect(toggleStrategicCameraMode(noPoint.mode,scope,noPoint.camera,{x:-1,y:0})).toEqual({camera:DEFAULT_CAMERA});
    expect(toggleStrategicCameraMode(noPoint.mode,scope,noPoint.camera,{x:500,y:Infinity})).toEqual({camera:DEFAULT_CAMERA});
  });

  it('clamps past zoom and pan rails with native geometry and does not recover non-finite input',()=>{
    const {scope}=fixture();
    const out=toggleStrategicCameraMode(undefined,scope,{zoom:9,x:-10000,y:10000});
    expect(out.mode?.localCamera).toEqual({zoom:MAX_ZOOM,x:-3000,y:0});
    const malformed=toggleStrategicCameraMode(undefined,scope,{zoom:Infinity,x:10,y:10});
    expect(malformed.mode?.localCamera).toBe(DEFAULT_CAMERA);
    expect(toggleStrategicCameraMode(malformed.mode,scope,malformed.camera)).toEqual({camera:DEFAULT_CAMERA});
  });
});
