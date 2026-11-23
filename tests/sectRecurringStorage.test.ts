import { describe, expect, it } from 'vitest';
import { buildConfirmedShareSave, prepareShareSavePrivacy } from '../src/engine/shareSavePrivacy';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { SECT_RECURRING_LIMIT, sectRecurringEventId } from '../src/types/sectRecurring';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const start=()=>createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'先缓一口气。'};
const month=(world:WorldState,extra:Readonly<Record<string,LLMDecisionPayload>>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.map(actor=>[actor.id,extra[actor.id]??rest])),
  ()=>.99,'utility',undefined,{capturePresentation:false,captureTrace:false});
function reseal(world:WorldState) {
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}

describe('native recurring visitors safe save',()=>{
  it('preserves H2-1 absence until a real next month; roundtrips capped visitors and shared redacted receipts',()=>{
    const initial=reseal(start());
    expect(initial.sectManagement?.recurring).toBeUndefined();
    let world=initial;
    for(let i=0;i<20;i++)world=month(world);
    const ledger=world.sectManagement!.recurring!;
    expect(ledger.encounters).toHaveLength(SECT_RECURRING_LIMIT);
    expect(ledger.encounters.some(row=>row.recalled)).toBe(true);
    expect(reseal(world).sectManagement?.recurring).toEqual(ledger);
    const review=prepareShareSavePrivacy(world);
    expect(review.status).toBe('ready');
    const sealed=buildConfirmedShareSave(world,review);
    expect(sealed&&decodeWorldSave(sealed.json).sectManagement?.recurring).toEqual(ledger);
  });

  it('rejects cut origins, substituted real people and wrong memory/source/scope on native signed notes',()=>{
    const world=month(month(start()));
    const management=world.sectManagement!,ledger=management.recurring!;
    const index=ledger.encounters.findIndex(row=>row.role==='wang'&&row.tick===world.tick);
    const actual=ledger.encounters[index];
    if(!actual?.memory)throw Error('Expected Wang memory actually recorded today');
    const markerId=sectRecurringEventId(world.tick,management.sectId,'wang');
    for(const mutate of [
      (w:WorldState)=>{delete w.sectManagement!.recurring;},
      (w:WorldState)=>{w.sectManagement!.recurring={...ledger,catHomeSiteId:'loc-market-east'};},
      (w:WorldState)=>{w.sectManagement!.recurring={...ledger,encounters:ledger.encounters.map((row,i)=>i===index?{...row,entityId:'npc-1'}:row)};},
      (w:WorldState)=>{w.cultivators.find(actor=>actor.id===actual.memory!.actorId)!.memories
        .find(note=>note.id===actual.memory!.id)!.content='是同一人写的，却不是这一件事。';},
      (w:WorldState)=>{w.events.find(event=>event.id===markerId)!.actorIds=['npc-1',management.leaderId];},
      (w:WorldState)=>{delete w.events.find(event=>event.id===markerId)!.witnessScope;},
      (w:WorldState)=>{w.sectManagement!.recurring={...ledger,encounters:ledger.encounters.map((row,i)=>i===index?
        {...row,pill:{holderId:management.leaderId,id:'golden',count:1}}:row)};},
    ]){
      const forged=structuredClone(world);
      mutate(forged);
      expect(()=>encodeEraWorldSave(forged)).toThrow(/sectManagement.recurring/u);
    }
  });

  it('binds an actual eaten pill to its holder and kind while a native inventory flow is retained',()=>{
    const opened=month(start()),state=opened.sectManagement!,recurring=state.recurring!;
    const id=state.foundingDiscipleIds[0],holder=opened.cultivators.find(actor=>actor.id===id)!;
    holder.pills.foundation=3;
    const site=opened.locations.find(row=>row.id===recurring.catHomeSiteId)!;
    const visited=terrainTileAt(opened,site.x,site.y)!;
    holder.exploredTileIds=[...new Set([...holder.exploredTileIds,visited.id])];
    const moved=month(opened,{[id]:{chosenAction:'EXPLORE',targetLocationId:site.id,innerMonologue:'到后山一趟。'}});
    const result=month(moved),settled=result.sectManagement!.recurring!;
    const pill=settled.encounters.find(row=>row.role==='cat'&&row.pill);
    if(!pill?.pill)throw Error('Expected the genuine one-pill transfer receipt');
    expect(pill.pill).toEqual({holderId:id,id:'foundation',count:1});
    expect(reseal(result).sectManagement?.recurring).toEqual(settled);
    const fake=structuredClone(result);
    fake.sectManagement!.recurring={...settled,encounters:settled.encounters.map(row=>row===pill?
      {...row,pill:{...pill.pill!,id:'golden'}}:row)};
    expect(()=>encodeEraWorldSave(fake)).toThrow(/sectManagement.recurring.pillReceipt/u);
  });
});
