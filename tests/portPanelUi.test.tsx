import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {FrontierPanel} from '../src/components/FrontierPanel';
import {FrontierPortPanel,frontierPortScopedOrders,reviewedFrontierPortOrder,type FrontierPortControls} from '../src/components/FrontierPortPanel';
import type {FrontierMovementView} from '../src/engine/frontierMovementEngine';
import type {FrontierPortTradeOption,FrontierPortTradeView} from '../src/engine/frontierPortTradeEngine';
import type {FrontierPortLocalOption,FrontierPortView} from '../src/engine/frontierPortTerms';
import {frontierSite} from '../src/engine/frontierTerms';

const revision={exact:'branch'};
const placement:FrontierMovementView={scope:'frontier',regionId:'east-offshore',chartId:'chart-east-offshore',anchorId:'loc-market-east',
  gateId:'frontier-east-gate',site:frontierSite('frontier-east-dock'),options:[],
  visibleSites:[frontierSite('frontier-east-dock')!,frontierSite('frontier-east-outer')!]};
const east:FrontierMovementView={...placement,scope:'anchor',site:undefined,visibleSites:[]};
const market:FrontierMovementView={scope:'anchor',regionId:'south-marsh',chartId:'chart-south-marsh',anchorId:'loc-market',
  gateId:'frontier-south-gate',visibleSites:[],options:[]};
const north:FrontierMovementView={scope:'anchor',regionId:'north-snow',chartId:'chart-north-snow',anchorId:'loc-vein-north',
  gateId:'frontier-north-gate',visibleSites:[],options:[]};
const practice:FrontierPortLocalOption={action:'FRONTIER_PORT',frontierPortMove:'practice',targetFrontierSiteId:'frontier-east-dock'};
const load:FrontierPortTradeOption={action:'FRONTIER_PORT_TRADE',frontierPortTradeMove:'load',targetFrontierPortTradeId:'exact-agreement'};
const receive:FrontierPortTradeOption={action:'FRONTIER_PORT_TRADE',frontierPortTradeMove:'receive',targetFrontierPortTradeId:'exact-agreement'};
const propose:FrontierPortTradeOption={action:'FRONTIER_PORT_TRADE',frontierPortTradeMove:'propose',targetCultivatorId:'native-buyer'};
const local:FrontierPortView={siteId:'frontier-east-dock',resident:true,tide:'wind_closed',options:[],hull:{id:'not-for-dom',condition:4,status:'away'}};
const trade:FrontierPortTradeView={id:'exact-agreement',yourRole:'seller',status:'shipping',offeredTick:4,signedTick:5,roots:'inland_escrow',
  cargo:{position:'sea',direction:'outbound',stepsCompleted:1,pathLength:16,delayed:true,waiting:'wind_closed',
    hullLocation:'sea',departedTick:7}};
const controls=(choices:FrontierPortControls['choices']):FrontierPortControls=>({scopeKey:'east:body',revisionKey:revision,choices,onQueue:vi.fn()});

