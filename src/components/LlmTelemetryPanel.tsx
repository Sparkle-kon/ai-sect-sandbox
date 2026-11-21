import { useEffect, useState, useSyncExternalStore } from 'react';
import type { LLMSchedulerSnapshot } from '../engine/llmScheduler';

type Prices = LLMSchedulerSnapshot['settings']['prices'];

interface TelemetryScheduler {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => LLMSchedulerSnapshot;
  configure: (patch: { concurrency?: number; prices?: Prices }) => unknown;
  refresh?: () => void;
}

export function telemetryHeadline(snapshot: LLMSchedulerSnapshot, configured: boolean, hasCredential: boolean): string {
  if (!configured) return '规则脑模式';
  if (!hasCredential) return '已配置模型模式 · 缺少访问凭证';
  if (snapshot.active > 0) return `模型调用中 · ${snapshot.active} 并发`;
  if (snapshot.decisions.applied > 0) return `本会话模型决策已应用 ${snapshot.decisions.applied} 项`;
  if (snapshot.callsStarted > 0) return '已尝试调用 · 暂无已应用模型决策';
  return '模型已配置 · 尚未调用';
}

const REQUEST_TYPES = {
  decision: 'NPC 决策', reflection: '反思', dialogue: '对白', council: '议事', chronicle: '史书',
} as const;

const OUTCOMES = {
  ok: '已收到有效 JSON', budget: '预算拦截', queue_full: '队列已满', http_error: 'HTTP 失败',
  invalid_json: '响应无效', network_error: '网络失败', aborted: '已取消',
} as const;

const usd = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 });

export function parseTelemetryPrices(input: string, output: string): { inputPerMillion: number; outputPerMillion: number } | undefined {
  if (!input.trim() || !output.trim()) return undefined;
  const inputPerMillion = Number(input);
  const outputPerMillion = Number(output);
  if (![inputPerMillion, outputPerMillion].every((amount) => Number.isFinite(amount) && amount >= 0 && amount <= 100_000)) return undefined;
  return { inputPerMillion, outputPerMillion };
}

