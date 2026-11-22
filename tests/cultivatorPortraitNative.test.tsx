import { renderToStaticMarkup } from 'react-dom/server';
import { describe,expect,it } from 'vitest';
import { CultivatorPortrait } from '../src/components/CultivatorPortrait';
import { projectCultivatorPortrait,projectMapCultivatorHalos,projectMapCultivatorPortraits } from '../src/components/cultivatorPortraitModel';
import { projectMapEntityPopover } from '../src/components/mapEntityPopoverModel';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { fictionalGenderFor } from '../src/engine/fictionalPersonMetadata';
import { decodeEraWorldSave,encodeEraWorldSave } from '../src/engine/storageEngine';
import { sameGeneratedWorld } from '../src/engine/worldIdentity';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { Cultivator,MortalVolunteer,SettlementRecord,WorldState } from '../src/types/world';
import { actualDestinyTrial,destinyActor,destinyMonth } from './destinyTraitNativeFixture';

const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
function strict(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}
const naturallyContinue=(world:WorldState)=>
  advanceWorldTick(world,undefined,undefined,'utility',undefined,{captureTrace:false,capturePresentation:false});
const portrait=(world:WorldState,person:Cultivator=destinyActor(world))=>{
  const value=projectCultivatorPortrait(world,person);
  expect(value).toBeDefined();
  return value!;
};

