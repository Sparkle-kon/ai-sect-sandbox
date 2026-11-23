// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SectManagementHome} from '../src/components/SectManagementHome';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import type {WorldState} from '../src/types/world';

const preview=vi.hoisted(()=>vi.fn());
vi.mock('../src/engine/sectChat',()=>({projectSectChat:preview}));
const openSource=vi.fn<(world:WorldState,postId:string)=>boolean>();

function fixture(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  const management=world?.sectManagement;
  if(!world||!management)throw Error('Expected managed sect');
  const speaker=world.cultivators.find(actor=>actor.id===management.foundingDiscipleIds[0]);
  if(!speaker)throw Error('Expected native speaker');
  preview.mockImplementation((frame:WorldState)=>{
    const line={tick:frame.tick,senderId:speaker.id,name:speaker.name};
    return [
      {id:'own',label:'本宗内部群',posts:[{...line,id:'own-first',text:'灶火已熄，谁还在找锅？',about:'comic'},
        ...(frame.tick>world.tick?[{...line,id:'own-second',text:'锅找着了。',about:'comic'}]:[])]},
      {id:'jiuzhou',label:'九州修仙交流群',posts:[{...line,id:'jiuzhou-first',text:'且问这一剑是从何处学的？',about:'public_event',sourceEventId:'real-anchor'}]},
      {id:'market',label:'坊市二手群',posts:[{...line,id:'market-first',text:'旧蒲团一个，坐过三年。',about:'room_greeting'}]},
      {id:'leaders',label:'掌门私聊',posts:[]},
    ];
  });
  return world;
}

function mount(){
  const host=document.createElement('div');
  document.body.append(host);
  const root=createRoot(host);
  return {host,render:async(world:WorldState,scope='live')=>{await act(async()=>root.render(<SectManagementHome world={world}
    onStart={vi.fn()} onOpen={vi.fn()} chatScope={scope} onOpenChatSource={openSource}/>));
    for(let i=0;i<40&&!host.querySelector('[data-sect-chat]');i++){
      await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
    }},
  cleanup:async()=>{await act(async()=>root.unmount());host.remove();}};
}
function getButton(host:Element,name:string){
  const button=[...host.querySelectorAll('button')].find(node=>node.textContent?.includes(name));
  if(!button)throw Error(`Missing button ${name}`);
  return button;
}
const click=(node:HTMLButtonElement)=>act(async()=>node.click());
function chat(host:Element){
  const panel=host.querySelector('[data-sect-chat]');
  if(!panel)throw Error('Missing chat panel');
  return panel;
}
beforeEach(()=>{
  window.sessionStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  openSource.mockReset();
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it('keeps the phone foldout collapsed, uses four usable rooms and counts local unread posts',async()=>{
  const world=fixture(),{host,render,cleanup}=mount();
  try{
    await render(world);
    const panel=chat(host),toggle=getButton(panel,'仙门群聊');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('3 条未读');
    expect(host.querySelectorAll('[data-sect-chat]')).toHaveLength(1);
    expect(host.querySelector('[aria-label="宗门庭院"]')).not.toBeNull();
    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toContain('2 条未读');
    const group=panel.querySelector('[aria-label="选择群聊"]');
    expect(group?.querySelectorAll('button')).toHaveLength(4);
    expect(getButton(panel,'本宗内部群').getAttribute('aria-pressed')).toBe('true');
    expect(panel.querySelector('[data-sect-chat-message] svg')).not.toBeNull();
    expect(panel.textContent).toContain('灶火已熄');
    expect(panel.textContent).not.toContain('旧蒲团');

    await click(getButton(panel,'坊市二手群'));
    expect(toggle.textContent).toContain('1 条未读');
    expect(panel.textContent).toContain('旧蒲团');
    expect(panel.textContent).not.toContain('灶火已熄');
    await click(toggle);
    await render({...world,tick:world.tick+1,month:world.month+1});
    expect(toggle.textContent).toContain('2 条未读');
    await click(toggle);
    expect(getButton(panel,'坊市二手群').getAttribute('aria-pressed')).toBe('true');
    await click(getButton(panel,'掌门私聊'));
    expect(panel.textContent).toContain('这处还没人开口。');
    expect(panel.querySelector('input,textarea')).toBeNull();
  }finally{await cleanup();}
});

it('keeps room and read state through a return visit without sharing them across branches',async()=>{
  const world=fixture(),first=mount();
  try{
    await first.render(world,'first-branch');
    await click(getButton(chat(first.host),'仙门群聊'));
    await click(getButton(chat(first.host),'坊市二手群'));
  }finally{await first.cleanup();}
  const next=mount();
  try{
    await next.render(world,'first-branch');
    expect(getButton(chat(next.host),'仙门群聊').textContent).toContain('1 条未读');
    await click(getButton(chat(next.host),'仙门群聊'));
    expect(getButton(chat(next.host),'坊市二手群').getAttribute('aria-pressed')).toBe('true');
    await next.render(world,'other-branch');
    expect(getButton(chat(next.host),'仙门群聊').textContent).toContain('3 条未读');
    await click(getButton(chat(next.host),'仙门群聊'));
    expect(getButton(chat(next.host),'本宗内部群').getAttribute('aria-pressed')).toBe('true');
  }finally{await next.cleanup();}
});

it('offers jumps only for linked messages, binds the exact live frame, and handles unavailable jumps',async()=>{
  const world=fixture(),{host,render,cleanup}=mount();
  openSource.mockReturnValueOnce(false).mockReturnValueOnce(true);
  try{
    await render(world);
    const panel=chat(host);
    await click(getButton(panel,'仙门群聊'));
    const original=JSON.stringify(world);
    expect(panel.querySelector('[data-sect-chat-message] button')).toBeNull();
    await click(getButton(panel,'九州修仙交流群'));
    const source=getButton(panel,'且问这一剑');
    expect(source.textContent).toContain('看纪事');
    await click(source);
    expect(openSource).toHaveBeenCalledWith(world,'jiuzhou-first');
    expect(panel.querySelector('[role="status"]')?.textContent).toBe('暂时翻不到这段纪事。');
    await click(source);
    expect(openSource).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(world)).toBe(original);
  }finally{await cleanup();}
});

it('opens the same chat panel by default at wide desktop width',async()=>{
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
  const world=fixture(),{host,render,cleanup}=mount();
  try{
    await render(world);
    const panel=chat(host),toggle=getButton(panel,'仙门群聊');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.querySelectorAll('[data-sect-chat-message]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-sect-chat]')).toHaveLength(1);
  }finally{await cleanup();}
});
