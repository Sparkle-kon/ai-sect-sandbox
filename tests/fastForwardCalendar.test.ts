import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {addFastForwardCalendarMonths,planFastForwardCalendar} from '../src/engine/fastForwardCalendar';
import {createFastForwardRunner,createFastForwardWorkerController,FAST_FORWARD_MAX_TICKS,
  type FastForwardWorkerResponse} from '../src/engine/fastForwardEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';

describe('absolute native fast-forward calendar',()=>{
  it('parses exact target month, including cross-year and a true progress rollover',()=>{
    const base={year:1001,month:11,tick:11};
    expect(planFastForwardCalendar(base,'1002','02')).toEqual({ok:true,target:{year:1002,month:2},months:3});
    expect([0,1,2,3].map(months=>addFastForwardCalendarMonths(base,months))).toEqual([
      {year:1001,month:11},{year:1001,month:12},{year:1002,month:1},{year:1002,month:2},
    ]);
    expect(planFastForwardCalendar({year:1003,month:1},'1002','2')).toEqual({ok:false,reason:'not_future'});
    expect(planFastForwardCalendar(base,'1001','10')).toEqual({ok:false,reason:'not_future'});
    expect(planFastForwardCalendar(base,'1001','11')).toEqual({ok:false,reason:'not_future'});
  });

  it('enforces current single batch, strict integer drafts, and tick/year overflow without decimal coercion',()=>{
    const base={year:1001,month:11,tick:11};
    expect(planFastForwardCalendar(base,'1011','11')).toMatchObject({ok:true,months:FAST_FORWARD_MAX_TICKS});
    expect(planFastForwardCalendar(base,'1011','12')).toEqual({ok:false,reason:'out_of_range'});
    for(const [year,month] of [[' 1002','1'],['1002\n','1'],['1002','1\n'],['+1002','1'],['1002.0','1'],['1e3','1'],['１００２','1'],
      ['9007199254740992','1'],['0','1'],['1002',' 1'],['1002','0'],['1002','13'],['1002','1.2'],['1002','001'],['','1']])
      expect(planFastForwardCalendar(base,year,month)).toEqual({ok:false,reason:'invalid_date'});
    expect(planFastForwardCalendar({year:1001,month:0},'1002','1')).toEqual({ok:false,reason:'invalid_date'});
    expect(planFastForwardCalendar({...base,tick:Number.MAX_SAFE_INTEGER},'1002','1')).toEqual({ok:false,reason:'out_of_range'});
    expect(addFastForwardCalendarMonths({year:Number.MAX_SAFE_INTEGER,month:12},1)).toBeUndefined();
    expect(addFastForwardCalendarMonths({year:Number.MAX_SAFE_INTEGER,month:1},1)).toEqual({year:Number.MAX_SAFE_INTEGER,month:2});
  });

  it('matches ordinary single steps to the exact target and permits continuing the unmodified original after cancellation',()=>{
    const base=createInitialWorld(977);
    base.month=11;
    const original=structuredClone(base),plan=planFastForwardCalendar(base,String(base.year+1),'2');
    if(!plan.ok)throw Error('expected genuine cross-year plan');
    const runner=createFastForwardRunner(base,plan.months,{now:()=>0});
    while(runner.readProgress().completedTicks<plan.months)runner.advanceChunk();
    const checkpoint=runner.checkpoint()!;
    let ordinary=base;
    for(let i=0;i<plan.months;i++)ordinary=advanceWorldTick(ordinary,undefined,undefined,'utility');
    expect(checkpoint.world).toEqual(ordinary);
    expect(addFastForwardCalendarMonths(base,checkpoint.completedTicks)).toEqual(plan.target);
    expect({year:ordinary.year,month:ordinary.month}).toEqual(plan.target);

    const events:FastForwardWorkerResponse[]=[],scheduled=new Map<number,()=>void>();
    let latest=0;
    const controller=createFastForwardWorkerController({post:event=>events.push(event),now:()=>0,
      schedule:callback=>{scheduled.set(++latest,callback);return latest;},cancelSchedule:key=>{scheduled.delete(Number(key));}});
    controller({type:'start',runId:'calendar-cancel',base,requestedTicks:plan.months});
    scheduled.get(latest)?.();
    expect(events.at(-1)).toMatchObject({type:'progress',progress:{completedTicks:2}});
    const stale=scheduled.get(latest);
    controller({type:'cancel',runId:'calendar-cancel'});
    stale?.();
    expect(events.at(-1)).toEqual({type:'cancelled',runId:'calendar-cancel'});
    expect(base).toEqual(original);
    expect(advanceWorldTick(base)).toEqual(advanceWorldTick(original));
  });
});
