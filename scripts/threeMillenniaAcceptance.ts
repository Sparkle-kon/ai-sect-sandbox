import { join, mkdir, open, readFile, stat } from './centuryNodeRuntime';
import { prepareEraCheckpoint, verifyEraCheckpoint } from '../src/engine/eraCheckpointEngine';
import { projectEraEntryCandidates } from '../src/engine/eraEntryCandidates';
import { availableSettlementActions } from '../src/engine/settlementEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { availableWaterVeinActions } from '../src/engine/waterVeinEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { ActionType, Cultivator, LLMDecisionPayload, WorldState } from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__: string;
declare const process:{argv:string[];platform:string;exitCode?:number;resourceUsage():{maxRSS:number}};
const assertModule='node:assert/strict',cryptoModule='node:crypto',pathModule='node:path';
const assertions=await import(assertModule) as {equal(actual:unknown,expected:unknown):void;deepEqual(actual:unknown,expected:unknown):void};
const {createHash}=await import(cryptoModule) as {createHash(algorithm:'sha256'):{update(bytes:string|Uint8Array):{digest(encoding:'hex'):string}}};
const {basename,resolve}=await import(pathModule) as {basename(path:string):string;resolve(path:string):string};
function check(value:unknown,message='原生验收断言不符。'):asserts value{if(!value)throw Error(message);}
const sourceCommit='af0d3bfa0eb936fdc90b281dfcd8125de9dfd2e7';
const frozenRule='22f5d7d59d73da2bc436d166a467521d7d63bafc43c6282c304fc543b4ed9048';
const sourceManifest='3748bde85bd0e020fe2c3835a406ae973a5e1354d27df8cb38760b1aa55f12fd';
const sourceDigest='4d3c53bd65e1f0bf1fa973171176bafae6e5804700eee94ac5eff2a49575343c';
const terminalDigest='ff529b63832705b957d174c1099589bb410cdb269c5356344c8075c30175d239';
const sourceTick=12034, goalTick=36034, sealEvery=1200, originalFreightTick=34;
const charterId='north-mining-charter-12', stewardId='elder-danxia-1', siteId='loc-vein-north', villageId='village-loc-vein-north';
const recruitActorId='recruit-village-loc-vein-north-vol-5993', recruitVolunteerId='village-loc-vein-north-vol-5993';
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const start=performance.now();
const alive=(person:Cultivator)=>person.alive&&person.hp>0;
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
    regionalAnnualYears:0,authoredYears:0};
}

