import {describe,it,expect} from 'vitest';
import {prepareEraCheckpoint,verifyEraCheckpoint,type EraOutputFile} from '../src/engine/eraCheckpointEngine';
import {buildNorthWellRevisitAuthor} from '../src/engine/northWellRevisitLaw';
import {appendNorthWellRevisitFork,createTimeline,readTimelineHead} from '../src/engine/timelineEngine';
import {availableNorthWellReviewActions,projectNorthWellRevisit} from '../src/engine/northWellRevisitEngine';
import {availableWaterVeinActions} from '../src/engine/waterVeinEngine';
import {projectEraEntryCandidates} from '../src/engine/eraEntryCandidates';
import {possessAvatar,queueAvatarWaterVein,queueAvatarNorthWellReview} from '../src/engine/avatarEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const REST:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'按在册原件实做。'};
const step=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive&&row.hp>0)
  .map(row=>[row.id,REST])),undefined,'utility');
const nativeCodec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const asInput=({bytes}:EraOutputFile)=>({size:bytes.byteLength,arrayBuffer:async()=>new Uint8Array(bytes).buffer});
async function ownPortable(world:WorldState,branchId:string){
 const packed=await prepareEraCheckpoint(world,{branchId,label:'原生当场演化验收'},nativeCodec,
  {engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
 const verified=await verifyEraCheckpoint(asInput(packed.manifestFile),packed.parts.map(asInput),nativeCodec);
 expect(encodeEraWorldSave(verified.world)).toBe(encodeEraWorldSave(world));
 return verified;
}
const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const gate=(world:WorldState,id:string,move:'observe'|'mine')=>
 availableWaterVeinActions(person(world,id),world,world.tick+1).find(op=>op.waterVeinMove===move)!;

describe('exact 300-year native well and a separately authored precinct limitation',()=>{
  it('rechecks surviving actual bodies, readback, personal charges and a consumed once lawful mine permission',async()=>{
    const source=prepareNorthWellHistoricalSource();
    let dated=(await ownPortable(source.world,'revisit-source')).world;
    expect(dated.tick).toBe(34);
    for(let index=0;index<3600;index++){
      const before=dated;
      dated=step(dated);
      expect(dated.tick).toBe(before.tick+1);
      if(dated.tick===1177||dated.tick===1234||dated.tick===2434) dated=(await ownPortable(dated,'revisit-native')).world;
    }
    expect([dated.tick,dated.year,dated.month]).toEqual([3634,1303,10]);
    const official=await ownPortable(dated,'revisit-natural');
    const original=encodeEraWorldSave(official.world), id=source.actorId;
    expect(person(official.world,id)).toMatchObject({alive:true,age:467,lifespan:500,locationId:'loc-vein-north'});
    expect(projectEraEntryCandidates(official.world,'loc-vein-north',id).find(row=>row.actorId===id)?.decision.kind).toBe('rest_or_cultivate');
    expect(projectNorthWellRevisit(official.world,person(official.world,id))).toMatchObject({wellProjectId:'village-work-1',
      sourceCharterId:source.charterId,oldPassageTick:23,townTick:45,population:105,recentPaidSurvey:false});
    await expect(buildNorthWellRevisitAuthor({...official,manifest:{...official.manifest,payloadSha256:'0'.repeat(64)}},source.charterId))
      .rejects.toThrow(/摘要/);
    const authority=await buildNorthWellRevisitAuthor(official,source.charterId);
    expect(authority.northWellRevisitLaw).toMatchObject({kind:'authored_old_village_restriction',declaredTick:3634,
      retainedPopulation:105,freightClosedTick:34,nativeFrameDigest:official.manifest.payloadSha256});
    const {northWellRevisitLaw,...shared}=authority;
    expect(encodeEraWorldSave(shared)).toBe(original);
    expect(northWellRevisitLaw).toBeDefined();
    const originalTimeline=createTimeline(official.world);
    const inspected=originalTimeline.branches[0].snapshots[0];
    const altered=structuredClone(authority);
    altered.settlements.villages.find(row=>row.id==='village-loc-vein-north')!.population--;
    expect(()=>appendNorthWellRevisitFork(originalTimeline,'main',inspected,altered)).toThrow();
    const playing=appendNorthWellRevisitFork(originalTimeline,'main',inspected,authority);
    expect(playing.branches[1]).toMatchObject({parentBranchId:'main',forkTick:3634});
    expect(encodeEraWorldSave(readTimelineHead(playing,'main')!)).toBe(original);
    expect(encodeEraWorldSave(readTimelineHead(playing)!)).toBe(encodeEraWorldSave(authority));
    const denied=availableWaterVeinActions(person(authority,id),authority,authority.tick+1);
    expect(denied.map(row=>row.waterVeinMove)).toEqual(['observe']);
    expect(gate(official.world,id,'mine')).toBeDefined();
    const naturalStart=structuredClone(official.world);
    const newLaw=await ownPortable(authority,'revisit-author');
    const originalStones=person(naturalStart,id).spiritStones;
    for(const branch of [naturalStart,newLaw.world]){
      expect(possessAvatar(branch,id)).toBe(true);
      expect(queueAvatarWaterVein(branch,id,gate(branch,id,'observe'))).toBe(true);
    }
    let natural=step(naturalStart);
    let writer=step(newLaw.world);
    expect([natural.tick,writer.tick]).toEqual([3635,3635]);
    for(const branch of [natural,writer]){
      expect(person(branch,id).spiritStones).toBe(originalStones-2);
      expect(branch.coldWaterVein?.observations.at(-1)).toMatchObject({actorId:id,tick:3635,wellDepth:24,paidStones:2});
    }
    const decision=(branch:WorldState,move:'keep'|'permit')=>
      availableNorthWellReviewActions(person(branch,id),branch,branch.tick+1).find(row=>row.northWellReviewMove===move)!;
    expect(decision(natural,'permit')).toBeUndefined();
    expect(queueAvatarNorthWellReview(natural,id,decision(natural,'keep'))).toBe(true);
    expect(queueAvatarNorthWellReview(writer,id,decision(writer,'permit'))).toBe(true);
    expect(person(writer,id).spiritStones).toBe(originalStones-2);
    natural=step(natural);writer=step(writer);
    expect([natural.tick,writer.tick]).toEqual([3636,3636]);
    expect([person(natural,id).spiritStones,person(writer,id).spiritStones]).toEqual([originalStones-6,originalStones-6]);
    expect(natural.northWellRevisitReviews?.decisions[0]).toMatchObject({move:'keep',freightClosedTick:34,paidStones:4});
    expect(writer.northWellRevisitReviews?.decisions[0]).toMatchObject({move:'permit',freightClosedTick:34,paidStones:4,
      permit:{validFromTick:3637,expiresTick:3640}});
    expect(availableWaterVeinActions(person(writer,'elder-danxia-2'),writer,writer.tick+1).map(row=>row.waterVeinMove)).toEqual(['observe']);
    expect(queueAvatarWaterVein(writer,id,gate(writer,id,'mine'))).toBe(true);
    writer=step(writer);natural=step(natural);
    expect(writer.northWellRevisitReviews?.decisions[0].permit).toMatchObject({spentTick:3637,miningReceiptId:`water-mine-3637-${id}`});
    expect(writer.coldWaterVein?.mining.at(-1)).toMatchObject({tick:3637,units:2,actorId:id});
    expect(availableWaterVeinActions(person(writer,id),writer,writer.tick+1).map(row=>row.waterVeinMove)).toEqual(['observe']);
    expect(encodeEraWorldSave(official.world)).toBe(original);
    expect((await ownPortable(natural,'revisit-natural-played')).world.tick).toBe(3637);
    expect((await ownPortable(writer,'revisit-author-played')).world.tick).toBe(3637);
  },120_000);
});
