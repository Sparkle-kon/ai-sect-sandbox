import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {RegionalSimulationSummary,type RegionalRecentOpenings,type RegionalPromotionNotice} from '../src/components/RegionalSimulationPanel';

const crossing:RegionalPromotionNotice={kind:'escort_crossed',observedTick:72,startsTick:73,throughTick:75,
  fromRegionId:'east',toRegionId:'center',active:false};
const status=(clock:RegionalRecentOpenings['clock'],rows:RegionalRecentOpenings['rows'],enabled=true)=>
  renderToStaticMarkup(<RegionalSimulationSummary mode={{enabled,recentOpenings:{clock,rows}}}/>);
const late={tick:72,year:1001,month:12};

describe('view-scoped regional opening receipt',()=>{
  it('shows nothing for off mode or no authorized data (not a claim nothing happened)',()=>{
    expect(status(late,[crossing],false)).not.toMatch(/地域近事|商队实际越境/);
    expect(status(late,[])).not.toMatch(/地域近事|本地没有事情发生/);
  });

  it('keeps actual arrival and full monthly phase separate across the calendar boundary',()=>{
    const html=status(late,[crossing]);
    expect(html).toContain('1001 年 12 月 · 中州 · 护送中的商队实际越境');
    expect(html).toContain('自 1002 年 1 月 起展开当地逐月行动；接境月不会重跑');
    expect(html).toContain('原有在途或到期义务仍走原账');
    expect(html).not.toMatch(/东境|east|escort_crossed|按原月规运行|<button|<select/);
  });

  it('shows an actually open monthly window and then only its finished status; coalesces a region',()=>{
    const next={tick:73,year:1002,month:1};
    const early:RegionalPromotionNotice={kind:'courier_crossed',observedTick:73,startsTick:73,throughTick:75,
      fromRegionId:'west',toRegionId:'center',active:true};
    const html=status(next,[{...crossing,active:true},early,{...crossing,observedTick:74,toRegionId:'east'}]);
    expect(html).toContain('信使实际越境');
    expect(html).toContain('当地按原月规运行（1002 年 1 月 至 1002 年 3 月）');
    expect(html).not.toMatch(/商队实际越境|东境|西境|窗口已结束/);
    const finished=status({tick:76,year:1002,month:4},[crossing]);
    expect(finished).toContain('本次逐月展开截至 1002 年 3 月，窗口已结束');
    expect(finished).not.toContain('已经结清');
  });
});
