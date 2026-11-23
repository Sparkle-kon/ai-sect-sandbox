// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SectChatPanel} from '../src/components/SectChatPanel';
import {SectMomentsPanel,type SectMomentsAction} from '../src/components/SectMomentsPanel';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import type {WorldState} from '../src/types/world';
import type {SectMomentPost} from '../src/types/sectMoments';

const mock=vi.hoisted(()=>({
  projection:vi.fn(),scene:vi.fn(),chat:vi.fn(),
}));
vi.mock('../src/engine/sectMoments',()=>({projectSectMoments:mock.projection}));
vi.mock('../src/components/sectMomentScene',()=>({projectSectMomentScene:mock.scene}));
vi.mock('../src/engine/sectChat',()=>({projectSectChat:mock.chat}));
vi.mock('../src/engine/sectPlayerChat',()=>({quoteSectPlayerChatOptions:()=>[],projectSectPlayerChat:()=>[]}));

function fixture(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!world?.sectManagement)throw Error('Expected managed sect');
  const {leaderId,foundingDiscipleIds}=world.sectManagement;
  const author=world.cultivators.find(actor=>actor.id===foundingDiscipleIds[0]);
  if(!author)throw Error('Expected disciple');
  const post:SectMomentPost={id:'sect-moment-2-0',tick:world.tick,authorId:author.id,kind:'breakthrough',
    sourceEventId:'evt-test-breakthrough',siteId:author.locationId,variant:0,reactions:[]};
  const render=(frame:WorldState)=>({
    posts:frame.month===world.month?[{post,authorName:author.name,caption:'风正好，剑却不太听话。',likes:1,
      comments:[{authorId:leaderId,name:'掌门',text:'收剑时慢些。'}]}]:[],
    blockedAuthors:frame.month===world.month?[]:[{id:author.id,name:author.name}],
  });
  mock.projection.mockImplementation(render);
  mock.scene.mockReturnValue({sourceId:post.sourceEventId,siteId:post.siteId,siteName:'山门',theme:'countryside',season:'spring',historical:true,cast:[]});
  mock.chat.mockImplementation((frame:WorldState)=>[
    {id:'own',label:'本宗内部群',posts:frame.month===world.month?[]:[{id:'new-note',tick:frame.tick,
      senderId:author.id,name:author.name,text:'刚回山门。',about:'comic'}]},
    {id:'jiuzhou',label:'九州修仙交流群',posts:[]},
    {id:'market',label:'坊市二手群',posts:[]},
    {id:'leaders',label:'掌门私聊',posts:[]},
  ]);
  return {world,post,author,next:{...world,tick:world.tick+1,month:world.month+1}};
}

function mount(){
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  return {host,render:(markup:JSX.Element)=>act(async()=>root.render(markup)),
    cleanup:async()=>{await act(async()=>root.unmount());host.remove();}};
}
function button(host:Element,name:string){
  const found=[...host.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===name||node.textContent?.startsWith(name));
  if(!found)throw Error(`Missing button ${name}`);
  return found;
}
const click=(element:HTMLButtonElement)=>act(async()=>element.click());
const type=(element:HTMLTextAreaElement,value:string)=>act(async()=>{
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set?.call(element,value);
  element.dispatchEvent(new Event('input',{bubbles:true}));
});
beforeEach(()=>{
  window.sessionStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

it('reuses the scene canvas in the drawer and reads new chat messages only after returning to chat',async()=>{
  const {world,next,post}=fixture(),{host,render,cleanup}=mount(),send=vi.fn<SectMomentsAction>();
  const draw=(frame:WorldState)=>render(<SectChatPanel world={frame} scope="moments" busy={false} momentsAction={send}/>);
  try{
    await draw(world);
    const toggle=button(host,'仙门群聊');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await click(toggle);
    await click(button(host,'朋友圈'));
    for(let i=0;i<30&&!host.querySelector('[aria-label="修仙朋友圈"]');i++){
      await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});
    }
    expect(host.querySelector('[aria-label="山门留影"] [data-scene-stage]')).not.toBeNull();
    expect(mock.scene).toHaveBeenCalledWith(world,post);
    expect(button(host,'朋友圈').getAttribute('aria-pressed')).toBe('true');
    expect(button(host,'朋友圈').className).toContain('min-h-11');
    await draw(next);
    expect(toggle.textContent).toContain('1 条未读');
    expect(host.querySelector('[aria-label="修仙朋友圈"]')?.textContent).toContain('朋友圈还空着');
    await click(button(host,'群聊'));
    expect(toggle.textContent).not.toContain('未读');
    expect(host.querySelector('[aria-label="修仙朋友圈"]')).toBeNull();
    expect(host.textContent).toContain('刚回山门。');
  }finally{await cleanup();}
});

it('binds like, comment and block to the exact submitted snapshot and can unblock hidden authors',async()=>{
  const {world,next,post,author}=fixture(),{host,render,cleanup}=mount();
  const send=vi.fn<SectMomentsAction>().mockResolvedValue(true);
  try{
    await render(<SectMomentsPanel world={world} busy={false} onAction={send}/>);
    await click(button(host,'点赞'));
    expect(send).toHaveBeenLastCalledWith(world,{kind:'like',postId:post.id});
    await click(button(host,'评论'));
    expect(host.textContent).toContain('收剑时慢些。');
    const input=host.querySelector('textarea');
    if(!input)throw Error('Missing comment field');
    await type(input,'长'.repeat(81));
    expect(button(host,'送出').disabled).toBe(true);
    await type(input,'  贺喜道友！  ');
    await click(button(host,'送出'));
    expect(send).toHaveBeenLastCalledWith(world,{kind:'comment',postId:post.id,text:'贺喜道友！'});
    expect(input.value).toBe('');
    await click(button(host,`拉黑 ${author.name}`));
    expect(send).toHaveBeenLastCalledWith(world,{kind:'block',authorId:author.id});
    await render(<SectMomentsPanel world={next} busy={false} onAction={send}/>);
    expect(host.querySelector('article')).toBeNull();
    await click(button(host,`取消拉黑 ${author.name}`));
    expect(send).toHaveBeenLastCalledWith(next,{kind:'unblock',authorId:author.id});
  }finally{await cleanup();}
});

it('suppresses a double submit and does not show an old rejection after the branch changes',async()=>{
  const {world,next,post}=fixture(),{host,render,cleanup}=mount();
  let rejectCurrent:((value:boolean)=>void)|undefined;
  const send=vi.fn<SectMomentsAction>().mockImplementation(()=>new Promise(resolve=>{rejectCurrent=resolve;}));
  try{
    await render(<SectMomentsPanel world={world} busy={false} onAction={send}/>);
    const like=button(host,'点赞');
    await act(async()=>{like.click();like.click();});
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(world,{kind:'like',postId:post.id});
    await render(<SectMomentsPanel world={next} busy={false} onAction={send}/>);
    await act(async()=>rejectCurrent?.(false));
    expect(host.querySelector('[role="status"]')).toBeNull();
  }finally{await cleanup();}
});
