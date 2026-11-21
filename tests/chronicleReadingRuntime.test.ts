import {afterEach, describe, expect, it, vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {CHRONICLE_READING_MARK_KEY, hasChronicleReadingPlace, markChronicleReadingPlace, resumeChronicleReadingPlace,
  type ChronicleReadingScope, type ChronicleReadingStorage} from '../src/engine/chronicleReadingMark';
import {createTimeline, forkTimeline, readTimelineHead} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload, WorldState} from '../src/types/world';

afterEach(()=>vi.restoreAllMocks());
const writes=(world:WorldState):Record<string,LLMDecisionPayload>=>Object.fromEntries(world.cultivators.map(row=>
  [row.id,{chosenAction:'REST',innerMonologue:'只行本分。'}]));
const originalPlace={sections:['record','dialogue'],listScrollTop:281,pageScrollY:153} as const;
function nativeReadingFixture(){
  const birth=createInitialWorld(616), [actor,watcher,sameName]=birth.cultivators;
  for(const row of [actor,watcher,sameName]){
    row.locationId='loc-market';row.hp=row.maxHp;row.age=29;row.lifespan=130;
    row.spiritRoot='木';row.combatPower=20;row.artifacts=[];
  }
  watcher.name='陆照海';
  sameName.name=watcher.name;
  const doDuel=(world:WorldState,target=watcher.id)=>
    advanceWorldTick(world,{...writes(world),[actor.id]:{chosenAction:'DUEL',targetCultivatorId:target,
      spokenLine:'原实录里的一句，不该写进本机标记。',innerMonologue:'按真实对象行动。'}},()=>.05);
  const world=doDuel(birth);
  const event=world.events.find(row=>row.tick===world.tick&&row.actorIds[0]===actor.id&&row.category==='combat')!;
  expect(event.dialogue?.turns[0].text).toContain('不该写进本机标记');
  return {birth,world,event,watcherId:watcher.id,otherId:sameName.id,doDuel};
}
function memory(){
  const values=new Map<string,string>(), storage:ChronicleReadingStorage={
    getItem:vi.fn((key:string)=>values.get(key)??null),
    setItem:vi.fn((key:string,value:string)=>{values.set(key,value);}),
  };
  return {values,storage};
}
function pauseDigest(){
  const real=globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  let continueDigest:()=>void=()=>{throw Error('digest started unexpectedly late');};
  const pause=new Promise<void>(resolve=>{continueDigest=resolve;});
  vi.spyOn(globalThis.crypto.subtle,'digest').mockImplementationOnce(async (algorithm,data)=>{
    await pause;return real(algorithm,data);
  });
  return continueDigest;
}

