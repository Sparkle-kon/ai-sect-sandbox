import {useRef} from 'react';
import {DEFAULT_PLAYABLE_STORYTELLER,type useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {configureStoryteller} from '../engine/storytellerDirector';
import {highDramaPreset} from '../engine/highDramaPresetTerms';
import type {BuiltinScenarioPresetId,WorldState} from '../types/world';

type Simulation=ReturnType<typeof useWorldSimulationController>;
interface Frame {world:WorldState;history:object;revision:number;blocked:boolean}

export function canCommitHighDramaOpening(expected:Frame,actual:Frame,signal?:AbortSignal):boolean{
  return !signal?.aborted&&!expected.blocked&&!actual.blocked&&expected.world===actual.world&&expected.history===actual.history&&expected.revision===actual.revision;
}

function openingFrame(sim:Simulation,fromDisplay=false):Frame{
  return {world:fromDisplay?sim.world:sim.authority.current,history:fromDisplay?sim.timeline:sim.history.current,
    revision:sim.saveContextVersion.current,blocked:sim.isRunning||sim.fastForwardLocked||sim.stepInFlight.current||
    sim.browsing.current||Boolean(sim.fastForwardRun.current)||sim.campaignGuard.current};
}

export function useHighDramaOpening(simulation:Simulation,onFocus:(id:string)=>void){
  const latest=useRef(simulation);
  latest.current=simulation;
  const expected=openingFrame(simulation,true);
  const preset=highDramaPreset(simulation.visibleWorld.builtinScenarioOrigin?.id);
  const opening=preset?{title:preset.title,intent:simulation.visibleWorld.tick===preset.openedTick?preset.intent:undefined}:undefined;
  const pending=useRef(false);
  const start=async(id:BuiltinScenarioPresetId,signal?:AbortSignal):Promise<boolean>=>{
    const current=()=>canCommitHighDramaOpening(expected,openingFrame(latest.current),signal);
    if(pending.current||!highDramaPreset(id)||!current())return false;
    pending.current=true;
    try{
      const {buildHighDramaPreset}=await import('../engine/highDramaPresetEngine');
      if(!current())return false;
      const prepared=buildHighDramaPreset(id);
      if(!prepared||!current()||!configureStoryteller(prepared.world,DEFAULT_PLAYABLE_STORYTELLER,prepared.focusActorId)||
        !latest.current.replaceWorld(prepared.world,expected.world,expected.revision))return false;
      if(prepared.focusActorId)onFocus(prepared.focusActorId);
      return true;
    }catch{return false;}
    finally{pending.current=false;}
  };
  return {opening,start,disabled:expected.blocked};
}
