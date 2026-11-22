/** Time only repeated rejection of a formerly observed token; never attempt an eligible write. */
import {auditDetachedArchive,advanceDetachedArchive} from './detachedCampaignLocal';
import {LocalDetachedArchiveError} from './detachedCampaignFilesystem';

declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];version:string;platform:string;resourceUsage():{maxRSS:number}};
const [directory,seenRevision,seal,...rest]=process.argv.slice(2);
const revision=Number(seenRevision);
if(!directory||rest.length||!Number.isSafeInteger(revision)||revision<1||!seal||!/^\d+$/u.test(seenRevision)||!/^[0-9a-f]{64}$/u.test(seal))
  throw Error('Usage: measureDetachedRejection.ts <archive> <earlier committed generation> <earlier committed seal>');
const prior=await auditDetachedArchive(directory);
if(revision>=prior.head.token.revision||seal===prior.head.token.seal)
  throw Error('Only a known strictly older token may be timed. The archive has not been altered.');
const expected={revision,seal};
const warmups=2,runs=7,timings:number[]=[];
for(let i=0;i<warmups+runs;i++){
  const start=performance.now();
  try{
    await advanceDetachedArchive(directory,{writerRuleVersion:__SECT_UTILITY_RULE_VERSION__,months:1,expected});
    throw Error('An obsolete generation unexpectedly published.');
  }catch(error){
    if(!(error instanceof LocalDetachedArchiveError)||error.code!=='conflict')throw error;
  }
  if(i>=warmups)timings.push(performance.now()-start);
}
const ordered=[...timings].sort((a,b)=>a-b);
const rank=(q:number)=>ordered[Math.ceil(q*ordered.length)-1];
const after=await auditDetachedArchive(directory);
if(after.head.token.revision!==prior.head.token.revision||after.head.token.seal!==prior.head.token.seal||
  after.head.value.worldSha256!==prior.head.value.worldSha256||after.manifest.id!==prior.manifest.id||
  after.retainedBytes!==prior.retainedBytes)
  throw Error('A failed probe replaced the original archive head.');
console.log(JSON.stringify({kind:'stale-generation-probe',rule:__SECT_UTILITY_RULE_VERSION__,node:process.version,
  platform:process.platform,originalFrames:prior.manifest.branches.reduce((n,row)=>n+row.snapshots.length,0),
  retainedBytes:prior.retainedBytes,initialTick:prior.world.tick,expected,actualHead:prior.head.token,
  warmups,runs,timingsMs:timings,p50Ms:rank(.5),p95Ms:rank(.95),peakRssKiB:process.resourceUsage().maxRSS,originalHeadUnchanged:true}));
