// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {FurnaceEmergencyStoryCard} from '../src/components/FurnaceEmergencyStoryCard';
import type {FurnaceEmergencyOption,FurnaceEmergencyView} from '../src/engine/furnaceEmergency';

const base={action:'FURNACE_EMERGENCY',targetFurnaceEmergencyId:'private-furnace'} as const;
const brace:FurnaceEmergencyOption={...base,furnaceEmergencyMove:'brace'};
const retreat:FurnaceEmergencyOption={...base,furnaceEmergencyMove:'retreat',targetLocationId:'private-refuge'};
const request:FurnaceEmergencyOption={...base,furnaceEmergencyMove:'request_rescue'};
const accept:FurnaceEmergencyOption={...base,furnaceEmergencyMove:'accept_rescue'};
const view:FurnaceEmergencyView={siteName:'丹霞丹房',options:[brace,retreat,request]};

it('renders authorized reachable options, not an ordinary cooldown or an invented outcome',()=>{
  const html=renderToStaticMarkup(<FurnaceEmergencyStoryCard view={view} onChoose={()=>true}/>);
  expect(html.match(/min-h-\[44px\]/g)).toHaveLength(3);
  expect(html).toContain('只有确实挡下伤害才耗八点真气');
  expect(html).toContain('并不等于丹炉修好了');
  expect(html).toContain('到了才算撤出');
  expect(html).toContain('对方须亲自答复');
  expect(html).not.toMatch(/private-|应下求援|冷却/);
});

it('shows independent acceptance or an actual receipt without implying success after merely asking',()=>{
  expect(renderToStaticMarkup(<FurnaceEmergencyStoryCard view={{...view,options:[]}}/>)).toBe('');
  const html=renderToStaticMarkup(<FurnaceEmergencyStoryCard view={{...view,options:[accept],
    receipt:{title:'已听见求援',description:'本人尚在炉前。'}}} onChoose={()=>true}/>);
  expect(html).toContain('本人尚在炉前');
  expect(html).toContain('确实越过这一段，才算一同撤离');
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).not.toMatch(/已有伤者得救|private-/);
});

it.each([360,390])('keeps one acquired exact native action at simulated %ipx width',async width=>{
  vi.stubGlobal('innerWidth',width);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main');
  document.body.append(host);
  const root=createRoot(host);
  const choose=vi.fn((_option:FurnaceEmergencyOption)=>true);
  try {
    await act(async()=>root.render(<FurnaceEmergencyStoryCard view={view} sceneScope="A" onChoose={choose}/>));
    const first=host.querySelector<HTMLButtonElement>('button')!;
    first.focus();
    const repeated=new KeyboardEvent('keydown',{key:' ',repeat:true,bubbles:true,cancelable:true});
    first.dispatchEvent(repeated);
    expect(repeated.defaultPrevented).toBe(true);
    await act(async()=>{
      first.dispatchEvent(new MouseEvent('click',{detail:0,bubbles:true}));
      first.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}));
    });
    expect(choose.mock.calls).toEqual([[brace]]);
    await act(async()=>root.render(<FurnaceEmergencyStoryCard view={{...view,options:[retreat]}} sceneScope="B" onChoose={choose}/>));
    await act(async()=>{host.querySelector('button')!.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}));});
    expect(choose.mock.calls).toEqual([[brace],[retreat]]);
  } finally {
    await act(async()=>root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
