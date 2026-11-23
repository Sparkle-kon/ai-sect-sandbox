// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {App} from '../src/App';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {encodeWorldSave} from '../src/engine/storageEngine';

const meeting='[data-sect-morning]';
const guide='[data-sect-first-meeting]';
const report='[data-sect-report]';
const fileInput='input[type="file"][accept=".json,application/json"]';

function mount(){
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const network=vi.fn(async()=>{throw Error('First meeting should run offline');});
  vi.stubGlobal('fetch',network);
  const host=document.createElement('div');
  document.body.append(host);
  const root=createRoot(host);
  const control=(label:string,tag='button')=>[...host.querySelectorAll<HTMLElement>(tag)].find(row=>
    row.getAttribute('aria-label')===label||row.textContent?.trim()===label);
  const press=async(label:string,tag='button')=>{
    const element=control(label,tag);
    if(!element)throw Error('Missing control: '+label);
    await act(async()=>element.click());
  };
  const waitFor=async(check:()=>boolean)=>{
    for(let i=0;i<60&&!check();i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
    expect(check()).toBe(true);
  };
  const waitForElement=(selector:string)=>waitFor(()=>Boolean(host.querySelector(selector)));
  const start=async()=>{
    await press('确认接掌青云杂役派');
    await waitForElement(meeting);
  };
  const pick=async()=>{
    const actor=host.querySelector<HTMLButtonElement>(`${meeting} button[data-morning-disciple="name"]`);
    const name=actor?.textContent?.trim();
    if(!actor||!name)throw Error('No named disciple available for the first meeting');
    await act(async()=>actor.click());
    return name;
  };
  const load=async(raw:string)=>{
    await press('更多','summary');
    await press('读档');
    await waitForElement(fileInput);
    const input=host.querySelector<HTMLInputElement>(fileInput);
    if(!input)throw Error('Missing real save import control');
    const file=new File([raw],'旧山门.json',{type:'application/json'});
    Object.defineProperty(file,'text',{value:async()=>raw});
    Object.defineProperty(input,'files',{configurable:true,value:[file]});
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
    await waitFor(()=>!!control('确认执行'));
    await press('确认执行');
    await waitForElement(meeting);
  };
  return {host,press,start,pick,load,waitFor,waitForElement,
    open:()=>act(async()=>root.render(<App initialMode="sect"/>)),
    stage:()=>host.querySelector(guide)?.getAttribute('data-sect-first-meeting'),
    cleanup:async()=>{
      try{expect(network).not.toHaveBeenCalled();}
      finally{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();}
    },
  };
}

it.each([false,true])('shows the named disciple’s settled order after real taps and undo, with a mid-draft skip=%s',async skip=>{
  const game=mount();
  try{
    await game.open();
    expect(game.stage()).toBeUndefined();
    await game.start();
    expect(game.stage()).toBe('disciple');
    expect(game.host.querySelector('[aria-modal="true"]')).toBeNull();
    expect(game.host.textContent).toContain('已派 0 人');

    const name=await game.pick();
    expect(game.stage()).toBe('job');
    expect(game.host.textContent).toContain('已派 0 人');
    await game.press('闭关修炼');
    expect(game.stage()).toBe('confirm');
    await game.press('撤回这件差事');
    expect(game.stage()).toBe('job');
    await game.press('闭关修炼');
    expect(game.host.textContent).toContain('已派 1 人');
    expect(game.host.textContent).toContain('仙历 1001 年 1 月');
    if(skip){
      await game.press('略过引导');
      expect(game.stage()).toBeUndefined();
      expect(game.host.textContent).toContain('已派 1 人');
    }

    await game.press('开晨会，过一个月');
    await game.waitForElement(report);
    expect(game.host.textContent).toContain('仙历 1001 年 2 月');
    expect(game.stage()).toBeUndefined();
    const returned=game.host.querySelector(report);
    expect(returned?.querySelector('h3')?.textContent).toBe(name);
    expect(returned?.textContent).toContain('闭关修炼');
    expect(returned?.querySelector('[aria-label="所得与折损"] li')?.textContent).toMatch(/真气进度.*\+[1-9]/);
    await game.press('听完，回晨会');
    await game.waitForElement(meeting);
    expect(game.stage()).toBeUndefined();
    expect(game.host.textContent).toContain('已派 0 人');
  }finally{await game.cleanup();}
},12000);

it.each([false,true])('leaves a blank first month ordinary, with optional explicit skip=%s',async skip=>{
  const game=mount();
  try{
    await game.open();
    await game.start();
    expect(game.stage()).toBe('disciple');
    if(skip){
      await game.press('略过引导');
      expect(game.stage()).toBeUndefined();
      await game.press('更多','summary');
      await game.press('故事书卷');
      await game.press('回掌门台');
      await game.waitForElement(meeting);
      expect(game.stage()).toBeUndefined();
    }
    expect(game.host.textContent).toContain('已派 0 人');
    await game.press('开晨会，过一个月');
    await game.waitFor(()=>!!game.host.textContent?.includes('仙历 1001 年 2 月'));
    await game.waitForElement(meeting);
    expect(game.stage()).toBeUndefined();
    expect(game.host.querySelector(report)).toBeNull();
    expect(game.host.textContent).toContain('已派 0 人');
  }finally{await game.cleanup();}
},12000);

it('does not treat a genuine legacy founding-month save as an explicit new start',async()=>{
  const old=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!old)throw Error('Expected an authentic managed founding-month world');
  const game=mount();
  try{
    await game.open();
    await game.load(encodeWorldSave(old));
    expect(game.host.textContent).toContain(`仙历 ${old.year} 年 ${old.month} 月`);
    expect(game.stage()).toBeUndefined();
    await game.pick();
    await game.press('闭关修炼');
    expect(game.host.textContent).toContain('已派 1 人');
    expect(game.stage()).toBeUndefined();
  }finally{await game.cleanup();}
},12000);
