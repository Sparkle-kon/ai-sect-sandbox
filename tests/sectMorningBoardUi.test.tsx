// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {SectManagementHome,type SectManagementHomeProps} from '../src/components/SectManagementHome';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import type {SectJobAssignment,SectJobObservation} from '../src/types/sectJobs';
import type {WorldState} from '../src/types/world';

function fixture(){
  const world=createManagedSectWorld(407,'classic','qingyun-odd-jobs',0);
  const state=world?.sectManagement;
  if(!world||!state)throw Error('Expected a managed starting sect');
  const disciples=state.foundingDiscipleIds.map(id=>{
    const actor=world.cultivators.find(row=>row.id===id);
    if(!actor)throw Error('Expected the founder’s disciples');
    return actor;
  });
  return {world,disciples};
}
const spritePaint=vi.hoisted(()=>vi.fn());
vi.mock('../src/components/canvasCharacterSprite',()=>({drawCanvasCharacterSprite:spritePaint}));

function mount(world:WorldState,onConfirmJobs:SectManagementHomeProps['onConfirmJobs'],observations?:readonly SectJobObservation[]){
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host);
  const ctx=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  return {host,ctx,render:(source=world)=>act(async()=>{
    await import('../src/components/SectMorningBoard');
    root.render(<SectManagementHome world={source} onOpen={vi.fn()} onStart={vi.fn()}
      onConfirmJobs={onConfirmJobs} observations={observations}/>);
  }),cleanup:async()=>{
    await act(async()=>root.unmount());host.remove();ctx.mockRestore();vi.unstubAllGlobals();
  }};
}
const findButton=(host:ParentNode,text:string,selector='button')=>{
  const found=[...host.querySelectorAll<HTMLButtonElement>(selector)].find(button=>
    button.getAttribute('aria-label')===text||button.textContent?.trim()===text);
  if(!found)throw Error(`Missing button: ${text}`);
  return found;
};

it.each([360,390])('lets players tap to assign, replace or undo on a %ipx mobile layout; retries without duplicate submissions',async width=>{
  vi.stubGlobal('innerWidth',width);
  const {world,disciples:[first]}=fixture();
  let resolveFirst:(success:boolean)=>void=()=>{};
  const confirm=vi.fn<(expected:WorldState,assignments:readonly SectJobAssignment[])=>Promise<boolean>>()
    .mockImplementationOnce(()=>new Promise(resolve=>{resolveFirst=resolve;})).mockResolvedValueOnce(true);
  const {host,render,cleanup}=mount(world,confirm);
  try{
    await render();
    const mobile=host.querySelector('[aria-label="庭院弟子"]');
    const board=host.querySelector('[aria-label="晨会差事"]');
    if(!board||!mobile)throw Error('Missing responsive sections');
    expect(mobile.className).toContain('lg:hidden');
    expect(board.querySelector('.grid')?.className).toContain('grid-cols-2');
    expect(board.querySelector('.grid')?.querySelectorAll('button')).toHaveLength(10);
    const select=findButton(mobile,`点选 ${first.name}`);
    expect(select.className).toContain('min-h-11');
    await act(async()=>select.click());
    expect(select.getAttribute('aria-pressed')).toBe('true');
    await act(async()=>findButton(board,'闭关修炼').click());
    expect(findButton(board,'闭关修炼').textContent).toContain(first.name);
    await act(async()=>findButton(board,"撤回这件差事").click());
    expect(findButton(board,"闭关修炼").textContent).not.toContain(first.name);
    await act(async()=>findButton(board,"饭堂掌勺").click());
    await act(async()=>findButton(board,"闭关修炼").click());
    expect(findButton(board,"饭堂掌勺").textContent).not.toContain(first.name);
    const advance=findButton(board,"开晨会，过一个月");
    await act(async()=>{advance.click();advance.click();});
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(world,[{discipleId:first.id,jobId:"cultivate"}]);
    await act(async()=>resolveFirst(false));
    expect(board.querySelector("[role=status]")?.textContent).toContain("可以再试");
    expect(findButton(board,"闭关修炼").textContent).toContain(first.name);
    await act(async()=>advance.click());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(advance.disabled).toBe(true);
    await render({...world,tick:world.tick+1});
    expect(findButton(board,"闭关修炼").textContent).not.toContain(first.name);
    expect(findButton(board,"开晨会，过一个月").disabled).toBe(false);
  }finally{await cleanup();}
});

