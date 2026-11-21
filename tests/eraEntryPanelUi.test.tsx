import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EraEntryCandidateCard, EraEntryPanel, EraEntryPossessionReview } from '../src/components/EraEntryPanel';
import type { EraEntryCandidate } from '../src/engine/eraEntryCandidates';

const noAction = () => { throw new Error('rendering must not observe, follow, possess or fork the actual world'); };
const founder = {actorId:'private-origin-actor',name:'顾行舟',origin:{kind:'founder',tick:1},
  decision:{kind:'rest_or_cultivate'}} satisfies EraEntryCandidate;

describe('retained-era entry presentation',() => {
  it('keeps a single native closed control inside history, with explicit independent observation even without a candidate',() => {
    const read = vi.fn(() => []);
    const html = renderToStaticMarkup(<EraEntryPanel scopeKey="private-scope" date={{year:1101,month:1,tick:1201}}
      sites={[{id:'private-hidden-id',name:'已见青云台'}]} readCandidates={read} onObserve={noAction} onFollow={noAction} onPossess={noAction} />);
    expect(html.match(/<details\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]*\bopen(?:\s|=|>)/);
    expect(html).toContain('在此年代入世');
    expect(html).toContain('仙历 1101 年 1 月 · 第 1201 轮');
    expect(html).toContain('>旁观此年代</button>');
    expect(html).toContain('value="0">已见青云台</option>');
    expect(html).not.toMatch(/private-|准备附身|确认附身|跟随此人/);
    expect(read).not.toHaveBeenCalled();
  });

  it('shows independently proven founder/recruit history and only the current native eligibility',() => {
    const render = (candidate:EraEntryCandidate) => renderToStaticMarkup(<EraEntryCandidateCard candidate={candidate} />);
    const ready = render(founder);
    expect(ready).toContain('创世在册');
    expect(ready).toContain('选择休养或修炼');
    expect(ready).toContain('尚未下达指令');
    const contest = render({...founder,origin:{kind:'recruited',tick:30},decision:{kind:'observe_only',reason:'contest'}});
    expect(contest).toContain('从凡人自愿入门 · 第 30 轮');
    expect(contest).toContain('正在参赛，本节点只可跟随见闻或旁观。');
    expect(contest).not.toMatch(/休养或修炼|private-|<button/);
  });

  it('explains explicit native possession as a separate non-advancing fork preserving the original',() => {
    const html = renderToStaticMarkup(<EraEntryPossessionReview disabled={false} onConfirm={noAction} onCancel={noAction} />);
    expect(html).toContain('确认附身并进入新分支');
    expect(html).toContain('取消附身核对');
    expect(html).toContain('原分支和原年代都不改变');
    expect(html).toContain('不会推进回合');
    expect(html).not.toContain('旁观此年代');
  });
  it('makes current-era possession explicitly stay in the existing branch',() => {
    const html = renderToStaticMarkup(<EraEntryPossessionReview historical={false} disabled={false} onConfirm={noAction} onCancel={noAction} />);
    expect(html).toContain('确认在当前分支附身');
    expect(html).toContain('不另开分支');
    expect(html).not.toContain('确认附身并进入新分支');
  });

});
