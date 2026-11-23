// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SectChatPanel} from '../src/components/SectChatPanel';
import {SectLivePanel,type SectLiveAction} from '../src/components/SectLivePanel';
import {projectSectLiveScene} from '../src/components/sectLiveScene';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import type {SectLiveView} from '../src/engine/sectLive';
import type {SectLiveShow} from '../src/types/sectLive';
import type {WorldState} from '../src/types/world';
import {actualTournament,actualTournamentSignup,tournamentFrame,tournamentId} from './tournamentArenaNativeFixture';

const mocks=vi.hoisted(()=>({live:vi.fn(),chat:vi.fn()}));
vi.mock('../src/engine/sectLive',()=>({projectSectLive:mocks.live}));
vi.mock('../src/engine/sectChat',()=>({projectSectChat:mocks.chat}));
vi.mock('../src/engine/sectPlayerChat',()=>({quoteSectPlayerChatOptions:()=>[],projectSectPlayerChat:()=>[]}));

function fixture(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!world?.sectManagement)throw Error('Expected managed sect');
  const leader=world.cultivators.find(row=>row.id===world.sectManagement?.leaderId);
  if(!leader)throw Error('Expected leader');
  const show:SectLiveShow={id:`sect-live-${world.tick}-0`,tick:world.tick,kind:'tribulation',
    sourceEventId:'missing-old-source',siteId:leader.locationId,castIds:[leader.id],danmaku:[]};
  const current:SectLiveView={show,title:'真有一道雷',live:true,giftCost:3,lines:[
    {id:'first-line',name:'天机阁',text:'且站远些。',player:false},
  ]};
  const old:SectLiveView={...current,show:{...show,id:'old-1',tick:world.tick-1},title:'早先的场',live:false,giftCost:undefined};
  mocks.live.mockReturnValue({shows:[current,old],treasury:12});
  mocks.chat.mockImplementation((frame:WorldState)=>[
    {id:'own',label:'本宗内部群',posts:frame.tick===world.tick?[]:[{id:'new-note',tick:frame.tick,
      senderId:leader.id,name:leader.name,text:'今日有新消息。',about:'comic'}]},
    {id:'jiuzhou',label:'九州修仙交流群',posts:[]},{id:'market',label:'坊市二手群',posts:[]},{id:'leaders',label:'掌门私聊',posts:[]},
  ]);
  return {world,current,old,next:{...world,tick:world.tick+1,month:world.month+1}};
}

function mount(){
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  return {host,render:(markup:JSX.Element)=>act(async()=>root.render(markup)),
    cleanup:async()=>{await act(async()=>root.unmount());host.remove();}};
}
function button(host:ParentNode,name:string){
  const found=[...host.querySelectorAll('button')].find(node=>node.textContent?.startsWith(name));
  if(!found)throw Error(`Missing button ${name}`);
  return found;
}
const click=(node:HTMLButtonElement)=>act(async()=>node.click());
const type=(node:HTMLInputElement,value:string)=>act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));
});
const select=(node:HTMLSelectElement,value:string)=>act(async()=>{
  node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));
});
beforeEach(()=>{
  window.sessionStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

it('keeps live third in the same drawer and preserves chat unread while watching',async()=>{
  const {world,next}=fixture(),{host,render,cleanup}=mount(),send=vi.fn<SectLiveAction>();
  const draw=(frame:WorldState)=>render(<SectChatPanel world={frame} scope="live" busy={false}
    momentsAction={vi.fn()} liveAction={send}/>);
  try{
    await draw(world);
    const toggle=button(host,'仙门群聊');
    await click(toggle);
    const tabs=host.querySelector('[aria-label="选择江湖见闻"]');
    expect([...tabs?.querySelectorAll('button')??[]].map(row=>row.textContent)).toEqual(['群聊','朋友圈','天机直播']);
    await click(button(host,'天机直播'));
    for(let i=0;i<30&&!host.querySelector('[aria-label="天机直播间"]');i++){
      await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});
    }
    expect(host.querySelector('[aria-label="天机直播间"]')?.textContent).toContain('直播中');
    await draw(next);
    expect(toggle.textContent).toContain('1 条未读');
    await click(button(host,'群聊'));
    expect(toggle.textContent).not.toContain('未读');
    expect(host.querySelector('[aria-label="天机直播间"]')).toBeNull();
  }finally{await cleanup();}
});

