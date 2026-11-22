import {describe,expect,it,vi} from 'vitest';
import {playAscensionChime} from '../src/components/ascensionChime';

describe('explicit optional ascension chime',()=>{
  it('does not allocate an audio context on import and plays one finite phrase on request',async()=>{
    const starts:number[]=[],stops:number[]=[],peaks:number[]=[],endings:Array<()=>void>=[];
    const closed=vi.fn();
    class FakeContext {
      state:'suspended'|'running'|'closed'='suspended';
      currentTime=5;
      destination={};
      async resume(){this.state='running';}
      async close(){this.state='closed';closed();}
      createGain(){
        return {gain:{
          setValueAtTime:(_value:number,_time:number)=>undefined,
          exponentialRampToValueAtTime:(value:number,_time:number)=>{peaks.push(value);},
        },connect:()=>undefined,disconnect:()=>undefined};
      }
      createOscillator(){
        return {
          frequency:{setValueAtTime:(_freq:number,_time:number)=>undefined},
          type:'sine',onended:undefined as (()=>void)|undefined,
          start:(time:number)=>{starts.push(time);},
          stop(time:number){stops.push(time);if(this.onended)endings.push(this.onended);},
          connect:()=>undefined,disconnect:()=>undefined,
        };
      }
    }
    expect(starts).toEqual([]);
    const context=FakeContext as unknown as typeof AudioContext;
    expect(await playAscensionChime(context)).toBe(true);
    expect(await playAscensionChime(context)).toBe(false);
    expect(starts).toHaveLength(7);expect(stops).toHaveLength(7);
    expect(Math.min(...starts)).toBeGreaterThan(5);
    expect(Math.max(...stops)-Math.min(...starts)).toBeLessThan(2);
    expect(Math.max(...peaks)).toBeLessThan(1);
    endings.at(-1)?.();await Promise.resolve();
    expect(closed).toHaveBeenCalledOnce();
  });
  it('plays nothing when the viewed actor or branch changes while the audio permission resolves',async()=>{
    let resume!:()=>void,live=true;
    const oscillator=vi.fn(),closed=vi.fn();
    class HeldContext {
      state:'suspended'|'running'|'closed'='suspended';
      resume(){return new Promise<void>(resolve=>{resume=()=>{this.state='running';resolve();};});}
      async close(){this.state='closed';closed();}
      createOscillator=oscillator;
    }
    const pending=playAscensionChime(HeldContext as unknown as typeof AudioContext,()=>live);
    live=false;resume();
    expect(await pending).toBe(false);
    expect(oscillator).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
  });
});
