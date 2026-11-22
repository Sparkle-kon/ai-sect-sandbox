import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {AscensionPanel} from '../src/components/AscensionPanel';
import {BiographyScroll} from '../src/components/HallOfImmortalsModal';
import type {AscensionView} from '../src/engine/ascensionEngine';
import type {AscensionTrial} from '../src/types/ascension';

const empty:AscensionView={actorId:'own-body',options:[]};
const starter:AscensionTrial={id:'hidden-trial',actorId:'own-body',siteId:'origin-site',sectIdBefore:'original-sect',
  startedTick:11,startedYear:1,startedMonth:11,openingQiPaid:15,phase:'warning',waves:[]};
const wave:AscensionTrial['waves'][number]={wave:1,tick:12,year:1,month:12,stance:'guard',
  eventId:'internal-actual-wave',maxHp:125,beforeHp:125,afterHp:101,qiBefore:42,qiPaid:8};

describe('ascension ending read',()=>{
  it('only offers a valid real starting choice in the cultivation inspector',()=>{
    expect(renderToStaticMarkup(<AscensionPanel view={empty}/>)).toBe('');
    const active:AscensionView={...empty,options:[{action:'ASCENSION',ascensionMove:'start'}]};
    expect(renderToStaticMarkup(<AscensionPanel view={active}/>)).toBe('');
    const guide=vi.fn(async()=>true);
    const html=renderToStaticMarkup(<AscensionPanel view={active} controls={{guide}}/>);
    expect(html).toContain('引下飞升天劫（耗 15 真气）');
    expect(html).not.toContain('仙门接引');
    expect(guide).not.toHaveBeenCalled();
  });
  it('shows only actual strikes and paid damage, without opening gate or offering sound during pending waves',()=>{
    const html=renderToStaticMarkup(<AscensionPanel view={{...empty,trial:{...starter,phase:'lightning',waves:[wave]}}}
      onListen={vi.fn(async()=>true)}/>);
    expect(html).toContain('已历 1 / 3 道雷');
    expect(html).toContain('气血 125 → 101，实损 24 · 实耗 8 真气');
    expect(html).not.toContain('听一段');
    expect(html).not.toContain('internal-actual-wave');
  });
  it('shows actual success with optional click-only audio, never makes a death biography for it',()=>{
    const listen=vi.fn(async()=>true);
    const trial:AscensionTrial={...starter,phase:'succeeded',waves:[wave,
      {...wave,wave:2,tick:13,beforeHp:101,afterHp:71},{...wave,wave:3,tick:14,beforeHp:71,afterHp:31}],
      terminal:{status:'succeeded',tick:14,year:2,month:2,eventId:'true-ending'}};
    const html=renderToStaticMarkup(<AscensionPanel view={{...empty,trial}} onListen={listen}/>);
    expect(html).toContain('此人渡尽雷关，随仙门接引而去');
    expect(html).toContain('听一段接引仙乐');
    expect(listen).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(<AscensionPanel view={{...empty,trial}}/>)).not.toContain('听一段');
    const scroll=renderToStaticMarkup(<BiographyScroll row={{actorId:'own-body',name:'青梧',realm:'渡劫',
      title:'天门客',ascensionTick:14,scenes:[{kind:'ending',tick:14,year:2,month:2,title:'仙门接引',text:'青梧随仙门而去。'}]}}
      onReturn={vi.fn()}/>);
    expect(scroll).toContain('历代列传 · 飞升');
    expect(scroll).not.toContain('陨落');
    expect(scroll).toContain('data-immortal-seal="open"');
  });
});