it('binds action to exact live show, validates Unicode, pauses follow, and keeps old streams read-only',async()=>{
  const {world,current,old}=fixture(),{host,render,cleanup}=mount();
  let release:((value:boolean)=>void)|undefined;
  const send=vi.fn<SectLiveAction>().mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  try{
    await render(<SectLivePanel world={world} busy={false} onAction={send}/>);
    const list=host.querySelector('[aria-label="滚动弹幕"]');
    expect(list?.textContent).toContain('天机阁：且站远些。');
    await click(button(host,'暂停滚动'));
    expect(list?.getAttribute('aria-live')).toBe('off');
    await click(button(host,'继续滚动'));
    expect(list?.getAttribute('aria-live')).toBe('polite');
    const input=host.querySelector('input'),room=host.querySelector('select');
    if(!input||!room)throw Error('Missing live controls');
    await type(input,'𠮷'.repeat(41));
    expect(button(host,'送出').disabled).toBe(true);
    await type(input,'  且慢，留一角给我！  ');
    const post=button(host,'送出');
    await act(async()=>{post.click();post.click();});
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith(world,{kind:'danmaku',showId:current.show.id,text:'且慢，留一角给我！'});
    await act(async()=>release?.(true));
    expect(input.value).toBe('');
    expect(host.textContent).toContain('从公库支出 · 宗门名望 +1');
    await click(button(host,'打赏 3 灵石'));
    expect(send).toHaveBeenLastCalledWith(world,{kind:'gift',showId:current.show.id});
    await select(room,old.show.id);
    await act(async()=>release?.(false));
    expect(host.textContent).toContain('不能发弹幕或打赏');
    expect(host.querySelector('input, [role="status"]')).toBeNull();
    expect([...host.querySelectorAll('button')].some(row=>row.textContent?.includes('打赏'))).toBe(false);
  }finally{await cleanup();}
});

it('actually renders the proven tournament arena and rejects a mismatched bout/venue for the same event',async()=>{
  let world=actualTournamentSignup();
  while(world.tick<64)world=tournamentFrame(world);
  const arena=actualTournament(world).arena,round=arena?.rounds.find(row=>row.tick===world.tick);
  if(!round)throw Error('Missing completed native round');
  const actual=round.bouts[0];
  if(!actual?.secondId)throw Error('Missing real two-person bout');
  const show:SectLiveShow={id:'sect-live-64-0',tick:world.tick,kind:'tournament',siteId:'loc-market',
    sourceEventId:round.eventId,castIds:[actual.firstId,actual.secondId],bout:{occasionId:tournamentId,round:round.round,bout:0},danmaku:[]};
  const scene=projectSectLiveScene(world,show);
  expect(scene).toMatchObject({kind:'arena',frame:{siteId:'loc-market',tick:world.tick,historical:false}});
  expect(projectSectLiveScene(world,{...show,siteId:'loc-danxia'})).toBeUndefined();
  expect(projectSectLiveScene(world,{...show,bout:{occasionId:tournamentId,round:round.round,bout:1}})).toBeUndefined();
  mocks.live.mockReturnValue({shows:[{show,title:'仙门大比',live:true,lines:[]}],treasury:0});
  const {host,render,cleanup}=mount();
  try{
    await render(<SectLivePanel world={world} busy={false}/>);
    expect(host.querySelector('[aria-label="直播画面"] [data-visual-duel-arena] canvas')).not.toBeNull();
  }finally{await cleanup();}
});
