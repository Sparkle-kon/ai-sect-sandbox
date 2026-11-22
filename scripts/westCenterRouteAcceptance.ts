import {join,mkdir,open,platform,readFile} from './centuryNodeRuntime';
import {campaignSHA256} from '../src/engine/campaignMemento';
import {prepareEraCheckpoint,verifyEraCheckpoint} from '../src/engine/eraCheckpointEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {moveWestTrip,runNativeWestCenterCrossing} from '../tests/fixtures/westCenterNativeFixture';
import type {WorldState} from '../src/types/world';

declare const process:{argv:string[];exitCode?:number;resourceUsage():{maxRSS:number}};
declare const __SECT_UTILITY_RULE_VERSION__:string;
const started=performance.now();
const [destination,...extra]=process.argv.slice(2);
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const check=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
const readInput=async(path:string)=>{
  const bytes=await readFile(path);
  return {size:bytes.byteLength,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
};
async function write(path:string,content:Uint8Array|string){
  const fd=await open(path,'wx');
  try{await fd.writeFile(content);await fd.sync();}finally{await fd.close();}
}
async function syncDir(path:string){
  if(platform()==='win32')return;
  const handle=await open(path,'r');
  try{await handle.sync();}finally{await handle.close();}
}
async function main(){
  if(!destination||extra.length)throw Error('Usage: vite-node scripts/westCenterRouteAcceptance.ts NEW_OUTPUT_DIRECTORY');
  const {ready,arrived,returnInitial,finished,...witness}=runNativeWestCenterCrossing();
  await mkdir(destination,{recursive:false});
  const rows:{tick:number;name:string;manifestId:string;sha256:string;size:number;files:string[]}[]=[];
  async function seal(world:WorldState,name:string){
    const packed=await prepareEraCheckpoint(world,{branchId:name,label:'西中旧界真实巡礼'},codec,{engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
    const output=[packed.manifestFile,...packed.parts], filenames=output.map(file=>`t${world.tick}-${file.name}`);
    for(let i=0;i<output.length;i++)await write(join(destination,filenames[i]),output[i].bytes);
    await syncDir(destination);
    const disk=await Promise.all(filenames.map(filename=>readInput(join(destination,filename))));
    const restored=await verifyEraCheckpoint(disk[0],disk.slice(1).reverse(),codec);
    const raw=encodeEraWorldSave(world);
    check(encodeEraWorldSave(restored.world)===raw,'Decoded bytes differ from the actual native frame.');
    check(await campaignSHA256(new TextEncoder().encode(raw))===packed.manifest.payloadSha256,'Payload digest mismatch.');
    rows.push({tick:world.tick,name,manifestId:packed.manifest.id,sha256:packed.manifest.payloadSha256,
      size:packed.manifest.payloadBytes,files:filenames});
    return restored.world;
  }
  const before=await seal(ready,'paid-road-before');
  const paid=await seal(arrived,'paid-road-arrived');
  const mid=await seal(returnInitial,'return-physical-checkpoint');
  const end=await seal(finished,'both-travelers-reached-west');
  check(encodeEraWorldSave(moveWestTrip(before,witness.roadId))===encodeEraWorldSave(paid),'Loaded toll departure reached different bytes.');
  check(encodeEraWorldSave(moveWestTrip(mid))===encodeEraWorldSave(moveWestTrip(returnInitial)),'Loaded reverse next stride differs.');
  check(end.roads.crossings.length===1,'An ordinary return must not acquire another toll receipt.');
  const report={scope:'Native seed 11401 classic; real chart, monthly route, payment and readback; no injected locations, terrain, exploration or funds',
    ruleVersion:__SECT_UTILITY_RULE_VERSION__,elapsedMs:Math.round(performance.now()-started),peakRssKiB:process.resourceUsage().maxRSS,
    directAndRestoredRoadArrivalEqual:true,directAndRestoredReverseNextEqual:true,rows,...witness};
  await write(join(destination,'west-center-route-result.json'),JSON.stringify(report,null,2)+'\n');
  await syncDir(destination);
  console.log(JSON.stringify(report));
}
try{await main();}catch(error){console.error(String(error));process.exitCode=1;}
