import {useCallback,useEffect,useRef,useState} from 'react';
import {createSoundscapeEngine} from '../engine/soundscapeEngine';
import type {Cultivator,WorldState} from '../types/world';
import {projectSoundscapeCues} from './soundscapeCueModel';

export interface SoundscapeInput {
  world:WorldState;
  scopeKey:string;
  viewer?:Cultivator;
  siteId?:string;
  sourceId?:string;
  fog?:boolean;
  historical?:boolean;
}

export interface SoundscapeControl {
  enabled:boolean;
  pending:boolean;
  disabled:boolean;
  toggle:()=>void;
}

type Playback='off'|'pending'|'on';
const isHidden=()=>typeof document==='undefined'||document.hidden;
const sameScope=(a:SoundscapeInput,b:SoundscapeInput)=>
  a.scopeKey===b.scopeKey&&!!a.historical===!!b.historical&&a.viewer?.id===b.viewer?.id&&a.fog===b.fog;

/** Playback is ephemeral and cannot auto-enable after a reload, branch change, or tab hide. */
export function useSoundscape(input:SoundscapeInput):SoundscapeControl {
  const engine=useRef<ReturnType<typeof createSoundscapeEngine>>();
  const playback=useRef<Playback>('off'),generation=useRef(0);
  const observed=useRef(input),latest=useRef(input),requested=useRef<SoundscapeInput>();
  latest.current=input;
  const [phase,setPhase]=useState<Playback>('off');
  const stop=useCallback(()=>{
    generation.current++;
    engine.current?.disable();
    playback.current='off';
    requested.current=undefined;
    observed.current=latest.current;
    setPhase('off');
  },[]);

  useEffect(()=>{
    const onVisibility=()=>{if(isHidden())stop();};
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('pagehide',stop);
    return ()=>{
      document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('pagehide',stop);
      generation.current++;
      engine.current?.dispose();
      engine.current=undefined;
      playback.current='off';
      requested.current=undefined;
    };
  },[stop]);

  useEffect(()=>{
    const previous=observed.current;
    observed.current=input;
    if(!sameScope(previous,input)||input.historical){stop();return;}
    if(input.world.tick!==previous.world.tick&&input.world.tick!==previous.world.tick+1){stop();return;}
    if(playback.current!=='on'||isHidden()||input.world.tick===previous.world.tick)return;
    const cues=projectSoundscapeCues(input.world,{viewer:input.viewer,siteId:input.siteId,sourceId:input.sourceId,
      fog:input.fog,previousWorld:previous.world});
    for(const cue of cues)engine.current?.play(cue.kind,cue.wave);
  },[input,stop]);

  const toggle=()=>{
    const here=latest.current;
    if(playback.current!=='off'){stop();return;}
    if(here.historical||isHidden())return;
    const token=++generation.current;
    playback.current='pending';
    requested.current=here;
    observed.current=here;
    setPhase('pending');
    const runtime=engine.current??=createSoundscapeEngine();
    void runtime.enable().then(enabled=>{
      if(token!==generation.current)return;
      if(!enabled||!sameScope(here,latest.current)||isHidden()){stop();return;}
      observed.current=latest.current;
      playback.current='on';
      setPhase('on');
    }).catch(()=>{if(token===generation.current)stop();});
  };

  const current=requested.current!==undefined&&sameScope(requested.current,input);
  return {enabled:current&&phase==='on',pending:current&&phase==='pending',disabled:!!input.historical,toggle};
}

export function SoundscapeToggle({sound}:{sound:SoundscapeControl}){
  const label=sound.pending?'取消启用仙乐':sound.enabled?'静音仙乐':'启用仙乐';
  return <button type="button" onClick={sound.toggle} disabled={sound.disabled} aria-label={label}
    aria-pressed={sound.enabled} aria-busy={sound.pending||undefined}
    className={`min-h-11 min-w-11 shrink-0 rounded-lg border px-2.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-50 ${sound.enabled?'border-amber-300/60 bg-amber-950/60 text-amber-100':'border-slate-700 bg-slate-900/85 text-slate-200'}`}>
    {sound.pending?'启用中':sound.enabled?'静音':'仙乐'}
  </button>;
}
