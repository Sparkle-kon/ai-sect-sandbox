import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LlmTelemetryPanel, LlmTelemetryView } from '../src/components/LlmTelemetryPanel';
import { LLMScheduler } from '../src/engine/llmScheduler';
import type { FairModelCoverage } from '../src/engine/modelDecisionTurn';

const noOp = () => undefined;
const branchOnly = {
  tick: 26, eligible: 526, planned: 3, started: 2, validated: 1, applied: 0,
  utility: 525, longestWait: 7, limit: 'backoff',
} satisfies FairModelCoverage;

describe('branch-local completed model turn coverage', () => {
  it('distinguishes planned, started, validated and applied from utility, without suggesting every candidate will get a call', () => {
    const scheduler = new LLMScheduler({ fetch: async () => { throw new Error('render must not call a provider'); } });
    const html = renderToStaticMarkup(<LlmTelemetryPanel scheduler={scheduler} model="private-value" configured hasCredential
      worldTick={28} coverage={branchOnly} />);
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">本分支最近已提交的模型轮值回合/);
    expect(html).toContain('当前世界：Tick #28');
    expect(html).toContain('Tick #26 · 仅此分支已提交的实际回合，不是本会话累计');
    expect(html).toMatch(/符合模型轮值条件<\/dt><dd[^>]*>526<\/dd>/);
    expect(html).toMatch(/计划安排模型<\/dt><dd[^>]*>3<\/dd>/);
    expect(html).toMatch(/实际发起模型<\/dt><dd[^>]*>2<\/dd>/);
    expect(html).toMatch(/模型结果已校验<\/dt><dd[^>]*>1<\/dd>/);
    expect(html).toMatch(/模型决策已写入<\/dt><dd[^>]*>0<\/dd>/);
    expect(html).toMatch(/交由规则脑<\/dt><dd[^>]*>525<\/dd>/);
    expect(html).toMatch(/候选最长等待<\/dt><dd[^>]*>7 回合<\/dd>/);
    expect(html).toContain('本轮限制：服务冷却');
    expect(html).toContain('不保证何时取得模型调用');
    expect(html).not.toContain('private-value');
    expect(scheduler.getSnapshot().callsStarted).toBe(0);
  });

  it('hides the per-branch receipt when none is supplied; records scheduler cool-off separately', () => {
    const snapshot = new LLMScheduler().getSnapshot();
    const html = renderToStaticMarkup(<LlmTelemetryView snapshot={{
      ...snapshot, outcomes: { ...snapshot.outcomes, backoff: 4 },
    }} configured hasCredential model="test" onConcurrencyChange={noOp} onPricesChange={noOp} />);
    expect(html).not.toContain('本分支最近已提交的模型轮值回合');
    expect(html).toMatch(/服务冷却拦截<\/dt><dd[^>]*>4<\/dd>/);
  });
});
