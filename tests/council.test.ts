import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { annualCouncilPlans, availableCouncilPlans, resolveCouncil } from '../src/engine/councilEngine';
import { adjustSectAffinity, sectRelation } from '../src/engine/diplomacyEngine';
import type { CouncilBallotReplacement } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  const [sect, enemy] = world.sects;
  const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const rest = world.cultivators.filter(({ id }) => id !== leader.id).slice(0, 3);
  const elders = rest.slice(0, 2);
  const member = rest[2];
  for (const actor of world.cultivators) {
    actor.pills.foundation = 0;
    actor.transgressions = 0;
    actor.tribulation = undefined;
    if (actor.sectId === sect.id && actor.id !== leader.id) actor.sectRank = '外门弟子';
  }
  for (const actor of [leader, ...elders, member]) {
    actor.sectId = sect.id;
    actor.locationId = sect.headquartersId;
    actor.hp = actor.maxHp;
    actor.alive = true;
  }
  for (const elder of elders) elder.sectRank = '长老';
  member.sectRank = '真传弟子';
  member.realm = '筑基'; member.qiProgress = 95; member.contribution = 60; member.pillToxicity = 0;
  leader.pills.foundation = 1;
  world.councils = [];
  world.diplomacy = [];
  world.tick = 13;
  return { world, sect, enemy, leader, elders, member };
}

describe('sect council public deliberations', () => {
  it('exposes an eligible default Danxia pill issue and triggers only after calendar turnover', () => {
    const world = createInitialWorld();
    const plans = availableCouncilPlans(world, 'sect-danxia');
    expect(plans.find(({ proposal }) => proposal.kind === 'allocate_pill' && proposal.targetCultivatorId === 'npc-6')?.voterIds).toHaveLength(3);
    expect(annualCouncilPlans(world)).toEqual([]);
    world.tick = 12; world.month = 12;
    expect(annualCouncilPlans(world)).toEqual([]);
    world.tick = 13; world.month = 1;
    expect(annualCouncilPlans(world).some(({ sectId }) => sectId === 'sect-danxia')).toBe(true);
  });

  it('requires three qualified and unconflicted voters; annual plan is limited and deterministic', () => {
    const { world, sect, elders, member } = fixture();
    member.transgressions = 8;
    const expel = availableCouncilPlans(world, sect.id).find(({ proposal }) => proposal.kind === 'expel');
    expect(expel?.voterIds).not.toContain(member.id);
    expect(annualCouncilPlans(world).filter(({ sectId }) => sectId === sect.id)).toEqual([expel]);
    elders[0].alive = false;
    expect(availableCouncilPlans(world, sect.id)).toEqual([]);
    world.tick++;
    world.month = 2;
    expect(annualCouncilPlans(world)).toEqual([]);
  });

  it('generates two deterministic rounds and conserves the last real pill on a majority outcome', () => {
    const { world, sect, member, leader } = fixture();
    const plan = availableCouncilPlans(world, sect.id).find(({ proposal }) =>
      proposal.kind === 'allocate_pill' && proposal.targetCultivatorId === member.id)!;
    const replay = structuredClone(world);
    const record = resolveCouncil(world, plan);
    expect(record).toEqual(resolveCouncil(replay, plan));
    expect(record?.status).toBe('passed');
    expect(record?.rounds.map(({ round }) => round)).toEqual([1, 2]);
    expect(record?.ballots).toHaveLength(3);
    expect(record?.tally).toMatchObject({ support: 3, required: 2 });
    expect(leader.pills.foundation).toBe(0); expect(member.pills.foundation).toBe(1);
    expect(member.qiProgress).toBe(95);
    expect(resolveCouncil(world, plan)).toBeNull();
    expect(world.councils).toHaveLength(1);
  });

  it('validates replacements per voter, ignores unknown/duplicate/invalid ones and honors a verified majority', () => {
    const { world, sect, member } = fixture();
    const plan = availableCouncilPlans(world, sect.id).find(({ proposal }) =>
      proposal.kind === 'allocate_pill' && proposal.targetCultivatorId === member.id)!;
    const all: CouncilBallotReplacement[] = [
      { voterId: 'foreign', vote: 'oppose', reason: 'outside' },
      { voterId: plan.voterIds[0], vote: 'oppose', reason: 'dup1' },
      { voterId: plan.voterIds[0], vote: 'oppose', reason: 'dup2' },
      { voterId: plan.voterIds[1], vote: 'oppose', reason: ' conserve \u0000 supplies ', opening: '开议' },
      { voterId: plan.voterIds[2], vote: 'abstain', reason: '信息有限' },
    ];
    const record = resolveCouncil(world, plan, all);
    expect(record?.status).toBe('rejected');
    expect(record?.tally).toEqual({ support: 1, oppose: 1, abstain: 1, required: 2 });
    expect(record?.ballots.map(({ source }) => source)).toEqual(['utility', 'llm', 'llm']);
    expect(record?.rounds[0].turns[1]).toMatchObject({ text: '开议', source: 'llm' });
    expect(member.pills.foundation).toBe(0);
  });

  it('fails stale resource and quorum plans without any policy or uncapped foreign action', () => {
    const { world, sect, member, leader, elders } = fixture();
    const plan = availableCouncilPlans(world, sect.id).find(({ proposal }) =>
      proposal.kind === 'allocate_pill' && proposal.targetCultivatorId === member.id)!;
    leader.pills.foundation = 0;
    expect(resolveCouncil(world, plan)).toBeNull();
    leader.pills.foundation = 1;
    elders[0].sectRank = '外门弟子';
    expect(resolveCouncil(world, plan)).toBeNull();
    expect(world.councils).toEqual([]);
  });

  it('executes a real expulsion while preserving possessions and ending sect guard duty', () => {
    const { world, sect, member } = fixture();
    member.transgressions = 8;
    member.guardAssignment = { locationId: sect.headquartersId, assignedTick: 10, expiresTick: 16 };
    const personalAssets = member.spiritStones;
    const plan = availableCouncilPlans(world, sect.id).find(({ proposal }) => proposal.kind === 'expel')!;
    expect(resolveCouncil(world, plan)?.status).toBe('passed');
    expect(member.sectId).toBe(''); expect(member.guardAssignment).toBeUndefined();
    expect(member.spiritStones).toBe(personalAssets);
    expect(member.locationId).not.toBe(sect.headquartersId);
  });

  it('executes a voted war only through the existing diplomacy requirements', () => {
    const { world, sect, leader } = fixture();
    const target = world.sects.find((candidate) => candidate.id !== sect.id && world.cultivators.some((actor) =>
      actor.id === candidate.leaderId && actor.sectId === candidate.id))!;
    adjustSectAffinity(world, sect.id, target.id, -100);
    const plan = availableCouncilPlans(world, sect.id).find(({ proposal }) => proposal.kind === 'war' && proposal.targetSectId === target.id)!;
    expect(plan).toBeDefined();
    const replacements = plan.voterIds.map((voterId): CouncilBallotReplacement => ({ voterId, vote: 'support', reason: '可行' }));
    const hq = leader.locationId;
    leader.locationId = 'away';
    expect(resolveCouncil(world, plan, replacements)).toBeNull();
    leader.locationId = hq;
    expect(resolveCouncil(world, plan, replacements)?.status).toBe('passed');
    expect(sectRelation(world, sect.id, target.id)?.pact).toBe('war');
    expect(world.events.some(({ title }) => title.includes('正式宣战'))).toBe(true);
  });
});
