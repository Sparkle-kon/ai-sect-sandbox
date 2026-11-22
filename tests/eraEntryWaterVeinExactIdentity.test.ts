import {expect,it} from 'vitest';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';
import {activeAvatar,queueAvatarWaterVein} from '../src/engine/avatarEngine';
import {projectEraEntryCandidates} from '../src/engine/eraEntryCandidates';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {createTimeline,forkTimelineAvatarEntry,readTimelineHead} from '../src/engine/timelineEngine';
import {availableWaterVeinActions} from '../src/engine/waterVeinEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const wen='elder-danxia-1', rival='npc-6', well='loc-vein-north';
const actor=(world:WorldState,id=wen)=>world.cultivators.find(row=>row.id===id)!;

it('does not turn a same-named native candidate into the body authorized for the already-quoted well action',()=>{
  const natural=prepareNorthWellHistoricalSource().world;
  const untouched=encodeEraWorldSave(natural);
  const fixture=structuredClone(natural);
  const another=actor(fixture,rival);
  expect(another.id).not.toBe(wen);
  expect(another.locationId).toBe(well);
  expect(another.alive).toBe(true);
  expect(another.name).not.toBe(actor(fixture).name);
  another.name=actor(fixture).name; // Isolated synthetic display-label collision; no identity, date or physical state edits.
  const timeline=createTimeline(decodeEraWorldSave(encodeEraWorldSave(fixture)));
  const frame=timeline.branches[0].snapshots[0];
  const origin=encodeEraWorldSave(frame.world);
  const identities=projectEraEntryCandidates(frame.world,well,wen).filter(row=>row.name===another.name);
  expect(identities.map(row=>row.actorId)).toEqual([wen,rival]);
  const selection={siteId:well,viewerId:wen,actorId:wen};
  const fork=forkTimelineAvatarEntry(timeline,'main',frame.tick,frame,selection);
  const sameNameOthersFork=forkTimelineAvatarEntry(timeline,'main',frame.tick,frame,{...selection,actorId:rival});
  const embodied=readTimelineHead(fork)!;
  expect(activeAvatar(embodied)?.id).toBe(wen);
  expect(activeAvatar(readTimelineHead(sameNameOthersFork)!)?.id).toBe(rival);
  const quote=availableWaterVeinActions(actor(embodied),embodied,embodied.tick+1)
    .find(row=>row.waterVeinMove==='observe')!;
  const unchanged=encodeEraWorldSave(embodied);
  expect(queueAvatarWaterVein(embodied,rival,quote)).toBe(false);
  expect(encodeEraWorldSave(embodied)).toBe(unchanged);
  const before=actor(embodied).spiritStones;
  expect(queueAvatarWaterVein(embodied,wen,quote)).toBe(true);
  expect(actor(embodied).spiritStones).toBe(before);
  const queued=encodeEraWorldSave(embodied);
  for(const mode of ['utility','deferred'] as const){
    const input=decodeEraWorldSave(queued);
    const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'不自作另一决定。'};
    const provided=Object.fromEntries(input.cultivators.filter(row=>row.alive).map(row=>[row.id,idle]));
    const after=advanceWorldTick(input,provided,()=>.99,mode);
    expect(after.tick).toBe(frame.tick+1);
    expect(after.playerAvatar.pendingOrder).toBeUndefined();
    expect(after.coldWaterVein?.observations.at(-1)).toMatchObject({actorId:wen,tick:after.tick,paidStones:2});
    expect(actor(after).spiritStones).toBe(before-2);
    expect(actor(after,rival).spiritStones).toBe(actor(embodied,rival).spiritStones);
  }
  expect(encodeEraWorldSave(frame.world)).toBe(origin);
  expect(encodeEraWorldSave(natural)).toBe(untouched);
});
