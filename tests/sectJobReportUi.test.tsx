// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {SectManagementHome} from '../src/components/SectManagementHome';
import {reportVoice} from '../src/components/sectJobReportPresentation';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import type {SectJobReport,SectJobReportRow} from '../src/types/sectJobs';

const sample=()=>{
  const world=createManagedSectWorld(407,'classic','drunken-sword-hermitage',0);
  const state=world?.sectManagement;
  if(!world||!state)throw Error('Expected a managed starting sect');
  const disciples=state.foundingDiscipleIds.map(id=>{
    const actor=world.cultivators.find(row=>row.id===id);
    if(!actor)throw Error('Expected the founder’s disciples');
    return actor;
  });
  world.tick=2;
  world.month=2;
  const [resting,scavenger,injured,cook]=disciples;
  scavenger.quirks=['glutton','lost'];scavenger.locationId='loc-market';
  injured.hp-=7; cook.quirks=['glutton'];cook.locationId='loc-market';
  const rows:readonly SectJobReportRow[]=[
    {discipleId:resting.id,jobId:'cultivate',phase:'performed',tier:'success',effects:[{kind:'qi',amount:7.15,stage:'native'}]},
    {discipleId:scavenger.id,jobId:'gather',phase:'performed',tier:'windfall',effects:[{kind:'herb',herbId:'jade_leaf',amount:2,stage:'native'}]},
    {discipleId:injured.id,jobId:'challenge',phase:'performed',tier:'disaster',effects:[{kind:'hp',amount:-7,stage:'follow_up'}]},
    {discipleId:cook.id,jobId:'kitchen',phase:'performed',tier:'mishap',effects:[]},
  ];
  const report:SectJobReport={openedTick:1,settledTick:2,sectId:state.sectId,leaderId:state.leaderId,rows};
  state.latestReport=report;
  return {world,report,resting,scavenger,injured,cook};
};

const findButton=(host:ParentNode,text:string)=>{
  const found=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.trim()===text);
  if(!found)throw Error('Missing button: '+text);
  return found;
};

async function until(get:()=>HTMLElement|null){
  for(let count=0;count<35;count++){
    const node=get();if(node)return node;
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
  }
  throw Error('Expected an active report scene');
}

it.each([360,390])('plays one receipt at a time without a second turn, at %ipx',async width=>{
  const {world,report,resting,scavenger,injured,cook}=sample();
  const serialized=JSON.stringify(world),confirm=vi.fn().mockResolvedValue(true),dismiss=vi.fn();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('innerWidth',width);
  vi.stubGlobal('matchMedia',()=>({matches:true}));
  const sceneAnimation=vi.fn(()=>({cancel:vi.fn()}));
  const animate=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'animate');
  Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:sceneAnimation});
  const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host),stage=()=>host.querySelector<HTMLElement>('[data-sect-report]');
  const render=(actual:SectJobReport|undefined=report)=>act(async()=>root.render(<SectManagementHome world={world} report={actual}
    onDismissReport={dismiss} onStart={vi.fn()} onOpen={vi.fn()} onConfirmJobs={confirm}/>));
  try{
    await render({...report});
    expect(stage()).toBeNull(); // A detached receipt cannot borrow an active snapshot.
    await render();
    const first=await until(stage);
    const page=()=>stage()?.querySelector('h3')?.textContent;
    const expression=()=>stage()?.querySelector('[data-portrait-expression]')?.getAttribute('data-portrait-expression');
    expect(first.className).toContain('order-first');
    expect(first.className).toContain('lg:order-none');
    expect(first.textContent).toContain('第 1 / 4 位');
    expect(page()).toBe(scavenger.name);
    expect(document.activeElement).toBe(first.querySelector('h3'));
    expect(expression()).toBe('surprise');
    expect(first.textContent).toContain('人未在庭院露面');
    expect(first.textContent).toContain('鼻子从来不认路牌');
    expect(first.textContent).toContain('翡翠灵叶 +2 株');
    expect(first.textContent).not.toContain(injured.name);
    expect(sceneAnimation).not.toHaveBeenCalled();
    const next=findButton(first,'下一位');
    expect(next.className).toContain('min-h-11');
    await act(async()=>{next.click();next.click();});
    expect(page()).toBe(cook.name);expect(expression()).toBe('dismay');
    await act(async()=>findButton(first,'下一位').click());
    expect(page()).toBe(injured.name);expect(expression()).toBe('wounded');
    expect(first.textContent).toContain('后续：气血 −7');
    await act(async()=>findButton(first,'下一位').click());
    expect(page()).toBe(resting.name);expect(expression()).toBe('calm');
    expect(first.textContent).toContain('真气进度 +7.15 个百分点');
    const finish=findButton(first,'听完，回晨会');
    await act(async()=>{finish.click();finish.click();});
    expect(dismiss).toHaveBeenCalledTimes(1);expect(dismiss).toHaveBeenCalledWith(report);
    expect(stage()).toBeNull();
    await until(()=>host.querySelector('[data-sect-morning]'));
    expect(confirm).not.toHaveBeenCalled();
    expect(JSON.stringify(world)).toBe(serialized);
  }finally{
    await act(async()=>root.unmount());host.remove();context.mockRestore();vi.unstubAllGlobals();
    if(animate)Object.defineProperty(HTMLElement.prototype,'animate',animate);
    else Reflect.deleteProperty(HTMLElement.prototype,'animate');
  }
});

it('keeps quirk-based dialogue deterministic and avoids claiming incomplete errands were done',()=>{
  const {world,report,scavenger}=sample();
  const row=report.rows[1];
  expect(reportVoice(row,scavenger)).toBe(reportVoice(row,scavenger));
  expect(reportVoice(row,scavenger)).not.toBe(reportVoice(row,{...scavenger,quirks:['lost']}));
  expect(reportVoice({...row,phase:'on_route'},scavenger)).toContain('莫忙着记作办成');
  expect(reportVoice({...row,phase:'unavailable'},scavenger)).toContain('没能办成');
  expect(world.tick).toBe(2);
});
