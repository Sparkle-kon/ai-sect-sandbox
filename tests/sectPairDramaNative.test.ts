import { describe, expect, it, vi } from 'vitest';
import { publicChronicleSceneEvents } from '../src/engine/chronicleLead';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { projectSectPairDrama } from '../src/engine/sectPairDrama';
import { planSectJob } from '../src/engine/sectJobs';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { triggerTribulation } from '../src/engine/tribulationEngine';
import { adjustRelationship, advanceWorldTick } from '../src/engine/worldEngine';
import { sectPairDramaEventId } from '../src/types/sectPairDrama';
import type { SectJobAssignment, SectJobObservation } from '../src/types/sectJobs';
import type { SectQuirkId } from '../src/types/sectManagement';
import type { LLMDecisionPayload, WorldEvent, WorldState } from '../src/types/world';

const REST: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '坐在原处歇一歇。' };

function actor(world: WorldState, id: string) {
  const row = world.cultivators.find(person => person.id === id);
  if (!row) throw new Error(`Missing fixture cultivator ${id}`);
  return row;
}

function management(world: WorldState) {
  if (!world.sectManagement) throw new Error('Expected a real managed sect');
  return world.sectManagement;
}

function home(world: WorldState) {
  const row = world.locations.find(site => site.id === management(world).homeSiteId);
  if (!row) throw new Error('Expected the sect headquarters');
  return row;
}

function relationship(world: WorldState, a: string, b: string) {
  return world.relationships.find(row => row.fromId === a && row.toId === b || row.fromId === b && row.toId === a);
}

function month(world: WorldState, assignments: readonly SectJobAssignment[] = [],
  extra: Readonly<Record<string, LLMDecisionPayload>> = {}, modelId?: string) {
  const observations: SectJobObservation[] = [], events: WorldEvent[] = [];
  const settled = vi.fn();
  const decisions = Object.fromEntries(world.cultivators.filter(row => row.alive).map(row => [row.id, extra[row.id] ?? REST]));
  const next = advanceWorldTick(world, decisions, undefined, modelId ? 'deferred' : 'utility', settled, {
    sectJobAssignments: assignments, modelActors: modelId ? new Set([modelId]) : undefined, capturePresentation: false, captureTrace: true,
    onSectJobsSettled: rows => observations.push(...rows),
    onCompletedEvents: rows => events.push(...rows),
  });
  expect(next.tick).toBe(world.tick + 1);
  if (modelId) expect(settled).toHaveBeenCalledWith(modelId, true);
  return { next, observations, events };
}

function starter() {
  const opening = createManagedSectWorld(13071, 'classic', 'qingyun-odd-jobs', 0);
  if (!opening) throw new Error('Expected real Qingyun genesis');
  const [young, first, second] = management(opening).foundingDiscipleIds;
  if (!young || !first || !second) throw new Error('Expected three real disciples');
  return { opening, young, first, second, pair: [first, second].sort() };
}

function establishedRelations(firstQuirk: SectQuirkId, secondQuirk: SectQuirkId) {
  const seed = starter();
  const { opening, first, second } = seed;
  actor(opening, first).quirks = [firstQuirk];
  actor(opening, second).quirks = [secondQuirk];
  expect(relationship(opening, first, second)).toMatchObject({ type: '同门', affinity: 18 });
  const discuss = (targetCultivatorId: string): LLMDecisionPayload =>
    ({ chosenAction: 'SOCIALIZE', targetCultivatorId, innerMonologue: '与同门烹茶论道。' });
  const met = month(opening, [], { [first]: discuss(second) });
  expect(met.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: `evt-${met.next.tick}-${first}-social`, actorIds: [first, second], locationId: home(opening).id }),
  ]));
  expect(relationship(met.next, first, second)).toMatchObject({ type: '同门', affinity: 30 });
  return { ...seed, world: met.next };
}

