import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {deriveChapterEndHook} from '../src/engine/chapterEndHooks';
import {deriveChapterOpening} from '../src/engine/chapterContinuity';
import {publicChronicleChapters} from '../src/engine/coldHistoryEngine';
import {availableChronicleChapter,resolveChronicleChapter} from '../src/engine/novelGenerator';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {ChronicleChapter,WorldState} from '../src/types/world';
import {freightMonth,freightShipment,nativeFreightShipment} from './marketFreightNativeFixture';

const sourceId='evt-12-elder-tianji-1-social';
const firstId='chapter-1-12',secondId='chapter-13-24';
const chapterAt=(world:WorldState,id:string)=>publicChronicleChapters(world).find(row=>row.id===id)!;
let at24:WorldState|undefined,at25:WorldState|undefined;
function nativeWorld(end:24|25):WorldState{
  if(!at24){
    let world=createInitialWorld(1);
    while(world.tick<24)world=advanceWorldTick(world);
    at24=world;
  }
  if(end===24)return structuredClone(at24);
  at25??=advanceWorldTick(at24);
  return structuredClone(at25);
}

describe('real adjacent chapter opening',()=>{
  it('uses the exact real public prior-month social meeting for both a prospective plan and its settled chapter',()=>{
    const before=nativeWorld(24),plan=availableChronicleChapter(before,true)!;
    expect(plan.id).toBe(secondId);
    const prior=chapterAt(before,firstId);
    expect(prior.anchors.find(row=>row.id===sourceId)).toMatchObject({category:'diplomacy',tick:12});
    const onPlan=deriveChapterOpening(before,plan);
    expect(onPlan).toEqual({chapterId:firstId,eventId:sourceId,text:'上回，蒋观星与苏清寒在太虚剑峰坐下论道。'});
    const settled=nativeWorld(25),chapter=chapterAt(settled,secondId);
    expect(chapter).toBeDefined();
    expect(deriveChapterOpening(settled,chapter)).toEqual(onPlan);
    expect(deriveChapterOpening(settled,chapterAt(settled,firstId))).toBeUndefined();
    const original=JSON.stringify(settled);
    expect(deriveChapterOpening(settled,chapter)).toEqual(onPlan);
    expect(JSON.stringify(settled)).toBe(original);
  });

  it('trusts an injected hook only for a retained original ID; never echoes a hook’s or manuscript’s unchecked prose',()=>{
    const world=nativeWorld(25),chapter=chapterAt(world,secondId),previous=chapterAt(world,firstId);
    previous.body='无证的旧稿：移山后有一场大雨。';
    const result=deriveChapterOpening(world,chapter,(_scope,exact)=>{
      expect(exact).toBe(previous);
      return {eventId:sourceId,text:'伪造的一句话与未发生的死亡。'};
    });
    expect(result?.eventId).toBe(sourceId);
    expect(result?.text).toContain('坐下论道');
    expect(JSON.stringify(result)).not.toMatch(/大雨|伪造|死亡|旧稿|言道/);
    expect(deriveChapterOpening(world,chapter,()=>({eventId:'not-an-anchor',text:'伪造的回目'}))).toEqual(result);
  });

  it('carries an independently proved in-transit hook in past tense, with no ETA or later settlement',()=>{
    const {world,shipment}=nativeFreightShipment();
    const previous=resolveChronicleChapter(world,availableChronicleChapter(world,true)!)!;
    const source=`evt-${shipment.departedTick}-market-${shipment.id}`;
    expect(deriveChapterEndHook(world,previous)?.eventId).toBe(source);
    let currentWorld=freightMonth(world);
    currentWorld=executeGodIntervention(currentWorld,{type:'SPAWN_TREASURE',targetLocationId:shipment.originId});
    const next=availableChronicleChapter(currentWorld,true)!;
    const result=deriveChapterOpening(currentWorld,next,deriveChapterEndHook);
    expect(result).toEqual({chapterId:previous.id,eventId:source,text:'上回，商队已经启程；那时货还没到埠。'});
    expect(result?.text).not.toMatch(/预计|回合|终于抵达|退款/);
    const sealed=resolveChronicleChapter(currentWorld,next)!;
    while(freightShipment(currentWorld).status==='in_transit')currentWorld=freightMonth(currentWorld);
    expect(deriveChapterOpening(currentWorld,sealed,deriveChapterEndHook)).toEqual(result);
  });

  it('rejects forked current evidence, duplicate predecessors, non-adjacent dates, inaccessible sources and later conflicting originals',()=>{
    const world=nativeWorld(25),chapter=chapterAt(world,secondId);
    const fake={...chapter,anchors:chapter.anchors.map((row,n)=>n?row:{...row,description:'别支时间线改写了地点。'})};
    expect(deriveChapterOpening(world,fake)).toBeUndefined();
    const prospective=nativeWorld(24),plan=availableChronicleChapter(prospective,true)!;
    expect(deriveChapterOpening(prospective,{...plan,startTick:plan.startTick+1,id:`chapter-14-${plan.endTick}`})).toBeUndefined();
    expect(deriveChapterOpening(prospective,{...plan,endTick:prospective.tick+1})).toBeUndefined();
    const duplicate=nativeWorld(25);
    duplicate.chronicleArchive.chapters.push({...chapterAt(duplicate,firstId),id:'duplicate-collision'});
    expect(deriveChapterOpening(duplicate,chapterAt(duplicate,secondId))).toBeUndefined();
    const source=world.events.find(row=>row.id===sourceId)??world.chronicleArchive.anchors.find(row=>row.id===sourceId)!;
    world.events.unshift({...source,witnessScope:'participants'});
    expect(deriveChapterOpening(world,chapter)).toBeUndefined();
    world.events.shift();
    world.events.unshift({...source,description:'不相容的另一份文书。'});
    expect(deriveChapterOpening(world,chapter,()=>({eventId:sourceId,text:'勿取'}))?.eventId).not.toBe(sourceId);
  });

  it('keeps genuinely old closed serial volumes readable through one canonical typed quiet anchor after ordinary sources are pruned',()=>{
    let world=nativeWorld(25);
    while(world.tick<97)world=advanceWorldTick(world);
    const previous=world.coldHistory.chapters.find(row=>row.id===firstId)!;
    const current=chapterAt(world,secondId);
    expect(previous?.id).toBe(firstId);
    expect(current).toBeDefined();
    expect([...world.events,...world.chronicleArchive.anchors].some(row=>row.id===sourceId)).toBe(false);
    expect(deriveChapterOpening(world,current)).toMatchObject({chapterId:firstId,eventId:sourceId,text:expect.stringContaining('坐下论道')});
    const old=structuredClone(world),first=old.coldHistory.chapters.find(row=>row.id===firstId)!;
    const forged:ChronicleChapter={...first,anchors:first.anchors.map(row=>row.id===sourceId?{...row,description:'未证的高声叫嚷。'}:row)};
    old.coldHistory={...old.coldHistory,chapters:old.coldHistory.chapters.map(row=>row.id===firstId?forged:row)};
    expect(deriveChapterOpening(old,chapterAt(old,secondId),()=>({eventId:sourceId,text:'不可复述'}))?.eventId).not.toBe(sourceId);
  });
});
