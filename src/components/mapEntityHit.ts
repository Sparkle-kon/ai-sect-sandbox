import type {MapLabelRect} from './mapLabelLayout';
import type { Cultivator, LocationNode,MapPoint } from '../types/world';
import { closestViewportTarget, MAP_HEIGHT, MAP_WIDTH, mapToScreen } from './mapCamera';
import type { CameraPoint, MapCamera } from './mapCamera';
import { pickActorMarker, visibleMarkerMembers } from './mapActorClusters';
import type { MapActorMarker, MapActorPoint, MarkerViewport } from './mapActorClusters';

export interface MapEntityPaintedFrame {
  readonly markers: readonly MapActorMarker[];
  readonly positions: readonly MapActorPoint[];
  readonly camera: MapCamera;
  readonly size: MarkerViewport;
  readonly scope: string;
  readonly sitePins?:ReadonlyMap<string,MapPoint>;
  readonly siteLabels?:ReadonlyMap<string,MapLabelRect>;
}

interface MapEntityHitInput {
  /** Logical viewport position after clientToMapViewport, not CSS pixels. */
  screen: CameraPoint;
  isTouch: boolean;
  size: MarkerViewport;
  painted: MapEntityPaintedFrame | undefined;
  scope: string;
  positions: readonly MapActorPoint[];
  camera: MapCamera;
  actorById: ReadonlyMap<string, Cultivator>;
  seenLocations: readonly Pick<LocationNode, 'id' | 'x' | 'y'>[];
  isCurrentLocation: (id: string) => boolean;
}

/** Percentages (0–100) in the canvas wrapper, measured at the painted target's center. */
type Anchor = CameraPoint;

export type MapEntityHit =
  | { kind: 'stale' }
  | { kind: 'none' }
  | { kind: 'actor'; id: string; anchor: Anchor }
  | { kind: 'cluster'; marker: Extract<MapActorMarker, { kind: 'cluster' }>; anchor: Anchor }
  | { kind: 'site'; id: string; anchor: Anchor };

/** Share the painted-frame and current-visibility checks between tap and hover. */
export function resolveMapEntityHit({
  screen, isTouch, size, painted, scope, positions, camera, actorById, seenLocations, isCurrentLocation,
}: MapEntityHitInput): MapEntityHit {
  if (!painted || painted.scope !== scope || painted.positions !== positions || painted.camera !== camera ||
      painted.size.width !== size.width || painted.size.height !== size.height) return { kind: 'stale' };

  const current=seenLocations.filter(site=>isCurrentLocation(site.id));
  const css={x:screen.x*size.width/MAP_WIDTH,y:screen.y*size.height/MAP_HEIGHT};
  for(const site of current){
    const label=painted.siteLabels?.get(site.id);
    if(label&&css.x>=label.x&&css.y>=label.y&&css.x<=label.x+label.width&&css.y<=label.y+label.height){
      const point=mapToScreen(camera,painted.sitePins?.get(site.id)??site);
      return {kind:'site',id:site.id,anchor:{x:point.x*100/MAP_WIDTH,y:point.y*100/MAP_HEIGHT}};
    }
  }

  const picked = pickActorMarker(painted.markers,
    { x: screen.x * size.width / MAP_WIDTH, y: screen.y * size.height / MAP_HEIGHT }, isTouch);
  if (picked) {
    const [actor] = visibleMarkerMembers(picked, actorById);
    // The original tap consumes this painted marker even if all its members became invisible;
    // it may not become a tap on the location behind it.
    if (!actor) return { kind: 'stale' };
    const anchor = { x: picked.x * 100 / size.width, y: picked.y * 100 / size.height };
    return picked.kind === 'actor'
      ? { kind: 'actor', id: actor.id, anchor }
      : { kind: 'cluster', marker: picked, anchor };
  }

  const radius = isTouch ? 22 : Math.max(10, camera.zoom * 20 * size.width / MAP_WIDTH);
  const displayed=painted.sitePins?.size?current.map(site=>{
    const pin=painted.sitePins?.get(site.id);
    return pin?{...site,...pin}:site;
  }):current;
  const site = closestViewportTarget(displayed, camera, screen, size, radius);
  if (!site) return { kind: 'none' };
  const point = mapToScreen(camera, site);
  return { kind: 'site', id: site.id, anchor: { x: point.x * 100 / MAP_WIDTH, y: point.y * 100 / MAP_HEIGHT } };
}
