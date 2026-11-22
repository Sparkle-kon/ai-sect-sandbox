import {join,open,readFile} from './centuryNodeRuntime';
import {CAMPAIGN_SOURCE_MAX_BYTES, CampaignPersistenceError,campaignHashValid,campaignRecord,campaignSHA256,sealCampaignSource} from '../src/engine/campaignMemento';
import {decodeEraWorldSave} from '../src/engine/storageEngine';
import {createTimeline,recordTimelineWorld,type WorldTimeline} from '../src/engine/timelineEngine';

declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];exitCode?:number;resourceUsage():{maxRSS:number};memoryUsage():{rss:number};version:string};
const [source,countArg,reportPath,...rest]=process.argv.slice(2);
const requested=Number(countArg);
const oldRule='5d191e72812e93f7afa74c1d7a8ec8d4c15b43564e202cc20479591e39952fb0';
const expectedTopologySeven='8149d606d1df8b34003065676522ff62b9a19354a55fc40e31acb1bcceee0266';
const collect=()=>{(globalThis as typeof globalThis&{gc?:()=>void}).gc?.();};
const start=performance.now();
function check(valid:unknown,message:string):asserts valid{if(!valid)throw Error(message);}
async function main(){
 check(source&&reportPath&&[7,8].includes(requested)&&!rest.length,'Usage: vite-node scripts/measureLegacyCampaignBoundary.ts FRAME_DIR 7|8 NEW_REPORT.json');
 check(__SECT_UTILITY_RULE_VERSION__===oldRule,'Run using exact E3-1 original legacy cap.');
 const proof:unknown=JSON.parse(await readFile(join(source,'late-head-proof.json'),'utf8'));
 check(campaignRecord(proof)&&proof.historicalRule===oldRule&&Array.isArray(proof.rawFrames)&&proof.rawFrames.length===8,'Not the proven historical frame set.');
 const encoder=new TextEncoder(), paths=proof.rawFrames.slice(0,requested);
 let timeline:WorldTimeline|undefined, rawBytes=0;
 for(let index=0;index<paths.length;index++){
  const known:unknown=paths[index];
  const tick=1201+index, name=`late-head-t${tick}.world.json`;
  check(campaignRecord(known)&&known.tick===tick&&known.path===name&&campaignHashValid(known.sha256),'Invalid historical proof entry.');
  const native=await readFile(join(source,name),'utf8');
  const bytes=encoder.encode(native);
  check(bytes.byteLength===known.bytes&&await campaignSHA256(bytes)===known.sha256,'Actual old benchmark input changed.');
  const world=decodeEraWorldSave(native);
  check(world.tick===tick&&world.year===1101&&world.month===index+1,'Strict readback date mismatch.');
  timeline=timeline?recordTimelineWorld(timeline,world):createTimeline(world);
  rawBytes+=bytes.byteLength; collect();
 }
 check(timeline&&timeline.branches[0].snapshots.length===requested,'All exact frames must make it into the old call.');
 const restoredInputMs=Math.round(performance.now()-start), before=process.memoryUsage().rss;
 const actualActive=timeline.branches[0].snapshots.at(-1)!.world;
 const sealStart=performance.now();
 let sealedBytes:number|undefined, topologySha256:string|undefined, refusal:string|undefined;
 try{
  const native=await sealCampaignSource(timeline,'e38-disposable',actualActive);
  sealedBytes=native.blobs.reduce((sum,row)=>sum+row.bytes,0);
  topologySha256=native.topologySha256;
 }catch(error){if(!(error instanceof CampaignPersistenceError))throw error;refusal=error.code;}
 const sealMs=Math.round(performance.now()-sealStart);
 check(requested===7?sealedBytes===rawBytes&&rawBytes===127494893&&topologySha256===expectedTopologySeven&&!refusal:
  rawBytes===145900820&&sealedBytes===undefined&&refusal==='size','Legacy limit no longer matches the original production gate.');
 check(timeline.branches[0].snapshots.length===requested&&timeline.branches[0].snapshots.at(-1)?.world===actualActive,'Legacy probing must not change source or retained history.');
 const result={ruleVersion:oldRule,nodeVersion:process.version,frames:requested,rawBytes,cap:CAMPAIGN_SOURCE_MAX_BYTES,
  result:refusal==='size'?'refused_exact_size':'sealed',preservedFrames:timeline.branches[0].snapshots.length,sealedBytes,topologySha256,
  loadingAndStrictParseMs:restoredInputMs,legacySealOnlyMs:sealMs,totalMs:Math.round(performance.now()-start),beforeSealRssBytes:before,
  peakRssKiB:process.resourceUsage().maxRSS,scope:'Native production sealCampaignSource using identical on-disk raw sources, with live head identity shared with final native snapshot. Separate Node process; no persistence quota or full old readback measured.'};
 const fd=await open(reportPath,'wx');
 try{await fd.writeFile(JSON.stringify(result,null,2)+'\n');await fd.sync();}finally{await fd.close();}
 console.log(JSON.stringify(result));
}
try{await main();}catch(error){console.error(String(error));process.exitCode=1;}
