import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {activeAvatar,availableAvatarHosts,availableAvatarInteractions,canPossessUpperPassageAvatar,
  possessAvatar,possessUpperPassageAvatar,queueAvatarOrder} from '../src/engine/avatarEngine';
import {advanceWorldTick,applyCultivatorBrainDecision,executeGodIntervention} from '../src/engine/worldEngine';
import {createTimeline,forkTimeline} from '../src/engine/timelineEngine';
import {currentVisibleTileIds,knownMapLocations,noteTerrainVisit} from '../src/engine/terrainEngine';
import {deriveMapPresentation} from '../src/engine/mapMotionEngine';
import {createTerrainMapView,mapActorPositions} from '../src/components/terrainMapView';
import {spreadRumors,witnessEvent} from '../src/engine/rumorEngine';
import {publicChronicleSceneEvents} from '../src/engine/chronicleLead';
import {beginRegionalSimulationTurn,configureRegionalSimulation,currentActorRegion} from '../src/engine/regionalSimulationEngine';
import {captureEstate} from '../src/engine/estateEngine';
import type {LLMDecisionPayload,WorldEvent} from '../src/types/world';

const REST:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'独立位面隔离夹具'};
const upperNode='realm-upper-gate';
const setup=(world=createInitialWorld(235))=>{
  const traveler=world.cultivators.find(a=>a.id==='npc-1')!;
  const neighbor=world.cultivators.find(a=>a.id==='npc-2')!;
  const lower=world.locations.find(x=>x.id==='loc-taixu')!;
  traveler.locationId=upperNode;
  traveler.positionPlane='upper';
  neighbor.sectId=traveler.sectId;
  neighbor.locationId=lower.id;
  return {world,traveler,neighbor,lower};
};

