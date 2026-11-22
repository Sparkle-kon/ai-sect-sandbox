import type {LocationNode,WorldState} from '../types/world';
import type {MapCamera} from './mapCamera';
import {resolveWorldPulseAlertSite} from './worldPulseModel';

export interface WorldPulseFocusRequest {
  world:WorldState;
  scopeKey:string;
  viewerId:string|null;
  fog:boolean;
  riskId:string;
  token:number;
}

type WorldPulseFocusContext=Pick<WorldPulseFocusRequest,'world'|'scopeKey'|'viewerId'|'fog'>&{active:boolean};

/** Accept only the exact displayed frame and camera authority; re-read the alert instead of trusting coordinates from the request. */
export function resolveWorldPulseFocusSite(request:WorldPulseFocusRequest,current:WorldPulseFocusContext):LocationNode|undefined {
  if(!current.active||request.world!==current.world||request.scopeKey!==current.scopeKey||
    request.viewerId!==current.viewerId||request.fog!==current.fog)return undefined;
  return resolveWorldPulseAlertSite(current.world,current.viewerId,current.fog,request.riskId);
}

export const WORLD_PULSE_CAMERA_DURATION_MS=280;

/** Tween valid presentation cameras only. Their legal pan/zoom region is convex. */
export function interpolatePulseCamera(from:MapCamera,to:MapCamera,elapsedMs:number):MapCamera {
  if(!(elapsedMs>0))return from;
  if(elapsedMs>=WORLD_PULSE_CAMERA_DURATION_MS)return to;
  const t=1-(1-elapsedMs/WORLD_PULSE_CAMERA_DURATION_MS)**3;
  return {
    x:from.x+(to.x-from.x)*t,
    y:from.y+(to.y-from.y)*t,
    zoom:from.zoom+(to.zoom-from.zoom)*t,
  };
}
