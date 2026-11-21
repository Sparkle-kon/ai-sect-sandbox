import {createInitialWorld} from '../src/data/initialWorld';
import {createCampaignJournal,createMemoryCampaignBackend} from '../src/engine/campaignJournal';
import {campaignSHA256,sealCampaignSource} from '../src/engine/campaignMemento';
import {createCampaignCheckpoint,createFastForwardCampaignController,type FastForwardCampaignControllerOptions} from '../src/engine/fastForwardCampaignEngine';
import {createFastForwardWorkerController,FAST_FORWARD_MAX_TICKS} from '../src/engine/fastForwardEngine';
import {encodeEraWorldSave} from '../src/engine/storageEngine';
import {createTimeline,forkTimeline,forkTimelineCampaignCheckpoint,readTimelineHead,recordTimelineWorld,selectTimelineBranch} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {campaignPopulation,parseCampaignBenchmarkArgs} from './longCampaignBenchmark';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const runtime=globalThis as typeof globalThis&{process?:{argv:string[];version:string;platform:string;arch:string}};
const options=parseCampaignBenchmarkArgs((runtime.process?.argv.slice(2)??[]).filter(flag=>flag!=='--'));
const ruleVersion=typeof __SECT_UTILITY_RULE_VERSION__==='string'?__SECT_UTILITY_RULE_VERSION__:undefined;
if(!ruleVersion||!/^[0-9a-f]{64}$/.test(ruleVersion))throw Error('无法取得当前真实规则摘要；请从现有 vite-node 工具运行。');
const output=(row:unknown)=>console.log(JSON.stringify(row));
const decimal=(ms:number)=>Number(ms.toFixed(2));
const beginWall=performance.now();
const bytes=new TextEncoder();

const original=createInitialWorld(options.seed,options.profile);
const main=createTimeline(original);
const first=selectTimelineBranch(forkTimeline(main,original.tick,{type:'WHISPER_MIND',targetCultivatorId:original.cultivators[0].id,
  whisperText:'验收旁线甲：不进入长局。'},'验收旁线甲'),'main');
const timeline=selectTimelineBranch(forkTimeline(first,original.tick,{type:'WHISPER_MIND',targetCultivatorId:original.cultivators[1].id,
  whisperText:'验收旁线乙：独立保留。'},'验收旁线乙'),'main');
if(timeline.branches.length!==3||timeline.activeBranchId!=='main')throw Error('确有两条相互独立的旁线才可开始。');
const baseline=timeline.branches.map(row=>({id:row.id,branch:row,bytes:encodeEraWorldSave(readTimelineHead(timeline,row.id)!)}));
const founders=new Set(original.cultivators.map(row=>row.id));
const target=options.months.at(-1)!;
if(options.months.some(month=>month!==target&&month%FAST_FORWARD_MAX_TICKS!==0))
  throw RangeError('取样月须位于真实持久检查点；推荐 --months=120,600。');
const source=readTimelineHead(timeline)!;
const origin=await sealCampaignSource(timeline,'campaign-parity-classic',source);
const journal=createCampaignJournal(createMemoryCampaignBackend());
let token=await journal.begin(origin,target,ruleVersion);
let ordinary=source,ordinaryMs=0,ordinaryMonths=0;
let workerMonths=0,workerAdvanceMs=0;
const observed=new Set<number>();
const desired=new Set(options.months);
const batches:number[]=[];
let callbackError:unknown;
const baseMetadata={sourceRevision:options.revision,engineRuleVersion:ruleVersion,seed:options.seed,profile:options.profile,
  env:{node:runtime.process?.version??null,platform:runtime.process?.platform??null,arch:runtime.process?.arch??null},
  transport:'native_worker_controller_in_process',persistence:'native_journal_memory_backend',
  scope:'Node host real Utility turns, no model/browser worker thread/render; exact native saves'};

