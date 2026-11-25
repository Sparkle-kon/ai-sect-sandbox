// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {simulateH6Rotation} from '../scripts/h6Rotation';
import {SectManagementHome} from '../src/components/SectManagementHome';
import {projectSectComedyContinuations} from '../src/engine/sectComedyContinuations';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {SectJobAssignment} from '../src/types/sectJobs';
import type {WorldState} from '../src/types/world';

it('shows the same arrived guest once before and after returning to morning; only carry-over advances the clock',async()=>{
  let actual:WorldState|undefined;
  simulateH6Rotation(13071,'qingyun-odd-jobs',0,false,world=>{
    if(!actual&&world.sectManagement?.comedy?.pending?.some(row=>row.kind==='visit'&&row.arrival?.tick===world.tick))
      actual=structuredClone(world);
  });
  if(!actual)throw Error('Expected a natural full-rotation visit');
  let world:WorldState=actual;
  const firstTick=world.tick,first=projectSectComedyContinuations(world)[0];
  if(!first)throw Error('Expected a current visitor card for the actual fixture');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host);
  const confirm=vi.fn(async(expected:WorldState,assignments:readonly SectJobAssignment[])=>{
    if(expected!==world)return false;
    const head=world.sectManagement!.leaderId;
    world=advanceWorldTick(world,{[head]:{chosenAction:'REST',innerMonologue:'在山门听回话。'}},undefined,'utility',undefined,{
      sectJobAssignments:assignments,capturePresentation:false,captureTrace:false,
    });
    render();
    return true;
  });
  const render=()=>root.render(<SectManagementHome world={world} onStart={()=>false} onOpen={()=>{}}
    onConfirmJobs={confirm} report={world.sectManagement?.latestReport}/>);
  const until=async<T,>(read:()=>T|undefined|null):Promise<T>=>{
    for(let i=0;i<50;i++){
      const current=read();if(current)return current;
      await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});
    }
    throw Error('The expected playable view did not finish loading');
  };
  const panel=()=>host.querySelector('section[aria-label="登门旧事"]');
  const button=(text:string)=>Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(row=>row.textContent===text);
  try{
    await act(async()=>render());
    const before=await until(()=>host.querySelector('[data-sect-report]'));
    expect(before.contains(panel())).toBe(true);
    expect(panel()?.textContent).toContain(first.line);
    await act(async()=>button('知道了，回晨会')!.click());
    await until(()=>host.querySelector('[data-sect-morning]'));
    expect(host.querySelectorAll('section[aria-label="登门旧事"]')).toHaveLength(1);
    expect(panel()?.textContent).toContain(first.line);
    expect(world.tick).toBe(firstTick);
    expect(confirm).not.toHaveBeenCalled();
    const carry=await until(()=>button('沿用上月差事并过月'));
    await act(async()=>carry.click());
    await until(()=>host.querySelector('[data-sect-report]'));
    expect(confirm).toHaveBeenCalledOnce();
    expect(world.tick).toBe(firstTick+1);
    expect(host.textContent).not.toContain(first.line);
  }finally{
    await act(async()=>root.unmount());host.remove();context.mockRestore();vi.unstubAllGlobals();
  }
});
