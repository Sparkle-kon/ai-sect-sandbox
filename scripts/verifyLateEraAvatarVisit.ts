import {activeAvatar,AVATAR_ORDER_COST,AVATAR_POSSESSION_COST,queueAvatarWaterVein} from '../src/engine/avatarEngine';
import {findEraEntryCandidate,projectEraEntryCandidates} from '../src/engine/eraEntryCandidates';
import {ERA_CHECKPOINT_MANIFEST_BYTES,ERA_CHECKPOINT_NATIVE_JSON_BYTES,prepareEraCheckpoint,verifyEraCheckpoint,type EraInput} from '../src/engine/eraCheckpointEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {createTimeline,forkTimelineAvatarEntry,readTimelineHead,recordTimelineWorld,TimelineError} from '../src/engine/timelineEngine';
import {availableWaterVeinActions,completedNorthWaterWell,northWaterAddress} from '../src/engine/waterVeinEngine';
import {WATER_VEIN_SITE,WATER_VEIN_SURVEY_STONES} from '../src/engine/waterVeinTerms';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {join,mkdir,open,readFile,stat} from './centuryNodeRuntime';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const node='node:process',crypto='node:crypto';
const proc=(await import(node) as {default:{argv:string[];version:string}}).default;
const {webcrypto}=await import(crypto) as {webcrypto:Crypto};
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const [out,nativeStem,identityStem,...extra]=proc.argv.slice(2);
function check(value:unknown,label:string):asserts value{if(!value)throw new Error(label);}
check(out&&nativeStem&&identityStem&&!extra.length&&[nativeStem,identityStem].every(stem=>!stem.endsWith('.json')&&!stem.endsWith('.era')),
  'Usage: vite-node scripts/verifyLateEraAvatarVisit.ts <fresh output dir> <exact native T72034 pair stem> <exact native T34 pair stem>');
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const text=(bytes:Uint8Array)=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const eq=(a:Uint8Array,b:Uint8Array)=>a.byteLength===b.byteLength&&a.every((byte,i)=>byte===b[i]);
const eraInput=(bytes:Uint8Array):EraInput=>({size:bytes.byteLength,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
async function bounded(path:string,max:number){
  const info=await stat(path) as {size:number;isFile():boolean};
  check(info.isFile()&&info.size>0&&info.size<=max,'Input size out of bounds');
  const bytes=await readFile(path);check(bytes.byteLength===info.size,'Input changed while being read');return bytes;
}
const pair=(stem:string)=>Promise.all([bounded(stem+'.era',ERA_CHECKPOINT_MANIFEST_BYTES),bounded(stem+'.json',ERA_CHECKPOINT_NATIVE_JSON_BYTES)]);
async function load(stem:string,expected:{tick:number;year:number;sha:string;bytes:number}){
  const bytes=await pair(stem);
  const loaded=await verifyEraCheckpoint(eraInput(bytes[0]),[eraInput(bytes[1])],codec);
  const {world,manifest}=loaded;
  check(world.tick===expected.tick&&world.year===expected.year&&world.month===10&&world.random.seed===1&&
    world.worldgen?.profileId==='spirit-bloom'&&!world.regionalSimulation&&!world.authoredEraOrigin&&!world.scenarioOrigin&&
    manifest.payloadSha256===expected.sha&&manifest.payloadBytes===expected.bytes&&encodeEraWorldSave(world)===text(bytes[1]),
    'Wrong physical source, variant or normalization');
  return {...loaded,raw:text(bytes[1]),verify:async()=>{
    const final=await pair(stem);check(bytes.every((value,i)=>eq(value,final[i])),'Source bytes changed');
  }};
}
const late=await load(nativeStem,{tick:72034,year:7003,sha:'aa9fa4eeeb908c36f10923cfe907e1631abd09d2c08715929edff9b1ce903b17',bytes:781881});
const early=await load(identityStem,{tick:34,year:1003,sha:'04f059902d6e2edae8cb1e44db27c880636cc64ed8f277baf1c7cba7ee1725c4',bytes:278888});
const W='elder-danxia-1', other='npc-6', site=WATER_VEIN_SITE;
const actor=(world:WorldState,id=W)=>{
  const person=world.cultivators.find(row=>row.id===id);
  check(person,'Missing exact actor '+id);return person;
};
const wallet=(world:WorldState)=>actor(world).spiritStones;
const isQueuedSurvey=(world:WorldState)=>{
  const pending=world.playerAvatar.pendingOrder;
  return pending?.actorId===W&&pending.queuedTick===world.tick&&pending.action==='WATER_VEIN'&&
    pending.waterVeinMove==='observe'&&pending.targetLocationId===site;
};
const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'同一原生月份，无额外预约，先在原处静候。'};
const step=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive&&row.hp>0).map(row=>[row.id,idle])),
  undefined,'utility');
