import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {FrontierPanel,frontierScopedOrders,reviewedFrontierOrder,type FrontierControls} from '../src/components/FrontierPanel';
import type {FrontierMovementView,FrontierMovementOption} from '../src/engine/frontierMovementEngine';
import type {FrontierProductionOption,FrontierProductionView} from '../src/engine/frontierProductionTerms';
import type {FrontierTradeOption,FrontierTradeView} from '../src/engine/frontierTradeEngine';
import {frontierSite} from '../src/engine/frontierTerms';

const current={id:'exact-world'};
const enter:FrontierMovementOption={action:'FRONTIER',frontierMove:'enter',targetFrontierSiteId:'frontier-north-gate'};
const exit:FrontierMovementOption={action:'FRONTIER',frontierMove:'exit',targetFrontierSiteId:'loc-vein-north'};
const next:FrontierMovementOption={action:'FRONTIER',frontierMove:'travel',targetFrontierSiteId:'frontier-north-pass'};
const north:FrontierMovementView={scope:'anchor',regionId:'north-snow',chartId:'chart-north-snow',
  anchorId:'loc-vein-north',gateId:'frontier-north-gate',visibleSites:[],options:[enter]};
const gate:FrontierMovementView={...north,scope:'frontier',site:frontierSite('frontier-north-gate'),
  visibleSites:[frontierSite('frontier-north-gate')!,frontierSite('frontier-north-pass')!],
  options:[next,exit],visit:{enteredTick:3,paidStones:8,paidRoots:1}};
const produce:FrontierProductionOption={action:'FRONTIER_PRODUCTION',frontierProductionMove:'harvest',targetFrontierSiteId:'frontier-north-plot'};
const otherProduction:FrontierProductionView={regionId:'south-marsh',siteId:'frontier-south-home',water:7,waterCapacity:8,
  isWinter:false,canDrawTide:true,stock:{frost_dose:9,ward_reed:8},options:[]};
const actualTrade:FrontierTradeView={id:'test-signed',status:'accepted',yourSide:'north-snow',offeredTick:1,acceptedTick:2,
  north:{status:'arrived',quantity:2,pathLength:20,stepsCompleted:20,winterDetour:true,waitedWinter:0}};
const controls=(choices:FrontierControls['choices']):FrontierControls=>({scopeKey:'branch:actor',revisionKey:current,choices,onQueue:vi.fn()});

describe('native frontier narrow scope panel',()=>{
  it('names the current old anchor option without exposing either chart or paid receipts',()=>{
    const x=controls([enter,next,produce]);
    const html=renderToStaticMarkup(<FrontierPanel view={north} production={otherProduction} controls={x}/>);
    expect(html).toContain('看此地的关口');
    expect(html).toContain('入北岭雪谷');
    expect(html).toContain('人仍在旧图');
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('收本格成品');
    expect(html).not.toContain('南泽');
    expect(html).not.toContain('入关实账');
    expect(x.onQueue).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(<FrontierPanel trade={[actualTrade]} controls={x}/>)).toBe('');
  });
  it('shows one exact chart, paid actual entry, and only legal current neighbors/exit',()=>{
    const html=renderToStaticMarkup(<FrontierPanel view={gate} production={otherProduction} controls={controls([enter,exit,next,produce])}/>);
    expect(html).toContain('<canvas');
    expect(html).toContain('此处脚下：雪谷关 · 第 2 行，第 1 列');
    expect(html).toContain('第 3 轮实付 8 灵石、1 份地根');
    expect(html).toContain('走到北岭直脊');
    expect(html).toContain('由原关返回');
    expect(html).not.toContain('入北岭雪谷');
    expect(html).not.toContain('此处库中可见');
    expect(html).not.toContain('冬药圃');
  });
  it('keeps a draft and real arrival separate from a warehouse and exchange',()=>{
    const x={...controls([enter]),pending:enter};
    const html=renderToStaticMarkup(<FrontierPanel view={north} controls={x} trade={[actualTrade]}/>);
    expect(html).toContain('已候下月：入北岭雪谷');
    expect(html).toContain('还没有走动、落笔或支取实物');
    expect(html).toContain('已到对方关区，尚在托管');
    expect(html).toContain('交割尚未完成');
    expect(html).not.toContain('已抵齐并交割');
    expect(html).not.toContain('<button');
    expect(x.onQueue).not.toHaveBeenCalled();
  });
  it('only offers a suggested signing target at the actual signing anchor with an exact authorized name',()=>{
    const market:FrontierMovementView={scope:'anchor',regionId:'south-marsh',chartId:'chart-south-marsh',
      anchorId:'loc-market',gateId:'frontier-south-gate',options:[],visibleSites:[]};
    const propose:FrontierTradeOption={action:'FRONTIER_TRADE',frontierTradeMove:'propose',targetCultivatorId:'known-local'};
    const inputs={controls:controls([propose]),tradeCandidates:{'known-local':'魏小竹'}};
    expect(renderToStaticMarkup(<FrontierPanel view={north} {...inputs}/>)).not.toContain('与魏小竹提约');
    expect(renderToStaticMarkup(<FrontierPanel view={market} {...inputs}/>)).toContain('与魏小竹提约');
    expect(renderToStaticMarkup(<FrontierPanel view={market} controls={inputs.controls}/>)).not.toContain('<button');
    expect(inputs.controls.onQueue).not.toHaveBeenCalled();
  });
  it('rejects stale replays, duplicate options, and a malformed exit target outside the actual chart connection',()=>{
    const otherExit:FrontierMovementOption={...exit,targetFrontierSiteId:'loc-market'};
    const refreshed={...current};
    expect(reviewedFrontierOrder({choice:enter,revision:current},current,[enter])).toBe(enter);
    expect(reviewedFrontierOrder({choice:enter,revision:current},refreshed,[enter])).toBeUndefined();
    expect(reviewedFrontierOrder({choice:enter,revision:current},current,[enter,{...enter}])).toBeUndefined();
    expect(frontierScopedOrders({view:{...gate,options:[otherExit,next]},controls:controls([otherExit,next])})).toEqual([next]);
  });
});
