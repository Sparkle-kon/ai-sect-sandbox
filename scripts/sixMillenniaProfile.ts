import {getActorRosterPage} from '../src/components/ActorRoster';
import {createTerrainMapView,mapActorPositions} from '../src/components/terrainMapView';
import {DEFAULT_CAMERA} from '../src/components/mapCamera';
import {planActorMarkers} from '../src/components/mapActorClusters';
import {projectEraHistory} from '../src/engine/eraHistoryIndex';
import {projectVillageCensus} from '../src/engine/villageCensusEngine';
import {inspectPhysicalAtlas,physicalAtlasHome} from '../src/engine/physicalAtlasEngine';
import {ERA_CHECKPOINT_MANIFEST_BYTES,ERA_CHECKPOINT_NATIVE_JSON_BYTES,ERA_CHECKPOINT_MAX_BYTES,ERA_CHECKPOINT_PART_BYTES,verifyEraCheckpoint,type EraInput} from '../src/engine/eraCheckpointEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {regionForPoint} from '../src/engine/simulationRegionGeometry';
import {cpus,join,mkdir,open,readFile,stat} from './centuryNodeRuntime';

declare const __SECT_UTILITY_RULE_VERSION__:string;
function check(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}
interface Proc {
  argv:string[];version:string;arch:string;platform:string;
  resourceUsage():{maxRSS:number};
  memoryUsage():{rss:number;heapTotal:number;heapUsed:number;external:number;arrayBuffers:number};
}
const node='node:process',crypto='node:crypto',paths='node:path';
const proc=(await import(node) as {default:Proc}).default;
const {webcrypto}=await import(crypto) as {webcrypto:Crypto};
const {basename,resolve}=await import(paths) as {basename(path:string):string;resolve(path:string):string};
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const [output,manifestPath,...parts]=proc.argv.slice(2);
check(output&&manifestPath&&parts.length>=1&&parts.length<=ERA_CHECKPOINT_MAX_BYTES/ERA_CHECKPOINT_PART_BYTES&&
  new Set([manifestPath,...parts].map(path=>resolve(path))).size===parts.length+1,
  'Usage: vite-node scripts/sixMillenniaProfile.ts <new-output-dir> <native-file.era> <every-native-part.json...>');
