import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {RegionalSimulationOptions,RegionalSimulationPanel,RegionalSimulationSummary,type RegionalSimulationControls} from '../src/components/RegionalSimulationPanel';

const options=(override:Partial<RegionalSimulationControls>={}):RegionalSimulationControls=>({
  scopeKey:'hidden-branch-scope',revisionKey:{},availableSites:[{siteId:'private-focus-place',name:'白石村',region:'west'}],
  mode:{enabled:false},onChange:vi.fn(()=>true),...override,
});

describe('quiet opted-in regional simulation control',()=>{
  it('is collapsed and neither opens nor opts in from its mount',()=>{
    const control=options();
    const markup=renderToStaticMarkup(<RegionalSimulationPanel {...control}/>);
    expect(markup).toMatch(/^<details class=/);
    expect(markup).toContain('远地年算（可选试验）');
    expect(markup).not.toMatch(/<details[^>]* open|<select|<button|hidden-branch-scope/);
    expect(control.onChange).not.toHaveBeenCalled();
  });

  it('requires an explicit named real focus with ordinal choice, default off and no pretend opt-out',()=>{
    const control=options();
    const html=renderToStaticMarkup(<RegionalSimulationOptions {...control}/>);
    expect(html).toContain('本分支未启用远地年算，仍按原规则逐月推演');
    expect(html).toContain('value="" selected="">请选择地点');
    expect(html).toContain('value="0">白石村 · 西境');
    expect(html).toContain('核对启用年算');
    expect(html).not.toMatch(/private-focus-place|确认应用到此分支|核对切回逐月/);
    const busy=renderToStaticMarkup(<RegionalSimulationOptions {...control} disabledReason="当前处于历史只读视图。" />);
    expect(busy).toContain('当前处于历史只读视图');
    expect(busy).toMatch(/<select[^>]+disabled/);
    expect(control.onChange).not.toHaveBeenCalled();
  });

  it('separates stored focus and lawful current area, actual annual totals and bounded measured comparison',()=>{
    const markup=renderToStaticMarkup(<RegionalSimulationSummary mode={{enabled:true,version:1,registeredRegions:3,
      focus:{siteId:'private-focus-place',name:'北市',region:'west'},effective:{region:'east',avatarDriven:true},
      annual:[{year:1002,tick:24,regionId:'center',actorMonths:19,actors:3,qiAdded:12,hpAdded:4}],
    }} comparison={{seed:2031,profileLabel:'原始预设',months:24,metrics:[
      {label:'在世修士',monthly:42,regional:42,unit:' 人'},{label:'玄土根',monthly:71,regional:67,unit:' 株'},
    ]}}/>);
    expect(markup).toContain('关注点：北市（西境）');
    expect(markup).toContain('实际逐月关注区：东境（当前附身者所在地域优先）');
    expect(markup).toContain('实结 3 人、19 人月');
    expect(markup).toContain('同一种子 2031');
    expect(markup).toContain('此样本数值一致');
    expect(markup).toContain('此样本相差 -4 株（年算减参照）');
    expect(markup).toContain('试验对照，不是未来保证');
    expect(markup).not.toContain('private-focus-place');
  });
});
