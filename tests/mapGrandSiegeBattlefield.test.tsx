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
      settledTick: proof.terminal!.tick, rounds: proof.rounds.length,
      ...(proof.rounds.some(round=>round.wallBefore>0&&round.wallAfter===0)?{brokenArray:true}:{}),
    }]);
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

  it('adds a matte scar only for the actual verified positive-to-zero array break', () => {
    const {settled}=fixture();
    const campaign=actualSiege(settled);
    const original=campaign.theatre!.rounds.find(round=>round.wallBefore>0&&round.wallAfter===0);
    expect(original).toBeDefined();
    const {plan}=project(settled);
    expect(plan.battlefields?.[0]?.brokenArray).toBe(true);
    expect(mapBattlefieldSummary(plan.battlefields![0])).toContain('此役曾破阵，只是旧痕');
    const spy=(elapsed:number,animate:boolean)=>{
      const arcs=vi.fn(),lines=vi.fn(),inks:string[]=[];
      const ctx={save:vi.fn(),restore:vi.fn(),translate:vi.fn(),beginPath:vi.fn(),moveTo:vi.fn(),lineTo:lines,
        setLineDash:vi.fn(),stroke:vi.fn(),ellipse:arcs,set strokeStyle(color:string){inks.push(color);},
      } as unknown as CanvasRenderingContext2D;
      drawMapCombatVfx(ctx,{...plan,effects:[],storms:[],sieges:[]},elapsed,animate,1);
      return {arcs:arcs.mock.calls,lines:lines.mock.calls,inks};
    };
    const still=spy(0,false);
    expect(still.arcs).toHaveLength(4);
    expect(still.inks).toContain('#857d83');
    expect(spy(12000,true)).toEqual(still);
    const disputed=structuredClone(settled);
    if(!original)throw Error('missing native break');
    const source=disputed.events.find(row=>row.id===original.sourceEventId)!;
    source.witnessScope='participants';
    expect(project(disputed).plan.battlefields?.[0]?.brokenArray).toBeUndefined();
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
    expect(battlefields?.[0]?.brokenArray).toBe(true); // The independently retained public anchor still proves the break.
    const paint = (elapsed: number, motion: boolean) => {
      const ellipse = vi.fn(), lineTo = vi.fn();
      const context = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), beginPath: vi.fn(),
        moveTo: vi.fn(), lineTo, ellipse, setLineDash: vi.fn(), stroke: vi.fn() } as unknown as CanvasRenderingContext2D;
      drawMapCombatVfx(context, { battlefields, effects: [], sieges: [], storms: [], hasTransient: false }, elapsed, motion, 1);
      return { arcs: ellipse.mock.calls, fissure: lineTo.mock.calls };
    };
    expect(paint(0, false).arcs).toHaveLength(4);
    expect(paint(12000, true)).toEqual(paint(0, false));
  });
});
