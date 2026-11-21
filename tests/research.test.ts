import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceResearch, availableResearchActions, createResearchState, RESEARCH_DEPOSIT, RESEARCH_PROJECT_TICKS, RESEARCH_TOPICS,
  RESEARCH_WORK_COST, researchTechniqueId, resolveResearchAction, visibleResearchProjects } from '../src/engine/researchEngine';
import { advanceEstates } from '../src/engine/estateEngine';
import { studyTechnique } from '../src/engine/techniqueEngine';
import type { Cultivator, LLMDecisionPayload, RelocationPlan, ResearchMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(189);
  world.research = createResearchState();
  const sect = world.sects[0];
  const hq = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const [leader, first, second] = world.cultivators.filter((person) => person.sectId === sect.id);
  const outsider = world.cultivators.find((person) => person.sectId !== sect.id)!;
  for (const actor of [leader, first, second, outsider]) {
    actor.locationId = hq.id;
    actor.spiritStones = 500;
    actor.herbs.earth_root = 6;
    actor.hp = actor.maxHp;
  }
  sect.facilities.scripture_pavilion = 1;
  world.tick = 6;
  const act = (actor: Cultivator, researchMove: ResearchMove, fields: Partial<LLMDecisionPayload> = {}) =>
    resolveResearchAction(world, actor, { chosenAction: 'RESEARCH', researchMove, innerMonologue: '自愿实证', ...fields });
  const propose = () => {
    expect(act(leader, 'propose', { researchTopic: 'qi_foundation' })?.title).toBe('宗门提交限期共研问题');
    return world.research.projects[0];
  };
  return { world, sect, hq, leader, first, second, outsider, act, propose };
}

