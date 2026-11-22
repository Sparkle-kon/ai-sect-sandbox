import {isLivingSixMillenniaActor as alive,sixMillenniaNativeOrders as nativeOrders,sixMillenniaQueryPercentiles,
  SIX_MILLENNIA_CONTROLLER as controller,SIX_MILLENNIA_ROOT_TICK as originalFreightTick,SIX_MILLENNIA_SOURCE_TICK as sourceTick,
  SIX_MILLENNIA_TERM_TICK as goalTick,SIX_MILLENNIA_SEAL_INTERVAL as sealEvery,
  SIX_MILLENNIA_STEWARD as stewardId,SIX_MILLENNIA_WELL as siteId} from './sixMillenniaControls';
import { join, mkdir, open, readFile, stat } from './centuryNodeRuntime';
import { prepareEraCheckpoint, verifyEraCheckpoint } from '../src/engine/eraCheckpointEngine';
import { inspectPhysicalAtlas } from '../src/engine/physicalAtlasEngine';
import { projectEraEntryCandidates } from '../src/engine/eraEntryCandidates';
import { projectEraHistory } from '../src/engine/eraHistoryIndex';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { ActionType, LLMDecisionPayload, WorldState } from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__: string;
declare const process:{argv:string[];platform:string;exitCode?:number;resourceUsage():{maxRSS:number}};
const assertModule='node:assert/strict',cryptoModule='node:crypto',pathModule='node:path';
const assertions=await import(assertModule) as {equal(actual:unknown,expected:unknown):void;deepEqual(actual:unknown,expected:unknown):void};
const {createHash}=await import(cryptoModule) as {createHash(algorithm:'sha256'):{update(bytes:string|Uint8Array):{digest(encoding:'hex'):string}}};
const {basename,resolve}=await import(pathModule) as {basename(path:string):string;resolve(path:string):string};
function check(value:unknown,message='原生验收断言不符。'):asserts value{if(!value)throw Error(message);}
const sourceCommit='a8e313e47eb4d6c3e851aeed171a141c15137997';
const frozenRule='09b2223463cc0995a00ebcc1eb7a32c7a6ac9dfc71b71bd0e3545f8ceac23203';
const sourceRule='22f5d7d59d73da2bc436d166a467521d7d63bafc43c6282c304fc543b4ed9048';
const sourceManifest='60cdafea55d32da5b8412c268447db7980592d2bc25ee4102ff66808f01929f0';
const sourceDigest='ff529b63832705b957d174c1099589bb410cdb269c5356344c8075c30175d239';
const sourceManifestFileDigest='9dbc48f7c44c7e1d56bd80939dcab796d60be5895ae50982d58b1062c9178eec';
const charterId='north-mining-charter-12', villageId='village-loc-vein-north';
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const start=performance.now();
const sha=(text:string|Uint8Array)=>createHash('sha256').update(text).digest('hex');
const info=(kind:string,details:unknown)=>console.log(JSON.stringify({kind,elapsedMs:Math.round(performance.now()-start),maxRssKiB:process.resourceUsage().maxRSS,
  kernelCommit:sourceCommit,ruleVersion:frozenRule,details}));
