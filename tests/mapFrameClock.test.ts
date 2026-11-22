import {describe,expect,it,vi} from 'vitest';
import {createMapFrameClock,type MapFrameDriver} from '../src/components/mapFrameClock';

function fake(){
  const outstanding=new Map<number,(time:number)=>void>();
  const previously=new Map<number,(time:number)=>void>();
  let handle=0,time=0;
  const driver:MapFrameDriver={
    request:callback=>{
      const id=handle++;outstanding.set(id,callback);previously.set(id,callback);return id;
    },
    cancel:id=>{outstanding.delete(id);},
    now:()=>time,
  };
  return {
    driver,outstanding,clock:createMapFrameClock(driver),time:(value:number)=>{time=value;},
    fire:(value:number)=>{
      const entry=outstanding.entries().next().value;
      if(!entry)throw new Error('no frame queued');
      outstanding.delete(entry[0]);entry[1](value);
    },
    stale:(id:number,value:number)=>previously.get(id)?.(value),
  };
}

describe('shared scene and camera frame clock',()=>{
  it('orders camera before scene using one timestamp and only one outstanding frame',()=>{
    const {driver,clock,outstanding,fire,time}=fake();
    const work:Array<[string,number,number]>=[];
    time(20);
    expect(clock.now()).toBe(driver.now());
    clock.start('scene',now=>{work.push(['scene',now,clock.now()]);return false;});
    clock.start('camera',now=>{time(95);work.push(['camera',now,clock.now()]);return now<60;});
    expect([...outstanding.keys()]).toEqual([0]);
    fire(50);
    expect(work).toEqual([['camera',50,50],['scene',50,50]]);
    expect([...outstanding.keys()]).toEqual([1]);
    fire(60);
    expect(work.at(-1)).toEqual(['camera',60,60]);
    expect(outstanding.size).toBe(0);
  });

  it('allows a listener to replace, stop and start work during dispatch without delivering a stale callback',()=>{
    const {clock,fire,outstanding}=fake();
    const oldScene=vi.fn(()=>true),newScene=vi.fn(()=>false);
    const endOld=clock.start('scene',oldScene);
    clock.start('camera',()=>{
      clock.stop('scene');
      clock.start('scene',newScene);
      endOld();
      expect(outstanding.size).toBe(0);
      return false;
    });
    fire(12);
    expect(oldScene).not.toHaveBeenCalled();
    expect(newScene).not.toHaveBeenCalled();
    expect(outstanding.size).toBe(1);
    fire(25);
    expect(newScene).toHaveBeenCalledTimes(1);
    expect(newScene).toHaveBeenCalledWith(25);
    expect(outstanding.size).toBe(0);
  });

  it('ignores canceled driver delivery and stale cleanup, including animation handle zero',()=>{
    const {clock,fire,outstanding,stale}=fake();
    const earlier=vi.fn(()=>true),later=vi.fn(()=>false);
    const cleanup=clock.start('scene',earlier);
    cleanup();
    expect(outstanding.size).toBe(0);
    clock.start('scene',later);
    cleanup();
    stale(0,77);
    expect(earlier).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
    expect([...outstanding.keys()]).toEqual([1]);
    fire(10);
    expect(later).toHaveBeenCalledTimes(1);
    expect(later).toHaveBeenCalledWith(10);
  });

  it('continues other work on a faulty listener and honors permanent disposal even mid-frame',()=>{
    const {clock,fire,outstanding,stale}=fake();
    const scene=vi.fn(()=>true);
    clock.start('camera',()=>{throw new Error('consumer error');});
    clock.start('scene',scene);
    expect(()=>fire(9)).toThrow('consumer error');
    expect(scene).toHaveBeenCalledTimes(1);
    expect(scene).toHaveBeenCalledWith(9);
    clock.start('camera',()=>{clock.dispose();return true;});
    fire(12);
    expect(scene).toHaveBeenCalledTimes(1);
    expect(outstanding.size).toBe(0);
    clock.dispose();
    clock.start('scene',scene)();
    stale(1,13);
    expect(scene).toHaveBeenCalledTimes(1);
    expect(outstanding.size).toBe(0);
  });

  it('keeps browser epochs finite and monotonic if provided a malformed or older timestamp',()=>{
    const {clock,fire,time}=fake();
    const scene=vi.fn(()=>true);
    time(16);expect(clock.now()).toBe(16);
    clock.start('scene',scene);
    time(21);fire(NaN);
    fire(19);
    time(Infinity);fire(-Infinity);
    expect(scene.mock.calls).toEqual([[21],[21],[21]]);
  });
});

it('reports a coupled camera tween until it truly settles or is interrupted',()=>{
  const callbacks=new Map<number,(time:number)=>void>();
  let handle=0;
  const clock=createMapFrameClock({now:()=>0,request:fn=>{callbacks.set(++handle,fn);return handle;},
    cancel:id=>{callbacks.delete(id);}});
  expect(clock.active('camera')).toBe(false);
  clock.start('camera',()=>false);
  expect(clock.active('camera')).toBe(true);
  callbacks.get(handle)?.(18);
  expect(clock.active('camera')).toBe(false);
  clock.start('camera',()=>true);
  clock.stop('camera');
  expect(clock.active('camera')).toBe(false);
});
