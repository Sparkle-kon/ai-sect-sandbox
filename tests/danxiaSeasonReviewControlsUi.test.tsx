import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DanxiaSeasonReviewConfirmation, DanxiaSeasonReviewControls, type DanxiaSeasonReviewChoice } from '../src/components/DanxiaSeasonReviewControls';

const renew={option:{action:'DANXIA_REVIEW',danxiaReviewMove:'propose_renew',targetDanxiaReviewId:'private-review'}} satisfies DanxiaSeasonReviewChoice;
const switched={option:{action:'DANXIA_REVIEW',danxiaReviewMove:'propose_switch',targetDanxiaReviewId:'private-review',
  targetSettlementRecordId:'private-receipt'},label:'已核实北村赈济'} satisfies DanxiaSeasonReviewChoice;

describe('native scoped next-season commands',()=>{
  it('renders no selector for an observer without an actual authorized option; exact non-default choices use ordinal values only',()=>{
    const onQueue=vi.fn(()=>false);
    expect(renderToStaticMarkup(<DanxiaSeasonReviewControls scopeKey="private-scope" choices={[]} onQueue={onQueue}/>)).toBe('');
    expect(renderToStaticMarkup(<DanxiaSeasonReviewControls scopeKey="private-scope" choices={[renew]}/>)).toBe('');
    const html=renderToStaticMarkup(<DanxiaSeasonReviewControls scopeKey="private-scope" revisionKey={{}}
      choices={[renew,switched]} onQueue={onQueue}/>);
    expect(html).toContain('value="" selected="">请选择');
    expect(html).toContain('value="0">提议续约');
    expect(html).toContain('value="1">提议改约 · 已核实北村赈济');
    expect(html).not.toMatch(/private-|确认排入|已签定/);
    expect(onQueue).not.toHaveBeenCalled();
  });
  it('explains immediate essence versus later actual independent assent without rewriting affiliation',()=>{
    const html=renderToStaticMarkup(<DanxiaSeasonReviewConfirmation choice={switched} onConfirm={()=>undefined} onCancel={()=>undefined}/>);
    expect(html).toContain('确认排入：提议改约');
    expect(html).toContain('随后等对方另签；双方仍各归原宗');
    expect(html).toContain('成功排入消耗 5 神识，不推进月份');
    expect(html).toContain('签约仍须当月双方应允');
    expect(html).not.toContain('private-');
  });
});
