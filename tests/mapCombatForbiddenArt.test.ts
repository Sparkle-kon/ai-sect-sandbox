import {describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {buildMapCombatVfxPlan} from '../src/components/mapCombatVfxView';
import {drawMapCombatVfx} from '../src/components/mapCombatVfxDraw';
import {buildMapPresentation} from '../src/components/mapPresentationView';
import {createTerrainMapView,mapActorPositions} from '../src/components/terrainMapView';
import type {ForbiddenArtScar} from '../src/types/forbiddenArt';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const attacker='npc-1',opponent='elder-taixu-1',remote='npc-6',site='loc-taixu';
function fixture(){
  const initial=createInitialWorld(1,'spirit-bloom');
  const world=advanceWorldTick(initial,Object.fromEntries(initial.cultivators.map(person=>[person.id,person.id===attacker?
    {chosenAction:'DUEL',targetCultivatorId:opponent,innerMonologue:''}:{chosenAction:'REST',innerMonologue:''}])) as Record<string,LLMDecisionPayload>,
  ()=>.2,'utility');
  const event=world.events.find(row=>row.tick===world.tick&&row.category==='combat'&&row.id===`evt-${world.tick}-${attacker}-duel`)!;
  expect(event.duelWinnerId).toBeTruthy();
  // Hold the actual native duel/effect fixed while varying the authority's committed receipt fields.
  const scar={id:'fixture-paid-scar',contactId:'fixture-contact',artId:'taixu-sword-seal',ownerId:attacker,opponentId:opponent,
    artifactId:'fixture-weapon',siteId:site,openedTick:world.tick-1,tick:world.tick,paid:{hp:10,lifespan:0,durability:1},
    result:'survived',origin:'utility'} satisfies ForbiddenArtScar;
  return {world,event,scar};
}
function projected(world:WorldState,observer=attacker,fog=true){
  const view=createTerrainMapView(world,world.cultivators.find(person=>person.id===observer),fog);
  return buildMapCombatVfxPlan(world,view,buildMapPresentation(world,view,mapActorPositions(view.seenLocations,view.liveActors,view.trailPositions)));
}

describe('forbidden-art accent on genuine current duels only',()=>{
  it('decorates the original clash without new effects, labels or numerical damage',()=>{
    const {world,event,scar}=fixture();
    const before=projected(world);
    event.forbiddenArt=scar;
    const after=projected(world);
    expect(after.effects).toEqual(before.effects.map(row=>row.id===`${event.id}-clash`?{...row,forbiddenArtAccent:true}:row));
    const normal=after.effects.find(row=>row.id===`${event.id}-clash`)!;
    expect(normal.actorIds).toEqual(event.actorIds);
    expect(normal.amount).toBeUndefined();
    expect(projected(world,remote,true).effects.some(row=>row.forbiddenArtAccent)).toBe(false);
  });

  it('fails closed on forged roster/site/time/cost and on private or nonlocal sources',()=>{
    const {world,event,scar}=fixture();
    for(const impostor of [
      {...scar,opponentId:remote},{...scar,siteId:'loc-market'},{...scar,tick:world.tick-1},
      {...scar,paid:{hp:0,lifespan:0,durability:0}},{...scar,result:'escape' as const},
    ]){
      event.forbiddenArt=impostor;
      expect(projected(world).effects.some(row=>row.forbiddenArtAccent)).toBe(false);
    }
    event.forbiddenArt=scar;
    event.witnessScope='participants';
    expect(projected(world,attacker,false).effects.some(row=>row.forbiddenArtAccent)).toBe(false);
    delete event.witnessScope;
    world.cultivators.find(row=>row.id===opponent)!.locationId='loc-market';
    expect(projected(world,attacker,false).effects.some(row=>row.forbiddenArtAccent)).toBe(false);
  });

  it('paints one small sigil per site, static in reduced motion and absent after normal expiry',()=>{
    const {world,event,scar}=fixture();
    event.forbiddenArt=scar;
    const base=projected(world);
    const clash=base.effects.find(row=>row.forbiddenArtAccent)!;
    const plan={...base,effects:[clash,{...clash,id:'second-validated-clash'}]};
    const canvas=()=>{
      const ellipses=vi.fn(),text=vi.fn();
      const ctx={save:vi.fn(),restore:vi.fn(),setLineDash:vi.fn(),translate:vi.fn(),beginPath:vi.fn(),
        moveTo:vi.fn(),lineTo:vi.fn(),quadraticCurveTo:vi.fn(),stroke:vi.fn(),ellipse:ellipses,
        fillText:text,strokeText:text} as unknown as CanvasRenderingContext2D;
      return {ctx,ellipses,text};
    };
    const early=canvas(),laterReduced=canvas(),end=canvas();
    drawMapCombatVfx(early.ctx,plan,0,false,1,0);
    drawMapCombatVfx(laterReduced.ctx,plan,12_000,false,1,12);
    drawMapCombatVfx(end.ctx,plan,1_200,true,1,0);
    expect(early.ellipses).toHaveBeenCalledTimes(2);
    expect(laterReduced.ellipses.mock.calls).toEqual(early.ellipses.mock.calls);
    expect(end.ellipses).not.toHaveBeenCalled();
    expect(early.text).not.toHaveBeenCalled();
  });
});