const failure=(run:()=>unknown,code:'invalid_avatar_entry'|'missing_snapshot')=>{
  try{run();}catch(error){return error instanceof TimelineError&&error.code===code;}
  return false;
};

const well=northWaterAddress(late.world);
const tile=well&&terrainTileAt(late.world,well.site.x,well.site.y);
const originalWell=well&&completedNorthWaterWell(late.world,well.village.id);
const hearing=late.world.northGateRenewal?.hearing;
const originalCold=late.world.coldWaterVein;
const oldOpening=originalCold?.openings.find(row=>row.id==='water-gate-8');
const charter=late.world.northMiningCharters?.charters.find(row=>row.id==='north-mining-charter-12');
const freight=late.world.villageSupply.agreements.find(row=>row.id===charter?.firstPassage?.agreementId);
check(well&&tile?.id==='tile-12-2'&&originalWell?.id==='village-work-1'&&originalWell.settledTick===5&&
  hearing?.outcome?.kind==='failed'&&hearing.outcome.closedTick===36040&&oldOpening?.completedTick===14&&
  charter?.firstPassage?.tick===23&&charter.firstPassage.tileId==='tile-13-2'&&freight?.closedTick===34&&freight.status==='completed',
  'Original well, historic cargo/charter or closed hearing missing');
const wen=actor(late.world);
check(late.world.cultivators.filter(row=>row.alive&&row.hp>0).length===1&&wen.alive&&wen.hp>0&&wen.name==='闻春岚'&&
  wen.locationId===site&&wen.positionPlane===undefined&&wallet(late.world)===488,'Wrong original locally playable living body');
check(late.world.cultivators.filter(row=>row.name===wen.name).length===1&&!actor(late.world,other).alive&&actor(late.world,other).locationId===site,
  'Unexpected natural identity fixture');
const timeline=createTimeline(late.world),original=timeline.branches[0],frame=original.snapshots[0];
const candidate=findEraEntryCandidate(frame.world,site,W,W);
check(candidate?.actorId===W&&candidate.decision.kind==='rest_or_cultivate'&&candidate.origin.kind==='founder','Exact native protagonist body not eligible to enter');
const initialEssence=frame.world.playerAvatar.essence;
const selection={siteId:site,viewerId:W,actorId:W};
check(failure(()=>forkTimelineAvatarEntry(timeline,original.id,frame.tick,frame,{...selection,actorId:other}),'invalid_avatar_entry')&&
  failure(()=>forkTimelineAvatarEntry(timeline,original.id,frame.tick,frame,{...selection,actorId:wen.name}),'invalid_avatar_entry')&&
  failure(()=>forkTimelineAvatarEntry(timeline,original.id,frame.tick,structuredClone(frame),selection),'missing_snapshot')&&
  encodeEraWorldSave(frame.world)===late.raw&&frame.world.playerAvatar.essence===initialEssence,
  'Rejected deceased, name-only or copied-frame selection changed the original');
const newTimeline=forkTimelineAvatarEntry(timeline,original.id,frame.tick,frame,selection,'六千年：闻春岚亲临寒玉井');
const playedId=newTimeline.activeBranchId;
const playable=readTimelineHead(newTimeline,playedId);
check(playable&&playedId!==original.id&&newTimeline.branches[0]===original&&newTimeline.branches[1].parentBranchId===original.id&&
  playable.tick===72034&&activeAvatar(playable)?.id===W&&playable.playerAvatar.essence===initialEssence-AVATAR_POSSESSION_COST&&
  !playable.playerAvatar.pendingOrder&&wallet(playable)===wallet(late.world),'Entry did not acquire the correct original body/fee');
const idleWorld=step(playable);
const choices=availableWaterVeinActions(actor(playable),playable,playable.tick+1);
const quote=choices.find(row=>row.waterVeinMove==='observe'&&row.targetLocationId===site);
const before=encodeEraWorldSave(playable);
check(quote&&!choices.some(row=>row.waterVeinMove==='open')&&!queueAvatarWaterVein(playable,other,quote)&&
  encodeEraWorldSave(playable)===before&&queueAvatarWaterVein(playable,W,quote),'Wrong body/precondition or lawful observe quote missing');
