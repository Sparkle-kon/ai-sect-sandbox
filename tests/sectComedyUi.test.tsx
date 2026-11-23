// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {associatedComicRow} from '../src/components/SectComicRead';
import {SectManagementHome} from '../src/components/SectManagementHome';
import {projectSectComicMoment} from '../src/engine/sectComedy';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {SectJobAssignment} from '../src/types/sectJobs';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'且留原处调息。'};
function fixture(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  const management=world?.sectManagement;
  if(!world||!management)throw Error('Expected managed seed');
  return {world,management};
}
function next(world:WorldState,board:readonly SectJobAssignment[]=[],roll=.99){
  const assigned=new Set(board.map(row=>row.discipleId));
  const orders=Object.fromEntries(world.cultivators.filter(row=>!assigned.has(row.id)).map(row=>[row.id,rest]));
  return advanceWorldTick(world,orders,()=>roll,'utility',undefined,{capturePresentation:false,sectJobAssignments:board});
}
async function find(target:()=>HTMLElement|null){
  for(let attempts=0;attempts<30;attempts++){
    const node=target();
    if(node)return node;
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  }
  throw Error('Missing projected current scene');
}
function mount(){
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const ctx=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host);
  return {host,render:(world:WorldState,withReport=true)=>act(async()=>root.render(
    <SectManagementHome world={world} onOpen={vi.fn()} onStart={vi.fn()} report={withReport?world.sectManagement?.latestReport:undefined}/>
  )),cleanup:async()=>{await act(async()=>root.unmount());host.remove();ctx.mockRestore();vi.unstubAllGlobals();}};
}

it('shows one narrative and one quote on the exact settled report, never on its neighboring row',async()=>{
  const {world,management}=fixture();
  const found=world.cultivators.find(actor=>actor.id===management.foundingDiscipleIds[0]);
  if(!found)throw Error('Expected a real founding disciple');
  found.quirks=['glutton','lost'];
  const arrived=next(world,[{discipleId:found.id,jobId:'gather'}],.62);
  const comic=projectSectComicMoment(arrived),report=arrived.sectManagement?.latestReport;
  if(!comic||!report)throw Error('Expected genuine current assigned result');
  const row=associatedComicRow(comic,report);
  if(!row)throw Error('Expected exact report association');
  const tampered={...report,rows:[{...row,sourceEventId:'wrong-evidence'}]};
  expect(associatedComicRow(comic,tampered)).toBeUndefined();
  const {host,render,cleanup}=mount();
  try{
    await render(arrived);
    const scene=await find(()=>host.querySelector('[data-sect-report]'));
    expect(scene.querySelector('[data-sect-comic-report]')?.textContent).toBe(comic.report);
    expect(scene.querySelector('blockquote')?.textContent).toContain(comic.quote);
    expect(scene.querySelector('[aria-label="所得与折损"]')?.textContent).not.toContain(comic.quote);
    expect(scene.querySelector('[aria-label="小插曲的得失"]')?.textContent).toContain('真气进度 +1 个百分点');
    expect(host.querySelector('[data-sect-comic-aside]')?.textContent??'').not.toContain(comic.report);
    expect(host.textContent).not.toContain(comic.templateId);
    const serialized=JSON.stringify(arrived);
    const skip=[...scene.querySelectorAll('button')].find(button=>button.textContent==='跳过汇报');
    if(!skip)throw Error('Missing existing skip control');
    await act(async()=>skip.click());
    expect(host.querySelector('[data-sect-report]')).toBeNull();
    expect(host.querySelector('[data-sect-comic-aside]')?.textContent??'').not.toContain(comic.report);
    expect(JSON.stringify(arrived)).toBe(serialized);
  }finally{await cleanup();}
});

it('shows only a collapsed current-month standalone moment under the managed home',async()=>{
  const {world}=fixture();
  const settled=next(world),comic=projectSectComicMoment(settled);
  if(!comic||comic.moment.source.phase!=='ambient')throw Error('Expected native ambient month');
  const {host,render,cleanup}=mount();
  try{
    await render(settled,false);
    const detail=host.querySelector<HTMLDetailsElement>('[data-sect-comic-aside]');
    if(!detail)throw Error('Expected the small current-month disclosure');
    expect(detail.open).toBe(false);
    expect(detail.firstElementChild?.textContent?.trim()).toBe('本月小插曲');
    expect(detail.querySelector('p')?.textContent).toBe(comic.report);
    expect(detail.querySelector('blockquote')?.textContent).toContain(comic.quote);
    expect(host.querySelector('[data-sect-report]')).toBeNull();
    expect(host.querySelectorAll('[data-sect-comic-aside]')).toHaveLength(1);
    const future={...settled,tick:settled.tick+1};
    await render(future,false);
    expect(host.querySelector('[data-sect-comic-aside]')).toBeNull();
  }finally{await cleanup();}
});
