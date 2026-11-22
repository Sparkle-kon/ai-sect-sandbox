import {arch,cpus,join,mkdir,open,platform,readFile,stat} from './centuryNodeRuntime';
import {campaignHashValid,campaignSHA256} from '../src/engine/campaignMemento';
import {ERA_CHECKPOINT_MANIFEST_BYTES,ERA_CHECKPOINT_NATIVE_JSON_BYTES,prepareEraCheckpoint,verifyEraCheckpoint}
  from '../src/engine/eraCheckpointEngine';
import type {EraInput} from '../src/engine/eraCheckpointEngine';
import {activeAvatar,queueAvatarNorthGateRenewal,queueAvatarNorthWellReview,queueAvatarWaterVein} from '../src/engine/avatarEngine';
import {projectEraEntryCandidates} from '../src/engine/eraEntryCandidates';
import {findNorthGateRenewalSource} from '../src/engine/northGateRenewalTerms';
import {availableNorthGateRenewalActions} from '../src/engine/northGateRenewalEngine';
import {projectNorthMiningCharters} from '../src/engine/northMiningCharterEngine';
import {availableNorthWellReviewActions} from '../src/engine/northWellRevisitEngine';
import {availableWaterVeinActions,northWaterAddress} from '../src/engine/waterVeinEngine';
import {NORTH_MINING_SITE,NORTH_MINING_SETTLEMENT} from '../src/engine/northMiningCharterTerms';
import {granaryAt} from '../src/engine/villageGranaryEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {createTimeline,forkTimelineAvatarEntry,readTimelineHead,recordTimelineWorld} from '../src/engine/timelineEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];version:string;exitCode?:number;resourceUsage():{maxRSS:number}};
const expectedBuild='22f5d7d59d73da2bc436d166a467521d7d63bafc43c6282c304fc543b4ed9048';
const frames=[
  {label:'present',tick:34,year:1003,sha:'04f059902d6e2edae8cb1e44db27c880636cc64ed8f277baf1c7cba7ee1725c4',nativeBytes:278888},
  {label:'three_centuries',tick:3634,year:1303,sha:'81442fce7a2319fcab916584492c4569250e1cffd946c233b5627ffa3ec82c46',nativeBytes:596629},
  {label:'three_millennia',tick:36034,year:4003,sha:'ff529b63832705b957d174c1099589bb410cdb269c5356344c8075c30175d239',nativeBytes:691834},
] as const;
type ExactFrame=typeof frames[number];
const visitor='elder-danxia-1',charter='north-mining-charter-12',well='village-work-1';
const [out,...stems]=process.argv.slice(2);
const build=typeof __SECT_UTILITY_RULE_VERSION__==='string'?__SECT_UTILITY_RULE_VERSION__:undefined;
const timer=performance.now();
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
function check(ok:unknown,message:string):asserts ok{if(!ok)throw Error(message);}
check(out&&stems.length===3&&stems.every(stem=>stem&&!/\.(json|era|era-part)$/.test(stem)),
  '用法：vite-node scripts/verifyThreeEraWellVisits.ts <new-output-dir> <T34-stem> <T3634-stem> <T36034-stem>');
check(campaignHashValid(build),'当前构建指纹不可用。');
const writeLog=(kind:string,detail:unknown)=>console.log(JSON.stringify({kind,detail,elapsedMs:Math.round(performance.now()-timer),
  peakRSSKiB:process.resourceUsage().maxRSS}));
