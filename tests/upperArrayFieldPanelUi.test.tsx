import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {UpperArrayFieldPanel,UpperArrayFieldWellPanel,UpperArrayFieldCarrierRead,arrayFieldOrderKey,upperArrayFieldScopedOrders,
  type UpperArrayFieldOrder,type UpperArrayFieldControls} from '../src/components/UpperArrayFieldPanel';
import {reviewedArrayFieldOrder} from '../src/components/UpperArrayFieldOrders';
import {UPPER_ARRAY_FIELD_CHART as chartId,UPPER_ARRAY_FIELD_REGION as regionId,upperArrayFieldSite}
  from '../src/engine/upperArrayFieldTerms';
import type {UpperArrayFieldMovementView} from '../src/engine/upperArrayFieldMovementEngine';
import type {UpperArrayFieldLocalView} from '../src/engine/upperArrayFieldLocalTerms';
import type {UpperArrayFieldTradeView} from '../src/engine/upperArrayFieldTradeEngine';

const enter={action:'UPPER_ARRAY_FIELD',upperArrayFieldMove:'enter',targetUpperArrayFieldSiteId:'array-field-gate'} as const;
const step={action:'UPPER_ARRAY_FIELD',upperArrayFieldMove:'travel',targetUpperArrayFieldSiteId:'array-field-path'} as const;
const craft={action:'UPPER_ARRAY_FIELD_LOCAL',upperArrayFieldLocalMove:'condense',targetUpperArrayFieldSiteId:'array-field-source'} as const;
const proposal={action:'UPPER_ARRAY_FIELD_TRADE',upperArrayFieldTradeMove:'propose',targetCultivatorId:'private-real-id'} as const;
const settle={action:'UPPER_ARRAY_FIELD_TRADE',upperArrayFieldTradeMove:'settle',targetUpperArrayFieldTradeId:'private-agreement-id'} as const;
const t=23,revision={};
const controls=(choices:readonly UpperArrayFieldOrder[]):UpperArrayFieldControls=>({scopeKey:'actor:source',revisionKey:revision,choices,onQueue:vi.fn(()=>true)});
const council:UpperArrayFieldMovementView={scope:'council',chartId,regionId,options:[enter],visibleSites:[]};
const source=upperArrayFieldSite('array-field-source')!,path=upperArrayFieldSite('array-field-path')!,remote=upperArrayFieldSite('array-field-gate')!;
const field:UpperArrayFieldMovementView={scope:'field',chartId,regionId,site:source,options:[step],visibleSites:[source,path,remote],
  visit:{enteredTick:15,paidStones:4},residence:{id:'private-home-id',actorId:'actor',visitId:'private-visit-id',
    homeSiteId:'array-field-home',settledTick:18,paidStones:4,paidRoots:1}};
const local:UpperArrayFieldLocalView={siteId:'array-field-source',resident:true,stock:12,options:[craft]};
const base:UpperArrayFieldTradeView={id:'private-agreement-id',yourRole:'buyer',status:'carrying',offeredTick:10,acceptedTick:11};

it('does not give Council an untrodden chart, but lists the verified next month gate and no local inventory',()=>{
  const html=renderToStaticMarkup(<UpperArrayFieldPanel nowTick={t} movement={council} local={local} trades={[base]}
    controls={controls([enter,craft,proposal])}/>);
  expect(html).toContain('向议庭问阵原');
  expect(html).toContain('从议庭步入阵原');
  expect(html).not.toContain('<canvas');
  expect(html).not.toContain('本人此处可用阵片');
  expect(html).not.toContain('北井互印货约');
  expect(renderToStaticMarkup(<UpperArrayFieldPanel nowTick={t} movement={{...council,blocked:'fee'}} controls={controls([enter])}/>))
    .not.toContain('从议庭步入阵原');
});
it('uses one exact local chart and ignores forged visible remote tiles, residence and stock',()=>{
  const html=renderToStaticMarkup(<UpperArrayFieldPanel nowTick={t} movement={field} local={local} controls={controls([step,craft,proposal])}/>);
  expect(html.match(/<canvas/g)).toHaveLength(1);
  expect(html).toContain('凝纹墩 · 第 1 行，第 2 列');
  expect(html).toContain('本人此处可用阵片：12 枚');
  expect(html).toContain('在墩前凝取阵片');
  expect(html).not.toContain('阵原门');
  expect(html).not.toContain('private-home-id');
  const visitor=renderToStaticMarkup(<UpperArrayFieldPanel nowTick={t} movement={{...field,residence:undefined}} local={local} controls={controls([craft])}/>);
  expect(visitor).not.toContain('12 枚');
  expect(visitor).not.toContain('在墩前凝取阵片');
  expect(upperArrayFieldScopedOrders({nowTick:t,movement:field,local:{...local,siteId:'array-field-practice'},controls:controls([craft])})).toEqual([]);
});
it('stale staged orders, ambiguous duplicates and inexact geography do not authorize a queue',()=>{
  expect(reviewedArrayFieldOrder({order:craft,revision},{},[craft],arrayFieldOrderKey)).toBeUndefined();
  expect(reviewedArrayFieldOrder({order:craft,revision},revision,[craft,craft],arrayFieldOrderKey)).toBeUndefined();
  expect(upperArrayFieldScopedOrders({nowTick:t,movement:field,local,controls:controls([craft,craft])})).toEqual([]);
  const forged={...field,site:{...source,col:0 as const}};
  expect(upperArrayFieldScopedOrders({nowTick:t,movement:forged,local,controls:controls([craft])})).toEqual([]);
});
it('limits old-well binding to local verified scope, real named counterpart, and actual arrived cargo',()=>{
  const props={nowTick:t,controls:controls([proposal,settle]),trades:[base],tradeCandidates:{'private-real-id':'韩立风'}};
  expect(renderToStaticMarkup(<UpperArrayFieldWellPanel {...props} atWell={false}/>)).toBe('');
  const localOffer=renderToStaticMarkup(<UpperArrayFieldWellPanel {...props} atWell/>);
  expect(localOffer).toContain('与韩立风提互印货约');
  expect(localOffer).not.toContain('private-real-id');
  expect(localOffer).not.toContain('在北井交割阵片和玄土根');
  const arrived:UpperArrayFieldTradeView={...base,cargo:{phase:'at_well',quantity:2}};
  const deliver=renderToStaticMarkup(<UpperArrayFieldWellPanel {...props} controls={controls([settle])} trades={[arrived]} atWell/>);
  expect(deliver).toContain('在北井交割阵片和玄土根');
  expect(deliver).toContain('还没交手');
  expect(deliver).not.toContain('完成交割');
});
it('only seller on the actual old passage can read a genuine blocked freight annotation',()=>{
  const cargo={quantity:2,phase:'in_transit',atClosedThroat:true} as const;
  const held:UpperArrayFieldTradeView={...base,yourRole:'seller',cargo};
  expect(renderToStaticMarkup(<UpperArrayFieldCarrierRead atOldPassage={false} trades={[held]}/>)).toBe('');
  expect(renderToStaticMarkup(<UpperArrayFieldCarrierRead atOldPassage trades={[{...base,cargo}]}/>)).toBe('');
  const shown=renderToStaticMarkup(<UpperArrayFieldCarrierRead atOldPassage trades={[held]}/>);
  expect(shown).toContain('这一步阶口未开');
  expect(shown).not.toContain('完成交割');
});
