import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {addCampaignCalendarMonths,createCampaignCheckpoint,createFastForwardCampaignController,planFastForwardCampaign,
  type FastForwardCampaignControllerOptions} from '../src/engine/fastForwardCampaignEngine';
import {createFastForwardWorkerController,FAST_FORWARD_MAX_TICKS,type FastForwardWorkerRequest,type FastForwardWorkerResponse} from '../src/engine/fastForwardEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';

function flush(){
  return new Promise<void>(resolve=>setTimeout(resolve,0));
}
function mockedPorts(){
  const ports:{receive:(message:FastForwardWorkerResponse)=>void;requests:FastForwardWorkerRequest[];closed:boolean}[]=[];
  const createWorker:FastForwardCampaignControllerOptions['createWorker']=(receive)=>{
    const port={receive,requests:[] as FastForwardWorkerRequest[],closed:false};
    ports.push(port);
    return {post(request){port.requests.push(request);},terminate(){port.closed=true;}};
  };
  function complete(port:typeof ports[number],month:number,phase:'paused'|'staged'|'progress'){
    const start=port.requests[0];
    if(start?.type!=='start')throw Error('expected running fake native port');
    const progress={startTick:start.base.tick,currentTick:start.base.tick+month,requestedTicks:start.requestedTicks,
      completedTicks:month,living:start.base.cultivators.length,totalActors:start.base.cultivators.length,
      processingMs:0,maxTickMs:0,maxChunkMs:0};
    if(phase!=='staged'){port.receive({type:phase,runId:start.runId,progress});return;}
    const date=addCampaignCalendarMonths(start.base,month)!;
    const world={...structuredClone(start.base),...date,tick:start.base.tick+month};
    port.receive({type:'staged',runId:start.runId,progress,checkpoint:{startTick:start.base.tick,
      requestedTicks:start.requestedTicks,completedTicks:month,baseRandomState:start.base.random.state,
      baseInterventionSequence:start.base.interventionSequence,world}});
  }
  return {ports,createWorker,complete};
}

