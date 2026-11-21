import {join,mkdir,readFile,stat,writeFile} from './centuryNodeRuntime';
declare const process:{argv:string[];resourceUsage():{maxRSS:number}};
import {createCampaignJournal} from '../src/engine/campaignJournal';
import {campaignSHA256} from '../src/engine/campaignMemento';
import {activeAvatar,queueAvatarOrder} from '../src/engine/avatarEngine';
import {projectEraEntryCandidates} from '../src/engine/eraEntryCandidates';
import {prepareEraCheckpoint,verifyEraCheckpoint} from '../src/engine/eraCheckpointEngine';
import {projectEraHistory} from '../src/engine/eraHistoryIndex';
import {decodeEraWorldSave,encodeEraWorldSave,encodeWorldSave,WORLD_SAVE_MAX_BYTES,worldSaveByteCount} from '../src/engine/storageEngine';
import {forkTimelineAvatarEntry,forkTimelineCampaignCheckpoint,readTimelineHead,recordTimelineWorld,selectTimelineBranch} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';
import {die,fileBackend,log,population,version} from './centuryAcceptance';

const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const wanted=Number(process.argv[3]??1200), dir=process.argv[2]??die('Expected durable fixture folder');
const assert=(ok:unknown,why:string)=>{if(!ok)die(why);};
const bytes=(world:WorldState)=>new TextEncoder().encode(encodeEraWorldSave(world));
const hash=async (world:WorldState)=>campaignSHA256(bytes(world));
const step=(world:WorldState)=>advanceWorldTick(world,undefined,undefined,'utility');
const projectOld=(world:WorldState)=>{
  for(const row of world.eraHistory.receipts){
    if(row.kind==='workshop'||row.tick>world.tick-120)continue;
    const query=row.kind==='death'?{kind:'actor' as const,id:row.actorId}:row.kind==='succession'?{kind:'sect' as const,id:row.sectId}:
      {kind:'settlement' as const,id:row.fromSettlementId};
    const view=projectEraHistory(world,query,undefined,world.tick,{beforeTick:row.tick+1})
      .find(value=>value.receipt.eventId===row.eventId);
    if(view)return view;
  }
};
async function transfer(name:string,branchId:string,timelineId:string,world:WorldState,next:WorldState){
  const time=performance.now(), output=join(dir,name);
  await mkdir(output,{recursive:true});
  const pack=await prepareEraCheckpoint(world,{timelineId,branchId,label:name},codec,{engineRuleVersion:version});
  for(const f of [pack.manifestFile,...pack.parts])await writeFile(join(output,f.name),f.bytes);
  const input=async(name:string)=>{
    const path=join(output,name),{size}=await stat(path);
    return {size,async arrayBuffer(){return Uint8Array.from(await readFile(path)).buffer;}};
  };
  const loaded=await verifyEraCheckpoint(await input(pack.manifestFile.name),await Promise.all([...pack.parts].reverse().map(part=>input(part.name))),codec);
  const nativeMatches=encodeEraWorldSave(loaded.world)===encodeEraWorldSave(world);
  assert(nativeMatches,'ERA readback did not match native world bytes');
  const replay=step(loaded.world),nextMatches=encodeEraWorldSave(replay)===encodeEraWorldSave(next);
  assert(nextMatches,'Restored ERA next actual month mismatch');
  let oldJsonAllowed=true;
  try{encodeWorldSave(loaded.world);}catch(error){
    if((error as {code?:string}).code!=='size')throw error;
    oldJsonAllowed=false;
  }
  assert(oldJsonAllowed===(pack.manifest.payloadBytes<=WORLD_SAVE_MAX_BYTES),'Ordinary JSON gate diverged');
  log('export_verified',{name,branchId,date:[world.year,world.month,world.tick],nativeBytes:pack.manifest.payloadBytes,parts:pack.parts.length,
    totalArtifactBytes:pack.manifestFile.bytes.byteLength+pack.parts.reduce((n,part)=>n+part.bytes.byteLength,0),oldJsonAllowed,
    manifest:pack.manifest.id,digest:pack.manifest.payloadSha256,nativeMatches,nextMatches,nextDate:[next.year,next.month,next.tick],
    nextDigest:await hash(next),elapsedMs:Math.round(performance.now()-time)});
  return pack.manifestFile.bytes.byteLength+pack.parts.reduce((n,part)=>n+part.bytes.byteLength,0);
}
const journal=createCampaignJournal(fileBackend(dir));
const context=(await journal.load())??die('final journal missing');
assert(context.record.ruleVersion===version,'Current rules differ from certified source fingerprint');
assert((context.record.status==='ready'||context.record.status==='finalized')&&context.record.completedTicks===wanted&&context.record.requestedTicks===wanted,
  'Requested horizon not durably confirmed');
