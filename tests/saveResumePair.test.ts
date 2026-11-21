import {describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {createMemorySaveBackend,createSaveStore,encodeWorldSave,type SaveBackend} from '../src/engine/storageEngine';
import {executeGodIntervention} from '../src/engine/worldEngine';

const current=(slotId:string)=>({slotId,point:'current' as const});
const previous=(slotId:string)=>({slotId,point:'previous' as const});
const lineage=(branchId:string,timelineId='known-same-original')=>({branchId,label:'同一个显示名',timelineId});

describe('explicit exact pair resume without changing any saved row',()=>{
  it('distinguishes equally named and aligned realized checkpoints by real timeline and branch, not ordering',async()=>{
    const backend=createMemorySaveBackend(),writer=createSaveStore(backend,()=>42),reader=createSaveStore(backend,()=>42);
    const a=createInitialWorld(1124);
    const b=executeGodIntervention(a,{type:'WHISPER_MIND',targetCultivatorId:a.cultivators[0].id,whisperText:'真实侧支'});
    await writer.save('left','同一楼',a,null,lineage('main'));
    await writer.save('right','同一楼',b,null,lineage('branch-1'));
    const before=await backend.readPair!('left','right');
    const review=await reader.reviewResumePair(current('left'),current('right'));
    expect(review.relation).toBe('same_timeline_other_branch');
    expect(review.left).toMatchObject({status:'available',info:{summary:{label:'同一楼',tick:a.tick,year:a.year,month:a.month},
      selection:{sourceBranch:lineage('main')}},ancestry:{seed:a.random.seed,profileId:a.worldgen?.profileId,birthTick:a.worldgen?.birthTick}});
    expect(review.right).toMatchObject({status:'available',info:{summary:{label:'同一楼',tick:a.tick},
      selection:{sourceBranch:lineage('branch-1')}}});
    expect(Reflect.set(review.right.address,'slotId','left')).toBe(false);
    if(review.right.status==='available'){
      expect(Reflect.set(review.right.info.selection,'slotId','left')).toBe(false);
      expect(Reflect.set(review.right.info.selection.sourceBranch!,'branchId','main')).toBe(false);
    }
    const stolen=structuredClone(review);
    Reflect.set(stolen.right.address,'slotId','left');
    await expect(reader.loadReviewedResume(stolen,'right')).rejects.toMatchObject({code:'slot_conflict'});
    const chosen=await reader.loadReviewedResume(review,'right');
    expect(chosen.selection.sourceBranch).toEqual(lineage('branch-1'));
    expect(encodeWorldSave(chosen.world)).toBe(encodeWorldSave(b));
    expect(await backend.readPair!('left','right')).toEqual(before);
    await expect(reader.loadReviewedResume(review,'left')).rejects.toMatchObject({code:'slot_conflict'});
    await expect(reader.loadReviewedResume({...review},'right')).rejects.toMatchObject({code:'slot_conflict'});
    await expect(writer.loadReviewedResume(review,'right')).rejects.toMatchObject({code:'slot_conflict'});
  });

  it('never elects a similarly named/newer independent world or claims a lineage for an unrecorded branch',async()=>{
    const backend=createMemorySaveBackend();
    let time=30;
    const store=createSaveStore(backend,()=>time);
    const a=createInitialWorld(128),b=createInitialWorld(129);
    await store.save('a','same',a,null,lineage('main','actual-a'));
    time++;
    await store.save('b','same',b,null,lineage('main','actual-b'));
    let review=await store.reviewResumePair(current('a'),current('b'));
    expect(review.relation).toBe('different_origins');
    expect((await store.loadReviewedResume(review,'left')).world.random.seed).toBe(a.random.seed);

    let observed=await store.inspect('b');
    await store.save('b','same',a,observed.headRevision,lineage('main','separate-imported-timeline'));
    review=await store.reviewResumePair(current('a'),current('b'));
    expect(review.relation).toBe('separate_timelines');
    observed=await store.inspect('b');
    await store.save('b','same',a,observed.headRevision);
    expect((await store.reviewResumePair(current('a'),current('b'))).relation).toBe('same_generation_unverified_lineage');
  });

  it('allows current vs previous of one slot but returns the selected recovery point read-only',async()=>{
    const backend=createMemorySaveBackend(),store=createSaveStore(backend,()=>46);
    const a=createInitialWorld(1128);
    const b=executeGodIntervention(a,{type:'WHISPER_MIND',targetCultivatorId:a.cultivators[0].id,whisperText:'新暂停点'});
    await store.save('same','same',a,null,lineage('main'));
    const observed=await store.inspect('same');
    await store.save('same','same',b,observed.headRevision,lineage('main'));
    const before=await backend.read('same');
    const review=await store.reviewResumePair(current('same'),previous('same'));
    expect(review.relation).toBe('same_branch');
    const chosen=await store.loadReviewedResume(review,'right');
    expect(chosen.selection.point).toBe('previous');
    expect(encodeWorldSave(chosen.world)).toBe(encodeWorldSave(a));
    expect(await backend.read('same')).toEqual(before);
    await expect(store.reviewResumePair(current('same'),current('same'))).rejects.toMatchObject({code:'invalid_slot'});
  });

  it('blocks peer drift despite unchanged chosen bytes, including a genuine empty side which later fills',async()=>{
    const backend=createMemorySaveBackend(),first=createSaveStore(backend,()=>8),second=createSaveStore(backend,()=>8);
    const a=createInitialWorld(551);
    await first.save('a','aligned',a,null,lineage('main'));
    const empty=await second.reviewResumePair(current('a'),current('b'));
    expect(empty.right).toEqual({status:'absent',address:current('b')});
    await expect(second.loadReviewedResume(empty,'right')).rejects.toMatchObject({code:'not_found'});
    await first.save('b','aligned',a,null,lineage('other'));
    const before=await backend.readPair!('a','b');
    await expect(second.loadReviewedResume(empty,'left')).rejects.toMatchObject({code:'slot_conflict'});
    expect(await backend.readPair!('a','b')).toEqual(before);

    const sameTime=await second.reviewResumePair(current('a'),current('b'));
    const observed=await first.inspect('b');
    await first.save('b','aligned',a,observed.headRevision,lineage('other'));
    await expect(second.loadReviewedResume(sameTime,'left')).rejects.toMatchObject({code:'slot_conflict'});
    const renewed=await second.reviewResumePair(current('a'),current('b'));
    const chosen=(await second.loadReviewedResume(renewed,'left')).world;
    expect(encodeWorldSave(chosen)).toBe(encodeWorldSave(a));
  });

  it('labels actual damage and unsupported version without guessing a recovery, and has no unsafe sequential fallback',async()=>{
    const base=createMemorySaveBackend(),writer=createSaveStore(base);
    const a=createInitialWorld(22);
    await writer.save('a','live',a,null);
    await writer.save('b','decayed',a,null);
    let replacement:unknown=null;
    let pairedReads=0,sequentialReads=0,writes=0;
    const observed:SaveBackend={...base,read:async key=>{sequentialReads++;return base.read(key);},
      readPair:async(left,right)=>{
        pairedReads++;
        const both=await base.readPair!(left,right);
        return [both[0],{...both[1],current:replacement}];
      },
      commit:async()=>{writes++;throw Error('preview must not write');}};
    const observedStore=createSaveStore(observed);
    let review=await observedStore.reviewResumePair(current('a'),current('b'));
    expect(review.right.status).toBe('damaged');
    await expect(observedStore.loadReviewedResume(review,'right')).rejects.toMatchObject({code:'integrity'});
    expect((await observedStore.loadReviewedResume(review,'left')).world.random.seed).toBe(a.random.seed);
    const original=await base.read('b');
    const leg=original.current as {summary:unknown;content:string};
    const payload=JSON.parse(leg.content) as {version:number};
    payload.version=9999;
    const mutable={...leg,content:JSON.stringify(payload)};
    replacement=mutable;
    review=await observedStore.reviewResumePair(current('a'),current('b'));
    expect(review.right.status).toBe('unsupported');
    await expect(observedStore.loadReviewedResume(review,'right')).rejects.toMatchObject({code:'version'});
    payload.version=9998;
    mutable.content=JSON.stringify(payload);
    await expect(observedStore.loadReviewedResume(review,'left')).rejects.toMatchObject({code:'slot_conflict'});
    expect(sequentialReads).toBe(0);expect(writes).toBe(0);expect(pairedReads).toBe(4);

    const noAtomic=createSaveStore({...observed,readPair:undefined});
    const unavailable=await noAtomic.reviewResumePair(current('a'),previous('b'));
    expect(unavailable.left.status).toBe('unsupported');
    expect(unavailable.right.status).toBe('unsupported');
    expect(unavailable.relation).toBe('unavailable');
    expect(sequentialReads).toBe(0);
  });

  it('classifies impossible cryptographic verification as unsupported, never as corruption or physical absence',async()=>{
    const backend=createMemorySaveBackend(),store=createSaveStore(backend),world=createInitialWorld(992);
    await store.save('present','真实副本',world,null);
    vi.stubGlobal('crypto',undefined);
    try{
      const result=await store.reviewResumePair(current('present'),current('missing'));
      expect(result.left).toEqual({address:current('present'),status:'unsupported'});
      expect(result.right).toEqual({address:current('missing'),status:'absent'});
      expect(result.relation).toBe('unavailable');
    }finally{vi.unstubAllGlobals();}
  });

});
