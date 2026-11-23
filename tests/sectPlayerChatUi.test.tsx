// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SectChatPanel,type SectChatModelControls} from '../src/components/SectChatPanel';
import type {SectPlayerChatControls} from '../src/components/SectPlayerChatComposer';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import type {WorldState} from '../src/types/world';

const mocks=vi.hoisted(()=>({
  options:vi.fn(),project:vi.fn(),prepare:vi.fn<SectPlayerChatControls['prepare']>(),send:vi.fn<SectPlayerChatControls['send']>(),
}));
vi.mock('../src/engine/sectPlayerChat',()=>({quoteSectPlayerChatOptions:mocks.options,projectSectPlayerChat:mocks.project}));
vi.mock('../src/engine/sectChat',()=>({projectSectChat:()=>[
  {id:'own',label:'本宗内部群',posts:[]},{id:'jiuzhou',label:'九州修仙交流群',posts:[]},
  {id:'market',label:'坊市二手群',posts:[]},{id:'leaders',label:'掌门私聊',posts:[]},
]}));
function fixture(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!world?.sectManagement)throw Error('Expected managed sect');
  return world;
}
function mount(){
  const host=document.createElement('div');
  document.body.append(host);
  const root=createRoot(host);
  return {host,render:(world:WorldState,model?:SectChatModelControls)=>act(async()=>root.render(
    <SectChatPanel world={world} busy={false} scope="player-test" posting={{prepare:mocks.prepare,send:mocks.send}} model={model}/>
  )),cleanup:async()=>{await act(async()=>root.unmount());host.remove();}};
}
function button(host:Element,name:string){
  const item=[...host.querySelectorAll('button')].find(node=>node.textContent?.includes(name));
  if(!item)throw Error(`Missing ${name}`);
  return item;
}
function select(node:HTMLSelectElement,value:string){
  return act(async()=>{node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));});
}
function type(node:HTMLTextAreaElement,value:string){
  return act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set?.call(node,value);
    node.dispatchEvent(new Event('input',{bubbles:true}));
  });
}
const click=(node:HTMLButtonElement)=>act(async()=>node.click());

beforeEach(()=>{
  window.sessionStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  mocks.project.mockReturnValue([]);
  mocks.options.mockImplementation((_world:WorldState,room:string)=>{
    const local=[{id:'protect',label:'替弟子出头',preset:'hype',effect:'只给同门留一句话。',intent:{kind:'chat'}}];
    return room==='own'?local:[...local,
      {id:'prov-rival-a',label:'放狠话',preset:'provoke',targetLabel:'隔壁宗',effect:'对方或会上门。',intent:{kind:'provoke',targetSectId:'rival-a'}},
      {id:'prov-rival-b',label:'放狠话',preset:'provoke',targetLabel:'湖边宗',effect:'对方或会上门。',intent:{kind:'provoke',targetSectId:'rival-b'}}];
  });
  mocks.prepare.mockReset();
  mocks.send.mockReset();
});
afterEach(()=>vi.unstubAllGlobals());

it('shows one folded composer, limits aliases to public Jiuzhou, and binds exact quick target to a separate send',async()=>{
  const world=fixture(),{host,render,cleanup}=mount();
  mocks.prepare.mockResolvedValue({id:'preview-a',tick:world.tick,roomId:'jiuzhou',identity:'passing_senior',
    body:{kind:'quick',preset:'provoke',optionId:'prov-rival-a'},intent:{kind:'provoke',targetSectId:'rival-a'},
    effect:'对方或会上门。',text:'隔壁宗诸位，改日山门前见。'});
  mocks.send.mockResolvedValue(true);
  try{
    await render(world);
    await click(button(host,'仙门群聊'));
    const disclosure=button(host,'掌门发言');
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    await click(disclosure);
    const own=host.querySelector('[aria-label="掌门发言"]');
    expect(own?.querySelector('select,textarea')).toBeNull();
    expect(own?.querySelector('[aria-label="快捷回复"]')?.querySelectorAll('button')).toHaveLength(5);
    expect(button(host,'放狠话').disabled).toBe(true);
    await click(button(host,'九州修仙交流群'));
    await click(button(host,'掌门发言'));
    const identity=host.querySelector<HTMLSelectElement>('select');
    if(!identity)throw Error('Missing public identity options');
    expect([...identity.options].map(row=>row.text)).toEqual(['掌门号','路过的前辈','天道小号','匿名热心修士']);
    await select(identity,'passing_senior');
    expect(host.textContent).toContain('马甲可能被识破');
    await click(button(host,'放狠话'));
    const target=host.querySelectorAll<HTMLSelectElement>('select')[1];
    expect([...target.options].map(row=>row.text)).toEqual(['请选择','隔壁宗','湖边宗']);
    await select(target,'prov-rival-a');
    await click(button(host,'预览发言'));
    expect(mocks.prepare).toHaveBeenCalledWith(world,{roomId:'jiuzhou',identity:'passing_senior',
      body:{kind:'quick',preset:'provoke',optionId:'prov-rival-a'}},false);
    expect(host.textContent).toContain('发往九州修仙交流群 · 路过的前辈');
    expect(host.textContent).toContain('隔壁宗诸位，改日山门前见。');
    expect(mocks.send).not.toHaveBeenCalled();
    await click(button(host,'确认发出'));
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('已发出。');
    await click(button(host,'掌门私聊'));
    expect(host.querySelector('[aria-label="掌门发言"]')).toBeNull();
  }finally{await cleanup();}
});

it('never sends while preparing public free speech or applies a preview after moving to another room',async()=>{
  const world=fixture(),{host,render,cleanup}=mount();
  let resolve:(value:undefined)=>void=()=>{};
  mocks.prepare.mockReturnValue(new Promise(done=>{resolve=done;}));
  try{
    await render(world,{config:{apiKey:'example',apiBaseUrl:'https://example.invalid/v1',model:'test',enabled:false,sectChatEnabled:true},onChange:vi.fn()});
    await click(button(host,'仙门群聊'));
    await click(button(host,'九州修仙交流群'));
    await click(button(host,'掌门发言'));
    await click(button(host,'自由发言'));
    const input=host.querySelector('textarea');
    if(!input)throw Error('Missing public text field');
    await type(input,'今夜请诸位来喝一盏茶。');
    await click(button(host,'用模型辨意'));
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.prepare).toHaveBeenCalledWith(world,{roomId:'jiuzhou',identity:'leader',body:{kind:'free',text:'今夜请诸位来喝一盏茶。'}},true);
    expect(mocks.send).not.toHaveBeenCalled();
    await click(button(host,'本宗内部群'));
    await act(async()=>resolve(undefined));
    expect(host.textContent).not.toContain('确认发出');
    expect(host.querySelector('textarea')).toBeNull();
  }finally{await cleanup();}
});

it('merges settled alias speech into its real room without treating your own post as unread',async()=>{
  const world=fixture(),{host,render,cleanup}=mount();
  mocks.project.mockReturnValue([{id:'player-1',tick:world.tick,roomId:'jiuzhou',identity:'heaven_alt',
    name:'天道小号',text:'山风比我嘴严。',exposed:true}]);
  try{
    await render(world);
    const toggle=button(host,'仙门群聊');
    expect(toggle.textContent).not.toContain('条未读');
    await click(toggle);
    expect(host.textContent).not.toContain('山风比我嘴严。');
    await click(button(host,'九州修仙交流群'));
    expect(host.textContent).toContain('天道小号');
    expect(host.textContent).toContain('山风比我嘴严。');
    expect(host.textContent).toContain('马甲已被识破');
  }finally{await cleanup();}
});