const input=(data:Uint8Array):EraInput=>({size:data.byteLength,arrayBuffer:async()=>Uint8Array.from(data).buffer});
const text=(data:Uint8Array)=>new TextDecoder('utf-8',{fatal:true}).decode(data);
const hash=(value:string)=>campaignSHA256(new TextEncoder().encode(value));
async function bounded(path:string,max:number){
  const info=await stat(path);
  check(info.size>0&&info.size<=max,'拒绝源文件字节：'+path);
  const data=await readFile(path);
  check(data.byteLength===info.size,'源文件读取期间长度已变化。');
  return data;
}
async function sourcePair(stem:string){
  return Promise.all([bounded(stem+'.era',ERA_CHECKPOINT_MANIFEST_BYTES),bounded(stem+'.json',ERA_CHECKPOINT_NATIVE_JSON_BYTES)]);
}
function sameWell(world:WorldState){
  const proof=findNorthGateRenewalSource(world),address=northWaterAddress(world);
  const original=world.northMiningCharters?.charters.find(row=>row.id===charter);
  check(proof?.siteId===NORTH_MINING_SITE&&proof.settlementId===NORTH_MINING_SETTLEMENT&&
    proof.charterId===charter&&proof.wellProjectId===well&&proof.openingId==='water-gate-8'&&proof.freightId==='village-supply-1'&&
    proof.passageTick===23&&proof.passageTileId==='tile-13-2'&&proof.freightClosedTick===34&&original,
  '缺少同一旧井、旧契、首个绕行格和实际交货的全链凭据。');
  check(address&&terrainTileAt(world,address.site.x,address.site.y)?.id==='tile-12-2',
    '实际井址与原水线不一致。');
  const native=world.coldWaterVein?.openings.find(row=>row.id===proof.openingId);
  check(native?.completedTick===14,'原水债未有同一结清凭据。');
  return {proof,original,locationId:address.site.id,tileId:'tile-12-2',sitePopulation:address.village.population};
}
async function loadSource(expected:ExactFrame,stem:string){
  const pair=await sourcePair(stem);
  const verified=await verifyEraCheckpoint(input(pair[0]),[input(pair[1])],codec);
  const {manifest,world}=verified;
  check(manifest.payloadSha256===expected.sha&&manifest.payloadBytes===expected.nativeBytes&&manifest.engineRuleVersion===expectedBuild&&
    world.tick===expected.tick&&world.year===expected.year&&world.month===10&&world.random.seed===1&&world.worldgen?.profileId==='spirit-bloom',
    `拒绝同年错谱、错误构建或其他来源：${expected.label} T${expected.tick}`);
  check(!world.regionalSimulation&&!world.authoredEraOrigin&&!world.northWellRevisitLaw&&!world.upperPassage&&!world.northGateRenewal,
    '三份输入必须来自无作者、无地区年算、未过界和未施行新听证的原生谱系。');
  const sourceText=text(pair[1]),normalized=encodeEraWorldSave(world);
  return {expected,stem,originalManifest:text(pair[0]),sourceText,normalized,world,facts:sameWell(world),manifest};
}
async function exclusive(name:string,data:string|Uint8Array){
  const file=await open(join(out,name),'wx');
  try{await file.writeFile(data);await file.sync();}finally{await file.close();}
}
async function syncDir(){const handle=await open(out,'r');try{await handle.sync();}finally{await handle.close();}}
const living=(actor:Cultivator)=>actor.alive&&actor.hp>0;
const rest=():LLMDecisionPayload=>({chosenAction:'REST',innerMonologue:'独立复访：此人按原生规则旁观。'});
const step=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(living).map(actor=>[actor.id,rest()])),
  undefined,'utility');
const body=(world:WorldState)=>world.cultivators.find(actor=>actor.id===visitor);
const treasury=(world:WorldState)=>world.sects.find(sect=>sect.id===body(world)?.sectId)?.spiritStones;
const wallet=(world:WorldState)=>body(world)?.spiritStones;
const roots=(world:WorldState)=>granaryAt(world,NORTH_MINING_SETTLEMENT)?.roots;
type ActionResult={action:'survey'|'keep'|'sect_dry';receiptId:string;tick:number;paidStones:number;
  wellDepth?:number;borrowedUnits?:number;granaryRoots?:number};
