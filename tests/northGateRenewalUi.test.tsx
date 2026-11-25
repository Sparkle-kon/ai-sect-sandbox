import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {NorthGateRenewalPanel,reviewedNorthGateRenewalOrder} from '../src/components/NorthGateRenewalPanel';
import type {NorthGateRenewalOption,NorthGateRenewalView} from '../src/engine/northGateRenewalEngine';

const id='north-gate-36034';
const option=(move:NorthGateRenewalOption['northGateRenewalMove'],target=id):NorthGateRenewalOption=>
  ({action:'NORTH_GATE_RENEWAL',northGateRenewalMove:move,targetNorthGateRenewalId:target});
const view:NorthGateRenewalView={id,openedTick:36034,expiresTick:36040,scope:'lower',status:'hearing',
  options:[option('reuse'),option('sect')],ownEndorsed:false,hasEndorsement:false};
const world={year:4003,month:10};
const panel=(props:Pick<Parameters<typeof NorthGateRenewalPanel>[0],'controls'>={},hearing=view)=>
  renderToStaticMarkup(<NorthGateRenewalPanel {...props} view={hearing} nowTick={36034} now={world}/>);

describe('native gate hearing read and order',()=>{
  it('renders a quiet read-only dated local fold without giving another actor permission',()=>{
    const html=panel();
    expect(html).toContain('仙历 4004 年 4 月');
    expect(html).toContain('没有替人落笔的权柄');
    expect(html).not.toContain('<button');
    expect(html).not.toContain(id);
  });
  it('shows only present caller orders from the exact next-frame menu, not projection suggestions',()=>{
    const onQueue=vi.fn();
    const html=panel({controls:{scopeKey:'north:actor',revisionKey:world,
      choices:[option('endorse'),option('accord','different-hearing')],onQueue}});
    expect(html).toContain('由乡里具押');
    expect(html).not.toContain('循旧阵开门');
    expect(html).not.toContain('合签开门');
    expect(html).not.toContain('记作下月打算');
    expect(onQueue).not.toHaveBeenCalled();
  });
  it('separates an endorsement or payment intent from actual signatures and debits',()=>{
    const onQueue=vi.fn();
    const html=panel({controls:{scopeKey:'north:actor',revisionKey:world,
      choices:[option('sect')],pending:option('sect'),onQueue}}, {...view,hasEndorsement:true,ownEndorsed:true});
    expect(html).toContain('仍待另一方落笔');
    expect(html).toContain('并未落笔、支账或开门');
    expect(html).not.toContain('<button');
    expect(onQueue).not.toHaveBeenCalled();
    const failed=panel({}, {...view,status:'failed',outcome:{kind:'failed',closedTick:36040}});
    expect(failed).toContain('议卷到期，未能开门');
    expect(failed).not.toContain('仍待另一方落笔');
  });
  it('omits ambiguous buttons and never treats an order for a different hearing as pending',()=>{
    const use=option('reuse');
    const html=panel({controls:{scopeKey:'north:actor',revisionKey:world,
      choices:[use,{...use}],pending:option('accord','other-hearing'),onQueue:vi.fn()}});
    expect(html).toContain('眼下没有可交给下月的文书');
    expect(html).not.toContain('已候下月');
    expect(html).not.toContain('<button');
  });
  it('reports a native ineligibility reason without assigning debt or inventing a route',()=>{
    const html=panel({controls:{scopeKey:'north:actor',revisionKey:world,choices:[],onQueue:vi.fn()}},
      {...view,blocked:'funds'});
    expect(html).toContain('账上现有灵石不够开门');
    expect(html).not.toContain('<button');
  });
  it('labels actual settlement and shows only immutable proof to the upper viewer',()=>{
    const outcome={kind:'reopened',stance:'sect',openedTick:36035,openingId:'real-opening',paidStones:64,
      borrowedUnits:0,granaryRoots:0} as const;
    const controls={scopeKey:'office',revisionKey:world,choices:[option('reuse')],onQueue:vi.fn()};
    const local=panel({controls},{...view,status:'reopened',outcome});
    expect(local).toContain('宗库实付 64 灵石');
    expect(local).toContain('未借下界水脉灵压');
    expect(local).toContain('门虽开了，仍要亲自走过去');
    const upper=panel({controls},{...view,scope:'upper',status:'reopened',outcome});
    expect(upper).toContain('观阵抄录：再启实账');
    expect(upper).toContain('不能据此断定眼下井水或乡仓');
    expect(upper).not.toContain('<button');
    expect(upper).not.toContain('尚未具押');
    expect(upper).not.toContain('real-opening');
    expect(panel({controls},{...view,scope:'upper'})).toBe('');
    expect(controls.onQueue).not.toHaveBeenCalled();
  });
  it('rejects stale frames, wrong hearings, nonlisted and ambiguous staged orders',()=>{
    const use=option('reuse');
    const review={choice:use,revision:world};
    expect(reviewedNorthGateRenewalOrder(review,world,[use],id)).toEqual(use);
    expect(reviewedNorthGateRenewalOrder(review,{...world},[use],id)).toBeUndefined();
    expect(reviewedNorthGateRenewalOrder(review,world,[use],'different-hearing')).toBeUndefined();
    expect(reviewedNorthGateRenewalOrder(review,world,[option('accord')],id)).toBeUndefined();
    expect(reviewedNorthGateRenewalOrder(review,world,[use,{...use}],id)).toBeUndefined();
  });
});
