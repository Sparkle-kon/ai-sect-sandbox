import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DanxiaShortageReceipts } from '../src/components/DanxiaShortageReceipts';
import type { projectDanxiaShortages } from '../src/engine/danxiaShortageEngine';

type Receipt=ReturnType<typeof projectDanxiaShortages>[number];
const row={
  id:'private-crisis-receipt',siteName:'丹霞静养院',openedTick:27,discipleName:'苏栖月',patientName:'问药人',settlementName:'青石村', householdBranch:'first',
  requiredLeaves:2,availableLeaves:0,status:'open',
} satisfies Receipt;
const render=(...rows:Receipt[])=>renderToStaticMarkup(<DanxiaShortageReceipts rows={rows}/>);

describe('private recorded 丹荒之年 shortage in the existing clinic fold',()=>{
  it('shows independently authorized named people and dated opening stock without implying current supply or action',()=>{
    const html=render(row);
    expect(html).toContain('丹霞弟子 苏栖月');
    expect(html).toContain('求药人 问药人（坊籍留据：青石村 · 家户甲）');
    expect(html).toContain('立册第 27 轮');
    expect(html).toContain('待履照护共需翡翠灵叶 2 株，当时实有 0 株');
    expect(html).toContain('开立数字不是当前库存');
    expect(html).toContain('不是已用药、痊愈或必须送药的凭据');
    expect(html).not.toMatch(/private-|<button|<details|已接受救治/);
  });
  it('distinguishes a verified replenishment from a closed obligation without assuming treatment or good stock',()=>{
    const recovered=render({...row,status:'closed',resolution:{tick:29,reason:'adequate_stock',requiredLeaves:2,availableLeaves:3}});
    expect(recovered).toContain('结案第 29 轮：需 2 株，实有 3 株。已备足药料');
    expect(recovered).toContain('不是已用药、痊愈');
    const ended=render({...row,status:'closed',resolution:{tick:29,reason:'commitment_ended',requiredLeaves:0,availableLeaves:0}});
    expect(ended).toContain('所据的救治约定已结束，不能据此认定药已备齐');
    expect(ended).not.toContain('已备足药料');
  });
  it('has no independent fold or name when the scoped projector supplied no record',()=>{
    expect(render()).toBe('');
  });
});
