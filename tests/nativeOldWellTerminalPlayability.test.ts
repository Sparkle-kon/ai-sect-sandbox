import {expect,it} from 'vitest';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';
import {activeAvatar,AVATAR_ORDER_COST,AVATAR_POSSESSION_COST,queueAvatarWaterVein} from '../src/engine/avatarEngine';
import {findEraEntryCandidate} from '../src/engine/eraEntryCandidates';
import {projectNorthMiningCharters} from '../src/engine/northMiningCharterEngine';
import {findNorthGateRenewalSource} from '../src/engine/northGateRenewalTerms';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {createTimeline,forkTimelineAvatarEntry,readTimelineHead,recordTimelineWorld} from '../src/engine/timelineEngine';
import {availableWaterVeinActions,projectWaterVein} from '../src/engine/waterVeinEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const who='elder-danxia-1',site='loc-vein-north';
function step(world:WorldState){
  const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'料定此月不另行勘井。'};
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive).map(row=>[row.id,idle])),()=>.99,'utility');
}
it('binds the current body to the original source-world institution and charges only the played child when time advances',()=>{
  // Ordinary T34 historical fixture; the standalone verifier tests the actual unchanged T120034 archive.
  const source=prepareNorthWellHistoricalSource().world;
  const parentBytes=encodeEraWorldSave(source),owner=source.cultivators.find(row=>row.id===who)!;
  expect(owner.locationId).toBe(site);
  const proof=findNorthGateRenewalSource(source);
  expect(proof).toMatchObject({wellProjectId:'village-work-1',openingId:'water-gate-8',charterId:'north-mining-charter-12',
    passageTick:23,passageTileId:'tile-13-2',freightClosedTick:34});
  expect(projectWaterVein(source,owner)).toMatchObject({scope:'local',siteId:site});
  expect(projectWaterVein(source,{...owner})).toBeUndefined();
  expect(projectNorthMiningCharters(source,owner)?.rows.some(row=>row.id===proof?.charterId&&row.hasVerifiedPassage)).toBe(true);
  expect(projectNorthMiningCharters(source,{...owner})).toBeUndefined();
  const timeline=createTimeline(source),frame=timeline.branches[0].snapshots[0];
  const selected=findEraEntryCandidate(frame.world,site,who,who);
  expect(selected).toMatchObject({actorId:who,origin:{kind:'founder'},decision:{kind:'rest_or_cultivate'}});
  const fork=forkTimelineAvatarEntry(timeline,'main',frame.tick,frame,{siteId:site,viewerId:who,actorId:who});
  const branch=readTimelineHead(fork)!,avatar=activeAvatar(branch)!;
  expect(avatar.id).toBe(who);
  const idle=step(branch),wallet=avatar.spiritStones;
  const quote=availableWaterVeinActions(avatar,branch,branch.tick+1).find(row=>row.waterVeinMove==='observe')!;
  expect(queueAvatarWaterVein(branch,who,quote)).toBe(true);
  expect(branch.playerAvatar.essence).toBe(source.playerAvatar.essence-AVATAR_POSSESSION_COST-AVATAR_ORDER_COST);
  expect(avatar.spiritStones).toBe(wallet);
  expect(branch.tick).toBe(frame.tick);
  const paid=step(branch);
  expect(paid.tick).toBe(source.tick+1);
  expect(activeAvatar(idle)!.spiritStones-activeAvatar(paid)!.spiritStones).toBe(2);
  expect(paid.coldWaterVein?.observations.at(-1)).toMatchObject({actorId:who,paidStones:2,tick:paid.tick});
  expect(findNorthGateRenewalSource(paid)).toEqual(proof);
  const continued=recordTimelineWorld(fork,paid);
  expect(encodeEraWorldSave(readTimelineHead(continued,'main')!)).toBe(parentBytes);
  expect(encodeEraWorldSave(step(decodeEraWorldSave(encodeEraWorldSave(paid))))).toBe(encodeEraWorldSave(step(paid)));
});