describe('explicit public scene marks on actual native branch snapshots',()=>{
  it('roundtrips only the exact scene identifier/scroll/sections and never a raw narrative or another viewer',async()=>{
    const f=nativeReadingFixture(),{world,event,watcherId,otherId}=f, {storage,values}=memory();
    const scope:ChronicleReadingScope={timelineId:'this-running-timeline',branchId:'main',viewerId:watcherId,previewTick:null};
    const original=JSON.stringify(world);
    expect(hasChronicleReadingPlace(scope,{storage})).toBe(false);
    await expect(markChronicleReadingPlace(scope,world,event.id,originalPlace,{storage})).resolves.toBe(true);
    const payload=values.get(CHRONICLE_READING_MARK_KEY)!;
    expect(payload).not.toContain(event.title);
    expect(payload).not.toContain(event.description);
    expect(payload).not.toContain('不该写进本机标记');
    expect(payload).not.toContain('陆照海');
    expect(payload).toMatch(/[a-f0-9]{64}/);
    expect([...values.keys()]).toEqual([CHRONICLE_READING_MARK_KEY]);
    await expect(resumeChronicleReadingPlace(scope,structuredClone(world),{storage})).resolves.toEqual({eventId:event.id,...originalPlace});
    for(const distinct of [
      {...scope,timelineId:'fresh-context-same-seed'}, {...scope,branchId:'branch-1'},
      {...scope,viewerId:otherId}, {...scope,previewTick:world.tick},
    ])await expect(resumeChronicleReadingPlace(distinct,world,{storage})).resolves.toBeUndefined();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(world)).toBe(original);
  });

  it('never substitutes an identically named scene/actor or changed same-ID words, and retains stale bytes without writing',async()=>{
    const f=nativeReadingFixture(),{world,event,watcherId}=f,{storage,values}=memory();
    const scope:ChronicleReadingScope={timelineId:'chosen-timeline',branchId:'main',viewerId:watcherId,previewTick:null};
    await markChronicleReadingPlace(scope,world,event.id,originalPlace,{storage});
    const previousJSON=values.get(CHRONICLE_READING_MARK_KEY);
    const other=forkTimeline(createTimeline(f.birth),f.birth.tick,{type:'WHISPER_MIND',targetCultivatorId:watcherId,
      whisperText:'自己这条支线的私议。'});
    const changedBranch=f.doDuel(readTimelineHead(other)!,f.otherId);
    const maybeSameId=changedBranch.events.find(row=>row.id===event.id)!;
    expect(maybeSameId.title).toBe(event.title); // two defenders happen to share the precise visible label
    expect(maybeSameId.actorIds).not.toEqual(event.actorIds);
    await expect(resumeChronicleReadingPlace({...scope,branchId:other.activeBranchId},changedBranch,{storage})).resolves.toBeUndefined();
    await expect(resumeChronicleReadingPlace(scope,changedBranch,{storage})).resolves.toBeUndefined();

    for(const fault of ['private','missing','conflict','words','future'] as const){
      const later=structuredClone(world), current=later.events.find(row=>row.id===event.id)!;
      if(fault==='private')current.witnessScope='participants';
      else if(fault==='missing')later.events=later.events.filter(row=>row.id!==event.id);
      else if(fault==='conflict')later.events.push({...current,id:event.id,description:'源证互有矛盾。'});
      else if(fault==='words')current.dialogue!.turns[0].text='后人改写的句子，不能作为原阅读处。';
      else current.tick=later.tick+1;
      await expect(resumeChronicleReadingPlace(scope,later,{storage})).resolves.toBeUndefined();
    }
    expect(values.get(CHRONICLE_READING_MARK_KEY)).toBe(previousJSON);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('rechecks async source/view scope and storage replacement before giving the controller a focus target',async()=>{
    const f=nativeReadingFixture(),{world,event,watcherId}=f,{storage,values}=memory();
    const scope:ChronicleReadingScope={timelineId:'only-checked-here',branchId:'main',viewerId:watcherId,previewTick:null};
    const modified=structuredClone(world);
    modified.events.find(({id})=>id===event.id)!.category='diplomacy';
    let observed={scope,world};
    let proceed=pauseDigest();
    const write=markChronicleReadingPlace(scope,world,event.id,originalPlace,{storage,current:()=>observed});
    observed={scope,world:modified};
    proceed();
    await expect(write).resolves.toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();

    observed={scope,world};
    await markChronicleReadingPlace(scope,world,event.id,originalPlace,{storage});
    proceed=pauseDigest();
    const intoOtherBranch=resumeChronicleReadingPlace(scope,world,{storage,current:()=>observed});
    observed={scope:{...scope,branchId:'branch-1'},world};
    proceed();
    await expect(intoOtherBranch).resolves.toBeUndefined();

    observed={scope,world};
    proceed=pauseDigest();
    const racingLocalRead=resumeChronicleReadingPlace(scope,world,{storage,current:()=>observed});
    values.set(CHRONICLE_READING_MARK_KEY,'[]');
    proceed();
    await expect(racingLocalRead).resolves.toBeUndefined();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });
});