describe('existing lower workflows fail closed while a real actor is off the lower plane',()=>{
  it('does not create a fog-off phantom, maintain stale map traces, or reuse unrelated old fog knowledge',()=>{
    const {world,traveler,neighbor,lower}=setup();
    traveler.exploredTileIds=[...currentVisibleTileIds(world,neighbor)];
    const trail={cultivatorId:traveler.id,tick:world.tick,fromLocationId:lower.id,toLocationId:'loc-market',
      points:[{x:lower.x,y:lower.y},{x:lower.x+1,y:lower.y}]};
    world.mapPresentation.trails=[trail];
    const lowerView=createTerrainMapView(world,neighbor,false);
    expect(lowerView.liveActors).not.toContain(traveler);
    expect(lowerView.seenLocations).toContain(lower);
    expect(lowerView.isCurrentLocation(upperNode)).toBe(false);
    for(const fog of [true,false]){
      const upperView=createTerrainMapView(world,traveler,fog);
      expect(upperView.seenLocations).toEqual([]);
      expect(upperView.liveActors).toEqual([]);
      expect(upperView.locationTile.size).toBe(0);
    }
    expect(mapActorPositions(world.locations,[traveler],new Map([[traveler.id,{x:lower.x,y:lower.y}]]))).toEqual([]);
    expect(deriveMapPresentation(world,world,[]).trails).toEqual([]);
    const earlier=[...traveler.exploredTileIds];
    noteTerrainVisit(world,traveler);
    expect(traveler.exploredTileIds).toEqual(earlier);
    expect(currentVisibleTileIds(world,traveler).size).toBe(0);
    expect(knownMapLocations(world,traveler)).toEqual([]);
  });

  it('blocks same-sect flying sword, global ring targets, old orders, and even scope errors in legacy archive events',()=>{
    const {world,traveler,neighbor,lower}=setup();
    world.tick=3;
    const rumor=(id:string)=>({id,subject:'fixture',locationId:lower.id,originTick:1,learnedTick:1,
      confidence:100,hops:0,provenance:'witness' as const});
    traveler.rumors=[rumor('upper-secret')];
    neighbor.rumors=[rumor('lower-known')];
    spreadRumors(world);
    expect(traveler.rumors.map(x=>x.id)).toEqual(['upper-secret']);
    expect(neighbor.rumors.map(x=>x.id)).not.toContain('upper-secret');
    expect(availableAvatarHosts(world)).not.toContain(traveler);
    expect(availableAvatarInteractions(world,'ring').some(x=>x.targetCultivatorId===traveler.id)).toBe(false);
    world.playerAvatar.possessedId=traveler.id;world.playerAvatar.possessionUntilTick=8;
    expect(activeAvatar(world)?.id).toBe(traveler.id);
    expect(queueAvatarOrder(world,'REST')).toBe(false);
    expect(availableAvatarInteractions(world,'ring')).toEqual([]);
    const event:WorldEvent={id:'evt-upper-passage-3-traveler-advance',tick:3,year:world.year,month:world.month,
      category:'diplomacy',title:'不可作下界旧事',description:'隔离凭据',actorIds:[neighbor.id,traveler.id]};
    witnessEvent(world,event);world.events=[event,...world.events];
    expect(neighbor.rumors.some(x=>x.originEventId===event.id)).toBe(false);
    expect(publicChronicleSceneEvents(world)).not.toContain(event);
  });

  it('cannot redirect an explicit non-lower intervention; ordinary direct orders do not mutate an upper character',()=>{
    const {world,traveler,neighbor,lower}=setup();
    const original=structuredClone(traveler);
    const start=world.interventionSequence;
    expect(executeGodIntervention(world,{type:'TRIBULATION_STRIKE',targetCultivatorId:traveler.id})).toBe(world);
    expect(executeGodIntervention(world,{type:'WHISPER_MIND',targetCultivatorId:traveler.id,whisperText:'不得跨界'})).toBe(world);
    expect(executeGodIntervention(world,{type:'SPAWN_TREASURE',targetLocationId:upperNode})).toBe(world);
    expect(()=>forkTimeline(createTimeline(world),world.tick,{type:'TRIBULATION_STRIKE',targetCultivatorId:traveler.id}))
      .toThrow(expect.objectContaining({code:'invalid_intervention'}));
    const struck=executeGodIntervention(world,{type:'DEMONIC_TIDE'});
    expect(struck.interventionSequence).toBe(start+1);
    expect(struck.events[0].actorIds).not.toContain(traveler.id);
    expect(struck.events[0].actorIds).toContain(neighbor.id);
    expect(struck.cultivators.find(a=>a.id===traveler.id)).toEqual(original);
    expect(applyCultivatorBrainDecision(world,traveler,{chosenAction:'EXPLORE',targetLocationId:lower.id,innerMonologue:'stale'},
      ()=>{throw Error('wrong-plane decision consumed RNG');})).toBeNull();
    expect(traveler).toEqual(original);
  });

  it('restores a uniquely named stranded traveler via an explicit scoped avatar lane without stopping lower regional clocks',()=>{
    const {world,traveler,lower}=setup();
    world.upperPassage={version:1,upperReserve:0,journeys:[{id:'upper-passage-1-npc-1',actorId:traveler.id,openingId:'water-gate-1',
      wellProjectId:'village-work-1',enteredTick:1,paidStones:8,direction:'outbound',
      steps:[{tick:1,nodeId:upperNode,direction:'outbound'}]}]};
    expect(possessAvatar(world,traveler.id)).toBe(false);
    expect(canPossessUpperPassageAvatar(world,traveler.id)).toBe(true);
    expect(possessUpperPassageAvatar(world,traveler.id)).toBe(true);
    expect(activeAvatar(world)?.id).toBe(traveler.id);
    expect(configureRegionalSimulation(world,lower.id)).toBe(true);
    expect(currentActorRegion(world,traveler)).toBeUndefined();
    expect(beginRegionalSimulationTurn(world)).toBeDefined();
  });

  it('ages exactly once off-plane and retains the deceased same-body assets instead of creating lower inheritance',()=>{
    let world=createInitialWorld(235);
    while(world.month!==12)world=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(a=>[a.id,REST])),undefined,'utility');
    const {traveler}=setup(world);
    traveler.age=traveler.lifespan-1;
    const remaining=traveler.spiritStones;
    world.upperPassage={version:1,upperReserve:0,journeys:[{id:'upper-passage-1-npc-1',actorId:traveler.id,openingId:'water-gate-1',
      wellProjectId:'village-work-1',enteredTick:1,paidStones:8,direction:'outbound',
      steps:[{tick:1,nodeId:upperNode,direction:'outbound'}]}]};
    const next=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(a=>[a.id,REST])),undefined,'utility');
    const dead=next.cultivators.find(a=>a.id===traveler.id)!;
    expect(dead).toMatchObject({alive:false,hp:0,age:traveler.lifespan,locationId:upperNode,spiritStones:remaining});
    expect(next.upperPassage?.journeys[0].deceasedTick).toBe(next.tick);
    expect(next.estates.entries.some(a=>a.deceasedId===dead.id)).toBe(false);
    expect(captureEstate(next,dead)).toBeNull();
    const death=next.events.find(event=>event.id===`evt-upper-passage-${next.tick}-${dead.id}-oldage`);
    expect(death).toMatchObject({witnessScope:'participants',category:'death'});
    expect(death?.locationId).toBeUndefined();
  });
});
