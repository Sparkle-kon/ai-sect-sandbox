// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {SectManagementHome} from '../src/components/SectManagementHome';
import {associatedPairDramaRow} from '../src/components/SectPairDramaRead';
import {projectSectPairDrama} from '../src/engine/sectPairDrama';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {SectJobAssignment} from '../src/types/sectJobs';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'且留原处调息。'};
function fixture(kind:'rivalry'|'blame'|'crush'='rivalry'){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  const management=world?.sectManagement;
  if(!world||!management)throw Error('Expected managed sect');
  const actors=management.foundingDiscipleIds.slice(0,2).map((id,index)=>{
    const actor=world.cultivators.find(row=>row.id===id);
    if(!actor)throw Error('Expected founding disciple');
    actor.age=23;
    actor.quirks=kind==='blame'?['jinx']:kind==='crush'&&index===0?['lovestruck']:['chatterbox'];
    return actor;
  });
  world.relationships=world.relationships.filter(edge=>!(actors.some(row=>row.id===edge.fromId)&&actors.some(row=>row.id===edge.toId)));
  world.relationships.push({fromId:actors[0].id,toId:actors[1].id,type:kind==='crush'?'同门':'竞争',affinity:20,note:'约过演武场对练。'});
  const board=actors.map((actor):SectJobAssignment=>({discipleId:actor.id,jobId:'guard'}));
  const orders=Object.fromEntries(world.cultivators.map(actor=>[actor.id,rest]));
  const settled=advanceWorldTick(world,orders,()=>.62,'utility',undefined,{sectJobAssignments:board,capturePresentation:false});
  const drama=projectSectPairDrama(settled),report=settled.sectManagement?.latestReport;
  if(!drama||!report||settled.sectManagement?.pairDrama?.kind!==kind)throw Error(`Expected a genuine current ${kind} scene`);
  return {world:settled,drama,report};
}
async function find<T extends HTMLElement>(target:()=>T|null){
  for(let attempts=0;attempts<30;attempts++){
    const node=target();
    if(node)return node;
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  }
  throw Error('Missing rendered report');
}
function mount(){
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const ctx=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  return {host,render:(world:WorldState,withReport=true)=>act(async()=>root.render(
    <SectManagementHome world={world} onOpen={vi.fn()} onStart={vi.fn()} report={withReport?world.sectManagement?.latestReport:undefined}/>
  )),cleanup:async()=>{await act(async()=>root.unmount());host.remove();ctx.mockRestore();vi.unstubAllGlobals();}};
}

