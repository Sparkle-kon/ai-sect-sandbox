import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ReplayReceiptResult, sameReplayVerificationSource, startReplayVerification,
} from '../src/components/ReplayReceiptPanel';
import { TimelinePanel } from '../src/components/TimelinePanel';
import { createInitialWorld } from '../src/data/initialWorld';
import type { ReplayReceipt, ReplayReceiptRequest, ReplayReceiptResponse } from '../src/engine/replayReceiptEngine';
import { createTimeline } from '../src/engine/timelineEngine';

const request: ReplayReceiptRequest = { type: 'verify_replay', runId: 'local-test-1', source: { kind: 'fixture', fixtureId: 'long526' } };
const checkpoint = { tick: 9, actorCount: 526, livingCount: 501, randomState: 818, sha256: '2'.repeat(64) };
const run = { ...checkpoint, tick: 13, sha256: '3'.repeat(64), completedTicks: 4, elapsedMs: 17.25, retainedSourceActors: true };
const receipt: ReplayReceipt = {
  protocolVersion: 1, ruleVersion: '1'.repeat(64), seed: 18, profileId: 'classic', randomAlgorithm: 'mulberry32-v1',
  requestedTicks: 4, timingScope: 'browser_worker', sourceCheckpoint: checkpoint, direct: run, chunked: run, identicalVerifiedSave: true,
};

function fakeWorker() {
  const worker: ReturnType<NonNullable<Parameters<typeof startReplayVerification>[3]>> = {
    onmessage: null, onmessageerror: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn(),
  };
  return worker;
}

function deliver(worker: ReturnType<typeof fakeWorker>, event: MessageEvent,
  handler = worker.onmessage) {
  handler?.call(worker as unknown as Worker, event);
}

function answer(source = request.source, runId = request.runId): MessageEvent<ReplayReceiptResponse> {
  return new MessageEvent('message', { data: { type: 'replay_receipt', source, runId, outcome: { status: 'verified', receipt } } });
}

describe('read-only local replay verification in the existing timeline', () => {
  it('keeps replay closed without implicit worker requests or actions', () => {
    const world = createInitialWorld(104);
    const timeline = createTimeline(world);
    const html = renderToStaticMarkup(<TimelinePanel timeline={timeline} previewTick={null} busy={false}
      onPreview={vi.fn()} onSelectBranch={vi.fn()} onFork={vi.fn()}
      verificationSource={{ world, branchId: timeline.activeBranchId, scopeKey: 'test-scope', busy: false }} />);
    expect(html).toMatch(/<details class="[^"]+"><summary class="[^"]+">本地复演核验回执/);
    expect(html).not.toContain('开始本地复演核验');
    expect(html).not.toContain('本次核验通过');
    expect(html).not.toContain('取消本次核验');
  });

  it('reports exact dataset and counts without treating unrun, mismatch or unavailable as success', () => {
    const good = renderToStaticMarkup(<ReplayReceiptResult choice="long526" outcome={{ status: 'verified', receipt }} />);
    expect(good).toContain('长样本（526 人） · 本次核验通过');
    expect(good).toContain('起点 Tick #9 · 526 人（在世 501）');
    expect(good).toContain('完成 4 轮 · 结束 Tick #13');
    expect(good).toContain('用时 17.25 毫秒');
    expect(good).toContain('两份完整存档字节完全相同');
    expect(good).toContain(receipt.ruleVersion);
    expect(good).toContain(receipt.sourceCheckpoint.sha256);
    expect(good).toContain('本回执未覆盖：所选分支快照、短样本（48 人）');
    expect(good).not.toContain('应用');
    expect(good).not.toContain('创建分支');

    const mismatch = renderToStaticMarkup(<ReplayReceiptResult choice="branch" branchId="branch-4" outcome={{
      status: 'mismatch',
      receipt: { ...receipt, profileId: null, identicalVerifiedSave: false, direct: { ...run, elapsedMs: null, retainedSourceActors: false } },
    }} />);
    expect(mismatch).toContain('所选分支快照 · 本次核验未通过');
    expect(mismatch).toContain('未能全部保留');
    expect(mismatch).toContain('branch-4');
    expect(mismatch).toContain('两份完整存档不相同');
    expect(mismatch).toContain('用时 暂不可测');
    expect(mismatch).toContain('谱系 未记录');

    const missing = renderToStaticMarkup(<ReplayReceiptResult choice="short48" outcome={{ status: 'unavailable', reason: 'rules_version' }} />);
    expect(missing).toContain('短样本（48 人） · 本次无法核验');
    expect(missing).not.toContain('核验通过');
    expect(missing).not.toContain('完成 0 轮');
    expect(missing).not.toContain('存档指纹');
  });

  it('correlates worker identity and exact source, terminates, and suppresses late or duplicate responses', () => {
    const worker = fakeWorker(), done = vi.fn();
    const current = vi.fn(() => true);
    const { stop } = startReplayVerification(request, current, done, () => worker);
    expect(worker.postMessage).toHaveBeenCalledWith(request);
    const eventHandler = worker.onmessage!;
    deliver(worker, answer(), eventHandler);
    expect(done).toHaveBeenCalledWith({ status: 'verified', receipt });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    deliver(worker, answer(), eventHandler);
    stop();
    expect(done).toHaveBeenCalledTimes(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    const incomplete = new MessageEvent('message', { data: { type: 'replay_receipt', source: request.source,
      runId: request.runId, outcome: { status: 'verified' } } });
    for (const wrong of [answer(request.source, 'stale-test-id'), answer({ kind: 'fixture', fixtureId: 'short48' }), incomplete]) {
      const unrelated = fakeWorker(), finish = vi.fn();
      startReplayVerification(request, current, finish, () => unrelated);
      deliver(unrelated, wrong);
      expect(finish).toHaveBeenCalledWith({ status: 'unavailable', reason: 'execution' });
      expect(unrelated.terminate).toHaveBeenCalledTimes(1);
    }
  });

  it('never publishes a result after cancel, scope changes or busy state', () => {
    const world = createInitialWorld(104);
    const stamp = { world, branchId: 'main', scopeKey: 'live', busy: false };
    expect(sameReplayVerificationSource(stamp, { ...stamp })).toBe(true);
    for (const drift of [
      { ...stamp, branchId: 'branch-1' }, { ...stamp, scopeKey: 'preview' },
      { ...stamp, world: structuredClone(world) }, { ...stamp, busy: true }, undefined,
    ]) {
      expect(sameReplayVerificationSource(stamp, drift)).toBe(false);
    }
    const stale = fakeWorker(), late = vi.fn();
    startReplayVerification(request, () => false, late, () => stale);
    deliver(stale, answer());
    expect(late).not.toHaveBeenCalled();
    expect(stale.terminate).toHaveBeenCalledTimes(1);

    const cancelled = fakeWorker(), notCalled = vi.fn();
    const control = startReplayVerification(request, () => true, notCalled, () => cancelled);
    const handler = cancelled.onmessage!;
    control.stop();
    deliver(cancelled, answer(), handler);
    expect(cancelled.terminate).toHaveBeenCalledTimes(1);
    expect(notCalled).not.toHaveBeenCalled();
  });
});
