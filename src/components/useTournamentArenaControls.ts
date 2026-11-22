import {useRef,useState} from 'react';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {canSeeOccasion} from '../engine/expeditionOmenEngine';
import {availableTournamentWager,placeTournamentWager,projectTournamentWager} from '../engine/tournamentWagerEngine';
import {activeAvatar} from '../engine/avatarEngine';
import {sameGeneratedWorld} from '../engine/worldIdentity';
import type {Cultivator,WorldState} from '../types/world';
import type {TournamentArenaControls} from './TournamentArenaRead';

type Simulation=ReturnType<typeof useWorldSimulationController>;
type View={world:WorldState;branch:string;revision:number;viewerId:string;blocked:boolean};
const MAX_TOURNAMENT_MONTHS=4;

function visibleArena(world:WorldState,id:string,viewerId:string){
  const viewer=world.cultivators.find(actor=>actor.id===viewerId);
  const rows=world.occasions.filter(row=>row.id===id&&row.kind==='tournament'&&row.arena&&canSeeOccasion(world,viewer,row));
  return rows.length===1?rows[0]:undefined;
}

function sameBoundArenaView(source:View,actual:View){
  return !actual.blocked&&actual.branch===source.branch&&actual.revision===source.revision&&actual.viewerId===source.viewerId;
}

/** Forward only native one-month turns. A replacement or failed turn never supplies a
 * second advance, and a settled or cancelled arena ends the bounded operation. */
export async function playTournamentArena(
  id:string,source:View,read:()=>View,step:()=>Promise<void>,finish:boolean,
):Promise<boolean>{
  let view=read();
  if(source.blocked||!sameBoundArenaView(source,view)||view.world!==source.world)return false;
  const first=visibleArena(view.world,id,view.viewerId);
  if(!first||first.status!=='running')return false;
  for(let i=0;i<(finish?MAX_TOURNAMENT_MONTHS:1);i++){
    const from=view.world;
    const prior=visibleArena(from,id,view.viewerId);
    if(!sameBoundArenaView(source,view)||prior?.status!=='running')return false;
    await step();
    view=read();
    if(!sameBoundArenaView(source,view)||view.world.tick!==from.tick+1||!sameGeneratedWorld(from,view.world))return false;
    const arena=visibleArena(view.world,id,view.viewerId);
    if(!arena||arena.status==='running'&&arena.round<=prior.round)return false;
    if(!finish||arena.status==='completed'||arena.status==='cancelled')return true;
  }
  return false;
}

export function useTournamentArenaControls(simulation:Simulation,active:boolean,viewer:Cultivator|undefined):TournamentArenaControls|undefined{
  const latest=useRef({simulation,active,viewer});latest.current={simulation,active,viewer};
  const [advancing,setAdvancing]=useState(false);
  const pending=useRef(false);
  const read=():View=>{
    const {simulation:live,active:shown,viewer:here}=latest.current;
    return {world:live.authority.current,branch:live.history.current.activeBranchId,revision:live.saveContextVersion.current,
      viewerId:here?.id??'',blocked:!shown||!here||live.isRunning||live.browsing.current||live.stepInFlight.current||
      Boolean(live.fastForwardRun.current)||live.campaignGuard.current};
  };
  const display:View={world:simulation.world,branch:simulation.timeline.activeBranchId,revision:simulation.saveContextVersion.current,
    viewerId:viewer?.id??'',blocked:!active||!viewer||simulation.isRunning||simulation.isStepping||simulation.fastForwardLocked||Boolean(simulation.preview)};
  if(!active||!viewer||simulation.preview)return undefined;
  const advance=async(id:string,finish:boolean)=>{
    if(pending.current)return false;
    pending.current=true;setAdvancing(true);
    try{return await playTournamentArena(id,display,read,()=>latest.current.simulation.handleStepTick(),finish);}
    finally{pending.current=false;setAdvancing(false);}
  };
  return {busy:display.blocked||advancing,
    nextRound:id=>advance(id,false),finishTournament:id=>advance(id,true),
    getWager:id=>activeAvatar(display.world)?.id===display.viewerId&&visibleArena(display.world,id,display.viewerId)
      ?availableTournamentWager(display.world,id):undefined,
    getWagerReceipt:id=>activeAvatar(display.world)?.id===display.viewerId&&visibleArena(display.world,id,display.viewerId)
      ?projectTournamentWager(display.world,id):undefined,
    placeWager:request=>{
      const now=read();
      if(pending.current||display.blocked||now.world!==display.world||!sameBoundArenaView(display,now)||
        activeAvatar(now.world)?.id!==now.viewerId||!visibleArena(now.world,request.arenaId,now.viewerId))return false;
      return latest.current.simulation.updateWorld(current=>placeTournamentWager(current,request))!==now.world;
    },
  };
}
