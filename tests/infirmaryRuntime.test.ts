import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceInfirmaries, availableInfirmaryActions, visibleInfirmaries } from '../src/engine/infirmaryEngine';
import { computeHeuristicDecision, queryCultivatorLLMDecision } from '../src/engine/llmBrain';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture' };
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '按旧规则就地调息' };
const intake = <T extends Pick<LLMDecisionPayload, 'infirmaryMove'>>(fields: T): LLMDecisionPayload =>
  ({ ...fields, chosenAction: 'INFIRMARY', innerMonologue: '只核验本地床位与实际耗材' });
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(9301);
  world.tick = 14;
  const sect = world.sects.find(({ id }) => id === 'sect-danxia')!;
  const site = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const [critical, other, guard] = world.cultivators.filter((row) => row.sectId === sect.id && row.id !== sect.leaderId);
  const outsider = world.cultivators.find((row) => row.sectId !== sect.id)!;
  sect.facilities.alchemy_hall = 1;
  sect.spiritStones = 100;
  site.furnaceGrade = 1;
  site.herbs.jade_leaf = 5;
  for (const member of [critical, other, guard, outsider]) member.locationId = site.id;
  critical.hp = Math.round(critical.maxHp * .30);
  other.hp = Math.round(other.maxHp * .52);
  guard.hp = guard.maxHp;
  critical.pillToxicity = other.pillToxicity = 17;
  const apply = (actor: typeof critical, decision: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, decision, () => .99);
  return { world, sect, site, critical, other, guard, outsider, apply };
}

describe('runtime triage, real supplies and explicit decisions', () => {
  it('prioritizes higher need, validates the real canonical model path, and compares treatment with waiting and field rest', async () => {
    const { world, sect, site, critical, other, guard, outsider, apply } = fixture();
    const originalHp = critical.hp;
    expect(apply(critical, intake({ infirmaryMove: 'request' }))?.witnessScope).toBe('participants');
    expect(apply(other, intake({ infirmaryMove: 'request' }))).not.toBeNull();
    expect(apply(guard, intake({ infirmaryMove: 'staff' }))).not.toBeNull();
    const first = world.infirmaries.cases.find(({ patientId }) => patientId === critical.id)!;
    const second = world.infirmaries.cases.find(({ patientId }) => patientId === other.id)!;
    expect(availableInfirmaryActions(critical, world).some(({ infirmaryMove }) => infirmaryMove === 'accept')).toBe(false);
    expect(sect.spiritStones).toBe(100);
    expect(site.herbs.jade_leaf).toBe(5);
    world.tick++;
    const paused = structuredClone(world);
    advanceInfirmaries(paused);
    expect(paused.cultivators.find(({ id }) => id === critical.id)?.hp).toBe(originalHp);
    expect(paused.infirmaries.cases.find(({ id }) => id === first.id)?.status).toBe('waiting');
    const rested = structuredClone(paused);
    const fieldPatient = rested.cultivators.find(({ id }) => id === critical.id)!;
    applyCultivatorBrainDecision(rested, fieldPatient, rest, () => .99);
    expect(fieldPatient.hp).toBe(originalHp + Math.round(fieldPatient.maxHp * .35));
    expect(fieldPatient.pillToxicity).toBe(13);
    expect(rested.sects.find(({ id }) => id === sect.id)?.spiritStones).toBe(100);

    expect(availableInfirmaryActions(other, world).some(({ infirmaryMove }) => infirmaryMove === 'accept')).toBe(false);
    const rule = computeHeuristicDecision(critical, world, () => .99);
    expect(rule).toMatchObject({ chosenAction: 'INFIRMARY', infirmaryMove: 'accept', targetInfirmaryCaseId: first.id });
    const respond = (decision: LLMDecisionPayload) =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }));
    const reply = vi.fn(async () => respond(intake({ infirmaryMove: 'accept', targetInfirmaryCaseId: second.id })));
    vi.stubGlobal('fetch', reply);
    const source = vi.fn();
    await queryCultivatorLLMDecision(critical, world, config, source);
    expect(source).toHaveBeenLastCalledWith('utility');
    reply.mockImplementation(async () => respond(rule));
    const valid = await queryCultivatorLLMDecision(critical, world, config, source);
    expect(source).toHaveBeenLastCalledWith('llm');
    expect(apply(critical, valid)?.witnessScope).toBe('participants');
    expect(critical.hp).toBe(originalHp + Math.round(critical.maxHp * .55));
    expect(critical.hp).toBeGreaterThan(fieldPatient.hp);
    expect(critical.pillToxicity).toBe(7);
    expect(sect.spiritStones).toBe(88);
    expect(site.herbs.jade_leaf).toBe(3);
    expect(first).toMatchObject({ status: 'treated', receipt: { guardId: guard.id, stonesSpent: 12, herbsSpent: 2 } });
    expect(apply(critical, valid)).toBeNull();
    expect(availableInfirmaryActions(other, world).some(({ infirmaryMove }) => infirmaryMove === 'accept')).toBe(false);
    expect(visibleInfirmaries(world, outsider)).toBeUndefined();
    const restored = decodeWorldSave(encodeWorldSave(world));
    expect(restored.infirmaries).toEqual(world.infirmaries);
    const corrupt = structuredClone(restored);
    corrupt.infirmaries.cases.find(({ id }) => id === first.id)!.receipt!.stonesSpent++;
    expect(() => encodeWorldSave(corrupt)).toThrow(/infirmaries.cases.receipt/);
  });

  it('refusal remains genuinely free, and older worlds migrate without retroactive custody or costs', () => {
    const { world, critical, sect, site, apply } = fixture();
    const { infirmaries, ...older } = world;
    const restored = decodeWorldSave(JSON.stringify({ format: 'ai-sect-sandbox', version: 1, world: older }));
    expect(restored.infirmaries).toEqual(infirmaries);
    expect(apply(critical, intake({ infirmaryMove: 'request' }))).not.toBeNull();
    const row = world.infirmaries.cases[0];
    world.tick++;
    expect(apply(critical, intake({ infirmaryMove: 'refuse', targetInfirmaryCaseId: row.id }))).not.toBeNull();
    expect(row).toMatchObject({ status: 'refused', reason: 'refused' });
    expect(sect.spiritStones).toBe(100);
    expect(site.herbs.jade_leaf).toBe(5);
    expect(row.receipt).toBeUndefined();
  });
});