check(playable.playerAvatar.essence===initialEssence-AVATAR_POSSESSION_COST-AVATAR_ORDER_COST&&playable.tick===frame.tick&&
  wallet(playable)===wallet(frame.world)&&JSON.stringify(playable.coldWaterVein)===JSON.stringify(frame.world.coldWaterVein)&&
  isQueuedSurvey(playable),'Queue moved time, wallet or water ledger before execution');
const queued=encodeEraWorldSave(playable);
check(!queueAvatarWaterVein(playable,W,quote)&&queued===encodeEraWorldSave(playable),'Duplicate queue charged or changed intent');
const ended=step(playable);
check(ended.tick===72035&&ended.year===7003&&ended.month===11&&ended.tick===idleWorld.tick&&
  activeAvatar(ended)?.id===W&&actor(ended).currentAction==='WATER_VEIN'&&!ended.playerAvatar.pendingOrder&&
  actor(ended).locationId===site&&actor(ended).positionPlane===undefined,'Native ordered month did not apply to the exact lower resident');
const observation=ended.coldWaterVein?.observations.find(row=>row.actorId===W&&row.tick===ended.tick);
const event=ended.events.find(row=>row.id===`evt-${observation?.id}`);
check(observation?.paidStones===WATER_VEIN_SURVEY_STONES&&observation.wellDepth===24&&
  event?.locationId===site&&event.tick===72035&&event.actorIds.length===1&&event.actorIds[0]===W&&
  !idleWorld.coldWaterVein?.observations.some(row=>row.actorId===W&&row.tick===idleWorld.tick),
  'Native dated survey, participating local receipt or same-age control missing');
const fees=ended.resourceFlow.months.find(row=>row.tick===ended.tick)?.entries.filter(row=>row.refId===observation.id)??[];
const fee=fees[0];
check(fees.length===1&&fee.kind==='consumption'&&fee.mechanism==='water_vein'&&fee.reason==='north_well_measured'&&
  fee.from.kind==='actor'&&fee.from.id===W&&fee.good==='stone'&&fee.amount===WATER_VEIN_SURVEY_STONES&&
  wallet(idleWorld)-wallet(ended)===WATER_VEIN_SURVEY_STONES&&
  JSON.stringify(ended.coldWaterVein?.openings)===JSON.stringify(idleWorld.coldWaterVein?.openings)&&
  JSON.stringify(ended.northGateRenewal)===JSON.stringify(idleWorld.northGateRenewal),
  'Survey did not make exact one personal debit, or touched old debt/renewal');
const recorded=recordTimelineWorld(newTimeline,ended,playedId);
check(recorded.branches[0]===original&&encodeEraWorldSave(readTimelineHead(recorded,original.id)!)===late.raw&&
  readTimelineHead(recorded,playedId)?.tick===72035&&encodeEraWorldSave(frame.world)===late.raw,
  'Parent branch changed or exact child head missing');

const aliasWorld=structuredClone(early.world);
const originalName=actor(aliasWorld,other).name;
check(actor(aliasWorld).alive&&actor(aliasWorld,other).alive&&actor(aliasWorld,other).locationId===site&&actor(aliasWorld).locationId===site&&
  originalName!==actor(aliasWorld).name,'Two actual independent local early identities unavailable');
actor(aliasWorld,other).name=actor(aliasWorld).name; // Only display text changes, only in this explicitly synthetic identity control.
const aliasSave=encodeEraWorldSave(aliasWorld);
actor(aliasWorld,other).name=originalName;
check(encodeEraWorldSave(aliasWorld)===early.raw,'Alias control changed a field other than display name');
const aliasReadback=decodeEraWorldSave(aliasSave),aliasTimeline=createTimeline(aliasReadback),aliasOriginal=aliasTimeline.branches[0];
const aliasFrame=aliasOriginal.snapshots[0];
const labels=projectEraEntryCandidates(aliasFrame.world,site,W).filter(row=>row.name===wen.name);
check(labels.length===2&&labels.some(row=>row.actorId===W&&row.decision.kind==='rest_or_cultivate')&&
  labels.some(row=>row.actorId===other&&row.decision.kind==='rest_or_cultivate'),'Same name collapsed candidate IDs');
