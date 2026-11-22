import {join,mkdir,open,platform,readFile} from './centuryNodeRuntime';
import {createTimeline} from '../src/engine/timelineEngine';
import {verifyEraCheckpoint} from '../src/engine/eraCheckpointEngine';
import {campaignSHA256,sealCampaignWorld} from '../src/engine/campaignMemento';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';
declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];exitCode?:number;resourceUsage():{maxRSS:number};memoryUsage():{rss:number}};
const oldRule='5d191e72812e93f7afa74c1d7a8ec8d4c15b43564e202cc20479591e39952fb0';
const oldSourceRule='62e5ec572bda61edbf4632e1ec0076ea73c414413ec804a0f507a1ffe99cda14';
const oldSourceSha='9962d29fe03c60b3c937e9592336e633c4b935bb13e23e5092e6aa5bf3884166';
const expected=[
 [1201,17805509,'bb615a03ea500030e0df692fa1ac46d2d0d4a2037f376c0261d5c9e39fa433f1'],
 [1202,18231714,'3c20d4e9bde3bfcddcd46916395a092707a7afe6996c0786193eea0b5ef64b6d'],
 [1203,18235475,'d0878bdf41c3338f8013cca0081de7318d72be17d729e297f4aaed18a0009a76'],
 [1204,18152254,'4eed52b0ffbb743eecd7c35e7d58863de89e647a2e171f3714a7b965072b42fd'],
 [1205,18404015,'c2e38461fce6b0f500033a79159e007bb21c88ab4322cd02300f3afce71994b1'],
 [1206,18198312,'fa628d7b6113ddbfa6654ef4d6cf31f6beeeaa2ab82244c4dbf29fc1e07937d0'],
 [1207,18467614,'e34474abff01ded41b02db0521828ee151e79b0d4d2b3f2565129193379a44cb'],
 [1208,18405927,'8469c41a3e2cfc8a5ce020889e67397da437be25c63b5d0782f6eb4be427b5eb'],
 [1209,18465728,'ad95d046cf3ebfbf27fcf53e8f5dd3265ed7a9d271aacd54542ea57839fd6a21'],
] as const;
const started=performance.now();
const [dest,sourceManifest,...sourceParts]=process.argv.slice(2);
const encoder=new TextEncoder();
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const collect=()=>{(globalThis as typeof globalThis&{gc?:()=>void}).gc?.();};
const report=(kind:string,details:unknown)=>console.log(JSON.stringify({kind,elapsedMs:Math.round(performance.now()-started),
  rule:__SECT_UTILITY_RULE_VERSION__,maxRssKiB:process.resourceUsage().maxRSS,rssBytes:process.memoryUsage().rss,details}));
