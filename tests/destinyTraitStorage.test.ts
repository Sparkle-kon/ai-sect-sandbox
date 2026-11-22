import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {resolveGuidedDestinyTrait} from '../src/engine/destinyTraitEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {DESTINY_TRAIT_IDS,type DestinyTraitOffer} from '../src/types/destinyTrait';
import type {WorldState} from '../src/types/world';
import {actualDestinyOrdinary,actualDestinyTrial,destinyActor,destinyMonth} from './destinyTraitNativeFixture';

function offer(world:WorldState):DestinyTraitOffer{
  const pending=destinyActor(world).destinyTraits?.pending;
  if(!pending)throw Error('Expected a genuine pending major breakthrough choice');
  return pending;
}
function restored(world:WorldState){
  const raw=encodeWorldSave(world);
  const result=decodeWorldSave(raw);
  expect(encodeWorldSave(result)).toBe(raw);
  return result;
}

describe('version-compatible destiny trait save validation',()=>{
  it('keeps an absent legacy subtree byte-exact and reopens actual trial-passed and ordinary transition offers',()=>{
    const old=createInitialWorld();
    expect(encodeWorldSave(restored(old))).toBe(encodeWorldSave(old));
    expect(encodeWorldSave(old)).not.toContain('"destinyTraits"');
    const {opening,passed}=actualDestinyTrial();
    expect(destinyActor(restored(opening)).destinyTraits).toBeUndefined();
    expect(offer(restored(passed))).toMatchObject({fromRealm:'筑基',realm:'金丹',openedTick:passed.tick});
    const {advanced}=actualDestinyOrdinary();
    const got=offer(restored(advanced));
    expect(got).toMatchObject({fromRealm:'化神',realm:'炼虚',openedTick:advanced.tick});
    expect(new Set(got.options).size).toBe(3);
  });

  it('accepts actual same-turn player and next-turn native picks but rejects unoffered, foreign, or repeated claims',()=>{
    const {advanced}=actualDestinyOrdinary();
    const pending=offer(advanced);
    const claimed=resolveGuidedDestinyTrait(advanced,pending.id,pending.options[1]);
    expect(claimed).not.toBe(advanced);
    expect(destinyActor(restored(claimed)).destinyTraits?.earned?.[0]).toMatchObject({traitId:pending.options[1],chosenTick:advanced.tick});
    const {advanced:automatic}=actualDestinyOrdinary(1,false);
    const evolved=destinyMonth(restored(automatic));
    expect(destinyActor(restored(evolved)).destinyTraits?.earned?.[0].chosenTick).toBe(automatic.tick+1);
    const edit=(mutate:(world:WorldState)=>void)=>{
      const copy=structuredClone(claimed);mutate(copy);
      return ()=>encodeWorldSave(copy);
    };
    const nonChoice=DESTINY_TRAIT_IDS.find(trait=>!pending.options.includes(trait));
    if(!nonChoice)throw Error('Fixture should have at least one unoffered trait');
    expect(edit(world=>{destinyActor(world).destinyTraits!.earned[0].traitId=nonChoice;})).toThrow(/destinyTraits.chosen/);
    expect(edit(world=>{destinyActor(world).destinyTraits!.earned[0].traitId=pending.options[0];})).toThrow(/destinyTraits.awakening/);
    expect(edit(world=>{const progress=destinyActor(world).destinyTraits!;progress.earned.push({...progress.earned[0]});})).toThrow(/destinyTraits.references/);
    expect(edit(world=>{destinyActor(world).destinyTraits!.earned[0].chosenTick=world.tick+1;})).toThrow(/destinyTraits.chosen/);
  });

  it('rejects missing, duplicate, reshuffled, unlisted and structurally invented option evidence',()=>{
    const {advanced}=actualDestinyOrdinary();
    const edit=(patch:(record:DestinyTraitOffer,world:WorldState)=>void)=>{
      const copy=structuredClone(advanced);patch(offer(copy),copy);
      return ()=>encodeWorldSave(copy);
    };
    expect(edit(row=>{row.options.pop();})).toThrow(/destinyTraits.options/);
    expect(edit(row=>{row.options[0]=row.options[1];})).toThrow(/destinyTraits.options/);
    expect(edit(row=>{row.options.reverse();})).toThrow(/destinyTraits.options/);
    expect(edit(row=>{row.fromRealm='元婴';})).toThrow(/destinyTraits.references/);
    expect(edit(row=>{row.actorId='npc-2';})).toThrow(/destinyTraits.references/);
    expect(edit(row=>{row.sourceEventId+='-false';})).toThrow(/destinyTraits.references/);
    expect(edit(row=>{Object.assign(row,{simultaneouslyGrantAll:true});})).toThrow(/destinyTraits.pending.simultaneouslyGrantAll/);
  });

  it('accepts durable structured evidence without old prose but fails closed on a retained conflicting or private breakthrough',()=>{
    const {advanced}=actualDestinyOrdinary();
    const {sourceEventId}=offer(advanced);
    const copy=structuredClone(advanced);
    const raw=copy.events.find(({id})=>id===sourceEventId);
    if(!raw)throw Error('Expected a native retained breakthrough');
    raw.witnessScope='participants';
    expect(()=>encodeWorldSave(copy)).toThrow(/destinyTraits.source/);
    delete raw.witnessScope;
    raw.title='人为推断的进阶记载';
    expect(()=>encodeWorldSave(copy)).toThrow(/destinyTraits.source/);
    copy.events=copy.events.filter(({id})=>id!==sourceEventId);
    copy.chronicleArchive.anchors=copy.chronicleArchive.anchors.filter(({id})=>id!==sourceEventId);
    expect(offer(restored(copy))).toEqual(offer(advanced));
  });
});
