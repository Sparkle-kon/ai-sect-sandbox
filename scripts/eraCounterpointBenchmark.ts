import {projectEraCounterpoint,verifyEraCounterpoint} from '../src/engine/eraCounterpointEngine';
import {prepareEraCheckpoint,verifyEraCheckpoint,type EraInput} from '../src/engine/eraCheckpointEngine';
import {projectFieldObservatory} from '../src/engine/fieldObservatoryEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {villageId,north,reader,villageReader,prepareE210ReadingFixture} from '../tests/fixtures/eraCounterpointFixture';
import type {WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const demo=await prepareE210ReadingFixture();
const proof=await verifyEraCounterpoint(demo.timeline,demo.naturalId,demo.authoredId);
if(!proof.ok)throw Error('真实自然原帧没有获判配对：'+proof.reason);
const land=projectEraCounterpoint(demo.timeline,proof.proof,6,{naturalViewerId:reader,authoredViewerId:reader});
const village=projectEraCounterpoint(demo.timeline,proof.proof,6,{naturalViewerId:villageReader,authoredViewerId:villageReader,settlementId:villageId});
if(!land.ok||!village.ok||!land.natural.north||!land.authored.north||!village.natural.village||!village.authored.village)
  throw Error('实地观察未能支持双线证明。');
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const file=(data:Uint8Array):EraInput=>({size:data.byteLength,async arrayBuffer(){return data.slice().buffer;}});
const run=(w:WorldState)=>{
  const actor=w.cultivators.find(row=>row.id===reader);
  if(!actor)throw Error('真实观象人缺失。');
  return projectFieldObservatory(w,actor).runs.find(row=>row.locationId===north&&row.openedTick===6&&row.targetTick===8);
};
async function again(w:WorldState,id:string){
  const archive=await prepareEraCheckpoint(w,{timelineId:'e210-proven-counterpoint',branchId:id},codec,
    {engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
  const read=await verifyEraCheckpoint(file(archive.manifestFile.bytes),archive.parts.map(part=>file(part.bytes)),codec);
  if(encodeEraWorldSave(read.world)!==encodeEraWorldSave(w))throw Error('配对分支实际读回与原件不同。');
  const advanced=advanceWorldTick(read.world);
  const observation=run(advanced);
  if(observation?.status!=='measured')throw Error('原有独立观象约没有真实结算。');
  return {read:read.world.tick,after:advanced.tick,observation:observation.status,sha:read.manifest.payloadSha256,
    leaves:archive.parts.length,byteExactRestore:true};
}
const [nativeRead,authorRead]=await Promise.all([again(demo.naturalLater,demo.naturalId),again(demo.authoredLater,demo.authoredId)]);
console.log(JSON.stringify({seed:demo.natural.random.seed,profile:demo.natural.worldgen?.profileId,
  rule:__SECT_UTILITY_RULE_VERSION__,opening:land.opening,nativeOpeningSha:demo.baselineDigest,
  native:{north:land.natural.north,village:village.natural.village,obligations:land.natural.obligations,after:nativeRead},
  authored:{north:land.authored.north,village:village.authored.village,obligations:land.authored.obligations,after:authorRead},
  originalTick:demo.timeline.branches[0].snapshots[0].tick,totalBranches:demo.timeline.branches.length}));
