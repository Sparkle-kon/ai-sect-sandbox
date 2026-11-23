import { GUQIN_PHRASES, renderGuqinNote } from './guqinSoundscape';

export type SoundscapeCueKind='flight'|'clash'|'alchemy'|'thunder';

export interface SoundscapeEngineOptions {
  createContext?:()=>AudioContext;
  setTimer?:(callback:()=>void,delay:number)=>unknown;
  clearTimer?:(id:unknown)=>void;
}

export interface SoundscapeEngine {
  enable:()=>Promise<boolean>;
  disable:()=>void;
  dispose:()=>void;
  play:(kind:SoundscapeCueKind,wave?:number)=>boolean;
}

type Voice={source:AudioScheduledSourceNode;nodes:AudioNode[]};
type GuqinSample={buffer:AudioBuffer;duration:number};
type Graph={audio:AudioContext;master:GainNode;music:GainNode;effects:GainNode;voices:Set<Voice>;
  plucks:Map<number,GuqinSample>;noise?:AudioBuffer};

const masterLevel=.13, musicLevel=.54, effectsLevel=.64, floor=.0001;
const musicSampleRate=24000;
const quiet=(work:()=>void)=>{try{work();}catch{/* Already ended or the device disconnected. */}};
const hz=(frequency:number)=>Math.max(20,Math.min(12000,frequency));
const nonzero=(gain:number)=>Math.max(floor,Math.min(.6,gain));

