const phrase=[
  [261.63,0,.40],[392,.13,.43],[523.25,.28,.43],[587.33,.43,.46],[659.25,.61,.53],
  [523.25,.82,.72],[392,1.04,.64],
] as const;
let active:AudioContext|undefined;

/** Optional short original phrase. Called only by an explicit, verified scene button. */
export async function playAscensionChime(Context:typeof AudioContext|undefined=globalThis.AudioContext,
  stillCurrent:()=>boolean=()=>true):Promise<boolean>{
  if(!stillCurrent()||typeof Context!=='function'||active&&active.state!=='closed')return false;
  let audio:AudioContext|undefined;
  try{
    audio=new Context();
    active=audio;
    if(audio.state==='suspended')await audio.resume();
    if(audio.state!=='running'||!stillCurrent())throw new Error('Audio scene no longer current');
    const start=audio.currentTime+.02;
    const output=audio.createGain();
    output.gain.setValueAtTime(.14,start);
    output.connect(audio.destination);
    for(const [index,[frequency,offset,duration]] of phrase.entries()){
      const oscillator=audio.createOscillator(),voice=audio.createGain(),at=start+offset;
      oscillator.type=index<3?'triangle':'sine';
      oscillator.frequency.setValueAtTime(frequency,at);
      voice.gain.setValueAtTime(.0001,at);
      voice.gain.exponentialRampToValueAtTime(.24,at+.028);
      voice.gain.exponentialRampToValueAtTime(.0001,at+duration);
      oscillator.connect(voice);voice.connect(output);
      oscillator.onended=()=>{
        oscillator.disconnect();voice.disconnect();
        if(index===phrase.length-1&&audio){
          const current=audio;
          output.disconnect();
          void current.close().catch(()=>undefined).finally(()=>{if(active===current)active=undefined;});
        }
      };
      oscillator.start(at);
      oscillator.stop(at+duration+.01);
    }
    return true;
  }catch{
    if(audio&&audio.state!=='closed')void audio.close().catch(()=>undefined);
    if(active===audio)active=undefined;
    return false;
  }
}
