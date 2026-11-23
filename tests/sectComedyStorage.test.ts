import { describe, expect, it } from 'vitest';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { sectJobOutcomeOdds } from '../src/engine/sectJobReportRules';
import { buildConfirmedShareSave, prepareShareSavePrivacy } from '../src/engine/shareSavePrivacy';
import { decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'暂且坐下。'};
const start=()=>createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
const snapshot=(world:WorldState)=>{
  const bytes=encodeEraWorldSave(world);
  const copy=decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(copy)).toBe(bytes);
  return copy;
};
function month(world:WorldState,job=false,roll=.01){
  const orders=Object.fromEntries(world.cultivators.map(actor=>[actor.id,rest]));
  return advanceWorldTick(world,orders,()=>roll,'utility',undefined,{
    capturePresentation:false,captureTrace:false,
    ...(job?{sectJobAssignments:[{discipleId:world.sectManagement!.foundingDiscipleIds[0],jobId:'guard' as const}]}:{}),
  });
}

describe('portable managed comedy notebook',()=>{
  it('roundtrips actual comic months in a bounded window, without backfilling an earlier H1 file',()=>{
    const origin=snapshot(start());
    expect(origin.sectManagement?.comedy).toBeUndefined();
    let world=origin;
    for(let turn=0;turn<14;turn++)world=month(world);
    const actual=world.sectManagement?.comedy?.moments;
    expect(actual).toHaveLength(12);
    expect(actual?.map(row=>row.tick)).toEqual(Array.from({length:12},(_,i)=>world.tick-11+i));
    expect(snapshot(world).sectManagement?.comedy?.moments).toEqual(actual);

    const preview=prepareShareSavePrivacy(world);
    expect(preview.status).toBe('ready');
    const copy=buildConfirmedShareSave(world,preview);
    expect(copy&&decodeWorldSave(copy.json).sectManagement?.comedy?.moments).toEqual(actual);
  });

  it('requires a genuine source/action/site when report and receipt still exist; puts no raw prose in the save DTO',()=>{
    const input=start();
    const guard=input.cultivators.find(row=>row.id===input.sectManagement!.foundingDiscipleIds[0])!;
    // Controlled personality setup only; settlement, effect and the scoped receipt are all native.
    guard.quirks=['contrarian'];
    const odds=sectJobOutcomeOdds(input,guard,'guard');
    const roll=(odds.success+odds.windfall*.5)/Object.values(odds).reduce((sum,n)=>sum+n,0);
    const world=month(input,true,roll);
    const comedy=world.sectManagement!.comedy;
    if(!comedy?.moments.length)throw Error('Expected actual comic beat after a managed month');
    const moment=comedy.moments.at(-1)!;
    expect(moment.source).toMatchObject({phase:'performed',jobId:'guard'});
    expect(snapshot(world).sectManagement?.comedy).toEqual(comedy);
    for(const corruption of [
      (w:WorldState)=>{w.sectManagement!.comedy={moments:[moment,moment]};},
      (w:WorldState)=>{w.sectManagement!.comedy={moments:[{...moment,templateId:'absent-template'}]};},
      (w:WorldState)=>{w.sectManagement!.comedy={moments:[{...moment,siteId:'missing-site'}]};},
      (w:WorldState)=>{w.sectManagement!.comedy={moments:[Object.assign({},moment,{quote:'不写进存档。'})]};},
      (w:WorldState)=>{w.sectManagement!.comedy={moments:[{...moment,source:{phase:'performed',jobId:'cultivate',tier:'success'}}]};},
      (w:WorldState)=>{w.sectManagement!.comedy={moments:[{...moment,effects:[{kind:'kitchen_damage',amount:-1}]}]};},
      (w:WorldState)=>{
        const event=w.events.find(row=>row.id===`evt-${w.tick}-${w.sectManagement!.sectId}-comic`)!;
        event.actorIds=['npc-1'];
      },
    ]){
      const forged=structuredClone(world);
      corruption(forged);
      expect(()=>encodeEraWorldSave(forged)).toThrow(/sectManagement.comedy/u);
    }
  });
});
