import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {ColdWaterVeinPanel} from '../src/components/ColdWaterVeinPanel';
import {NorthWellRevisitPanel,reviewedNorthWellAuthor,reviewedRevisitOrder,type NorthWellEvidenceView,type NorthWellRevisitAuthorControls,
  type NorthWellRevisitControls} from '../src/components/NorthWellRevisitPanel';

const exact={};
const actual:NorthWellEvidenceView={scope:'local',siteName:'极北寒玉脉',wellName:'原公井',
  original:{date:{year:1001,month:12},stance:'detour',verifiedPassage:true},
  current:{date:{year:1303,month:10},population:105,status:'town',hereReader:'闻春岚'},recentPaidSurvey:false,
};
const published={...actual,law:{date:{year:1303,month:10},retainedPopulation:105}} satisfies NorthWellEvidenceView;
const revise={key:'real-keep',move:'keep',order:{action:'NORTH_WELL_REVIEW',northWellReviewMove:'keep',targetNorthMiningCharterId:'north-mining-charter-12'}} as const;
const controls:NorthWellRevisitControls={scopeKey:'actual-known',revisionKey:exact,choices:[revise],onQueue:vi.fn(()=>true)};
const authorDraft={proposalKey:'review-card',date:{year:1303,month:10},siteName:'极北寒玉脉',population:105};
const author:NorthWellRevisitAuthorControls={scopeKey:'first-authority',revisionKey:exact,onPrepare:vi.fn(async()=>authorDraft),onConfirm:vi.fn(()=>true)};
describe('same real old well in its existing quiet mobile fold',()=>{
  it('shows original and actual living town separately, and law appears as a new same-day author act',()=>{
    const real=renderToStaticMarkup(<ColdWaterVeinPanel><NorthWellRevisitPanel view={actual}/></ColdWaterVeinPanel>);
    expect(real).toContain('寒玉井边');expect(real).toContain('重访旧井');
    expect(real).not.toContain('<details open=');
    expect(real).toContain('1001 年 12 月');expect(real).toContain('原采契、原井和确曾走过的路都可核');
    expect(real).toContain('1303 年 10 月');expect(real).toContain('有 105 位实住居民');expect(real).toContain('闻春岚本人');
    expect(real).not.toMatch(/新立禁牌|另读作者法禁/);
    const changed=renderToStaticMarkup(<NorthWellRevisitPanel view={published}/>);
    expect(changed).toContain('有 105 位实住居民');expect(changed).toContain('1303 年 10 月新立禁牌');
    expect(changed).toContain('没有把住民、旧井或原路抹掉');
    expect(changed).toContain('不说此法自然延续了三百年');
  });
  it('scopes original-only view, distinguishes pending and actual own costs, and hides unoffered options',()=>{
    const remote=renderToStaticMarkup(<NorthWellRevisitPanel view={{...published,scope:'personal'}} controls={controls} author={author}/>);
    expect(remote).toContain('不是亲到该处的当月现况');
    expect(remote).not.toMatch(/闻春岚|105|新立禁牌|复议|核对旁线母本/);
    const held=renderToStaticMarkup(<NorthWellRevisitPanel view={{...published,ownSurvey:{date:{year:1303,month:11},paidStones:2,depth:24}}}
      controls={{...controls,pending:'keep'}}/>);
    expect(held).toMatch(/自己的井尺.*原账付 2 灵石/);
    expect(held).toContain('此刻没有落复议账');
    expect(held).not.toContain('原账付 4 灵石');
    const paid=renderToStaticMarkup(<NorthWellRevisitPanel view={{...published,ownReview:{date:{year:1303,month:12},move:'permit',
      paidStones:4,expires:{year:1304,month:3},permitState:'spent'}}}/>);
    expect(paid).toContain('原账付 4 灵石');
    expect(paid).toContain('这次许可已经用过');
    expect(controls.onQueue).not.toHaveBeenCalled();
  });
  it('author review only appears when authorized and can never commit while merely rendering',()=>{
    const html=renderToStaticMarkup(<NorthWellRevisitPanel view={actual} author={author}/>);
    expect(html).toContain('核对旁线母本');
    expect(html).toContain('不改本线，不添写过去三百年');
    expect(html).not.toContain('另开作者旁线</button>');
    expect(author.onPrepare).not.toHaveBeenCalled();expect(author.onConfirm).not.toHaveBeenCalled();
    expect(reviewedNorthWellAuthor({proposal:authorDraft,revision:exact},exact)).toBe(authorDraft);
    expect(reviewedNorthWellAuthor({proposal:authorDraft,revision:exact},{})).toBeUndefined();
  });
  it('cannot reuse a staged gameplay review if source revision or legal choices change',()=>{
    const staged={choice:revise,revision:exact};
    expect(reviewedRevisitOrder(staged,exact,[revise])).toBe(revise);
    expect(reviewedRevisitOrder(staged,{},[revise])).toBeUndefined();
    expect(reviewedRevisitOrder(staged,exact,[revise,{...revise}])).toBeUndefined();
    expect(reviewedRevisitOrder(staged,exact,[])).toBeUndefined();
  });
});
