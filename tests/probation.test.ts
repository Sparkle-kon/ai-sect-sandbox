import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { recordTransgression } from '../src/engine/bountyEngine';
import { availableCouncilPlans, resolveCouncil } from '../src/engine/councilEngine';
import {
  advanceProbation, availableProbationActions, canCouncilUseMisconduct, probationReliefTargets,
  recordProbationExpulsion, recordProbationRelief, resolveProbationAction, visibleProbationCases,
  PROBATION_RETRY_TICKS,
} from '../src/engine/probationEngine';
import { resolveSettlementAction, SETTLEMENT_RELIEF } from '../src/engine/settlementEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, LLMDecisionPayload, ProbationMove } from '../src/types/world';

function fixture(transgressions = 6) {
  const world = createInitialWorld();
  world.tick = 20;
  const sect = world.sects[0];
  const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const candidates = world.cultivators.filter(a => a.id !== leader.id);
  const [applicant, reviewerA, reviewerB, conflicted, outsider] = candidates;
  for (const actor of [applicant, reviewerA, reviewerB, conflicted]) {
    actor.sectId = sect.id;
    actor.sectRank = '长老';
    actor.contribution = 100;
    actor.transgressions = 0;
    actor.tribulation = undefined;
  }
  applicant.transgressions = transgressions;
  applicant.disciplineRevision = 2;
  applicant.karma = -63;
  applicant.spiritStones = 100;
  applicant.herbs.jade_leaf = 10;
  applicant.locationId = sect.headquartersId;
  applicant.guardAssignment = { locationId: sect.headquartersId, assignedTick: world.tick, expiresTick: world.tick + 3 };
  const weakPair = world.settlements.villages.slice(0, 2);
  for (const village of weakPair) {
    village.stress = 45;
    const site = world.locations.find(({ id }) => id === village.locationId)!;
    applicant.exploredTileIds.push(terrainTileAt(world, site.x, site.y)!.id);
  }
  world.relationships = world.relationships.filter(edge => ![edge.fromId, edge.toId].includes(applicant.id));
  world.relationships.push({ fromId: conflicted.id, toId: applicant.id, type: '师徒', affinity: 40, note: '实际关系' });
  const plan = availableCouncilPlans(world, sect.id).find(row => row.proposal.kind === 'expel' &&
    row.proposal.targetCultivatorId === applicant.id)!;
  const ballot = (vote: 'support' | 'oppose') => plan.voterIds.map(voterId => ({ voterId, vote, reason: '规则验收' }));
  const expel = () => {
    const result = resolveCouncil(world, plan, ballot('support'));
    expect(result?.status).toBe('passed');
    leader.locationId = applicant.locationId;
    return result!;
  };
  const run = (actor: Cultivator, move: ProbationMove, fields: Partial<LLMDecisionPayload> = {}) =>
    resolveProbationAction(world, actor, { chosenAction: 'PROBATION', innerMonologue: '', probationMove: move, ...fields });
  const request = () => {
    const option = availableProbationActions(applicant, world).find(({ probationMove }) => probationMove === 'request')!;
    expect(option).toBeTruthy();
    expect(run(applicant, 'request', option)).toBeTruthy();
    return world.probation.cases.at(-1)!;
  };
  const admit = () => {
    const row = request();
    expect(run(leader, 'admit', { targetProbationId: row.id })).toBeTruthy();
    return row;
  };
  const relief = (id: string, tickForward = true) => {
    if (tickForward) world.tick++;
    const village = world.settlements.villages.find(({ id: candidate }) => candidate === id)!;
    applicant.locationId = village.locationId;
    village.stress = 45;
    return resolveSettlementAction(world, applicant, { chosenAction: 'DELIVER_RELIEF', targetSettlementId: id, innerMonologue: '' });
  };
  const completeService = (ids: readonly string[]) => {
    for (const id of ids) expect(relief(id)).toBeTruthy();
  };
  return { world, sect, leader, applicant, reviewerA, reviewerB, conflicted, outsider, plan, ballot, expel, run,
    request, admit, relief, completeService, weakPair };
}

