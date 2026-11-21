import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {activeAvatar,queueAvatarOrder} from '../src/engine/avatarEngine';
import {createCampaignCheckpoint} from '../src/engine/fastForwardCampaignEngine';
import {prepareEraCheckpoint,verifyEraCheckpoint} from '../src/engine/eraCheckpointEngine';
import {projectEraEntryCandidates} from '../src/engine/eraEntryCandidates';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {createTimeline,forkTimelineAvatarEntry,forkTimelineCampaignCheckpoint,readTimelineHead,recordTimelineWorld,selectTimelineBranch}
  from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';

const step=(world:WorldState)=>advanceWorldTick(world,undefined,undefined,'utility');
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const importable=(part:{bytes:Uint8Array})=>({size:part.bytes.byteLength,async arrayBuffer(){return part.bytes.slice().buffer;}});
describe('portable long-world workflow, short native regression',()=>{
  it('isolates an entered branch, saves a queued lawful choice, and replays one month on both restored branches',async()=>{
    const source=createInitialWorld(2031),base=createTimeline(source);
    const months=3,from=createCampaignCheckpoint(source,months);
    let world=source;
    for(let i=0;i<months;i++)world=step(world);
    const timeline=forkTimelineCampaignCheckpoint(base,'main',source.tick,{...from,completedTicks:months,world});
    const passiveId=timeline.activeBranchId, passive=readTimelineHead(timeline)!;
    const passiveNext=step(passive),passiveActions=new Map(passiveNext.cultivators.map(actor=>[actor.id,actor.currentAction]));
    const host=passive.cultivators.find(actor=>passiveActions.get(actor.id)!=='REST'&&
      projectEraEntryCandidates(passive,actor.locationId,actor.id).some(card=>card.actorId===actor.id&&card.decision.kind==='rest_or_cultivate'))!;
    expect(host).toBeDefined();
    const frame=timeline.branches.find(branch=>branch.id===passiveId)!.snapshots.at(-1)!;
    const entered=forkTimelineAvatarEntry(timeline,passiveId,passive.tick,frame,
      {actorId:host.id,siteId:host.locationId,viewerId:host.id});
    const enteredId=entered.activeBranchId, candidate=readTimelineHead(entered)!;
    expect(activeAvatar(candidate)?.id).toBe(host.id);
    expect(queueAvatarOrder(candidate,'REST')).toBe(true);
    const ready=recordTimelineWorld(entered,candidate);
    const enteredWorld=readTimelineHead(ready)!;
    const enteredNext=step(enteredWorld);
    expect(enteredNext.cultivators.find(actor=>actor.id===host.id)?.currentAction).toBe('REST');
    expect(enteredNext.playerAvatar.pendingOrder).toBeUndefined();
    expect(passiveActions.get(host.id)).not.toBe('REST');
    expect(encodeEraWorldSave(readTimelineHead(selectTimelineBranch(ready,passiveId))!)).toBe(encodeEraWorldSave(passive));
    expect(ready.branches[0]).toBe(base.branches[0]);
    for(const {branchId,world,next} of [{branchId:passiveId,world:passive,next:passiveNext},
      {branchId:enteredId,world:enteredWorld,next:enteredNext}]){
      const pack=await prepareEraCheckpoint(world,{branchId,timelineId:'short-acceptance'},codec,{engineRuleVersion:'a'.repeat(64)});
      const loaded=await verifyEraCheckpoint(importable(pack.manifestFile),pack.parts.map(importable).reverse(),codec);
      expect(loaded.manifest.source.branchId).toBe(branchId);
      expect(encodeEraWorldSave(loaded.world)).toBe(encodeEraWorldSave(world));
      expect(encodeEraWorldSave(step(loaded.world))).toBe(encodeEraWorldSave(next));
    }
  });
});
