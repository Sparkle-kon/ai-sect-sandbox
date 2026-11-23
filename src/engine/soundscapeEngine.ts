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
type Graph={audio:AudioContext;master:GainNode;music:GainNode;effects:GainNode;voices:Set<Voice>;noise?:AudioBuffer};

const masterLevel=.13, musicLevel=.44, effectsLevel=.68, floor=.0001;
const pitches=[261.626,293.665,329.628,391.995,440,523.251,587.330] as const;
const melody=[0,3,2,4,3,5,4,2,1,3,0,4,2,6,4,3] as const;
const pauses=[880,680,920,1280,760,1080,860,1450] as const;
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

function pluck(graph:Graph,at:number,f:number,level:number){
  tone(graph,graph.music,'triangle',at,.76,f*1.004,level,.008,f);
  tone(graph,graph.music,'sine',at,.40,f*2.006,level*.28,.006,f*2);
  tone(graph,graph.music,'sine',at,.19,f*3.011,level*.16,.005,f*3);
}

function flute(graph:Graph,at:number,f:number){
  tone(graph,graph.music,'sine',at,.69,f*.995,.075,.095,f*1.004,.22);
  tone(graph,graph.music,'sine',at,.57,f*2,.017,.11,f*2.008,.16);
  noise(graph,graph.music,at,.62,1640,1240,.035,'bandpass',.105);
}

function bell(graph:Graph,at:number){
  for(const [ratio,decay,level] of [[1,.80,.24],[1.51,.61,.075],[2.08,.41,.055],[2.96,.27,.031]] as const)
    tone(graph,graph.effects,'sine',at,decay,147*ratio,level,.012);
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
  let audio:AudioContext|undefined,graph:Graph|undefined,active=false,disposed=false,announced=false,epoch=0,beat=0;
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
          const at=target.audio.currentTime+.035,index=beat++;
          const f=pitches[melody[index%melody.length]];
          pluck(target,at,index%8===0?f/2:f,index%4===0?.185:.138);
          if(index%8===5)flute(target,at+.11,pitches[4]);
          queue(target,turn,pauses[index%pauses.length]);
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
        graph={audio:targetAudio,master,music,effects,voices:new Set()};
      }
      const at=targetAudio.currentTime;
      graph.master.gain.cancelScheduledValues(at);
      graph.master.gain.setValueAtTime(0,at);
      graph.master.gain.linearRampToValueAtTime(masterLevel,at+.055);
      active=true;
      if(!announced){bell(graph,at+.055);announced=true;}
      queue(graph,turn,380);
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
