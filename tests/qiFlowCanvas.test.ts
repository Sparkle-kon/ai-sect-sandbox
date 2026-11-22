import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveFormationAction } from '../src/engine/formationNetworkEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { visibleFormationMapLinks } from '../src/components/formationMapView';
import { buildQiFlowPlan, drawQiFlow } from '../src/components/qiFlowCanvas';
import { createTerrainMapView } from '../src/components/terrainMapView';

function fixture() {
  const world = createInitialWorld(99536);
  world.tick = 10;
  const [first, second, foreign] = world.sects;
  for (const sect of [first, second]) {
    sect.facilities.qi_array = 1;
    sect.spiritStones = 200;
  }
  const a = world.locations.find(({ id }) => id === first.headquartersId)!;
  const b = world.locations.find(({ id }) => id === second.headquartersId)!;
  Object.assign(a, { x: 405, y: 205, ownerSectId: first.id });
  Object.assign(b, { x: 525, y: 205, ownerSectId: second.id });
  const viewer = world.cultivators.find(({ id }) => id === first.leaderId)!;
  const peer = world.cultivators.find(({ id }) => id === second.leaderId)!;
  const outsider = world.cultivators.find(({ id }) => id === foreign.leaderId)!;
  viewer.locationId = a.id;
  peer.locationId = b.id;
  expect(resolveFormationAction(world, viewer, {
    chosenAction: 'FORMATION_NETWORK', formationMove: 'offer', targetSectId: second.id, innerMonologue: '',
  })?.witnessScope).toBe('participants');
  const link = world.formations.links[0];
  expect(resolveFormationAction(world, peer, {
    chosenAction: 'FORMATION_NETWORK', formationMove: 'accept', targetFormationLinkId: link.id, innerMonologue: '',
  })).not.toBeNull();
  return { world, a, b, viewer, outsider, link };
}

function inkRecorder() {
  const ops: Array<{ name: string; args: number[] }> = [];
  const target = Object.fromEntries(['save', 'beginPath', 'rect', 'clip', 'moveTo', 'lineTo',
    'stroke', 'arc', 'fill', 'ellipse', 'bezierCurveTo', 'restore', 'setLineDash'].map(name =>
    [name, (...args: number[]) => ops.push({ name, args })]));
  return { ops, ctx: target as unknown as CanvasRenderingContext2D };
}

describe('Qi flow projection and reduced-motion paint', () => {
  it('uses an actual jointly funded active formation and excludes outsider, torn, or spoofed projections', () => {
    const { world, a, b, viewer, outsider, link } = fixture();
    const view = createTerrainMapView(world, viewer, false);
    const allowed = visibleFormationMapLinks(world, view, viewer);
    expect(allowed).toHaveLength(1);
    const snapshot = JSON.stringify(world);
    const plan = buildQiFlowPlan(world, view, allowed);
    const bound = [plan.links[0]?.a.x, plan.links[0]?.b.x].sort();
    expect(bound).toEqual([a.x, b.x]);
    expect(plan.links[0]?.id).toBe(link.id);
    expect(buildQiFlowPlan(world, view, allowed)).toEqual(plan);
    expect(JSON.stringify(world)).toBe(snapshot);
    const foreignView = createTerrainMapView(world, outsider, false);
    expect(buildQiFlowPlan(world, foreignView, visibleFormationMapLinks(world, foreignView, outsider)).links).toEqual([]);
    expect(buildQiFlowPlan(world, view, [{ ...allowed[0], a: { ...allowed[0].a, x: 120 } }]).links).toEqual([]);
    link.status = 'broken';
    expect(buildQiFlowPlan(world, view, allowed).links).toEqual([]);
    expect(buildQiFlowPlan(world, view, visibleFormationMapLinks(world, view, viewer)).links).toEqual([]);
  });

  it('fails closed on explored endpoints, hidden intervening tiles, and even a revealed scoped gate', () => {
    const { world, a, b, viewer } = fixture();
    const open = createTerrainMapView(world, viewer, false);
    const painted = visibleFormationMapLinks(world, open, viewer);
    const aTile = terrainTileAt(world, a.x, a.y)!;
    const bTile = terrainTileAt(world, b.x, b.y)!;
    const current = new Set([aTile.id, bTile.id]);
    const tileState: typeof open.tileState = tile => current.has(tile.id) ? 'visible' : 'explored';
    const gate = { ...a, id: 'loc-scoped-test', type: 'secret_realm' as const, expeditionOmenId: 'test-gate' };
    world.locations.push(gate);
    const masked = { ...open, current, tileState, seenLocations: [...open.seenLocations, gate],
      isCurrentLocation: () => true };
    const plan = buildQiFlowPlan(world, masked, painted);
    expect(plan.sites.map(({ id }) => id).sort()).toEqual([a.id, b.id].sort());
    expect(plan.links).toEqual([]);
    expect(plan.clip).toHaveLength(2);
    current.delete(bTile.id);
    const narrower = buildQiFlowPlan(world, masked, painted);
    expect(narrower.sites.map(({ id }) => id)).toEqual([a.id]);
    expect(narrower.clip).toHaveLength(1);
    current.clear();
    expect(buildQiFlowPlan(world, masked, painted)).toEqual({ clip: [], sites: [], links: [], hasMotion: false });
  });

  it('clips every form of ink and paints a meaningful, deterministic still composition', () => {
    const { world, viewer } = fixture();
    const view = createTerrainMapView(world, viewer, false);
    const plan = buildQiFlowPlan(world, view, visibleFormationMapLinks(world, view, viewer));
    expect(plan.hasMotion).toBe(true);
    expect(plan.sites.length).toBeLessThanOrEqual(12);
    expect(plan.links.length).toBeLessThanOrEqual(8);
    expect(plan.clip).toHaveLength(world.terrain.rows);
    const draw = (phase: number, animate: boolean) => {
      const { ops, ctx } = inkRecorder();
      drawQiFlow(ctx, plan, phase, animate, 1);
      return ops;
    };
    const still = draw(2, false);
    expect(draw(40, false)).toEqual(still);
    expect(draw(3, true)).not.toEqual(draw(4, true));
    const names = still.map(({ name }) => name);
    expect(names.at(-1)).toBe('restore');
    expect(names.indexOf('clip')).toBeGreaterThan(names.lastIndexOf('rect'));
    for (const form of ['moveTo', 'lineTo', 'stroke', 'ellipse', 'bezierCurveTo', 'arc', 'fill']) {
      expect(names.indexOf(form)).toBeGreaterThan(names.indexOf('clip'));
    }
    expect(still.filter(({ name }) => name === 'arc')).toHaveLength(3 * (plan.sites.length + plan.links.length));
  });
});
