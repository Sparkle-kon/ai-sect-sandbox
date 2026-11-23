// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SectManagementHome} from '../src/components/SectManagementHome';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import type {LLMDecisionPayload} from '../src/types/world';
import {TianjiTabloidRead} from '../src/components/TianjiTabloidRead';
import {TianjiGazetteRead} from '../src/components/TianjiGazetteRead';
import type {TianjiTabloidIssueView} from '../src/engine/tianjiTabloid';

const kinds=['headline','embarrassment','dark_horse','rivalry','advertisement'] as const;
const labels=['头条','丢人榜','黑马','恩怨','广告位'] as const;
const issues:readonly TianjiTabloidIssueView[]=[{
  id:'spring-new',tick:6,year:1,month:6,quiet:false,
  columns:kinds.map((kind,index)=>({kind,title:index===1?'空锅惹来一声响':labels[index],
    text:index===1?'只是烧黑了旧锅，人员无恙。':'本栏暂且留白。',empty:index!==1,...(index===1?{siteName:'丹霞谷'}:{})})),
  hotspot:{title:'两位道友谈起旧锅',text:'一位说火候太旺，另一位说锅倒结实。'},
},{
  id:'spring-earlier',tick:3,year:1,month:3,quiet:true,
  columns:kinds.map((kind,index)=>({kind,title:labels[index],text:'此栏暂空。',empty:true})),
}];

function mount(){
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  return {host,render:(markup:JSX.Element)=>act(async()=>root.render(markup)),
    cleanup:async()=>{await act(async()=>root.unmount());host.remove();}};
}
const click=(node:HTMLElement)=>act(async()=>node.click());
function required<T extends HTMLElement>(node:ParentNode,selector:string){
  const found=node.querySelector<T>(selector);
  if(!found)throw Error(`Missing ${selector}`);
  return found;
}
const toggle=(node:HTMLDetailsElement,open:boolean)=>act(async()=>{
  node.open=open;
  node.dispatchEvent(new Event('toggle'));
});
beforeEach(()=>vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true));
afterEach(()=>vi.unstubAllGlobals());

it('opens only on demand with five fixed sections, dated edition and explicitly attributed gossip',async()=>{
  const {host,render,cleanup}=mount();
  try{
    await render(<TianjiTabloidRead scopeKey="public" issues={issues}/>);
    const fold=required<HTMLDetailsElement>(host,'details');
    expect(fold.open).toBe(false);
    expect(host.querySelector('article')).toBeNull();
    expect(required<HTMLElement>(fold,'summary').className).toContain('min-h-11');
    await toggle(fold,true);
    expect([...host.querySelectorAll('article section')].map(row=>row.getAttribute('aria-label'))).toEqual(labels);
    expect(host.textContent).toContain('仙历 1 年 6 月刊');
    expect(host.textContent).toContain('空锅惹来一声响');
    const reference=required<HTMLElement>(host,'aside[aria-label="群聊风向"]');
    expect(reference.textContent).toContain('编者摘记');
    expect(reference.textContent).toContain('不作判词');
  }finally{await cleanup();}
});

it('moves between quarterlies, keeps quiet issues quiet, and resets on changing read scope',async()=>{
  const {host,render,cleanup}=mount();
  try{
    await render(<TianjiTabloidRead scopeKey="public" issues={issues}/>);
    await toggle(required<HTMLDetailsElement>(host,'details'),true);
    const [newer,older]=host.querySelectorAll('button');
    expect(newer.disabled).toBe(true);
    await click(older);
    expect(host.textContent).toContain('仙历 1 年 3 月刊');
    expect(host.textContent).toContain('本期薄薄一张');
    expect(host.textContent).not.toContain('空锅惹来一声响');
    expect(host.querySelector('aside')).toBeNull();
    expect(older.disabled).toBe(true);
    await click(newer);
    expect(host.textContent).toContain('仙历 1 年 6 月刊');
    await render(<TianjiTabloidRead scopeKey="historic" historical issues={[issues[1]]}/>);
    expect(host.querySelector('article')).toBeNull();
    await toggle(required<HTMLDetailsElement>(host,'details'),true);
    expect(host.textContent).toContain('旧卷 · 天机阁季刊');
    expect(host.textContent).toContain('仙历 1 年 3 月刊');
    expect(host.textContent).not.toContain('6 月刊');
  }finally{await cleanup();}
});

it('keeps old wind-and-cloud editions available under the single quarterlies fold',async()=>{
  const {host,render,cleanup}=mount();
  const archive=<TianjiGazetteRead scopeKey="public" issues={[{
    id:'legacy',tick:1,year:1,month:1,trigger:'year_turn',entries:[],
  }]}/>;
  try{
    await render(<TianjiTabloidRead scopeKey="public" issues={issues} legacyArchive={archive}/>);
    expect(host.querySelectorAll('details')).toHaveLength(1);
    await toggle(required<HTMLDetailsElement>(host,'details'),true);
    expect(host.querySelectorAll('details')).toHaveLength(2);
    const legacy=required<HTMLDetailsElement>(host,'details details');
    expect(legacy.textContent).toContain('天机风云报');
    expect(legacy.querySelector('article')).toBeNull();
    await toggle(legacy,true);
    expect(legacy.textContent).toContain('仙历 1 年 1 月刊');
  }finally{await cleanup();}
});

it('places a real quarterly in the managed courtyard without a new primary destination',async()=>{
  const opening=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  if(!opening?.sectManagement)throw Error('Expected managed sect');
  let world=opening;
  const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'山门照常安歇。'};
  for(let steps=0;!world.tianjiGazette?.quarterlies?.length&&steps<4;steps++)
    world=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,rest])),undefined,'utility');
  const issue=world.tianjiGazette?.quarterlies?.at(-1);
  if(!issue)throw Error('Expected actual quarterly publication');
  const {host,render,cleanup}=mount(),open=vi.fn();
  const match=()=>[...host.querySelectorAll('details')].find(row=>row.querySelector('summary')?.textContent?.trim()==='江湖小报');
  const canvas=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  try{
    await render(<SectManagementHome world={world} onOpen={open} onStart={()=>false} chatScope="quarter-test"/>);
    for(let i=0;i<40&&!match();i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});
    const fold=match();
    if(!fold)throw Error('Missing quarterly on actual Home');
    expect(fold.open).toBe(false);
    expect(open).not.toHaveBeenCalled();
    await toggle(fold,true);
    expect(fold.textContent).toContain(`仙历 ${issue.year} 年 ${issue.month} 月刊`);
    expect([...fold.querySelectorAll('article section')].map(row=>row.getAttribute('aria-label'))).toEqual(labels);
    expect(host.querySelector('[aria-label="宗门庭院"]')).not.toBeNull();
  }finally{await cleanup();canvas.mockRestore();}
});
