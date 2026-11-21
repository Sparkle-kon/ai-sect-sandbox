import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createScenarioFixture, decodeScenarioFixture, encodeScenarioFixture, replayScenario, replayScenarioAsync, scenarioInitialTargets } from '../src/engine/scenarioEngine';
import { encodeWorldSave, decodeWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { sameGeneratedWorld } from '../src/engine/worldIdentity';
import type { ScenarioObjective } from '../src/types/world';

afterEach(() => vi.unstubAllGlobals());
const seed = 32;
const profile = 'classic' as const;

describe('portable static era audit receipts', () => {
  it('keeps the old wire format and world identity while version 2 binds all four structured proofs into one deterministic frozen receipt', async () => {
    const v1 = createScenarioFixture(seed, profile, 4);
    expect(encodeScenarioFixture(v1)).toBe('{"format":"ai-sect-scenario","version":1,"ruleset":1,"seed":32,"profileId":"classic","endTick":4,"commands":[]}');
    expect(decodeScenarioFixture(encodeScenarioFixture(v1))).toEqual(v1);
    const targets = scenarioInitialTargets(seed, profile);
    const chosen: ScenarioObjective[] = [
      { kind: 'living_population', minimum: 100_000 },
      { kind: 'cultivator_survives', actorId: targets.cultivators[0].id },
      { kind: 'site_qi', locationId: targets.locations[0].id, minimum: 0 },
      { kind: 'sect_treasury', sectId: targets.sects[0].id, minimum: 0 },
    ];
    const checked = createScenarioFixture(seed, profile, 4, [], chosen);
    expect(checked).toMatchObject({ version: 2, ruleset: 1, objectives: chosen });
    expect(decodeScenarioFixture(encodeScenarioFixture(checked))).toEqual(checked);
    const forbiddenNetwork = vi.fn(async () => { throw Error('must replay offline'); });
    vi.stubGlobal('fetch', forbiddenNetwork);
    const plain = replayScenario(v1);
    expect(plain.scenarioAudit).toBeUndefined();
    const replayed = replayScenario(checked);
    const again = await replayScenarioAsync(checked, { yieldEvery: 1 });
    const audit = replayed.scenarioAudit!;
    expect(again.scenarioAudit).toEqual(audit);
    expect(again.scenarioOrigin).toEqual(replayed.scenarioOrigin);
    expect(audit).toMatchObject({ version: 1, scenarioId: replayed.scenarioOrigin!.id, seed, profileId: profile, evaluatedTick: 4 });
    expect(audit.cards.map(({ id }) => id)).toEqual(['objective-1', 'objective-2', 'objective-3', 'objective-4']);
    expect(audit.cards[0]).toMatchObject({
      passed: false, evidence: { kind: 'living_population', count: replayed.cultivators.filter(({ alive, hp }) => alive && hp > 0).length },
    });
    expect(audit.cards[2]).toMatchObject({ passed: true, evidence: { kind: 'site_qi', found: true } });
    expect(audit.cards[3]).toMatchObject({ passed: true, evidence: { kind: 'sect_treasury', found: true } });
    expect(sameGeneratedWorld(replayed, plain)).toBe(false);
    expect(replayed.cultivators).toEqual(plain.cultivators);
    expect(replayed.sects).toEqual(plain.sects);
    expect(forbiddenNetwork).not.toHaveBeenCalled();

    const estimate = decodeWorldSave(encodeWorldSave(replayed));
    expect(estimate.scenarioAudit).toEqual(audit);
    const later = advanceWorldTick(estimate);
    expect(later.tick).toBe(5);
    expect(later.scenarioAudit).toEqual(audit);
    expect(later.scenarioAudit?.cards).toHaveLength(4);

    const forged = structuredClone(replayed);
    forged.scenarioAudit!.cards[0].passed = true;
    expect(() => encodeWorldSave(forged)).toThrow(/scenarioAudit.cards.verdict/);
    const leaked = structuredClone(replayed);
    leaked.scenarioAudit!.scenarioId = plain.scenarioOrigin!.id;
    expect(() => encodeWorldSave(leaked)).toThrow(/scenarioAudit.authority/);
    const missing = structuredClone(replayed);
    delete missing.scenarioAudit;
    expect(() => encodeWorldSave(missing)).toThrow(/scenarioAudit.authority/);
  });

  it('rejects unsupported keys, wrong-world IDs and duplicate objectives, and never applies an aborted comparison', async () => {
    const earlier = createScenarioFixture(seed, profile, 5);
    const raw = JSON.parse(encodeScenarioFixture(earlier)) as Record<string, unknown>;
    expect(() => decodeScenarioFixture(JSON.stringify({ ...raw, version: 2, objectives: [] }))).toThrow(/纪元目标/);
    expect(() => decodeScenarioFixture(JSON.stringify({ ...raw, version: 2, objectives: [
      { kind: 'living_population', minimum: 10, privateInstruction: 'not a criterion' },
    ] }))).toThrow(/纪元目标/);
    expect(() => createScenarioFixture(seed, profile, 5, [], [
      { kind: 'living_population', minimum: 10 }, { kind: 'living_population', minimum: 11 },
    ])).toThrow(/纪元目标/);
    expect(() => createScenarioFixture(seed, profile, 5, [], [
      { kind: 'site_qi', locationId: 'loc-foreign-branch', minimum: 1 },
    ])).toThrow(/起始人物、地点或宗门/);
    const checked = createScenarioFixture(seed, profile, 6, [], [{ kind: 'living_population', minimum: 20 }]);
    const existing = createInitialWorld(seed + 1, profile);
    const unchanged = structuredClone(existing);
    const stop = new AbortController();
    await expect(replayScenarioAsync(checked, {
      signal: stop.signal,
      yieldEvery: 1,
      onProgress: ({ tick }) => { if (tick >= 1) stop.abort(); },
    })).rejects.toMatchObject({ code: 'aborted' });
    expect(existing).toEqual(unchanged);
    expect(existing.scenarioAudit).toBeUndefined();
    expect(existing.scenarioOrigin).toBeUndefined();
  });
});
