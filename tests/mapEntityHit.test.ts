import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveMapEntityHit } from '../src/components/mapEntityHit';
import type { MapEntityPaintedFrame } from '../src/components/mapEntityHit';
import type { MapActorMarker } from '../src/components/mapActorClusters';

const [actor, other] = createInitialWorld().cultivators;
const point = { actor, x: 910, y: 550 }; // The visual marker may be elsewhere during flight.
const positions = [point];
const camera = { x: -130, y: -30, zoom: 2 };
const size = { width: 400, height: 240 };
const actorMarker: MapActorMarker = {
  kind: 'actor', key: actor.id, point, selected: false, x: 120, y: 80, mouseRadius: 10,
};
const clusterMarker: MapActorMarker = {
  kind: 'cluster', key: 'cell-1', x: 120, y: 80, ids: [actor.id, other.id],
};
const painted: MapEntityPaintedFrame = { scope: 'branch|viewer:actor', positions, camera, size, markers: [actorMarker] };
const options: Parameters<typeof resolveMapEntityHit>[0] = {
  screen: { x: 300, y: 200 }, isTouch: false, size, painted, scope: painted.scope, positions, camera,
  actorById: new Map([[actor.id, actor]]),
  seenLocations: [{ id: 'site', x: 215, y: 115 }],
  isCurrentLocation: () => true,
};

describe('map entity hit from the painted viewport', () => {
  it('distinguishes stale frames from empty hits, including equal-by-value camera and actor positions', () => {
    for (const patch of [
      { painted: undefined }, { scope: 'new-branch' }, { positions: [...positions] },
      { camera: { ...camera } }, { size: { ...size, width: 401 } }, { size: { ...size, height: 241 } },
    ]) expect(resolveMapEntityHit({ ...options, ...patch })).toEqual({ kind: 'stale' });
    expect(resolveMapEntityHit({ ...options, screen: { x: 20, y: 20 } })).toEqual({ kind: 'none' });
  });

  it('chooses the visible actor over an overlapping site and anchors the actual drawn flight marker', () => {
    expect(resolveMapEntityHit(options)).toEqual({
      kind: 'actor', id: actor.id, anchor: { x: 30, y: 100 / 3 },
    });
    // Losing visibility consumes the painted hit, rather than choosing the covered site.
    for (const actorById of [new Map(), new Map([[actor.id, { ...actor, alive: false }]])]) {
      expect(resolveMapEntityHit({ ...options, actorById })).toEqual({ kind: 'stale' });
    }
  });

  it('retains exact cluster identity when any painted member remains currently visible', () => {
    const frame = { ...painted, markers: [clusterMarker] };
    const hit = resolveMapEntityHit({ ...options, painted: frame, actorById: new Map([[other.id, other]]) });
    expect(hit.kind).toBe('cluster');
    if (hit.kind === 'cluster') expect(hit.marker).toBe(clusterMarker);
    expect(resolveMapEntityHit({ ...options, painted: frame, actorById: new Map() })).toEqual({ kind: 'stale' });
  });

  it('uses the original CSS-finger radius and the camera-projected visible site center', () => {
    // (350,200) is 20 CSS pixels away; the mouse fallback radius is 16.
    const moved = { ...options, screen: { x: 350, y: 200 } };
    expect(resolveMapEntityHit(moved)).toEqual({ kind: 'none' });
    expect(resolveMapEntityHit({ ...moved, isTouch: true })).toMatchObject({ kind: 'actor', id: actor.id });

    const withoutActors = { ...moved, painted: { ...painted, markers: [] } };
    expect(resolveMapEntityHit({ ...withoutActors, isTouch: true })).toEqual({
      kind: 'site', id: 'site', anchor: { x: 30, y: 100 / 3 },
    });
    expect(resolveMapEntityHit({ ...withoutActors, isTouch: true, isCurrentLocation: () => false })).toEqual({ kind: 'none' });
    expect(resolveMapEntityHit({
      ...options, painted: { ...painted, markers: [] }, seenLocations: [{ id: 'offscreen', x: 600, y: 500 }],
    })).toEqual({ kind: 'none' });
  });
});
