import type {MapPoint,WorldState} from '../types/world';
import {DEFAULT_CAMERA,MAP_HEIGHT,MAP_WIDTH,MAX_ZOOM,panCamera,type MapCamera} from './mapCamera';
import {focusMapPoint} from './mapKeyboard';

export interface StrategicCameraScope {
  world:WorldState;
  scopeKey:string;
  viewerId:string|null;
  fog:boolean;
}
export interface StrategicCameraMode {
  scope:StrategicCameraScope;
  localCamera:MapCamera;
}

/** A normal month can leave the whole-map mode in place, but never authorize restoring its old local camera. */
export function isStrategicCameraModeCurrent(mode:StrategicCameraMode|undefined,scope:StrategicCameraScope):boolean {
  return !!mode&&mode.scope.scopeKey===scope.scopeKey&&mode.scope.viewerId===scope.viewerId&&mode.scope.fog===scope.fog;
}

const fixedLocal=(camera:MapCamera):MapCamera=>{
  if(![camera.zoom,camera.x,camera.y].every(Number.isFinite)||camera.zoom<=1)return DEFAULT_CAMERA;
  return panCamera({zoom:Math.min(MAX_ZOOM,camera.zoom),x:camera.x,y:camera.y},{x:0,y:0});
};
const focusCurrent=(point:MapPoint|undefined):MapCamera=>
  point&&Number.isFinite(point.x)&&point.x>=0&&point.x<=MAP_WIDTH&&
  Number.isFinite(point.y)&&point.y>=0&&point.y<=MAP_HEIGHT
    ?focusMapPoint(DEFAULT_CAMERA,point):DEFAULT_CAMERA;

/** Only the caller's already-authorized current point can substitute for a lost local camera. */
export function toggleStrategicCameraMode(mode:StrategicCameraMode|undefined,scope:StrategicCameraScope,camera:MapCamera,
  visibleFocusPoint?:MapPoint):{mode?:StrategicCameraMode;camera:MapCamera} {
  if(mode&&isStrategicCameraModeCurrent(mode,scope)){
    const local=mode.scope.world===scope.world?fixedLocal(mode.localCamera):DEFAULT_CAMERA;
    return {camera:local.zoom>1?local:focusCurrent(visibleFocusPoint)};
  }
  const local=fixedLocal(camera);
  return {mode:{scope:{...scope},localCamera:local.zoom>1?local:focusCurrent(visibleFocusPoint)},camera:DEFAULT_CAMERA};
}
