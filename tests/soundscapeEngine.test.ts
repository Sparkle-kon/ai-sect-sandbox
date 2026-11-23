import {describe,expect,it,vi} from 'vitest';
import {createSoundscapeEngine} from '../src/engine/soundscapeEngine';

function rig(mode:'ready'|'held'|'denied'='ready'){
  let endResume:()=>void=()=>{};
  const timers=new Map<number,()=>void>(),exceptions:string[]=[];
  let next=0;
  const rate=8000;
  const parameter=()=>({
    setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn(),
    cancelScheduledValues:vi.fn(),
  });
  const node=()=>({connect:vi.fn(),disconnect:vi.fn()});
  const gain=()=>({...node(),gain:parameter()});
  const source=()=>({
    ...node(),type:'sine' as OscillatorType,frequency:parameter(),start:vi.fn(),stop:vi.fn(),
    onended:null as null|(()=>void),
  });
  const gains:ReturnType<typeof gain>[]=[],sources:ReturnType<typeof source>[]=[],noise:Float32Array[]=[];
  const context={
    state:'suspended' as AudioContextState,currentTime:5,destination:node(),sampleRate:rate,
    resume:vi.fn(()=>{
      if(mode==='denied')return Promise.reject(Error('gesture not permitted'));
      if(mode==='held')return new Promise<void>(resolve=>{endResume=()=>{context.state='running';resolve();};});
      context.state='running';
      return Promise.resolve();
    }),
    close:vi.fn(async()=>{context.state='closed';}),
    createGain:vi.fn(()=>{const entry=gain();gains.push(entry);return entry;}),
    createOscillator:vi.fn(()=>{const entry=source();sources.push(entry);return entry;}),
    createBiquadFilter:vi.fn(()=>({...node(),type:'bandpass' as BiquadFilterType,Q:parameter(),frequency:parameter()})),
    createBufferSource:vi.fn(()=>{const entry={...source(),buffer:null as AudioBuffer|null};sources.push(entry);return entry;}),
    createBuffer:vi.fn((channels:number,samples:number,sampleRate:number)=>{
      if(channels!==1||sampleRate!==rate||samples>rate)exceptions.push('oversized buffer');
      const contents=new Float32Array(samples);noise.push(contents);
      return {getChannelData:()=>contents};
    }),
  };
  const make=vi.fn(()=>context as unknown as AudioContext);
  const setTimer=vi.fn((fn:()=>void,delay:number)=>{
    if(!Number.isFinite(delay)||delay<=0||delay>2000)exceptions.push('unbounded timer');
    timers.set(++next,fn);
    return next;
  });
  const clearTimer=vi.fn((id:unknown)=>{if(typeof id==='number')timers.delete(id);});
  const engine=createSoundscapeEngine({createContext:make,setTimer,clearTimer});
  const beat=()=>{
    const queued=timers.entries().next().value;
    if(!queued)throw Error('missing beat');
    const [id,run]=queued;
    timers.delete(id);
    context.currentTime+=1;
    run();
    // In a real context expired sources call onended naturally before later beats.
    for(const voice of sources){
      const end=voice.stop.mock.calls[0]?.[0];
      if(typeof end==='number'&&end<context.currentTime)voice.onended?.();
    }
    return run;
  };
  return {context,engine,gains,sources,timers,make,endResume:()=>endResume(),setTimer,clearTimer,beat,noise,exceptions};
}

describe('gesture-only procedural soundscape graph',()=>{
  it('allocates lazily, caps gain/duration, schedules one guqin pulse and catches stale ticks after mute',async()=>{
    const r=rig(),{engine,context,sources,gains}=r;
    expect(engine.play('thunder',2)).toBe(false);
    expect(r.make).not.toHaveBeenCalled();
    expect(r.setTimer).not.toHaveBeenCalled();
    const active=engine.enable();
    expect(r.make).toHaveBeenCalledOnce(); // Context construction precedes the first await in the real gesture.
    expect(await active).toBe(true);
    expect(sources).toHaveLength(4);
    expect(r.timers.size).toBe(1);
    expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(expect.any(Number),expect.any(Number));
    expect(gains[0].gain.linearRampToValueAtTime.mock.calls[0][0]).toBeLessThanOrEqual(.15);
    expect(gains[1].connect).toHaveBeenCalledWith(gains[0]);
    expect(gains[2].connect).toHaveBeenCalledWith(gains[0]);
    const stale=r.beat();
    expect(sources).toHaveLength(7);
    expect(r.timers.size).toBe(1);
    expect(engine.play('flight')).toBe(true);
    expect(context.createBiquadFilter).toHaveBeenCalledOnce();
    for(const voice of sources){
      const start=voice.start.mock.calls[0][0],stop=voice.stop.mock.calls[0][0];
      expect(stop).toBeGreaterThan(start);
      expect(stop-start).toBeLessThan(1);
    }
    engine.disable();
    expect(r.timers.size).toBe(0);
    expect(gains[0].gain.setValueAtTime).toHaveBeenLastCalledWith(0,context.currentTime);
    expect(sources.every(voice=>voice.disconnect.mock.calls.length>0)).toBe(true);
    const before=sources.length;
    stale();
    expect(sources).toHaveLength(before);
    expect(engine.play('clash')).toBe(false);
    expect(await engine.enable()).toBe(true);
    expect(r.make).toHaveBeenCalledOnce();
    expect(sources).toHaveLength(before); // The welcoming bell doesn't replay on unmute.
    engine.dispose();
    engine.dispose();
    expect(context.close).toHaveBeenCalledOnce();
    expect(r.timers.size).toBe(0);
    expect(r.exceptions).toEqual([]);
  });

  it('does not allocate voices when a held browser resume settles after the scope goes quiet',async()=>{
    const r=rig('held');
    const pending=r.engine.enable();
    r.engine.disable();
    r.endResume();
    expect(await pending).toBe(false);
    expect(r.context.createGain).not.toHaveBeenCalled();
    expect(r.sources).toEqual([]);
    expect(r.timers.size).toBe(0);
    expect(r.engine.play('flight')).toBe(false);
    r.engine.dispose();
    expect(r.context.close).toHaveBeenCalledOnce();
  });

  it('fails quiet if audio is denied, and synthesizes the same bounded sample/effect wave shape twice',async()=>{
    const denied=rig('denied');
    expect(await denied.engine.enable()).toBe(false);
    expect(denied.timers.size).toBe(0);
    expect(denied.sources).toEqual([]);
    denied.engine.dispose();
    const render=async()=>{
      const r=rig();
      expect(await r.engine.enable()).toBe(true);
      for(let i=0;i<6;i++)r.beat(); // Exercises both plucked harmonics and the intermittent breath motif.
      for(const kind of ['flight','clash','alchemy','thunder'] as const){
        r.context.currentTime+=1;
        const n=r.sources.length;
        expect(r.engine.play(kind,3)).toBe(true);
        expect(r.sources.length).toBeGreaterThan(n);
        for(const voice of r.sources)voice.onended?.();
      }
      expect(r.noise).toHaveLength(1);
      expect(r.noise[0].length).toBeLessThanOrEqual(r.context.sampleRate);
      const signature=r.sources.map(voice=>({frequency:voice.frequency.setValueAtTime.mock.calls,
        start:voice.start.mock.calls,stop:voice.stop.mock.calls}));
      r.engine.dispose();
      expect(r.exceptions).toEqual([]);
      return {signature,samples:[...r.noise[0].slice(0,16)]};
    };
    expect(await render()).toEqual(await render());
  });
});