function verifyCharge(before:WorldState,after:WorldState,amount:number,ref:string,account:'actor'|'sect',sourceId:string){
  const journal=after.resourceFlow.months.find(row=>row.tick===after.tick);
  check(journal,'没有真实当月资源账。');
  const receipts=journal.entries.filter(entry=>entry.refId===ref&&entry.kind==='consumption'&&entry.good==='stone'&&
    entry.from?.kind===account&&entry.from.id===sourceId);
  check(receipts.reduce((n,row)=>n+row.amount,0)===amount&&after.tick===before.tick+1&&!after.playerAvatar.pendingOrder,
    '公开的费用与实际来源账或完成行动不同。');
}
type VerifiedSource=Awaited<ReturnType<typeof loadSource>>;
async function visit(source:VerifiedSource){
  const {expected,world,facts}=source;
  const initial=createTimeline(world),retained=initial.branches[0].snapshots[0];
  const retainedText=encodeEraWorldSave(retained.world);
  const candidate=projectEraEntryCandidates(retained.world,NORTH_MINING_SITE,visitor).find(actor=>actor.actorId===visitor);
  check(candidate?.decision.kind==='rest_or_cultivate'&&projectNorthMiningCharters(retained.world,body(retained.world))?.rows.some(row=>
    row.id===facts.proof.charterId&&row.hasVerifiedPassage),'此档原井无人符合现地入世或原契可见条件：'+expected.label);
  let timeline=forkTimelineAvatarEntry(initial,initial.activeBranchId,retained.tick,retained,
    {siteId:NORTH_MINING_SITE,viewerId:visitor,actorId:visitor},'北井独立验收 '+expected.tick);
  const branch=timeline.activeBranchId;
  let current=readTimelineHead(timeline,branch);
  check(current&&activeAvatar(current)?.id===visitor&&current.tick===expected.tick,'入世未取得原生同人副本。');
  const actions:ActionResult[]=[];
  const progress=(next:WorldState)=>{
    check(current&&next.tick===current.tick+1,'并未推进一个完整原生月。');
    current=next;timeline=recordTimelineWorld(timeline,next,branch);
    check(timeline.branches[0]===initial.branches[0]&&timeline.branches.find(row=>row.id===branch)?.snapshots.at(-1)?.tick===next.tick&&
      encodeEraWorldSave(timeline.branches[0].snapshots[0].world)===retainedText,'原支线、快照身份或续玩支线未正确保留。');
  };
  if(expected.label!=='three_millennia'){
    const viewer=body(current);
    check(viewer,'入世目标已不在。');
    const quote=availableWaterVeinActions(viewer,current,current.tick+1).find(row=>row.waterVeinMove==='observe');
    const before=wallet(current);
    check(quote&&before!==undefined&&queueAvatarWaterVein(current,visitor,quote)&&wallet(current)===before,
      '未能预约真实勘井，或预约提前扣钱包。');
    const next=step(current);
    const observed=next.coldWaterVein?.observations.find(row=>row.actorId===visitor&&row.tick===next.tick);
    check(wallet(next)===before-2&&observed?.paidStones===2&&observed.wellDepth!==undefined,'没有完成付费实测。');
    verifyCharge(current,next,2,observed.id,'actor',visitor);
    actions.push({action:'survey',receiptId:observed.id,tick:next.tick,paidStones:2,wellDepth:observed.wellDepth});
    progress(next);
  }
  if(expected.label==='three_centuries'){
    const viewer=body(current);
    check(viewer,'当世勘井者已不在。');
    const quote=availableNorthWellReviewActions(viewer,current,current.tick+1).find(row=>row.northWellReviewMove==='keep'&&row.targetNorthMiningCharterId===charter);
    const before=wallet(current);
    check(quote&&before!==undefined&&queueAvatarNorthWellReview(current,visitor,quote)&&wallet(current)===before,
      '合法原规复核不可用；不补造议结。');
    const next=step(current),review=next.northWellRevisitReviews?.decisions.find(row=>row.actorId===visitor&&row.tick===next.tick);
    check(review?.move==='keep'&&review.paidStones===4&&review.sourceCharterId===charter&&wallet(next)===before-4,
      '实际复核收据、原契或当月费用不符。');
    verifyCharge(current,next,4,review.id,'actor',visitor);
    actions.push({action:'keep',receiptId:review.id,tick:next.tick,paidStones:4});
    progress(next);
  }
  if(expected.label==='three_millennia'){
    const viewer=body(current);
    check(viewer,'当世宗主已不在。');
    const quote=availableNorthGateRenewalActions(viewer,current,current.tick+1).find(row=>row.northGateRenewalMove==='sect');
    const cash=treasury(current),stock=roots(current);
    // Same native turn without player command separates expense from unrelated common upkeep.
    const passive=step(current);
    check(quote&&cash!==undefined&&stock!==undefined&&queueAvatarNorthGateRenewal(current,visitor,quote)&&treasury(current)===cash&&roots(current)===stock,
      '合法本宗独担预约不可用，或提前扣了实资。');
    const next=step(current),hearing=next.northGateRenewal?.hearing,result=hearing?.outcome;
    const opening=next.coldWaterVein?.openings.find(row=>row.id===`water-gate-${next.tick}`);
    const passiveCash=treasury(passive);
    check(result?.kind==='reopened'&&result.stance==='sect'&&result.paidStones===64&&result.borrowedUnits===0&&result.granaryRoots===0&&
      result.actorId===visitor&&opening?.renewal?.id===hearing?.id&&opening?.borrowedUnits===0&&
      passiveCash!==undefined&&treasury(next)===passiveCash-64&&roots(next)===roots(passive)&&roots(next)===stock,
      '实际独担开门、借水或宗库/义仓对照不符。');
    verifyCharge(current,next,64,result.openingId,'sect',viewer.sectId);
    actions.push({action:'sect_dry',receiptId:result.openingId,tick:next.tick,paidStones:64,borrowedUnits:0,granaryRoots:0});
    progress(next);
  }
  const absolute=sameWell(current);
  check(JSON.stringify(absolute.original)===JSON.stringify(facts.original),'旧契在新动作中被回写。');
  const packageOut=await prepareEraCheckpoint(current,{branchId:branch,timelineId:`e310-well-${expected.tick}`},codec,{engineRuleVersion:build!});
  const files=[packageOut.manifestFile,...packageOut.parts];
  for(const file of files)await exclusive(expected.label+'-'+file.name,file.bytes);
  await syncDir();
  const readPacked=async(name:string)=>input(await readFile(join(out,expected.label+'-'+name)));
  const loaded=await verifyEraCheckpoint(await readPacked(packageOut.manifestFile.name),
    await Promise.all([...packageOut.parts].reverse().map(part=>readPacked(part.name))),codec);
  const native=encodeEraWorldSave(current);
  check(encodeEraWorldSave(loaded.world)===native,'人物、账或时点在可携档读回不一致。');
  const directly=step(current),reread=step(loaded.world);
  const nextText=encodeEraWorldSave(directly);
  check(reread.tick===current.tick+1&&encodeEraWorldSave(reread)===nextText,'实际后继月逐字节不一致。');
  const originalAgain=await sourcePair(source.stem);
  check(text(originalAgain[0])===source.originalManifest&&text(originalAgain[1])===source.sourceText&&
    encodeEraWorldSave(world)===source.normalized&&JSON.stringify(sameWell(world).proof)===JSON.stringify(facts.proof),
    '原始母档或原加载帧已改变。');
  const actor=body(current);
  return {visit:expected.label,sourceDate:[expected.year,10,expected.tick],rawSourceSHA:source.manifest.payloadSha256,
    normalizedSourceSHA:await hash(source.normalized),sourceRule:source.manifest.engineRuleVersion,
    executionRule:build,branch,actor:actor&&{id:actor.id,age:actor.age,lifespan:actor.lifespan,realm:actor.realm,site:actor.locationId},
    originalWell:{id:well,tileId:facts.tileId},proof:facts.proof,sourceResidents:facts.sitePopulation,actions,
    resultTick:current.tick,resultNativeBytes:packageOut.manifest.payloadBytes,resultSHA:packageOut.manifest.payloadSha256,
    physicalBytes:files.reduce((n,file)=>n+file.bytes.byteLength,0),
    nextTick:reread.tick,nextSHA:await hash(nextText),sourceUnchanged:true as const};
}

try{
  const sources=await Promise.all(frames.map((frame,i)=>loadSource(frame,stems[i])));
  check(sources.every(node=>JSON.stringify(node.facts.original)===JSON.stringify(sources[0].facts.original)),
    '三帧旧签原件不是同一份。');
  await mkdir(out,{recursive:false});
  writeLog('environment',{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model,timingScope:'Linux/Node local isolated; not handset',
    sourceRule:expectedBuild,executionRule:build,fullNativeSourceMonths:36000,regionalYears:0,authoredYears:0});
  const results=[];
  for(const source of sources){
    const outcome=await visit(source);
    results.push(outcome);writeLog('verified_visit',outcome);
  }
  const result={status:'complete',visits:results,sourceRule:expectedBuild,executionRule:build};
  await exclusive('complete.json',JSON.stringify(result));await syncDir();
  writeLog('accepted',{visits:results.length,sourceUnchanged:true,latestTick:results.at(-1)?.resultTick});
}catch(error){
  writeLog('blocked',{error:String(error)});
  process.exitCode=1;
}
