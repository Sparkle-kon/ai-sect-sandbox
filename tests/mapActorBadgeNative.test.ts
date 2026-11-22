import { describe, expect, it } from 'vitest';
import { buildMapActorBadgeView } from '../src/components/mapActorBadgeView';
import { planMapActorBadgeLayout } from '../src/components/mapActorBadgeLayout';
import { planActorMarkers } from '../src/components/mapActorClusters';
import { DEFAULT_CAMERA } from '../src/components/mapCamera';
import { buildMapCombatVfxPlan } from '../src/components/mapCombatVfxView';
import { resolveMapEntityHit } from '../src/components/mapEntityHit';
import { buildMapPresentation } from '../src/components/mapPresentationView';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const speaker = 'npc-1', opponent = 'elder-taixu-1', outsider = 'npc-6';
const quote = '且接我一剑！';
const secret = '旁人绝无从知晓的内心谋划';
const rest: LLMDecisionPayload = {chosenAction:'REST',innerMonologue:'原地歇息。'};
function month(world:WorldState, action:LLMDecisionPayload=rest) {
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,actor.id===speaker?action:rest])),
    ()=>0.2,'utility');
}
function fixture(){
  const starting = createInitialWorld(1,'spirit-bloom');
  return month(starting,{chosenAction:'DUEL',targetCultivatorId:opponent,spokenLine:quote,innerMonologue:secret});
}
const viewport={width:1000,height:600};
function select(world:WorldState,viewerId=speaker,fog=false,includeQuote=true){
  const viewer=world.cultivators.find(actor=>actor.id===viewerId);
  const view=createTerrainMapView(world,viewer,fog);
  const positions=mapActorPositions(view.seenLocations,view.liveActors,view.trailPositions);
  const combat=buildMapCombatVfxPlan(world,view,buildMapPresentation(world,view,positions));
  return {view,positions,facts:buildMapActorBadgeView(world,view,combat,includeQuote)};
}

describe('actor badges integrated with native current map state',()=>{
  it('keeps the genuine spoken duel line for a visible actor without moving the exact touch hit',()=>{
    const world=fixture();
    const duel=world.events.find(event=>event.tick===world.tick&&event.duelWinnerId&&event.actorIds.includes(speaker))!;
    expect(duel.dialogue?.turns[0]).toMatchObject({speakerId:speaker,text:quote});
    const before=JSON.stringify(world);
    const {view,positions,facts}=select(world);
    expect(facts.get(speaker)?.quote).toBe(quote);
    const camera=DEFAULT_CAMERA;
    const markers=planActorMarkers(positions,camera,viewport,speaker);
    const marker=markers.find(row=>row.kind==='actor'&&row.key===speaker)!;
    const snapshot=JSON.stringify(markers);
    const layout=planMapActorBadgeLayout(markers,facts,viewport,speaker,text=>[...text].length*7);
    expect(JSON.stringify(layout)).toContain(quote);
    expect(JSON.stringify(layout)).not.toContain(secret);
    expect(JSON.stringify(markers)).toBe(snapshot);
    expect(resolveMapEntityHit({
      screen:{x:marker.x*1000/viewport.width,y:marker.y*600/viewport.height},isTouch:true,size:viewport,
      painted:{markers,positions,camera,size:viewport,scope:'same-native-frame'},scope:'same-native-frame',positions,camera,
      actorById:new Map(view.liveActors.map(actor=>[actor.id,actor])),
      seenLocations:view.seenLocations,isCurrentLocation:view.isCurrentLocation,
    })).toMatchObject({kind:'actor',id:speaker});
    expect(JSON.stringify(world)).toBe(before);
  });

  it('omits dialogue on fog, opt-out, an actual later month, and an independently restricted copy of the current fact',()=>{
    const world=fixture();
    const read=(world:WorldState,viewer=speaker,fog=false,include=true)=>{
      const {positions,facts}=select(world,viewer,fog,include);
      return JSON.stringify(planMapActorBadgeLayout(planActorMarkers(positions,DEFAULT_CAMERA,viewport,speaker),
        facts,viewport,speaker,text=>[...text].length*7));
    };
    expect(read(world)).toContain(quote);
    expect(read(world,outsider,true)).not.toContain(quote);
    expect(read(world,speaker,false,false)).not.toContain(quote);
    expect(read(month(world))).not.toContain(quote);
    const privateSibling=structuredClone(world);
    privateSibling.events.find(event=>event.tick===world.tick&&event.duelWinnerId&&event.actorIds.includes(speaker))!
      .witnessScope='participants';
    expect(read(privateSibling)).not.toContain(quote);
  });

  it('marks an actual heart-demon stage only after the native lightning waves',()=>{
    const initial=createInitialWorld(1,'spirit-bloom');
    const actor=initial.cultivators.find(person=>person.id===speaker)!;
    Object.assign(actor,{realm:'筑基',realmStage:9,qiProgress:100}); // Controlled pre-trial starting advancement.
    const opening=month(initial,{chosenAction:'BREAKTHROUGH',innerMonologue:'此地冲关。'});
    const trial=opening.cultivators.find(person=>person.id===speaker)!.tribulation!;
    expect(trial.stage).toBe('lightning');
    expect(select(opening).facts.get(speaker)?.statuses??[]).not.toContain('heart-demon');
    let next=opening;
    for(let wave=0;wave<trial.totalWaves;wave++){
      next=month(next,{chosenAction:'FACE_TRIBULATION',tribulationStance:'guard',innerMonologue:'凝神守劫。'});
    }
    expect(next.cultivators.find(person=>person.id===speaker)?.tribulation?.stage).toBe('heart_demon');
    expect(select(next).facts.get(speaker)?.statuses).toContain('heart-demon');
    expect(select(next,outsider,true).facts.get(speaker)).toBeUndefined();
  });
});
