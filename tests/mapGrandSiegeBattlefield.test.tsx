import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MapKeyboardExplorer } from '../src/components/MapKeyboardExplorer';
import { mapBattlefieldSummary } from '../src/components/mapBattlefieldView';
import { buildMapCombatVfxPlan } from '../src/components/mapCombatVfxView';
import { drawMapCombatVfx } from '../src/components/mapCombatVfxDraw';
import { buildMapPresentation } from '../src/components/mapPresentationView';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import type { WorldState } from '../src/types/world';
import { actualGrandSiege, actualSiege, location, patriarch, siegeActor, siegeTurn } from './grandSiegeNativeFixture';

let campaign: ReturnType<typeof actualGrandSiege> & { settled: WorldState };
function fixture() {
  if (!campaign) {
    const evidence = actualGrandSiege();
    let settled = evidence.arrived;
    for (let index = 0; !actualSiege(settled).theatre?.terminal && index < 8; index++) settled = siegeTurn(settled);
    expect(actualSiege(settled).theatre?.terminal?.battlefield).toBe(true);
    campaign = { ...evidence, settled };
  }
  return campaign;
}

function project(world: WorldState, observer = patriarch, fog = true) {
  const view = createTerrainMapView(world, siegeActor(world, observer), fog);
  const actors = mapActorPositions(view.seenLocations, view.liveActors, view.trailPositions);
  const motion = buildMapPresentation(world, view, actors);
  const plan = buildMapCombatVfxPlan(world, view, motion);
  return { view, actors, motion, plan };
}

describe('historic map battlefield from an actual grand siege', () => {
  it('does not mark the declaration, assembly, arrival or still ongoing fight', () => {
    const { launched, assembled, arrived, settled } = fixture();
    for (const world of [launched, assembled, arrived]) expect(project(world).plan.battlefields).toBeUndefined();
    const fighting = siegeTurn(arrived);
    expect(actualSiege(fighting).theatre?.rounds[0]?.attackers.length).toBeGreaterThan(0);
    expect(actualSiege(fighting).theatre?.terminal).toBeUndefined();
    expect(project(fighting).plan.battlefields).toBeUndefined();
    const { plan } = project(settled), proof = actualSiege(settled).theatre!;
    expect(plan.battlefields).toEqual([{ location: settled.locations.find(site => site.id === location),
      settledTick: proof.terminal!.tick, rounds: proof.rounds.length }]);
    expect(plan.sieges).toEqual([]);
  });

  it('only paints the currently authorized location; exposed coordinates and names are not standing war or capture', () => {
    const { settled } = fixture();
    expect(project(settled, 'npc-6').plan.battlefields).toBeUndefined();
    const upstairs = structuredClone(settled);
    siegeActor(upstairs, patriarch).positionPlane = 'frontier';
    expect(project(upstairs, patriarch, false).plan.battlefields).toBeUndefined();

    const { view, actors, motion, plan } = project(settled);
    const battlefield = plan.battlefields![0];
    const markup = renderToStaticMarkup(<MapKeyboardExplorer world={settled} view={view} actorPositions={actors}
      presentation={motion} follows={false} zoom={1} battlefields={new Map([[location, battlefield]])}
      onFollow={() => {}} onCamera={() => {}} onSite={() => {}} onActor={() => {}} onFocusLost={() => {}} />);
    expect(markup).toContain(mapBattlefieldSummary(battlefield));
    expect(markup).not.toContain('已占领');
  });

  it('retains static geometry after the month and hot labels expire, but rejects conflicts and pre-battle peace', () => {
    const { arrived, settled } = fixture();
    const source = actualSiege(settled).theatre!.terminal!.sourceEventId;
    const disputed = structuredClone(settled);
    disputed.events.find(event => event.id === source)!.witnessScope = 'participants';
    expect(project(disputed).plan.battlefields).toBeUndefined();

    const peace = structuredClone(arrived);
    const beforeFight = actualSiege(peace);
    beforeFight.status = 'withdrawn';
    beforeFight.theatre!.terminal = { tick: peace.tick, status: 'withdrawn', sourceEventId: 'evt-7-ceasefire-1-signed', battlefield: true };
    expect(project(peace).plan.battlefields).toBeUndefined();

    const later = siegeTurn(settled);
    const receipts = actualSiege(later).theatre!;
    later.events = later.events.filter(event => ![
      receipts.sourceLaunchId, receipts.terminal!.sourceEventId, ...receipts.rounds.map(round => round.sourceEventId),
    ].includes(event.id));
    const { plan } = project(later);
    expect(plan.battlefields?.[0]?.settledTick).toBe(settled.tick);
    const { battlefields } = plan;
    const paint = (elapsed: number, motion: boolean) => {
      const ellipse = vi.fn(), lineTo = vi.fn();
      const context = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), beginPath: vi.fn(),
        moveTo: vi.fn(), lineTo, ellipse, setLineDash: vi.fn(), stroke: vi.fn() } as unknown as CanvasRenderingContext2D;
      drawMapCombatVfx(context, { battlefields, effects: [], sieges: [], storms: [], hasTransient: false }, elapsed, motion, 1);
      return { arcs: ellipse.mock.calls, fissure: lineTo.mock.calls };
    };
    expect(paint(0, false).arcs).toHaveLength(2);
    expect(paint(12000, true)).toEqual(paint(0, false));
  });
});
