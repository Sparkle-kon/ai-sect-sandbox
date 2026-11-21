import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableHouseholdNameActions, HOUSEHOLD_NAME_ALIASES } from '../src/engine/householdNameEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { availableSettlementActions, resolveSettlementAction } from '../src/engine/settlementEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-household-name' };
const respond = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(9);
  const sponsor = world.cultivators.find(({ id }) => id === 'npc-1')!;
  const witness = world.cultivators.find(({ id }) => id === 'npc-6')!;
  const remote = world.cultivators.find(({ id }) => id === 'npc-3')!;
  const village = world.settlements.villages.find(({ locationId }) => locationId === 'loc-market')!;
  sponsor.locationId = witness.locationId = village.locationId;
  witness.qiProgress = 25;
  const recruit = availableSettlementActions(sponsor, world).find(({ action }) => action === 'RECRUIT_SETTLER')!;
  expect(resolveSettlementAction(world, sponsor, { ...recruit, chosenAction: 'RECRUIT_SETTLER', innerMonologue: '' })).not.toBeNull();
  const person = world.cultivators.find(({ id }) => id === 'recruit-' + recruit.targetVolunteerId)!;
  world.tick++;
  const proposal = { chosenAction: 'HOUSEHOLD_NAME', nameMove: 'offer', householdAlias: HOUSEHOLD_NAME_ALIASES[0],
    innerMonologue: '我愿登记这个称名。' } as const;
  const apply = (actor: Cultivator, decision: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, decision, () => .99);
  return { world, village, sponsor, witness, remote, person, proposal, apply };
}

