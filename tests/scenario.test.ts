import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createScenarioFixture, decodeScenarioFixture, encodeScenarioFixture, replayScenario, replayScenarioAsync,
  ScenarioError, scenarioInitialTargets, SCENARIO_MAX_BYTES, SCENARIO_MAX_COMMANDS, SCENARIO_MAX_TICKS,
  SCENARIO_WHISPER_CUES, validateScenarioFixture } from '../src/engine/scenarioEngine';
import { advanceWorldTick, executeGodIntervention } from '../src/engine/worldEngine';

describe('strict portable game scenarios and isolated offline replay', () => {
  it('exports only portable allowlisted fields and regenerates the same canonical scenario from JSON', () => {
    const fixture = createScenarioFixture(0xffffffff, 'spirit-bloom', 5, [
      { tick: 1, command: { type: 'SPAWN_TREASURE', targetLocationId: 'loc-market' } },
      { tick: 3, command: { type: 'WHISPER_MIND', targetCultivatorId: 'npc-1', cue: 'rest' } },
    ]);
    const encoded = encodeScenarioFixture(fixture);
    expect(encoded).not.toContain(SCENARIO_WHISPER_CUES.rest);
    expect(encoded).not.toMatch(/apiKey|innerMonologue|worldgen|locationId\":\"loc-market\",\"name/);
    expect(decodeScenarioFixture(encoded)).toEqual(fixture);
    expect(createScenarioFixture(-0, 'classic').seed).toBe(0);
    const reordered = { commands: fixture.commands, endTick: 5, profileId: 'spirit-bloom', seed: 0xffffffff,
      ruleset: 1, version: 1, format: 'ai-sect-scenario' };
    expect(encodeScenarioFixture(reordered)).toBe(encoded);
    expect(replayScenario(reordered)).toEqual(replayScenario(fixture));
    expect(scenarioInitialTargets(0xffffffff, 'spirit-bloom').cultivators.some(({ id }) => id.startsWith('founder-'))).toBe(true);
  });

  it('rejects heavyweight, mixed-version, unsorted, prototype and credential-bearing fixtures', () => {
    const fixture = createScenarioFixture(123, 'classic', 2);
    const two = { tick: 2, command: { type: 'DEMONIC_TIDE' as const } };
    const one = { tick: 1, command: { type: 'DEMONIC_TIDE' as const } };
    expect(() => validateScenarioFixture({ ...fixture, ruleset: 2 })).toThrow(ScenarioError);
    expect(() => validateScenarioFixture({ ...fixture, profileId: '__proto__' })).toThrow(ScenarioError);
    expect(() => validateScenarioFixture({ ...fixture, seed: 4.5 })).toThrow(ScenarioError);
    expect(() => validateScenarioFixture({ ...fixture, endTick: SCENARIO_MAX_TICKS + 1 })).toThrow(ScenarioError);
    expect(() => validateScenarioFixture({ ...fixture, commands: Array(SCENARIO_MAX_COMMANDS + 1).fill(one) })).toThrow(ScenarioError);
    expect(() => validateScenarioFixture({ ...fixture, commands: [two, one] })).toThrow(ScenarioError);
    expect(() => validateScenarioFixture({ ...fixture, commands: [{ tick: 3, command: two.command }] })).toThrow(ScenarioError);
    expect(() => encodeScenarioFixture({ ...fixture, config: { apiKey: 'not-exportable' } })).toThrow(ScenarioError);
    expect(() => decodeScenarioFixture(JSON.stringify({ ...fixture, commands: [
      { tick: 1, command: { type: 'WHISPER_MIND', targetCultivatorId: 'npc-1', cue: 'rest', whisperText: 'unsafe free text' } },
    ] }))).toThrow(ScenarioError);
    expect(() => validateScenarioFixture({ ...fixture, commands: [
      { tick: 1, command: { type: 'WHISPER_MIND', targetCultivatorId: 'npc-1', cue: 'secret-value' } },
    ] })).toThrow(ScenarioError);
    expect(() => decodeScenarioFixture('坏'.repeat(Math.ceil(SCENARIO_MAX_BYTES / 3)))).toThrow(ScenarioError);
    const accessor = { ...fixture };
    Object.defineProperty(accessor, 'seed', { enumerable: true, get: () => { throw new Error('must not run'); } });
    expect(() => validateScenarioFixture(accessor)).toThrow(ScenarioError);
    expect(() => decodeScenarioFixture('{"unexpected":}')).toThrow(ScenarioError);
  });

  it('executes same-tick choices in declared order using the unchanged native offline simulation', () => {
    const steps = [
      { tick: 1, command: { type: 'SPAWN_TREASURE' as const, targetLocationId: 'loc-market' } },
      { tick: 1, command: { type: 'DEMONIC_TIDE' as const } },
      { tick: 2, command: { type: 'TRIBULATION_STRIKE' as const, targetCultivatorId: 'npc-1' } },
    ];
    const fixture = createScenarioFixture(71, 'fractured-frontier', 5, steps);
    const built = replayScenario(fixture);
    const key = built.scenarioOrigin;
    expect(key).toMatchObject({ version: 1, ruleset: 1, id: /^scenario-[0-9a-f]{32}$/, endTick: 5 });
    const other = replayScenario(createScenarioFixture(71, 'fractured-frontier', 5, [steps[1], steps[0], steps[2]]));
    expect(other.scenarioOrigin?.id).not.toBe(key?.id);
    expect(other.random.seed).toBe(built.random.seed);
    const parent = createInitialWorld(71, 'fractured-frontier');
    let manual = executeGodIntervention(parent, steps[0].command);
    manual = executeGodIntervention(manual, steps[1].command);
    manual = advanceWorldTick(manual);
    manual = executeGodIntervention(manual, steps[2].command);
    while (manual.tick < fixture.endTick) manual = advanceWorldTick(manual);
    delete built.scenarioOrigin;
    expect(built).toEqual(manual);
    expect(parent.tick).toBe(1);
    expect(parent.interventionSequence).toBe(0);
    expect(parent.scenarioOrigin).toBeUndefined();
  });

  it('rejects nonexistent initial/late dead targets with the failed command index, without altering an existing world', () => {
    const parent = createInitialWorld(0);
    const frozen = structuredClone(parent);
    expect(() => createScenarioFixture(0, 'classic', 4, [
      { tick: 2, command: { type: 'SPAWN_TREASURE', targetLocationId: 'nonexistent-location' } },
    ])).toThrow(expect.objectContaining({ code: 'initial_ref', tick: 2, commandIndex: 0 }));
    // Seed 0 produces a naturally deceased initial named NPC by the validated final calendar tick.
    const late = createScenarioFixture(0, 'classic', 120, [{ tick: 120, command: { type: 'TRIBULATION_STRIKE', targetCultivatorId: 'npc-4' } }]);
    expect(() => replayScenario(late)).toThrow(expect.objectContaining({ code: 'execution_ref', tick: 120, commandIndex: 0 }));
    expect(parent).toEqual(frozen);
  }, 15_000);

  it('runs async cooperatively, shares exactly the sync result, avoids live providers, and aborts without result', async () => {
    const fetched = vi.spyOn(globalThis, 'fetch');
    try {
      const fixture = createScenarioFixture(15, 'classic', 9, [{ tick: 4, command: { type: 'DEMONIC_TIDE' } }]);
      const progress: Array<{ tick: number; completedCommands: number }> = [];
      const final = await replayScenarioAsync(fixture, { yieldEvery: 2, onProgress: (point) => { progress.push(point); } });
      expect(final).toEqual(replayScenario(fixture));
      expect(progress[0]).toMatchObject({ tick: 1, completedCommands: 0 });
      expect(progress.at(-1)).toMatchObject({ tick: 9, completedCommands: 1 });
      const cancel = new AbortController();
      const promise = replayScenarioAsync(fixture, { yieldEvery: 1, signal: cancel.signal });
      setTimeout(() => cancel.abort(), 0);
      await expect(promise).rejects.toMatchObject({ code: 'aborted' });
      expect(fetched).not.toHaveBeenCalled();
    } finally { fetched.mockRestore(); }
  });
});
