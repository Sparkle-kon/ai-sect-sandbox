import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {WorldPulseBar} from '../src/components/WorldPulseBar';
import type {WorldPulseRisk,WorldPulseView} from '../src/components/worldPulseModel';

const risks:WorldPulseRisk[]=[
  {id:'fate-id-trial',siteId:'hidden-site-a',siteName:'断云峰',kind:'trial',label:'渡劫中'},
  {id:'fate-id-siege',siteId:'hidden-site-b',siteName:'照水镇',kind:'siege',label:'围攻中'},
  {id:'fate-id-clash',siteId:'hidden-site-c',siteName:'西境渡口',kind:'clash',label:'本月交锋'},
  {id:'fate-id-overflow',siteId:'hidden-site-d',siteName:'第四处名字',kind:'trial',label:'渡劫中'},
];
const model:WorldPulseView={season:'冬',weather:{kind:'霜息',siteName:'断云峰',intensity:.61},
  righteous:{count:2,mean:42.2},demonic:{count:1,mean:-18},champion:{name:'叶连翘',realm:'筑基三层',power:8642},
  coverage:'visible',risks,additionalRisks:3};
describe('compact realm pulse',()=>{
  it('renders actual season, local weather, bounded signed indicators and scoped rank',()=>{
    const html=renderToStaticMarkup(<WorldPulseBar view={model} onFocusAlert={vi.fn()}/>);
    expect(html).toContain('天地气运');
    expect(html).toContain('冬季');
    expect(html).toContain('断云峰 · 霜息 61%');
    expect(html).toContain('正魔气运均值');
    expect(html).toMatch(/<meter min="-100" max="100"[^>]+value="42.2"/);
    expect(html).toMatch(/<meter min="-100" max="100"[^>]+value="-18"/);
    expect(html).toContain('+42.2');
    expect(html).toContain('所见战力首位');
    expect(html).toContain('叶连翘');
    expect(html).not.toContain('天下第一人');
  });
  it('renders at most three distinct permitted readable alert buttons and no raw IDs',()=>{
    const onFocusAlert=vi.fn();
    const html=renderToStaticMarkup(<WorldPulseBar view={model} onFocusAlert={onFocusAlert}/>);
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).toContain('在地图定位：断云峰 · 渡劫中');
    expect(html).toContain('在地图定位：照水镇 · 围攻中');
    expect(html).toContain('西境渡口 · 本月交锋');
    expect(html).toContain('另有 4 条记录');
    expect(html).toContain('min-h-11');
    expect(html).toContain('motion-safe:animate-pulse');
    for(const text of ['第四处名字','hidden-site-','fate-id-'])expect(html).not.toContain(text);
    expect(onFocusAlert).not.toHaveBeenCalled();
  });
  it('shows historical facts without a map action when focus is blocked',()=>{
    const html=renderToStaticMarkup(<WorldPulseBar view={model} historical canFocus={false} onFocusAlert={vi.fn()}/>);
    expect(html).toContain('历史一帧');
    expect(html).toContain('西境渡口 · 本月交锋');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('animate-pulse');
  });
  it('keeps empty coverage and zero-side data honest and clamps out-of-bound display values',()=>{
    const view:WorldPulseView={...model,coverage:'world',champion:undefined,weather:undefined,
      risks:[],additionalRisks:0,righteous:{mean:99,count:0},demonic:{mean:-105,count:2}};
    const html=renderToStaticMarkup(<WorldPulseBar view={view} onFocusAlert={vi.fn()}/>);
    expect(html).toContain('天下第一人');
    expect(html).toContain('暂无可辨');
    expect(html).toContain('当前范围未见高危');
    expect(html).toContain('暂无');
    expect(html.match(/<meter/g)).toHaveLength(1);
    expect(html).toContain('value="-100"');
    expect(html).not.toContain('value="99"');
    expect(html).not.toContain('NaN');
  });
});