describe('household name bindings in both brains', () => {
  it('copies a resident’s available fixed alias, rejecting free text, extraneous affiliation and identity links', async () => {
    const { world, village, witness, person, proposal, apply } = fixture();
    expect(availableHouseholdNameActions(person, world, world.tick + 1)).toContainEqual({
      action: 'HOUSEHOLD_NAME', nameMove: 'offer', householdAlias: proposal.householdAlias,
    });
    const mock = vi.fn(async (_endpoint: RequestInfo | URL, _init?: RequestInit) =>
      respond({ ...proposal, householdAlias: '任意虚构名字' }));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(person, world, config, world.tick + 1)).resolves.toBeUndefined();
    for (const injected of [{ targetCultivatorId: witness.id }, { targetSettlementId: village.id },
      { householdId: 'invented' }, { sectId: witness.sectId }, { parents: [witness.id] }]) {
      mock.mockImplementation(async () => respond({ ...proposal, ...injected }));
      await expect(requestCultivatorLLMDecision(person, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async () => respond(proposal));
    const allowed = await requestCultivatorLLMDecision(person, world, config, world.tick + 1);
    expect(allowed).toMatchObject(proposal);
    expect(mock.mock.calls.at(-1)?.[1]?.body).toContain('称名登记仅用所列');
    world.tick++;
    const stable = [person.id, person.name, person.sectId, world.cultivators.length];
    expect(apply(person, allowed!)).not.toBeNull();
    expect(world.householdNames.entries[0]).toMatchObject({ status: 'proposed', actorId: person.id, alias: proposal.householdAlias });
    expect([person.id, person.name, person.sectId, world.cultivators.length]).toEqual(stable);
  });

  it('verifies only a distinct actual local witness and only on a later eligible turn', async () => {
    const { world, witness, remote, person, proposal, apply } = fixture();
    expect(apply(person, proposal)).not.toBeNull();
    const row = world.householdNames.entries[0];
    const verify = { chosenAction: 'HOUSEHOLD_NAME', nameMove: 'verify', targetHouseholdNameId: row.id,
      innerMonologue: '我亲见本人自愿登记。' } as const;
    const mocked = vi.fn(async () => respond(verify));
    vi.stubGlobal('fetch', mocked);
    await expect(requestCultivatorLLMDecision(person, world, config, world.tick + 1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(remote, world, config, world.tick + 1)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(witness, world, config, world.tick)).resolves.toBeUndefined();
    mocked.mockImplementation(async () => respond({ ...verify, householdAlias: proposal.householdAlias }));
    await expect(requestCultivatorLLMDecision(witness, world, config, world.tick + 1)).resolves.toBeUndefined();
    mocked.mockImplementation(async () => respond(verify));
    const actual = await requestCultivatorLLMDecision(witness, world, config, world.tick + 1);
    expect(actual).toMatchObject(verify);
    world.tick++;
    expect(computeHeuristicDecision(witness, world, () => .99)).toMatchObject({
      chosenAction: 'HOUSEHOLD_NAME', nameMove: 'verify', targetHouseholdNameId: row.id,
    });
    expect(apply(witness, actual!)).not.toBeNull();
    expect(apply(witness, actual!)).toBeNull();
    expect(row).toMatchObject({ actorId: person.id, status: 'verified', witnessId: witness.id });
  });

  it('requires the register owner, a field-free clear proposal and the exact record for withdrawal', async () => {
    const { world, person, witness, proposal, apply } = fixture();
    expect(apply(person, proposal)).not.toBeNull();
    world.tick++;
    const alias = world.householdNames.entries[0];
    expect(apply(witness, { chosenAction: 'HOUSEHOLD_NAME', nameMove: 'verify', targetHouseholdNameId: alias.id, innerMonologue: '' })).not.toBeNull();
    const clear = { chosenAction: 'HOUSEHOLD_NAME', nameMove: 'offer_clear', innerMonologue: '自愿撤去称名。' } as const;
    const mock = vi.fn(async () => respond({ ...clear, householdAlias: proposal.householdAlias }));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(person, world, config, world.tick + 1)).resolves.toBeUndefined();
    mock.mockImplementation(async () => respond(clear));
    await expect(requestCultivatorLLMDecision(witness, world, config, world.tick + 1)).resolves.toBeUndefined();
    const allowed = await requestCultivatorLLMDecision(person, world, config, world.tick + 1);
    expect(allowed).toMatchObject(clear);
    world.tick++;
    expect(apply(person, allowed!)).not.toBeNull();
    const pending = world.householdNames.entries.find(({ status, kind }) => status === 'proposed' && kind === 'clear')!;
    const withdraw = { chosenAction: 'HOUSEHOLD_NAME', nameMove: 'withdraw', targetHouseholdNameId: pending.id, innerMonologue: '我撤回本人申请。' } as const;
    mock.mockImplementation(async () => respond({ ...withdraw, targetHouseholdNameId: alias.id }));
    await expect(requestCultivatorLLMDecision(person, world, config, world.tick + 1)).resolves.toBeUndefined();
    mock.mockImplementation(async () => respond(withdraw));
    await expect(requestCultivatorLLMDecision(witness, world, config, world.tick + 1)).resolves.toBeUndefined();
    const revoke = await requestCultivatorLLMDecision(person, world, config, world.tick + 1);
    expect(revoke).toMatchObject(withdraw);
    world.tick++;
    expect(apply(person, revoke!)).not.toBeNull();
    expect(pending.status).toBe('withdrawn');
    expect(alias.status).toBe('verified');
  });

  it('does not invent a registration before the optional cadence, but can propose with a naturally cautious recruit', () => {
    const { world, person } = fixture();
    const snapshotCount = world.householdNames.entries.length;
    expect(computeHeuristicDecision(person, world, () => .99).chosenAction).not.toBe('HOUSEHOLD_NAME');
    let result: LLMDecisionPayload | undefined;
    for (let tick = 36; tick <= 98; tick++) {
      world.tick = tick;
      const candidate = computeHeuristicDecision(person, world, () => .99);
      if (candidate.chosenAction === 'HOUSEHOLD_NAME') { result = candidate; break; }
    }
    expect(person.personality).toBe('苟道');
    expect(result).toMatchObject({ chosenAction: 'HOUSEHOLD_NAME', nameMove: 'offer', householdAlias: HOUSEHOLD_NAME_ALIASES[0] });
    expect(world.householdNames.entries).toHaveLength(snapshotCount);
  });
});
