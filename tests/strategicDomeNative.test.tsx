import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { centerCamera, DEFAULT_CAMERA } from '../src/components/mapCamera';
import { toggleStrategicCameraMode } from '../src/components/strategicCameraMode';
import { strategicMinimapPointerPoint } from '../src/components/StrategicMinimap';
import { WorldMapCanvas } from '../src/components/WorldMapCanvas';
import { buildMapCombatVfxPlan } from '../src/components/mapCombatVfxView';
import { buildMapPresentation } from '../src/components/mapPresentationView';
import { drawProtectiveArrayDomes } from '../src/components/protectiveArrayDomeDraw';
import { buildProtectiveArrayDomes } from '../src/components/protectiveArrayDomeView';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableSectEconomyActions } from '../src/engine/sectEconomyEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload,WorldState } from '../src/types/world';

const leader='npc-1', outsider='npc-6', hqId='loc-taixu';
function fixture(){
  const initial=createInitialWorld();
  const actor=initial.cultivators.find(row=>row.id===leader)!;
  const action=availableSectEconomyActions(actor,initial).find(row=>row.action==='BUILD_FACILITY'&&row.facilityKind==='defense_array');
  expect(action).toBeDefined();
  const choices:Record<string,LLMDecisionPayload>=Object.fromEntries(initial.cultivators.map(row=>[row.id,
    {chosenAction:'REST',innerMonologue:'静守此地。'}]));
  choices[actor.id]={chosenAction:'BUILD_FACILITY',facilityKind:'defense_array',innerMonologue:'在原山门实筑护山阵。'};
  const built=advanceWorldTick(initial,choices,()=>.8,'utility');
  return {initial,built};
}
function project(world:WorldState,viewerId:string){
  const viewer=world.cultivators.find(row=>row.id===viewerId);
  const view=createTerrainMapView(world,viewer,true);
  const positions=mapActorPositions(view.seenLocations,view.liveActors,view.trailPositions);
  return buildProtectiveArrayDomes(world,view,buildMapCombatVfxPlan(world,view,buildMapPresentation(world,view,positions)));
}

describe('strategic dome coupled to an actual sect facility',()=>{
  it('paints the genuine paid current mountain gate in reduced motion and never paints the fogged site',()=>{
    const {initial,built}=fixture(), before=JSON.stringify(built);
    const original=initial.sects[0], current=built.sects.find(row=>row.id===original.id)!;
    expect(original.facilities.defense_array).toBe(0);
    expect(current.facilities.defense_array).toBe(1);
    expect(current.spiritStones).toBeLessThan(original.spiritStones);
    expect(built.resourceFlow.months.flatMap(month=>month.entries)).toContainEqual(expect.objectContaining({
      reason:'facility_construction',refId:current.id,good:'stone',amount:340,
    }));
    expect(project(initial,leader)).toEqual([]);
    const visible=project(built,leader);
    const headquarters=built.locations.find(row=>row.id===hqId)!;
    expect(visible).toEqual([expect.objectContaining({
      sectId:current.id, hp:current.arrayHp, maxHp:current.arrayMaxHp, integrity:1, impacted:false, besieged:false,
    })]);
    expect(visible[0].location).toBe(headquarters);
    expect(project(built,outsider)).toEqual([]);
    const spy={
      save:vi.fn(),restore:vi.fn(),translate:vi.fn(),setLineDash:vi.fn(),beginPath:vi.fn(),ellipse:vi.fn(),
      createLinearGradient:vi.fn(()=>({addColorStop:vi.fn()})),closePath:vi.fn(),fill:vi.fn(),stroke:vi.fn(),
    };
    const context=spy as unknown as CanvasRenderingContext2D;
    drawProtectiveArrayDomes(context,project(built,outsider),2000,false,1);
    expect(spy.translate).not.toHaveBeenCalled();
    drawProtectiveArrayDomes(context,visible,2000,false,1);
    expect(spy.translate.mock.calls).toEqual([[headquarters.x,headquarters.y]]);
    expect(spy.ellipse).toHaveBeenCalled();
    expect(spy.stroke).toHaveBeenCalled();
    expect(JSON.stringify(built)).toBe(before);
  });

  it('preserves the two-action story and has a real map Canvas in both scoped compact configurations',()=>{
    const {built}=fixture();
    const story=renderToStaticMarkup(<App/>);
    expect(story).toContain('data-story-home');
    expect(story.match(/<button\b/g)).toHaveLength(3);
    expect(story.match(/<button[^>]*aria-label="启用仙乐"[^>]*aria-pressed="false"[^>]*>/g)).toHaveLength(1);
    expect(story).toMatch(/>看下个月<\/button>/);
    expect(story).toMatch(/>\s*走进故事\s*<\/button>/);
    for(const scopeKey of ['ordinary:map','cockpit:map']){
      const map=renderToStaticMarkup(<WorldMapCanvas world={built} selectedCultivatorId={leader} onSelectCultivator={()=>undefined}
        scopeKey={scopeKey} compact fogEnabled/>);
      expect(map).toContain('<canvas');
      expect(map).toContain('aria-label="战略小地图"');
      expect(map).toContain('aria-label="切换全景视图"');
      expect(map).toContain('aria-label="小地图：点击定位"');
      expect(map).toContain('护山阵 200/200');
      expect(map).not.toContain('上界阵原');
    }
    const remote=renderToStaticMarkup(<WorldMapCanvas world={built} selectedCultivatorId={outsider}
      onSelectCultivator={()=>undefined} scopeKey="ordinary:map" compact fogEnabled/>);
    expect(remote).toContain('aria-label="切换全景视图"');
    expect(remote).not.toContain('护山阵 200/200');
  });

  it('restores only the same canonical local camera and cannot target an actual hidden HQ by minimap click',()=>{
    const {initial,built}=fixture();
    const site=built.locations.find(row=>row.id===hqId)!;
    const local=centerCamera({...DEFAULT_CAMERA,zoom:3},site);
    const scope={world:built,scopeKey:'map',viewerId:leader,fog:true};
    const overview=toggleStrategicCameraMode(undefined,scope,local,site);
    expect(overview.camera).toBe(DEFAULT_CAMERA);
    expect(toggleStrategicCameraMode(overview.mode,scope,DEFAULT_CAMERA).camera).toEqual(local);
    expect(toggleStrategicCameraMode(overview.mode,{...scope,world:initial},DEFAULT_CAMERA).camera).toBe(DEFAULT_CAMERA);
    const bounds={left:0,top:0,width:1000,height:600};
    const home=built.cultivators.find(row=>row.id===leader)!;
    const other=built.cultivators.find(row=>row.id===outsider)!;
    expect(strategicMinimapPointerPoint(built,createTerrainMapView(built,home,true),bounds,site)).toEqual({x:site.x,y:site.y});
    expect(strategicMinimapPointerPoint(built,createTerrainMapView(built,other,true),bounds,site)).toBeUndefined();
  });
});