const {source,checkpoint}=context;
const end=checkpoint.world;
if(wanted===1200)assert(end.tick===1201&&end.year===1101&&end.month===1,'Not at the real century boundary');
assert(await hash(source.world)===context.record.source.sha256,'Original source digest mismatch');
assert(await hash(end)===context.record.head?.sha256,'Candidate digest mismatch');
let timeline=forkTimelineCampaignCheckpoint(source.timeline,source.timeline.activeBranchId,source.world.tick,checkpoint,'百年旁观线');
const passiveId=timeline.activeBranchId, passive=readTimelineHead(timeline)!;
if(context.record.status!=='finalized')await journal.finalize(context.record,passiveId);
assert(timeline.branches.length===source.timeline.branches.length+1&&timeline.branches[0]===source.timeline.branches[0],'Passive fork overwrote source');
const passiveNext=step(passive);
const passiveActor=new Map(passiveNext.cultivators.map(actor=>[actor.id,actor]));
const named=passive.cultivators.filter(actor=>actor.alive&&actor.hp>0&&passiveActor.get(actor.id)?.currentAction!=='REST')
 .sort((a,b)=>Number(b.id.startsWith('recruit-'))-Number(a.id.startsWith('recruit-'))||a.id.localeCompare(b.id));
let selection:{actorId:string;siteId:string;viewerId:string}|undefined;
let origin:ReturnType<typeof projectEraEntryCandidates>[number]['origin']|undefined;
for(const actor of named){
 const card=projectEraEntryCandidates(passive,actor.locationId,actor.id).find(row=>row.actorId===actor.id&&row.decision.kind==='rest_or_cultivate');
 if(card){selection={actorId:actor.id,siteId:actor.locationId,viewerId:actor.id};origin=card.origin;break;}
}
if(!selection)die('No lawful local century entrant differing naturally from passive REST');
const current=selection!, fork=timeline.branches.find(b=>b.id===passiveId)!.snapshots.at(-1)!;
const entered=forkTimelineAvatarEntry(timeline,passiveId,passive.tick,fork,current,'百年入世线');
const enteredId=entered.activeBranchId, playable=readTimelineHead(entered)!;
assert(activeAvatar(playable)?.id===current.actorId,'Exact entrant not possessed');
assert(queueAvatarOrder(playable,'REST'),'Native REST order was not accepted');
const planned=recordTimelineWorld(entered,playable,enteredId);
const actual=readTimelineHead(planned)!;
assert(actual.playerAvatar.pendingOrder?.actorId===current.actorId,'Native order lost before save');
const acted=step(actual),selected=acted.cultivators.find(actor=>actor.id===current.actorId);
assert(selected?.currentAction==='REST'&&!acted.playerAvatar.pendingOrder,'REST not actually applied/consumed by native month');
const untouched=readTimelineHead(selectTimelineBranch(planned,passiveId))!;
assert(await hash(untouched)===await hash(passive),'Passive branch changed by Avatar/REST');
assert(await hash(readTimelineHead(selectTimelineBranch(planned,source.timeline.activeBranchId))!)===context.record.source.sha256,
  'Source origin was not preserved when comparing');
const initialNext=step(source.world);
const readOriginNext=step(readTimelineHead(selectTimelineBranch(planned,source.timeline.activeBranchId))!);
assert(encodeEraWorldSave(initialNext)===encodeEraWorldSave(readOriginNext),'Original could no longer continue');
const oldProof=projectOld(end);
if(wanted===1200)assert(oldProof,'No year-old native public receipt projects');
log('century',{seed:source.world.random.seed,ruleVersion:version,scope:'native headless exact two processes/atomic disk, not real browser or IDB',
  start:[source.world.year,source.world.month,source.world.tick],end:[end.year,end.month,end.tick],months:wanted,
  startPopulation:population(source.world,source.world),endPopulation:population(end,source.world),recordedHistory:end.eraHistory.receipts.length,
  nativeBytes:worldSaveByteCount(end),sha256:await hash(end),oldProof,originalUnchanged:true,sourcePlayable:true,
  totalBranches:planned.branches.length,passive:{id:passiveId,actorAction:passiveActor.get(current.actorId)?.currentAction},
  entered:{id:enteredId,selection:current,origin,name:selected?.name,action:selected?.currentAction,orderConsumed:!acted.playerAvatar.pendingOrder}});
const passiveBytes=await transfer('century-passive',passiveId,source.timelineId,untouched,passiveNext);
const enteredBytes=await transfer('century-entered',enteredId,source.timelineId,actual,acted);
log('accepted',{bothPortableArtifactBytes:passiveBytes+enteredBytes,wallScope:'post-resume native branch and export checks; see native log for simulation',maxRssKiB:process.resourceUsage().maxRSS});
