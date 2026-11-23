// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {App} from '../src/App';
import {createInitialWorld} from '../src/data/initialWorld';
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
