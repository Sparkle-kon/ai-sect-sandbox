import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DanxiaSeasonBranchComparison } from '../src/components/DanxiaSeasonBranchComparison';
import { DanxiaSeasonBranchReading, DanxiaSeasonReviewReceipts } from '../src/components/DanxiaSeasonReviewReceipts';
import type { DanxiaSeasonReviewView } from '../src/engine/danxiaSeasonReviewEngine';

const base={
  id:'private-review',shortageId:'private-origin',openedTick:40,expiresTick:46,
  role:'original_disciple',status:'open',source:{outcome:'unfulfilled',finalTick:38,deliveredLeaves:0},
} satisfies DanxiaSeasonReviewView;
const delivered={...base,source:{outcome:'delivered',finalTick:38,deliveredLeaves:2} as const};
const renewed={...delivered,status:'renewed',proposal:{kind:'renew',proposedTick:41},decision:{tick:42,reason:'signed'}} as const;
const render=(...rows:DanxiaSeasonReviewView[])=>renderToStaticMarkup(<DanxiaSeasonReviewReceipts rows={rows}/>);

describe('personal seasonal medicine review and exact private paired view',()=>{
  it('shows a real receipt rather than guessing from arrival, and distinguishes a proposal from explicit assent',()=>{
    const pending=render({...base,status:'proposed',proposal:{kind:'switch',proposedTick:41,reliefTick:39}});
    expect(pending).toContain('封存、应允、抵达另记');
    expect(pending).toContain('次季复议第 40 轮开始');
    expect(pending).toContain('赈济已实际发生于第 39 轮');
    expect(pending).toContain('尚未签定');
    expect(pending).not.toMatch(/已由原定收药人|已明确同意|<button|private-/);
    const signed=render(renewed);
    expect(signed).toContain('2 株已由原定收药人实际签收');
    expect(signed).toContain('第 42 轮：双方已明确同意续约');
    expect(signed).toContain('不代表全村同意，也不能说明已经用药或痊愈');
  });
  it('keeps timeout and witnessed direct refusal separate, with no panel for an empty scope',()=>{
    const expired=render({...base,status:'no_agreement',decision:{tick:46,reason:'expired'}});
    expect(expired).toContain('复议期限已过，未达成新约');
    expect(expired).not.toContain('已明确拒绝');
    const refused=render({...base,status:'refused',decision:{tick:41,reason:'refused'}});
    expect(refused).toContain('原定求药人已明确拒绝下季合作');
    expect(render()).toBe('');
  });
  it('omits reader-private fields and shows no partial branch facts when exact paired proof is unavailable',()=>{
    const onRead=vi.fn(()=>({kind:'unavailable'} as const));
    const closed=renderToStaticMarkup(<DanxiaSeasonBranchComparison scopeKey="private-scope" revision={{}}
      options={[{discipleId:'private-actor',settlementId:'private-village',shortageId:'private-exact-origin',label:'合规可见选择'}]} onRead={onRead}/>);
    expect(closed).toContain('丹荒旧案对读');
    expect(closed).not.toMatch(/<details[^>]*\bopen(?:\s|=|>)|private-|合规可见选择|<select/);
    expect(onRead).not.toHaveBeenCalled();
    const paired=renderToStaticMarkup(<DanxiaSeasonBranchReading result={{kind:'paired',left:base,right:renewed}}/>);
    expect(paired).toContain('甲支');
    expect(paired).toContain('乙支');
    expect(paired).toContain('双方已明确同意续约');
    expect(paired).not.toMatch(/private-|本人角色|<button/);
    const hidden=renderToStaticMarkup(<DanxiaSeasonBranchReading result={{kind:'unavailable'}}/>);
    expect(hidden).toContain('两支暂没有可对读的同一原案凭据');
    expect(hidden).not.toMatch(/甲支|乙支|原定求药人/);
  });
});
