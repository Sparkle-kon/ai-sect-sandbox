import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { createTimeline, recordTimelineWorld } from '../src/engine/timelineEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { sameGeneratedWorld } from '../src/engine/worldIdentity';
import { STARTER_SECT_IDS, starterSectIdentity, type StarterDraw, type StarterSectId } from '../src/types/sectManagement';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const seed=13071;
function start(starterId:StarterSectId=STARTER_SECT_IDS[0],draw:StarterDraw=0):WorldState{
  const result=createManagedSectWorld(seed,'classic',starterId,draw);
  if(!result)throw Error('Expected valid starter world');
  return result;
}
function reseal(world:WorldState):WorldState {
  const bytes=encodeEraWorldSave(world),restored=decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(restored)).toBe(bytes);
  return restored;
}

describe('native managed sect branch storage',()=>{
  it('roundtrips both native starter draws and never adds management or quirks to classic saves',()=>{
    const legacy=reseal(createInitialWorld(seed,'classic'));
    expect(legacy.sectManagement).toBeUndefined();
    expect(legacy.cultivators.every(row=>row.quirks===undefined)).toBe(true);
    for(const starter of STARTER_SECT_IDS){
      for(const draw of [0,1] as const){
        const world=reseal(start(starter,draw)),state=world.sectManagement!;
        const identity=starterSectIdentity(seed,starter,draw);
        expect(state.foundingDiscipleIds).toEqual(identity.foundingDiscipleIds);
        expect(world.sects.find(row=>row.id===state.sectId)).toMatchObject({leaderId:state.leaderId,headquartersId:state.homeSiteId});
        expect(world.locations.find(row=>row.id===state.homeSiteId)?.ownerSectId).toBe(state.sectId);
        expect(world.cultivators.find(row=>row.id===identity.creditorId)?.locationId).toBe('loc-market');
        if(starter==='qingyun-odd-jobs')expect(state.debt).toEqual({creditorId:identity.creditorId,principal:80,dueTick:7});
        else expect(state.debt).toBeUndefined();
      }
    }
  });

  it('rejects altered draw, identities, copied disciples, fabricated creditor, or empty/duplicate quirks',()=>{
    const world=start(),original=encodeEraWorldSave(world);
    for(const corrupt of [
      (w:WorldState)=>{delete w.sectManagement;},
      (w:WorldState)=>{Object.assign(w.sectManagement!,{draw:2});},
      (w:WorldState)=>{Object.assign(w.sectManagement!,{draw:1});},
      (w:WorldState)=>{Object.assign(w.sectManagement!,{leaderId:'npc-1'});},
      (w:WorldState)=>{Object.assign(w.sectManagement!.debt!,{creditorId:'npc-5'});},
      (w:WorldState)=>{w.sectManagement!.foundingDiscipleIds[1]=w.sectManagement!.foundingDiscipleIds[0];},
      (w:WorldState)=>{w.cultivators.find(row=>row.id===w.sectManagement!.foundingDiscipleIds[0])!.quirks=[];},
      (w:WorldState)=>{w.cultivators.find(row=>row.id===w.sectManagement!.foundingDiscipleIds[0])!.quirks=['lost','lost'];},
    ]){
      const forged=structuredClone(world);
      corrupt(forged);
      expect(()=>encodeEraWorldSave(forged)).toThrow(/sectManagement|cultivators.quirks/u);
    }
    expect(encodeEraWorldSave(world)).toBe(original);
  });

  it('keeps natural progress in the same lineage and refuses crossover from sibling draw, starter, or classic',()=>{
    const world=start();
    const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'山门照旧。'};
    const advanced=reseal(advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,rest])),()=>.99));
    expect(advanced.tick).toBe(world.tick+1);
    expect(sameGeneratedWorld(world,advanced)).toBe(true);
    expect(sameGeneratedWorld(world,start(STARTER_SECT_IDS[0],1))).toBe(false);
    expect(sameGeneratedWorld(world,start(STARTER_SECT_IDS[1],0))).toBe(false);
    expect(sameGeneratedWorld(world,createInitialWorld(seed))).toBe(false);
    const timeline=createTimeline(world);
    expect(recordTimelineWorld(timeline,advanced)).not.toBe(timeline);
    expect(recordTimelineWorld(timeline,start(STARTER_SECT_IDS[0],1))).toBe(timeline);
  });
});
