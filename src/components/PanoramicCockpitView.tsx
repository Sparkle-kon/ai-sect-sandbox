import type {SceneStageFrame} from './sceneStageModel';
import {highDramaPreset} from '../engine/highDramaPresetTerms';
import type {PublicBondArc} from './DramaticBondRead';
import type {ReactNode,Ref} from 'react';
import {Compass,Map as MapIcon} from 'lucide-react';
import {useViewportAtLeast} from './useViewportAtLeast';
import type {Cultivator,WorldState} from '../types/world';
import {CockpitStoryStage} from './CockpitStoryStage';
import {CockpitTimeControls,type CockpitTimeControlsProps} from './CockpitTimeControls';
import {PanoramicCockpit,type PanoramicCockpitProps} from './PanoramicCockpit';

const DESKTOP_WORKSPACE_WIDTH=1024;
const focus='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300';

export function CockpitModeSwitch({active,disabled,onSwitch}:{
  active:boolean;disabled?:boolean;onSwitch:()=>void;
}){
  const wide=useViewportAtLeast(DESKTOP_WORKSPACE_WIDTH);
  if(!wide&&!active)return null;
  return <button type="button" disabled={disabled} onClick={onSwitch}
    className={`xianxia-control inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-amber-200/35 bg-gradient-to-br from-amber-950/45 to-slate-950 px-3 text-sm font-semibold text-amber-100 hover:border-amber-200/80 hover:text-amber-50 disabled:opacity-50 ${focus}`}>
    {!active&&<Compass size={16} aria-hidden="true" className="shrink-0 text-amber-300"/>}
    {active?'故事书卷':'全息大盘'}
  </button>;
}

export function DesktopSandboxEntrance({onOpen,disabled}:{
  onOpen:()=>void;disabled?:boolean;
}){
  const wide=useViewportAtLeast(DESKTOP_WORKSPACE_WIDTH);
  if(!wide)return null;
  return <button type="button" disabled={disabled} onClick={onOpen}
    className={`xianxia-control inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-teal-200/40 bg-gradient-to-br from-teal-900/65 to-slate-950 px-3 text-sm font-semibold text-teal-100 hover:border-teal-200/80 hover:text-teal-50 disabled:opacity-50 ${focus}`}>
    <MapIcon size={16} aria-hidden="true" className="shrink-0 text-teal-200"/>
    进入沙盒
  </button>;
}

interface PanoramicCockpitViewProps extends Omit<PanoramicCockpitProps,'timeControls'|'stage'> {
  world:WorldState;
  stageViewer?:Cultivator;
  titleRef:Ref<HTMLHeadingElement>;
  time:Omit<CockpitTimeControlsProps,'date'>;
  exit:ReactNode;
  statusStrip?:ReactNode;
  stageOverride?:ReactNode;
  stageAfterOverride?:ReactNode;
  subplot?:PublicBondArc;
  branchScene?:ReactNode;
  highlightStage?:SceneStageFrame;
}

export function PanoramicCockpitView({world,stageViewer,titleRef,time,exit,statusStrip,stageOverride,stageAfterOverride,subplot,branchScene,highlightStage,...slots}:PanoramicCockpitViewProps){
  const opening=highDramaPreset(world.builtinScenarioOrigin?.id);
  return <main data-panoramic-cockpit data-cockpit-tick={world.tick}
    className="xianxia-shell min-h-dvh bg-slate-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
    <header className="xianxia-header mx-auto flex max-w-[192rem] items-center justify-between gap-3 px-4 py-2 text-amber-100">
      <div className="min-w-0">
        <h1 ref={titleRef} tabIndex={-1} className="font-serif text-lg font-semibold tracking-widest">天道沙盒</h1>
        {opening&&<p className="break-words text-xs text-amber-100/80">{opening.title}</p>}
      </div>
      {exit}
    </header>
    {statusStrip&&<div className="mx-auto mb-2 w-full max-w-[192rem] px-2.5 sm:px-4">{statusStrip}</div>}
    <PanoramicCockpit {...slots} stage={stageOverride?<>{stageOverride}{stageAfterOverride}</>:<CockpitStoryStage world={world} viewer={stageViewer} historical={time.historical} subplot={subplot} branchScene={branchScene} highlightStage={highlightStage}/>}
      timeControls={<CockpitTimeControls {...time} date={world}/>}/>
  </main>;
}
