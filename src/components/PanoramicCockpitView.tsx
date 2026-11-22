import type {PublicBondArc} from './DramaticBondRead';
import {useSyncExternalStore,type ReactNode,type Ref} from 'react';
import type {WorldState} from '../types/world';
import {CockpitStoryStage} from './CockpitStoryStage';
import {CockpitTimeControls,type CockpitTimeControlsProps} from './CockpitTimeControls';
import {PanoramicCockpit,type PanoramicCockpitProps} from './PanoramicCockpit';

const wideScreen='(min-width: 1280px)';
const media=()=>typeof window==='undefined'?undefined:window.matchMedia?.(wideScreen);
const readWidth=()=>media()?.matches??false;
const readServerWidth=()=>false;
function subscribeWidth(onChange:()=>void){
  const query=media();
  query?.addEventListener?.('change',onChange);
  return ()=>query?.removeEventListener?.('change',onChange);
}

export function CockpitModeSwitch({active,disabled,onSwitch}:{
  active:boolean;disabled?:boolean;onSwitch:()=>void;
}){
  const wide=useSyncExternalStore(subscribeWidth,readWidth,readServerWidth);
  if(!wide&&!active)return null;
  return <button type="button" disabled={disabled} onClick={onSwitch}
    className="inline-flex min-h-11 items-center rounded-md border border-amber-200/30 bg-slate-900 px-3 text-sm font-semibold text-amber-100 hover:border-amber-200/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-50">
    {active?'故事书卷':'全息大盘'}
  </button>;
}

interface PanoramicCockpitViewProps extends Omit<PanoramicCockpitProps,'timeControls'|'stage'> {
  world:WorldState;
  titleRef:Ref<HTMLHeadingElement>;
  time:Omit<CockpitTimeControlsProps,'date'>;
  exit:ReactNode;
  statusStrip?:ReactNode;
  stageOverride?:ReactNode;
  subplot?:PublicBondArc;
}

export function PanoramicCockpitView({world,titleRef,time,exit,statusStrip,stageOverride,subplot,...slots}:PanoramicCockpitViewProps){
  return <main data-panoramic-cockpit data-cockpit-tick={world.tick}
    className="min-h-dvh bg-slate-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
    <header className="mx-auto flex max-w-[192rem] items-center justify-between gap-3 px-4 py-2 text-amber-100">
      <h1 ref={titleRef} tabIndex={-1} className="font-serif text-lg font-semibold tracking-widest">天道沙盒</h1>
      {exit}
    </header>
    {statusStrip&&<div className="mx-auto mb-2 w-full max-w-[192rem] px-2.5 sm:px-4">{statusStrip}</div>}
    <PanoramicCockpit {...slots} stage={stageOverride??<CockpitStoryStage world={world} subplot={subplot}/>}
      timeControls={<CockpitTimeControls {...time} date={world}/>}/>
  </main>;
}
