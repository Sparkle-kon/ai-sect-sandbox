import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { resolveGuidedFrontierNightHuntTurn, type GuidedFrontierNightHuntTurn } from '../controllers/guidedFrontierNightHuntTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { projectFrontierNightHunt } from '../engine/frontierNightHunt';
import { activeFrontierVisit } from '../engine/frontierMovementEngine';
import { frontierSite } from '../engine/frontierTerms';
import type { FrontierNightHuntOption } from '../types/frontierNightHunt';
import type { Cultivator, WorldState } from '../types/world';

const Card=lazy(async()=>({default:(await import('./FrontierNightHuntCard')).FrontierNightHuntCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;
type View=NonNullable<ReturnType<typeof projectFrontierNightHunt>>;
type Result={world:WorldState;actorId:string;token:number;branchId:string;revision:number;view:View;siteName?:string;notice:string};

export function useFrontierNightHuntStory(sim:Sim,active:boolean,viewer:Cultivator|undefined) {
  const [result,setResult]=useState<Result>();
  const [busy,setBusy]=useState(false);
  const inFlight=useRef(false);
  const {world,timeline}=sim;
  const branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({visible,actorId:viewer?.id,token:0});
  if(scope.current.visible!==visible||scope.current.actorId!==viewer?.id)
    scope.current={visible,actorId:viewer?.id,token:scope.current.token+1};
  const token=scope.current.token;
  const view=useMemo(()=>visible&&viewer?projectFrontierNightHunt(world,viewer):undefined,[visible,viewer,world]);
  if(!visible||!viewer)return undefined;
  const settled=result?.world===world&&result.actorId===viewer.id&&result.token===token&&
    result.branchId===branchId&&result.revision===revision?result:undefined;
  const current=settled?.view??view;
  if(!current||!settled&&current.siteId!=='frontier-north-lee-mid')return undefined;
  const siteName=settled?.siteName??frontierSite(current.siteId)?.name;
  const stopped=busy||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const sameScope=()=>scope.current.visible&&scope.current.actorId===viewer.id&&scope.current.token===token&&
    !sim.browsing.current&&sim.history.current.activeBranchId===branchId&&sim.saveContextVersion.current===revision;
  const choose=(option:FrontierNightHuntOption)=>{
    if(stopped||inFlight.current||!sameScope()||sim.authority.current!==world||sim.history.current!==timeline||
      sim.stepInFlight.current||sim.fastForwardRun.current||sim.campaignGuard.current)return;
    const order:GuidedFrontierNightHuntTurn={kind:'frontier-night-hunt',world,branchId,revision,actorId:viewer.id,option};
    if(!resolveGuidedFrontierNightHuntTurn(order,world,branchId,revision))return;
    const visit=activeFrontierVisit(world,viewer.id);
    inFlight.current=true;
    setBusy(true);
    void sim.handleStepTick(order).then(()=>{
      if(option.frontierNightHuntMove!=='return'||!visit||!sameScope())return;
      const after=sim.authority.current;
      if(after.tick!==world.tick+1)return;
      const actor=after.cultivators.filter(row=>row.id===viewer.id&&row.alive&&row.hp>0);
      const destination=option.targetFrontierSiteId;
      const steps=after.frontier?.visits.filter(row=>row.id===visit.id&&row.actorId===viewer.id);
      const arrived=steps?.length===1?steps[0]:undefined;
      const nativeMove=destination===visit.anchorId?'exit':'travel';
      if(actor.length!==1||actor[0].locationId!==destination||!arrived||
        (nativeMove==='exit'?arrived.exitedTick!==after.tick||actor[0].positionPlane!==undefined:
          arrived.steps.at(-1)?.tick!==after.tick||arrived.steps.at(-1)?.siteId!==destination||actor[0].positionPlane!=='frontier'))return;
      const receipts=after.events.filter(row=>row.id===`evt-frontier-movement-${visit.id}-${nativeMove}-${after.tick}`&&
        row.tick===after.tick&&row.locationId===destination&&row.witnessScope==='participants'&&
        row.actorIds.length===1&&row.actorIds[0]===viewer.id);
      if(receipts.length!==1)return;
      const name=nativeMove==='travel'?frontierSite(destination)?.name:after.locations.find(site=>site.id===destination)?.name;
      if(!name)return;
      setResult({world:after,actorId:viewer.id,token,branchId,revision,siteName,
        view:{...current,options:[],last:undefined,observed:undefined},
        notice:nativeMove==='travel'?`已沿实通的路退到${name}，尚未回到旧域。`:`已由原关回到${name}。`});
    }).catch(()=>{
      // A failed native turn does not create a trail or a return receipt.
    }).finally(()=>{
      inFlight.current=false;
      setBusy(false);
    });
  };
  return <Suspense fallback={null}><Card view={current} siteName={siteName}
    busy={stopped} notice={settled?.notice} onChoose={settled?undefined:choose}/></Suspense>;
}
