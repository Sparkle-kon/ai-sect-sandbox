import { describe, expect, it, vi } from 'vitest';
import { DIRECTOR_AUDIT_STYLES, runDirectorHighlightsAudit } from '../scripts/directorHighlightsAudit';
import { createInitialWorld } from '../src/data/initialWorld';
import { projectDirectorHighlight, resolveDirectorHighlight } from '../src/engine/director/directorHighlights';
import { configureStoryteller } from '../src/engine/storytellerDirector';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import type { WorldEvent } from '../src/types/world';
import { isHighlight } from '../src/engine/director/highlight';

describe('天道高光真实供给', () => {
  it('不把四个普通行动、同一结果的换皮或相同选项计为高光', () => {
    expect(isHighlight({ options: ['rest', 'cultivate', 'talk', 'travel'].map(id => ({
      id, label: id, consequences: ['item'],
    })) })).toBe(false);
    expect(isHighlight({ options: [
      { id: 'lend', label: '相借', consequences: ['bond'], resultKey: 'lend' },
      { id: 'lend_again', label: '再借', consequences: ['bond'], resultKey: 'lend' },
    ] })).toBe(false);
    expect(isHighlight({ options: [
      { id: 'lend', label: '相借', consequences: ['bond'] },
      { id: 'lend', label: '假装另一选项', consequences: [] },
    ] })).toBe(false);
    expect(isHighlight({ options: [
      { id: 'lend', label: '借剑', consequences: ['bond'] },
      { id: 'leave', label: '拱手告辞', consequences: [] },
    ] })).toBe(true);
  });

  it('拒绝伪造、错人、过期和重放，只执行一次原局选择', () => {
    let world = createInitialWorld(13071);
    expect(configureStoryteller(world, 'great_calamity')).toBe(true);
    for (let month = 0; month < 12 && !projectDirectorHighlight(world); month++) {
      world = advanceWorldTick(world, undefined, undefined, 'utility', undefined, { captureTrace: false, capturePresentation: false });
    }
    const offer = projectDirectorHighlight(world);
    if (!offer) throw new Error('预期一年内出现真实高光');
    const choice = offer.options.find(option => option.consequences.length > 0);
    if (!choice) throw new Error('预期有实质后果的选项');
    const actor = world.cultivators.find(row => row.id === offer.actorId);
    const outsider = world.cultivators.find(row => row.id !== offer.actorId);
    if (!actor || !outsider) throw new Error('预期本人与旁观人都在世界中');
    expect(projectDirectorHighlight(world, outsider)).toBeUndefined();
    expect(projectDirectorHighlight(world, actor)).toEqual(offer);
    expect(resolveDirectorHighlight(world, { ...offer.key, actorId: outsider.id }, choice.id)).toBe(world);
    expect(resolveDirectorHighlight(world, { ...offer.key, openedTick: world.tick - 1 }, choice.id)).toBe(world);
    expect(resolveDirectorHighlight(world, offer.key, 'forged-option')).toBe(world);
    const moved = resolveDirectorHighlight(world, offer.key, choice.id);
    expect(moved).not.toBe(world);
    expect(resolveDirectorHighlight(moved, offer.key, choice.id)).toBe(moved);
    expect(projectDirectorHighlight(world, actor)).toEqual(offer);
  });

  it('同一真实道途高光的两条支路，在各自世界改变为不同的修行道途', () => {
    let world = createInitialWorld(13071);
    expect(configureStoryteller(world, 'great_calamity')).toBe(true);
    for (let month = 0; month < 12 && projectDirectorHighlight(world)?.kind !== 'dao_path'; month++) {
      world = advanceWorldTick(world, undefined, undefined, 'utility', undefined, { captureTrace: false, capturePresentation: false });
    }
    const offer = projectDirectorHighlight(world);
    if (offer?.kind !== 'dao_path') throw new Error('需要正式出现的道途高光');
    const [first, other] = offer.options.filter(option => option.id.startsWith('choose:'));
    if (!first || !other) throw new Error('同一个人必须能真实择取两种不同道途');
    const original = world.cultivators.find(row => row.id === offer.actorId);
    const firstWorld = resolveDirectorHighlight(world, offer.key, first.id);
    const otherWorld = resolveDirectorHighlight(world, offer.key, other.id);
    expect(original?.daoPath).toBeUndefined();
    expect(firstWorld.cultivators.find(row => row.id === offer.actorId)?.daoPath?.pathId).toBe(first.id.split(':')[1]);
    expect(otherWorld.cultivators.find(row => row.id === offer.actorId)?.daoPath?.pathId).toBe(other.id.split(':')[1]);
    expect(first.id).not.toBe(other.id);
  });

  it('Cognitive 模拟提供合法但相冲的 JSON 时，次月仍只结算玩家已选的高光', async () => {
    let world = createInitialWorld(13071);
    expect(configureStoryteller(world, 'great_calamity')).toBe(true);
    for (let month = 0; month < 120 && !world.storyteller?.pendingHighlightChoice; month++) {
      world = advanceWorldTick(world, undefined, undefined, 'utility', undefined, { captureTrace: false, capturePresentation: false });
      const offer = projectDirectorHighlight(world);
      const choice = offer?.options.find(option => option.consequences.length > 0);
      if (!offer || !choice) continue;
      // An auction actor can also submit an ordinary decision before the recorded choice settles.
      const chosen = resolveDirectorHighlight(world, offer.key, choice.id);
      if (chosen.storyteller?.pendingHighlightChoice && offer.kind !== 'auction') {
        world = advanceWorldTick(chosen, undefined, undefined, 'utility', undefined, { captureTrace: false, capturePresentation: false });
      } else {
        world = chosen;
      }
    }
    const pending = world.storyteller?.pendingHighlightChoice;
    if (pending?.key.kind !== 'auction') throw new Error('需要真正已排入次月的拍卖选择');
    const actor = world.cultivators.find(row => row.id === pending.key.actorId);
    if (!actor) throw new Error('拍卖选择缺少本人');
    const supplied = { chosenAction: 'REST' };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [
      { message: { content: JSON.stringify(supplied) } },
    ] })));
    vi.stubGlobal('fetch', fetchMock);
    try {
      llmScheduler.resetTickBudget();
      const reply = await requestCultivatorLLMDecision(actor, world, {
        enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'director-audit',
      }, world.tick + 1);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(reply).toMatchObject(supplied);
      if (!reply) throw new Error('模拟 provider 返回的普通行动必须确实被解码');
      const accepted = vi.fn();
      let completed: readonly WorldEvent[] = [];
      const after = advanceWorldTick(world, { [actor.id]: reply }, undefined, 'deferred', accepted, {
        modelActors: new Set([actor.id]), captureTrace: true, capturePresentation: false,
        onCompletedEvents(events) { completed = events; },
      });
      expect(accepted).toHaveBeenCalledWith(actor.id, false);
      const row = after.storyteller?.highlights?.find(history => history.tick === pending.key.openedTick);
      expect(row).toMatchObject({ chosen: pending.optionId, resolutionTick: after.tick });
      expect(completed.filter(event => event.id === row?.resolutionEventId)).toMatchObject([
        { category: 'diplomacy', witnessScope: 'participants', actorIds: expect.arrayContaining([actor.id]) },
      ]);
      expect(after.decisionTrace.records.find(record => record.actorId === actor.id && record.tick === after.tick))
        .toMatchObject({ chosenAction: 'redacted', source: 'avatar', applied: true });
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
  }, 30_000);

  it.each(DIRECTOR_AUDIT_STYLES)('%s：固定种子开局连走 120 月', (style, _label, minimum) => {
    const result = runDirectorHighlightsAudit({ style });
    expect(result.completedMonths).toBe(120);
    const summary = JSON.stringify({ highPoints: result.rows.length, kinds: result.kinds, maxGap: result.maxGap });
    expect(result.rows.length, summary).toBeGreaterThanOrEqual(minimum);
    const finished = result.rows.filter(row => row.applied && row.observations.length > 0);
    const missed = result.rows.filter(row => !row.applied && !row.awaiting);
    expect(result.rows.every(row => row.options.length >= 2 && row.choice.length > 0)).toBe(true);
    expect(result.rows.filter(row => row.awaiting).every(row => row.tick === result.endTick)).toBe(true);
    expect(missed.every(row => row.observations.length > 0)).toBe(true);
    expect(finished.length / result.rows.length, summary).toBeGreaterThanOrEqual(0.9);
    if (style === 'wandering_jianghu') {
      expect(new Set(finished.map(row => row.kind)).size, summary).toBeGreaterThanOrEqual(6);
      expect(result.maxGap, summary).toBeLessThanOrEqual(4);
    }
  }, 120_000);

  it('江湖风波真实局于第 60 月存读后，选项、实际后果与完整 120 月轨迹不变', () => {
    const opts = { seed: 13071, style: 'wandering_jianghu', months: 120 } as const;
    expect(runDirectorHighlightsAudit({ ...opts, reloadAfterMonth: 60 })).toEqual(runDirectorHighlightsAudit(opts));
  }, 120_000);

  it('相同种子和选项在 Utility 与不发外部请求的 Cognitive 月步入口有相同结果', () => {
    const opts = { seed: 13071, style: 'wandering_jianghu', months: 120 } as const;
    const utility = runDirectorHighlightsAudit({ ...opts, lane: 'utility' });
    const cognitive = runDirectorHighlightsAudit({ ...opts, lane: 'cognitive' });
    expect(cognitive).toEqual(utility);
    expect(utility.rows.length).toBeGreaterThanOrEqual(30);
  }, 120_000);
});
