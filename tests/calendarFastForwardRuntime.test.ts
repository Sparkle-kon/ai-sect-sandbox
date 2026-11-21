import {afterEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {createFastForwardRunner} from '../src/engine/fastForwardEngine';
import {planFastForwardCalendar} from '../src/engine/fastForwardCalendar';
import {encodeWorldSave} from '../src/engine/storageEngine';
import {createTimeline,forkTimeline,forkTimelineCheckpoint,readTimelineHead,readTimelineSnapshot,recordTimelineWorld,selectTimelineBranch}
  from '../src/engine/timelineEngine';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';

afterEach(()=>vi.unstubAllGlobals());
function nativeDifferentBranchDates(){
  const birth=createInitialWorld(2918);
  let world=birth, history=createTimeline(birth);
  while(world.month!==12){
    world=advanceWorldTick(world,undefined,undefined,'utility');
    history=recordTimelineWorld(history,world);
  }
  const elderDate=readTimelineSnapshot(history,world.tick-1)!;
  const elder=elderDate.cultivators.find(row=>row.alive&&row.hp>0&&row.age+1<row.lifespan&&
    (row.sectRank==='长老'||row.sectRank==='太上长老'||row.sectRank==='掌门'))!;
  expect(elder).toBeDefined();
  // Genuine preceding saved month and existing native fork, never set a fabricated clock or age.
  history=forkTimeline(history,elderDate.tick,{type:'WHISPER_MIND',targetCultivatorId:elder.id,
    whisperText:'这一条支线仍在上一月，请照实际年月。'});
  const base=readTimelineHead(history)!;
  expect(base.tick).toBe(world.tick-1);
  expect(base.month).toBe(11);
  expect(world.month).toBe(12);
  expect(base.interventionSequence).toBe(elderDate.interventionSequence+1);
  return {base,history,elderId:elder.id,main:world};
}
function ordinary(base:WorldState,count:number){
  let next=base;
  for(let i=0;i<count;i++) next=advanceWorldTick(next,undefined,undefined,'utility');
  return next;
}
const invalid=expect.objectContaining({code:'invalid_checkpoint'});

describe('calendar-selected fast forward from a different real branch date',()=>{
  it('plans from the selected real November head, not main December, and reaches exactly the native offline result',()=>{
    const {base,history,main,elderId}=nativeDifferentBranchDates(),source=history.activeBranchId;
    const noNetwork=vi.fn(()=>{throw Error('Offline fast forward must not use a provider');});
    vi.stubGlobal('fetch',noNetwork);
    const plan=planFastForwardCalendar(base,String(base.year+1),'2');
    expect(plan).toMatchObject({ok:true,target:{year:base.year+1,month:2},months:3});
    expect(planFastForwardCalendar(main,String(base.year+1),'2')).toMatchObject({ok:true,months:2});
    if(!plan.ok) throw Error('valid calendar target expected');
    const original=encodeWorldSave(base), trueMain=encodeWorldSave(main);
    const runner=createFastForwardRunner(base,plan.months,{now:()=>0});
    expect(runner.advanceChunk()).toMatchObject({completedTicks:2,requestedTicks:3});
    const partial=runner.checkpoint()!;
    expect(partial.world).toMatchObject({year:base.year+1,month:1,tick:base.tick+2});
    expect(encodeWorldSave(partial.world)).toBe(encodeWorldSave(ordinary(base,2)));
    expect(partial.world.month).not.toBe(plan.target.month);
    while(runner.readProgress().completedTicks<plan.months)runner.advanceChunk();
    const checkpoint=runner.checkpoint()!;
    expect(checkpoint.world).toMatchObject({...plan.target,tick:base.tick+3});
    expect(encodeWorldSave(checkpoint.world)).toBe(encodeWorldSave(ordinary(base,3)));
    const previousElder=base.cultivators.find(({id})=>id===elderId)!;
    const currentElder=checkpoint.world.cultivators.find(({id})=>id===elderId)!;
    expect(currentElder.age).toBe(previousElder.age+1);
    const applied=forkTimelineCheckpoint(history,source,base.tick,checkpoint);
    expect(applied.activeBranchId).not.toBe(source);
    expect(encodeWorldSave(readTimelineHead(applied)!)).toBe(encodeWorldSave(checkpoint.world));
    expect(encodeWorldSave(readTimelineHead(applied,source)!)).toBe(original);
    expect(encodeWorldSave(readTimelineHead(applied,'main')!)).toBe(trueMain);
    expect(noNetwork).not.toHaveBeenCalled();
  });

  it('rejects wrong civil dates (full or partial), wrong branches and a same-date changed live head without overriding anything',()=>{
    const {base,history}=nativeDifferentBranchDates(), source=history.activeBranchId, original=encodeWorldSave(base);
    const plan=planFastForwardCalendar(base,String(base.year+1),'2');
    if(!plan.ok) throw Error('valid future target expected');
    const runner=createFastForwardRunner(base,plan.months,{now:()=>0});
    runner.advanceChunk();
    const partial=runner.checkpoint()!;
    const pretendsComplete={...partial,world:{...partial.world,year:plan.target.year,month:plan.target.month}};
    expect(()=>forkTimelineCheckpoint(history,source,base.tick,pretendsComplete)).toThrow(invalid);
    runner.advanceChunk();
    const sealed=runner.checkpoint()!;
    const sameYearWrongMonth={...sealed,world:{...sealed.world,month:1}};
    const sameMonthWrongYear={...sealed,world:{...sealed.world,year:sealed.world.year+1}};
    expect(()=>forkTimelineCheckpoint(history,source,base.tick,sameYearWrongMonth)).toThrow(invalid);
    expect(()=>forkTimelineCheckpoint(history,source,base.tick,sameMonthWrongYear)).toThrow(invalid);
    expect(()=>forkTimelineCheckpoint(selectTimelineBranch(history,'main'),source,base.tick,sealed)).toThrow(invalid);

    const alteredAtSameDate=executeGodIntervention(base,{type:'SPAWN_TREASURE',targetLocationId:base.locations[0].id});
    expect(alteredAtSameDate).toMatchObject({year:base.year,month:base.month,tick:base.tick});
    expect(()=>forkTimelineCheckpoint(recordTimelineWorld(history,alteredAtSameDate),source,base.tick,sealed)).toThrow(invalid);
    expect(encodeWorldSave(readTimelineHead(history,source)!)).toBe(original);
    expect(encodeWorldSave(base)).toBe(original);
  });
});
