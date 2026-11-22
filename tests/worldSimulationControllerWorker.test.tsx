import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {useWorldSimulationController} from '../src/controllers/useWorldSimulationController';
import type {FastForwardPreflightBinding} from '../src/components/FastForwardPanel';
import {addFastForwardCalendarMonths} from '../src/engine/fastForwardCalendar';
import {createFastForwardRunner,type FastForwardWorkerRequest,type FastForwardWorkerResponse} from '../src/engine/fastForwardEngine';
import {encodeWorldSave} from '../src/engine/storageEngine';
import {readTimelineHead} from '../src/engine/timelineEngine';
import {executeGodIntervention} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';

type Controller=ReturnType<typeof useWorldSimulationController>;
type Stage=Extract<FastForwardWorkerResponse,{type:'staged'}>;
function required<T>(value:T|undefined|null,description:string):T{
  if(value==null)throw Error(description);
  return value;
}
function productionHook(drive:(controller:Controller)=>void){
  let latest:Controller|undefined;
  const onActivate=vi.fn<(world:WorldState)=>void>();
  const onPreviewContextChange=vi.fn<()=>void>();
  const onHistoricalPreview=vi.fn<()=>void>();
  function Harness(){
    latest=useWorldSimulationController({playbackEnabled:false,inspectCampaign:false,onActivate,onPreviewContextChange,onHistoricalPreview});
    drive(latest);
    return null;
  }
  renderToStaticMarkup(<Harness/>);
  return {controller:required(latest,'Actual hook frame required'),onActivate,onHistoricalPreview};
}
function fakeWorker(){
  const instances:Transport[]=[];
  class Transport {
    readonly sent:FastForwardWorkerRequest[]=[];
    onmessage?: (message: {data:FastForwardWorkerResponse})=>void;
    terminationCount=0;
    constructor(){instances.push(this);}
    postMessage(message:FastForwardWorkerRequest){this.sent.push(message);}
    terminate(){this.terminationCount++;}
    deliver(data:FastForwardWorkerResponse){this.onmessage?.({data});}
  }
  vi.stubGlobal('Worker',Transport);
  return instances;
}
const save=(world:WorldState)=>encodeWorldSave(world);
function binding(c:Controller,count=2):FastForwardPreflightBinding{
  const timeline=c.history.current,world=c.authority.current;
  const branchId=timeline.activeBranchId;
  return {world,timeline,head:required(timeline.branches.find(row=>row.id===branchId)?.snapshots.at(-1),'Authoritative head'),branchId,
    count,target:required(addFastForwardCalendarMonths(world,count),'Exact future civil month'),
    contextVersion:c.saveContextVersion.current,scopeKey:c.viewScopeKey};
}
function nativeStage(request:FastForwardWorkerRequest):Stage{
  if(request.type!=='start')throw Error('An actual Worker start request must provide the native baseline');
  const job=createFastForwardRunner(request.base,request.requestedTicks,{now:()=>0});
  let progress=job.readProgress();
  for(let turn=0;turn<request.requestedTicks&&progress.completedTicks<request.requestedTicks;turn++)progress=job.advanceChunk();
  return {type:'staged',runId:request.runId,progress,checkpoint:required(job.checkpoint(),'Native complete checkpoint')};
}
afterEach(()=>vi.unstubAllGlobals());

