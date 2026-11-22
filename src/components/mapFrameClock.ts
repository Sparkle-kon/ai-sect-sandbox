export interface MapFrameDriver {
  request(callback:(time:number)=>void):number;
  cancel(handle:number):void;
  now():number;
}
export type MapFrameChannel = 'camera' | 'scene';
type Listener = (now:number)=>boolean;
interface Registration { listener:Listener }
interface Pending { handle?:number }
const order = ['camera','scene'] as const;

/** One frame source per view, shared by camera and scene. The driver uses RAF's asynchronous contract. */
export function createMapFrameClock(driver:MapFrameDriver) {
  const listeners:Partial<Record<MapFrameChannel,Registration>>={};
  let pending:Pending|undefined, dispatchTime:number|undefined, lastTime=0, disposed=false;

  const stamp=(time:number)=>{
    if(Number.isFinite(time))lastTime=Math.max(lastTime,time);
    return lastTime;
  };
  const now=()=>dispatchTime??stamp(driver.now());
  const cancel=()=>{
    const frame=pending;
    pending=undefined;
    if(frame?.handle!==undefined)driver.cancel(frame.handle);
  };

  function adjust(){
    if(disposed||(!listeners.camera&&!listeners.scene)){
      cancel();
      return;
    }
    if(pending||dispatchTime!==undefined)return;
    const token:Pending={};
    pending=token;
    try {
      token.handle=driver.request(time=>fire(token,time));
    } catch(error) {
      if(pending===token)pending=undefined;
      throw error;
    }
  }

  function fire(token:Pending,time:number){
    if(disposed||pending!==token)return;
    pending=undefined;
    const captured=[listeners.camera,listeners.scene];
    const at=stamp(Number.isFinite(time)?time:driver.now());
    dispatchTime=at;
    let failed=false, issue:unknown;
    try {
      for(let index=0;index<order.length;index++){
        const channel=order[index],entry=captured[index];
        // A concurrent replacement during a listener takes effect on the next frame, never as borrowed work.
        if(disposed||!entry||listeners[channel]!==entry)continue;
        let again=false;
        try { again=entry.listener(at); }
        catch(error) {if(!failed){failed=true;issue=error;}}
        if(!again&&listeners[channel]===entry)delete listeners[channel];
      }
    } finally {
      dispatchTime=undefined;
      adjust();
    }
    if(failed)throw issue;
  }

  function start(channel:MapFrameChannel,listener:Listener):()=>void {
    if(disposed)return ()=>undefined;
    const entry={listener};
    listeners[channel]=entry;
    adjust();
    return ()=>{
      if(listeners[channel]!==entry)return;
      delete listeners[channel];
      adjust();
    };
  }
  function stop(channel:MapFrameChannel){
    delete listeners[channel];
    adjust();
  }
  function dispose(){
    disposed=true;
    delete listeners.camera;
    delete listeners.scene;
    cancel();
  }
  return {now,start,stop,dispose,active:(channel:MapFrameChannel)=>listeners[channel]!==undefined};
}
