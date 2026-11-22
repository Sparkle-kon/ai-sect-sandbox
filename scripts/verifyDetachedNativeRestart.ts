import {campaignSHA256} from '../src/engine/campaignMemento';
import {createFastForwardRunner} from '../src/engine/fastForwardEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {auditDetachedArchive,readDetachedArchiveOriginal,type DetachedLocalRevision} from './detachedCampaignLocal';
import type {DetachedImportPlan} from './detachedCampaignImport';
import type {LocalArchiveHead,LocalArchiveToken} from './detachedCampaignFilesystem';

declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];execPath:string;cwd():string;version:string;platform:string;arch:string};
const fsModule='node:fs/promises',pathModule='node:path',childModule='node:child_process';
const {mkdir,readdir,readFile,writeFile,cp}=await import(fsModule) as {
  mkdir(path:string,options:{recursive:boolean}):Promise<unknown>;
  readdir(path:string):Promise<string[]>;
  readFile(path:string):Promise<Uint8Array>;
  writeFile(path:string,value:string|Uint8Array,options?:{flag:string}):Promise<void>;
  cp(from:string,to:string,options:{recursive:boolean;errorOnExist:boolean;force:boolean}):Promise<void>;
};
const {resolve,join}=await import(pathModule) as {resolve(path:string):string;join(...paths:string[]):string};
const {spawnSync}=await import(childModule) as {
  spawnSync(binary:string,args:string[],options:{cwd:string;encoding:'utf8';timeout:number}):
    {pid:number;status:number|null;signal?:string;stdout:string;stderr:string};
};
const currentRule='09b2223463cc0995a00ebcc1eb7a32c7a6ac9dfc71b71bd0e3545f8ceac23203';
const branch='e48-native-continued-from-e39';
const frames=[
  {tick:58834,year:5903,month:10,bytes:754141,sha256:'c4bf750d10d89d2e8d1e9e42b36246ab27d0748ed63a2e695dafd91b582fa90a'},
  {tick:60034,year:6003,month:10,bytes:751525,sha256:'eb78f17244d2a1e0e578363ebdcfffff006e7cfd24c3ca63750626a5fd92240c'},
] as const;
const encoder=new TextEncoder(),decoder=new TextDecoder();
function check(condition:unknown,label:string):asserts condition{if(!condition)throw Error(label);}
const hashFile=async(path:string)=>campaignSHA256(await readFile(path));
const raw=(world:WorldState)=>encodeEraWorldSave(world);
const same=(a:unknown,b:unknown,label:string)=>check(JSON.stringify(a)===JSON.stringify(b),label);
const turn=(world:WorldState)=>{
  const runner=createFastForwardRunner(world,1);
  runner.advanceChunk();
  const done=runner.checkpoint();
  check(done?.completedTicks===1,'Direct native Utility proof failed');
  return done.world;
};
async function flip(input:string,output:string,exclusive:boolean){
  const bytes=Uint8Array.from(await readFile(input));
  check(bytes.length>2,'No actual physical byte to corrupt');
  const offset=Math.floor(bytes.length/2);
  bytes[offset]^=1;
  await writeFile(output,bytes,exclusive?{flag:'wx'}:undefined);
  return {offset,bytes:bytes.length,newSha256:await campaignSHA256(bytes)};
}
async function fingerprint(path:string,keys=['objects','published']){
  const refs:{file:string;sha256:string}[]=[];
  for(const key of keys)for(const name of (await readdir(join(path,key))).sort()){
    refs.push({file:key+'/'+name,sha256:await hashFile(join(path,key,name))});
  }
  return refs;
}
const [outputArg,earlierManifest,earlierPart,middleManifest,middlePart,otherCheckout,...extra]=process.argv.slice(2);
check(outputArg&&earlierManifest&&earlierPart&&middleManifest&&middlePart&&otherCheckout&&!extra.length,
  'Usage: vite-node scripts/verifyDetachedNativeRestart.ts NEW_OUTPUT T58834.era T58834.json T60034.era T60034.json ACTUAL_OTHER_RULE_CHECKOUT');
