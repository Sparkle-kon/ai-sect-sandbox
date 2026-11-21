import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {createCampaignCheckpoint,createFastForwardCampaignController,validCampaignCheckpoint,
  type CampaignCheckpoint,type FastForwardCampaignControllerOptions} from '../src/engine/fastForwardCampaignEngine';
import {createFastForwardRunner,createFastForwardWorkerController,type FastForwardWorkerRequest} from '../src/engine/fastForwardEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {CampaignStopCondition} from '../src/engine/campaignStopCondition';

const flush=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
function selectedAtYearEnd(month=12){
  const source=createInitialWorld(2031);source.month=month;
  const selected=source.cultivators.find(row=>row.alive)!;
  selected.age=selected.lifespan-1;
  const condition={kind:'actor_died' as const,actorId:selected.id};
  return {source,condition};
}
function workerHarness(){
  let counter=0;
  const jobs=new Map<number,()=>void>();
  const started:FastForwardWorkerRequest[]=[];
  const createWorker:FastForwardCampaignControllerOptions['createWorker']=(receive)=>{
    let alive=true;
    const work=createFastForwardWorkerController({post:msg=>{if(alive)receive(msg);},now:()=>0,
      schedule:callback=>{jobs.set(++counter,()=>{if(alive)callback();});return counter;},cancelSchedule:id=>{jobs.delete(Number(id));}});
    return {post(request){if(request.type==='start')started.push(request);work(request);},terminate(){alive=false;}};
  };
  function tick(){const [id,callback]=[...jobs][0];jobs.delete(id);callback();}
  return {createWorker,started,tick,jobs};
}

describe('actual stop checked before next native month',()=>{
  it('stops at the first actual named change before the second turn in a chunk; no ordinary byte divergence',()=>{
    const {source,condition}=selectedAtYearEnd();
    const run=createFastForwardRunner(source,4,{stopCondition:condition,now:()=>0});
    const once=run.advanceChunk();
    expect(once.completedTicks).toBe(1);
    expect(run.hasTriggeredStop()).toBe(true);
    const checkpoint=run.checkpoint()!;
    expect(checkpoint.requestedTicks).toBe(4);
    expect(checkpoint.stopReceipt).toMatchObject({kind:'actor_died',actorId:condition.actorId,tick:source.tick+1,month:1});
    expect(checkpoint.world).toEqual(advanceWorldTick(source,undefined,undefined,'utility'));
    expect(run.advanceChunk()).toEqual(once);
    const equalityDate=createFastForwardRunner(source,1,{stopCondition:condition,now:()=>0});
    expect(equalityDate.advanceChunk().completedTicks).toBe(1);
    expect(equalityDate.checkpoint()?.stopReceipt).toEqual(checkpoint.stopReceipt);
  });

  it('allows date timeout with no event and preserves date-only output',()=>{
    const {source,condition}=selectedAtYearEnd(6);
    const checking=createFastForwardRunner(source,2,{stopCondition:condition,now:()=>0});
    const plain=createFastForwardRunner(source,2,{now:()=>0});
    checking.advanceChunk();plain.advanceChunk();
    expect(checking.hasTriggeredStop()).toBe(false);
    expect(checking.checkpoint()).toEqual(plain.checkpoint());
    expect(checking.checkpoint()).not.toHaveProperty('stopReceipt');
  });

  it('pause/reload continues the exact condition and becomes ready only after durable receipt, without another batch',async()=>{
    const {source,condition}=selectedAtYearEnd(8),harness=workerHarness();
    let durable=createCampaignCheckpoint(source,121),writes:number[]=[];
    const commit=async(_prior:CampaignCheckpoint,next:CampaignCheckpoint)=>{
      writes.push(next.completedTicks);durable=structuredClone(next);return true;
    };
    const start=(runId:string)=>createFastForwardCampaignController({runId,source,initial:durable,stopCondition:condition,
      createWorker:harness.createWorker,commit,discard:async()=>true});
    const going=start('first');going.start();harness.tick();
    expect(going.pause()).toBe(true);await flush();
    expect(going.read()).toMatchObject({phase:'paused',durableTicks:2});
    going.detach();
    const restored=start('restored');restored.resume();
    expect(harness.started[1]).toMatchObject({type:'start',stopCondition:condition,base:{tick:source.tick+2}});
    harness.tick();harness.tick();await flush();
    expect(restored.read()).toMatchObject({phase:'ready',durableTicks:5,completedTicks:5,requestedTicks:121,stopReceipt:{actorId:condition.actorId}});
    expect(restored.resume()).toBe(false);
    expect(harness.started).toHaveLength(2);
    expect(writes).toEqual([2,5]);
    expect(start('ready-reload').read().phase).toBe('ready');
  });

  it('rejects forged target, time, and unrelated receipt, including a receipt with no selected condition',()=>{
    const {source,condition}=selectedAtYearEnd();
    const run=createFastForwardRunner(source,8,{stopCondition:condition,now:()=>0});
    run.advanceChunk();
    const real=run.checkpoint()!;
    const other:CampaignStopCondition={kind:'actor_died',actorId:source.cultivators.find(row=>row.id!==condition.actorId)!.id};
    expect(validCampaignCheckpoint(source,real,condition)).toBe(true);
    expect(validCampaignCheckpoint(source,real)).toBe(false);
    expect(validCampaignCheckpoint(source,real,other)).toBe(false);
    expect(validCampaignCheckpoint(source,{...real,stopReceipt:{...real.stopReceipt!,tick:source.tick+2}},condition)).toBe(false);
  });
});