const aliasEntry=readTimelineHead(forkTimelineAvatarEntry(aliasTimeline,aliasOriginal.id,aliasFrame.tick,aliasFrame,selection));
check(aliasEntry&&activeAvatar(aliasEntry)?.id===W,'Same name replaced selected body');
const aliasQuote=availableWaterVeinActions(actor(aliasEntry),aliasEntry,aliasEntry.tick+1).find(row=>row.waterVeinMove==='observe');
const aliasBefore=encodeEraWorldSave(aliasEntry);
check(aliasQuote&&!queueAvatarWaterVein(aliasEntry,other,aliasQuote)&&encodeEraWorldSave(aliasEntry)===aliasBefore&&
  queueAvatarWaterVein(aliasEntry,W,aliasQuote),'Different same-named body gained action authority');
const otherEntry=readTimelineHead(forkTimelineAvatarEntry(aliasTimeline,aliasOriginal.id,aliasFrame.tick,aliasFrame,{...selection,actorId:other}));
check(otherEntry&&activeAvatar(otherEntry)?.id===other&&encodeEraWorldSave(aliasFrame.world)===aliasSave&&encodeEraWorldSave(early.world)===early.raw,
  'Explicit other candidate did not retain distinct body or changed supplied T34 source');

const stages=[];
for(const [folder,world] of [['queued',playable],['surveyed',ended]] as const){
  const packed=await prepareEraCheckpoint(world,{branchId:playedId,timelineId:'e49-late-real-avatar'},codec,{engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
  const read=await verifyEraCheckpoint(eraInput(packed.manifestFile.bytes),packed.parts.map(part=>eraInput(part.bytes)),codec);
  check(encodeEraWorldSave(read.world)===encodeEraWorldSave(world)&&encodeEraWorldSave(step(read.world))===encodeEraWorldSave(step(world)),
    'Strict archive replay differs '+folder);
  stages.push({folder,packed,world,tick:read.world.tick});
}
await late.verify();await early.verify();
await mkdir(out,{recursive:false});
for(const {folder,packed,world} of stages){
  const dest=join(out,folder);await mkdir(dest,{recursive:false});
  for(const file of [packed.manifestFile,...packed.parts]){
    const handle=await open(join(dest,file.name),'wx');try{await handle.writeFile(file.bytes);await handle.sync();}finally{await handle.close();}
  }
  const manifestOnDisk=await bounded(join(dest,packed.manifestFile.name),ERA_CHECKPOINT_MANIFEST_BYTES);
  const partsOnDisk=await Promise.all(packed.parts.map(file=>bounded(join(dest,file.name),ERA_CHECKPOINT_NATIVE_JSON_BYTES)));
  const disk=await verifyEraCheckpoint(eraInput(manifestOnDisk),partsOnDisk.map(eraInput),codec);
  check(disk.manifest.id===packed.manifest.id&&encodeEraWorldSave(disk.world)===encodeEraWorldSave(world)&&
    encodeEraWorldSave(step(disk.world))===encodeEraWorldSave(step(world)),'Strict physical readback differs '+folder);
}
await late.verify();await early.verify();
console.log(JSON.stringify({
  scope:'headless native Utility with explicit same-age REST control; no live LLM/browser/phone claim',
  node:proc.version,executionRule:__SECT_UTILITY_RULE_VERSION__,sourceRule:late.manifest.engineRuleVersion,
  sourceSha:late.manifest.payloadSha256,sourceTick:late.world.tick,originalBranch:original.id,childBranch:playedId,
  originalUnchanged:true,parentRawBytesUnchanged:true,sourceDuplicateName:false,
  person:{id:W,name:wen.name,realm:wen.realm,age:wen.age,site,tile:tile.id,wellProjectId:originalWell.id},
  costs:{possessionEssence:AVATAR_POSSESSION_COST,queueEssence:AVATAR_ORDER_COST,essenceBefore:initialEssence,
    essenceAfterQueue:playable.playerAvatar.essence,personalStonesBefore:wallet(playable),sameAgeIdleStones:wallet(idleWorld),paidStones:fee.amount,
    personalStonesAfter:wallet(ended)},
  receipt:observation,originalGateReopened:false,pendingCleared:!ended.playerAvatar.pendingOrder,
  strictArchives:stages.map(({folder,packed,tick})=>({folder,tick,sha:packed.manifest.payloadSha256,payloadBytes:packed.manifest.payloadBytes,
    strictPhysicalReadback:true,nextMonthByteExact:true})),
  wrongRealDeceasedRejected:true,wrongNameOnlyRejected:true,wrongSameDateFrameRejected:true,
  sameNameNegative:{syntheticDisplayOnly:true,originalT34Sha:early.manifest.payloadSha256,timeUnedited:true,actorIds:labels.map(row=>row.actorId),
    sameNameOtherCannotQueueSelectedBody:true,originalT34Unchanged:true},
},null,2));