function jobs(pair: readonly string[], jobId: SectJobAssignment['jobId']): SectJobAssignment[] {
  return pair.map(discipleId => ({ discipleId, jobId }));
}

function saveRoundTrip(world: WorldState) {
  const bytes = encodeEraWorldSave(world), restored = decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(restored)).toBe(bytes);
  return restored;
}

describe('同门关系插曲经过真实晨会和月步', () => {
  it('两个本可当值的同门互相甩锅，没人开灶，也不会记成完成', () => {
    const { world, first, second, pair } = establishedRelations('contrarian', 'coward_king');
    const original = encodeEraWorldSave(world);
    for (const id of pair) {
      expect(planSectJob(world, actor(world, id), 'kitchen')).toMatchObject({
        kind: 'chore', phase: 'performed', siteId: home(world).id, decision: { chosenAction: 'REST' },
      });
    }
    const ordinary = structuredClone(world);
    actor(ordinary, first).quirks = ['shy'];
    actor(ordinary, second).quirks = ['neat_freak'];
    const withoutBlame = month(ordinary, jobs(pair, 'kitchen'));
    const actual = month(world, jobs(pair, 'kitchen'));
    expect(management(actual.next).pairDrama).toMatchObject({
      tick: actual.next.tick, sectId: management(world).sectId, pair, kind: 'blame',
      jobId: 'kitchen', siteId: home(world).id, outcome: 'aborted',
    });
    expect(actual.observations).toHaveLength(2);
    expect(withoutBlame.observations.every(row => row.phase === 'performed')).toBe(true);
    expect(actual.observations.every(row => row.phase === 'unavailable' && !row.nativeEffects?.length)).toBe(true);
    expect(management(actual.next).latestReport?.rows).toHaveLength(2);
    expect(management(actual.next).latestReport?.rows.every(row => row.phase === 'unavailable' && row.effects.length === 0)).toBe(true);
    const restOnly = month(world);
    expect(home(actual.next).herbs).toEqual(home(restOnly.next).herbs);
    expect(home(actual.next).herbs.earth_root).toBe(home(withoutBlame.next).herbs.earth_root + 2);
    for (const id of pair) {
      expect(actor(actual.next, id)).toMatchObject({
        currentAction: 'REST', contribution: actor(restOnly.next, id).contribution,
        qiProgress: actor(restOnly.next, id).qiProgress,
      });
    }
    expect(actual.events.some(row => row.id.endsWith('-management-kitchen'))).toBe(false);
    expect(encodeEraWorldSave(world)).toBe(original);
  });

  it('异工、异地、独自一人、未成年、以及强制渡劫不会形成配对；普通同门可以搭档', () => {
    const { world, first, second, pair } = establishedRelations('lovestruck', 'neat_freak');
    const assignments = jobs(pair, 'cultivate');
    expect(management(month(world, [assignments[0], { ...assignments[1], jobId: 'kitchen' }]).next).pairDrama).toBeUndefined();
    expect(management(month(world, assignments.slice(0, 1)).next).pairDrama).toBeUndefined();

    const remote = structuredClone(world);
    const away = remote.locations.find(site => site.type === 'market');
    if (!away) throw new Error('Expected a real remote marketplace');
    actor(remote, second).locationId = away.id;
    const remoteMonth = month(remote, assignments);
    expect(actor(remoteMonth.next, second).locationId).toBe(away.id);
    expect(management(remoteMonth.next).pairDrama).toBeUndefined();

    const strangers = structuredClone(world);
    const prior = relationship(strangers, first, second);
    strangers.relationships = strangers.relationships.filter(row => row !== prior);
    expect(management(month(strangers, assignments).next).pairDrama).toMatchObject({kind:'rivalry',outcome:'completed'});
    const duplicate = structuredClone(world);
    const duplicateEdge = relationship(duplicate, first, second);
    if (!duplicateEdge) throw new Error('Expected the prior native edge');
    duplicate.relationships.push({ ...duplicateEdge, fromId: second, toId: first });
    expect(management(month(duplicate, assignments).next).pairDrama).toBeUndefined();

    const foreign = structuredClone(world);
    const outsider = foreign.cultivators.find(row => row.alive && row.sectId !== management(foreign).sectId);
    if (!outsider) throw new Error('Expected an actual foreign cultivator');
    outsider.locationId = home(foreign).id;
    adjustRelationship(foreign, first, outsider.id, 25, '挚友');
    const foreignMonth = month(foreign, jobs([first, outsider.id], 'cultivate'));
    expect(foreignMonth.observations).toEqual([]);
    expect(management(foreignMonth.next).pairDrama).toBeUndefined();
    const minor = structuredClone(world);
    actor(minor, first).age = 16;
    expect(management(month(minor, assignments).next).pairDrama).toBeUndefined();

    const trial = structuredClone(world);
    const adept = actor(trial, second);
    adept.realm = '筑基';
    adept.realmStage = 9;
    adept.qiProgress = 100;
    expect(triggerTribulation(trial, adept)).toBeTruthy();
    const priority = month(trial, assignments);
    expect(priority.observations.find(row => row.discipleId === second)?.phase).toBe('unavailable');
    expect(management(priority.next).pairDrama).toBeUndefined();

    actor(trial, first).quirks = ['contrarian'];
    adept.quirks = ['coward_king'];
    const guard = month(trial, jobs(pair, 'guard'));
    expect(guard.observations.find(row => row.discipleId === second)?.phase).toBe('unavailable');
    expect(guard.observations.find(row => row.discipleId === first)?.phase).toBe('performed');
    expect(actor(guard.next, first).contribution).toBe(actor(trial, first).contribution + 2);
    expect(management(guard.next).pairDrama).toBeUndefined();
  });

  it.each(['crush', 'prank', 'rivalry'] as const)('%s 先完成两份本职差事，再结算原先存在的关系，不虚构道侣', kind => {
    const { world, first, second, pair } = establishedRelations(
      kind === 'crush' ? 'lovestruck' : kind === 'prank' ? 'chatterbox' : 'neat_freak', 'glutton',
    );
    if (kind !== 'crush') {
      // The native relationship mutator creates the exact friendship/rivalry shape exercised here.
      const existing = relationship(world, first, second);
      world.relationships = world.relationships.filter(row => row !== existing);
      adjustRelationship(world, first, second, kind === 'prank' ? 32 : -12, kind === 'prank' ? '挚友' : '竞争');
    }
    const assignments = jobs(pair, 'cultivate');
    const { next, observations } = month(world, assignments);
    const entry = management(next).pairDrama;
    expect(entry).toMatchObject({ kind, tick: next.tick, outcome: 'completed', pair, jobId: 'cultivate' });
    expect(observations).toHaveLength(2);
    expect(observations.every(row => row.phase === 'performed')).toBe(true);
    for (const id of pair) {
      expect(actor(next, id).currentAction).toBe('CULTIVATE');
      expect(actor(next, id).techniqueMastery).toBeGreaterThan(actor(world, id).techniqueMastery);
    }
    const before = relationship(world, first, second), after = relationship(next, first, second);
    expect(after?.type).toBe(before?.type);
    expect(after?.type).not.toBe('道侣');
    expect((after?.affinity ?? 0) - (before?.affinity ?? 0)).toBe(entry?.affinityChange);
    const privateId = sectPairDramaEventId(next.tick, management(world).sectId);
    expect(next.events.filter(row => row.id === privateId)).toMatchObject([
      { tick: next.tick, actorIds: kind === 'crush' ? [first] : pair, witnessScope: 'participants' },
    ]);
    expect(next.events.find(row => row.id === privateId)?.locationId).toBe(kind === 'crush' ? undefined : home(world).id);
    expect(publicChronicleSceneEvents(next).some(row => row.id === privateId)).toBe(false);
    const restored = saveRoundTrip(next);
    expect(management(restored).pairDrama).toEqual(entry);
    expect(projectSectPairDrama(restored)).toEqual(projectSectPairDrama(next));
    if (kind === 'crush') {
      expect(projectSectPairDrama(next)?.title).toBe('一同办差');
      expect(JSON.stringify(projectSectPairDrama(next))).not.toContain('原想多问道友一句');
    }
    const publicForgery = structuredClone(next);
    const forgedMarker = publicForgery.events.find(row => row.id === privateId);
    if (!forgedMarker) throw new Error('Expected the dated private receipt');
    delete forgedMarker.witnessScope;
    expect(() => encodeEraWorldSave(publicForgery)).toThrow(/sectManagement\.pairDrama\.receipt/);
    expect(projectSectPairDrama(publicForgery)).toBeUndefined();
    const idle = month(next);
    expect(idle.events.some(row => row.id === sectPairDramaEventId(idle.next.tick, management(world).sectId))).toBe(false);
  });

  it('多名同地候选也只开一个无向配对；调换差事和边方向不改结果，模拟 Cognitive 与 Utility 一致', async () => {
    const { world, young, first, second, pair } = establishedRelations('contrarian', 'contrarian');
    actor(world, young).age = 18;
    for (const id of [young, first, second]) actor(world, id).quirks = ['contrarian'];
    adjustRelationship(world, young, first, 20, '同门');
    adjustRelationship(world, young, second, 20, '同门');
    const assignments = jobs([first, second, young], 'guard');
    const baseline = month(world, assignments);
    const entry = management(baseline.next).pairDrama;
    expect(entry).toMatchObject({ kind: 'blame', outcome: 'aborted' });
    expect(entry?.pair).toEqual([young, first].sort());
    expect(baseline.observations.filter(row => row.phase === 'unavailable')).toHaveLength(2);
    const remaining = [young, ...pair].find(id => !entry?.pair.includes(id));
    if (!remaining) throw new Error('Expected a disciple not in the selected pair');
    expect(baseline.observations.find(row => row.discipleId === remaining)).toMatchObject({ phase: 'performed' });
    expect(actor(baseline.next, remaining).contribution).toBe(actor(world, remaining).contribution + 2);
    for (const id of entry?.pair ?? []) expect(actor(baseline.next, id).contribution).toBe(actor(world, id).contribution);

    const reversed = structuredClone(world);
    for (const row of reversed.relationships) [row.fromId, row.toId] = [row.toId, row.fromId];
    const withReversedEdges = month(reversed, [...assignments].reverse());
    expect(management(withReversedEdges.next).pairDrama).toEqual(entry);
    expect(withReversedEdges.events.filter(row => row.id === sectPairDramaEventId(withReversedEdges.next.tick, management(world).sectId))).toHaveLength(1);

    const modelId = world.cultivators.find(row => row.alive && ![young, first, second].includes(row.id) &&
      row.sectId !== management(world).sectId)?.id;
    if (!modelId) throw new Error('Expected an unassigned actual model actor');
    const response = vi.fn(async () => new Response(JSON.stringify({ choices: [
      { message: { content: JSON.stringify({ chosenAction: 'REST' }) } },
    ] })));
    vi.stubGlobal('fetch', response);
    try {
      llmScheduler.resetTickBudget();
      const decision = await requestCultivatorLLMDecision(actor(world, modelId), world, {
        enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture', model: 'sect-pair-native',
      }, world.tick + 1);
      expect(response).toHaveBeenCalledOnce();
      if (!decision) throw new Error('Expected a genuine decoded model decision');
      const cognitive = month(world, assignments, { [modelId]: decision }, modelId);
      expect(management(cognitive.next).pairDrama).toEqual(entry);
      expect(cognitive.next.random).toEqual(baseline.next.random);
      expect(cognitive.observations).toEqual(baseline.observations);
    } finally {
      vi.unstubAllGlobals();
      llmScheduler.resetTickBudget();
    }
  });
});