const counted:Partial<Record<ActionType,number>>={};
const nativeInput=async(path:string)=>{
  const meta=await stat(path) as {size:number;isFile():boolean};
  check(meta.isFile(),`Not a physical file: ${basename(path)}`);
  return {size:meta.size,arrayBuffer:async()=>Uint8Array.from(await readFile(path)).buffer};
};
const persist=async(path:string,bytes:string|Uint8Array)=>{
  const file=await open(path,'wx');
  try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
};
const directorySeal=async(path:string)=>{
  // Directory fsync is supported by the Linux verification environment. Windows closes each file above.
  if(process.platform==='win32')return;
  const directory=await open(path,'r');
  try{await directory.sync();}finally{await directory.close();}
};
const nextWith=(world:WorldState,decisions:Record<string,LLMDecisionPayload>)=>advanceWorldTick(world,decisions,undefined,'utility');
const agent=(world:WorldState,id=stewardId)=>world.cultivators.find(person=>person.id===id);
function summary(world:WorldState){
  const original=agent(world);
  return {date:{tick:world.tick,year:world.year,month:world.month},living:world.cultivators.filter(alive).length,
    registered:world.cultivators.length,lowerResidents:world.settlements.villages.reduce((sum,v)=>sum+v.population,0),
    northPopulation:world.settlements.villages.find(v=>v.id===villageId)?.population,
    northStage:world.villageEvolution.villages.find(v=>v.settlementId===villageId)?.status,
    survivingSteward:original&&alive(original)?{id:original.id,age:original.age,lifespan:original.lifespan,realm:original.realm,
      stage:original.realmStage,siteId:original.locationId,wallet:original.spiritStones,sectId:original.sectId,rank:original.sectRank}:undefined,
    furtherExactNativeMonths:world.tick-sourceTick,exactNativeMonthsSinceFreight:world.tick-originalFreightTick,
    geography:{lower:inspectPhysicalAtlas(world).regions,frontierReached:[...new Set(world.frontier?.visits.map(row=>row.regionId)??[])],
      arrayFieldReached:(world.upperArrayField?.visits.length??0)>0,
      frontierHomes:world.frontier?.residences.length??0,arrayHomes:world.upperArrayField?.residences.length??0},
    regionalAnnualYears:0,authoredYears:0};
}

function probeParity(direct:WorldState,reopened:WorldState):string{
  const one=encodeEraWorldSave(nextWith(direct,nativeOrders(direct)));
  const other=encodeEraWorldSave(nextWith(reopened,nativeOrders(reopened)));
  assertions.equal(other,one);
  return sha(one);
}
function profile(world:WorldState){
  const queries=[
    {kind:'physicalAtlas',run:()=>inspectPhysicalAtlas(world).regions.length},
    {kind:'northHistory',run:()=>projectEraHistory(world,{kind:'settlement',id:villageId},undefined,world.tick).length},
    {kind:'presentCandidates',run:()=>projectEraEntryCandidates(world,siteId,stewardId).length},
  ];
  return queries.map(query=>{
    let observations=0;
    for(let i=0;i<20;i++)query.run();
    const samples=[];
    for(let i=0;i<200;i++){
      const begin=performance.now();observations+=query.run();samples.push(performance.now()-begin);
    }
    return {query:query.kind,warmup:20,observations,...sixMillenniaQueryPercentiles(samples)};
  });
}

