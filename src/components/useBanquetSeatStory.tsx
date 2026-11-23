import { lazy,Suspense,useMemo,useRef,useState } from 'react';
import { resolveGuidedBanquetSeatTurn,type GuidedBanquetSeatTurn } from '../controllers/guidedBanquetSeatTurn';
import type { useWorldSimulationController } from '../controllers/useWorldSimulationController';
import { projectBanquetSeats,type BanquetSeatOption,type BanquetSeatView } from '../engine/banquetSeats';
import {currentVisibleTileIds,terrainTileAt} from '../engine/terrainEngine';
import {apprenticeshipPhysicallyAt} from '../engine/apprenticeshipPresence';
import type { Cultivator } from '../types/world';

const Card=lazy(async()=>({default:(await import('./BanquetSeatStoryCard')).BanquetSeatStoryCard}));
type Sim=ReturnType<typeof useWorldSimulationController>;

export function useBanquetSeatStory(sim:Sim,active:boolean,viewer:Cultivator|undefined,surface:string) {
  const {world,timeline}=sim,branchId=timeline.activeBranchId,revision=sim.saveContextVersion.current;
  const visible=active&&!sim.preview&&Boolean(viewer&&world.cultivators.includes(viewer));
  const scope=useRef({visible,actorId:viewer?.id,surface,mark:0});
  if(scope.current.visible!==visible||scope.current.actorId!==viewer?.id||scope.current.surface!==surface)
    scope.current={visible,actorId:viewer?.id,surface,mark:scope.current.mark+1};
  const mark=scope.current.mark;
  const sceneScope=useMemo(()=>({world,branchId,revision,mark}),[world,branchId,revision,mark]);
  const locked=useRef(false);
  const [pending,setPending]=useState(false);
  const view=useMemo(()=>visible&&viewer?projectBanquetSeats(world,viewer):undefined,[visible,viewer,world]);
  if(!visible||!viewer||!view)return undefined;
  const venue=world.locations.find(row=>row.id===view.siteId),tile=venue&&terrainTileAt(world,venue.x,venue.y);
  const atVenue=!!tile&&currentVisibleTileIds(world,viewer).has(tile.id)&&apprenticeshipPhysicallyAt(world,viewer,view.siteId,world.tick);
  const scopedView=scopeBanquetSeatForStory(view,atVenue,world.tick,surface);
  if(!scopedView)return undefined;
  const busy=pending||sim.isRunning||sim.isStepping||sim.fastForwardLocked;
  const choose=(option:BanquetSeatOption)=>{
    if(locked.current||busy||!scope.current.visible||scope.current.actorId!==viewer.id||scope.current.mark!==mark||
      sim.browsing.current||sim.stepInFlight.current||sim.fastForwardRun.current||sim.campaignGuard.current||
      sim.history.current!==timeline||sim.authority.current!==world||sim.saveContextVersion.current!==revision)return false;
    const order:GuidedBanquetSeatTurn={kind:'banquet-seat',world,branchId,revision,actorId:viewer.id,option};
    if(!resolveGuidedBanquetSeatTurn(order,world,branchId,revision))return false;
    locked.current=true;
    setPending(true);
    void sim.handleStepTick(order).catch(()=>{
      // An unsettled turn cannot create an actual attendance, refusal, or late arrival.
    }).finally(()=>{
      locked.current=false;
      setPending(false);
    });
    return true;
  };
  const render=(embedded:boolean)=><Suspense fallback={null}><Card view={scopedView} sceneScope={sceneScope} busy={busy}
    onChoose={choose} embedded={embedded}/></Suspense>;
  return {hallEventId:view.hallEventId,content:render(true),standalone:render(false)};
}


/** Own current invitation/receipt travels with its recipient; the formal table remains a local read. */
export function scopeBanquetSeatForStory(view:BanquetSeatView,atVenue:boolean,tick:number,surface:string):BanquetSeatView|undefined{
  const receipt=view.receipt?.tick===tick||atVenue&&surface==='world'?view.receipt:undefined;
  const presentCount=atVenue?view.presentCount:undefined;
  const actualTableHere=presentCount!==undefined&&(surface==='world'||tick===view.invitedTick+1);
  if(!view.options.length&&!receipt&&!actualTableHere)return undefined;
  const tableLine=!atVenue&&view.presentCount!==undefined?'原约的席时已过。席前诸事，未在此处亲见。':view.tableLine;
  return {...view,presentCount,receipt,tableLine};
}
