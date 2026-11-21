import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { canApplyScenario, fixtureFromScenarioDraft, readScenarioFile, scenarioInteger, ScenarioPanel, ScenarioResult } from '../src/components/ScenarioPanel';
import type { ScenarioDraft, ScenarioPreview } from '../src/components/ScenarioPanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { encodeScenarioFixture, replayScenarioAsync, scenarioInitialTargets, SCENARIO_MAX_BYTES } from '../src/engine/scenarioEngine';

const draft: ScenarioDraft = { seed: '54', profileId: 'classic', endTick: '3', commands: [{ tick: 1, command: { type: 'DEMONIC_TIDE' } }] };
const noAction = () => false;
const noop = () => undefined;

describe('scenario authoring, isolated preview, and explicit application', () => {
  it('validates bounded numbers, size before reading, canonical typed targets, and rejects any secret-bearing extra field', async () => {
    const built = fixtureFromScenarioDraft(draft);
    expect(built).toMatchObject({ seed: 54, profileId: 'classic', endTick: 3, version: 1, ruleset: 1 });
    expect(scenarioInteger(' 4294967295 ', 0xffffffff)).toBe(0xffffffff);
    for (const invalid of ['', '-1', '1e1', 'NaN', '4294967296']) expect(scenarioInteger(invalid, 0xffffffff)).toBeUndefined();
    expect(() => fixtureFromScenarioDraft({ ...draft, endTick: '121' })).toThrow('1 至 120');
    const neverRead = vi.fn();
    await expect(readScenarioFile({ size: SCENARIO_MAX_BYTES + 1, text: neverRead })).rejects.toThrow('32 KiB');
    expect(neverRead).not.toHaveBeenCalled();
    const exported = encodeScenarioFixture(built);
    expect(Object.keys(JSON.parse(exported)).sort()).toEqual(['commands', 'endTick', 'format', 'profileId', 'ruleset', 'seed', 'version']);
    await expect(readScenarioFile({ size: exported.length, text: async () => exported })).resolves.toEqual(built);
    const secret = JSON.stringify({ ...built, apiKey: 'do-not-retain-token' });
    await expect(readScenarioFile({ size: secret.length, text: async () => secret })).rejects.toMatchObject({ code: 'schema' });
    const broken = JSON.stringify({ ...built, commands: [{ tick: 1, command: { type: 'SPAWN_TREASURE', targetLocationId: 'missing-site' } }] });
    await expect(readScenarioFile({ size: broken.length, text: async () => broken })).rejects.toMatchObject({ code: 'initial_ref', commandIndex: 0 });
  });

  it('runs a real deterministic offline preview without replacing authority, shows only public outcome, and rejects stale review', async () => {
    const authority = createInitialWorld(102);
    const expected = structuredClone(authority);
    const fixture = fixtureFromScenarioDraft(draft);
    const result = await replayScenarioAsync(fixture);
    expect(result).toEqual(await replayScenarioAsync(fixture));
    expect(authority).toEqual(expected);
    expect(result.tick).toBe(3);
    result.events.push({ id: 'not-a-public-event', tick: 3, year: result.year, month: result.month, title: '只供当事人的内容',
      description: '内部事件', category: 'intrigue', actorIds: [], witnessScope: 'participants' });
    const preview: ScenarioPreview = { result, fixture, authority, revision: 1 };
    expect(canApplyScenario(preview, authority, 1, false)).toBe(true);
    expect(canApplyScenario(preview, authority, 2, false)).toBe(false);
    expect(canApplyScenario(preview, expected, 1, false)).toBe(false);
    expect(canApplyScenario(preview, authority, 1, true)).toBe(false);
    const markup = (ready: boolean, changed: boolean, confirming: boolean) => renderToStaticMarkup(<ScenarioResult preview={preview} ready={ready}
      changed={changed} confirming={confirming} onConfirm={noop} onApply={noop} onCancel={noop} />);
    expect(markup(true, false, false)).toContain('尚未载入');
    expect(markup(true, false, false)).toContain('载入预演后的世界');
    expect(markup(true, false, false)).not.toContain('确认替换当前世界');
    expect(markup(true, false, false)).not.toContain('只供当事人的内容');
    const reviewed = markup(true, false, true);
    expect(reviewed).toContain('确认替换当前世界');
    expect(reviewed).toContain('本机存档槽与模型设置仍保留');
    expect(markup(false, true, true)).toMatch(/<button[^>]*disabled=""[^>]*>确认替换当前世界/);
  });

  it('keeps the editor off the default map and offers only typed profile/target controls and fixture exchange', () => {
    const world = createInitialWorld(32, 'spirit-bloom');
    const markup = renderToStaticMarkup(<ScenarioPanel world={world} busy={false} onApply={noAction} />);
    expect(markup).toContain('value="spirit-bloom" selected=""');
    expect(markup).toContain('导入剧本 JSON（最大 32 KiB）');
    expect(markup).toContain('导出剧本 JSON');
    expect(markup).toContain('不含存档数据、聊天原文或模型服务凭证');
    expect(markup).toContain('离线预演');
    expect(markup).toContain(scenarioInitialTargets(32, 'spirit-bloom').locations[0].name);
    expect(markup).not.toContain('确认替换当前世界');
    expect(renderToStaticMarkup(<App />)).not.toContain('剧本编辑与复演');
    expect(renderToStaticMarkup(<App initialWorkspace="world" />)).toContain('剧本编辑与复演');
  });
});
