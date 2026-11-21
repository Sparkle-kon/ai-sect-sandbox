import type { GodBrushKind, MapPoint } from '../types/world';
import { brushPoint } from './mapBrushView';
import {
  clientToMapViewport, MAP_HEIGHT, MAP_WIDTH, MAX_ZOOM, panCamera, screenToMap,
} from './mapCamera';
import type { CameraPoint, MapCamera } from './mapCamera';

export type MapGestureContact = { id: number; pointerType: string; client: CameraPoint };
type ViewRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

export type MapGestureFrame = {
  camera: MapCamera;
  rect: ViewRect;
  scope: string;
  allowSingleTouchPan: boolean;
  brush?: GodBrushKind;
};
type GestureScope = { scope: string; width: number; height: number };
type SingleGesture = {
  phase: 'single';
  context: GestureScope;
  contact: MapGestureContact;
  initialClient: CameraPoint;
  initialScreen: CameraPoint;
  previousScreen: CameraPoint;
  moved: boolean;
  allowPan: boolean;
  brush?: GodBrushKind;
  points: MapPoint[];
};
type PinchAnchor = { distance: number; zoom: number; worldPoint: CameraPoint };
type PinchGesture = {
  phase: 'pinch';
  context: GestureScope;
  pair: readonly [number, number];
  contacts: ReadonlyMap<number, MapGestureContact>;
  anchor?: PinchAnchor;
};
export type MapGestureState = { phase: 'idle' } | SingleGesture | PinchGesture |
  { phase: 'drain'; contactIds: ReadonlySet<number> };
export type MapGestureTransition = {
  state: MapGestureState;
  camera?: MapCamera;
  preview?: MapPoint[];
  disarmBrush?: true;
  finished?: { kind: 'tap'; screen: CameraPoint; isTouch: boolean } |
    { kind: 'stroke'; brush: GodBrushKind; points: MapPoint[] };
};

