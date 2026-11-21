import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DecisionComparisonView, DecisionTracePanel } from '../src/components/DecisionTracePanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { knownMapLocations } from '../src/engine/terrainEngine';
import type { DecisionReplayComparison } from '../src/engine/decisionTraceEngine';
import type { Cultivator, DecisionTraceRecord } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.tick = 8;
  const [viewer, distant] = world.cultivators;
  viewer.name = '观察中的修士';
  viewer.innerMonologue = '禁止呈现的底层独白';
  viewer.secretGoal = '禁止呈现的秘密目标';
  viewer.exploredTileIds = [];
  viewer.rumors = [];
  distant.locationId = world.locations.find(({ id }) => id !== viewer.locationId)!.id;
  distant.name = '隐藏的远方人物';
  const available = new Set(knownMapLocations(world, viewer).map(({ id }) => id));
  const hidden = world.locations.find(({ id }) => !available.has(id))!;
  hidden.name = '禁止呈现的隐秘场所';
  const trace: DecisionTraceRecord = {
    id: 'local-trace', actorId: viewer.id, tick: 7, source: 'model', applied: true,
    chosenAction: 'CULTIVATE', chosenCandidateId: 'actual', candidates: [
      { id: 'actual', action: 'CULTIVATE', score: 9.25, reason: 'cultivate' },
      { id: 'alternate-rest', action: 'REST', score: 8.25, reason: 'recover' },
      { id: 'candidate-including-secret-target-key', action: 'EXPLORE', score: 4.5, reason: 'travel', targetLocationId: hidden.id },
      { id: 'candidate-including-secret-person-key', action: 'SOCIALIZE', score: 4, reason: 'social', targetCultivatorId: distant.id },
    ],
  };
  world.decisionTrace.records.push(trace, { ...trace, id: 'someone-else-record', actorId: distant.id }, { ...trace, id: 'future-record', tick: 9 });
  const html = (actor: Cultivator | undefined = viewer) => renderToStaticMarkup(<DecisionTracePanel
    world={world} cultivator={actor} historical onReplay={() => ({ ok: false, reason: '此造参照不能复盘。' })} />);
  return { trace, html, world };
}

describe('decision trace and isolated replay presentation', () => {
  it('renders sanitized scores, source, applied state and only permitted alternatives in the inspected view', () => {
    const { html } = fixture();
    const output = html();
    expect(output).toContain('来源：模型选项 · 动作已应用');
    expect(output).toContain('修炼 · 效用 9.25 · 积累修为');
    expect(output).toContain('不是当时的实际权重或模型判断');
    expect(output).toContain('候选 1 · 调息');
    expect(output).not.toContain('候选 1 · 修炼');
    expect(output).toContain('地点未公开');
    expect(output).toContain('对象未公开');
    expect(output).toContain('当前是只读历史');
    expect(output).toContain('不改写原时间线');
    expect(output).toMatch(/<button[^>]*disabled=""[^>]*>运行单回合复盘/);
    for (const secret of ['禁止呈现', '隐藏的远方人物', 'secret-target-key', 'secret-person-key', 'someone-else-record', 'future-record']) {
      expect(output).not.toContain(secret);
    }
  });

  it('does not offer replay for redacted or unapplied committed decisions, or expose global records', () => {
    const { trace, html, world } = fixture();
    trace.applied = false;
    expect(html()).toContain('动作未应用');
    expect(html()).not.toContain('运行单回合复盘');
    trace.applied = true;
    trace.source = 'avatar';
    expect(html()).toContain('附身指令');
    expect(html()).not.toContain('运行单回合复盘');
    trace.chosenAction = 'redacted';
    delete trace.chosenCandidateId;
    expect(html()).toContain('未公开行动');
    expect(html()).not.toContain('运行单回合复盘');
    expect(renderToStaticMarkup(<DecisionTracePanel world={world} cultivator={undefined} />)).not.toContain('local-trace');
  });

  it('states differences side by side without showing raw decision or candidate identifiers', () => {
    const baseline: DecisionReplayComparison['baseline'] = {
      alive: true, hp: 42, qiProgress: 20, realm: '练气', realmStage: 4, livingCount: 14, publicEventCount: 3,
    };
    const comparison: DecisionReplayComparison = {
      tick: 8, actorId: 'private-actor-id', alternateCandidateId: 'private-candidate-id', baseline,
      alternate: { ...baseline, hp: 51, qiProgress: 17, publicEventCount: 4 },
    };
    const result = renderToStaticMarkup(<DecisionComparisonView comparison={comparison} />);
    expect(result).toContain('Tick #8 单回合结果（未保存）');
    expect(result).toContain('替代行动');
    expect(result).toContain('+9');
    expect(result).toContain('-3 个百分点');
    expect(result).toContain('无变化');
    expect(result).not.toContain('private-');
  });
});
