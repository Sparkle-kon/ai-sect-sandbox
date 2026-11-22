import {describe,expect,it} from 'vitest';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';
import {activeAvatar,queueAvatarWaterVein} from '../src/engine/avatarEngine';
import {findNorthGateRenewalSource} from '../src/engine/northGateRenewalTerms';
import {createTimeline,forkTimelineAvatarEntry,readTimelineHead,recordTimelineWorld} from '../src/engine/timelineEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {availableWaterVeinActions} from '../src/engine/waterVeinEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'复验已有历史。'};
const step=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive).map(row=>[row.id,rest])),
  undefined,'utility');

describe('visit the same historic well, not the retained past',()=>{
  it('enters a real local witness, pays a native survey on the next month, and never mutates the source branch',()=>{
    const {world,actorId,charterId}=prepareNorthWellHistoricalSource();
    const first=encodeEraWorldSave(world),original=createTimeline(world);
    const anchor=original.branches[0].snapshots[0],preserved=encodeEraWorldSave(anchor.world);
    const facts=findNorthGateRenewalSource(anchor.world);
    expect(facts).toMatchObject({charterId,wellProjectId:'village-work-1',openingId:'water-gate-8',
      freightId:'village-supply-1',freightClosedTick:34,passageTileId:'tile-13-2'});
    const where={siteId:'loc-vein-north',viewerId:actorId,actorId};
    expect(()=>forkTimelineAvatarEntry(original,'main',34,{...anchor},where)).toThrow(expect.objectContaining({code:'missing_snapshot'}));
    const forked=forkTimelineAvatarEntry(original,'main',34,anchor,where,'异时复访夹具');
    const live=readTimelineHead(forked)!;
    const host=activeAvatar(live)!;
    expect(host).toMatchObject({id:actorId,locationId:'loc-vein-north'});
    const wallet=host.spiritStones;
    const quote=availableWaterVeinActions(host,live,live.tick+1).find(row=>row.waterVeinMove==='observe')!;
    expect(queueAvatarWaterVein(live,actorId,quote)).toBe(true);
    expect(host.spiritStones).toBe(wallet);
    const next=step(live),receipt=next.coldWaterVein?.observations.find(row=>row.actorId===actorId&&row.tick===35);
    expect(receipt).toMatchObject({tick:35,paidStones:2,wellDepth:24});
    expect(next.cultivators.find(row=>row.id===actorId)?.spiritStones).toBe(wallet-2);
    expect(next.resourceFlow.months.find(row=>row.tick===35)?.entries).toContainEqual(expect.objectContaining({
      kind:'consumption',good:'stone',amount:2,refId:receipt?.id,from:{kind:'actor',id:actorId},
    }));
    expect(next.playerAvatar.pendingOrder).toBeUndefined();
    expect(findNorthGateRenewalSource(next)).toEqual(facts);
    const recorded=recordTimelineWorld(forked,next);
    expect(recorded.branches[0]).toBe(original.branches[0]);
    expect(recorded.branches.find(row=>row.id===recorded.activeBranchId)?.snapshots.at(-1)?.tick).toBe(35);
    expect(encodeEraWorldSave(original.branches[0].snapshots[0].world)).toBe(preserved);
    expect(encodeEraWorldSave(world)).toBe(first);
    expect(encodeEraWorldSave(step(decodeEraWorldSave(encodeEraWorldSave(next)))))
      .toBe(encodeEraWorldSave(step(next)));
  });
});
