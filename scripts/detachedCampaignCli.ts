import {open} from './centuryNodeRuntime';
import {detachedArchiveCapacity} from '../src/engine/detachedCampaignArchive';
import {createDetachedArchive,auditDetachedArchive,readDetachedArchiveOriginal,advanceDetachedArchive,
  DETACHED_EXPLICIT_MAX_MONTHS,type DetachedSourceFrame} from './detachedCampaignLocal';
import {loadDetachedImportFrame,readDetachedImport,type DetachedImportBranch} from './detachedCampaignImport';

declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];platform:string;exitCode?:number;resourceUsage():{maxRSS:number};
  on(signal:'SIGINT'|'SIGTERM',fn:()=>void):unknown;off(signal:'SIGINT'|'SIGTERM',fn:()=>void):unknown};
const usage=[
  '用途（本地 POSIX 文件系统；不接管浏览器档位）：',
  '  build <输入清单.json> <此前不存在的档案目录>',
  '  audit <档案目录>',
  '  extract <档案目录> <原分支ID> <原回合> <此前不存在的原生.json>',
  '  extract-source <档案目录> <原分支ID> <原回合> <此前不存在的原.era>',
  '  continue <档案目录> <1至1200个月> [<所见版本> <所见封印>]',
].join('\n');
function integer(s:string,minimum:number,maximum=Number.MAX_SAFE_INTEGER){
  const n=Number(s);
  if(!/^(?:0|[1-9][0-9]*)$/u.test(s)||!Number.isSafeInteger(n)||n<minimum||n>maximum)throw Error('请输入有效的整数。');
  return n;
}
const seal=(s:string)=>s.length===64&&/^[0-9a-f]+$/u.test(s);
const abort=new AbortController(),stop=()=>abort.abort();
const start=performance.now(),[verb,...args]=process.argv.slice(2);
const report=(data:Record<string,unknown>)=>console.log(JSON.stringify({...data,elapsedMs:Math.round(performance.now()-start),
  peakRssKiB:process.resourceUsage().maxRSS}));
async function exclusiveFile(path:string,data:Uint8Array){
  const fd=await open(path,'wx');
  try{await fd.writeFile(data);await fd.sync();}finally{await fd.close();}
}
const sourceFrames=async function*(branch:DetachedImportBranch,source:(file:string)=>string):AsyncGenerator<DetachedSourceFrame>{
  for(const frame of branch.snapshots){
    if(abort.signal.aborted)throw Error('已取消；未发布的内容不能用于续跑。');
    yield await loadDetachedImportFrame(frame,source);
  }
};
async function main(){
  if(verb==='--help'||verb==='-h'){console.log(usage);return;}
  if(process.platform==='win32')throw Error('此实现要求本地 POSIX 文件系统。不会改动任何浏览器存档。');
  const writerRuleVersion=__SECT_UTILITY_RULE_VERSION__;
  if(verb==='build'&&args.length===2){
    const {plan,resolveSource}=await readDetachedImport(args[0]);
    const {manifest,head}=await createDetachedArchive({directory:args[1],sourceRuleVersion:plan.sourceRuleVersion,writerRuleVersion,
      timelineId:plan.timelineId,nextBranchNumber:plan.nextBranchNumber,active:plan.active,signal:abort.signal,
      branches:plan.branches.map(branch=>({id:branch.id,label:branch.label,parentBranchId:branch.parentBranchId,forkTick:branch.forkTick,
        frames:sourceFrames(branch,resolveSource)}))});
    report({kind:'built',manifestId:manifest.id,sourceRuleVersion:manifest.sourceRuleVersion,writerRuleVersion:manifest.writerRuleVersion,
      revision:head.token.revision,seal:head.token.seal,active:manifest.active,capacity:detachedArchiveCapacity(manifest),frames:manifest.branches.reduce((n,b)=>n+b.snapshots.length,0)});
    return;
  }
  if(verb==='audit'&&args.length===1){
    const {manifest,head,world,retainedBytes}=await auditDetachedArchive(args[0],{signal:abort.signal});
    report({kind:'audited',manifestId:manifest.id,sourceRuleVersion:manifest.sourceRuleVersion,writerRuleVersion:manifest.writerRuleVersion,
      revision:head.token.revision,seal:head.token.seal,headSha256:head.value.worldSha256,tick:world.tick,retainedBytes,capacity:detachedArchiveCapacity(manifest),
      actors:world.cultivators.length,living:world.cultivators.filter(actor=>actor.alive&&actor.hp>0).length,
      branches:manifest.branches.map(branch=>({id:branch.id,ticks:branch.snapshots.map(frame=>frame.tick)}))});
    return;
  }
  if((verb==='extract'||verb==='extract-source')&&args.length===4){
    const tick=integer(args[2],0);
    const result=await readDetachedArchiveOriginal(args[0],args[1],tick,{signal:abort.signal});
    const bytes=verb==='extract'?result.payload:result.sourceManifest;
    if(!bytes)throw Error('该快照原先只有原生 JSON，没有原年代清单。');
    if(abort.signal.aborted)throw Error('已取消；没有写出文件。');
    await exclusiveFile(args[3],bytes);
    report({kind:'extracted',branchId:args[1],tick,bytes:bytes.length,originalManifest:verb==='extract-source'});
    return;
  }
  if(verb==='continue'&&(args.length===2||args.length===4)){
    const months=integer(args[1],1,DETACHED_EXPLICIT_MAX_MONTHS);
    if(args.length===4&&!seal(args[3]))throw Error('请提供所见版本的有效封印。');
    const expected=args.length===4?{revision:integer(args[2],0),seal:args[3]}:undefined;
    const head=await advanceDetachedArchive(args[0],{writerRuleVersion,months,expected,signal:abort.signal});
    report({kind:'continued',revision:head.token.revision,seal:head.token.seal,tick:head.value.tick,headSha256:head.value.worldSha256,
      originalBranchesUnchanged:true});
    return;
  }
  throw Error(usage);
}
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
try{await main();}catch(error){
  console.error(error instanceof Error?error.message:'独立档案操作未完成。');
  process.exitCode=abort.signal.aborted?130:1;
}finally{
  process.off('SIGINT',stop);process.off('SIGTERM',stop);
}
