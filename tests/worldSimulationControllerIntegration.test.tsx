import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {useWorldSimulationController} from '../src/controllers/useWorldSimulationController';
import type {FastForwardPreflightBinding} from '../src/components/FastForwardPanel';
import {addFastForwardCalendarMonths} from '../src/engine/fastForwardCalendar';
import {createFastForwardRunner,type FastForwardWorkerRequest,type FastForwardWorkerResponse} from '../src/engine/fastForwardEngine';
import {cloneWorldWithColdHistory} from '../src/engine/coldHistoryEngine';
import {encodeWorldSave} from '../src/engine/storageEngine';
import {readTimelineSnapshot} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';

type Controller=ReturnType<typeof useWorldSimulationController>;
function requireValue<T>(value:T|undefined|null,why:string):T{
  if(value==null)throw Error(why);
  return value;
}
function mountController(drive?:(controller:Controller)=>void){
  const onActivate=vi.fn<(world:WorldState)=>void>();
  const onHistoricalPreview=vi.fn<()=>void>();
  const onPreviewContextChange=vi.fn<()=>void>();
  let current:Controller|undefined;
  function Harness(){
    current=useWorldSimulationController({playbackEnabled:false,inspectCampaign:false,onActivate,onHistoricalPreview,onPreviewContextChange});
    drive?.(current);
    return <output data-live={current.world.tick} data-visible={current.visibleWorld.tick} data-scope={current.viewScopeKey}/>;
  }
  const html=renderToStaticMarkup(<Harness/>);
  return {controller:requireValue(current,'Actual React presentation of controller'),html,onActivate,onHistoricalPreview,onPreviewContextChange};
}
// Compare the actual retained serialization order (the timeline's immutable clone owns its cold-history leaf).
const strict=(world:WorldState)=>encodeWorldSave(cloneWorldWithColdHistory(world));
const snapshot=(controller:Controller,tick:number,branch='main')=>
  requireValue(readTimelineSnapshot(controller.history.current,tick,branch),'Authoritative timeline frame required');