describe('coalesced campaign batch controller',()=>{
  it('plans exact long dates safely without changing the ordinary batch size',()=>{
    expect(FAST_FORWARD_MAX_TICKS).toBe(120);
    const source={tick:1,year:1001,month:11};
    expect(planFastForwardCampaign(source,'1101','11')).toEqual({ok:true,target:{year:1101,month:11},months:1200});
    expect(planFastForwardCampaign(source,'1101','12')).toEqual({ok:false,reason:'out_of_range'});
    expect(planFastForwardCampaign(source,'1002','2')).toEqual({ok:true,target:{year:1002,month:2},months:3});
    expect(planFastForwardCampaign(source,'1002\n','2')).toEqual({ok:false,reason:'invalid_date'});
    expect(addCampaignCalendarMonths(source,601)).toEqual({year:1051,month:12});
  });

  it('awaits durable verified commit before starting second batch and ignores stale callbacks and repeated resume',async()=>{
    const source=createInitialWorld(1234),{ports,createWorker,complete}=mockedPorts();
    let release:(ok:boolean)=>void=()=>{};
    const commits:number[]=[];
    const controller=createFastForwardCampaignController({source,runId:'sequence',initial:createCampaignCheckpoint(source,121),createWorker,
      commit(previous,next){commits.push(next.completedTicks);expect(next.completedTicks).toBeGreaterThan(previous.completedTicks);
        return next.completedTicks===120?new Promise<boolean>(done=>{release=done;}):Promise.resolve(true);},discard:async()=>true});
    expect(controller.start()).toBe(true);
    expect(controller.resume()).toBe(false);
    expect(ports[0].requests[0]).toMatchObject({requestedTicks:120});
    complete(ports[0],120,'staged');
    await flush();
    expect(controller.read()).toMatchObject({phase:'checkpointing',completedTicks:120,durableTicks:0});
    expect(ports).toHaveLength(1);
    release(true);await flush();
    expect(ports).toHaveLength(2);
    expect(ports[1].requests[0]).toMatchObject({requestedTicks:1,base:{tick:source.tick+120}});
    complete(ports[0],120,'staged');
    complete(ports[1],1,'staged');await flush();
    expect(controller.read()).toMatchObject({phase:'ready',completedTicks:121,durableTicks:121});
    expect(controller.readReadyCheckpoint()?.world.tick).toBe(source.tick+121);
    expect(commits).toEqual([120,121]);
  });

  it('pause stages a genuine partial and resumes native ordinary months exactly',async()=>{
    const source=createInitialWorld(2031);source.month=11;
    let nextHandle=0;
    const schedule=new Map<number,()=>void>(),commits:number[]=[];
    const createWorker:FastForwardCampaignControllerOptions['createWorker']=(receive)=>{
      let alive=true;
      const post=createFastForwardWorkerController({post:message=>{if(alive)receive(message);},now:()=>0,
        schedule:callback=>{schedule.set(++nextHandle,callback);return nextHandle;},
        cancelSchedule:id=>{schedule.delete(Number(id));}});
      return {post,terminate(){alive=false;}};
    };
    const controller=createFastForwardCampaignController({source,runId:'native',initial:createCampaignCheckpoint(source,5),
      createWorker,commit:async(_prior,next)=>{commits.push(next.completedTicks);return true;},discard:async()=>true});
    const step=()=>{const [handle,callback]=[...schedule][0];schedule.delete(handle);callback();};
    expect(controller.start()).toBe(true);step();
    expect(controller.read()).toMatchObject({completedTicks:2,durableTicks:0});
    expect(controller.pause()).toBe(true);await flush();
    expect(controller.read()).toMatchObject({phase:'paused',completedTicks:2,durableTicks:2,durableDate:{year:source.year+1,month:1}});
    expect(controller.resume()).toBe(true);step();step();await flush();
    let ordinary=source;
    for(let count=0;count<5;count++)ordinary=advanceWorldTick(ordinary,undefined,undefined,'utility');
    expect(controller.readReadyCheckpoint()?.world).toEqual(ordinary);
    expect(controller.read()).toMatchObject({phase:'ready',durableTicks:5});
    expect(commits).toEqual([2,5]);
  });

  it('cancels idempotently after a transmitted CAS settles and never applies its late write as a new batch',async()=>{
    const source=createInitialWorld(2031),{ports,createWorker,complete}=mockedPorts();
    let completeCommit:()=>void=()=>{};
    let durable=0,discards=0;
    const controller=createFastForwardCampaignController({source,runId:'cancel',initial:createCampaignCheckpoint(source,121),createWorker,
      commit:(_prior,next)=>new Promise(done=>{completeCommit=()=>{durable=next.completedTicks;done(true);};}),
      discard:async()=>{discards++;expect(durable).toBe(120);durable=0;return true;}});
    controller.start();complete(ports[0],120,'staged');
    await flush();
    const one=controller.cancel(),two=controller.cancel();
    expect(one).toBe(two);
    expect(controller.read().phase).toBe('cancelling');
    expect(discards).toBe(0);
    completeCommit();expect(await one).toBe(true);
    expect(ports).toHaveLength(1);
    expect(durable).toBe(0);
    expect(controller.read().phase).toBe('cancelled');
    complete(ports[0],120,'staged');expect(await controller.cancel()).toBe(true);
    expect(discards).toBe(1);
  });

  it('never advances another batch if checkpoint persistence fails or detached work reports late',async()=>{
    const source=createInitialWorld(2031),{ports,createWorker,complete}=mockedPorts();
    let commitments=0;
    const controller=createFastForwardCampaignController({source,runId:'failed',initial:createCampaignCheckpoint(source,121),
      createWorker,commit:async()=>{commitments++;return false;},discard:async()=>true});
    controller.start();complete(ports[0],120,'staged');await flush();
    expect(controller.read()).toMatchObject({phase:'error',durableTicks:0,completedTicks:0});
    expect(ports).toHaveLength(1);
    const later=createFastForwardCampaignController({source,runId:'detach',initial:createCampaignCheckpoint(source,1),
      createWorker,commit:async()=>{commitments++;return true;},discard:async()=>true});
    later.start();later.detach();complete(ports[1],1,'staged');await flush();
    expect(commitments).toBe(1);
    expect(later.read().phase).toBe('detached');
  });
});
