// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {BanquetSeatStoryCard} from '../src/components/BanquetSeatStoryCard';
import {TournamentBanquetCard} from '../src/components/TournamentBanquetCard';
import type {BanquetSeatOption,BanquetSeatView} from '../src/engine/banquetSeats';
const base={action:'BANQUET_SEAT',targetBanquetSeatId:'private-seat'} as const;
const attend:BanquetSeatOption={...base,banquetSeatMove:'attend'};
const decline:BanquetSeatOption={...base,banquetSeatMove:'decline'};
const late:BanquetSeatOption={...base,banquetSeatMove:'late'};
const view:BanquetSeatView={id:'private-row',hallEventId:'private-hall',siteId:'private-venue',siteName:'试剑台边',invitedTick:14,tableLine:'灯下留了两席，眼下还未开桌。',options:[attend,decline]};

it('does not treat an invitation as attendance or silence as refusal',()=>{
  const html=renderToStaticMarkup(<BanquetSeatStoryCard view={view} onChoose={()=>true}/>);
  expect(html).toContain('受邀本身不算来过');
  expect(html).toContain('旁人不作答，不算辞席');
  expect(html.match(/min-h-\[44px\]/g)).toHaveLength(2);
  expect(html).not.toMatch(/private-|正式开席时，实到|迟来一见/);
});

it('keeps actual table count (including zero) apart from a physically late receipt',()=>{
  expect(renderToStaticMarkup(<BanquetSeatStoryCard view={{...view,options:[]}}/>)).toBe('');
  const html=renderToStaticMarkup(<BanquetSeatStoryCard view={{...view,presentCount:0,options:[late]}} onChoose={()=>true}/>);
  expect(html).toContain('正式开席时，实到 0 位');
  expect(html).toContain('不补坐旧席');
  const arrived=renderToStaticMarkup(<BanquetSeatStoryCard view={{...view,presentCount:1,options:[],
    receipt:{title:'席后到场',description:'人已到，却未赶上正席。',tick:16}}}/>);
  expect(arrived).toContain('正式开席时，实到 1 位');
  expect(arrived).toContain('人已到，却未赶上正席');
  expect(arrived).not.toMatch(/<button|private-/);
});

it('allows at most one exact live action per scope with native keyboard and pointer activation',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('main');document.body.append(host);
  const root=createRoot(host),choose=vi.fn((_option:BanquetSeatOption)=>true);
  try{
    await act(async()=>root.render(<BanquetSeatStoryCard view={view} sceneScope="A" onChoose={choose}/>));
    const btn=host.querySelector('button')!;
    const repeat=new KeyboardEvent('keydown',{key:' ',repeat:true,bubbles:true,cancelable:true});
    btn.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(true);
    await act(async()=>{
      btn.dispatchEvent(new MouseEvent('click',{detail:0,bubbles:true}));
      btn.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}));
    });
    expect(choose.mock.calls).toEqual([[attend]]);
  }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it('can attach exact seat controls inside the one original public banquet card',()=>{
  const html=renderToStaticMarkup(<TournamentBanquetCard view={{hall:{id:view.hallEventId,tick:14,siteName:view.siteName,
    speech:'原来的厅前公言'},thought:{text:'我自己的想法',phase:'invited'},after:{tick:16,text:'后来实遇',
    otherName:'吕望',phase:'later_meeting'}}} seating={<BanquetSeatStoryCard embedded view={view} onChoose={()=>true}/>}/>);
  expect(html.match(/<article\b/g)).toHaveLength(1);
  expect(html).toContain('原来的厅前公言');
  expect(html).toContain('受邀时所想');
  expect(html).toContain('后来相逢');
  expect(html).toContain('赴席');
  expect(html).not.toMatch(/<h3[^>]*>席前与席后|席间心绪|散席后<\/button>/);
});
