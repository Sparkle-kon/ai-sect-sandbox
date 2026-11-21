import {useEffect,useRef,useState,type MutableRefObject} from 'react';
import type {FastForwardPreflightBinding} from './FastForwardPanel';
import type {WorldState} from '../types/world';
import {forkTimelineCampaignCheckpoint,readTimelineHead,type WorldTimeline} from '../engine/timelineEngine';
import type {CampaignJournalRecord,LoadedCampaignJournal} from '../engine/campaignJournal';
import type {ReadCampaignSource} from '../engine/campaignMemento';
import {
  addCampaignCalendarMonths, createCampaignCheckpoint, createFastForwardCampaignController,
  type CampaignControllerState,type CampaignCheckpoint,
} from '../engine/fastForwardCampaignEngine';
import type {FastForwardWorkerResponse} from '../engine/fastForwardEngine';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const ruleVersion=typeof __SECT_UTILITY_RULE_VERSION__==='string'?__SECT_UTILITY_RULE_VERSION__:undefined;
// The ordinary story and the old short worker never need the durable save codec at startup.
const browserCampaignJournal=async()=> (await import('../engine/campaignJournal')).campaignJournal();


interface SourceContext {
  readonly world:WorldState;
  readonly timeline:WorldTimeline;
  readonly timelineId?:string;
}
interface CampaignOptions extends SourceContext {
  readonly inspect:boolean;
  readonly inPreview:boolean;
  readonly guard:MutableRefObject<boolean>;
  isCurrent(world:WorldState,timeline:WorldTimeline):boolean;
  pauseLive():void;
  openSource(source:ReadCampaignSource):void;
  openResult(timeline:WorldTimeline,world:WorldState,sourceTimelineId?:string):void;
}
type Controller=ReturnType<typeof createFastForwardCampaignController>;
interface Run extends SourceContext {
  record:CampaignJournalRecord;
  driver:Controller;
}
interface OwnedSource extends SourceContext {id:string}
const tokenMatches=(a:CampaignJournalRecord,b:CampaignJournalRecord)=>
  a.id===b.id&&a.generation===b.generation&&a.revision===b.revision;
const reason=(error:unknown)=>error instanceof Error?error.message:'无法核验本地推演；当前世界未改变。';
function forkable(checkpoint:CampaignCheckpoint):CampaignCheckpoint {
  // The journal still holds the original horizon; the separate ordinary fork
  // validator receives exactly the completed, independently proven final date.
  return checkpoint.stopReceipt?{...checkpoint,requestedTicks:checkpoint.completedTicks}:checkpoint;
}
const supported=()=>typeof Worker==='function'&&typeof indexedDB!=='undefined'&&
  typeof globalThis.crypto?.subtle?.digest==='function'&&typeof globalThis.crypto.randomUUID==='function'&&!!ruleVersion;