async function main(){
  const [outputArg,sourceArg,...partArgs]=process.argv.slice(2);
  if(!outputArg||!sourceArg||!partArgs.length||new Set(partArgs.map(part=>resolve(part))).size!==partArgs.length)
    throw Error('Usage: vite-node scripts/sixMillenniaAcceptance.ts NEW_OUTPUT_DIRECTORY SOURCE.era SOURCE_PART.json [MORE_SOURCE_PARTS.json ...]');
  if(__SECT_UTILITY_RULE_VERSION__!==frozenRule)
    throw Error(`Rule fingerprint mismatch. Run with the verified E47 rules at ${sourceCommit} (expected ${frozenRule}).`);
  const output=resolve(outputArg), paths=[sourceArg,...partArgs].map(path=>resolve(path));
  if(new Set(paths).size!==paths.length||paths.length!==2)
    throw Error('Supply the exact original two physical files once each: manifest, then native payload.');
  const physicalHashes=()=>Promise.all(paths.map(async (path,index)=>{
    const metadata=await stat(path) as {size:number;isFile():boolean};
    const size=index===0?600:691834;
    check(metadata.isFile()&&metadata.size===size,'Unexpected physical source byte count: '+basename(path));
    const raw=await readFile(path);
    check(raw.byteLength===size,'Physical source changed while reading: '+basename(path));
    return sha(raw);
  }));
  const physicalSourceHashes=await physicalHashes();
  assertions.deepEqual(physicalSourceHashes,[sourceManifestFileDigest,sourceDigest]);
  const initialInputs=await Promise.all(paths.map(nativeInput));
  const baseline=await verifyEraCheckpoint(initialInputs[0],initialInputs.slice(1),codec);
  const originalRaw=encodeEraWorldSave(baseline.world);
  assertions.equal(baseline.manifest.id,sourceManifest);
  assertions.equal(baseline.manifest.engineRuleVersion,sourceRule);
  assertions.equal(baseline.manifest.payloadSha256,sourceDigest);
  assertions.equal(sha(originalRaw),sourceDigest);
  assertions.deepEqual([baseline.world.tick,baseline.world.year,baseline.world.month],[sourceTick,4003,10]);
  const oldCharter=baseline.world.northMiningCharters?.charters.find(row=>row.id===charterId);
  check(oldCharter?.firstPassage?.agreementId);
  const oldFreight=baseline.world.villageSupply.agreements.find(row=>row.id===oldCharter.firstPassage?.agreementId);
  const oldWell=baseline.world.villageWorks.projects.find(row=>row.id===oldCharter.wellProjectId);
  const oldOpening=baseline.world.coldWaterVein?.openings.find(row=>row.id===oldCharter.openingId);
  check(oldFreight&&oldWell&&oldOpening);
  assertions.equal(oldFreight.status,'completed');assertions.equal(oldFreight.closedTick,originalFreightTick);
  assertions.deepEqual(oldFreight.legs?.map(leg=>leg.phase),['delivered','delivered']);
  assertions.equal(oldCharter.firstPassage.tick,23);assertions.equal(oldCharter.firstPassage.tileId,'tile-13-2');
  assertions.equal(oldWell.status,'completed');assertions.equal(oldWell.settledTick,5);
  assertions.deepEqual([oldOpening.openedTick,oldOpening.completedTick,oldOpening.paidStones,oldOpening.borrowedUnits],[8,14,40,9]);
  assertions.equal(baseline.world.upperPassage,undefined);
  const inheritedRoster=new Set(baseline.world.cultivators.map(person=>person.id));
  assertions.equal(inheritedRoster.size,22);
  // Exclusive fresh directory. Never append to, replace, or clean any existing output, even after a failure.
  await mkdir(output,{recursive:false});
  const seals:{tick:number;manifestId:string;payloadSha256:string;chainDigest:string;bytes:number;physicalBytes:number}[]=[];
  const original={tick:sourceTick,manifestId:sourceManifest,payloadSha256:sourceDigest,chainDigest:sha(JSON.stringify(
    {sourceRule,tick:sourceTick,manifestId:sourceManifest,payloadSha256:sourceDigest}))};
  let parent=original;
  let lastVerifiedTick=sourceTick;
  async function makeSeal(world:WorldState){
    assertions.equal(world.tick-parent.tick,sealEvery);
    const packed=await prepareEraCheckpoint(world,{branchId:'e48-native-continued-from-e39',label:'原井六千年原生逐月承继'},codec,
      {engineRuleVersion:frozenRule});
    const files=[packed.manifestFile,...packed.parts];
    const pathsHere=files.map(file=>join(output,`t${world.tick}-${file.name}`));
    for(let i=0;i<files.length;i++)await persist(pathsHere[i],files[i].bytes);
    await directorySeal(output);
    const verifiedFiles=await Promise.all(pathsHere.map(nativeInput));
    const reread=await verifyEraCheckpoint(verifiedFiles[0],verifiedFiles.slice(1).reverse(),codec);
    const directRaw=encodeEraWorldSave(world);
    assertions.equal(encodeEraWorldSave(reread.world),directRaw);
    assertions.equal(sha(directRaw),packed.manifest.payloadSha256);
    const core={tick:world.tick,manifestId:packed.manifest.id,payloadSha256:packed.manifest.payloadSha256,
      bytes:packed.manifest.payloadBytes,physicalBytes:files.reduce((sum,file)=>sum+file.bytes.byteLength,0),
      filenames:pathsHere.map(path=>basename(path)),previous:parent,ruleVersion:frozenRule,
      nextMonthSha256:probeParity(world,reread.world)};
    const row={...core,chainDigest:sha(JSON.stringify(core))};
    await persist(join(output,`t${world.tick}-seal.json`),JSON.stringify({lineage:row,observed:summary(world)},null,2)+'\n');
    await directorySeal(output);
    seals.push(row);parent={tick:row.tick,manifestId:row.manifestId,payloadSha256:row.payloadSha256,chainDigest:row.chainDigest};
    lastVerifiedTick=world.tick;
    info('strict_readback',{lineage:row,observed:summary(world),
      ...((world.tick-sourceTick)%18000===0?{queries:profile(world)}:{})});
    return reread.world;
  }
  let world=baseline.world;
  const nativePromotions:{tick:number;from:string;to:string;age:number;lifespan:number}[]=[];
  const injuries:{tick:number;hpBefore:number;hpAfter:number}[]=[];
  info('source_verified',{observed:summary(world),source:original,sourceRule,physicalSourceHashes,controller,queries:profile(world)});
  try {
    while(world.tick<goalTick){
      const before=world, previousSteward=agent(before);
      const decisions=nativeOrders(before);
      for(const decision of Object.values(decisions))counted[decision.chosenAction]=(counted[decision.chosenAction]??0)+1;
      world=nextWith(before,decisions);
      assertions.equal(world.tick,before.tick+1);
      assertions.deepEqual([world.year,world.month],[1001+Math.floor((world.tick-1)/12),(world.tick-1)%12+1]);
      check(!world.regionalSimulation&&!world.authoredEraOrigin&&!world.scenarioOrigin&&!world.northWellRevisitLaw);
      const now=agent(world);
      if(previousSteward&&now&&decisions[stewardId]?.chosenAction==='BREAKTHROUGH'){
        if(now.hp<previousSteward.hp&&world.events.some(event=>event.id===`evt-${world.tick}-${stewardId}-fail`))
          injuries.push({tick:world.tick,hpBefore:previousSteward.hp,hpAfter:now.hp});
        if(now.realm!==previousSteward.realm){
          check(world.events.some(event=>event.id===`evt-${world.tick}-${stewardId}-break`));
          nativePromotions.push({tick:world.tick,from:previousSteward.realm,to:now.realm,age:now.age,lifespan:now.lifespan});
          info('native_breakthrough',nativePromotions.at(-1));
        }
      }
      if((world.tick-sourceTick)%sealEvery===0){
        check([...inheritedRoster].every(id=>!!agent(world,id)));
        assertions.deepEqual(world.northMiningCharters?.charters.find(row=>row.id===charterId),oldCharter);
        assertions.deepEqual(world.villageSupply.agreements.find(row=>row.id===oldFreight.id),oldFreight);
        assertions.deepEqual(world.villageWorks.projects.find(row=>row.id===oldWell.id),oldWell);
        assertions.deepEqual(world.coldWaterVein?.openings[0],oldOpening);
        world=await makeSeal(world);
      }
    }
  }catch(error){
    info('verified_prefix_blocked',{attemptedTick:world.tick,lastVerifiedTick,parent,error:String(error)});
    throw error;
  }
  assertions.deepEqual([world.tick,world.year,world.month],[goalTick,7003,10]);
  assertions.equal(seals.length,30);
  const reloadedInputs=await Promise.all(paths.map(nativeInput));
  const reloadedSource=await verifyEraCheckpoint(reloadedInputs[0],reloadedInputs.slice(1),codec);
  assertions.equal(encodeEraWorldSave(reloadedSource.world),originalRaw);
  assertions.deepEqual(await physicalHashes(),physicalSourceHashes);
  const result={...summary(world),source:original,sourceRule,physicalSourceHashes,terminal:parent,physicalBytes:seals.reduce((sum,row)=>sum+row.physicalBytes,0),
    checkpointCount:seals.length,counted,injuries,nativePromotions,controller,sourceUnchanged:true,fullMonthlyNative:true,seals};
  await persist(join(output,'six-millennia-result.json'),JSON.stringify(result,null,2)+'\n');
  await directorySeal(output);
  info('six_millennia_verified',result);
}
try{await main();}catch(error){info('verification_failed',{error:String(error)});process.exitCode=1;}
