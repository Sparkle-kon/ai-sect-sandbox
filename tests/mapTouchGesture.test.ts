import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { clientToMapViewport, DEFAULT_CAMERA, mapToScreen, MAX_ZOOM, screenToMap } from '../src/components/mapCamera';
import {
  beginMapGesture, cancelMapGesture, endMapGesture, IDLE_MAP_GESTURE, invalidateMapGesture, moveMapGesture,
} from '../src/components/mapTouchGesture';
import type { MapGestureContact, MapGestureFrame, MapGestureState, MapGestureTransition } from '../src/components/mapTouchGesture';

const contact = (id: number, x: number, y: number, pointerType = 'touch'): MapGestureContact => ({ id, pointerType, client: { x, y } });
const viewport = (size: number): MapGestureFrame => ({
  camera: DEFAULT_CAMERA, rect: { left: 9, top: 70, width: size, height: size * .6 }, scope: 'revision:main:live', allowSingleTouchPan: false,
});

describe('map touch and brush interlock', () => {
  it.each([360,390])('keeps the map point under the moving touch centroid at %d CSS px', width => {
    const frame = viewport(width);
    const cursor1 = contact(7,110,145);
    const cursor2 = contact(15,245,145);
    const first = beginMapGesture(IDLE_MAP_GESTURE,cursor1,frame);
    const pair = beginMapGesture(first.state,cursor2,frame);
    expect(pair.state.phase).toBe('pinch');
    const initialCentroid = clientToMapViewport(frame.rect,{ x:177.5,y:145 })!;
    const anchored = screenToMap(frame.camera,initialCentroid);
    const movedLeft = moveMapGesture(pair.state,contact(7,80,157),frame);
    const movedBoth = moveMapGesture(movedLeft.state,contact(15,275,183),{ ...frame,camera:movedLeft.camera! });
    const nextCentroid = clientToMapViewport(frame.rect,{ x:177.5,y:170 })!;
    expect(movedBoth.camera?.zoom).toBeCloseTo(Math.hypot(195,26) / 135,8);
    expect(mapToScreen(movedBoth.camera!,anchored).x).toBeCloseTo(nextCentroid.x,8);
    expect(mapToScreen(movedBoth.camera!,anchored).y).toBeCloseTo(nextCentroid.y,8);
    expect(movedBoth.finished).toBeUndefined();
  });

  it('does not let a nearly coincident pair produce a huge zoom; reuses bounds when captured pointers leave the canvas', () => {
    const frame = viewport(360);
    const first = beginMapGesture(IDLE_MAP_GESTURE,contact(1,150,140),frame);
    const close = beginMapGesture(first.state,contact(2,154,141),frame);
    const anchor = moveMapGesture(close.state,contact(2,165,140),frame);
    expect(anchor.camera).toBeUndefined();
    const far = moveMapGesture(anchor.state,contact(2,1400,1300),frame);
    expect(far.camera?.zoom).toBe(MAX_ZOOM);
    expect(far.camera?.x).toBeLessThanOrEqual(0);
    expect(far.camera?.x).toBeGreaterThanOrEqual(-3000);
    expect(far.camera?.y).toBeLessThanOrEqual(0);
    expect(far.camera?.y).toBeGreaterThanOrEqual(-1800);
    const overlap = moveMapGesture(far.state,contact(2,150,140),{ ...frame,camera:far.camera! });
    expect(overlap.camera).toEqual(DEFAULT_CAMERA);
  });

  it('discards a real buffered stroke on the second pointer and makes the entire contact tail inert', () => {
    const world = createInitialWorld(98);
    let current = world;
    let motions = 0;
    const updateWorld = (transition: MapGestureTransition): MapGestureState => {
      if (transition.finished?.kind === 'stroke') {
        motions++;
        current = applyMapBrush(current, transition.finished.brush, transition.finished.points);
      }
      return transition.state;
    };
    const frame = { ...viewport(390), brush:'paint_vein' as const };
    const first = beginMapGesture(IDLE_MAP_GESTURE,contact(1,150,140),frame);
    expect(first.preview).toHaveLength(1);
    const buffered = moveMapGesture(first.state,contact(1,180,140),frame);
    expect(buffered.preview).toHaveLength(2);
    const interrupted = beginMapGesture(buffered.state,contact(2,235,150),frame);
    expect(interrupted).toMatchObject({ preview:[], disarmBrush:true, state:{ phase:'pinch' } });
    let state = updateWorld(interrupted);
    state = updateWorld(endMapGesture(state,contact(1,180,140),frame));
    expect(state.phase).toBe('drain');
    expect(moveMapGesture(state,contact(2,285,155),frame)).toEqual({ state });
    state = updateWorld(beginMapGesture(state,contact(3,100,150),frame));
    state = updateWorld(endMapGesture(state,contact(2,285,155),frame));
    expect(state.phase).toBe('drain');
    const last = endMapGesture(state,contact(3,100,150),frame);
    state = updateWorld(last);
    expect(last.finished).toBeUndefined();
    expect(state).toBe(IDLE_MAP_GESTURE);
    expect(current).toBe(world);
    expect(motions).toBe(0);
    const deliberate = beginMapGesture(state,contact(4,105,150),frame);
    updateWorld(endMapGesture(deliberate.state,contact(4,140,150),frame));
    expect(motions).toBe(1);
    expect(current.interventionSequence).toBe(world.interventionSequence + 1);
  });

  it.each(['cancel','scope','resize','brush','manual','outside','mixed'] as const)('disarms unfinished brush without any final action after %s', cause => {
    const frame = { ...viewport(360), brush:'meteor' as const };
    const main = contact(1,120,140);
    const first = beginMapGesture(IDLE_MAP_GESTURE,main,frame);
    const buffered = moveMapGesture(first.state,contact(1,155,150),frame);
    const external = contact(2,380,180);
    let affected: MapGestureTransition;
    switch (cause) {
      case 'cancel': affected = cancelMapGesture(buffered.state,1); break;
      case 'scope': affected = endMapGesture(buffered.state,main,{ ...frame,scope:'revision:branch-1:preview' }); break;
      case 'resize': affected = moveMapGesture(buffered.state,main,{ ...frame,rect:{ ...frame.rect,width:390 } }); break;
      case 'brush': affected = endMapGesture(buffered.state,main,{ ...frame,brush:'beast_tide' }); break;
      case 'manual': affected = invalidateMapGesture(buffered.state); break;
      case 'outside': affected = beginMapGesture(buffered.state,external,frame,false); break;
      case 'mixed': affected = beginMapGesture(buffered.state,contact(2,250,155,'pen'),frame); break;
    }
    expect(affected).toMatchObject({ preview:[], disarmBrush:true });
    expect(affected.finished).toBeUndefined();
    let next = endMapGesture(affected.state,main,frame);
    expect(next.finished).toBeUndefined();
    if (cause === 'outside' || cause === 'mixed') {
      expect(next.state.phase).toBe('drain');
      next = endMapGesture(next.state,external,frame);
    }
    expect(next.state).toBe(IDLE_MAP_GESTURE);
    expect(cancelMapGesture(next.state,1)).toEqual({ state:IDLE_MAP_GESTURE });
  });

  it('lets one touch scroll without simulating pan/tap; in drag mode keeps existing one-finger panning', () => {
    const frame = { ...viewport(390), camera:{ zoom:2,x:-500,y:-300 } };
    const first = contact(1,120,140);
    const release = contact(1,125,169);
    const single = beginMapGesture(IDLE_MAP_GESTURE,first,frame);
    const moving = moveMapGesture(single.state,release,frame);
    expect(moving.camera).toBeUndefined();
    expect(endMapGesture(moving.state,release,frame).finished).toBeUndefined();
    const tap = endMapGesture(single.state,contact(1,124,143),frame);
    expect(tap.finished).toMatchObject({ kind:'tap', isTouch:true });
    const activePan = { ...frame,allowSingleTouchPan:true };
    const dragging = beginMapGesture(IDLE_MAP_GESTURE,first,activePan);
    const dragged = moveMapGesture(dragging.state,release,activePan);
    expect(dragged.camera?.x).toBeCloseTo(-500 + 5 * 1000 / 390,8);
    expect(dragged.camera?.y).toBeCloseTo(-300 + 29 * 600 / 234,8);
    expect(endMapGesture(dragged.state,release,activePan).finished).toBeUndefined();
  });

  it('keeps a fixed pair when another finger taps the canvas; losing a pinch contact never resumes single-pointer work', () => {
    const frame = viewport(360);
    const one = contact(1,90,140), two = contact(2,240,140), three = contact(3,300,160);
    const first = beginMapGesture(IDLE_MAP_GESTURE,one,frame);
    const pair = beginMapGesture(first.state,two,frame);
    const third = beginMapGesture(pair.state,three,frame);
    expect(moveMapGesture(third.state,contact(3,155,180),frame)).toEqual({ state:third.state });
    const thirdLift = endMapGesture(third.state,three,frame);
    expect(thirdLift.state.phase).toBe('pinch');
    const losingPair = cancelMapGesture(thirdLift.state,1);
    expect(losingPair.state.phase).toBe('drain');
    expect(moveMapGesture(losingPair.state,contact(2,200,165),frame)).toEqual({ state:losingPair.state });
    expect(endMapGesture(losingPair.state,two,frame)).toEqual({ state:IDLE_MAP_GESTURE });
  });
});
