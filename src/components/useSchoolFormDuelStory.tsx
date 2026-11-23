import {projectGuidedVisualDuelArena} from './visualGuidedDuelArenaModel';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createSceneFrameLease, type SceneFrame } from '../controllers/sceneFrameLease';
import { resolveGuidedSchoolFormDuelTurn, type GuidedSchoolFormDuelTurn } from '../controllers/guidedSchoolFormDuelTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { schoolFormDuelView, schoolFormStoryReceipt } from '../engine/schoolFormDuel';
import type { SchoolFormDuelChoice } from '../types/schoolFormDuel';
import type { Cultivator, WorldState } from '../types/world';

const Card=lazy(async()=>({default:(await import('./SchoolFormDuelCard')).SchoolFormDuelCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;
type View=NonNullable<ReturnType<typeof schoolFormDuelView>>;
type Followup={world:WorldState;branchId:string;revision:number;role:number;actorId:string;view:View;
  focusAllowed:boolean;before:{x:number;y:number};receipt:NonNullable<ReturnType<typeof schoolFormStoryReceipt>>};

const documentReady=()=>typeof document==='undefined'||
  (document.visibilityState!=='hidden'&&(typeof document.hasFocus!=='function'||document.hasFocus()));

export function useSchoolFormDuelStory(sim:Sim,active:boolean,viewer:Cultivator|undefined, surface:'story'|'cockpit'|'history',
  returnFocus?:RefObject<HTMLElement|null>) {
  const [followup,setFollowup]=useState<Followup>();
  const [pending,setPending]=useState(false);
  const [stale,setStale]=useState<WorldState>();
  const [,updatePresence]=useState(0);
  const lease=useRef(createSceneFrameLease()).current;
  const {world,timeline,preview}=sim;
  const historicalWorld=preview?.world;
  const branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const allowed=active&&!preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({allowed,surface,viewerId:viewer?.id,role:0,epoch:0,focused:documentReady()});
  if(scope.current.allowed!==allowed||scope.current.surface!==surface||scope.current.viewerId!==viewer?.id)
    scope.current={allowed,surface,viewerId:viewer?.id,role:scope.current.role+1,epoch:scope.current.epoch+1,focused:scope.current.focused};
  const {role,epoch,focused}=scope.current;
  useEffect(()=>{
    if(!allowed)return;
    const change=(next:boolean)=>{
      if(scope.current.focused===next)return;
      scope.current={...scope.current,focused:next,epoch:scope.current.epoch+1};
      if(!next)lease.invalidate();
      updatePresence(value=>value+1);
    };
    const ready=()=>change(documentReady());
    const blur=()=>change(false);
    ready();
    window.addEventListener('blur',blur);
    window.addEventListener('focus',ready);
    document.addEventListener('visibilitychange',ready);
    return ()=>{
      window.removeEventListener('blur',blur);
      window.removeEventListener('focus',ready);
      document.removeEventListener('visibilitychange',ready);
    };
  },[allowed,lease]);
  const historical=useMemo(()=>historicalWorld&&viewer&&historicalWorld.cultivators.includes(viewer)
    ?schoolFormDuelView(historicalWorld,viewer):undefined,[historicalWorld,viewer]);
  const view=useMemo(()=>allowed&&viewer?schoolFormDuelView(world,viewer):undefined,[allowed,viewer,world]);
  if(historical&&historicalWorld)return <Suspense fallback={null}><Card view={historical} historical sceneScope={historicalWorld}/></Suspense>;
  if(!allowed||!viewer)return undefined;
  const result=followup?.world===world&&followup.branchId===branchId&&followup.revision===revision&&
    followup.actorId===viewer.id&&followup.role===role?followup:undefined;
  const scene=view??result?.view;
  if(!scene)return undefined;
  const busy=pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const sameRole=()=>scope.current.allowed&&scope.current.viewerId===viewer.id&&scope.current.role===role&&
    !sim.browsing.current&&sim.history.current.activeBranchId===branchId&&sim.saveContextVersion.current===revision;
  const frame:SceneFrame={world,branchId,revision,viewerId:viewer.id,sceneId:scene.contactId,scopeEpoch:epoch,live:true,focused};
  const activeFrame=(head:WorldState):SceneFrame=>({...frame,world:head,branchId:sim.history.current.activeBranchId,
    revision:sim.saveContextVersion.current,viewerId:scope.current.viewerId??'',scopeEpoch:scope.current.epoch,
    live:sameRole(),focused:scope.current.focused&&documentReady()});
  const choose=(choice:SchoolFormDuelChoice):boolean=>{
    if(!view||busy||!sameRole()||sim.authority.current!==world||sim.stepInFlight.current||
       sim.fastForwardRun.current||sim.campaignGuard.current||sim.history.current!==timeline)return false;
    const order:GuidedSchoolFormDuelTurn={kind:'school-form-duel',world,branchId,revision,actorId:viewer.id,contactId:view.contactId,choice};
    if(!resolveGuidedSchoolFormDuelTurn(order,world,branchId,revision)){setStale(world);return false;}
    const quote=lease.quote(frame);
    const token=quote&&lease.reserve(quote,activeFrame(sim.authority.current));
    if(!token)return false;
    const focusWasHere=Boolean(document.activeElement?.closest('[data-school-form-scene]'));
    const before={x:window.scrollX,y:window.scrollY};
    setPending(true);
    void sim.handleStepTick(order).then(()=>{
      const after=sim.authority.current;
      const focusAllowed=lease.finish(token,activeFrame(world));
      if(!sameRole())return;
      if(after.tick!==world.tick+1){setStale(after);return;}
      const receipt=schoolFormStoryReceipt(after,viewer.id,view.contactId,choice);
      if(receipt)setFollowup({world:after,branchId,revision,role,actorId:viewer.id,
        view:{...view,options:[]},receipt,before,focusAllowed:focusWasHere&&focusAllowed});
      else setStale(after);
    }).catch(()=>{
      lease.finish(token,activeFrame(world));
      if(sameRole())setStale(sim.authority.current);
    }).finally(()=>setPending(false));
    return true;
  };
  const close=()=>{
    if(!result||!sameRole()||sim.authority.current!==world||!scope.current.focused||!documentReady())return;
    const opener=returnFocus?.current;
    const focusedInside=Boolean(document.activeElement?.closest('[data-school-form-scene]'));
    if(focusedInside&&opener?.isConnected)opener.focus({preventScroll:true});
    if(focusedInside||document.activeElement===document.body)
      window.scrollTo({left:result.before.x,top:result.before.y,behavior:'instant'});
    setFollowup(undefined);
  };
  const arena=view&&!result&&sameRole()&&sim.authority.current===world?
    projectGuidedVisualDuelArena(world,viewer,'school',view.contactId):undefined;
  return <Suspense fallback={null}><Card view={scene} arena={arena} receipt={result?.receipt} busy={busy}
    sceneScope={result?.view??world} receiptFocus={result?.focusAllowed}
    notice={stale===world?'这次交锋的情形已变，没能按原选择落定。':undefined}
    onChoose={view&&stale!==world?choose:undefined} onContinue={result?close:undefined}/></Suspense>;
}