function findContext(){
  const fallback=(globalThis as typeof globalThis&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
  const Context=globalThis.AudioContext??fallback;
  if(typeof Context!=='function')throw new Error('Web Audio is unavailable');
  return new Context();
}

function disconnect(voice:Voice){
  voice.source.onended=null;
  for(const node of voice.nodes)quiet(()=>node.disconnect());
}

function start(graph:Graph,source:AudioScheduledSourceNode,nodes:AudioNode[],at:number,end:number){
  const voice:Voice={source,nodes:[source,...nodes]};
  graph.voices.add(voice);
  source.onended=()=>{graph.voices.delete(voice);disconnect(voice);};
  try{source.start(at);source.stop(end+.015);}catch(error){
    graph.voices.delete(voice);
    quiet(()=>source.stop());
    disconnect(voice);
    throw error;
  }
}

function envelope(gain:AudioParam,at:number,end:number,attack:number,level:number,hold=0){
  gain.setValueAtTime(floor,at);
  gain.exponentialRampToValueAtTime(nonzero(level),at+attack);
  if(hold>0)gain.exponentialRampToValueAtTime(nonzero(level*.72),at+attack+hold);
  gain.exponentialRampToValueAtTime(floor,end);
}

function tone(graph:Graph,bus:GainNode,type:OscillatorType,at:number,duration:number,frequency:number,
  level:number,attack=.014,to=frequency,hold=0){
  const audio=graph.audio,source=audio.createOscillator(),amp=audio.createGain();
  source.type=type;
  source.frequency.setValueAtTime(hz(frequency),at);
  if(frequency!==to)source.frequency.exponentialRampToValueAtTime(hz(to),at+duration*.84);
  envelope(amp.gain,at,at+duration,attack,level,hold);
  source.connect(amp);amp.connect(bus);
  start(graph,source,[amp],at,at+duration);
}

function noiseBuffer(graph:Graph){
  if(graph.noise)return graph.noise;
  const rate=graph.audio.sampleRate,length=Math.ceil(rate*.95);
  const buffer=graph.audio.createBuffer(1,length,rate),data=buffer.getChannelData(0);
  let seed=0x7f4a7c15;
  for(let i=0;i<data.length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    data[i]=(seed/2147483648)-1;
  }
  graph.noise=buffer;
  return buffer;
}

function noise(graph:Graph,bus:GainNode,at:number,duration:number,frequency:number,to:number,
  level:number,type:BiquadFilterType='bandpass',attack=.025){
  const audio=graph.audio,source=audio.createBufferSource(),filter=audio.createBiquadFilter(),amp=audio.createGain();
  source.buffer=noiseBuffer(graph);
  filter.type=type;
  filter.Q.setValueAtTime(type==='bandpass'?.78:.6,at);
  filter.frequency.setValueAtTime(hz(frequency),at);
  filter.frequency.exponentialRampToValueAtTime(hz(to),at+duration*.85);
  envelope(amp.gain,at,at+duration,attack,level);
  source.connect(filter);filter.connect(amp);amp.connect(bus);
  start(graph,source,[filter,amp],at,at+duration);
}

function pluck(graph:Graph,at:number,midi:number,velocity:number){
  if(graph.voices.size>=20)return;
  const audio=graph.audio;
  let sample=graph.plucks.get(midi);
  if(!sample){
    const rate=Math.min(audio.sampleRate,musicSampleRate);
    const pcm=renderGuqinNote(midi,rate);
    const buffer=audio.createBuffer(1,pcm.length,rate);
    buffer.getChannelData(0).set(pcm);
    sample={buffer,duration:pcm.length/rate};
    graph.plucks.set(midi,sample);
  }
  const source=audio.createBufferSource(),amp=audio.createGain();
  source.buffer=sample.buffer;
  // The instrument already carries its own transient and decay. Do not gate its ring with a second envelope.
  amp.gain.setValueAtTime(nonzero(velocity*.78),at);
  source.connect(amp);amp.connect(graph.music);
  start(graph,source,[amp],at,at+sample.duration);
}

function cue(graph:Graph,kind:SoundscapeCueKind,at:number,wave?:number){
  const bus=graph.effects;
  switch(kind){
    case 'flight':
      noise(graph,bus,at,.40,840,3700,.17,'bandpass',.055);
      tone(graph,bus,'triangle',at+.025,.34,530,.045,.07,158);
      break;
    case 'clash':
      noise(graph,bus,at,.19,4100,1900,.16,'bandpass',.008);
      for(const [f,d,l] of [[1090,.21,.105],[1522,.17,.071],[2214,.11,.050],[3490,.09,.035]] as const)
        tone(graph,bus,'sine',at,d,f,l,.004,f*.96);
      break;
    case 'alchemy':
      for(const [i,f] of [523.251,659.255,783.991,1046.502].entries()){
        tone(graph,bus,'sine',at+i*.048,.43,f,.105,.017);
        tone(graph,bus,'sine',at+i*.048,.21,f*2.02,.043,.010);
      }
      break;
    case 'thunder': {
      const index=Number.isFinite(wave)?Math.max(1,Math.min(9,Math.floor(wave??1))):1;
      noise(graph,bus,at,.83,790+index*39,78,.21,'lowpass',.026);
      tone(graph,bus,'triangle',at+.015,.61,77+index*2,.16,.036,39);
      noise(graph,bus,at+.097,.59,265,56,.09,'lowpass',.044);
      break;
    }
  }
}

/**
 * Constructing this controller is silent; only call enable from the sound-control gesture.
 * Keeping the context between toggles avoids a late resume/suspend race. Muting instantly
 * disconnects all pending voices, and dispose closes the one owned context.
 */
export function createSoundscapeEngine(options:SoundscapeEngineOptions={}):SoundscapeEngine{
  const make=options.createContext??findContext;
  const setTimer=options.setTimer??((callback,delay)=>globalThis.setTimeout(callback,delay));
  const clearTimer=options.clearTimer??(token=>globalThis.clearTimeout(token as ReturnType<typeof setTimeout>));
  let audio:AudioContext|undefined,graph:Graph|undefined,active=false,disposed=false,epoch=0,beat=0;
  let pending:{token:unknown}|undefined;
  let lastEffect=-Infinity;

  function disable(){
    epoch++;active=false;lastEffect=-Infinity;
    if(pending){const {token}=pending;pending=undefined;quiet(()=>clearTimer(token));}
    if(graph){
      const {master,voices,audio}=graph;
      quiet(()=>master.gain.cancelScheduledValues(audio.currentTime));
      quiet(()=>master.gain.setValueAtTime(0,audio.currentTime));
      for(const voice of voices){
        quiet(()=>voice.source.stop(audio.currentTime));
        disconnect(voice);
      }
      voices.clear();
    }
  }

  function dispose(){
    if(disposed)return;
    disable();disposed=true;
    if(graph)for(const node of [graph.music,graph.effects,graph.master])quiet(()=>node.disconnect());
    graph=undefined;
    const owned=audio;audio=undefined;
    if(owned&&owned.state!=='closed')quiet(()=>{void owned.close().catch(()=>undefined);});
  }

  function queue(target:Graph,turn:number,delay:number){
    const ticket={token:undefined as unknown};
    pending=ticket;
    try{
      ticket.token=setTimer(()=>{
        if(pending!==ticket||epoch!==turn||!active)return;
        pending=undefined;
        if(target.audio.state!=='running'){disable();return;}
        try{
          const at=target.audio.currentTime+.075,event=GUQIN_PHRASES[beat];
          for(const note of event.notes)pluck(target,at+(note.offsetMs??0)/1000,note.midi,note.velocity);
          beat=(beat+1)%GUQIN_PHRASES.length;
          queue(target,turn,event.delayMs);
        }catch{disable();}
      },delay);
    }catch(error){if(pending===ticket)pending=undefined;throw error;}
  }

  async function enable():Promise<boolean>{
    if(disposed)return false;
    if(active&&audio?.state==='running')return true;
    const turn=++epoch;
    try{
      if(!audio||audio.state==='closed'){
        graph=undefined;
        audio=make();
      }
      const targetAudio=audio;
      if(targetAudio.state!=='running')await targetAudio.resume();
      if(turn!==epoch||disposed||audio!==targetAudio)return false;
      if(targetAudio.state!=='running'){disable();return false;}
      if(!graph){
        const master=targetAudio.createGain(),music=targetAudio.createGain(),effects=targetAudio.createGain(),
          at=targetAudio.currentTime;
        master.gain.setValueAtTime(0,at);
        music.gain.setValueAtTime(musicLevel,at);
        effects.gain.setValueAtTime(effectsLevel,at);
        music.connect(master);effects.connect(master);master.connect(targetAudio.destination);
        graph={audio:targetAudio,master,music,effects,voices:new Set(),plucks:new Map()};
      }
      const at=targetAudio.currentTime;
      graph.master.gain.cancelScheduledValues(at);
      graph.master.gain.setValueAtTime(0,at);
      graph.master.gain.linearRampToValueAtTime(masterLevel,at+.055);
      active=true;
      queue(graph,turn,520);
      return true;
    }catch{
      if(turn===epoch){disable();}
      return false;
    }
  }

  function play(kind:SoundscapeCueKind,wave?:number):boolean{
    if(!active||disposed||!graph||graph.audio.state!=='running'||graph.voices.size>24)return false;
    const now=graph.audio.currentTime;
    // Permit the bounded simultaneous cues from one commit; don't stack old motifs during a rapid tick burst.
    if(now-lastEffect>.24||now===lastEffect){
      try{cue(graph,kind,now+.02,wave);lastEffect=now;return true;}catch{disable();return false;}
    }
    return false;
  }

  return {enable,disable,dispose,play};
}