const createWorker:FastForwardCampaignControllerOptions['createWorker']=(receive,failed)=>{
  let closed=false;
  const receiveNative=createFastForwardWorkerController({
    post:event=>{
      if(closed)return;
      if(event.type==='staged'){
        workerAdvanceMs+=event.progress.processingMs;
        workerMonths+=event.progress.completedTicks;
      }
      receive(event);
    },
    schedule:callback=>setTimeout(()=>{if(!closed){try{callback();}catch{failed();}}},0),
    cancelSchedule:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  return {post(request){
    if(closed)return;
    if(request.type==='start'){
      if(request.requestedTicks<1||request.requestedTicks>FAST_FORWARD_MAX_TICKS)throw Error('超过内部批次单独上限。');
      batches.push(request.requestedTicks);
    }
    receiveNative(request);
  },terminate(){closed=true;}};
};
const controller=createFastForwardCampaignController({runId:'native-parity',source,initial:createCampaignCheckpoint(source,target),createWorker,
  async commit(previous,next){
    try {
      if(timeline.branches.length!==3||timeline.activeBranchId!=='main')throw Error('内部批次改变了原时间线。');
      if(next.completedTicks-previous.completedTicks>120)throw Error('正式持久写入超过逐批上限。');
      const saving=performance.now();token=await journal.checkpoint(token,next);
      const persistenceMs=performance.now()-saving;
      const samples=options.months.filter(month=>previous.completedTicks<month&&month<=next.completedTicks);
      if(samples.some(month=>month!==next.completedTicks))throw Error('取样月须位于真实持久检查点；推荐 --months=120,600。');
      if(desired.has(next.completedTicks)){
        const compare=performance.now();
        for(;ordinaryMonths<next.completedTicks;ordinaryMonths++)ordinary=advanceWorldTick(ordinary,undefined,undefined,'utility');
        ordinaryMs+=performance.now()-compare;
        const comparisonSave=encodeEraWorldSave(ordinary);
        const loaded=await journal.load();
        if(!loaded||loaded.checkpoint.completedTicks!==next.completedTicks||loaded.record.seal!==token.seal||
          encodeEraWorldSave(loaded.checkpoint.world)!==comparisonSave||encodeEraWorldSave(next.world)!==comparisonSave)throw Error(`原生候选与独立普通推演在第 ${next.completedTicks} 月存档不同。`);
        if(loaded.source.timeline.branches.length!==3)throw Error('读回时旁线不完整。');
        const signature=await campaignSHA256(bytes.encode(comparisonSave));
        if(signature!==token.head?.sha256)throw Error('逐月对照与实际持久候选的字节摘要不符。');
        observed.add(next.completedTicks);
        output({...baseMetadata,status:'checkpoint_pass',months:next.completedTicks,checkpoint:{tick:ordinary.tick,year:ordinary.year,month:ordinary.month},
          nativeSaveBytes:bytes.encode(comparisonSave).length,nativeSha256:signature,exactOrdinaryJSON:true,
          population:campaignPopulation(ordinary,founders),branchesDuring:3,journalRevision:token.revision,
          lastBatchDurableWriteMs:decimal(persistenceMs),ordinaryTotalMs:decimal(ordinaryMs),candidateWorkerTotalMs:decimal(workerAdvanceMs)});
      }
      return true;
    }catch(error){callbackError=error;return false;}
  },
  async discard(){token=await journal.cancel(token);await journal.discard(token);return true;},
  onState(state){
    if(state.phase==='ready'){finish(true);}
    else if(state.phase==='error'||state.phase==='cancelled'||state.phase==='detached'){finish(false);}
  },
});
let finish:(success:boolean)=>void;
const result=new Promise<boolean>(resolve=>{finish=resolve;});
controller.start();
if(!await result)throw callbackError??Error(controller.read().notice??'推演未达到正式持久节点。');
if(observed.size!==desired.size||workerMonths!==target)throw Error('缺少取样或已推进月数不匹配。');
const completed=await journal.load(),candidate=controller.readReadyCheckpoint();
if(!candidate||!completed||completed.record.status!=='ready'||completed.record.seal!==token.seal||
  encodeEraWorldSave(candidate.world)!==encodeEraWorldSave(completed.checkpoint.world))throw Error('提交前没有真实、可读回的最后候选。');

let timelineAfter=timeline;
if(timelineAfter.branches.length!==3)throw Error('确认之前候选意外占分支。');
// This is the CLI's single explicit verified commit, analogous to one click of the final confirm.
const approved=forkTimelineCampaignCheckpoint(timelineAfter,'main',source.tick,completed.checkpoint);
token=await journal.finalize(token,approved.activeBranchId);
timelineAfter=approved;
if(timelineAfter.branches.length!==4||baseline.some(row=>timelineAfter.branches.find(branch=>branch.id===row.id)!==row.branch||
    encodeEraWorldSave(readTimelineHead(timelineAfter,row.id)!)!==row.bytes))throw Error('最终提交意外更改原线或旁线。');

const resumed=selectTimelineBranch(timelineAfter,'main'),oldHead=readTimelineHead(resumed)!;
const played=advanceWorldTick(oldHead,undefined,undefined,'utility');
const continued=recordTimelineWorld(resumed,played);
if(continued.branches.length!==4||readTimelineHead(continued)?.tick!==source.tick+1||
   encodeEraWorldSave(played)!==encodeEraWorldSave(advanceWorldTick(original,undefined,undefined,'utility'))||
   baseline.slice(1).some(row=>continued.branches.find(branch=>branch.id===row.id)!==row.branch||
     encodeEraWorldSave(readTimelineHead(continued,row.id)!)!==row.bytes))throw Error('原线未能继续或旁线变化。');
await journal.discard(token);
output({...baseMetadata,status:'final_pass',targetMonths:target,observedMonths:[...observed],batches,branchesBefore:3,branchesDuring:3,
  branchesAfterExplicitConfirm:4,originalContinued:readTimelineHead(continued)?.tick??null,preexistingSiblingBranchesUnchanged:true,
  totalWallMs:decimal(performance.now()-beginWall)});
