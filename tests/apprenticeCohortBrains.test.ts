import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableApprenticeCohortActions } from '../src/engine/apprenticeCohortEngine';
import { createDecisionReplayTape, legalTraceCandidates, recordDecisionTrace, rememberReplayDecision, replayOneTurn } from '../src/engine/decisionTraceEngine';
import { computeHeuristicDecision, requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { authorTechnique, gainMastery, studyTechnique } from '../src/engine/techniqueEngine';
import { resolveMentorshipAction } from '../src/engine/mentorshipEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator, LLMConfig, LLMDecisionPayload } from '../src/types/world';

const config: LLMConfig = { enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'mock-cohort' };
const respond = (payload: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const world = createInitialWorld(632);
  const mentor = world.cultivators.find(({ id }) => id === 'npc-1')!;
  const students = ['elder-taixu-1', 'elder-taixu-2'].map((id) => world.cultivators.find((actor) => actor.id === id)!);
  const outsider = world.cultivators.find(({ id }) => id === 'npc-3')!;
  mentor.techniqueMastery = 75;
  expect(authorTechnique(mentor, world)).not.toBeNull();
  const techniqueId = mentor.technique.id!;
  expect(world.scriptures.originals.some(({ id }) => id === techniqueId)).toBe(true);
  gainMastery(mentor, 36);
  for (const student of students) {
    student.personality = '刚正';
    student.hp = student.maxHp;
    expect(studyTechnique(student, world, techniqueId)).not.toBeNull();
  }
  world.tick++;
  for (const student of students) {
    expect(resolveMentorshipAction(world, mentor, { chosenAction: 'TEACH', targetCultivatorId: student.id, innerMonologue: '' }, () => .99)).not.toBeNull();
  }
  world.tick++;
  for (const student of students) {
    const tuition = world.mentorship.offers.find(({ studentId }) => studentId === student.id)!;
    expect(resolveMentorshipAction(world, student, { chosenAction: 'ACCEPT_TUITION', targetTuitionId: tuition.id, innerMonologue: '' }, () => .99)).not.toBeNull();
  }
  world.tick++;
  const proposal: LLMDecisionPayload = { chosenAction: 'APPRENTICE_COHORT', cohortMove: 'offer',
    targetTechniqueId: techniqueId, cohortInviteeIds: students.map(({ id }) => id), innerMonologue: '请同练原本道友自择入班。' };
  const apply = (actor: Cultivator, decision: LLMDecisionPayload) => applyCultivatorBrainDecision(world, actor, decision, () => .99);
  return { world, mentor, students, outsider, techniqueId, proposal, apply };
}

describe('local consented cohort choices in both brains', () => {
  it('requires exactly the offered technique and ordered finite invitee list, never model-provided grades or title', async () => {
    const { world, mentor, students, outsider, proposal, techniqueId, apply } = fixture();
    expect(availableApprenticeCohortActions(mentor, world, world.tick + 1)).toContainEqual({
      action: 'APPRENTICE_COHORT', cohortMove: 'offer', targetTechniqueId: techniqueId, cohortInviteeIds: students.map(({ id }) => id),
    });
    const mock = vi.fn(async (_endpoint: RequestInfo | URL, _init?: RequestInit) => respond({ ...proposal, targetTechniqueId: 'invented' }));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(mentor, world, config, world.tick + 1)).resolves.toBeUndefined();
    for (const injected of [{ cohortInviteeIds: [students[1].id, students[0].id] },
      { cohortInviteeIds: [students[0].id, outsider.id] }, { cohortInviteeIds: [students[0].id, students[0].id] },
      { attendance: 2 }, { masteryGained: 100 }, { title: '出师' }]) {
      mock.mockImplementation(async () => respond({ ...proposal, ...injected }));
      await expect(requestCultivatorLLMDecision(mentor, world, config, world.tick + 1)).resolves.toBeUndefined();
    }
    mock.mockImplementation(async () => respond(proposal));
    const allowed = await requestCultivatorLLMDecision(mentor, world, config, world.tick + 1);
    expect(allowed).toMatchObject(proposal);
    expect(mock.mock.calls.at(-1)?.[1]?.body).toContain('完整有序的受邀名单');
    world.tick++;
    expect(apply(mentor, allowed!)).not.toBeNull();
    expect(world.apprenticeCohorts.cohorts[0].seats.map(({ studentId, status }) =>
      ({ studentId, status }))).toEqual(students.map(({ id }) => ({ studentId: id, status: 'invited' })));
    expect(world.apprenticeCohorts.graduations).toEqual([]);
  });

  it('copies the private ordered roster across control and alternate replay without making it public', () => {
    const { world, mentor, students, outsider, proposal } = fixture();
    const ids = students.map(({ id }) => id);
    const tape = createDecisionReplayTape(world, 'utility');
    const working = { ...proposal, cohortInviteeIds: ids.slice() };
    rememberReplayDecision(tape, mentor.id, working);
    working.cohortInviteeIds.reverse();
    const baseline = structuredClone(world);
    baseline.tick++;
    const shown = baseline.cultivators.find(({ id }) => id === outsider.id)!;
    const rest = { chosenAction: 'REST', innerMonologue: 'private' } as const;
    rememberReplayDecision(tape, shown.id, rest);
    const trace = recordDecisionTrace(baseline, shown.id, legalTraceCandidates(baseline, shown), rest, 'utility', true);
    expect(JSON.stringify(tape)).not.toContain(ids[0]);
    const result = replayOneTurn(tape, baseline, trace.id, 'CULTIVATE', (copy, decisions, _mode, onActor) => {
      expect(decisions[mentor.id]).toMatchObject({ cohortInviteeIds: ids, innerMonologue: '' });
      // One mechanical replay must not modify the other replay's captured order or the tape.
      decisions[mentor.id].cohortInviteeIds!.reverse();
      copy.tick++;
      const other = copy.cultivators.find(({ id }) => id === shown.id)!;
      onActor(other.id, legalTraceCandidates(copy, other), true);
      return copy;
    });
    expect(result.ok).toBe(true);
  });

  it('copies each consent and attendance only for the actual scheduled turn; Utility honors that duty before optional cultivation', async () => {
    const { world, mentor, students, outsider, proposal, apply } = fixture();
    const [first, second] = students;
    expect(apply(mentor, proposal)).not.toBeNull();
    const row = world.apprenticeCohorts.cohorts[0];
    const accept = { chosenAction: 'APPRENTICE_COHORT', cohortMove: 'accept', targetCohortId: row.id, innerMonologue: '本人同意。' } as const;
    const mock = vi.fn(async () => respond(accept));
    vi.stubGlobal('fetch', mock);
    await expect(requestCultivatorLLMDecision(first, world, config, world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(outsider, world, config, world.tick + 1)).resolves.toBeUndefined();
    const consent = await requestCultivatorLLMDecision(first, world, config, world.tick + 1);
    expect(consent).toMatchObject(accept);
    world.tick++;
    expect(apply(first, consent!)).not.toBeNull();
    const ruleConsent = computeHeuristicDecision(second, world, () => .99);
    expect(ruleConsent).toMatchObject({ chosenAction: accept.chosenAction, cohortMove: 'accept', targetCohortId: row.id });
    expect(apply(second, ruleConsent)).not.toBeNull();
    const attend = { ...accept, cohortMove: 'attend' } as const;
    mock.mockImplementation(async () => respond({ ...attend, cohortInviteeIds: students.map(({ id }) => id) }));
    await expect(requestCultivatorLLMDecision(first, world, config, world.tick + 1)).resolves.toBeUndefined();
    mock.mockImplementation(async () => respond(attend));
    await expect(requestCultivatorLLMDecision(first, world, config, world.tick)).resolves.toBeUndefined();
    const attendance = await requestCultivatorLLMDecision(first, world, config, world.tick + 1);
    expect(attendance).toMatchObject(attend);
    world.tick++;
    first.qiProgress = 95;
    mentor.qiProgress = 95;
    const teach = computeHeuristicDecision(mentor, world, () => .99);
    expect(teach).toMatchObject({ chosenAction: accept.chosenAction, cohortMove: 'teach', targetCohortId: row.id });
    expect(computeHeuristicDecision(first, world, () => .99)).toMatchObject({ chosenAction: accept.chosenAction, cohortMove: 'attend' });
    const originalMastery = first.techniqueMastery;
    expect(apply(mentor, teach)).not.toBeNull();
    expect(apply(first, attendance!)).not.toBeNull();
    expect(apply(first, attendance!)).toBeNull();
    expect(first.techniqueMastery).toBe(originalMastery); // Actual attendance is settled at the end of the game tick.
    expect(world.apprenticeCohorts.graduations).toEqual([]);
  });
});
