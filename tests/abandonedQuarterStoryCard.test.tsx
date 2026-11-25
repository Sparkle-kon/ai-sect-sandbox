// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {AbandonedQuarterStoryCard} from '../src/components/AbandonedQuarterStoryCard';
import type {AbandonedQuarterOption,AbandonedQuarterView} from '../src/engine/abandonedQuarter';

const base={action:'ABANDONED_QUARTER',targetAbandonedQuarterId:'private-quarter'} as const;
const inspect:AbandonedQuarterOption={...base,abandonedQuarterMove:'inspect'};
const stay:AbandonedQuarterOption={...base,abandonedQuarterMove:'stay'};
const leave:AbandonedQuarterOption={...base,abandonedQuarterMove:'leave',targetLocationId:'private-exit'};
const view:AbandonedQuarterView={siteName:'坊市',villageName:'坊外旧村',standing:'visitor',options:[inspect,stay,leave]};

it('separates old chapter, actual visitors, and only present choices',()=>{
  const visitor=renderToStaticMarkup(<AbandonedQuarterStoryCard view={view} onChoose={()=>true}/>);
  expect(visitor).toContain('今到坊外旧村的遗址');
  expect(visitor).toContain('如今来往的多是过客，另有籍册可查');
  expect(visitor.match(/min-h-\[44px\]/g)).toHaveLength(3);
  expect(visitor).not.toMatch(/private-|从前住过|已经到达/);
  const former=renderToStaticMarkup(<AbandonedQuarterStoryCard view={{...view,standing:'former_resident'}}/>);
  expect(former).toContain('从前住过坊外旧村');
  expect(former).not.toContain('<button');
});

it('does not show an empty scope, and reports only the actual receipt after the action',()=>{
  expect(renderToStaticMarkup(<AbandonedQuarterStoryCard view={{...view,options:[]}}/>)).toBe('');
  const html=renderToStaticMarkup(<AbandonedQuarterStoryCard view={{...view,options:[],
    receipt:{title:'暂息一月',description:'只记此人在遗址停留。'}}}/>);
  expect(html).toContain('只记此人在遗址停留');
  expect(html).not.toMatch(/<button|旧章里的炊烟/);
});

it('accepts one exact native pointer or keyboard choice until the scope changes',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main');
  document.body.append(host);
  const root=createRoot(host);
  const choose=vi.fn((_option:AbandonedQuarterOption)=>true);
  try {
    await act(async()=>root.render(<AbandonedQuarterStoryCard view={view} sceneScope="A" onChoose={choose}/>));
    const first=host.querySelector<HTMLButtonElement>('button')!;
    const repeated=new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true});
    first.dispatchEvent(repeated);
    expect(repeated.defaultPrevented).toBe(true);
    await act(async()=>{
      first.dispatchEvent(new MouseEvent('click',{detail:0,bubbles:true}));
      first.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}));
    });
    expect(choose.mock.calls).toEqual([[inspect]]);
    await act(async()=>root.render(<AbandonedQuarterStoryCard view={{...view,options:[leave]}} sceneScope="B" onChoose={choose}/>));
    await act(async()=>{host.querySelector('button')!.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}));});
    expect(choose.mock.calls).toEqual([[inspect],[leave]]);
  } finally {
    await act(async()=>root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
