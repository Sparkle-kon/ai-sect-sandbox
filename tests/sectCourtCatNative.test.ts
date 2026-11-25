import {describe,expect,it} from 'vitest';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {comedyRecurringIds} from '../src/engine/sectComedyTerms';
import {projectCourtCat,applyCourtCatCommand} from '../src/engine/sectCourtCat';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {WorldState,LLMDecisionPayload} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'先守这处。'};
const month=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,rest])),
  undefined,'utility',undefined,{captureTrace:false,capturePresentation:false});
const pet=(w:WorldState)=>w.spiritBeasts.find(row=>row.id===comedyRecurringIds(w)?.cat)!;
const stones=(w:WorldState)=>w.sects.find(row=>row.id===w.sectManagement?.sectId)!.spiritStones;

describe('courtyard cat',()=>{
  it('shoos a real living cat, later sees it return and adopts only after three different dated treats',()=>{
    const original=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
    let world=month(original);
    const m=world.sectManagement!,cat=pet(world);
    const before=encodeEraWorldSave(world);
    expect(projectCourtCat(world)).toBeUndefined();
    expect(applyCourtCatCommand(world,{kind:'feed_cat'})).toBe(false);
    expect(encodeEraWorldSave(world)).toBe(before);
    // Controlled placement of the existing recurring creature; returning, debits and adoption are native.
    cat.locationId=m.homeSiteId;
    expect(projectCourtCat(world)?.canShoo).toBe(true);
    expect(applyCourtCatCommand(world,{kind:'shoo_cat'})).toBe(true);
    expect(pet(world).locationId).toBe(cat.homeLocationId);
    expect(projectCourtCat(world)).toBeUndefined();
    world=month(world);
    expect(projectCourtCat(world)).toBeUndefined();
    world=month(world);
    expect(projectCourtCat(world)).toMatchObject({canFeed:true,visits:0});
    expect(world.events.some(event=>event.id===`evt-${world.tick}-${m.sectId}-court-cat-return`)).toBe(true);
    for(let i=1;i<=3;i++){
      const bank=stones(world),tick=world.tick;
      expect(applyCourtCatCommand(world,{kind:'feed_cat'})).toBe(true);
      expect(stones(world)).toBe(bank-2);
      expect(world.tick).toBe(tick);
      expect(applyCourtCatCommand(world,{kind:'feed_cat'})).toBe(false);
      expect(projectCourtCat(world)).toMatchObject({visits:i,adopted:i===3});
      world=decodeEraWorldSave(encodeEraWorldSave(world));
      if(i<3)world=month(world);
    }
    expect(pet(world).tamedBy).toBe(m.leaderId);
    expect(projectCourtCat(world)).toMatchObject({adopted:true,canFeed:false,canShoo:false});
  });
});
