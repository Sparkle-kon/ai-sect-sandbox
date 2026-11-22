declare const __SECT_UTILITY_RULE_VERSION__:string;
import { getActorRosterPage } from '../src/components/ActorRoster';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { DEFAULT_CAMERA } from '../src/components/mapCamera';
import { planActorMarkers } from '../src/components/mapActorClusters';
import { projectEraHistory } from '../src/engine/eraHistoryIndex';
import { SIMULATION_REGIONS, regionForPoint } from "../src/engine/regionalSimulationEngine";
import { projectNorthMiningCharters } from "../src/engine/northMiningCharterEngine";
import { ERA_CHECKPOINT_MANIFEST_BYTES, ERA_CHECKPOINT_NATIVE_JSON_BYTES, prepareEraCheckpoint, verifyEraCheckpoint, type EraInput } from '../src/engine/eraCheckpointEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { createTimeline, forkTimeline, readTimelineHead, recordTimelineWorld } from '../src/engine/timelineEngine';
import type { Cultivator, EraHistoryReceipt, WorldEvent } from '../src/types/world';
import { readFile, stat, open, join, cpus } from './centuryNodeRuntime';

function assert(condition: unknown, context: string): asserts condition {
  if (!condition) throw new Error(context);
}
const processModule = 'node:process';
interface NativeProcess {
  argv:string[];
  version:string;
  resourceUsage():{maxRSS:number};
  memoryUsage():{rss:number;heapTotal:number;heapUsed:number;external:number;arrayBuffers:number};
}
const proc = (await import(processModule) as {default:NativeProcess}).default;
const cryptoModule = 'node:crypto';
const crypto = await import(cryptoModule) as {webcrypto:Crypto};
if (!globalThis.crypto) Object.defineProperty(globalThis,'crypto',{value:crypto.webcrypto});
const codec = {encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const filesModule = 'node:fs/promises';
const {mkdir} = await import(filesModule) as {mkdir(path:string):Promise<void>};
const [archiveStem, outputDir, ...extraArgs] = proc.argv.slice(2);
assert(archiveStem && !archiveStem.endsWith('.era') && !archiveStem.endsWith('.json') && outputDir && extraArgs.length===0,
  'Usage: vite-node scripts/e38RosterProbe.ts <path to paired checkpoint without .era or .json suffix> <new output directory>');
const manifestPath = archiveStem+'.era';
const payloadPath = archiveStem+'.json';
const writeExclusive = async (name:string, bytes:Uint8Array|string) => {
  const fd = await open(join(outputDir,name),'wx');
  try { await fd.writeFile(bytes); }
  finally { await fd.close(); }
};
async function readBounded(path:string, max:number):Promise<Uint8Array> {
  const info=await stat(path);
  assert(info.size>0&&info.size<=max,'Checkpoint source length out of bounds: '+path);
  const data=await readFile(path);
  assert(data.byteLength===info.size,'Checkpoint source length changed: '+path);
  return data;
}
const sameBytes=(left:Uint8Array,right:Uint8Array)=>left.byteLength===right.byteLength&&left.every((value,i)=>value===right[i]);
function input(bytes: Uint8Array): EraInput {
  return {size:bytes.byteLength,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
}
const startup = performance.now();
const originalPayload = await readBounded(payloadPath,ERA_CHECKPOINT_NATIVE_JSON_BYTES);
const originalManifest = await readBounded(manifestPath,ERA_CHECKPOINT_MANIFEST_BYTES);
const verifiedOrigin = await verifyEraCheckpoint(input(originalManifest),[input(originalPayload)],codec);
const rawOrigin = new TextDecoder('utf-8',{fatal:true}).decode(originalPayload);
const origin = verifiedOrigin.world;
assert(origin.tick===3634&&origin.year===1303&&origin.month===10&&origin.random.seed===1,
  'This fixture requires the seed-1 T3634 (1303-10) checkpoint');
assert(origin.cultivators.length===21&&origin.cultivators.filter(({alive})=>alive).length===15,
  'The validated source does not have the expected 21 registered / 15 living actors');
assert(!origin.cultivators.some(({id})=>id.startsWith('analysis-roster-')), 'The source already has analytical actors');
await mkdir(outputDir); // Exclusive directory creation: an existing path is never used.

const timeline = createTimeline(origin);
const originalSnapshot = readTimelineHead(timeline,'main');
assert(originalSnapshot,'source timeline not readable');
const baseline = encodeEraWorldSave(originalSnapshot);
assert(baseline===rawOrigin,'original save not byte-equal under current codec');
const fork = forkTimeline(timeline,origin.tick,{type:'DEMONIC_TIDE'},'仅分析：千人名册压测');
const synthetic = readTimelineHead(fork);
assert(synthetic,'sandbox branch not readable');
const market = synthetic.locations.find(row=>row.id==='loc-market');
assert(market,'public market missing');
const template = synthetic.cultivators.find(row=>row.alive);
assert(template,'template missing');
const oldId='analysis-roster-0000', youngId='analysis-roster-0001', sameName='验收同名者·陆照';
const oldTick = 60;
const deathEvent:WorldEvent = {id:`evt-${oldTick}-analysis-roster-0000-oldage`,tick:oldTick,year:1005,month:12,
  title:'旧代验收同名者陨落',description:'合成测试事件：不是自然演化档案。',category:'death',actorIds:[oldId],locationId:market.id};
const syntheticReceipt = Array.from({length:1200},(_,i):EraHistoryReceipt[]=> i%4===0 ? [{
  kind:'death',eventId:`evt-${oldTick}-analysis-roster-${String(i).padStart(4,'0')}-oldage`,tick:oldTick,
  year:deathEvent.year,month:deathEvent.month,locationId:market.id,actorId:`analysis-roster-${String(i).padStart(4,'0')}`,
}]:[]).flat();
for(let i=0;i<1200;i++){
  const alive = i%4!==0;
  const item:Cultivator = {
    id:`analysis-roster-${String(i).padStart(4,'0')}`,name:i<=1?sameName:`验收名册·${String(i).padStart(4,'0')}`,
    title:'分析散修',sectId:'',sectRank:'外门弟子',contribution:0,transgressions:0,realm:template.realm,realmStage:template.realmStage,
    qiProgress:template.qiProgress,hp:alive?template.maxHp:0,maxHp:template.maxHp,combatPower:template.combatPower,
    age:alive?(i===1?19:63+i%36):100,lifespan:100,personality:template.personality,locationId:market.id,
    spiritStones:0,karma:0,currentAction:'CULTIVATE',innerMonologue:'',secretGoal:'',spiritRoot:template.spiritRoot,
    technique:structuredClone(template.technique),techniqueMastery:0,herbs:structuredClone(template.herbs),pills:structuredClone(template.pills),
    pillToxicity:0,exploredTileIds:[],artifacts:[],memories:[],coreMemories:[],memorySequence:0,reflections:[],rumors:[],alive,
  };
  synthetic.cultivators.push(item);
}
synthetic.eraHistory.receipts.push(...syntheticReceipt);
synthetic.eraHistory.receipts.sort((a,b)=>a.tick-b.tick);
synthetic.chronicleArchive.anchors = [deathEvent, ...synthetic.chronicleArchive.anchors].sort((a,b)=>a.tick-b.tick).slice(-384);
const withSynthetic = recordTimelineWorld(fork,synthetic);
const sourceReadback = readTimelineHead(withSynthetic,'main');
const analyticalReadback = readTimelineHead(withSynthetic);
assert(sourceReadback && analyticalReadback && analyticalReadback.cultivators.length===1221,'isolated analytical data not recorded');
assert(encodeEraWorldSave(sourceReadback)===rawOrigin,'source fork bytes changed');
assert(sourceReadback!==analyticalReadback && withSynthetic.activeBranchId!=='main','branch identity unexpectedly shared');
encodeEraWorldSave(analyticalReadback);
const putStart = performance.now();
const prepared = await prepareEraCheckpoint(analyticalReadback,{branchId:withSynthetic.activeBranchId,label:'synthetic-query-only'},codec,
  {engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
const putMs = performance.now()-putStart;
const readStart = performance.now();
const {world,manifest} = await verifyEraCheckpoint(input(prepared.manifestFile.bytes),prepared.parts.map(file=>input(file.bytes)),codec);
const readMs = performance.now()-readStart;
assert(world.cultivators.filter(({alive})=>alive).length===915,'living count');
assert(world.cultivators.length===1221,'registered count');
assert(new Set(world.cultivators.map(({id})=>id)).size===1221,'unique IDs');
const same = getActorRosterPage(world,sameName,'all',0);
assert(same.total===2&&same.actors[0].id===oldId&&same.actors[1].id===youngId,'same name conflated');
assert(getActorRosterPage(world,sameName,'fallen',0).actors[0]?.id===oldId &&
  getActorRosterPage(world,sameName,'living',0).actors[0]?.id===youngId,'state filters cross among same names');
const older = projectEraHistory(world,{kind:'actor',id:oldId});
assert(older[0]?.receipt.eventId===deathEvent.id && older[0].source==='public_archive','old ID not linked to archived evidence');
assert(projectEraHistory(world,{kind:'actor',id:youngId}).length===0 &&
  projectEraHistory(world,{kind:'actor',id:oldId},undefined,oldTick-1).length===0,'archive crossed ID or timeslice');
const northViewer = world.cultivators.find(({id})=>id==="elder-danxia-1");
const oldCharter = projectNorthMiningCharters(world,northViewer)?.rows.find(({id})=>id==="north-mining-charter-12");
assert(northViewer?.alive&&oldCharter?.status==="ratified"&&oldCharter.active&&oldCharter.hasVerifiedPassage===true,"actual early charter not visible for current northern host");
const camera = {width:390,height:234};
const plan = () => {
  const view=createTerrainMapView(world,undefined,false);
  return planActorMarkers(mapActorPositions(view.seenLocations,view.liveActors,view.trailPositions),DEFAULT_CAMERA,camera,youngId);
};
const marks=plan();
const marksIds = marks.flatMap(mark=>mark.kind==='cluster'?mark.ids:[mark.point.actor.id]);
assert(marksIds.includes(youngId)&&!marksIds.includes(oldId),'map rendered dead duplicate or missed living');
const rawSamples:Record<string,number[]>={};
function sample(label:string,run:()=>unknown) {
  for(let i=0;i<50;i++) run();
  const recorded = Array.from({length:500},()=>{const start=performance.now(); run(); return performance.now()-start;});
  rawSamples[label]=recorded;
  const samples = [...recorded].sort((a,b)=>a-b);
  const at=(fraction:number)=>Number(samples[Math.ceil(samples.length*fraction)-1].toFixed(3));
  return {samples:samples.length,p50Ms:at(.5),p95Ms:at(.95),maxMs:at(1)};
}
 
const samples={
  rosterFullSearch:sample("rosterFullSearch",()=>getActorRosterPage(world,'验收名册','all',150)),
  rosterSameName:sample("rosterSameName",()=>getActorRosterPage(world,sameName,'all',0)),
  eraOldPositive:sample("eraOldPositive",()=>projectEraHistory(world,{kind:'actor',id:oldId},youngId)),
  eraYoungNegative:sample("eraYoungNegative",()=>projectEraHistory(world,{kind:'actor',id:youngId},youngId)),
  canvasProjectionAndMarkerPlan:sample("canvasProjectionAndMarkerPlan",plan),
};
const payloadAtEnd=await readBounded(payloadPath,ERA_CHECKPOINT_NATIVE_JSON_BYTES);
const manifestAtEnd=await readBounded(manifestPath,ERA_CHECKPOINT_MANIFEST_BYTES);
assert(sameBytes(originalPayload,payloadAtEnd)&&sameBytes(originalManifest,manifestAtEnd),'source pair changed');
await writeExclusive('samples.json',JSON.stringify(rawSamples));
for(const file of [prepared.manifestFile,...prepared.parts]) await writeExclusive(file.name,file.bytes);
const summary = JSON.stringify({dataSource:'1200 added analytical synthetic actors + a supplied, integrity-verified seed-1 T3634 natural-run fixture; not an import cap or organic population test',
  caveat:'Checkpoint integrity does not prove simulation provenance. Headless Node timings exclude browser rendering and touch interaction.',
  probeEngineRuleVersion:__SECT_UTILITY_RULE_VERSION__,node:proc.version,cpu:cpus()[0]?.model,source:{tick:origin.tick,living:origin.cultivators.filter(({alive})=>alive).length,
  registered:origin.cultivators.length,sha:verifiedOrigin.manifest.payloadSha256,archiveId:verifiedOrigin.manifest.id,engineRuleVersion:verifiedOrigin.manifest.engineRuleVersion,unchangedSnapshot:true,unchangedSourcePair:true,earlyToPresent:{viewer:{id:northViewer.id,name:northViewer.name,age:northViewer.age,locationId:northViewer.locationId},charter:oldCharter}},
  synthetic:{living:world.cultivators.filter(({alive})=>alive).length,registered:world.cultivators.length,locations:world.locations.length,regionsConfigured:SIMULATION_REGIONS.length,regionsWithSites:new Set(world.locations.map(site=>regionForPoint(world,site))).size,
  villages:world.settlements.villages.length,tiles:world.terrain.tiles.length,receiptTotal:world.eraHistory.receipts.length,
  bytes:manifest.payloadBytes,archiveBytes:prepared.manifestFile.bytes.length+prepared.parts.reduce((n,p)=>n+p.bytes.length,0),
  payloadSha:manifest.payloadSha256,archive:[prepared.manifestFile.name,...prepared.parts.map(part=>part.name)]},
  same:same.actors.map(({id,name,age,alive})=>({id,name,age,alive})),older,map:{marks:marks.length,onScreenActors:marksIds.length},
  putMs,readMs,samples,wallMs:performance.now()-startup,peakRssKiB:proc.resourceUsage().maxRSS,memoryAtEnd:proc.memoryUsage()});
await writeExclusive('summary.json',summary+'\n');
console.log(summary);
