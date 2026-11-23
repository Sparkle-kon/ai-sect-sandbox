// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {NightDoorStoryCard} from '../src/components/NightDoorStoryCard';
import type {NightDoorOption,NightDoorView} from '../src/engine/nightDoor';
const base={action:'NIGHT_DOOR',targetNightDoorId:'private-knock'} as const;
const shelter:NightDoorOption={...base,nightDoorMove:'shelter'};
const close:NightDoorOption={...base,nightDoorMove:'close'};
const escort:NightDoorOption={...base,nightDoorMove:'escort',targetLocationId:'private-refuge'};
const identify:NightDoorOption={...base,nightDoorMove:'identify'};
const accept:NightDoorOption={...base,nightDoorMove:'accept'};
const view:NightDoorView={siteName:'夜泊村舍',role:'host',uncertain:true,options:[shelter,close,escort]};

it('keeps an uncertain glimpse uncertain, and a host’s offer never identifies or moves the guest',()=>{
  const html=renderToStaticMarkup(<NightDoorStoryCard view={view} onChoose={()=>true}/>);
  expect(html).toContain('像先前见过的人，可一时辨不真切');
  expect(html).toContain('须来客自己应下');
  expect(html).toContain('尚未走出这里');
  expect(html.match(/min-h-\[44px\]/g)).toHaveLength(3);
  expect(html).not.toMatch(/private-|来客自报姓名|已安顿|应下这次相助/);
});

it('separates personal identification from accepting a host’s help and honours actual receipts only',()=>{
  const unknown=renderToStaticMarkup(<NightDoorStoryCard view={{...view,role:'guest',options:[identify,accept]}} onChoose={()=>true}/>);
  expect(unknown).toContain('由来客自己说');
  expect(unknown).not.toContain('来客自报姓名');
  const known=renderToStaticMarkup(<NightDoorStoryCard view={{...view,identifiedGuestName:'孟晚',options:[close]}}/>);
  expect(known).toContain('来客自报姓名：孟晚');
  expect(renderToStaticMarkup(<NightDoorStoryCard view={{...view,options:[]}}/>)).toBe('');
  const receipt=renderToStaticMarkup(<NightDoorStoryCard view={{...view,options:[],receipt:{title:'已过这一段',description:'两人确已各自走到。'}}}/>);
  expect(receipt).toContain('两人确已各自走到');
  expect(receipt).not.toMatch(/<button|像先前见过/);
});

it('acquires at most one exact current option, with native keyboard, no repeated execution',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host),choose=vi.fn((_option:NightDoorOption)=>true);
  try{
    await act(async()=>root.render(<NightDoorStoryCard view={view} sceneScope="A" onChoose={choose}/>));
    const btn=host.querySelector('button')!;
    const repeat=new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true});
    btn.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(true);
    await act(async()=>{
      btn.dispatchEvent(new MouseEvent('click',{detail:0,bubbles:true}));
      btn.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}));
    });
    expect(choose.mock.calls).toEqual([[shelter]]);
  }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