describe('native portrait identities',()=>{
  it('keeps one face and updates only the display layer after a genuine native golden trial and year',()=>{
    const {initial,passed}=actualDestinyTrial();
    const before=portrait(initial),golden=portrait(passed);
    expect(before.halo).toBeUndefined();
    expect(golden.halo?.kind).toBe('gold-wheel');
    expect(golden.face).toEqual(before.face);
    expect(destinyActor(passed).age).toBe(destinyActor(initial).age);
    let aged=passed;
    while(aged.year===passed.year)aged=destinyMonth(aged);
    expect(destinyActor(aged).age).toBe(destinyActor(passed).age+1);
    expect(portrait(aged).face).toEqual(before.face);
    expect(sameGeneratedWorld(passed,aged)).toBe(true);
    expect(portrait(strict(aged))).toEqual(portrait(aged));
    expect(portrait(structuredClone(aged))).toEqual(portrait(aged));
    const ownView=createTerrainMapView(aged,destinyActor(aged),true);
    expect(projectMapCultivatorHalos(aged,ownView).get(destinyActor(aged).id)).toEqual(golden.halo);
    const outside=createTerrainMapView(aged,actor(aged,'npc-3'),true);
    expect(projectMapCultivatorHalos(aged,outside).has(destinyActor(aged).id)).toBe(false);
    const markup=renderToStaticMarkup(<CultivatorPortrait portrait={portrait(aged)}/>);
    expect(markup).toContain('data-portrait-halo="gold-wheel"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain(destinyActor(aged).id);
    expect(markup).not.toContain(destinyActor(aged).innerMonologue);
  });

  it('transitions the age styling on the actual annual birthday without changing the core face',()=>{
    const initial=createInitialWorld(1);
    // This single starting age is controlled to one month-boundary before the
    // display threshold; the yearly birthday itself is the native transition.
    const original=destinyActor(initial);
    original.age=Math.ceil(original.lifespan*.25)-1;
    const youthful=portrait(initial);
    expect(youthful.ageBand).toBe('youth');
    let aged=initial;
    while(aged.year===initial.year)aged=destinyMonth(aged);
    const seasoned=portrait(aged);
    expect(destinyActor(aged).age).toBe(original.age+1);
    expect(seasoned).toEqual({...youthful,ageBand:'seasoned'});
    const dark=actor(aged,'npc-3');
    expect(portrait(aged,dark).halo?.kind).toBe('blood-moon');
    expect(portrait(aged).halo?.kind).toBe('dharma');
  });

  it('keeps neutral styling for someone from a genuinely optional-free older payload',()=>{
    const modern=createInitialWorld(0);
    expect(modern.cultivators.every(person=>person.gender==='woman'||person.gender==='man')).toBe(true);
    const legacy=structuredClone(modern);
    // Model the stored old revision, which had no optional founder or volunteer gender fields.
    for(const person of legacy.cultivators)delete person.gender;
    for(const village of legacy.settlements.villages)for(const volunteer of village.volunteers)delete volunteer.gender;
    const restored=strict(legacy);
    expect(sameGeneratedWorld(modern,restored)).toBe(true);
    expect(restored.random).toEqual(modern.random);
    expect(restored.cultivators.every(person=>person.gender===undefined)).toBe(true);
    expect(portrait(restored).attire).toBe('neutral');
    expect(portrait(restored).face).toEqual(portrait(modern).face);
  });

  it('preserves distinct portraits for two natively recruited 杜清禾 as the actual visible population grows',()=>{
    let world=createInitialWorld(0);
    const originalCount=world.cultivators.length;
    const volunteers=new Map<string,MortalVolunteer>();
    const recruitReceipts=new Map<string,SettlementRecord>();
    while(world.tick<44){
      for(const village of world.settlements.villages)for(const volunteer of village.volunteers)
        volunteers.set(volunteer.id,structuredClone(volunteer));
      world=naturallyContinue(world);
      for(const row of world.settlements.records)
        if(row.kind==='recruitment'&&row.tick===world.tick&&row.cultivatorId)recruitReceipts.set(row.cultivatorId,row);
    }
    const pair=['recruit-village-loc-market-east-vol-3','recruit-village-loc-market-vol-8'] as const;
    expect(world.cultivators.length).toBeGreaterThan(originalCount);
    for(const id of pair){
      const person=actor(world,id),receipt=recruitReceipts.get(id);
      expect(person).toMatchObject({id,name:'杜清禾',alive:true,locationId:'loc-market'});
      expect(receipt).toMatchObject({kind:'recruitment',people:1,cultivatorId:id});
      const volunteer=volunteers.get(receipt!.volunteerId!);
      expect(volunteer).toMatchObject({name:person.name,gender:fictionalGenderFor(world.random.seed,receipt!.volunteerId!)});
      expect(person.gender).toEqual(volunteer?.gender);
    }
    const [first,second]=pair.map(id=>actor(world,id));
    const firstFace=portrait(world,first),secondFace=portrait(world,second);
    expect(firstFace.face).not.toEqual(secondFace.face);
    const localView=createTerrainMapView(world,first,true);
    const marks=projectMapCultivatorPortraits(world,localView);
    expect(marks.get(first.id)).toEqual(firstFace);
    expect(marks.get(second.id)).toEqual(secondFace);
    const remote=world.cultivators.find(person=>person.alive&&person.positionPlane===undefined&&
      !createTerrainMapView(world,person,true).isCurrentLocation(first.locationId));
    expect(remote).toBeDefined();
    const hiddenView=createTerrainMapView(world,remote,true);
    expect(projectMapCultivatorPortraits(world,hiddenView).has(first.id)).toBe(false);
    expect(projectMapCultivatorPortraits(world,hiddenView).has(second.id)).toBe(false);
    for(const person of [first,second]){
      const target={kind:'actor',id:person.id} as const;
      expect(projectMapEntityPopover(world,localView,target,first.id)).toMatchObject({
        kind:'actor',name:'杜清禾',target,portrait:marks.get(person.id),
      });
      expect(projectMapEntityPopover(world,hiddenView,target,remote?.id)).toBeUndefined();
    }
    const before=encodeEraWorldSave(world),reloaded=strict(world);
    expect(portrait(reloaded,actor(reloaded,first.id))).toEqual(firstFace);
    expect(portrait(reloaded,actor(reloaded,second.id))).toEqual(secondFace);
    expect(encodeEraWorldSave(world)).toBe(before);
  });
});
