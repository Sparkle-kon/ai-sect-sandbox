import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {FrontierPanel} from '../src/components/FrontierPanel';
import {FrontierDrylandPanel,frontierDrylandScopedOrders,reviewedFrontierDrylandOrder,type FrontierDrylandControls} from '../src/components/FrontierDrylandPanel';
import type {FrontierMovementView} from '../src/engine/frontierMovementEngine';
import type {FrontierDrylandLocalOption,FrontierDrylandLocalView} from '../src/engine/frontierDrylandTerms';
import type {FrontierDrylandTradeOption,FrontierDrylandTradeView} from '../src/engine/frontierDrylandTradeEngine';
import {frontierSite} from '../src/engine/frontierTerms';

const revision={current:'branch'};
const west:FrontierMovementView={scope:'anchor',regionId:'western-saltwell',chartId:'chart-western-saltwell',anchorId:'loc-taixu',
  gateId:'frontier-west-gate',options:[],visibleSites:[]};
const westWell={...west,scope:'frontier' as const,site:frontierSite('frontier-west-well'),visibleSites:[frontierSite('frontier-west-well')!]};
const westStore={...westWell,site:frontierSite('frontier-west-warehouse'),visibleSites:[frontierSite('frontier-west-warehouse')!]};
const ridgePasture:FrontierMovementView={scope:'frontier',regionId:'plateau-thunderridge',chartId:'chart-plateau-thunderridge',
  anchorId:'loc-tianji',gateId:'frontier-ridge-gate',site:frontierSite('frontier-ridge-pasture'),options:[],
  visibleSites:[frontierSite('frontier-ridge-pasture')!]};
const market:FrontierMovementView={scope:'anchor',regionId:'south-marsh',chartId:'chart-south-marsh',anchorId:'loc-market',
  gateId:'frontier-south-gate',visibleSites:[],options:[]};
const port:FrontierMovementView={scope:'anchor',regionId:'east-offshore',chartId:'chart-east-offshore',anchorId:'loc-market-east',
  gateId:'frontier-east-gate',visibleSites:[],options:[]};
const water:FrontierDrylandLocalOption={action:'FRONTIER_DRYLAND',frontierDrylandMove:'draw_water',targetFrontierSiteId:'frontier-west-well'};
const root:FrontierDrylandLocalOption={action:'FRONTIER_DRYLAND',frontierDrylandMove:'feed_herd',
  targetFrontierSiteId:'frontier-ridge-pasture',frontierDrylandFeed:'root'};
const salt:FrontierDrylandLocalOption={...root,frontierDrylandFeed:'salt'};
const local:FrontierDrylandLocalView={regionId:'western-saltwell',siteId:'frontier-west-well',resident:true,window:'dry',
  well:{readyTick:12,water:3,capacity:6},stock:{rift_salt:8,stormstone:9},options:[water]};
const herd:FrontierDrylandLocalView={regionId:'plateau-thunderridge',siteId:'frontier-ridge-pasture',resident:true,window:'thunder',
  herd:{count:2,work:1,expiresTick:25},ward:{charges:1,expiresTick:24},options:[root,salt]};
const stage:FrontierDrylandTradeView={id:'exact-chartered-trade',status:'accepted',offeredTick:5,acceptedTick:6,yourSide:'western-saltwell',
  west:{status:'arrived',good:'rift_salt',quantity:2,stepsCompleted:23,pathLength:23,waitedThunder:1}};
const propose:FrontierDrylandTradeOption={action:'FRONTIER_DRYLAND_TRADE',frontierDrylandTradeMove:'propose',targetCultivatorId:'actual-peer'};
const load:FrontierDrylandTradeOption={action:'FRONTIER_DRYLAND_TRADE',frontierDrylandTradeMove:'load',targetFrontierDrylandTradeId:stage.id};
const controls=(choices:FrontierDrylandControls['choices']):FrontierDrylandControls=>({scopeKey:'site:body',revisionKey:revision,choices,onQueue:vi.fn()});