function Counter({ label, value, tone = '' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="min-w-0 rounded border border-slate-800 bg-slate-950/60 p-2">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm font-semibold tabular-nums ${tone || 'text-slate-100'}`}>{value}</dd>
    </div>
  );
}

interface LlmTelemetryViewProps {
  snapshot: LLMSchedulerSnapshot;
  configured: boolean;
  hasCredential: boolean;
  model: string;
  worldTick?: number;
  onConcurrencyChange: (value: number) => void;
  onPricesChange: (prices: Prices) => void;
  onExpanded?: (open: boolean) => void;
}

export function LlmTelemetryView({ snapshot, configured, hasCredential, model, worldTick, onConcurrencyChange, onPricesChange, onExpanded }: LlmTelemetryViewProps) {
  const [priceError, setPriceError] = useState(false);
  const { usage, pricing, settings, decisions } = snapshot;
  const rate = Object.hasOwn(settings.prices, model) ? settings.prices[model] : undefined;
  const canPrice = model.trim().length > 0 && model.length <= 120;
  const pricesKnown = pricing.pricedCalls > 0;

  return (
    <details
      className="w-full min-w-0 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-slate-100"
      onToggle={(event) => onExpanded?.(event.currentTarget.open)}
    >
      <summary className="cursor-pointer break-words text-sm font-semibold text-slate-100">
        模型遥测 <span className="ml-1 text-xs font-medium text-sky-200">· {telemetryHeadline(snapshot, configured, hasCredential)}</span>
      </summary>
      <div className="mt-2 space-y-3 border-t border-slate-800 pt-2">
        <p className="text-xs leading-relaxed text-slate-400">
          当前配置：{configured ? (hasCredential ? '模型模式已启用，已填凭证（未据此确认连通）' : '缺少访问凭证，使用规则脑') : '模型模式关闭'}。
          以下是本会话累计，并非单一 Tick 的结果；收到响应不等于模型决策已写入世界。
          {worldTick !== undefined && <> 当前世界：Tick #{worldTick}。</>}
        </p>
        <dl aria-label="调用与决策" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Counter label="已发起请求" value={snapshot.callsStarted} />
          <Counter label="已结算请求" value={snapshot.callsSettled} />
          <Counter label="近一分钟请求" value={snapshot.callsPerMinute} />
          <Counter label="平均延迟" value={snapshot.averageLatencyMs === null ? '无数据' : `${Math.round(snapshot.averageLatencyMs)} ms`} />
          <Counter label="在途／排队" value={`${snapshot.active}／${snapshot.queued}`} />
          <Counter label="模型决策已校验" value={decisions.validated} />
          <Counter label="模型决策已应用" value={decisions.applied} tone="text-emerald-200" />
          <Counter label="模拟未接受" value={decisions.simulation_rejected} />
          <Counter label="规则回退" value={decisions.local_fallback} tone="text-amber-200" />
          <Counter label="已弃用结果" value={decisions.stale} />
        </dl>
        <section aria-label="Token 与成本" className="space-y-1">
          <h3 className="text-xs font-semibold text-slate-200">Token 与成本</h3>
          <p className="text-xs leading-relaxed text-slate-300">
            {usage.knownCalls > 0 ? `已知：输入 ${usage.inputTokens} · 输出 ${usage.outputTokens} · 合计 ${usage.totalTokens} Token（${usage.knownCalls} 次）` : '暂无可计的用量'}
            {usage.unknownCalls > 0 ? ` · ${usage.unknownCalls} 次用量未知` : ''}
          </p>
          {usage.knownCalls > 0 && <p className="text-xs text-slate-400">各栏只加总服务返回的字段，可能不完整。</p>}
          <p className="text-xs leading-relaxed text-slate-300">
            {pricesKnown ? `已知费用估算：${usd(pricing.knownCostUsd)}（${pricing.pricedCalls} 次）` : '暂无可估算费用'}
            {pricing.unpricedCalls > 0 ? ` · ${pricing.unpricedCalls} 次未计价` : ''}
          </p>
        </section>
        <section aria-label="调度设置" className="space-y-1.5 border-t border-slate-800 pt-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-300">
            <label className="inline-flex items-center gap-1.5">
              最大并发
              <select
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
                value={settings.concurrency}
                onChange={(event) => onConcurrencyChange(Number(event.currentTarget.value))}
              >
                {Array.from({ length: 8 }, (_, i) => i + 1).map((limit) => <option key={limit} value={limit}>{limit}</option>)}
              </select>
            </label>
            <p>预算：每 Tick {settings.maxCallsPerTick} · 每会话 {settings.maxCallsPerSession} · 队列 {settings.maxQueue}</p>
          </div>
          <p className="text-xs text-slate-400">决策、反思、对白、议事和史书共用限额。</p>
        </section>
        <details className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5">
          <summary className="cursor-pointer text-xs font-semibold text-slate-200">按用途与结果</summary>
          <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
            {Object.entries(REQUEST_TYPES).map(([key, label]) => (
              <div key={key} className="flex gap-1"><dt>{label}</dt><dd className="tabular-nums">{snapshot.byKind[key as keyof typeof REQUEST_TYPES]}</dd></div>
            ))}
          </dl>
          <p className="mt-2 border-t border-slate-800 pt-2 text-xs text-slate-400">结果包含开始前的拦截与取消。</p>
          <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
            {Object.entries(OUTCOMES).map(([key, label]) => (
              <div key={key} className="flex gap-1"><dt>{label}</dt><dd className="tabular-nums">{snapshot.outcomes[key as keyof typeof OUTCOMES]}</dd></div>
            ))}
          </dl>
        </details>
        {canPrice && (
          <details className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5">
            <summary className="cursor-pointer text-xs font-semibold text-slate-200">设置估算单价（可选）</summary>
            <p className="mt-1 break-all text-xs text-slate-400">当前配置模型 · USD / 百万 Token。单价只用于估算后续用量，不代表账单。</p>
            <form
              key={`${model}:${rate?.inputPerMillion ?? '-'}:${rate?.outputPerMillion ?? '-'}`}
              className="mt-2 space-y-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const parsed = parseTelemetryPrices(String(form.get('input') ?? ''), String(form.get('output') ?? ''));
                setPriceError(!parsed);
                if (parsed) onPricesChange({ ...settings.prices, [model]: parsed });
              }}
            >
              <div className="grid gap-1.5 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1 text-xs text-slate-300">输入单价
                  <input name="input" type="number" min={0} max={100_000} step="any" required defaultValue={rate?.inputPerMillion}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-300">输出单价
                  <input name="output" type="number" min={0} max={100_000} step="any" required defaultValue={rate?.outputPerMillion}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100" />
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="submit" className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-100">保存估算单价</button>
                {rate && (
                  <button type="button" className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-100" onClick={() => {
                    const prices = { ...settings.prices };
                    delete prices[model];
                    onPricesChange(prices);
                    setPriceError(false);
                  }}>清除估算单价</button>
                )}
              </div>
              {priceError && <p role="alert" className="text-xs text-rose-200">请同时填写有效的非负输入与输出单价。</p>}
            </form>
          </details>
        )}
      </div>
    </details>
  );
}

export function LlmTelemetryPanel({ scheduler, ...state }: Omit<LlmTelemetryViewProps, 'snapshot' | 'onConcurrencyChange' | 'onPricesChange' | 'onExpanded'> & { scheduler: TelemetryScheduler }) {
  const snapshot = useSyncExternalStore(scheduler.subscribe, scheduler.getSnapshot, scheduler.getSnapshot);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded || !scheduler.refresh) return;
    const pulse = () => { if (!document.hidden) scheduler.refresh?.(); };
    pulse();
    const timer = window.setInterval(pulse, 2000);
    return () => window.clearInterval(timer);
  }, [expanded, scheduler]);
  return (
    <LlmTelemetryView
      snapshot={snapshot}
      {...state}
      onExpanded={setExpanded}
      onConcurrencyChange={(concurrency) => scheduler.configure({ concurrency })}
      onPricesChange={(prices) => scheduler.configure({ prices })}
    />
  );
}