check(__SECT_UTILITY_RULE_VERSION__===currentRule,'E49 requires the actual E48 native build rule');
const work=process.cwd(),wrong=resolve(otherCheckout),directory=resolve(outputArg);
check(work!==wrong,'Wrong-rule proof requires a separate physical checkout');
const ruleProbe=spawnSync(process.execPath,['--input-type=module','-e',
  "import {loadConfigFromFile} from 'vite';const result=await loadConfigFromFile({command:'build',mode:'production'});console.log(result?.config.define?.__SECT_UTILITY_RULE_VERSION__??'');"
],{cwd:wrong,encoding:'utf8',timeout:120_000});
const actualOtherRule=ruleProbe.stdout.trim().replace(/^"|"$/gu,'');
check(ruleProbe.status===0&&ruleProbe.pid>0&&/^[0-9a-f]{64}$/u.test(actualOtherRule)&&actualOtherRule!==currentRule,
  'The independent checkout did not report a distinct actual trusted Vite engine fingerprint');
const source=[earlierManifest,earlierPart,middleManifest,middlePart].map(path=>resolve(path));
check(new Set(source).size===4,'Supply separate physical inputs');
const original=await Promise.all(source.map(hashFile));
same([original[1],original[3]],frames.map(row=>row.sha256),'Wrong original source part SHA');
await mkdir(directory,{recursive:false});
const cases:{name:string;pid:number;status:number;wallMs:number;stdout:string;stderr:string}[]=[];
function invoke(name:string,checkout:string,argv:string[],status:number,error?:RegExp){
  const start=performance.now(),result=spawnSync(process.execPath,
    [join(checkout,'node_modules','vite-node','vite-node.mjs'),'scripts/detachedCampaignCli.ts',...argv],
    {cwd:checkout,encoding:'utf8',timeout:120_000});
  check(result.status===status&&result.pid>0&&!result.signal,`${name}: ${result.status} ${result.stderr}`);
  if(error)check(error.test(result.stderr),`${name}: wrong refusal ${result.stderr}`);
  const line={name,pid:result.pid,status,wallMs:Math.round(performance.now()-start),
    stdout:result.stdout.trim(),stderr:result.stderr.trim()};
  cases.push(line);
  console.log(JSON.stringify(line));
  return line;
}
const middle=frames[1],archive=join(directory,'healthy');
const plan:DetachedImportPlan={format:'ai-sect-detached-import',version:1,timelineId:'e49-true-native-midpoint',
  sourceRuleVersion:currentRule,active:{branchId:branch,tick:middle.tick,sha256:middle.sha256},
  branches:[{id:branch,label:'原生中途两帧',snapshots:frames.map((frame,index)=>({
    ...frame,kind:'era',manifest:source[index*2],parts:[source[index*2+1]],
  }))}]};
