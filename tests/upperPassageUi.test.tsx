import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {ColdWaterVeinPanel} from '../src/components/ColdWaterVeinPanel';
import {UpperPassagePanel,visibleUpperPassageGraph,reviewedUpperPassage,type UpperPassageControls,type UpperPassageHostControls} from '../src/components/UpperPassagePanel';
import type {UpperPassageOption,UpperPassageView} from '../src/engine/upperPassageEngine';

const op=(upperPassageMove:UpperPassageOption['upperPassageMove'],targetUpperPassageNodeId:UpperPassageOption['targetUpperPassageNodeId']):UpperPassageOption=>
  ({action:'UPPER_PASSAGE',upperPassageMove,targetUpperPassageNodeId});
const enter=op('enter','realm-passage-lower-step'), advanceUp=op('advance','realm-upper-gate'), turn=op('turnback','realm-passage-lower-step');
const revision={};
const controls:UpperPassageControls={scopeKey:'actual',revisionKey:revision,choices:[enter,advanceUp,turn],onQueue:vi.fn(()=>true)};
const reading:NonNullable<UpperPassageView['reading']>={tick:16,openingId:'water-gate-8',wellProjectId:'village-work-1',
  veinId:'north-cold-water',siteId:'loc-vein-north',loss:{plotId:'seed-plot-1',sampleTick:10,fieldDeficit:3,harvestedTick:11,yield:1}};

describe('physical upper-plane view and lawful next move',()=>{
  it('opens no other plane graph at the lower well, and remains inside the usual fold',()=>{
    expect(visibleUpperPassageGraph('loc-vein-north')).toEqual([]);
    expect(renderToStaticMarkup(<ColdWaterVeinPanel/>)).toBe('');
    const text=renderToStaticMarkup(<ColdWaterVeinPanel><UpperPassagePanel view={{nodeId:'loc-vein-north',options:[enter],reading}}
      controls={controls}/></ColdWaterVeinPanel>);
    expect(text).toContain('寒玉井边');expect(text).toContain('踏入下界门槛');expect(text).toContain('实际踏入才付通行的 8 灵石');
    expect(text).not.toMatch(/<details open=|上界观阵庭|上界议事廊|本界眼前的留存|阵录确有旧田|向前走一步|沿来路折返/);
    expect(controls.onQueue).not.toHaveBeenCalled();
  });
  it('distinguishes a real threshold from either plane, blocked throat does not hide another legal movement',()=>{
    expect(visibleUpperPassageGraph('realm-passage-upper-step')).toEqual(['realm-passage-lower-step','realm-passage-upper-step']);
    const text=renderToStaticMarkup(<UpperPassagePanel view={{nodeId:'realm-passage-upper-step',direction:'inbound',options:[turn],
      blocked:'closed',reading,upperReserve:24,entry:{enteredTick:9,paidStones:8}}} controls={controls}/>);
    expect(text).toContain('界隙脚下');expect(text).toContain('界隙石阶');expect(text).toContain('关口眼下不能穿过');
    expect(text).toContain('沿来路折返');expect(text).toContain('aria-current="location"');expect(text).toContain('第 9 轮实付 8 灵石');
    expect(text).not.toMatch(/上界观阵庭|上界议事廊|本界眼前的留存|实收凭据|踏入下界门槛|向前走一步/);
  });
  it('upper graph only lists actual upper nodes, and old proven loss and payment stay separate',()=>{
    const request={nodeId:'realm-upper-council',direction:'outbound',options:[],reading,upperReserve:4,
      petition:{tick:18,paidStones:4,outcome:'lower_relief',readingTick:16}} satisfies UpperPassageView;
    expect(visibleUpperPassageGraph('realm-upper-council')).toEqual(['realm-upper-gate','realm-upper-array','realm-upper-council']);
    const text=renderToStaticMarkup(<UpperPassagePanel view={request}/>);
    expect(text).toContain('上界观阵庭');expect(text).toContain('阵纹指回下界寒玉原井');expect(text).toContain('不是下界当前水位');
    expect(text).toContain('第 11 轮实收 1 份');expect(text).toContain('第 18 轮实付 4 灵石');
    expect(text).toContain('没有向下界发钱或退回旧通行费');expect(text).not.toContain('下界门槛');
    expect(renderToStaticMarkup(<UpperPassagePanel view={{...request,reading:{...reading,loss:undefined},petition:undefined}}/>))
      .toContain('不能从缺卷判断下界没有过损失');
  });
  it('an insufficient fee shows only the relevant route or upper action, and pending does not say it happened',()=>{
    const poor=renderToStaticMarkup(<UpperPassagePanel view={{nodeId:'loc-vein-north',options:[],blocked:'fee'}} controls={controls}/>);
    expect(poor).toContain('通行的 8 灵石，没有成交');expect(poor).not.toContain('准备下一步');
    const distant=renderToStaticMarkup(<UpperPassagePanel view={{nodeId:'realm-upper-council',options:[],blocked:'fee',reading}}
      controls={{...controls,pending:'petition'}}/>);
    expect(distant).toContain('议请的 4 灵石，没有成交');
    expect(distant).toContain('尚未过界、读阵或付款');
    expect(distant).not.toContain('本人的议请原账');
  });
  it('does not retain a reviewed order across frame, a different edge or conflicting alternatives',()=>{
    const staged={choice:enter,revision};
    expect(reviewedUpperPassage(staged,revision,controls.choices)).toBe(enter);
    expect(reviewedUpperPassage(staged,{},controls.choices)).toBeUndefined();
    expect(reviewedUpperPassage(staged,revision,[{...enter,targetUpperPassageNodeId:'realm-upper-gate'}])).toBeUndefined();
    expect(reviewedUpperPassage(staged,revision,[enter,{...enter}])).toBeUndefined();
  });
  it('only offers dedicated realm re-entry to a supplied lawful host, and never spends by rendering',()=>{
    const host:UpperPassageHostControls={scopeKey:'realm-current',revisionKey:revision,actorName:'闻春岚',essenceCost:24,onConfirm:vi.fn(()=>true)};
    const downstairs=renderToStaticMarkup(<UpperPassagePanel view={{nodeId:'loc-vein-north',options:[enter]}} host={host}/>);
    expect(downstairs).not.toContain('核对重新入身');
    const realm=renderToStaticMarkup(<UpperPassagePanel view={{nodeId:'realm-passage-upper-step',direction:'inbound',options:[],blocked:'closed'}} host={host}/>);
    expect(realm).toContain('核对重新入身');
    expect(realm).not.toContain('确认入此身');
    expect(host.onConfirm).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(<UpperPassagePanel view={{nodeId:'realm-upper-array',options:[]}}/>)).not.toContain('核对重新入身');
  });
});