export const IDLE_MAP_GESTURE: MapGestureState = Object.freeze({ phase: 'idle' });
const MIN_PINCH_START_CSS = 8;
const TAP_SLOP = { touch: 9, other: 5 };
const isTouch = (contact: MapGestureContact) => contact.pointerType === 'touch';
const distance = (a: CameraPoint, b: CameraPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const snapshot = ({ scope, rect: { width, height } }: MapGestureFrame): GestureScope => ({ scope, width, height });
const sameFrame = ({ scope, width, height }: GestureScope, frame: MapGestureFrame) =>
  scope === frame.scope && width === frame.rect.width && height === frame.rect.height;
const screenOf = (contact: MapGestureContact, frame: MapGestureFrame) =>
  Number.isFinite(contact.client.x) && Number.isFinite(contact.client.y)
    ? clientToMapViewport(frame.rect, contact.client) : undefined;
const insideMap = (point: CameraPoint | undefined): point is CameraPoint => Boolean(point &&
  point.x >= 0 && point.x <= MAP_WIDTH && point.y >= 0 && point.y <= MAP_HEIGHT);
const unfinishedBrush = (state: MapGestureState) => state.phase === 'single' && state.brush;
const disarm = (state: MapGestureState): Pick<MapGestureTransition, 'preview' | 'disarmBrush'> =>
  unfinishedBrush(state) ? { preview: [], disarmBrush: true } : {};

function activeIds(state: MapGestureState): ReadonlySet<number> {
  switch (state.phase) {
    case 'idle': return new Set();
    case 'single': return new Set([state.contact.id]);
    case 'pinch': return new Set(state.contacts.keys());
    case 'drain': return state.contactIds;
  }
}
function drain(ids: ReadonlySet<number>): MapGestureState {
  return ids.size ? { phase: 'drain', contactIds: ids } : IDLE_MAP_GESTURE;
}
function pairGeometry(a: MapGestureContact, b: MapGestureContact, frame: MapGestureFrame) {
  if (!Number.isFinite(a.client.x) || !Number.isFinite(a.client.y) ||
      !Number.isFinite(b.client.x) || !Number.isFinite(b.client.y)) return undefined;
  const { rect } = frame;
  const center = clientToMapViewport(rect, { x: (a.client.x + b.client.x) / 2, y: (a.client.y + b.client.y) / 2 });
  return center ? { center, distance: distance(a.client, b.client) } : undefined;
}
function startAnchor(a: MapGestureContact, b: MapGestureContact, frame: MapGestureFrame): PinchAnchor | undefined {
  const pair = pairGeometry(a, b, frame);
  return pair && pair.distance >= MIN_PINCH_START_CSS ?
    { distance: pair.distance, zoom: frame.camera.zoom, worldPoint: screenToMap(frame.camera, pair.center) } : undefined;
}

/** An outside pointer can invalidate an active interaction, but can never start or join map zoom. */
export function beginMapGesture(state: MapGestureState, contact: MapGestureContact, frame: MapGestureFrame, inside = true): MapGestureTransition {
  if (state.phase === 'idle') {
    const screen = inside ? screenOf(contact, frame) : undefined;
    if (!insideMap(screen)) return { state };
    const points = frame.brush ? brushPoint([], screenToMap(frame.camera, screen)) : [];
    const single: SingleGesture = {
      phase: 'single', context: snapshot(frame), contact, initialClient: contact.client,
      initialScreen: screen, previousScreen: screen, moved: false, allowPan: !isTouch(contact) || frame.allowSingleTouchPan,
      brush: frame.brush, points,
    };
    return { state: single, ...(frame.brush ? { preview: points } : {}) };
  }
  const ids = activeIds(state);
  if (ids.has(contact.id)) return { state };
  if (state.phase === 'drain' || !inside || !sameFrame(state.context, frame) ||
    state.phase === 'single' && (!isTouch(state.contact) || !isTouch(contact))) {
    return { state: drain(new Set([...ids, contact.id])), ...disarm(state) };
  }
  if (state.phase === 'pinch') {
    return { state: { ...state, contacts: new Map([...state.contacts, [contact.id, contact]]) } };
  }
  const first = state.contact;
  return {
    state: {
      phase: 'pinch', context: snapshot(frame), pair: [first.id, contact.id],
      contacts: new Map([[first.id, first], [contact.id, contact]]), anchor: startAnchor(first, contact, frame),
    },
    ...disarm(state),
  };
}

export function moveMapGesture(state: MapGestureState, contact: MapGestureContact, frame: MapGestureFrame): MapGestureTransition {
  if (state.phase === 'idle' || state.phase === 'drain') return { state };
  if (state.phase === 'single') {
    if (state.contact.id !== contact.id) return { state };
    if (!sameFrame(state.context, frame) || state.brush !== frame.brush) return invalidateMapGesture(state);
    const screen = screenOf(contact, frame);
    if (!screen) return { state };
    if (state.brush) {
      const points = insideMap(screen) ? brushPoint(state.points, screenToMap(frame.camera, screen)) : state.points;
      return { state: { ...state, contact, previousScreen: screen, points }, ...(points === state.points ? {} : { preview: points }) };
    }
    const moved = state.moved || distance(contact.client, state.initialClient) >= (isTouch(state.contact) ? TAP_SLOP.touch : TAP_SLOP.other);
    const previous = state.moved ? state.previousScreen : state.initialScreen;
    return {
      state: { ...state, contact, moved, previousScreen: screen },
      ...(moved && state.allowPan ? { camera: panCamera(frame.camera, { x: screen.x - previous.x, y: screen.y - previous.y }) } : {}),
    };
  }
  if (!state.contacts.has(contact.id)) return { state };
  if (!sameFrame(state.context, frame)) return invalidateMapGesture(state);
  if (contact.id !== state.pair[0] && contact.id !== state.pair[1]) return { state };
  const contacts = new Map(state.contacts);
  contacts.set(contact.id, contact);
  const first = contacts.get(state.pair[0])!;
  const second = contacts.get(state.pair[1])!;
  if (!state.anchor) return { state: { ...state, contacts, anchor: startAnchor(first, second, frame) } };
  const geometry = pairGeometry(first, second, frame);
  if (!geometry) return { state };
  const { center, distance: spread } = geometry;
  const zoom = Math.max(1, Math.min(MAX_ZOOM, state.anchor.zoom * spread / state.anchor.distance));
  // Pin the *original world point* under the moving centroid. Only world bounds may break that anchor.
  const camera = panCamera({ zoom, x: 0, y: 0 }, {
    x: center.x - state.anchor.worldPoint.x * zoom,
    y: center.y - state.anchor.worldPoint.y * zoom,
  });
  return { state: { ...state, contacts }, camera };
}

export function endMapGesture(state: MapGestureState, contact: MapGestureContact, frame: MapGestureFrame): MapGestureTransition {
  if (state.phase === 'idle') return { state };
  if (state.phase === 'single') {
    if (state.contact.id !== contact.id) return { state };
    if (!sameFrame(state.context, frame) || state.brush !== frame.brush) return cancelMapGesture(state, contact.id);
    const screen = screenOf(contact, frame);
    if (state.brush) {
      const points = insideMap(screen) ? brushPoint(state.points, screenToMap(frame.camera, screen), true) : state.points;
      return { state: IDLE_MAP_GESTURE, preview: [],
        ...(points.length ? { finished: { kind: 'stroke', brush: state.brush, points } as const } : {}) };
    }
    if (!insideMap(screen) || state.moved ||
      distance(contact.client, state.initialClient) >= (isTouch(state.contact) ? TAP_SLOP.touch : TAP_SLOP.other)) return { state: IDLE_MAP_GESTURE };
    return { state: IDLE_MAP_GESTURE, finished: { kind: 'tap', screen, isTouch: isTouch(state.contact) } };
  }
  if (state.phase === 'pinch' && state.contacts.has(contact.id) &&
    contact.id !== state.pair[0] && contact.id !== state.pair[1] && sameFrame(state.context, frame)) {
    const contacts = new Map(state.contacts);
    contacts.delete(contact.id);
    return { state: { ...state, contacts } };
  }
  return cancelMapGesture(state, contact.id);
}

/** A normal pointer-up is already removed before lost capture arrives; unexpected loss must never commit. */
export function cancelMapGesture(state: MapGestureState, id: number): MapGestureTransition {
  const ids = activeIds(state);
  if (!ids.has(id)) return { state };
  const remaining = new Set(ids);
  remaining.delete(id);
  return { state: drain(remaining), ...disarm(state) };
}

/** Discard pending work but stay interlocked until already-down contacts are released. */
export function invalidateMapGesture(state: MapGestureState): MapGestureTransition {
  if (state.phase === 'idle' || state.phase === 'drain') return { state };
  return { state: drain(activeIds(state)), ...disarm(state) };
}