it('shows both attributed voices on just one related report, with signed facts outside the quotes',async()=>{
  const {world,drama,report}=fixture();
  const associated=associatedPairDramaRow(drama,report);
  expect(associated).toBeDefined();
  expect(associatedPairDramaRow(drama,{...report,sectId:'different-sect'})).toBeUndefined();
  expect(associatedPairDramaRow(drama,{...report,rows:report.rows.slice(0,1)})).toBeUndefined();
  expect(associatedPairDramaRow(drama,{...report,rows:[...report.rows,report.rows[0]]})).toBeUndefined();
  expect(associatedPairDramaRow(drama,{...report,settledTick:report.settledTick+1})).toBeUndefined();
  const {host,render,cleanup}=mount();
  try{
    await render(world);
    const stage=await find(()=>host.querySelector<HTMLElement>('[data-sect-report]'));
    const scene=stage.querySelector('[data-sect-pair-drama]');
    expect(scene).not.toBeNull();
    expect(host.querySelectorAll('[data-sect-pair-drama]')).toHaveLength(1);
    expect([...scene!.querySelectorAll('figcaption')].map(node=>node.textContent)).toEqual(drama.voices.map(row=>row.name+'说：'));
    expect([...scene!.querySelectorAll('blockquote')].map(node=>node.textContent)).toEqual(drama.voices.map(row=>`「${row.text}」`));
    const facts=scene!.querySelector('[aria-label="同办得失"]');
    expect(facts?.textContent).toContain('看守山门');
    expect(facts?.textContent).toContain('交情 +1');
    expect(facts?.querySelector('blockquote')).toBeNull();
    expect([...stage.querySelectorAll('button')].map(node=>node.textContent)).toEqual(['下一位','跳过汇报']);

    const serialized=JSON.stringify(world);
    await act(async()=>stage.querySelector('button')?.click());
    expect(stage.querySelector('[data-sect-pair-drama]')).toBeNull();
    expect(host.querySelector('[data-sect-comic-aside] [data-sect-pair-drama]')).not.toBeNull();
    expect(host.querySelectorAll('[data-sect-pair-drama]')).toHaveLength(1);
    const skip=[...stage.querySelectorAll('button')].find(button=>button.textContent==='跳过汇报');
    await act(async()=>skip?.click());
    const aside=host.querySelector<HTMLDetailsElement>('[data-sect-comic-aside]');
    expect(aside?.open).toBe(false);
    expect(aside?.firstElementChild?.textContent?.trim()).toBe('本月小插曲');
    expect(aside?.querySelector('[data-sect-pair-drama]')).not.toBeNull();
    expect(host.querySelectorAll('[data-sect-comic-aside]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-sect-pair-drama]')).toHaveLength(1);
    expect(JSON.stringify(world)).toBe(serialized);
  }finally{await cleanup();}
});

it('uses only the current month’s existing folded disclosure when the report is hidden',async()=>{
  const {world,drama}=fixture();
  const {host,render,cleanup}=mount();
  try{
    await render(world,false);
    const details=host.querySelector<HTMLDetailsElement>('[data-sect-comic-aside]');
    expect(details?.open).toBe(false);
    expect(details?.querySelector('[data-sect-pair-drama]')?.textContent).toContain(drama.facts);
    expect(host.querySelector('[data-sect-report]')).toBeNull();
    await render({...world,tick:world.tick+1},false);
    expect(host.querySelector('[data-sect-pair-drama]')).toBeNull();
  }finally{await cleanup();}
});


it('does not reveal a unilateral crush to the manager, even inside the opened disclosure',async()=>{
  const {world,drama}=fixture('crush');
  const {host,render,cleanup}=mount();
  try{
    await render(world,false);
    const details=host.querySelector<HTMLDetailsElement>('[data-sect-comic-aside]');
    if(!details)throw Error('Expected the existing disclosure');
    details.open=true;
    const scene=details.querySelector('[data-sect-pair-drama]');
    expect(scene?.textContent).toContain('一同办差');
    expect(scene?.textContent).not.toMatch(/未说出口|临到开口|暗恋|道侣/);
    expect([...scene!.querySelectorAll('figcaption')].map(node=>node.textContent)).toEqual(drama.voices.map(row=>row.name+'说：'));
    expect(drama).not.toHaveProperty('kind');
    expect(drama).not.toHaveProperty('initiatorId');
  }finally{await cleanup();}
});

it('labels a failed joint duty honestly and keeps its loss separate from the excuses',async()=>{
  const {world,drama,report}=fixture('blame');
  expect(associatedPairDramaRow(drama,report)).toBeDefined();
  const {host,render,cleanup}=mount();
  try{
    await render(world);
    const stage=await find(()=>host.querySelector<HTMLElement>('[data-sect-report]'));
    const scene=stage.querySelector('[data-sect-pair-drama]');
    expect(scene?.querySelectorAll('blockquote')).toHaveLength(2);
    expect(scene?.querySelector('[aria-label="同办得失"]')?.textContent).toContain('看守山门：同办未成');
    expect(scene?.querySelector('[aria-label="同办得失"]')?.textContent).toContain('交情 −2');
    expect(stage.querySelector('[aria-label="所得与折损"]')?.textContent).toContain('没有可记的收获或折损');
  }finally{await cleanup();}
});
