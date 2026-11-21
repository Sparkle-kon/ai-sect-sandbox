import {afterEach,describe,expect,it,vi} from 'vitest';
// @ts-expect-error The app TS configuration excludes Node ambient declarations.
import {createHash} from 'node:crypto';
import {createInitialWorld} from '../src/data/initialWorld';
import * as fastForward from '../src/engine/fastForwardEngine';
import {REPLAY_RECEIPT_TICKS,verifyReplayReceipt} from '../src/engine/replayReceiptEngine';
import type {ReplayReceiptRequest} from '../src/engine/replayReceiptEngine';
import {createReplayReceiptFixture} from '../src/engine/replayReceiptFixtures';
import {encodeWorldSave} from '../src/engine/storageEngine';

const runtime={ruleVersion:'a'.repeat(64),sha256:async(text:string):Promise<string>=>createHash('sha256').update(text).digest('hex')};
const fixture=(fixtureId:'short48'|'long526'):ReplayReceiptRequest=>({type:'verify_replay',runId:fixtureId,source:{kind:'fixture',fixtureId}});
const branch=(base=createInitialWorld(30301)):ReplayReceiptRequest=>({type:'verify_replay',runId:'actual',source:{kind:'branch',branchId:'main',tick:base.tick},base});
afterEach(()=>vi.restoreAllMocks());

describe('deterministic on-demand replay receipts',()=>{
  it('compares two strict outputs from the exact checkpoint, reports matching digests without returning any world, and leaves its source byte-identical',async()=>{
    const base=createInitialWorld(30301);
    const original=encodeWorldSave(base);
    const result=await verifyReplayReceipt(branch(base),runtime);
    expect(result).toMatchObject({type:'replay_receipt',runId:'actual',source:{kind:'branch',branchId:'main',tick:base.tick},
      outcome:{status:'verified',receipt:{seed:30301,ruleVersion:runtime.ruleVersion,requestedTicks:REPLAY_RECEIPT_TICKS,
        sourceCheckpoint:{tick:base.tick,actorCount:base.cultivators.length,sha256:await runtime.sha256(original)},
        direct:{tick:base.tick+REPLAY_RECEIPT_TICKS,completedTicks:REPLAY_RECEIPT_TICKS,retainedSourceActors:true},
        chunked:{tick:base.tick+REPLAY_RECEIPT_TICKS,completedTicks:REPLAY_RECEIPT_TICKS,retainedSourceActors:true},
        identicalVerifiedSave:true}}});
    expect(encodeWorldSave(base)).toBe(original);
    if(result.outcome.status==='unavailable') throw Error('Expected verified result');
    expect(result.outcome.receipt.direct.sha256).toBe(result.outcome.receipt.chunked.sha256);
    expect(result.outcome.receipt.direct.sha256).not.toBe(result.outcome.receipt.sourceCheckpoint.sha256);
    expect(JSON.stringify(result)).not.toMatch(/cultivators|memories|knownLocations|timelineId|checkpointWorld/);
  });

  it('runs independently generated short and long fixtures with exactly their documented starting coverage',async()=>{
    for(const [id,count] of [['short48',48],['long526',526]] as const){
      const base=createReplayReceiptFixture(id);
      expect(base.cultivators).toHaveLength(count);
      // A smuggled request body cannot replace the canonical synthetic roster or claim its coverage.
      const request={...fixture(id),base:createInitialWorld(33013)};
      const result=await verifyReplayReceipt(request,{...runtime,timingScope:'node_process'});
      expect(result).toMatchObject({source:{kind:'fixture',fixtureId:id},outcome:{status:'verified',receipt:{
        seed:17091,sourceCheckpoint:{actorCount:count,sha256:await runtime.sha256(encodeWorldSave(base))},
        timingScope:'node_process',direct:{completedTicks:4,retainedSourceActors:true},chunked:{completedTicks:4,retainedSourceActors:true},
      }}});
    }
  },30_000);

  it('does not mistake structural checkpoint validity, same tick and same actor retention for matching outcomes',async()=>{
    const create=fastForward.createFastForwardRunner;
    vi.spyOn(fastForward,'createFastForwardRunner').mockImplementation((...args)=>{
      const run=create(...args);
      return {...run,checkpoint:()=>{
        const checkpoint=run.checkpoint();
        if(checkpoint) checkpoint.world.cultivators[0].spiritStones+=1;
        return checkpoint;
      }};
    });
    const result=await verifyReplayReceipt(branch(),runtime);
    expect(result.outcome).toMatchObject({status:'mismatch',receipt:{identicalVerifiedSave:false,
      direct:{retainedSourceActors:true},chunked:{retainedSourceActors:true}}});
    if(result.outcome.status==='unavailable') throw Error('Expected strictly valid but different saves');
    expect(result.outcome.receipt.direct.sha256).not.toBe(result.outcome.receipt.chunked.sha256);
  });

  it('does not assert a birth profile for a legacy checkpoint without that record',async()=>{
    const legacy=createInitialWorld(30301);
    delete legacy.worldgen;
    await expect(verifyReplayReceipt(branch(legacy),runtime)).resolves.toMatchObject({outcome:{status:'verified',
      receipt:{profileId:null,sourceCheckpoint:{sha256:await runtime.sha256(encodeWorldSave(legacy))}}}});
  });

  it('withholds a receipt when rules, source, strict save or hash cannot actually be validated',async()=>{
    const base=createInitialWorld(30301);
    const request=branch(base);
    await expect(verifyReplayReceipt(request,{...runtime,ruleVersion:undefined})).resolves.toMatchObject({outcome:{status:'unavailable',reason:'rules_version'}});
    await expect(verifyReplayReceipt({type:'verify_replay',runId:'stale',source:{kind:'branch',branchId:'main',tick:base.tick+1},base},runtime))
      .resolves.toMatchObject({outcome:{status:'unavailable',reason:'source'}});
    await expect(verifyReplayReceipt(request,{...runtime,sha256:async()=>{throw Error('secret detail');}}))
      .resolves.toMatchObject({outcome:{status:'unavailable',reason:'crypto'}});
    base.cultivators[0].hp=Number.NaN;
    await expect(verifyReplayReceipt(request,runtime)).resolves.toMatchObject({outcome:{status:'unavailable',reason:'invalid_save'}});
    base.cultivators[0].name='x'.repeat(8*1024*1024);
    await expect(verifyReplayReceipt(request,runtime)).resolves.toMatchObject({outcome:{status:'unavailable',reason:'save_size'}});
  });
});