const planFile=join(directory,'input.json');
await writeFile(planFile,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
invoke('physical_build',work,['build',planFile,archive],0);
const origin=await auditDetachedArchive(archive);
check(origin.world.tick===middle.tick&&origin.head.token.revision===1,'Wrong committed origin');
const initial=decodeEraWorldSave(decoder.decode(await readFile(source[3])));
const expected1=turn(initial), expected2=turn(expected1);
const expected=[await campaignSHA256(encoder.encode(raw(expected1))),await campaignSHA256(encoder.encode(raw(expected2)))];
const argsFor=(path:string,token:LocalArchiveToken,months='1')=>['continue',path,months,String(token.revision),token.seal];
const checkHead=(row:LocalArchiveHead<DetachedLocalRevision>,parent:LocalArchiveHead<DetachedLocalRevision>,offset:1|2)=>{
  check(row.value.kind==='advance'&&row.token.revision===offset+1&&row.value.tick===middle.tick+offset&&
    row.value.worldSha256===expected[offset-1]&&row.value.previousWorldSha256===parent.value.worldSha256&&row.value.months===1,
    `Actual next month vs same-rule reference mismatch ${offset}`);
};

const a=invoke('fresh_process_A_publishes',work,argsFor(archive,origin.head.token),0);
const afterA=await auditDetachedArchive(archive);
checkHead(afterA.head,origin.head,1);
check(raw(afterA.world)===raw(expected1),'T60035 native bytes differ');
const b=invoke('fresh_process_B_reopens_publishes',work,argsFor(archive,afterA.head.token),0);
check(a.pid!==b.pid,'Restart did not use two independent native processes');
const afterB=await auditDetachedArchive(archive);
checkHead(afterB.head,afterA.head,2);
check(raw(afterB.world)===raw(expected2),'T60036 native bytes differ');
const stable=await fingerprint(archive);

const wrongRun=invoke('actual_other_build_rejected',wrong,argsFor(archive,afterB.head.token),1,/运行规则.*不一致/u);
const stale=invoke('stale_known_token_rejected',work,argsFor(archive,afterA.head.token),1,/预期.*版本.*改变/u);
invoke('over_limit_request_rejected',work,argsFor(archive,afterB.head.token,'1201'),1,/有效的整数/u);
same(await fingerprint(archive),stable,'Refused operations changed the healthy published archive');

const corruptArchive=join(directory,'disposable-corrupt-local');
await cp(archive,corruptArchive,{recursive:true,errorOnExist:true,force:false});
const final=afterB.head.value;
check(final.kind==='advance'&&final.snapshot.world.chunks.length===1,'Expected one actual terminal content object');
const target=join(corruptArchive,'objects',final.snapshot.world.chunks[0].sha256);
const damagedLocal=await flip(target,target,false);
const corruptFinger=await fingerprint(corruptArchive);
invoke('stale_before_payload_verification',work,argsFor(corruptArchive,afterA.head.token),1,/预期.*版本.*改变/u);
invoke('corrupt_local_audit_refused',work,['audit',corruptArchive],1,/SHA-256.*不符/u);
invoke('valid_token_never_skips_damaged_payload',work,argsFor(corruptArchive,afterB.head.token),1,/SHA-256.*不符/u);
same(await fingerprint(corruptArchive),corruptFinger,'Corrupt local archive unexpectedly healed or rolled back');

const wrongPart=join(directory,'disposable-damaged-midpoint.json');
const damagedOriginal=await flip(source[3],wrongPart,true);
const corruptPlan=structuredClone(plan),frame=corruptPlan.branches[0].snapshots[1];
check(frame.kind==='era','Expected genuine .era frame');
frame.parts=[wrongPart];
const wrongPlanFile=join(directory,'disposable-corrupt-input.json'),refused=join(directory,'no-published-origin');
await writeFile(wrongPlanFile,JSON.stringify(corruptPlan,null,2)+'\n',{flag:'wx'});
invoke('corrupt_physical_part_import_refused',work,['build',wrongPlanFile,refused],1,/字节|校验/u);
same(await readdir(join(refused,'published')),[],'Corrupted import published a false origin');

const reopened=await auditDetachedArchive(archive);
same(reopened.head.token,afterB.head.token,'Another durable head was silently published');
same(await fingerprint(archive),stable,'Separate corrupted copies changed healthy evidence');
for(const [index,frame] of frames.entries()){
  const round=await readDetachedArchiveOriginal(archive,branch,frame.tick);
  check(await campaignSHA256(round.payload)===original[index*2+1]&&round.sourceManifest&&
    await campaignSHA256(round.sourceManifest)===original[index*2],'An original imported frame or .era manifest changed');
}
same(await Promise.all(source.map(hashFile)),original,'Physical input bytes changed');
const nextBoth=[await campaignSHA256(encoder.encode(raw(turn(reopened.world)))),await campaignSHA256(encoder.encode(raw(turn(expected2))))];
same(nextBoth[0],nextBoth[1],'Same rule moved different next bytes after newest strict re-open');
const report={kind:'e49_native_detached_restart',writerRuleVersion:currentRule,environment:{node:process.version,platform:process.platform,arch:process.arch},
  input:frames.map((row,index)=>({...row,manifestSha256:original[index*2]})),physicalInputsUnchanged:true,
  nativeUtilityControl:'one createFastForwardRunner per exact accepted month (not the earlier E48 REST control)',
  accepted:[origin,afterA,afterB].map(row=>({token:row.head.token,tick:row.world.tick,sha256:row.head.value.worldSha256,retainedBytes:row.retainedBytes})),
  sameRuleNativeNextSha256:nextBoth[0],genuineLatestPrefixIntact:true,wrongBuild:{pid:wrongRun.pid,ruleProbePid:ruleProbe.pid,fingerprint:actualOtherRule,probe:'separate checkout'},stalePid:stale.pid,
  damagedLocal,damagedOriginal,healthyFiles:stable,cases};
await writeFile(join(directory,'restart-proof.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
