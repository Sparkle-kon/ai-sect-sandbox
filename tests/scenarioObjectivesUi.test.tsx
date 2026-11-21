import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { createInitialWorld } from '../src/data/initialWorld';
import { encodeScenarioFixture, replayScenarioAsync, scenarioInitialTargets } from '../src/engine/scenarioEngine';
import { canApplyScenario, fixtureFromScenarioDraft, readScenarioFile, ScenarioPanel, ScenarioResult } from '../src/components/ScenarioPanel';
import type { ScenarioDraft, ScenarioPreview } from '../src/components/ScenarioPanel';
import { objectiveFromInputs, ScenarioAuditCards, ScenarioObjectiveEditor } from '../src/components/ScenarioObjectives';

const noop = () => {};
const seed = 54;
const catalog = () => scenarioInitialTargets(seed, 'classic');
const initialDraft: ScenarioDraft = { seed: String(seed), profileId: 'classic', endTick: '1', commands: [] };

describe('scenario objective authoring and result presentation', () => {
  it('fits one closed typed objective editor, with bounded choices and no home addition', () => {
    const world = createInitialWorld(seed);
    const choices = catalog();
    const source = renderToStaticMarkup(<ScenarioPanel world={world} busy={false} onApply={() => false} />);
    expect(source).toMatch(/<details class="[^"]+"><summary class="[^"]+">纪元目标 · 0\/6/);
    expect(source).toContain('加入或移除目标后须重新预演');
    expect(source).toContain('指定地点灵气');
    expect(source).toContain('指定宗门公库');
    expect(source).not.toContain('纪元目标凭证');
    expect(renderToStaticMarkup(<App />)).not.toContain('纪元目标');
    expect(objectiveFromInputs('site_qi', choices.locations[0].id, '150', choices)).toMatchObject({ minimum: 150 });
    expect(objectiveFromInputs('site_qi', choices.locations[0].id, '151', choices)).toBeUndefined();
    expect(objectiveFromInputs('sect_treasury', 'not-a-sect', '1', choices)).toBeUndefined();
    expect(objectiveFromInputs('living_population', '', '2.5', choices)).toBeUndefined();
    expect(objectiveFromInputs('living_population', '', '0', choices)).toBeUndefined();
    const added = renderToStaticMarkup(<ScenarioObjectiveEditor catalog={choices} objectives={[{ kind: 'living_population', minimum: 2 }]} onChange={noop} />);
    expect(added).toContain('纪元目标 · 1/6');
    expect(added).toContain('目标 1 · 在世修士 ≥ 2 人');
    expect(added).toContain('移除目标 1');
  });

  it('exports and imports typed v2 objectives without changing ordinary v1, and shows real measured pass/fail', async () => {
    const choices = catalog();
    const original = fixtureFromScenarioDraft(initialDraft);
    expect(JSON.parse(encodeScenarioFixture(original))).not.toHaveProperty('objectives');
    const goals = [
      { kind: 'living_population' as const, minimum: 1 },
      { kind: 'sect_treasury' as const, sectId: choices.sects[0].id, minimum: 50_000 },
    ];
    const fixture = fixtureFromScenarioDraft({ ...initialDraft, objectives: goals });
    expect(fixture.version).toBe(2);
    const encoded = encodeScenarioFixture(fixture);
    await expect(readScenarioFile({ size: encoded.length, text: async () => encoded })).resolves.toEqual(fixture);
    const authority = createInitialWorld(99);
    const prior = structuredClone(authority);
    const result = await replayScenarioAsync(fixture);
    const replay = await replayScenarioAsync(fixture);
    expect(result.scenarioAudit).toEqual(replay.scenarioAudit);
    expect(authority).toEqual(prior);
    const preview: ScenarioPreview = { fixture, result, authority, revision: 3 };
    expect(canApplyScenario(preview, authority, 3, false)).toBe(true);
    expect(canApplyScenario(preview, authority, 4, false)).toBe(false);
    const html = renderToStaticMarkup(<ScenarioResult preview={preview} ready={false} changed={true} confirming={false}
      onApply={noop} onCancel={noop} onConfirm={noop} />);
    expect(html).toContain('离线预演终点凭证，尚未载入当前世界');
    expect(html).toContain('纪元目标凭证 · 达成 1/2');
    expect(html).toContain('达成 · 在世修士 ≥ 1 人');
    expect(html).toContain('未达成 · ');
    expect(html).toMatch(/实测公库 [\d]+ 灵石（库中 [\d]+ · 流转中 0）/);
    expect(html).toContain('当前世界自预演开始后已变化');
  });

  it('does not re-evaluate accepted historical end evidence after later ticks or balances change', async () => {
    const { sects } = catalog();
    const fixture = fixtureFromScenarioDraft({ ...initialDraft, objectives: [{ kind: 'sect_treasury', sectId: sects[0].id, minimum: 50_000 }] });
    const world = await replayScenarioAsync(fixture);
    world.tick = 8;
    world.sects.find(({ id }) => id === sects[0].id)!.spiritStones = 50_000;
    const html = renderToStaticMarkup(<ScenarioAuditCards world={world} />);
    expect(html).toContain('核定 Tick #1');
    expect(html).toContain('现为 Tick #8；后续回合不改写已核定结果');
    expect(html).toContain('纪元目标凭证 · 达成 0/1');
    expect(html).not.toContain('实测公库 50000');
  });
});
