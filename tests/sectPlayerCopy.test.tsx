// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {App} from '../src/App';
import {sectPlayerFactCopy} from '../src/data/sectPlayerFactCopy';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {encodeWorldSave} from '../src/engine/storageEngine';

const banned=/实付|托管|凭据|原生|不替|不补/;
it('rewrites old rule notes without converting a deposit into an expenditure or changing where funds went',()=>{
  const old='本期未实付；货款继续托管，原凭据不替换，欠款不补发。';
  const projected='本期尚未支付；货款继续代管，原凭证不会换掉，欠款不再发放。';
  expect(sectPlayerFactCopy(old)).toBe(projected);
  expect(sectPlayerFactCopy(projected)).toBe(projected);
  expect(sectPlayerFactCopy('向王掌柜实付80灵石')).toBe('向王掌柜实际支付80灵石');
});

function assertCopy(surface:string,host:Element){
  const text=host.textContent??'';
  const labels=Array.from(host.querySelectorAll<HTMLElement>('[aria-label],[aria-description],[aria-valuetext],[title],[placeholder],[alt]'))
    .flatMap(node=>['aria-label','aria-description','aria-valuetext','title','placeholder','alt'].map(name=>node.getAttribute(name)??''));
  expect([text,...labels].flatMap(copy=>copy.match(banned)??[]),surface).toEqual([]);
}

function mount(){
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const network=vi.fn(async()=>{throw Error('Copy coverage must not call a model');});
  vi.stubGlobal('fetch',network);
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  const host=document.createElement('div');
  document.body.append(host);
  const root=createRoot(host);
  const wait=async(test:()=>boolean,description='Expected view did not appear')=>{
    for(let n=0;n<100&&!test();n++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
    expect(test(),description).toBe(true);
  };
  const waitFor=async(selector:string)=>wait(()=>!!host.querySelector(selector),'Missing '+selector);
  const button=(label:string,scope:ParentNode=host)=>[...scope.querySelectorAll<HTMLButtonElement>('button')].find(row=>
    !row.closest('[hidden]')&&(row.getAttribute('aria-label')===label||row.textContent?.trim()===label));
  const press=async(label:string,scope:ParentNode=host)=>{
    const target=button(label,scope);
    if(!target)throw Error('Missing action: '+label);
    await act(async()=>target.click());
  };
  const expand=async(label:string)=>{
    const summary=[...host.querySelectorAll<HTMLElement>('summary')].find(row=>row.textContent?.trim()===label);
    if(!summary)throw Error('Missing section: '+label);
    await act(async()=>summary.click());
  };
  const importRaw=async(raw:string)=>{
    const input=host.querySelector<HTMLInputElement>('input[type="file"][accept=".json,application/json"]');
    if(!input)throw Error('Missing the actual save import input');
    const file=new File([raw],'青云旧档.json',{type:'application/json'});
    Object.defineProperty(file,'text',{value:async()=>raw});
    Object.defineProperty(input,'files',{configurable:true,value:[file]});
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
  };
  return {host,wait,waitFor,button,press,expand,importRaw,
    open:()=>act(async()=>root.render(<App initialMode="sect"/>)),
    cleanup:async()=>{
      try{expect(network).not.toHaveBeenCalled();}
      finally{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();}
    },
  };
}

it('keeps on-screen and assistive copy readable at the sect opening, a genuine job report, and the live social drawer',async()=>{
  const game=mount();
  try{
    await game.open();
    assertCopy('opening',game.host);
    await game.press('确认接掌青云杂役派');
    await game.waitFor('[data-sect-first-meeting]');
    assertCopy('first meeting',game.host);
    const member=game.host.querySelector<HTMLButtonElement>('button[data-morning-disciple="name"]');
    if(!member)throw Error('Missing a founding disciple');
    await act(async()=>member.click());
    await game.press('闭关修炼');
    await game.press('开晨会，过一个月');
    await game.waitFor('[data-sect-report]');
    expect(game.host.querySelector('[data-sect-report]')?.textContent).toContain('闭关修炼');
    assertCopy('actual report',game.host);
    await game.press('知道了，回晨会');
    await game.waitFor('[data-sect-chat]');
    const drawer=game.host.querySelector('[data-sect-chat]');
    if(!drawer)throw Error('Missing the actual chat drawer');
    const toggle=drawer.querySelector<HTMLButtonElement>('button[aria-expanded]');
    if(!toggle)throw Error('Missing the chat drawer toggle');
    await act(async()=>toggle.click());
    await game.waitFor('[aria-label="选择群聊"]');
    assertCopy('real monthly chat',drawer);
    const compose=drawer.querySelector<HTMLButtonElement>('[aria-label="掌门发言"] > button');
    if(!compose)throw Error('Missing the chat composer');
    await act(async()=>compose.click());
    await game.waitFor('[aria-label="快捷回复"]');
    assertCopy('chat composer',drawer);
    await game.press('朋友圈',drawer);
    await game.waitFor('[aria-label="修仙朋友圈"]');
    assertCopy('moments',drawer);
    await game.press('天机直播',drawer);
    await game.waitFor('[aria-label="天机直播间"]');
    assertCopy('livestream',drawer);
    await game.press('递踢馆帖');
    await game.waitFor('[aria-label="山门来帖"] select');
    assertCopy('challenge form',game.host);
  }finally{await game.cleanup();}
},12000);

it('checks the real import failure, confirmation, cancel and successful restore reached from the sect menu',async()=>{
  const save=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!save)throw Error('Missing a legal save fixture');
  const game=mount(), region='[aria-label="确认存档操作"]';
  try{
    await game.open();
    await game.expand('更多');
    await game.press('读档');
    await game.waitFor('input[type="file"][accept=".json,application/json"]');
    assertCopy('save screen',game.host);
    await game.importRaw('{');
    await game.wait(()=>Array.from(game.host.querySelectorAll('[role="status"]')).some(row=>/JSON|无法|无效/.test(row.textContent??'')));
    expect(game.host.querySelector(region)).toBeNull();
    assertCopy('invalid save notice',game.host);
    const raw=encodeWorldSave(save);
    await game.importRaw(raw);
    await game.waitFor(region);
    expect(game.host.querySelector(region)?.textContent).toMatch(/未保存的当前进度.*替换/);
    assertCopy('confirmation, progress replacement warning',game.host);
    await game.press('取消',game.host.querySelector(region)??game.host);
    expect(game.host.querySelector(region)).toBeNull();
    await game.importRaw(raw);
    await game.waitFor(region);
    await game.press('确认执行',game.host.querySelector(region)??game.host);
    await game.waitFor('[data-sect-morning]');
    assertCopy('restored sect',game.host);
  }finally{await game.cleanup();}
},12000);