function check(valid:unknown,message:string):asserts valid{if(!valid)throw Error(message);}
const readInput=async(path:string)=>{
 const data=await readFile(path);
 return {size:data.byteLength,arrayBuffer:async()=>Uint8Array.from(data).buffer};
};
async function write(path:string,data:Uint8Array|string){
 const fd=await open(path,'wx');
 try{await fd.writeFile(data);await fd.sync();}finally{await fd.close();}
}
async function syncDir(path:string){
 if(platform()==='win32')return;
 const fd=await open(path,'r');
 try{await fd.sync();}finally{await fd.close();}
}
function basename(path:string){return path.replace(/\\/gu,'/').split('/').at(-1)!;}
const fileOf=(tick:number)=>`late-head-t${tick}.world.json`;
const count=(w:WorldState)=>({tick:w.tick,year:w.year,month:w.month,registered:w.cultivators.length,living:w.cultivators.filter(a=>a.alive&&a.hp>0).length});
async function strictSource(){
 const initial=await verifyEraCheckpoint(await readInput(sourceManifest),await Promise.all(sourceParts.map(readInput)),codec);
 check(initial.world.tick===1201&&initial.manifest.payloadSha256===oldSourceSha&&initial.manifest.engineRuleVersion===oldSourceRule&&
   initial.manifest.payloadBytes===17805293,'Physical source is not exact E1-10 T1201.');
 return initial;
}
async function strictWrite(world:WorldState,plan:typeof expected[number],snapshot:boolean){
 const started=performance.now(), [tick,bytes,sha256]=plan;
 const source=snapshot?createTimeline(world).branches[0].snapshots[0].world:world;
 const actual=await sealCampaignWorld(source);
 check(actual.sha256===sha256&&actual.bytes===bytes,`Historical original T${tick} differs: ${actual.sha256} / ${actual.bytes}.`);
 const path=join(dest,fileOf(tick));
 await write(path,actual.content);
 const raw=await readFile(path,'utf8');
 check(raw===actual.content&&await campaignSHA256(encoder.encode(raw))===sha256,`Disk differs for T${tick}.`);
 const restored=decodeEraWorldSave(raw);
 check(restored.tick===tick&&restored.month===tick-1200&&restored.year===1101,`Invalid date in strict readback T${tick}.`);
 const row={...count(restored),bytes,sha256,path:fileOf(tick),elapsedMs:Math.round(performance.now()-started)};
 report('historical_frame_sealed',row);
 return row;
}
async function main(){
 check(dest&&sourceManifest&&sourceParts.length===5,'Usage: vite-node scripts/exactLateHeadArchiveProof.ts NEW_DIR ORIGIN.era FIVE_ORIGINAL_PARTS.era-part');
 check(__SECT_UTILITY_RULE_VERSION__===oldRule,'Use exact historical E3-1 build, not current game rules.');
 const initial=await strictSource();
 await mkdir(dest,{recursive:false});
 const sourceDir=join(dest,'original-e110-bundle');await mkdir(sourceDir,{recursive:false});
 for(const path of [sourceManifest,...sourceParts])await write(join(sourceDir,basename(path)),await readFile(path));
 await syncDir(sourceDir);await syncDir(dest);
 report('verified_actual_original',{...count(initial.world),manifestId:initial.manifest.id,sha256:oldSourceSha,bytes:17805293,rule:oldSourceRule,
   originalFiles:[sourceManifest,...sourceParts].map(basename)});
 let live=initial.world;
 const rows=[];
 for(const plan of expected.slice(0,8)){
  rows.push(await strictWrite(live,plan,true));
  collect();
  if(live.tick<1208){
   const previous=live.tick;
   live=advanceWorldTick(live,undefined,undefined,'utility');
   check(live.tick===previous+1,'Native month did not advance exactly once.');
  }
 }
 const nextDirect=advanceWorldTick(live,undefined,undefined,'utility');
 const direct=await strictWrite(nextDirect,expected[8],false);
 const restored=decodeEraWorldSave(await readFile(join(dest,fileOf(1208)),'utf8'));
 const rereadNext=await sealCampaignWorld(advanceWorldTick(restored,undefined,undefined,'utility'));
 check(rereadNext.sha256===direct.sha256&&rereadNext.content===await readFile(join(dest,fileOf(1209)),'utf8'),
   'Restored T1208 native continuation does not match direct T1209.');
 const summary={historicalRule:oldRule,source:{rule:oldSourceRule,sha256:oldSourceSha,bytes:17805293,manifestId:initial.manifest.id,
  provenanceDirectory:'original-e110-bundle',files:[sourceManifest,...sourceParts].map(basename)},
  rawFrames:rows,byteSum:rows.reduce((sum,row)=>sum+row.bytes,0),priorSeven:rows.slice(0,7).reduce((sum,row)=>sum+row.bytes,0),
  exactT1209:direct,reloadedNativeT1209ByteEqual:true,sourceKind:'same genuine original strict source, untouched native Utility months'};
 check(summary.byteSum===145900820&&summary.priorSeven===127494893,'Unexpected historical native raw totals.');
 await write(join(dest,'late-head-proof.json'),JSON.stringify(summary,null,2)+'\n');
 await syncDir(dest);
 report('exact_historical_eight_frames_complete',summary);
}
try{await main();}catch(error){report('actual_blocker',{error:String(error)});process.exitCode=1;}
