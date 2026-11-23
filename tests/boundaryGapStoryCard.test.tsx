// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {BoundaryGapStoryCard} from '../src/components/BoundaryGapStoryCard';
import type {BoundaryGapOption,BoundaryGapView} from '../src/engine/boundaryGap';
const base={action:'BOUNDARY_GAP',targetBoundaryGapId:'private-handover'} as const;
const cover:BoundaryGapOption={...base,boundaryGapMove:'cover',targetCultivatorId:'private-body'};
const stay:BoundaryGapOption={...base,boundaryGapMove:'stay'};
const refuse:BoundaryGapOption={...base,boundaryGapMove:'refuse'};
const view:BoundaryGapView={siteName:'鸦渡关',status:'gap',options:[cover,refuse,stay]};

it('tells the local gap as it is and never interprets staying as guard assignment',()=>{
  const html=renderToStaticMarkup(<BoundaryGapStoryCard view={view} onChoose={()=>true}/>);
  expect(html).toContain('新守尚未到');
  expect(html).toContain('并非全州失陷');
  expect(html).toContain('不因此领到驻守之职');
  expect(html.match(/min-h-\[44px\]/g)).toHaveLength(3);
  expect(html).not.toMatch(/private-|新旗在岗/);
});

it('omits unanchored scene and trusts only a supplied real outcome receipt after action',()=>{
  expect(renderToStaticMarkup(<BoundaryGapStoryCard view={{...view,options:[]}}/>)).toBe('');
  const html=renderToStaticMarkup(<BoundaryGapStoryCard view={{...view,status:'returned',options:[],
    receipt:{title:'原路折返',description:'候补确已折返，没有到岗。'}}}/>);
  expect(html).toContain('候补确已折返，没有到岗');
  expect(html).not.toMatch(/<button|新守尚未到/);
});

it('acquires at most one exact current scoped action while retaining native keyboard control',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host),choose=vi.fn((_option:BoundaryGapOption)=>true);
  try{
    await act(async()=>root.render(<BoundaryGapStoryCard view={view} sceneScope="one" onChoose={choose}/>));
    const button=host.querySelector('button')!;
    const repeat=new KeyboardEvent('keydown',{key:' ',repeat:true,bubbles:true,cancelable:true});
    button.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(true);
    await act(async()=>{
      button.dispatchEvent(new MouseEvent('click',{detail:0,bubbles:true}));
      button.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}));
    });
    expect(choose.mock.calls).toEqual([[cover]]);
  }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