describe('verified sect research turns and individually funded collaboration', () => {
  it('offers only real HQ pavilion projects, requires consent and materials and rejects same-tick or duplicate work', () => {
    const { world, sect, leader, first, outsider, act, propose } = fixture();
    sect.facilities.scripture_pavilion = 0;
    expect(act(leader, 'propose', { researchTopic: 'qi_foundation' })).toBeNull();
    sect.facilities.scripture_pavilion = 1;
    expect(act(outsider, 'propose', { researchTopic: 'qi_foundation' })).toBeNull();
    const project = propose();
    expect(project.deadlineTick).toBe(world.tick + RESEARCH_PROJECT_TICKS);
    expect(visibleResearchProjects(world, outsider)).toEqual([]);
    expect(visibleResearchProjects(world, first)).toEqual([project]);
    expect(act(first, 'work', { targetResearchId: project.id })).toBeNull();
    first.herbs.earth_root = 1;
    expect(act(first, 'join', { targetResearchId: project.id })).toBeNull();
    first.herbs.earth_root = 6;
    expect(act(first, 'join', { targetResearchId: project.id })?.witnessScope).toBe('participants');
    expect(first.spiritStones).toBe(500 - RESEARCH_DEPOSIT.stones);
    expect(first.herbs.earth_root).toBe(6 - RESEARCH_DEPOSIT.earthRoots);
    expect(act(first, 'join', { targetResearchId: project.id })).toBeNull();
    expect(act(first, 'work', { targetResearchId: project.id })).toBeNull();
    world.tick++;
    expect(act(first, 'work', { targetResearchId: project.id })).not.toBeNull();
    expect(act(first, 'work', { targetResearchId: project.id })).toBeNull();
    expect(project.contributors[0]).toMatchObject({ workTurns: 1, spent: RESEARCH_WORK_COST, lastWorkedTick: world.tick });
    expect(sect.pavilion).toEqual([]);
  });

  it('publishes exactly one reproducible original after two real contributors and returns only each unspent balance', () => {
    const { world, sect, hq, leader, first, second, act, propose } = fixture();
    const project = propose();
    for (const member of [first, second]) expect(act(member, 'join', { targetResearchId: project.id })).not.toBeNull();
    const sectorCash = sect.spiritStones;
    world.tick++;
    for (const member of [first, second]) expect(act(member, 'work', { targetResearchId: project.id })).not.toBeNull();
    world.tick++;
    expect(act(first, 'work', { targetResearchId: project.id })).not.toBeNull();
    expect(project.status).toBe('open');
    const replay = structuredClone(world);
    const replayMember = replay.cultivators.find(({ id }) => id === second.id)!;
    const result = act(second, 'work', { targetResearchId: project.id });
    expect(result).toMatchObject({ title: '宗门共研发现入阁', actorIds: [first.id, second.id], locationId: hq.id });
    expect(result?.witnessScope).toBeUndefined();
    expect(resolveResearchAction(replay, replayMember, { chosenAction: 'RESEARCH', researchMove: 'work', targetResearchId: project.id,
      innerMonologue: '不同表述不能影响成果' })).toEqual(result);
    expect(world).toEqual(replay);
    expect(project.status).toBe('completed');
    const id = researchTechniqueId(sect.id, 'qi_foundation');
    expect(project).toMatchObject({ discoveryTechniqueId: id, discoveryLocationId: hq.id });
    expect(sect.pavilion).toEqual([{ id, name: RESEARCH_TOPICS.qi_foundation.techniqueName, spiritRoot: '木', createdTick: world.tick }]);
    expect(world.scriptures.originals.filter((scripture) => scripture.id === id)).toHaveLength(1);
    expect(sect.spiritStones).toBe(sectorCash);
    for (const member of [first, second]) {
      expect(member.spiritStones).toBe(480);
      expect(member.herbs.earth_root).toBe(4);
      expect(member.authoredTechnique?.id).not.toBe(id);
    }
    expect(project.contributors.every(({ escrow }) => escrow.stones === 0 && escrow.earthRoots === 0)).toBe(true);
    expect(advanceResearch(world)).toEqual([]);
    expect(act(second, 'work', { targetResearchId: project.id })).toBeNull();
    expect(studyTechnique(leader, world, id)).not.toBeNull();
    expect(leader.technique.id).toBe(id);
    expect(world.scriptures.originals.filter((scripture) => scripture.id === id)).toHaveLength(1);

    // The immutable canon remains sufficient to deny duplicates even if older project/look-up views are pruned.
    world.research.projects = [];
    sect.pavilion = [];
    world.tick += 6;
    expect(act(leader, 'propose', { researchTopic: 'qi_foundation' })).toBeNull();
    expect(act(leader, 'propose', { researchTopic: 'warding' })).not.toBeNull();
  });

  it('has objective withdrawal reasons and retains completed evidence without refunding used resources', () => {
    const { world, first, second, act, propose } = fixture();
    const project = propose();
    act(first, 'join', { targetResearchId: project.id });
    act(second, 'join', { targetResearchId: project.id });
    world.tick++;
    act(first, 'work', { targetResearchId: project.id });
    expect(act(first, 'withdraw', { targetResearchId: project.id, researchWithdrawReason: 'injury' })).toBeNull();
    expect(act(first, 'withdraw', { targetResearchId: project.id, researchWithdrawReason: 'ineligible' })).toBeNull();
    first.hp = Math.floor(first.maxHp / 2);
    expect(act(first, 'withdraw', { targetResearchId: project.id, researchWithdrawReason: 'injury' })?.title).toBe('共研有由退出');
    expect(first.spiritStones).toBe(500 - RESEARCH_WORK_COST.stones);
    expect(first.herbs.earth_root).toBe(6 - RESEARCH_WORK_COST.earthRoots);
    expect(project.contributors[0]).toMatchObject({ workTurns: 1, withdrawnTick: world.tick, withdrawReason: 'injury',
      escrow: { stones: 0, earthRoots: 0 }, spent: RESEARCH_WORK_COST });
    expect(act(first, 'withdraw', { targetResearchId: project.id, researchWithdrawReason: 'injury' })).toBeNull();
    expect(act(first, 'join', { targetResearchId: project.id })).toBeNull();
    expect(second.spiritStones).toBe(500 - RESEARCH_DEPOSIT.stones);
  });

  it('settles real corpse escrow before estate and refuses a late discovery after research expiration', () => {
    const { world, sect, first, second, act, propose } = fixture();
    const project = propose();
    act(first, 'join', { targetResearchId: project.id });
    act(second, 'join', { targetResearchId: project.id });
    world.tick++;
    act(first, 'work', { targetResearchId: project.id });
    first.alive = false; first.hp = 0;
    expect(advanceResearch(world)[0]?.title).toBe('共研资格变化，释放材料');
    expect(advanceResearch(world)).toEqual([]);
    advanceEstates(world);
    expect(world.estates.entries.find(({ deceasedId }) => deceasedId === first.id)?.holdings.stones).toBe(490);
    expect(project.contributors[0].withdrawReason).toBe('ineligible');
    world.tick = project.deadlineTick;
    expect(act(second, 'work', { targetResearchId: project.id })).toBeNull();
    expect(advanceResearch(world)[0]?.title).toBe('共研未发表，余额退回');
    expect(advanceResearch(world)).toEqual([]);
    expect(second.spiritStones).toBe(500);
    expect(second.herbs.earth_root).toBe(6);
    expect(sect.pavilion).toEqual([]);
    expect(world.scriptures.originals).toEqual([]);
  });

  it('pauses actual work in transit and publishes only at a rebuilt current pavilion, never the abandoned one', () => {
    const { world, sect, hq, first, second, act, propose, leader } = fixture();
    const project = propose();
    for (const member of [first, second]) act(member, 'join', { targetResearchId: project.id });
    const destination = world.locations.find(({ type }) => type === 'spirit_vein')!;
    const plan: RelocationPlan = { id: 'temporary-movement', sectId: sect.id, originId: hq.id, destinationId: destination.id, status: 'in_transit',
      openedTick: world.tick, deadlineTick: world.tick + 3, proposerId: leader.id, voterIds: [], votes: [], garrisonIds: [leader.id, first.id, second.id],
      path: [{ x: hq.x, y: hq.y }, { x: destination.x, y: destination.y }], pathIndex: 0, stoneCost: 40, earthCost: 1,
      custody: { stones: 0, pavilion: [] }, spent: true };
    world.relocations.plans.push(plan);
    world.tick++;
    expect(act(first, 'work', { targetResearchId: project.id })).toBeNull();
    expect(availableResearchActions(first, world)).toContainEqual({ action: 'RESEARCH', researchMove: 'withdraw', targetResearchId: project.id,
      researchWithdrawReason: 'relocation' });
    plan.status = 'settled';
    sect.headquartersId = destination.id;
    sect.facilities.scripture_pavilion = 0;
    destination.type = 'sect_hq'; destination.ownerSectId = sect.id;
    for (const member of [leader, first, second]) member.locationId = destination.id;
    expect(act(first, 'work', { targetResearchId: project.id })).toBeNull();
    sect.facilities.scripture_pavilion = 1;
    world.tick++;
    for (const member of [first, second]) act(member, 'work', { targetResearchId: project.id });
    world.tick++;
    for (const member of [first, second]) act(member, 'work', { targetResearchId: project.id });
    expect(project.locationId).toBe(hq.id);
    expect(project.discoveryLocationId).toBe(destination.id);
    expect(world.scriptures.originals[0]).toMatchObject({ sourceLocationId: destination.id });
    expect(sect.pavilion).toHaveLength(1);
  });
});