export function useFastForwardCampaign(props:CampaignOptions) {
  const context=useRef(props);context.current=props;
  const run=useRef<Run>();
  const owner=useRef<OwnedSource>();
  const op=useRef<AbortController>();
  const initialized=useRef(false);
  const mounted=useRef(false);
  const [record,setRecord]=useState<CampaignJournalRecord>();
  const [state,setState]=useState<CampaignControllerState>();
  const [working,setWorking]=useState(false);
  const [notice,setNotice]=useState<string>();
  const [review,setReview]=useState<{record:CampaignJournalRecord;originalOnly:boolean}>();
  const syncGuard=()=>{context.current.guard.current=!!run.current||!!op.current;};
  const retain=(next:CampaignJournalRecord|undefined)=>{if(mounted.current)setRecord(next);};
  const sameLive=(source:SourceContext)=>context.current.isCurrent(source.world,source.timeline);
  const matchesOwner=(item:CampaignJournalRecord)=>{
    const original=owner.current,current=context.current;
    return !!original&&original.id===item.id&&original.timelineId===current.timelineId&&
      current.world===original.world&&current.timeline===original.timeline&&sameLive(original);
  };
  useEffect(()=>{
    mounted.current=true;
    return ()=>{
      mounted.current=false;initialized.current=false;
      op.current?.abort();op.current=undefined;
      run.current?.driver.detach();run.current=undefined;
      syncGuard();
    };
  },[]);
  useEffect(()=>{
    if(!props.inspect||!supported()||initialized.current)return;
    initialized.current=true;
    const initial=props.guard;
    void browserCampaignJournal().then(journal=>journal.read()).then(saved=>{if(mounted.current&&!initial.current)retain(saved);})
      .catch(error=>{if(mounted.current&&!initial.current)setNotice(reason(error));});
  },[props.inspect]);
  useEffect(()=>{
    const existing=run.current;
    if(existing&&!sameLive(existing)) {
      existing.driver.detach();run.current=undefined;syncGuard();setState(undefined);
      setNotice('原分支已变化，已退出运行；最后落档的候选仍可核验。');
      void browserCampaignJournal().then(journal=>journal.read()).then(saved=>{if(mounted.current&&!run.current&&!op.current)retain(saved);}).catch(()=>undefined);
    }
    if(review&&!context.current.isCurrent(props.world,props.timeline))setReview(undefined);
  },[props.world,props.timeline,props.inPreview,review]);

  const withOperation=(task:(signal:AbortSignal)=>Promise<void>)=>{
    if(op.current||!mounted.current)return;
    const operation=new AbortController();
    op.current=operation;syncGuard();setWorking(true);setNotice(undefined);
    void task(operation.signal).catch(async error=>{
      if(!mounted.current||op.current!==operation)return;
      setNotice(operation.signal.aborted?'已停止本次核验；当前世界与普通存档不变。':reason(error));
      try {
        const latest=await (await browserCampaignJournal()).read();
        if(op.current===operation&&!run.current)retain(latest);
      } catch { /* Keep the last proven pointer when even the journal cannot be read. */ }
    }).finally(()=>{
      if(op.current!==operation)return;
      op.current=undefined;syncGuard();if(mounted.current)setWorking(false);
    });
  };
  function attach(record:CampaignJournalRecord,base:SourceContext,initial:LoadedCampaignJournal['checkpoint']) {
    if(!sameLive(base)||record.ruleVersion!==ruleVersion)return;
    let current:Run;
    const driver=createFastForwardCampaignController({
      runId:record.generation,
      source:base.world,initial,stopCondition:record.stopCondition,
      createWorker:(receive,failed)=>{
        const worker=new Worker(new URL('../engine/fastForward.worker.ts',import.meta.url),{type:'module'});
        worker.onmessage=({data}:MessageEvent<FastForwardWorkerResponse>)=>receive(data);
        worker.onerror=failed;worker.onmessageerror=failed;
        return {post:request=>worker.postMessage(request),terminate:()=>worker.terminate()};
      },
      commit:async (previous,next)=>{
        if(run.current!==current||!sameLive(base)||current.record.completedTicks!==previous.completedTicks)return false;
        const updated=await (await browserCampaignJournal()).checkpoint(current.record,next);
        current.record=updated;retain(updated);
        return run.current===current&&sameLive(base);
      },
      discard:async ()=>{
        const cancelled=await (await browserCampaignJournal()).cancel(current.record);
        current.record=cancelled;retain(cancelled);
        await (await browserCampaignJournal()).discard(cancelled);
        retain(undefined);
        return true;
      },
      onState:next=>{
        if(!mounted.current||run.current!==current)return;
        setState(next);
        if(next.phase==='error'){
          current.driver.detach();run.current=undefined;syncGuard();setState(undefined);setNotice(next.notice);
          void browserCampaignJournal().then(journal=>journal.read()).then(saved=>{if(mounted.current&&!run.current&&!op.current)retain(saved);}).catch(()=>undefined);
        }
      },
    });
    current={...base,record,driver};run.current=current;syncGuard();setState(driver.read());
    owner.current={...base,id:record.id};
    retain(record);context.current.pauseLive();
    driver.start();
  }

  const start=(binding:FastForwardPreflightBinding)=>{
    if(!supported()||!ruleVersion||run.current||record)return;
    const {timelineId}=context.current;
    const base={world:binding.world,timeline:binding.timeline,timelineId};
    if(!timelineId||!sameLive(base))return;
    withOperation(async signal=>{
      const {sealCampaignSource}=await import('../engine/campaignMemento');
      const memento=await sealCampaignSource(base.timeline,timelineId,base.world,{signal});
      if(signal.aborted||!sameLive(base))return;
      const next=await (await browserCampaignJournal()).begin(memento,binding.count,ruleVersion!,{signal,stopCondition:binding.stopCondition});
      retain(next);
      if(!signal.aborted&&sameLive(base))attach(next,base,createCampaignCheckpoint(base.world,binding.count));
    });
  };

  function reopen(item:CampaignJournalRecord,restoreOriginal:boolean) {
    if(!supported()||!ruleVersion||run.current)return;
    const guard={world:context.current.world,timeline:context.current.timeline};
    const same=matchesOwner(item);
    if(!same&&!restoreOriginal)return;
    withOperation(async signal=>{
      const value=await (await browserCampaignJournal()).load({signal});
      if(!value||!tokenMatches(value.record,item))throw Error('续跑凭据已变化，请重新核验。');
      if(signal.aborted||!sameLive(guard))return;
      if(value.record.ruleVersion!==ruleVersion)throw Error('本机规则与原候选不同，不能继续或确认。');
      const {checkpoint,source}=value;
      if(value.record.status==='cancelled')throw Error('这份候选已结束，不再继续。');
      if(value.record.status==='finalized') {
        if(!restoreOriginal)throw Error('恢复已确认结果前，请先确认替换当前运行中的世界。');
        const next=forkTimelineCampaignCheckpoint(source.timeline,source.timeline.activeBranchId,source.world.tick,forkable(checkpoint));
        if(next.activeBranchId!==value.record.committedBranchId)throw Error('已确认分支编号不符。');
        const incoming=readTimelineHead(next)!;
        if(!sameLive(guard)||signal.aborted)return;
        context.current.openResult(next,incoming,source.timelineId);owner.current=undefined;setReview(undefined);
        setNotice('已打开原来明确确认的长局结果，没有新增第二条分支。');
        await (await browserCampaignJournal()).discard(value.record);retain(undefined);
        return;
      }
      const claimed=await (await browserCampaignJournal()).claim(value.record,ruleVersion!,{signal});
      retain(claimed);
      if(signal.aborted||!sameLive(guard))return;
      setReview(undefined);
      if(restoreOriginal) {
        context.current.openSource(source);
        attach(claimed,{world:source.world,timeline:source.timeline,timelineId:source.timelineId},checkpoint);
      } else {
        if(!matchesOwner(item))return;
        attach(claimed,{...guard,timelineId:context.current.timelineId},checkpoint);
      }
    });
  }

  const reopenOriginal=(item:CampaignJournalRecord)=>{
    if(run.current)return;
    const guard={world:context.current.world,timeline:context.current.timeline};
    if(!sameLive(guard))return;
    withOperation(async signal=>{
      const source=await (await browserCampaignJournal()).loadSource(item,{signal});
      if(signal.aborted||!sameLive(guard))return;
      context.current.openSource(source);
      owner.current={id:item.id,world:source.world,timeline:source.timeline,timelineId:source.timelineId};
      setReview(undefined);
      setNotice('已打开核验过的原时间线及原分支；未继续候选，也未改变普通存档。');
    });
  };

  const cancel=()=>{
    const current=run.current;
    if(!current)return;
    withOperation(async ()=>{
      const removed=await current.driver.cancel();
      if(run.current===current){run.current=undefined;syncGuard();setState(undefined);}
      if(removed){retain(undefined);owner.current=undefined;setNotice('已丢弃长局候选，原世界和普通存档未改变。');}
      else {
        retain(await (await browserCampaignJournal()).read());
        setNotice('未确认已丢弃候选。原世界未改变，请核验本地记录。');
      }
    });
  };
  const discard=()=>{
    if(!record||run.current)return;
    const selected=record;
    withOperation(async signal=>{
      const final=selected.status==='finalized'||selected.status==='cancelled'?selected:await (await browserCampaignJournal()).cancel(selected,{signal});
      retain(final);
      await (await browserCampaignJournal()).discard(final,{signal});retain(undefined);
      owner.current=undefined;setReview(undefined);setNotice('已丢弃本地候选记录；当前世界与普通存档不变。');
    });
  };
  const apply=()=>{
    const current=run.current,checkpoint=current?.driver.readReadyCheckpoint();
    if(!current||!checkpoint||!sameLive(current)||current.record.ruleVersion!==ruleVersion)return;
    withOperation(async signal=>{
      const next=forkTimelineCampaignCheckpoint(current.timeline,current.timeline.activeBranchId,current.world.tick,forkable(checkpoint));
      const incoming=readTimelineHead(next);
      if(!incoming||!sameLive(current))return;
      const confirmed=await (await browserCampaignJournal()).finalize(current.record,next.activeBranchId,{signal});
      current.record=confirmed;retain(confirmed);
      if(signal.aborted||run.current!==current||!sameLive(current)) {
        if(run.current===current){current.driver.detach();run.current=undefined;syncGuard();setState(undefined);}
        setNotice('原线已改变，未自动应用。已确认结果仍可明确恢复。');
        return;
      }
      current.driver.detach();run.current=undefined;owner.current=undefined;syncGuard();setState(undefined);
      context.current.openResult(next,incoming);
      setNotice('长局目标已确认，进入一条新分支；原分支完整保留。');
      await (await browserCampaignJournal()).discard(confirmed);
      retain(undefined);
    });
  };
  const pending=record&&!run.current?record:undefined;
  const pendingDate=pending&&addCampaignCalendarMonths(pending.source,pending.completedTicks);
  return {
    available:supported(),active:!!run.current, working,state,notice, record,pending,
    pendingDate,sameSource:!!pending&&pending.status!=='finalized'&&matchesOwner(pending),
    reviewing:!!pending&&!!review&&tokenMatches(pending,review.record),
    reviewingOriginal:!!pending&&!!review&&tokenMatches(pending,review.record)&&review.originalOnly,
    showOriginalOnly:!!pending&&(pending.ruleVersion!==ruleVersion||!!notice),
    review:()=>{if(pending)setReview({record:pending,originalOnly:false});},
    reviewOriginal:()=>{if(pending)setReview({record:pending,originalOnly:true});},
    cancelReview:()=>setReview(undefined),
    restore:()=>{
      if(!pending||!review||!tokenMatches(pending,review.record))return;
      if(review.originalOnly)reopenOriginal(pending);
      else reopen(pending,true);
    },
    resumePending:()=>{if(pending)reopen(pending,false);},
    abortOperation:()=>op.current?.abort(),discard,start,pause:()=>{run.current?.driver.pause();},resume:()=>{run.current?.driver.resume();},cancel,apply,
  };
}