describe('current dryland knowledge and scoped orders',()=>{
  it('opens a single local chart and distinguishes a well under construction from actual shared water',()=>{
    const html=renderToStaticMarkup(<FrontierPanel view={westWell}
      drylandPanel={<FrontierDrylandPanel nowTick={11} movement={westWell} local={local}/>}/>);
    expect(html).toContain('西漠盐井');
    expect(html).toContain('持秤井 · 第 1 行，第 2 列');
    expect(html.match(/<canvas/g)).toHaveLength(1);
    expect(html).toContain('井工已经开，槽未成');
    expect(html).not.toContain('3 / 6');
    expect(html).not.toContain('本地仓实存');
    expect(html).not.toContain('高原雷脊');
    const completed=renderToStaticMarkup(<FrontierDrylandPanel nowTick={12} movement={westWell} local={local}/>);
    expect(completed).toContain('3 / 6 份水');
    expect(completed).toContain('都取同一井槽');
    expect(renderToStaticMarkup(<FrontierDrylandPanel nowTick={12} movement={west} local={local}/>)).toBe('');
  });
  it('shows only actual mainland local live facts while retaining distinct fuel options',()=>{
    const x=controls([water,root,salt]);
    const html=renderToStaticMarkup(<FrontierDrylandPanel nowTick={21} movement={ridgePasture} local={herd} controls={x}/>);
    expect(html).toContain('本地实有小牧群 2 头');
    expect(html).toContain('喂本人玄土根');
    expect(html).toContain('喂已到仓的井盐');
    expect(html).not.toContain('按井绳实汲');
    expect(html).not.toContain('此处可核阵储');
    expect(html).not.toContain('此处共用井槽');
    expect(x.onQueue).not.toHaveBeenCalled();
    expect(reviewedFrontierDrylandOrder({order:root,revision},revision,[root,salt])).toBe(root);
    expect(reviewedFrontierDrylandOrder({order:root,revision},revision,[salt])).toBeUndefined();
    expect(reviewedFrontierDrylandOrder({order:root,revision},{...revision},[root])).toBeUndefined();
    expect(frontierDrylandScopedOrders({nowTick:21,movement:ridgePasture,local:herd,controls:controls([root,{...root},salt])})).toEqual([salt]);
  });
  it('does not announce a pending monthly action as a debit, or backlash as success or tribulation',()=>{
    const tryResult={...local,lastLayer:{result:'backlash' as const,fromStage:5,toStage:5,tick:20}};
    const x={...controls([water]),pending:water};
    const html=renderToStaticMarkup(<FrontierDrylandPanel nowTick={21} movement={westWell} local={tryResult} controls={x}/>);
    expect(html).toContain('已候下月：按井绳实汲');
    expect(html).toContain('还没支料');
    expect(html).toContain('实冲遇反噬，层数仍是 5');
    expect(html).toContain('这次不是渡天劫');
    expect(html).not.toContain('<button');
    expect(x.onQueue).not.toHaveBeenCalled();
  });
  it('arrival is not exchange, and a physical return does not get credit before an actual deposit',()=>{
    const east=renderToStaticMarkup(<FrontierDrylandPanel nowTick={18} movement={port} trades={[stage]}/>);
    expect(east).toBe('');
    const waiting=renderToStaticMarkup(<FrontierDrylandPanel nowTick={18} movement={market} trades={[stage]}/>);
    expect(waiting).toContain('实到对方交接点，仍待交割');
    expect(waiting).not.toContain('已交割入仓');
    expect(waiting).not.toContain('exact-chartered-trade');
    const back=renderToStaticMarkup(<FrontierDrylandPanel nowTick={19} movement={market} trades={[{
      ...stage,status:'returning',west:{...stage.west!,status:'home_wait',stepsCompleted:0}
    }]}/>);
    expect(back).toContain('已到原仓，尚待腾位入账');
    expect(back).not.toContain('已实退入本方仓');
  });
  it('offers named signers only at the actual shared old market and only allows own unladen cargo at the correct warehouse',()=>{
    const x=controls([propose]);
    const ext={nowTick:18,controls:x,tradeCandidates:{'actual-peer':'云青'}};
    expect(renderToStaticMarkup(<FrontierDrylandPanel {...ext} movement={market}/>)).toContain('与云青提盐雷货约');
    expect(renderToStaticMarkup(<FrontierDrylandPanel {...ext} movement={west}/>)).toBe('');
    expect(renderToStaticMarkup(<FrontierDrylandPanel nowTick={18} controls={x} movement={market}/>)).toBe('');
    const warehouse={...local,siteId:'frontier-west-warehouse' as const,options:[]};
    expect(frontierDrylandScopedOrders({nowTick:18,movement:westStore,local:warehouse,trades:[{...stage,west:undefined}],
      controls:controls([load])})).toEqual([load]);
    expect(frontierDrylandScopedOrders({nowTick:18,movement:westStore,local:warehouse,trades:[stage],controls:controls([load])})).toEqual([]);
    expect(frontierDrylandScopedOrders({nowTick:18,movement:westWell,local,trades:[stage],controls:controls([load])})).toEqual([]);
  });
});