it('accepts only a live canvas drag, leaving a remote disciple out of the courtyard',async()=>{
  const {world,disciples:[first,second]}=fixture();
  second.locationId='loc-market';
  const confirm=vi.fn().mockResolvedValue(true);
  const {host,render,cleanup}=mount(world,confirm);
  const data=new Map<string,string>();
  const transfer={
    effectAllowed:'all',dropEffect:'none',
    getData:(type:string)=>data.get(type)??'',
    setData:(type:string,value:string)=>data.set(type,value),
  };
  const dragEvent=(type:string)=>{
    const event=new Event(type,{bubbles:true,cancelable:true});
    Object.defineProperty(event,'dataTransfer',{value:transfer});
    return event;
  };
  try{
    await render();
    const plot=host.querySelector('[data-local-courtyard]');
    const out=host.querySelector('[aria-label="不在庭院的弟子"]');
    if(!plot||!out)throw Error('Expected real court and separate away row');
    expect(out.textContent).toContain(second.name);
    const mode='button[data-morning-disciple="sprite"]';
    expect([...plot.querySelectorAll(mode)].some(node=>node.textContent===second.name)).toBe(false);
    const disciple=findButton(plot,`点选 ${first.name}`,mode);
    expect(disciple.draggable).toBe(true);
    expect(disciple.parentElement?.style.left).toContain('%');
    const job=findButton(host,'看守山门');
    await act(async()=>{
      job.dispatchEvent(dragEvent('drop'));
      disciple.dispatchEvent(dragEvent('dragstart'));
    });
    expect(job.textContent).not.toContain(first.name);
    await act(async()=>{
      const over=dragEvent('dragover');job.dispatchEvent(over);expect(over.defaultPrevented).toBe(true);
      job.dispatchEvent(dragEvent('drop'));
    });
    expect(job.textContent).toContain(first.name);
    await act(async()=>findButton(host,'开晨会，过一个月').click());
    expect(confirm).toHaveBeenCalledWith(world,[{discipleId:first.id,jobId:'guard'}]);
  }finally{await cleanup();}
});

it('reveals unavailable reasons and last month evidence without claiming a route has been completed',async()=>{
  const {world,disciples:[first]}=fixture();
  if(!world.sectManagement)throw Error('Managed starter is required');
  world.sectManagement.buildings.gate=0;
  const confirm=vi.fn().mockResolvedValue(true);
  const {host,render,cleanup}=mount(world,confirm,[
    {tick:world.tick,discipleId:first.id,jobId:'gather',phase:'on_route',line:'沿山路去药圃。'},
    {tick:world.tick-1,discipleId:first.id,jobId:'gather',phase:'performed',line:'不应显示的旧记录。'},
  ]);
  try{
    await render();
    await act(async()=>findButton(host,`点选 ${first.name}`,'button[data-morning-disciple="name"]').click());
    const guard=findButton(host,'看守山门');
    expect(guard.textContent).toContain('暂不能领');
    await act(async()=>guard.click());
    expect(host.querySelector('[role="status"]')?.textContent).toContain('山门未修');
    expect(host.textContent).toContain('已派 0 人');
    const evidence=[...host.querySelectorAll('details')].find(row=>row.firstElementChild?.textContent?.startsWith('上月差事'));
    expect(evidence?.open).toBe(false);
    expect(evidence?.textContent).toContain('进行中');
    expect(evidence?.textContent).not.toContain('已办');
    expect(evidence?.textContent).not.toContain('不应显示的旧记录');
  }finally{await cleanup();}
});

it.each([false,true])('keeps the projected assignment sprite usable when reduced motion is %s',async reduced=>{
  const {world,disciples:[first]}=fixture();
  const {host,ctx,render,cleanup}=mount(world,vi.fn().mockResolvedValue(true));
  const animation=vi.fn(()=>({cancel:vi.fn()}));
  const animate=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,'animate');
  Object.defineProperty(HTMLCanvasElement.prototype,'animate',{configurable:true,value:animation});
  vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener:()=>{},removeEventListener:()=>{}}));
  // Only the small walk marker is drawn here; the main court remains a native (zero-size jsdom) canvas.
  const markerPen={clearRect:vi.fn()} as unknown as CanvasRenderingContext2D;
  ctx.mockImplementation(function(this:HTMLCanvasElement){return this.width===40?markerPen:null;});
  spritePaint.mockClear();
  try{
    await render();
    await act(async()=>findButton(host,`点选 ${first.name}`,'button[data-morning-disciple="name"]').click());
    await act(async()=>findButton(host,'闭关修炼').click());
    expect(findButton(host,'闭关修炼').querySelector('canvas')).toBeTruthy();
    expect(spritePaint).toHaveBeenCalledWith(markerPen,20,20,expect.objectContaining({id:first.id}),34,0,false,false);
    expect(animation).toHaveBeenCalledTimes(reduced?0:1);
  }finally{
    await cleanup();
    if(animate)Object.defineProperty(HTMLCanvasElement.prototype,'animate',animate);
    else Reflect.deleteProperty(HTMLCanvasElement.prototype,'animate');
  }
});
