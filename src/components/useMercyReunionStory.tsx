import {lazy,Suspense,useMemo,useRef,useState} from 'react';
import {resolveGuidedMercyReunionTurn,type GuidedMercyReunionTurn} from '../controllers/guidedMercyReunionTurn';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {projectMercyReunion} from '../engine/mercyReunion';
import {conditionalMercyChoices,type StoryMercyOption} from '../engine/mercyReunionCognition';
import type {Cultivator} from '../types/world';

const Card=lazy(async()=>({default:(await import('./MercyReunionStoryCard')).MercyReunionStoryCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;

export function useMercyReunionStory(sim:Sim,active:boolean,viewer:Cultivator|undefined){
  const {world,timeline}=sim,branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const frame=useRef({visible,actorId:viewer?.id,epoch:0});
  if(frame.current.visible!==visible||frame.current.actorId!==viewer?.id)
    frame.current={visible,actorId:viewer?.id,epoch:frame.current.epoch+1};
  const epoch=frame.current.epoch;
  const guard=useRef(false);
  const [pending,setPending]=useState(false);
  const view=useMemo(()=>visible&&viewer?projectMercyReunion(world,viewer):undefined,[visible,viewer,world]);
  const conditional=useMemo(()=>visible&&viewer&&!view?conditionalMercyChoices(world,viewer)[0]:undefined,[visible,viewer,world,view]);
  if(!visible||!viewer||!view&&!conditional)return undefined;
  const busy=pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const choose=(option:StoryMercyOption)=>{
    if(guard.current||busy||!frame.current.visible||frame.current.actorId!==viewer.id||frame.current.epoch!==epoch||
       sim.browsing.current||sim.stepInFlight.current||sim.fastForwardRun.current||sim.campaignGuard.current||
       sim.history.current!==timeline||sim.authority.current!==world||sim.saveContextVersion.current!==revision)return;
    const request:GuidedMercyReunionTurn={kind:'mercy-reunion',world,branchId,revision,actorId:viewer.id,option};
    if(!resolveGuidedMercyReunionTurn(request,world,branchId,revision))return;
    guard.current=true;setPending(true);
    void sim.handleStepTick(request).catch(()=>{
      // A turn that did not settle cannot produce a mercy receipt.
    }).finally(()=>{guard.current=false;setPending(false);});
  };
  if(view)return <Suspense fallback={null}><Card view={view} busy={busy} onChoose={choose}/></Suspense>;
  const target=conditional&&world.cultivators.find(row=>row.id===conditional.targetCultivatorId);
  if(!conditional||!target)return undefined;
  return <section aria-label="收锋的余地" className="min-w-0 space-y-2 rounded-lg border border-amber-200/25 bg-slate-900 p-3 text-slate-100 [overflow-wrap:anywhere]">
    <h3 className="font-serif text-lg font-semibold text-amber-50">收锋的余地</h3>
    <p className="text-sm leading-relaxed text-slate-300">{target.name}就在眼前，伤势已重。若仍须出手，可以先定下一个条件；胜负和伤势只由实际交锋决定。</p>
    <button type="button" disabled={busy} className="min-h-[44px] w-full rounded-md border border-amber-300/35 bg-slate-950 px-3 text-sm text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-50"
      onClick={event=>{if(event.detail<=1)choose(conditional);}}
      onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&event.repeat)event.preventDefault();}}>出手，若真到最后一剑便收锋</button>
  </section>;
}