const start=performance.now();
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
async function bounded(path:string,max:number){
  const info=await stat(path) as {size:number;isFile():boolean};
  check(info.isFile()&&info.size>0&&info.size<=max,'Invalid input file/size '+basename(path));
  const bytes=await readFile(path);check(bytes.byteLength===info.size,'Input size changed '+basename(path));
  return bytes;
}
const input=(bytes:Uint8Array):EraInput=>({size:bytes.byteLength,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
async function loadPhysical() {
  // Ordered, bounded aggregate read; avoids opening more than the manifest/part cap together.
  const manifest=await bounded(manifestPath,ERA_CHECKPOINT_MANIFEST_BYTES);
  const native:Uint8Array[]=[];
  let total=0;
  for(const path of parts){
    const bytes=await bounded(path,Math.min(ERA_CHECKPOINT_NATIVE_JSON_BYTES,ERA_CHECKPOINT_MAX_BYTES+parts.length*40-total));
    native.push(bytes);total+=bytes.byteLength;
  }
  return {manifest,native};
}
function verifyPhysical(value:Awaited<ReturnType<typeof loadPhysical>>){
  return verifyEraCheckpoint(input(value.manifest),value.native.map(input),codec);
}
const firstReadStart=performance.now();
const bytes=await loadPhysical();
const firstReadMs=performance.now()-firstReadStart;
const firstVerifyStart=performance.now();
const verified=await verifyPhysical(bytes);
const firstVerifyMs=performance.now()-firstVerifyStart;
const {world,manifest}=verified;
check(!world.regionalSimulation&&!world.authoredEraOrigin&&!world.scenarioOrigin&&world.random.seed===1&&world.tick>=36034&&
  !world.cultivators.some(actor=>actor.id.startsWith('analysis-roster-')),
  'This probe expects a numeric native E39+ lower lineage, not an authored, regional, or synthetic archive');
const identities=new Set(world.cultivators.map(actor=>actor.id));
check(identities.size===world.cultivators.length&&identities.has('elder-danxia-1')&&identities.has('npc-1'),
  'Original stable identities unavailable');
const earliest=world.coldWaterVein?.openings.find(row=>row.id==='water-gate-8');
const charter=world.northMiningCharters?.charters.find(row=>row.id==='north-mining-charter-12');
const cargo=world.villageSupply.agreements.find(row=>row.id===charter?.firstPassage?.agreementId);
check(earliest?.openedTick===8&&earliest.completedTick===14&&earliest.borrowedUnits===9&&earliest.wellProjectId==='village-work-1'&&
  charter?.firstPassage?.tick===23&&charter.firstPassage.tileId==='tile-13-2'&&cargo?.closedTick===34&&cargo.status==='completed',
  'Original native well, charter or freight identity missing');
const actor=world.cultivators.find(row=>row.id==='elder-danxia-1')!;
const oldViewer=actor.alive&&actor.hp>0?actor:undefined;
const village=world.settlements.villages.find(row=>row.locationId==='loc-vein-north');
check(village,'Original named village absent');
const camera={width:390,height:234};
const names=()=>getActorRosterPage(world,'闻春岚','all',0);
const livingPage=()=>getActorRosterPage(world,'','living',0);
const fallenHistory=()=>projectEraHistory(world,{kind:'actor',id:'npc-1'});
const beforeHistory=()=>projectEraHistory(world,{kind:'actor',id:'npc-1'},undefined,8280);
const census=()=>projectVillageCensus(world,oldViewer,village.id,world.tick);
const canvas=()=>{
  const view=createTerrainMapView(world,undefined,false);
  return planActorMarkers(mapActorPositions(view.seenLocations,view.liveActors,view.trailPositions),DEFAULT_CAMERA,camera,actor.id);
};
const named=names(), living=world.cultivators.filter(row=>row.alive&&row.hp>0), old=fallenHistory();
check(named.actors.some(row=>row.id===actor.id)&&livingPage().total===living.length,
  'Production roster did not retain exact historical and living identities');
check(old.some(row=>row.receipt.kind==='death'&&row.receipt.actorId==='npc-1'&&row.receipt.tick===8281)&&
  !beforeHistory().some(row=>row.receipt.eventId==='evt-8281-npc-1-oldage'),'Original stable-ID history or cutoff failed');
const censusResult=census();
check(!projectVillageCensus(world,undefined,village.id,world.tick)&&(!censusResult||censusResult.villageId===village.id),
  'Anonymous census disclosure or wrong site');
const rendered=canvas();
const renderedIds=rendered.flatMap(row=>row.kind==='cluster'?row.ids:[row.point.actor.id]);
check(renderedIds.every(id=>living.some(row=>row.id===id)),'Canvas supplied a deceased/foreign marker');
const raw:Record<string,number[]>={};
function statistics(label:string,recorded:number[]){
  check(recorded.length>0&&recorded.every(ms=>Number.isFinite(ms)&&ms>=0),'Invalid timings '+label);
  raw[label]=recorded;
  const values=[...recorded].sort((a,b)=>a-b);
  const at=(fraction:number)=>Number(values[Math.ceil(values.length*fraction)-1].toFixed(6));
  return {count:values.length,p50Ms:at(.5),p95Ms:at(.95),maxMs:at(1)};
}
function sample<T>(label:string,run:()=>T){
  for(let i=0;i<50;i++)run();
  const samples:number[]=[];
  let last:T|undefined;
  for(let i=0;i<500;i++){
    const before=performance.now();last=run();samples.push(performance.now()-before);
  }
  // Consume the last output outside the measured interval, not a JSON encode or GC claim for the query.
  check(last===undefined||typeof last==='object','Unexpected primitive query '+label);
  return statistics(label,samples);
}
const query={
  rosterExactName:sample('rosterExactName',names),rosterLivingPage:sample('rosterLivingPage',livingPage),
  eraKnownHistoricalDeath:sample('eraKnownHistoricalDeath',fallenHistory),eraBeforeKnownDeath:sample('eraBeforeKnownDeath',beforeHistory),
  scopedVillageCensus:sample('scopedVillageCensus',census),canvasProjectionAndMarkerPlan:sample('canvasProjectionAndMarkerPlan',canvas),
};
const repeatRead:number[]=[],repeatVerify:number[]=[];
for(let i=0;i<20;i++){
  const readAt=performance.now();
  const frame=await loadPhysical();
  repeatRead.push(performance.now()-readAt);
  const verifyAt=performance.now();
  const replay=await verifyPhysical(frame);
  repeatVerify.push(performance.now()-verifyAt);
  check(replay.manifest.id===manifest.id&&replay.manifest.payloadSha256===manifest.payloadSha256,'Concurrent input changed while profiling');
}
const endBytes=await loadPhysical();
const equal=(a:Uint8Array,b:Uint8Array)=>a.byteLength===b.byteLength&&a.every((item,i)=>item===b[i]);
check(equal(bytes.manifest,endBytes.manifest)&&bytes.native.every((part,i)=>equal(part,endBytes.native[i])), 'Original physical files changed');
const physical=inspectPhysicalAtlas(world);
const livingHomes=living.map(row=>({actorId:row.id,lowerRegion:physicalAtlasHome(world,row)?.point.regionId??null}));
const population=world.settlements.villages.map(row=>{
  const address=world.locations.find(place=>place.id===row.locationId);
  return {id:row.id,residents:row.population,lowerRegion:address?regionForPoint(world,address)??null:null};
});
check(population.every(row=>row.lowerRegion!==null),'Mortal aggregate lacks actual old address');
const report={
  scope:'Strict native query-only; no turns or world transformation; counts are this inspected frame, not nine-domain corpus',
  engineRule:__SECT_UTILITY_RULE_VERSION__,archiveRule:manifest.engineRuleVersion,manifestId:manifest.id,sha:manifest.payloadSha256,
  source:{tick:world.tick,year:world.year,month:world.month,archive:[basename(manifestPath),...parts.map(path=>basename(path))],sourceBytesUnchanged:true},
  size:{files:parts.length+1,payloadBytes:manifest.payloadBytes,physicalBytes:bytes.native.reduce((sum,part)=>sum+part.byteLength,bytes.manifest.byteLength)},
  population:{registeredCultivators:identities.size,livingCultivators:living.length,ordinaryVillageResidents:population.reduce((sum,row)=>sum+row.residents,0),
    villages:population,cultivatorsPhysicalLowerEvidence:livingHomes},
  geography:{legacyLowerRegistry:physical.regions.map(row=>row.id),actualLivingLowerChartRegions:[...new Set(livingHomes.map(row=>row.lowerRegion).filter(Boolean))],
    actualMortalVillageLowerRegions:[...new Set(population.map(row=>row.lowerRegion))],
    activeIndependentFrontierVisits:world.frontier?.visits.filter(row=>row.exitedTick===undefined&&row.deceasedTick===undefined).length??0,
    activeIndependentUpperFieldVisits:world.upperArrayField?.visits.filter(row=>row.exitedTick===undefined&&row.deceasedTick===undefined).length??0},
  querySetup:{name:'闻春岚',rosterExactNameReturned:named.total,eraHistoryStableActorId:'npc-1',eraPositiveRows:old.length,upperCutoffTick:8280,
    censusViewer:oldViewer?.id??null,censusObserved:!!censusResult,censusTick:world.tick,canvasViewport:camera,
    plannedMarkers:rendered.length,onScreenActors:renderedIds.length,warmupPerQuery:50},
  query,archiveRead:{firstOSReadMs:firstReadMs,firstStrictVerifyMs:firstVerifyMs,repeatOperatingSystemRead:statistics('physicalRead',repeatRead),
    repeatStrictVerify:statistics('strictVerify',repeatVerify)},
  process:{node:proc.version,platform:proc.platform,arch:proc.arch,cpu:cpus()[0]?.model,peakRssKiB:proc.resourceUsage().maxRSS,endBytes:proc.memoryUsage(),
    measuredWallMs:performance.now()-start},
  caveat:'First process read can be OS-cached; verify includes parsing and integrity checks. Node queries are not Canvas painting, FPS, touch or Android memory.',
};
await mkdir(output,{recursive:false});
for(const [file,contents] of [['summary.json',report],['samples.json',raw]] as const){
  const handle=await open(join(output,file),'wx');try{await handle.writeFile(JSON.stringify(contents,null,2)+'\n');}finally{await handle.close();}
}
console.log(JSON.stringify(report));
