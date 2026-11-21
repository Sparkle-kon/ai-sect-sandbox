import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveObservatoryAction } from '../src/engine/fieldObservatoryEngine';
import { availableInfirmaryActions, beginClinicDutyTurn, resolveInfirmaryAction, INFIRMARY_TREATMENT_HERBS, INFIRMARY_TREATMENT_STONES } from '../src/engine/infirmaryEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, InfirmaryMove, LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-clinic-handoff' };
const respond = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
afterEach(() => vi.unstubAllGlobals());

function fixture({ standby = true, funded = true, patientFunded = false } = {}) {
  const world = createInitialWorld(636);
  const sect = world.sects.find(({ id }) => id === 'sect-danxia')!;
  const hq = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const primary = world.cultivators.find(({ id }) => id === 'elder-danxia-1')!;
  const backstop = world.cultivators.find(({ id }) => id === 'elder-danxia-2')!;
  const patient = world.cultivators.find(({ id }) => id === 'npc-6')!;
  const stranger = world.cultivators.find(({ id }) => id === 'npc-1')!;
  sect.facilities.alchemy_hall = 2;
  sect.spiritStones = 100;
  hq.herbs.jade_leaf = 6;
  for (const person of [patient, primary, backstop]) {
    person.locationId = hq.id;
    person.qiProgress = 20;
    person.spiritStones = 100;
    person.hp = person.maxHp;
  }
  patient.hp = Math.floor(patient.maxHp * .4);
  world.tick = world.month = 9;
  const observationOpened = world.tick;
  if (funded) expect(resolveObservatoryAction(world, primary, { chosenAction: 'FIELD_OBSERVATORY',
    observatoryMove: 'fund', targetLocationId: hq.id, innerMonologue: '' })).not.toBeNull();
  if (patientFunded) expect(resolveObservatoryAction(world, patient, { chosenAction: 'FIELD_OBSERVATORY',
    observatoryMove: 'fund', targetLocationId: hq.id, innerMonologue: '' })).not.toBeNull();
  world.tick++; world.month++;
  const clinic = (actor: Cultivator, infirmaryMove: InfirmaryMove) =>
    resolveInfirmaryAction(world, actor, { chosenAction: 'INFIRMARY', infirmaryMove, innerMonologue: '' });
  expect(clinic(primary, 'staff')).not.toBeNull();
  const original = world.infirmaries.shifts[0];
  if (standby) expect(clinic(backstop, 'staff')).not.toBeNull();
  const alternate = world.infirmaries.shifts[1];
  expect(clinic(patient, 'request')).not.toBeNull();
  const row = world.infirmaries.cases[0];
  const handoff = { chosenAction: 'INFIRMARY', infirmaryMove: 'accept_handoff', targetInfirmaryCaseId: row.id,
    innerMonologue: '我明确同意由已值守的候补护诊。' } as const;
  const step = () => { world.tick++; world.month++; beginClinicDutyTurn(world); };
  const apply = (actor: Cultivator, decision: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, decision, () => .99);
  return { world, sect, hq, primary, backstop, patient, stranger, original, alternate, row, handoff, step, apply, observationOpened };
}

describe('clinic duty handoffs in both brains', () => {
  it('advertises only the exact next-turn case and consent, never actor/shift/reason/reward overrides', async () => {
    const { world, sect, hq, primary, backstop, patient, stranger, original, alternate, row, handoff, step, apply, observationOpened } = fixture();
    expect(availableInfirmaryActions(patient, world).some(({ infirmaryMove }) => infirmaryMove === 'accept_handoff')).toBe(false);
    const mock = vi.fn(async (_endpoint: RequestInfo | URL, _init?: RequestInit) => respond(handoff));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(patient, world, config, world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(stranger, world, config, world.tick + 1)).resolves.toBeUndefined();
    for (const extra of [{ targetInfirmaryCaseId: 'other-case' }, { guardId: primary.id }, { shiftId: alternate.id },
      { reason: 'imagined' }, { targetLocationId: hq.id }, { reward: 90 }]) {
      mock.mockImplementation(async () => respond({ ...handoff, ...extra }));
      await expect(requestCultivatorLLMDecision(patient, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async () => respond(handoff));
    const accepted = await requestCultivatorLLMDecision(patient, world, config, world.tick + 1);
    expect(accepted).toMatchObject(handoff);
    const prompt = String(mock.mock.calls.at(-1)?.[1]?.body);
    expect(prompt).toContain('accept_handoff');
    expect(prompt).not.toContain(original.id);
    expect(prompt).not.toContain(alternate.id);
    step();
    const measure = computeHeuristicDecision(primary, world, () => .99);
    expect(measure).toMatchObject({ chosenAction: 'FIELD_OBSERVATORY', observatoryMove: 'measure', targetObservatoryTick: observationOpened });
    expect(apply(primary, measure)).not.toBeNull();
    expect(computeHeuristicDecision(patient, world, () => .99)).toMatchObject({
      chosenAction: 'INFIRMARY', infirmaryMove: 'accept_handoff', targetInfirmaryCaseId: row.id,
    });
    expect(apply(patient, { ...handoff, infirmaryMove: 'accept' })).toBeNull();
    expect(apply(patient, accepted!)?.witnessScope).toBe('participants');
    expect(apply(patient, accepted!)).toBeNull();
    expect(row.receipt).toMatchObject({ guardId: backstop.id, shiftId: alternate.id });
    expect(original.lastServedTick).toBeUndefined();
    expect(sect.spiritStones).toBe(100 - INFIRMARY_TREATMENT_STONES);
    expect(hq.herbs.jade_leaf).toBe(6 - INFIRMARY_TREATMENT_HERBS);
  });

  it('does not replace a patient’s own truly due paid reading with automatic clinical consent', () => {
    const { world, patient, row, step, observationOpened } = fixture({ funded: false, patientFunded: true });
    step();
    const action = computeHeuristicDecision(patient, world, () => .99);
    expect(action).toMatchObject({ chosenAction: 'FIELD_OBSERVATORY', observatoryMove: 'measure', targetObservatoryTick: observationOpened });
    expect(row.status).toBe('waiting');
  });

  it('never drafts a healthy merely-present alternate with no real shift signature, and ordinary treatment stays ordinary', async () => {
    const { world, patient, sect, hq, row, handoff, step, apply } = fixture({ standby: false });
    const mock = vi.fn(async () => respond(handoff));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(patient, world, config, world.tick + 1)).resolves.toBeUndefined();
    step();
    expect(availableInfirmaryActions(patient, world).every(({ infirmaryMove }) =>
      infirmaryMove !== 'accept' && infirmaryMove !== 'accept_handoff')).toBe(true);
    expect(apply(patient, handoff)).toBeNull();
    expect(row.status).toBe('waiting');
    expect([sect.spiritStones, hq.herbs.jade_leaf]).toEqual([100, 6]);

    const usual = fixture({ funded: false });
    const ordinary = { ...usual.handoff, infirmaryMove: 'accept' } as const;
    mock.mockImplementation(async () => respond(usual.handoff));
    await expect(requestCultivatorLLMDecision(usual.patient, usual.world, config, usual.world.tick + 1)).resolves.toBeUndefined();
    mock.mockImplementation(async () => respond(ordinary));
    const allowed = await requestCultivatorLLMDecision(usual.patient, usual.world, config, usual.world.tick + 1);
    expect(allowed).toMatchObject(ordinary);
    usual.step();
    expect(usual.apply(usual.patient, allowed!)).not.toBeNull();
    expect(usual.row.receipt?.guardId).toBe(usual.primary.id);
  });
});
