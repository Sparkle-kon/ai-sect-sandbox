// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {App} from '../src/App';
import {createInitialWorld} from '../src/data/initialWorld';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import type {LLMDecisionPayload} from '../src/types/world';
import {encodeWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';

const find=(host:HTMLElement,tag:string,label:string)=>
  [...host.querySelectorAll<HTMLElement>(tag)].find(item=>item.textContent?.trim()===label);
async function press(host:HTMLElement,label:string,tag='button'){
  const target=find(host,tag,label);
  if(!target)throw Error('Missing control: '+label);
  await act(async()=>target.click());
}
async function when(check:()=>boolean){
  for(let i=0;i<40&&!check();i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
  expect(check()).toBe(true);
}

it('defaults to the sect opening in the production mode and restores a real old world from More → Load',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  try{
    await act(async()=>root.render(<App initialMode="sect"/>));
    expect(host.textContent).toContain('青云杂役派');
    expect(host.querySelector('[data-story-home]')).toBeNull();
    await press(host,'更多','summary');
    await press(host,'读档');
    await when(()=>Boolean(host.querySelector('input[type="file"][accept=".json,application/json"]')));
    expect(host.querySelector('h1')?.textContent).toBe('读档与存档');
    const old=advanceWorldTick(createInitialWorld(13071));
    expect(old.sectManagement).toBeUndefined();
    const raw=encodeWorldSave(old);
    const file=new File([raw],'旧局.json',{type:'application/json'});
    Object.defineProperty(file,'text',{value:async()=>raw});
    const input=host.querySelector<HTMLInputElement>('input[type="file"][accept=".json,application/json"]');
    if(!input)throw Error('Missing file input');
    Object.defineProperty(input,'files',{configurable:true,value:[file]});
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
    await when(()=>Boolean(find(host,'button','确认执行')));
    expect(host.querySelector('[data-story-home]')).toBeNull();
    await press(host,'确认执行');
    expect(host.querySelector('[data-story-home]')?.getAttribute('data-story-turn')).toBe('2');
    await press(host,'回掌门台');
    expect(host.textContent).toContain('青云杂役派');
  }finally{
    await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();
  }
},12000);


it('runs an actual monthly assignment from the default board and does not advance twice on double confirmation',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  try{
    await act(async()=>root.render(<App initialMode="sect"/>));
    await press(host,'确认接掌青云杂役派');
    expect(host.textContent).toContain('仙历 1001 年 1 月');
    await when(()=>!!host.querySelector('[data-sect-morning]'));
    const actor=host.querySelector<HTMLButtonElement>('button[data-morning-disciple="name"]');
    if(!actor)throw Error('No actual disciple available on the mobile planning board');
    await act(async()=>actor.click());
    const study=host.querySelector<HTMLButtonElement>('button[aria-label="闭关修炼"]');
    if(!study)throw Error('No lawful cultivation card');
    await act(async()=>study.click());
    expect(host.textContent).toContain('已派 1 人');
    expect(host.textContent).toContain('仙历 1001 年 1 月');
    const commit=find(host,'button','开晨会，过一个月');
    if(!commit)throw Error('No meeting confirmation control');
    await act(async()=>{commit.click();commit.click();});
    await when(()=>!!host.textContent?.includes('仙历 1001 年 2 月'));
    expect(host.textContent).not.toContain('仙历 1001 年 3 月');
    await when(()=>!!host.querySelector('[data-sect-report]'));
    expect(host.querySelector('[data-sect-report]')?.textContent).toContain('闭关修炼');
    await press(host,'跳过汇报');
    await when(()=>!!host.querySelector('[data-sect-morning]'));
    expect(host.textContent).toContain('已派 0 人');
    await press(host,'更多','summary');
    await press(host,'故事书卷');
    await press(host,'回掌门台');
    expect(host.querySelector('[data-sect-report]')).toBeNull();
    expect(host.textContent).toContain('仙历 1001 年 2 月');
  }finally{
    await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();
  }
},12000);


it('offers an actual fresh sect only after confirming restart from a loaded failed campaign',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  try{
    const former=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
    for(const actor of former.cultivators)if(former.sectManagement?.foundingDiscipleIds.includes(actor.id))actor.sectId='';
    const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'静坐。'};
    const failed=advanceWorldTick(former,Object.fromEntries(former.cultivators.map(actor=>[actor.id,rest])),()=>.99);
    const raw=encodeWorldSave(failed);
    await act(async()=>root.render(<App initialMode="sect"/>));
    await press(host,'更多','summary');
    await press(host,'读档');
    const inputSelector='input[type="file"][accept=".json,application/json"]';
    await when(()=>!!host.querySelector(inputSelector));
    const input=host.querySelector<HTMLInputElement>(inputSelector)!;
    const file=new File([raw],'旧山门.json',{type:'application/json'});
    Object.defineProperty(file,'text',{value:async()=>raw});
    Object.defineProperty(input,'files',{configurable:true,value:[file]});
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
    await when(()=>!!find(host,'button','确认执行'));
    await press(host,'确认执行');
    await when(()=>!!host.querySelector('[data-sect-failure]'));
    await press(host,'东山再起');
    expect(host.textContent).toContain('仙历 1001 年 2 月');
    const alternate=[...host.querySelectorAll<HTMLInputElement>('input[type=radio]')]
      .find(control=>control.closest('label')?.textContent?.includes('醉剑小筑'));
    if(!alternate)throw Error('Expected the available alternative sect in the real restart picker');
    await act(async()=>alternate.click());
    await press(host,'确认接掌醉剑小筑');
    await when(()=>!!host.querySelector('[data-sect-morning]'));
    expect(host.textContent).toContain('仙历 1001 年 1 月');
    expect(host.querySelector('h1')?.textContent).toBe('醉剑小筑');
    expect(host.querySelector('[data-sect-failure]')).toBeNull();
    expect(encodeWorldSave(failed)).toBe(raw);
  }finally{
    await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();
  }
},12000);