describe('restricted east port and sea-to-land cargo interface',()=>{
  it('uses one actual local Canvas plus a shore-reader fold, not a second player aboard ship',()=>{
    const x=controls([load,practice]);
    const html=renderToStaticMarkup(<FrontierPanel view={placement}
      portPanel={<FrontierPortPanel movement={placement} local={local} trades={[trade]} controls={x}/>}/>);
    expect(html).toContain('东海外港');
    expect(html).toContain('登验泊位 · 第 1 行，第 2 列');
    expect(html.match(/<canvas/g)).toHaveLength(1);
    expect(html).toContain('外海潮口 · 第 1 行，第 1 列 · 水格不可步行');
    expect(html).toContain('你仍在岸边');
    expect(html).toContain('船的实际位置：在外海');
    expect(html).toContain('货没有越过关口');
    expect(html).toContain('第 1 / 16 步');
    expect(html).not.toContain('实到中坊验货');
    expect(html).not.toContain('借在泊船练式');
    expect(html).not.toContain('把实货装入船舱');
    expect(html).not.toContain('exact-agreement');
    expect(html).not.toContain('not-for-dom');
    expect(x.onQueue).not.toHaveBeenCalled();
  });
  it('only shows current physically scoped shore facts or participant receipts, never remote stock',()=>{
    expect(renderToStaticMarkup(<FrontierPortPanel movement={north} local={local} trades={[trade]}/>)).toBe('');
    const old=renderToStaticMarkup(<FrontierPanel view={east}
      portPanel={<FrontierPortPanel movement={east} local={local}/>}/>);
    expect(old).toContain('人仍在旧图');
    expect(old).not.toContain('<canvas');
    expect(old).not.toContain('眼下港务');
    expect(old).not.toContain('你仍在岸边');
    const m=renderToStaticMarkup(<FrontierPortPanel movement={market} local={local}
      trades={[{...trade,yourRole:'buyer'}]} controls={controls([receive])}/>);
    expect(m).toContain('本方为中坊买方');
    expect(m).not.toContain('眼下港务');
    expect(m).not.toContain('实到中坊验货');
  });
  it('keeps loaded-but-not-departed harbor custody and land relay mechanically distinct',()=>{
    const aboard=renderToStaticMarkup(<FrontierPortPanel movement={placement}
      trades={[{...trade,cargo:{position:'dock',direction:'outbound',stepsCompleted:0,pathLength:16,delayed:false,hullLocation:'reserved'}}]}/>);
    expect(aboard).toContain('占定泊位，尚未离泊');
    expect(aboard).toContain('已装实货仍在港，不能算已航行');
    expect(aboard).not.toContain('在外海');
    const relay=renderToStaticMarkup(<FrontierPortPanel movement={market}
      trades={[{...trade,cargo:{position:'land',direction:'outbound',stepsCompleted:9,pathLength:16,delayed:false,
        hullLocation:'east_anchor',departedTick:7}}]}/>);
    expect(relay).toContain('原货当前位置：旧图陆路');
    expect(relay).toContain('船的实际位置：泊在旧东口等陆上接力');
    expect(relay).not.toContain('买方已实际验收');
  });
  it('requires exact local permitted acts and the current branch revision and avoids duplicate queue',()=>{
    const x=controls([practice,practice,load]);
    const signed={...trade,status:'signed' as const,cargo:undefined};
    const berthed={...local,hull:{id:'not-for-dom',condition:4,status:'berthed' as const}};
    expect(frontierPortScopedOrders({movement:placement,local,trades:[signed],controls:x})).toEqual([]);
    expect(frontierPortScopedOrders({movement:placement,local:berthed,trades:[signed],controls:x})).toEqual([load]);
    const html=renderToStaticMarkup(<FrontierPortPanel movement={placement} local={berthed} trades={[signed]}
      controls={{...x,pending:load}}/>);
    expect(html).toContain('已候下月：把实货装入船舱');
    expect(html).toContain('未走船、未落笔、未支取实际资材');
    expect(html).not.toContain('<button');
    expect(reviewedFrontierPortOrder({order:load,revision},revision,[load])).toBe(load);
    expect(reviewedFrontierPortOrder({order:load,revision},{...revision},[load])).toBeUndefined();
    expect(reviewedFrontierPortOrder({order:load,revision},revision,[load,{...load}])).toBeUndefined();
    expect(frontierPortScopedOrders({movement:east,local,trades:[trade],controls:x})).toEqual([]);
  });
  it('only offers named actual local candidates at the old signing market',()=>{
    const props={controls:controls([propose]),tradeCandidates:{'native-buyer':'察潮人'}};
    expect(renderToStaticMarkup(<FrontierPortPanel movement={market} {...props}/>)).toContain('与察潮人提货约');
    expect(renderToStaticMarkup(<FrontierPortPanel movement={east} {...props}/>)).toBe('');
    expect(renderToStaticMarkup(<FrontierPortPanel movement={market} controls={props.controls}/>)).toBe('');
  });
});
