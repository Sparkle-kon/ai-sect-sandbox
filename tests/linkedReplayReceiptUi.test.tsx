import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createTimeline } from '../src/engine/timelineEngine';
import {encodeWorldSave} from '../src/engine/storageEngine';
import {resolveReplayVerificationSource} from '../src/components/TimelinePanel';
import {sameReplayVerificationSource} from '../src/components/ReplayReceiptPanel';
import type { ReplayReceipt } from '../src/engine/replayReceiptEngine';
import {
  LinkedReplayReceiptRead, linkedReplayMessage, replayReceiptFreshness, replayReceiptOrdinals,
  type ReplayReceiptShelf,
} from '../src/components/LinkedReplayReceiptRead';

const world = createInitialWorld(347);
const timeline = createTimeline(world);
const source = {world, branchId:'内部私有分支',scopeKey:'内部帧标记',busy:false};
const checkpoint = {tick:1,actorCount:48,livingCount:48,randomState:818,sha256:'2'.repeat(64)};
const run = {...checkpoint,tick:5,sha256:'3'.repeat(64),completedTicks:4,elapsedMs:null,retainedSourceActors:true};
const receipt: ReplayReceipt = {protocolVersion:1,ruleVersion:'1'.repeat(64),seed:347,profileId:'classic',
  randomAlgorithm:'mulberry32-v1',requestedTicks:4,timingScope:'browser_worker',sourceCheckpoint:checkpoint,
  direct:run,chunked:run,identicalVerifiedSave:true};
const a = {branchId:source.branchId,digest:'4'.repeat(64),receipt};
const b = {branchId:source.branchId,digest:'5'.repeat(64),predecessorDigest:a.digest,
  receipt:{...receipt,sourceCheckpoint:run,direct:{...run,tick:9},chunked:{...run,tick:9}}};
const shelf:ReplayReceiptShelf = [a,b];

describe('linked local replay receipt controls', () => {
  it('sends the exact retained frame to existing replay instead of the differently encoded current view',()=>{
    const frame=timeline.branches[0].snapshots[0].world;
    const current={world,branchId:'main',scopeKey:'view-epoch:main:live',busy:false};
    expect(encodeWorldSave(current.world)).not.toBe(encodeWorldSave(frame));
    const proof=resolveReplayVerificationSource(timeline,current,null);
    expect(proof?.world).toBe(frame);
    expect(proof?.scopeKey).toBe(current.scopeKey);
    expect(sameReplayVerificationSource({...current,sessionEpoch:1},{...current,sessionEpoch:2})).toBe(false);
    expect(resolveReplayVerificationSource(timeline,{...current,world:createInitialWorld(999)},null)).toBeUndefined();
    expect(resolveReplayVerificationSource(timeline,{...current,branchId:'branch-1'},null)).toBeUndefined();
    const duplicate={...timeline,branches:[{...timeline.branches[0],snapshots:[...timeline.branches[0].snapshots,
      timeline.branches[0].snapshots[0]]}]};
    expect(resolveReplayVerificationSource(duplicate,current,null)).toBeUndefined();
    expect(resolveReplayVerificationSource(timeline,current,world.tick+1)).toBeUndefined();
  });

  it('shelves verified current results only, without automatically selecting either receipt', () => {
    const onKeep = vi.fn();
    expect(renderToStaticMarkup(<LinkedReplayReceiptRead timeline={timeline} source={source} shelf={[]} onKeep={onKeep}
      outcome={{status:'unavailable',reason:'source'}} />)).toBe('');
    const html = renderToStaticMarkup(<LinkedReplayReceiptRead timeline={timeline} source={source} shelf={shelf} onKeep={onKeep}
      outcome={{status:'verified',receipt}} />);
    expect(html).toContain('留作回执');
    expect(html).toContain('回执 1 · 第 1 至 5 月');
    expect(html).toContain('回执 2 · 第 5 至 9 月');
    expect(html).toMatch(/<button[^>]+disabled="">核对衔接<\/button>/);
    expect(html).not.toContain(source.branchId);
    expect(html).not.toContain(source.scopeKey);
    expect(html).not.toContain(a.digest);
    expect(html).not.toContain(receipt.ruleVersion);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it('requires two deliberate different ordinals and retains their chosen order', () => {
    expect(replayReceiptOrdinals(shelf,'','2')).toBeUndefined();
    expect(replayReceiptOrdinals(shelf,'1','1')).toBeUndefined();
    expect(replayReceiptOrdinals(shelf,'1','3')).toBeUndefined();
    expect(replayReceiptOrdinals(shelf,'01','2')).toBeUndefined();
    expect(replayReceiptOrdinals([a,a],'1','2')).toBeUndefined();
    expect(replayReceiptOrdinals(shelf,'2','1')).toEqual([b,a]);
  });

  it('drops deferred completions after invalidation, including newer operations', async () => {
    const guard = replayReceiptFreshness();
    const first = guard.begin();
    const installed = vi.fn();
    let finish!:()=>void;
    const task = new Promise<void>((resolve)=>{finish=resolve;}).then(()=>{ if(first()) installed(); });
    guard.invalidate();
    const second = guard.begin();
    finish();
    await task;
    expect(installed).not.toHaveBeenCalled();
    expect(second()).toBe(true);
    guard.invalidate();
    expect(second()).toBe(false);
  });

  it('distinguishes aged-out original, unknown rules, and broken linkage without private metadata', () => {
    expect(linkedReplayMessage({status:'linked',startTick:1,junctionTick:5,endTick:9})).toContain('第 5 月相接');
    expect(linkedReplayMessage({status:'unavailable',reason:'snapshot_lost'})).toContain('未留存或尚未走到');
    expect(linkedReplayMessage({status:'unavailable',reason:'rule_build'})).toContain('未得出结论');
    expect(linkedReplayMessage({status:'mismatch',reason:'predecessor'})).toContain('未按所选先后相接');
  });
});