describe('world simulation controller with native checkpoint and explicit synthetic Worker transport',()=>{
  it('cancels an active Worker with progress; a matching report already queued for delivery cannot publish afterward',()=>{
    const bus=fakeWorker();
    const noNetwork=vi.fn(()=>{throw Error('Offline checkpoint must not fetch');});
    vi.stubGlobal('fetch',noNetwork);
    let phase=0,base:WorldState|undefined,baseBytes='',staged:Stage|undefined;
    const {controller,onActivate}=productionHook(c=>{
      if(phase===0){
        phase++;
        const verified=binding(c);
        base=verified.world;
        baseBytes=save(base);
        c.startFastForward(2,verified,()=>false);
      }else if(phase===1){
        phase++;
        expect(c.fastForwardView.phase).toBe('running');
        expect(bus).toHaveLength(1);
        const worker=bus[0],request=worker.sent[0];
        if(request.type!=='start')throw Error('Exact Worker start expected');
        expect(request.base).toBe(base);
        staged=nativeStage(request);
        expect(save(request.base)).toBe(baseBytes);
        worker.deliver({type:'progress',runId:request.runId,progress:staged.progress});
      }else if(phase===2){
        phase++;
        expect(c.fastForwardView).toMatchObject({phase:'running',progress:{completedTicks:2}});
        c.stopFastForward('已取消，当前世界不变。');
        expect(bus[0].terminationCount).toBe(1);
      }else if(phase===3){
        phase++;
        expect(c.fastForwardView).toMatchObject({phase:'idle',notice:'已取消，当前世界不变。'});
        bus[0].deliver(required(staged,'Native response already queued before termination'));
        c.applyFastForward();
        expect(c.authority.current).toBe(base);
      }
    });
    expect(phase).toBe(4);
    expect(controller.history.current.branches).toHaveLength(1);
    expect(controller.history.current.activeBranchId).toBe('main');
    expect(controller.authority.current).toBe(base);
    expect(save(controller.authority.current)).toBe(baseBytes);
    expect(bus[0].terminationCount).toBe(1);
    expect(onActivate).not.toHaveBeenCalled();
    expect(noNetwork).not.toHaveBeenCalled();
  });

  it('invalidates a late staged reply after a real same-tick authority update and ignores that retired callback in the fresh run',()=>{
    const bus=fakeWorker();
    let phase=0,stale:FastForwardPreflightBinding|undefined,freshBytes='',reply:Stage|undefined;
    const {controller,onActivate}=productionHook(c=>{
      if(phase===0){
        phase++;
        stale=binding(c);
        c.startFastForward(2,stale,()=>false);
      }else if(phase===1){
        phase++;
        const old=required(stale,'Original preflight');
        reply=nativeStage(bus[0].sent[0]);
        const before=save(old.world);
        const changing=old.world.cultivators.find(row=>row.alive&&row.hp>0&&!row.positionPlane)!;
        const next=c.updateWorld(world=>executeGodIntervention(world,{type:'WHISPER_MIND',targetCultivatorId:changing.id,
          whisperText:'同月已有真实新签，旧快照不能入册。'}));
        expect(next.tick).toBe(old.world.tick);
        expect(next.interventionSequence).toBe(old.world.interventionSequence+1);
        freshBytes=save(next);
        expect(freshBytes).not.toBe(before);
        bus[0].deliver(reply);
        expect(bus[0].terminationCount).toBe(1);
      }else if(phase===2){
        phase++;
        expect(c.fastForwardView.phase).toBe('error');
        expect(c.fastForwardRun.current).toBeUndefined();
        expect(c.fastForwardView.notice).toContain('原分支已经变化');
        c.applyFastForward();
        c.startFastForward(2,required(stale,'Old binding deliberately reused'),()=>false);
        expect(bus).toHaveLength(1);
        expect(save(c.authority.current)).toBe(freshBytes);
      }else if(phase===3){
        phase++;
        c.startFastForward(2,binding(c),()=>false);
      }else if(phase===4){
        phase++;
        expect(c.fastForwardView.phase).toBe('running');
        expect(bus).toHaveLength(2);
        expect(bus[1].sent[0]).toMatchObject({type:'start',base:c.authority.current});
        const freshId=c.fastForwardRun.current?.id;
        bus[0].deliver(required(reply,'Original same-month staged reply'));
        expect(c.fastForwardRun.current?.id).toBe(freshId);
        expect(bus[1].terminationCount).toBe(0);
        c.stopFastForward();
      }
    });
    expect(phase).toBe(5);
    expect(controller.history.current.branches).toHaveLength(1);
    expect(save(controller.authority.current)).toBe(freshBytes);
    expect(controller.fastForwardRun.current).toBeUndefined();
    expect(bus.map(worker=>worker.terminationCount)).toEqual([1,1]);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('does not accept a queued old Worker message after a real same-tick historical fork activates before it arrives',()=>{
    const bus=fakeWorker();
    let phase=0,baseBytes='',branchBytes='',oldTick=0,report:Stage|undefined;
    const {controller,onActivate,onHistoricalPreview}=productionHook(c=>{
      if(phase===0){
        phase++;
        const original=binding(c);
        oldTick=original.world.tick;
        baseBytes=save(original.head.world);
        c.startFastForward(2,original,()=>false);
      }else if(phase===1){
        phase++;
        report=nativeStage(bus[0].sent[0]);
        c.handleTimelinePreview(oldTick);
      }else if(phase===2){
        phase++;
        expect(c.browsing.current).toBe(true);
        expect(c.preview?.tick).toBe(oldTick);
        const target=c.visibleWorld.cultivators.find(row=>row.alive&&row.hp>0&&!row.positionPlane)!;
        c.handleTimelineFork('main',oldTick,{type:'WHISPER_MIND',targetCultivatorId:target.id,
          whisperText:'已另开此月支线，只在新支线保留。'});
      }else if(phase===3){
        phase++;
        expect(c.history.current.activeBranchId).toBe('branch-1');
        expect(c.browsing.current).toBe(false);
        branchBytes=save(c.authority.current);
        expect(branchBytes).not.toBe(baseBytes);
        expect(bus[0].terminationCount).toBe(1);
        bus[0].deliver(required(report,'Queued original Worker report'));
        c.applyFastForward();
        expect(save(c.authority.current)).toBe(branchBytes);
      }
    });
    expect(phase).toBe(4);
    expect(controller.history.current.branches.map(({id})=>id)).toEqual(['main','branch-1']);
    expect(controller.world.tick).toBe(oldTick);
    expect(save(required(readTimelineHead(controller.history.current,'main'),'Original must remain'))).toBe(baseBytes);
    expect(save(controller.authority.current)).toBe(branchBytes);
    expect(controller.fastForwardRun.current).toBeUndefined();
    expect(onHistoricalPreview).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('fails closed for a native completed checkpoint re-labelled to a different calendar month on the matching Worker run',()=>{
    const bus=fakeWorker();
    let phase=0,baseBytes='';
    const {controller,onActivate}=productionHook(c=>{
      if(phase===0){
        phase++;
        baseBytes=save(c.authority.current);
        c.startFastForward(2,binding(c),()=>false);
      }else if(phase===1){
        phase++;
        const worker=bus[0],valid=nativeStage(worker.sent[0]);
        const wrongDate={...valid.checkpoint.world,month:valid.checkpoint.world.month%12+1};
        worker.deliver({...valid,checkpoint:{...valid.checkpoint,world:wrongDate}});
      }else if(phase===2){
        phase++;
        expect(c.fastForwardView.phase).toBe('error');
        expect(c.fastForwardView.notice).toContain('年月不符');
        c.applyFastForward();
      }
    });
    expect(phase).toBe(3);
    expect(bus[0].terminationCount).toBe(1);
    expect(controller.fastForwardRun.current).toBeUndefined();
    expect(save(controller.authority.current)).toBe(baseBytes);
    expect(controller.history.current.branches).toHaveLength(1);
    expect(onActivate).not.toHaveBeenCalled();
  });
});
