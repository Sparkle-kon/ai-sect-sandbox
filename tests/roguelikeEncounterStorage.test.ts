import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {resolveGuidedRoguelikeChoice} from '../src/engine/roguelikeEncounterEngine';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {actor,month,openNativeGuidedEncounter} from './roguelikeEncounterNativeFixture';

function row(world:WorldState) {
  const saved=world.roguelikeEncounters?.[0];
  if(!saved)throw Error('Expected real native encounter');
  return saved;
}

describe('roguelike encounter native save proofs',()=>{
  it('preserves the legacy exact bytes with the feature absent and round-trips actual open, closed and expired frames',()=>{
    const old=encodeWorldSave(createInitialWorld());
    expect(old).not.toContain('"roguelikeEncounters":');
    expect(encodeWorldSave(decodeWorldSave(old))).toBe(old);

    const {world,encounter}=openNativeGuidedEncounter();
    const original=encodeWorldSave(world);
    const open=decodeWorldSave(original);
    expect(row(open)).toEqual(encounter);
    expect(encodeWorldSave(open)).toBe(original);
    for(const exact of [resolveGuidedRoguelikeChoice(open,encounter.id,'bold'),month(open)]){
      const raw=encodeEraWorldSave(exact),restored=decodeEraWorldSave(raw);
      expect(row(restored).status).not.toBe('offered');
      expect(encodeEraWorldSave(restored)).toBe(raw);
      expect(encodeEraWorldSave(month(restored))).toBe(encodeEraWorldSave(month(exact)));
    }
  });

  it('rejects fabricated proof IDs/sites/identity and offered rows carrying premature effect data',()=>{
    const {world}=openNativeGuidedEncounter();
    const alter=(f:(saved:ReturnType<typeof row>,fresh:WorldState)=>void)=>{
      const fresh=structuredClone(world);
      f(row(fresh),fresh);
      return ()=>encodeWorldSave(fresh);
    };
    expect(alter(r=>{r.id+='-echo';})).toThrow(/roguelikeEncounters.references/);
    expect(alter(r=>{r.siteId=r.fromSiteId;})).toThrow(/roguelikeEncounters.references/);
    expect(alter(r=>{r.siteId='not-a-native-site';})).toThrow(/roguelikeEncounters.references/);
    expect(alter(r=>{r.witnessId=r.actorId;})).toThrow(/roguelikeEncounters.references/);
    expect(alter((r,w)=>{w.roguelikeEncounters!.push({...r});})).toThrow(/roguelikeEncounters.open/);
    expect(alter(r=>{r.choice='bold';})).toThrow(/roguelikeEncounters.open/);
    expect(alter((r,w)=>{actor(w).locationId=r.fromSiteId;})).toThrow(/roguelikeEncounters.open/);
    expect(alter((_r,w)=>{w.roguelikeEncounters=[];})).toThrow(/roguelikeEncounters.empty/);
    expect(alter(r=>{Object.assign(r,{actorOverride:'npc-2'});})).toThrow(/roguelikeEncounters\[0\].actorOverride/);
  });

  it('rejects a replayed phase, a bonus not in the chosen outcome, and arbitrary effect keys',()=>{
    const {world,encounter}=openNativeGuidedEncounter();
    const result=resolveGuidedRoguelikeChoice(world,encounter.id,'leave');
    expect(result).not.toBe(world);
    expect(row(result).status).toBe('resolved');
    const altered=structuredClone(result);
    row(altered).resolvedTick=world.tick+1;
    expect(()=>encodeWorldSave(altered)).toThrow(/roguelikeEncounters.phase/);

    const fortune=structuredClone(result);
    const proof=row(fortune).outcome!;
    proof.lifespanDelta=30;
    expect(()=>encodeWorldSave(fortune)).toThrow(/roguelikeEncounters.outcome/);
    proof.lifespanDelta=0;
    proof.success=true;
    expect(()=>encodeWorldSave(fortune)).toThrow(/roguelikeEncounters.outcome/);
    proof.success=false;
    Object.assign(proof,{stones:1000});
    expect(()=>encodeWorldSave(fortune)).toThrow(/roguelikeEncounters\[0\].outcome.stones/);
  });

  it('never accepts public or alternate actor mirrors of real private offer/settlement events',()=>{
    const {world,encounter}=openNativeGuidedEncounter();
    const open=structuredClone(world);
    const event=open.events.find(news=>news.id===`evt-${encounter.id}-open`);
    if(!event)throw Error('Expected actual private native open event');
    const {witnessScope,...copied}=event;
    expect(witnessScope).toBe('participants');
    delete event.witnessScope;
    expect(()=>encodeWorldSave(open)).toThrow(/roguelikeEncounters.event/);
    event.witnessScope='participants';
    event.actorIds=[actor(world,'npc-2').id];
    expect(()=>encodeWorldSave(open)).toThrow(/roguelikeEncounters.event/);

    const mirrored=structuredClone(world);
    mirrored.chronicleArchive.anchors.push(copied);
    expect(()=>encodeWorldSave(mirrored)).toThrow(/roguelikeEncounters.publicArchive/);
    delete mirrored.roguelikeEncounters;
    mirrored.events=mirrored.events.filter(news=>news.id!==event.id);
    expect(()=>encodeWorldSave(mirrored)).toThrow(/roguelikeEncounters.publicArchive/);
  });
});