describe('one world simulation authority behind story and cockpit modes',()=>{
  it('starts fresh hook instances with independent refs, flow locks, and exactly one canonical initial branch',async()=>{
    const one=mountController(),two=mountController(),a=one.controller,b=two.controller;
    expect(a.world).toBe(a.visibleWorld);
    expect(a.world).toBe(a.authority.current);
    expect(a.timeline).toBe(a.history.current);
    expect(a.sourceBranch).toMatchObject({branchId:'main'});
    expect(a.viewScopeKey).toBe('0:main:live');
    expect(a.timeline.branches[0].snapshots).toHaveLength(1);
    expect(strict(snapshot(a,a.world.tick))).toBe(strict(a.world));
    expect(a.world).not.toBe(b.world);
    expect(a.history).not.toBe(b.history);
    expect(a.authority).not.toBe(b.authority);
    expect(a.fastForwardView.phase).toBe('idle');
    expect(a.fastForwardLocked).toBe(false);
    expect(a.fairModelCoverage).toBeUndefined();
    expect(a.llmConfig.enabled).toBe(false);
    const base=a.authority.current,untouched=strict(b.authority.current),tick=base.tick;
    expect(a.tryBeginInteraction()).toBe(true);
    expect(a.tryBeginInteraction()).toBe(false);
    expect(b.stepInFlight.current).toBe(false);
    await a.handleStepTick();
    expect(a.authority.current).toBe(base);
    a.endInteraction();
    await a.handleStepTick();
    expect(a.stepInFlight.current).toBe(false);
    expect(a.authority.current.tick).toBe(tick+1);
    expect(strict(snapshot(a,tick+1))).toBe(strict(a.authority.current));
    expect(strict(snapshot(a,tick))).toBe(strict(base));
    expect(a.canUseSaveContext(base)).toBe(false);
    expect(a.canUseSaveContext(a.authority.current,a.saveContextVersion.current)).toBe(true);
    expect(strict(b.authority.current)).toBe(untouched);
    expect(strict(base)).toBe(untouched);
    expect(one.onActivate).not.toHaveBeenCalled();
  });

  it('uses one React source across preview, a genuine branch fork, and return, without touching original save bytes',()=>{
    // Synchronous render-phase updates are only a React SSR harness: they expose subsequent hook frames without a DOM.
    let phase=0,initial='',live='';
    const secret='支线实际传音，不得改写原本';
    const result=mountController(controller=>{
      if(phase===0){
        phase++;
        initial=strict(controller.world);
        controller.updateWorld(world=>advanceWorldTick(world,undefined,undefined,'utility'));
      }else if(phase===1){
        phase++;
        expect(controller.world.tick).toBe(2);
        live=strict(controller.world);
        controller.handleTimelinePreview(1);
      }else if(phase===2){
        phase++;
        expect(controller.world.tick).toBe(2);
        expect(controller.authority.current).toBe(controller.world);
        expect(controller.visibleWorld.tick).toBe(1);
        expect(strict(controller.visibleWorld)).toBe(initial);
        expect(controller.viewScopeKey).toBe('0:main:1');
        expect(controller.browsing.current).toBe(true);
        expect(controller.canUseSaveContext(controller.world)).toBe(false);
        controller.handleTimelineFork('main',1,{type:'WHISPER_MIND',targetCultivatorId:'npc-2',whisperText:secret});
      }else if(phase===3){
        phase++;
        expect(controller.history.current.activeBranchId).toBe('branch-1');
        expect(controller.world.tick).toBe(1);
        expect(controller.visibleWorld).toBe(controller.world);
        expect(controller.world.events.some(event=>event.description.includes(secret))).toBe(true);
        expect(strict(snapshot(controller,2))).toBe(live);
        controller.handleTimelineSelectBranch('main');
      }
    });
    expect(phase).toBe(4);
    expect(result.html).toContain('data-live="2" data-visible="2" data-scope="0:main:live"');
    expect(result.controller.history.current.branches).toHaveLength(2);
    expect(result.onHistoricalPreview).toHaveBeenCalledTimes(1);
    expect(result.onActivate.mock.calls.map(([world])=>world.tick)).toEqual([1,2]);
    expect(result.controller.browsing.current).toBe(false);
    expect(strict(result.controller.world)).toBe(live);
    expect(strict(snapshot(result.controller,1))).toBe(initial);
  });

  it('requires fresh source bindings for synthetic Worker transport and only commits its real staged result into a new branch',()=>{
    // The component protocol is exercised with a recorded transport; the checkpoint content comes from the native runner.
    const workers:Transport[]=[];
    class Transport {
      readonly sent:FastForwardWorkerRequest[]=[];
      onmessage?: (event:{data:FastForwardWorkerResponse})=>void;
      terminated=false;
      constructor(){workers.push(this);}
      postMessage(request:FastForwardWorkerRequest){this.sent.push(request);}
      terminate(){this.terminated=true;}
      emit(data:FastForwardWorkerResponse){this.onmessage?.({data});}
    }
    vi.stubGlobal('Worker',Transport);
    let phase=0,base='',candidate='';
    function binding(c:Controller):FastForwardPreflightBinding{
      const timeline=c.history.current,world=c.authority.current;
      const head=requireValue(timeline.branches.find(row=>row.id===timeline.activeBranchId)?.snapshots.at(-1),'Actual bound head');
      return {world,timeline,head,branchId:timeline.activeBranchId,count:2,
        contextVersion:c.saveContextVersion.current,scopeKey:c.viewScopeKey,
        target:requireValue(addFastForwardCalendarMonths(world,2),'Real requested calendar date')};
    }
    try{
      const result=mountController(c=>{
        if(phase===0){
          phase++;
          base=strict(c.authority.current);
          c.startFastForward(2,{...binding(c),contextVersion:c.saveContextVersion.current+1},()=>true);
        }else if(phase===1){
          phase++;
          expect(c.fastForwardView.phase).toBe('error');
          expect(workers).toHaveLength(0);
          expect(strict(c.authority.current)).toBe(base);
          c.startFastForward(2,binding(c),()=>true);
        }else if(phase===2){
          phase++;
          expect(c.fastForwardView.phase).toBe('running');
          const transport=requireValue(workers[0],'Prepared thread transport'),request=transport.sent[0];
          expect(request).toMatchObject({type:'start',requestedTicks:2});
          if(request.type!=='start')throw Error('Wrong actual protocol');
          expect(request.base).toBe(c.authority.current);
          const run=createFastForwardRunner(request.base,request.requestedTicks);
          let progress=run.readProgress();
          while(progress.completedTicks<2)progress=run.advanceChunk();
          const staged=requireValue(run.checkpoint(),'Actual native checkpoint');
          candidate=strict(staged.world);
          transport.emit({type:'staged',runId:'old-other-run',progress,checkpoint:staged});
          expect(c.fastForwardRun.current?.id).toBe(request.runId);
          expect(transport.terminated).toBe(false);
          transport.emit({type:'staged',runId:request.runId,progress,checkpoint:staged});
          expect(transport.terminated).toBe(true);
        }else if(phase===3){
          phase++;
          expect(c.fastForwardView.phase).toBe('ready');
          expect(strict(c.authority.current)).toBe(base);
          expect(c.history.current.activeBranchId).toBe('main');
          c.applyFastForward();
        }
      });
      expect(phase).toBe(4);
      expect(result.controller.history.current.activeBranchId).toBe('branch-1');
      expect(result.controller.fastForwardRun.current).toBeUndefined();
      expect(strict(result.controller.authority.current)).toBe(candidate);
      expect(strict(snapshot(result.controller,1))).toBe(base);
      expect(result.onActivate).toHaveBeenCalledTimes(1);
    }finally{vi.unstubAllGlobals();}
  });

  it('discards an actual in-flight model response after a native reset invalidates its save context',async()=>{
    const responders:Array<(value:Response)=>void>=[];
    const request=vi.fn(async()=>await new Promise<Response>(resolve=>responders.push(resolve)));
    vi.stubGlobal('fetch',request);
    try{
      let configApplied=false;
      const f=mountController(c=>{
        if(configApplied)return;
        configApplied=true;
        c.changeLlmConfig({enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture-only',model:'fixture'});
      });
      const c=f.controller,start=c.authority.current,oldTimeline=c.history.current,oldContext=c.saveContextVersion.current;
      expect(c.llmConfig.enabled).toBe(true);
      const pending=c.handleStepTick();
      await vi.waitFor(()=>expect(request).toHaveBeenCalled());
      expect(c.stepInFlight.current).toBe(true);
      c.handleReset();
      const resetWorld=c.authority.current,resetTimeline=c.history.current;
      expect(c.saveContextVersion.current).toBeGreaterThan(oldContext);
      expect(resetWorld).not.toBe(start);
      expect(resetTimeline).not.toBe(oldTimeline);
      const response=()=>new Response(JSON.stringify({choices:[{message:{
        content:JSON.stringify({chosenAction:'REST',innerMonologue:'实际合法，但已越过原视图的返回。'}),
      }}]}));
      for(const send of responders)send(response());
      await pending;
      expect(c.authority.current).toBe(resetWorld);
      expect(c.history.current).toBe(resetTimeline);
      expect(c.stepInFlight.current).toBe(false);
      expect(resetWorld.tick).toBe(start.tick);
      expect(strict(resetWorld)).toBe(strict(start));
      expect(strict(snapshot(c,start.tick))).toBe(strict(start));
      expect(c.history.current.branches[0].snapshots).toHaveLength(1);
      expect(f.onActivate).toHaveBeenCalledTimes(1);
      expect(f.onActivate).toHaveBeenCalledWith(resetWorld);
    }finally{vi.unstubAllGlobals();}
  });
});