describe('restorative probation anchored to real expulsion and relief', () => {
  it('has no anchor for rejected council, forged copy, or unaffiliated characters without a real expulsion', () => {
    const { world, applicant, outsider, plan, ballot } = fixture();
    const rejected = resolveCouncil(world, plan, ballot('oppose'))!;
    expect(rejected.status).toBe('rejected');
    outsider.sectId = '';
    expect(availableProbationActions(outsider, world).some(({ probationMove }) => probationMove === 'request')).toBe(false);
    recordProbationExpulsion(world, { ...rejected, status: 'passed' });
    expect(applicant.sectId).not.toBe('');
    expect(world.probation.expulsions).toEqual([]);
  });

  it('freezes a canonical, actual expulsion once and cannot admit remotely or with duplicate/unadvertised villages', () => {
    const { world, applicant, sect, leader, expel, run, request } = fixture();
    const record = expel();
    expect(applicant).toMatchObject({ sectId: '', sectRank: '外门弟子', contribution: 0, transgressions: 6 });
    expect(applicant.guardAssignment).toBeUndefined();
    recordProbationExpulsion(world, record);
    expect(world.probation.expulsions).toEqual([{ id: record.id, actorId: applicant.id, sectId: sect.id, tick: 20,
      transgressions: 6, disciplineRevision: 2 }]);
    const planOption = availableProbationActions(applicant, world).find(({ probationMove }) => probationMove === 'request')!;
    expect(run(applicant, 'request', { ...planOption, probationSecondVillageId: planOption.probationFirstVillageId })).toBeNull();
    expect(run(applicant, 'request', { ...planOption, probationSecondVillageId: 'injected-imaginary-village' })).toBeNull();
    const row = request();
    expect(run(applicant, 'admit', { targetProbationId: row.id })).toBeNull();
    leader.locationId = sect.headquartersId;
    if (leader.locationId === applicant.locationId) leader.locationId = world.locations.find(site => site.id !== applicant.locationId)!.id;
    expect(run(leader, 'admit', { targetProbationId: row.id })).toBeNull();
    leader.locationId = applicant.locationId;
    expect(run(leader, 'admit', { targetProbationId: row.id })).toBeTruthy();
    expect(row).toMatchObject({ status: 'active', sponsorId: leader.id, relief: [], reviews: [] });
  });

  it('records exactly two successful debited donations at distinct selected villages and ticks, not copies or work before admission', () => {
    const { world, applicant, leader, expel, run, request, relief } = fixture();
    expel();
    const row = request();
    expect(relief(row.villageIds[0])).toBeTruthy();
    expect(row.relief).toEqual([]); // A real donation before anyone agreed to a plan stays a donation.
    leader.locationId = applicant.locationId;
    expect(run(leader, 'admit', { targetProbationId: row.id })).toBeTruthy();
    const stoneBefore = applicant.spiritStones;
    const herbBefore = applicant.herbs.jade_leaf;
    world.tick += 2; // Real village cooldown has elapsed.
    expect(relief(row.villageIds[0], false)).toBeTruthy();
    const receipt = world.settlements.records.at(-1)!;
    recordProbationRelief(world, receipt);
    recordProbationRelief(world, { ...receipt, id: 'imposter' });
    expect(row.relief).toEqual([{ sourceId: receipt.id, tick: world.tick, actorId: applicant.id,
      settlementId: row.villageIds[0], stones: SETTLEMENT_RELIEF.stones, herbs: SETTLEMENT_RELIEF.jade_leaf }]);
    expect(probationReliefTargets(world, applicant)).toEqual([]);
    expect(relief(row.villageIds[1])).toBeTruthy();
    expect(applicant.spiritStones).toBe(stoneBefore - 2 * SETTLEMENT_RELIEF.stones);
    expect(applicant.herbs.jade_leaf).toBe(herbBefore - 2 * SETTLEMENT_RELIEF.jade_leaf);
    expect(row.relief.map(({ settlementId }) => settlementId)).toEqual(row.villageIds);
    world.tick++;
    expect(probationReliefTargets(world, applicant)).toEqual([]);
    world.settlements.records = [];
    expect(row.relief).toHaveLength(2);
  });

  it('requires independent two signatures and final applicant authorization, retains old tally and scopes future re-expulsion to new misconduct', () => {
    const { world, sect, applicant, leader, reviewerA, reviewerB, conflicted, outsider, expel, run, admit, completeService } = fixture();
    const source = expel();
    const original = structuredClone(source);
    const row = admit();
    const fields = { targetProbationId: row.id, probationVote: 'support' as const };
    expect(run(reviewerA, 'review', fields)).toBeNull();
    completeService(row.villageIds);
    expect(run(leader, 'review', fields)).toBeNull();
    expect(run(conflicted, 'review', fields)).toBeNull();
    expect(run(outsider, 'review', fields)).toBeNull();
    expect(visibleProbationCases(world, outsider)).toEqual([]);
    expect(visibleProbationCases(world, reviewerA)).toEqual([row]);
    expect(run(reviewerA, 'review', fields)).toBeTruthy();
    expect(run(reviewerA, 'review', fields)).toBeNull();
    expect(run(applicant, 'restore', { targetProbationId: row.id })).toBeNull();
    expect(run(reviewerB, 'review', fields)).toBeTruthy();
    expect(row.status).toBe('ready');
    expect(applicant.sectId).toBe('');
    expect(run(leader, 'restore', { targetProbationId: row.id })).toBeNull();
    expect(run(applicant, 'restore', { targetProbationId: row.id })).toBeTruthy();
    expect(run(applicant, 'restore', { targetProbationId: row.id })).toBeNull();
    expect(applicant).toMatchObject({ sectId: sect.id, sectRank: '外门弟子', contribution: 0, transgressions: 6, karma: -63 });
    expect(applicant.guardAssignment).toBeUndefined();
    expect(world.councils.find(({ id }) => id === source.id)).toEqual(original);
    expect(world.probation.expulsions[0]).toMatchObject({ transgressions: 6, disciplineRevision: 2,
      reinstatedTick: world.tick, reinstatedRevision: 2 });
    expect(canCouncilUseMisconduct(world, applicant, sect.id)).toBe(false);
    expect(availableCouncilPlans(world, sect.id).some(plan => plan.proposal.kind === 'expel' &&
      plan.proposal.targetCultivatorId === applicant.id)).toBe(false);
    expect(visibleProbationCases(world, conflicted)).toEqual([]); // Historical data only to actual parties.
    recordTransgression(applicant, 'betrayal');
    expect(canCouncilUseMisconduct(world, applicant, sect.id)).toBe(true);
    expect(availableCouncilPlans(world, sect.id).some(plan => plan.proposal.kind === 'expel' &&
      plan.proposal.targetCultivatorId === applicant.id)).toBe(true);
  });

  it('closes on a new canonical offense even if the legacy tally is saturated, with no automatic membership and with durable retry cooldown', () => {
    const { world, applicant, expel, admit } = fixture(100);
    expel();
    const row = admit();
    recordTransgression(applicant, 'killing');
    expect(applicant.transgressions).toBe(100);
    expect(applicant.disciplineRevision).toBe(3);
    expect(advanceProbation(world)).toHaveLength(1);
    expect(row).toMatchObject({ status: 'rejected', reason: 'new_misconduct' });
    expect(applicant.sectId).toBe('');
    expect(availableProbationActions(applicant, world).some(o => o.probationMove === 'request')).toBe(false);
    world.tick += PROBATION_RETRY_TICKS;
    expect(availableProbationActions(applicant, world).some(o => o.probationMove === 'request')).toBe(true);
    expect(world.probation.expulsions[0].transgressions).toBe(100);
  });

  it('separates reviewer opposition, expiry, withdrawal, and historical disclosure from restoration', () => {
    const first = fixture();
    first.expel();
    const opposed = first.admit();
    first.completeService(opposed.villageIds);
    expect(first.run(first.reviewerA, 'review', { targetProbationId: opposed.id, probationVote: 'oppose' })).toBeTruthy();
    expect(opposed).toMatchObject({ status: 'rejected', reason: 'review_oppose' });
    expect(visibleProbationCases(first.world, first.reviewerA)).toEqual([opposed]);
    expect(visibleProbationCases(first.world, first.reviewerB)).toEqual([]);
    expect(first.applicant.sectId).toBe('');

    const second = fixture();
    second.expel();
    const waiting = second.request();
    second.world.tick = waiting.requestExpiresTick;
    expect(advanceProbation(second.world)).toHaveLength(1);
    expect(waiting).toMatchObject({ status: 'expired', reason: 'deadline' });
    expect(advanceProbation(second.world)).toEqual([]);
    second.world.tick += PROBATION_RETRY_TICKS;
    const next = second.request();
    expect(second.run(second.applicant, 'withdraw', { targetProbationId: next.id })).toBeTruthy();
    expect(next).toMatchObject({ status: 'withdrawn', reason: 'withdrawn' });
    expect(second.applicant.sectId).toBe('');
  });
});
