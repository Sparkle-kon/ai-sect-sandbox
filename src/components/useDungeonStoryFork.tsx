import { projectNextStoryGuidance } from '../engine/nextStoryGuidance';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { resolveGuidedDungeonTurn } from '../controllers/guidedDungeonTurn';
import {
  captureDungeonCounterfactualSource, previewDungeonCounterfactual, projectRealDungeonChoice,
  type DungeonCounterfactualSource, type DungeonCounterfactualStep, type DungeonCounterfactualView,
} from '../engine/dungeonCounterfactual';
import { availableDungeonMoves, type DungeonOption } from '../engine/expeditionDungeonEngine';
import type { TimelineSnapshot, WorldTimeline } from '../engine/timelineEngine';
import type { Cultivator, WorldState } from '../types/world';

const Scene=lazy(async()=>({default:(await import('./DungeonStoryForkScene')).DungeonStoryForkScene}));
type Sim=ReturnType<typeof useWorldSimulationController>;
type Stamp={world:WorldState;branchId:string;revision:number;actorId:string;viewGeneration:number;snapshot:TimelineSnapshot;
  source:DungeonCounterfactualSource;options:readonly DungeonOption[];label:string};
type Read={stamp:Stamp;proof?:DungeonCounterfactualStep;view?:DungeonCounterfactualView;notice?:string};

export function dungeonStorySnapshotRetained(timeline:WorldTimeline,branchId:string,snapshot:TimelineSnapshot):boolean {
  if(timeline.activeBranchId!==branchId)return false;
  const branch=timeline.branches.find(row=>row.id===branchId);
  const matches=branch?.snapshots.filter(row=>row.tick===snapshot.tick);
  return matches?.length===1&&matches[0]===snapshot;
}

export function useDungeonStoryFork(sim:Sim,active:boolean,viewer:Cultivator|undefined) {
  const [reading,setReading]=useState<Read>();
  const [pending,setPending]=useState(false);
  const held=useRef(false);
  const {world,timeline}=sim, branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const destination=useRef({visible,viewerId:viewer?.id,generation:0});
  if(destination.current.visible!==visible||destination.current.viewerId!==viewer?.id)
    destination.current={visible,viewerId:viewer?.id,generation:destination.current.generation+1};
  const viewGeneration=destination.current.generation;

  const live=useMemo<Stamp|undefined>(()=>{
    if(!visible||!viewer)return;
    const snapshot=timeline.branches.find(row=>row.id===branchId)?.snapshots.at(-1);
    if(!snapshot||snapshot.tick!==world.tick)return;
    const options=availableDungeonMoves(world,viewer,world.tick+1);
    const gather=options.find(row=>row.dungeonMove==='gather'&&row.targetDungeonRoomId==='garden');
    const retreat=gather&&options.find(row=>row.dungeonMove==='retreat'&&row.targetOccasionId===gather.targetOccasionId);
    if(!gather||!retreat)return;
    const source=captureDungeonCounterfactualSource(world,viewer,gather.targetOccasionId,branchId,revision);
    if(!source)return;
    return {world,branchId,revision,actorId:viewer.id,viewGeneration,snapshot,source,options:source.firstOptions,label:viewer.name};
  },[visible,viewer,timeline,branchId,revision,world,viewGeneration]);

  const inScope=(stamp:Stamp)=>destination.current.visible&&destination.current.viewerId===stamp.actorId&&
    destination.current.generation===stamp.viewGeneration&&!sim.browsing.current&&sim.saveContextVersion.current===stamp.revision&&
    dungeonStorySnapshotRetained(sim.history.current,stamp.branchId,stamp.snapshot);
  const canUse=(stamp:Stamp,needsLive:boolean)=>inScope(stamp)&&!sim.stepInFlight.current&&
    !sim.fastForwardRun.current&&!sim.campaignGuard.current&&!sim.isRunning&&!sim.fastForwardLocked&&
    sim.authority.current===world&&(!needsLive||sim.authority.current===stamp.world);
  const old=reading&&inScope(reading.stamp)&&(
    reading.stamp.world===world||reading.proof&&world.tick>=reading.proof.tick&&world.tick<=reading.proof.tick+7)?reading:undefined;
  const display=live??old?.stamp;
  if(!display)return undefined;

  const exactBase=(stamp:Stamp)=>JSON.stringify(stamp.snapshot.world)===JSON.stringify(stamp.world);
  const onCompare=()=>{
    if(held.current||!canUse(display,display===live)||!exactBase(display))return;
    const view=previewDungeonCounterfactual(display.source,display.world,display.branchId,display.revision);
    if(canUse(display,display===live)){
      setReading(prior=>({stamp:display,proof:prior?.stamp===display?prior.proof:undefined,view,
        notice:view?undefined:'这处险境已不能从原节点核验。'}));
    }
  };
  const onChoose=live?async(option:DungeonOption)=>{
    if(held.current||!canUse(live,true)||!exactBase(live)||!live.options.some(row=>row.targetOccasionId===option.targetOccasionId&&
      row.targetDungeonRoomId===option.targetDungeonRoomId&&row.dungeonMove===option.dungeonMove))return;
    const request={world:live.world,branchId:live.branchId,revision:live.revision,actorId:live.actorId,option};
    if(!resolveGuidedDungeonTurn(request,live.world,live.branchId,live.revision))return;
    held.current=true;
    setPending(true);
    try{
      await sim.handleStepTick(request);
      if(!inScope(live))return;
      const after=sim.authority.current;
      const committed=sim.history.current.branches.find(row=>row.id===live.branchId)?.snapshots.at(-1);
      const proof=committed?.tick===after.tick&&JSON.stringify(committed.world)===JSON.stringify(after)?
        projectRealDungeonChoice(live.source,live.world,after,option):undefined;
      setReading(prior=>({stamp:live,proof,view:prior?.stamp===live?prior.view:undefined,
        notice:proof?undefined:'未核到这一步的实有结果，不把预演算成已发生。'}));
    }finally{
      held.current=false;
      setPending(false);
    }
  }:undefined;
  const guidance=live&&viewer?projectNextStoryGuidance(world,viewer):undefined;
  return <Suspense fallback={null}><Scene
    guidance={guidance?.kind==='dungeon'?guidance.line:undefined}
    scene={{label:display.label,sourceTick:display.world.tick,options:live?.options??[],actual:old?.proof}}
    comparison={old?.stamp===display?old.view:undefined} notice={old?.stamp===display?old.notice:undefined}
    busy={pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked} onChoose={onChoose} onCompare={onCompare}/>
  </Suspense>;
}
