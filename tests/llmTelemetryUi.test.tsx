import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LlmTelemetryPanel, LlmTelemetryView, parseTelemetryPrices, telemetryHeadline } from '../src/components/LlmTelemetryPanel';
import { LLMScheduler } from '../src/engine/llmScheduler';
import type { LLMSchedulerSnapshot } from '../src/engine/llmScheduler';

function snapshot(): LLMSchedulerSnapshot {
  return new LLMScheduler().getSnapshot();
}

const ignore = () => undefined;

describe('LLM telemetry panel', () => {
  it('never implies that configuration or an HTTP response means a model decision was applied', () => {
    const empty = snapshot();
    expect(telemetryHeadline(empty, true, false)).toBe('已配置模型模式 · 缺少访问凭证');
    expect(telemetryHeadline(empty, true, true)).toBe('模型已配置 · 尚未调用');
    expect(telemetryHeadline({ ...empty, active: 1 }, true, true)).toBe('模型调用中 · 1 并发');
    const stale = { ...empty, callsStarted: 1, outcomes: { ...empty.outcomes, ok: 1 },
      decisions: { ...empty.decisions, validated: 1, stale: 1 } };
    expect(telemetryHeadline(stale, true, true)).toBe('已尝试调用 · 暂无已应用模型决策');
    const applied = { ...stale, decisions: { ...stale.decisions, applied: 1 } };
    expect(telemetryHeadline(applied, true, true)).toBe('本会话模型决策已应用 1 项');
    expect(telemetryHeadline(applied, false, true)).toBe('规则脑模式');
  });

  it('separates known usage, unknown usage, partial cost, and simulation acceptance', () => {
    const empty = snapshot();
    const current: LLMSchedulerSnapshot = {
      ...empty, callsStarted: 6, callsSettled: 6, averageLatencyMs: 48.6, callsPerMinute: 5,
      usage: { inputTokens: 400, outputTokens: 200, totalTokens: 600, knownCalls: 2, unknownCalls: 4 },
      pricing: { knownCostUsd: 0.0007, pricedCalls: 1, unpricedCalls: 5 },
      decisions: { ...empty.decisions, validated: 3, applied: 1, local_fallback: 1, simulation_rejected: 1, stale: 1 },
      outcomes: { ...empty.outcomes, ok: 4, budget: 3 },
    };
    const markup = renderToStaticMarkup(<LlmTelemetryView snapshot={current} configured hasCredential model="secret-not-displayed" worldTick={8}
      onConcurrencyChange={ignore} onPricesChange={ignore} />);
    expect(markup).toContain('本会话累计，并非单一 Tick');
    expect(markup).toContain('当前世界：Tick #8');
    expect(markup).toContain('49 ms');
    expect(markup).toContain('模型决策已校验');
    expect(markup).toContain('模型决策已应用');
    expect(markup).toContain('模拟未接受');
    expect(markup).toContain('已弃用结果');
    expect(markup).toContain('已知：输入 400 · 输出 200 · 合计 600 Token（2 次） · 4 次用量未知');
    expect(markup).toContain('已知费用估算：$0.0007（1 次） · 5 次未计价');
    expect(markup).toContain('预算：每 Tick 36 · 每会话 250 · 队列 80');
    expect(markup).toContain('最大并发');
    expect(markup).toContain('value="8"');
    expect(markup).not.toContain('secret-not-displayed');
  });

  it('renders live scheduler settings without any request and refuses missing or invalid prices', () => {
    const scheduler = new LLMScheduler({ fetch: async () => { throw new Error('must not call provider'); } });
    scheduler.configure({ concurrency: 4 });
    const markup = renderToStaticMarkup(<LlmTelemetryPanel scheduler={scheduler} configured hasCredential={false} model="fiction-model" />);
    expect(markup).toContain('缺少访问凭证');
    expect(markup).toContain('暂无可计的用量');
    expect(markup).toContain('暂无可估算费用');
    expect(markup).toContain('value="4" selected=""');
    expect(scheduler.getSnapshot().callsStarted).toBe(0);
    expect(parseTelemetryPrices('0', '0.125')).toEqual({ inputPerMillion: 0, outputPerMillion: 0.125 });
    expect(parseTelemetryPrices('', '0.125')).toBeUndefined();
    expect(parseTelemetryPrices('4', '-1')).toBeUndefined();
    expect(parseTelemetryPrices('100001', '2')).toBeUndefined();
  });
});
