import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {compareBranchFate} from '../src/engine/branchFateComparison';
import {createFastForwardRunner} from '../src/engine/fastForwardEngine';
import {createTimeline,forkTimeline,forkTimelineCheckpoint,readTimelineHead,recordTimelineWorld,selectTimelineBranch,
  type WorldTimeline} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';

function trueBestowSiblings(){
  const source=createInitialWorld(2031,'classic'),original=createTimeline(source);
  const actorId='npc-2',siteId='loc-vein-north';
  const form=source.cultivators.find(row=>row.id===actorId)!;
  expect(form).toMatchObject({locationId:siteId,qiProgress:82,realm:'金丹',realmStage:7});
  const run=createFastForwardRunner(source,1,{now:()=>0});run.advanceChunk();
  const controlBranch=forkTimelineCheckpoint(original,'main',source.tick,run.checkpoint()!,'无干预对照');
  const left=controlBranch.activeBranchId;
  const exactSource=selectTimelineBranch(controlBranch,'main');
  const gift=forkTimeline(exactSource,source.tick,{type:'SPAWN_TREASURE',targetLocationId:siteId},'真实赐宝');
  const right=gift.activeBranchId,afterGift=readTimelineHead(gift)!;
  const monthly=advanceWorldTick(afterGift,undefined,undefined,'utility');
  const timeline=recordTimelineWorld(gift,monthly);
  return {timeline,source,left,right,actorId,monthly};
}

describe('same-origin one stable subject, first proved fate change',()=>{
  it('uses the unmodified seeded native 2031 siblings, one actual bestow and subsequent actual breakthrough without claiming sole cause',()=>{
    const {timeline,source,left,right,actorId,monthly}=trueBestowSiblings();
    const baseline=JSON.stringify(timeline);
    expect(readTimelineHead(timeline,left)!.cultivators.find(row=>row.id===actorId)).toMatchObject({realm:'金丹',realmStage:7,currentAction:'EXPLORE'});
    expect(monthly.cultivators.find(row=>row.id===actorId)).toMatchObject({realm:'金丹',realmStage:8,currentAction:'BREAKTHROUGH'});
    const read=compareBranchFate(timeline,left,right,monthly.tick,{kind:'actor',id:actorId},actorId);
    expect(read).toMatchObject({ok:true,originTick:source.tick,throughTick:monthly.tick,coverage:'complete',
      firstDifference:{kind:'bestow',tick:1,right:{side:'right',kind:'bestow',tick:1,eventId:'evt-god-treasure-1-1'}},
      consequence:{side:'right',tick:2,eventId:'evt-2-npc-2-break',kind:'realm',fromRealm:'金丹',fromStage:7,toRealm:'金丹',toStage:8},remoteCause:'unknown'});
    expect(JSON.stringify(read)).not.toContain('evt-2-npc-2-explore');
    expect(JSON.stringify(timeline)).toBe(baseline);
  });

  it('requires actual topology and exact common branch state rather than same date and seed',()=>{
    const {timeline,left,right,actorId,monthly}=trueBestowSiblings();
    const unlinked:WorldTimeline={...timeline,branches:timeline.branches.map(branch=>branch.id===right?{...branch,parentBranchId:'not-existing'}:branch)};
    expect(compareBranchFate(unlinked,left,right,monthly.tick,{kind:'actor',id:actorId},actorId)).toEqual({ok:false,reason:'unknown_origin'});
    const altered=structuredClone(timeline);
    const head=altered.branches.find(row=>row.id===right)!.snapshots[0].world;
    head.cultivators.find(row=>row.id===actorId)!.spiritStones++;
    expect(compareBranchFate(altered,left,right,monthly.tick,{kind:'actor',id:actorId},actorId)).toEqual({ok:false,reason:'unknown_origin'});
  });

  it('compares canonical state rather than JSON key order, and scopes the direct intervention itself',()=>{
    const {timeline,left,right,actorId,monthly}=trueBestowSiblings();
    const portable=structuredClone(timeline);
    const branch=portable.branches.find(row=>row.id===right)!;
    const changed=branch.snapshots[0].world;
    const state=changed.random.state;
    changed.random={state,seed:changed.random.seed,algorithm:changed.random.algorithm};
    expect(compareBranchFate(portable,left,right,monthly.tick,{kind:'actor',id:actorId},actorId)).toMatchObject({
      ok:true,firstDifference:{kind:'bestow'}});
    const phase=structuredClone(portable);
    const gift=phase.branches.find(row=>row.id===right)!.snapshots[0].world.events.find(row=>row.id==='evt-god-treasure-1-1')!;
    gift.witnessScope='participants';
    expect(compareBranchFate(phase,left,right,monthly.tick,{kind:'actor',id:actorId},actorId)).toEqual({
      ok:false,reason:'unknown_origin'});
  });

  it('does not substitute a hidden, ambiguous or unrelated event as the future consequence',()=>{
    const {timeline,left,right,actorId,monthly}=trueBestowSiblings();
    const query={kind:'actor' as const,id:actorId};
    const sameName=structuredClone(timeline);
    const raw=sameName.branches.find(row=>row.id===right)!.snapshots.at(-1)!.world.events.find(row=>row.id==='evt-2-npc-2-break')!;
    raw.witnessScope='participants';
    const result=compareBranchFate(sameName,left,right,monthly.tick,query,actorId);
    expect(result).toMatchObject({ok:true,firstDifference:{kind:'bestow'},remoteCause:'unknown'});
    expect(result).not.toHaveProperty('consequence');
    expect(JSON.stringify(result)).not.toContain(raw.description);
    const hiddenPlace=structuredClone(timeline);
    const secret=hiddenPlace.branches.find(row=>row.id===right)!.snapshots.at(-1)!.world.events.find(row=>row.id==='evt-2-npc-2-break')!;
    secret.locationId='loc-secret-1';
    expect(compareBranchFate(hiddenPlace,left,right,monthly.tick,query,actorId)).not.toHaveProperty('consequence');
    expect(compareBranchFate(timeline,left,right,monthly.tick,query,'not-a-real-viewer')).toEqual({ok:false,reason:'subject_unavailable'});
  });
});
