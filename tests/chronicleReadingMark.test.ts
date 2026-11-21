import {describe,expect,it} from 'vitest';
import {CHRONICLE_READING_MARK_KEY,hasChronicleReadingPlace,markChronicleReadingPlace,resumeChronicleReadingPlace,
  type ChronicleReadingScope,type ChronicleReadingStorage} from '../src/engine/chronicleReadingMark';
import {publicDialogueProofFixture} from './fixtures/publicDialogueFixture';

function readingStorage(){
  const values=new Map<string,string>();
  let writes=0;
  const storage:ChronicleReadingStorage={
    getItem:key=>values.get(key)??null,
    setItem(key,value){writes++;values.set(key,value);},
  };
  return {storage,values,writes:()=>writes};
}

function actualReading(){
  const fixture=publicDialogueProofFixture();
  const scope:ChronicleReadingScope={timelineId:'test-uuid-exact-world',branchId:'main',viewerId:fixture.actorId,previewTick:null};
  const position={sections:['dialogue','record','record'] as const,listScrollTop:38.4,pageScrollY:240};
  return {...fixture,scope,position};
}

describe('explicit local reading position, exact source and scope',()=>{
  it('stores only exact scoped opaque hash, scene ID and selected evidence position, without implicitly advancing/focusing',async()=>{
    const {world,event,scope,position}=actualReading(),memory=readingStorage();
    expect(hasChronicleReadingPlace(scope,memory)).toBe(false);
    expect(await resumeChronicleReadingPlace(scope,world,memory)).toBeUndefined();
    expect(memory.writes()).toBe(0);
    expect(await markChronicleReadingPlace(scope,world,event.id,position,memory)).toBe(true);
    const raw=memory.values.get(CHRONICLE_READING_MARK_KEY)!;
    const place={eventId:event.id,sections:['record','dialogue'],listScrollTop:38,pageScrollY:240};
    expect(JSON.parse(raw)).toEqual([{scope,digest:expect.stringMatching(/^[a-f0-9]{64}$/),...place}]);
    expect(raw).not.toContain(event.title);
    expect(raw).not.toContain(event.description);
    expect(raw).not.toContain(event.dialogue!.turns[0].text);
    expect(raw).not.toContain(event.dialogue!.turns[0].speakerName);
    expect(await resumeChronicleReadingPlace(scope,structuredClone(world),memory)).toEqual(place);
    expect(memory.writes()).toBe(1);
  });

  it('keeps actual viewer, branch, timeline and preview scopes strictly independent',async()=>{
    const {world,event,scope,position,firstId}=actualReading(),memory=readingStorage();
    expect(await markChronicleReadingPlace(scope,world,event.id,position,memory)).toBe(true);
    for(const other of [{...scope,branchId:'branch-2'},{...scope,viewerId:firstId},{...scope,viewerId:null},
      {...scope,timelineId:'same-label-new-world'},{...scope,previewTick:world.tick}])
      expect(await resumeChronicleReadingPlace(other,world,memory)).toBeUndefined();
    const preview={...scope,previewTick:world.tick};
    expect(await markChronicleReadingPlace(preview,world,event.id,{...position,sections:['cause']},memory)).toBe(true);
    expect((await resumeChronicleReadingPlace(preview,world,memory))?.sections).toEqual([]);
    expect((await resumeChronicleReadingPlace(scope,world,memory))?.sections).toEqual(['record','dialogue']);
  });

  it('neutralizes changed text or structured dialogue, a private original, duplicate, or missing source',async()=>{
    const {world,event,scope,position}=actualReading(),memory=readingStorage();
    await markChronicleReadingPlace(scope,world,event.id,position,memory);
    for(const edit of [
      (w:typeof world)=>{w.events.find(row=>row.id===event.id)!.description+='原文变化';},
      (w:typeof world)=>{w.events.find(row=>row.id===event.id)!.dialogue!.turns[0].text+='原词变化';},
      (w:typeof world)=>{w.events.find(row=>row.id===event.id)!.witnessScope='participants';},
      (w:typeof world)=>{w.events.push(event);},
      (w:typeof world)=>{w.events=w.events.filter(row=>row.id!==event.id);},
    ]){
      const edited=structuredClone(world);edit(edited);
      expect(await resumeChronicleReadingPlace(scope,edited,memory)).toBeUndefined();
    }
    expect(memory.writes()).toBe(1);
  });

  it('guards delayed marks/resume against live context drift and another device-tab write',async()=>{
    const {world,event,scope,position}=actualReading(),memory=readingStorage();
    expect(await markChronicleReadingPlace(scope,world,event.id,position,{...memory,
      current:()=>({scope:{...scope,branchId:'after-await'},world})})).toBe(false);
    expect(memory.writes()).toBe(0);
    expect(await markChronicleReadingPlace(scope,world,event.id,position,memory)).toBe(true);
    let read=0;
    const racing:ChronicleReadingStorage={...memory.storage,getItem:key=>{
      read++;
      const raw=memory.storage.getItem(key);
      return read===1?raw:raw?.replace('"pageScrollY":240','"pageScrollY":241')??null;
    }};
    expect(await resumeChronicleReadingPlace(scope,world,{storage:racing})).toBeUndefined();
    const changed=structuredClone(world);changed.events.find(row=>row.id===event.id)!.title+='不再相同';
    expect(await resumeChronicleReadingPlace(scope,world,{...memory,current:()=>({scope,world:changed})})).toBeUndefined();
  });

  it('treats malformed/denied local state as an optional unavailable preference',async()=>{
    const {world,event,scope,position}=actualReading(),memory=readingStorage();
    memory.values.set(CHRONICLE_READING_MARK_KEY,'{malformed');
    expect(hasChronicleReadingPlace(scope,memory)).toBe(false);
    expect(await resumeChronicleReadingPlace(scope,world,memory)).toBeUndefined();
    const storage:ChronicleReadingStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
    expect(await markChronicleReadingPlace(scope,world,event.id,position,{storage})).toBe(false);
    expect(await resumeChronicleReadingPlace(scope,world,{storage})).toBeUndefined();
  });
});