async function main(){
  const [outputArg,sourceArg,...partArgs]=process.argv.slice(2);
  if(!outputArg||!sourceArg||!partArgs.length||new Set(partArgs.map(part=>resolve(part))).size!==partArgs.length)
    throw Error('Usage: vite-node scripts/threeMillenniaAcceptance.ts NEW_OUTPUT_DIRECTORY SOURCE.era SOURCE_PART.json [MORE_SOURCE_PARTS.json ...]');
  if(__SECT_UTILITY_RULE_VERSION__!==frozenRule)
    throw Error(`Rule fingerprint mismatch. Run in detached worktree at ${sourceCommit} (expected ${frozenRule}); do not replay with a live E39 kernel.`);
  const output=resolve(outputArg), paths=[sourceArg,...partArgs].map(path=>resolve(path));
  if(new Set(paths).size!==paths.length)throw Error('Supply each physical source file exactly once.');
  const initialInputs=await Promise.all(paths.map(nativeInput));
  const baseline=await verifyEraCheckpoint(initialInputs[0],initialInputs.slice(1),codec);
  const originalRaw=encodeEraWorldSave(baseline.world);
  assertions.equal(baseline.manifest.id,sourceManifest);
  assertions.equal(baseline.manifest.engineRuleVersion,frozenRule);
  assertions.equal(baseline.manifest.payloadSha256,sourceDigest);
  assertions.equal(sha(originalRaw),sourceDigest);
  assertions.deepEqual([baseline.world.tick,baseline.world.year,baseline.world.month],[sourceTick,2003,10]);
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
  assertions.equal(inheritedRoster.size,21);
  // Exclusive fresh directory. Never append to, replace, or clean any existing output, even after a failure.
  await mkdir(output,{recursive:false});
  const seals:{tick:number;manifestId:string;payloadSha256:string;chainDigest:string;bytes:number;physicalBytes:number}[]=[];
  const original={tick:sourceTick,manifestId:sourceManifest,payloadSha256:sourceDigest,chainDigest:sha(JSON.stringify(
    {commit:sourceCommit,ruleVersion:frozenRule,tick:sourceTick,manifestId:sourceManifest,payloadSha256:sourceDigest}))};
  let parent=original;
  async function makeSeal(world:WorldState){
    assertions.equal(world.tick-parent.tick,sealEvery);
    const packed=await prepareEraCheckpoint(world,{branchId:'e39-native-continued-from-e38',label:'原井三千年原生逐月承继'},codec,
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
      filenames:pathsHere.map(path=>basename(path)),previous:parent,ruleVersion:frozenRule};
    const row={...core,chainDigest:sha(JSON.stringify(core))};
    await persist(join(output,`t${world.tick}-seal.json`),JSON.stringify({lineage:row,observed:summary(world)},null,2)+'\n');
    await directorySeal(output);
    seals.push(row);parent={tick:row.tick,manifestId:row.manifestId,payloadSha256:row.payloadSha256,chainDigest:row.chainDigest};
    info('strict_readback',{lineage:row,observed:summary(world)});
    return reread.world;
  }
  let world=baseline.world, recruitmentAttempt:string|undefined;
  let recordedRecruitment:{tick:number;id:string;paid:number;treasuryBefore:number;treasuryAfter:number;recordId:string}|undefined;
  let successTick:number|undefined;
  const damageFailures:{tick:number;hpBefore:number;hpAfter:number}[]=[];
  info('source_verified',{observed:summary(world),source:original,oldCharterId:oldCharter.id});
  while(world.tick<goalTick){
    const before=world, previousSteward=agent(before);
    const decisions:Record<string,LLMDecisionPayload>={};
    for(const person of before.cultivators.filter(alive)){
      let decision:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'隔离验收：按原生月历留驻。'};
      if(person.id===stewardId&&person.locationId===siteId){
        const offer=before.tick>=goalTick-6&&!recruitmentAttempt?
          availableSettlementActions(person,before).find(row=>row.action==='RECRUIT_SETTLER'):undefined;
        const yearsLeft=Math.ceil((goalTick-before.tick)/12)+1;
        if(offer?.targetVolunteerId){
          recruitmentAttempt=offer.targetVolunteerId;
          decision={chosenAction:'RECRUIT_SETTLER',targetSettlementId:offer.targetSettlementId,targetVolunteerId:offer.targetVolunteerId,
            innerMonologue:'验收：只招实际登记、愿入门且有实付俸禄的当世人。'};
        }else if(person.age+yearsLeft>=person.lifespan&&person.hp>=person.maxHp*.9){
          decision={chosenAction:person.qiProgress>=90?'BREAKTHROUGH':'CULTIVATE',
            innerMonologue:'验收：寿限不足时按确有的境界原生修行。'};
        }
      }
      counted[decision.chosenAction]=(counted[decision.chosenAction]??0)+1;decisions[person.id]=decision;
    }
    world=nextWith(before,decisions);
    assertions.equal(world.tick,before.tick+1);
    assertions.deepEqual([world.year,world.month],[1001+Math.floor((world.tick-1)/12),(world.tick-1)%12+1]);
    check(!world.regionalSimulation&&!world.authoredEraOrigin&&!world.scenarioOrigin&&!world.northWellRevisitLaw);
    const now=agent(world);
    if(previousSteward&&now){
      if(decisions[stewardId]?.chosenAction==='BREAKTHROUGH'&&now.hp<previousSteward.hp&&
        world.events.some(event=>event.id===`evt-${world.tick}-${stewardId}-fail`))
        damageFailures.push({tick:world.tick,hpBefore:previousSteward.hp,hpAfter:now.hp});
      if(now.realm!==previousSteward.realm){
        assertions.equal(previousSteward.realm,'化神');assertions.equal(now.realm,'炼虚');
        assertions.equal(now.spiritStones,previousSteward.spiritStones);
        check(world.events.some(event=>event.id===`evt-${world.tick}-${stewardId}-break`));
        successTick=world.tick;info('native_breakthrough',{tick:world.tick,age:now.age,lifespan:now.lifespan,damageFailures:[...damageFailures]});
      }
    }
    if(recruitmentAttempt&&!recordedRecruitment){
      const recruit=agent(world,`recruit-${recruitmentAttempt}`);
      if(!recruit)recruitmentAttempt=undefined;
      else{
        const record=world.settlements.records.find(row=>row.cultivatorId===recruit.id&&row.kind==='recruitment'&&row.tick===world.tick);
        const accountBefore=before.sects.find(s=>s.id===recruit.sectId), accountAfter=world.sects.find(s=>s.id===recruit.sectId);
        check(record&&accountBefore&&accountAfter);
        assertions.equal(record.stones,25);assertions.equal(accountBefore.spiritStones-accountAfter.spiritStones,25);
        assertions.equal(recruit.spiritStones,25);
        assertions.equal(recruit.id,recruitActorId);assertions.equal(recruitmentAttempt,recruitVolunteerId);
        recordedRecruitment={tick:world.tick,id:recruit.id,paid:record.stones,treasuryBefore:accountBefore.spiritStones,
          treasuryAfter:accountAfter.spiritStones,recordId:record.id};
        info('native_recruitment',recordedRecruitment);
      }
    }
    if((world.tick-sourceTick)%sealEvery===0){
      check([...inheritedRoster].every(id=>!!agent(world,id)));
      world=await makeSeal(world);
    }
  }
  assertions.deepEqual([world.tick,world.year,world.month],[goalTick,4003,10]);
  assertions.equal(seals.length,20);
  assertions.equal(parent.payloadSha256,terminalDigest);
  assertions.equal(successTick,12084);assertions.equal(counted.CULTIVATE,33);assertions.equal(counted.BREAKTHROUGH,13);
  assertions.deepEqual(damageFailures.map(row=>row.tick),[12038,12054,12072,12076]);
  assertions.equal(recordedRecruitment?.tick,36029);assertions.equal(counted.RECRUIT_SETTLER,1);
  const warden=agent(world), recruit=agent(world,recruitActorId);
  check(warden&&alive(warden)&&recruit&&alive(recruit));
  assertions.deepEqual([warden.locationId,warden.age,warden.lifespan,warden.spiritStones],[siteId,3167,5000,488]);
  assertions.deepEqual([recruit.locationId,recruit.age,recruit.positionPlane],[siteId,35,undefined]);
  const household=world.households.members.find(row=>row.recruitedId===recruit.id);
  check(household?.status==='recruited'&&household.settlementId===villageId);
  assertions.deepEqual([household.registeredTick,household.settledTick],[36001,36029]);
  assertions.deepEqual(world.northMiningCharters?.charters.find(row=>row.id===charterId),oldCharter);
  assertions.deepEqual(world.villageSupply.agreements.find(row=>row.id===oldFreight.id),oldFreight);
  assertions.deepEqual(world.villageWorks.projects.find(row=>row.id===oldWell.id),oldWell);
  assertions.deepEqual(world.coldWaterVein?.openings,[oldOpening]);
  assertions.equal(world.upperPassage,undefined);
  const granary=world.villageGranaries.granaries.find(row=>row.settlementId===villageId);
  assertions.deepEqual([granary?.roots,granary?.stones],[2,8]);
  const candidates=projectEraEntryCandidates(world,siteId,warden.id);
  check(candidates.some(row=>row.actorId===warden.id&&row.decision.kind==='rest_or_cultivate'));
  check(availableWaterVeinActions(warden,world,world.tick+1).some(option=>option.waterVeinMove==='open'));
  assertions.equal(sha(encodeEraWorldSave(baseline.world)),sourceDigest);
  const reloadedInputs=await Promise.all(paths.map(nativeInput));
  const reloadedSource=await verifyEraCheckpoint(reloadedInputs[0],reloadedInputs.slice(1),codec);
  assertions.equal(encodeEraWorldSave(reloadedSource.world),originalRaw);
  const rest:Record<string,LLMDecisionPayload>=Object.fromEntries(world.cultivators.filter(alive).map(person=>
    [person.id,{chosenAction:'REST',innerMonologue:'三千年读回续一月。'}]));
  const restored=decodeEraWorldSave(encodeEraWorldSave(world));
  const nextRaw=encodeEraWorldSave(nextWith(world,rest));
  assertions.equal(encodeEraWorldSave(nextWith(restored,rest)),nextRaw);
  const result={...summary(world),source:original,terminal:parent,physicalBytes:seals.reduce((sum,row)=>sum+row.physicalBytes,0),
    checkpointCount:seals.length,nextMonthSha256:sha(nextRaw),counted,damageFailures,recruitment:recordedRecruitment,household,
    originalEvidence:{wellId:oldWell.id,openingId:oldOpening.id,charterId:oldCharter.id,freightId:oldFreight.id,
      freightClosedTick:oldFreight.closedTick,passage:oldCharter.firstPassage},granary:{roots:granary?.roots,stones:granary?.stones},
    coverage:{sourceUnchanged:true,fullMonthlyNative:true,priorUpperTraversal:false,controller:'Disclosed native REST, survival training and one paid recruitment',
      verifiedCases:['exact old freight, well and gate survive','native survival under actual damage','one contemporary paid and registered recruit',
        'portable sealing and identical next tick after readback'],unmeasured:'E39 hearing outcomes run separately with E39 kernel'}};
  await persist(join(output,'three-millennia-result.json'),JSON.stringify(result,null,2)+'\n');
  await directorySeal(output);
  info('three_millennia_verified',result);
}
try{await main();}catch(error){info('verification_failed',{error:String(error)});process.exitCode=1;}
