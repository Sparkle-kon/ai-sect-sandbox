// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {LastRosterStoryCard} from '../src/components/LastRosterStoryCard';
import type {LastRosterOption,LastRosterView} from '../src/engine/lastRoster';
const base={action:'LAST_ROSTER',targetLastRosterId:'private-change'} as const;
const gate:LastRosterOption={...base,lastRosterMove:'new_gate',targetLocationId:'private-new-site'};
const home:LastRosterOption={...base,lastRosterMove:'home',targetLocationId:'private-village'};
const stay:LastRosterOption={...base,lastRosterMove:'stay'};
const view:LastRosterView={id:'private-change',siteId:'private-old-site',siteName:'试剑峰旧址',
  closedSectName:'问霜宗',closedTick:36,options:[gate,home,stay]};

it('does not confuse original sect closure with transfer of title, registration or choice for others',()=>{
  const html=renderToStaticMarkup(<LastRosterStoryCard view={view} onChoose={()=>true}/>);
  expect(html).toContain('问霜宗已散去');
  expect(html).toContain('不就此入宗，更不承旧职');
  expect(html).toContain('不因此改动户籍');
  expect(html).toContain('不续旧宗');
  expect(html.match(/min-h-\[44px\]/g)).toHaveLength(3);
  expect(html).not.toMatch(/private-|全部团圆|已继任/);
});

it('only presents actual personal aftermath, not a mandatory reminder for unrelated or old frames',()=>{
  expect(renderToStaticMarkup(<LastRosterStoryCard view={{...view,options:[]}}/>)).toBe('');
  const html=renderToStaticMarkup(<LastRosterStoryCard view={{...view,options:[],
    receipt:{title:'已到新门前',description:'此人实到门前，未入门。',tick:37}}}/>);
  expect(html).toContain('此人实到门前，未入门');
  expect(html).not.toMatch(/<button|已散去|已获职位/);
});

it('allows at most one exact native action during a single live scope',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host),choose=vi.fn((_option:LastRosterOption)=>true);
  try{
    await act(async()=>root.render(<LastRosterStoryCard view={view} sceneScope="A" onChoose={choose}/>));
    const btn=host.querySelector('button')!;
    const repeat=new KeyboardEvent('keydown',{key:' ',repeat:true,bubbles:true,cancelable:true});
    btn.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(true);
    await act(async()=>{
      btn.dispatchEvent(new MouseEvent('click',{detail:0,bubbles:true}));
      btn.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}));
    });
    expect(choose.mock.calls).toEqual([[gate]]);
  }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
