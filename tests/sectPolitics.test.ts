import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableLeadershipActions, earnedSectRank, maintainSectPolitics, resolveLeadershipAction, rewardContribution } from '../src/engine/sectPoliticsEngine';
import type { LLMDecisionPayload } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  const sect = world.sects[0];
  const [incumbent, actor, supporter, second] = world.cultivators;
  sect.leaderId = incumbent.id;
  incumbent.sectRank = '掌门';
  for (const member of [incumbent, actor, supporter, second]) {
    member.locationId = sect.headquartersId;
    member.artifacts = [];
    member.hp = member.maxHp = 500;
  }
  actor.realm = '元婴'; actor.contribution = 160; actor.personality = '阴险';
  actor.combatPower = 1000; incumbent.combatPower = 100;
  world.relationships = [];
  const connect = (a = actor, b = supporter, affinity = 70) => world.relationships.push({ fromId: a.id, toId: b.id,
    type: affinity < 0 ? '竞争' : '挚友', affinity, note: '因果' });
  const order = (chosenAction: 'CHALLENGE_LEADERSHIP' | 'PLOT_COUP'): LLMDecisionPayload =>
    ({ chosenAction, targetCultivatorId: incumbent.id, innerMonologue: '掌门之争' });
  return { world, sect, incumbent, actor, supporter, second, connect, order };
}

describe('sect standing, election and leadership conflict', () => {
  it('promotes only when realm and contribution meet thresholds, without automatically replacing a leader', () => {
    const { world, actor, sect, incumbent } = fixture();
    actor.realm = '筑基'; actor.contribution = 130;
    expect(earnedSectRank(actor)).toBe('真传弟子');
    actor.realm = '元婴'; actor.contribution = 129;
    expect(earnedSectRank(actor)).toBe('长老');
    rewardContribution(actor, world, 1);
    rewardContribution(actor, world, Number.NaN);
    maintainSectPolitics(world);
    expect(actor.sectRank).toBe('太上长老'); expect(incumbent.sectRank).toBe('掌门'); expect(sect.leaderId).toBe(incumbent.id);
  });

  it('fills vacancies based on eligible same-sect ballots, not external patrons', () => {
    const { world, sect, incumbent, actor, supporter, second, connect } = fixture();
    incumbent.alive = false;
    supporter.sectId = sect.id; supporter.realm = '金丹'; supporter.contribution = 80;
    connect(actor, supporter, 60); connect(supporter, second, 90);
    const voter = world.cultivators[4]; voter.sectId = sect.id; voter.realm = '练气'; voter.contribution = 0;
    connect(actor, voter, 80);
    expect(maintainSectPolitics(world).find(({ actorIds }) => actorIds.includes(actor.id))?.title).toContain('推举');
    expect(sect.succession).toMatchObject({ leaderId: actor.id, previousLeaderId: incumbent.id, method: 'election' });
    expect(sect.succession?.supporterIds).toContain(voter.id);
    expect(sect.succession?.supporterIds).not.toContain(second.id);
    expect(incumbent.sectRank).not.toBe('掌门');
    expect(maintainSectPolitics(world)).toEqual([]);
  });

  it('allows a default-size sect to use strong external support, but rejects weak, remote or stale proposals', () => {
    const { world, actor, incumbent, supporter, connect, order } = fixture();
    connect(actor, supporter, 64);
    const rng = vi.fn(() => .5);
    expect(availableLeadershipActions(actor, world)).toEqual([]);
    world.relationships[0].affinity = 65;
    expect(availableLeadershipActions(actor, world)).toEqual([{ action: 'CHALLENGE_LEADERSHIP', targetCultivatorId: incumbent.id }]);
    supporter.locationId = '远方';
    expect(resolveLeadershipAction(world, actor, order('CHALLENGE_LEADERSHIP'), rng)).toBeNull();
    expect(rng).not.toHaveBeenCalled();
  });

  it('transfers a formal challenge openly and does not let damage kill', () => {
    const { world, sect, actor, incumbent, connect, order } = fixture();
    connect(); incumbent.hp = 1;
    const event = resolveLeadershipAction(world, actor, order('CHALLENGE_LEADERSHIP'), () => .5);
    expect(event?.witnessScope).toBeUndefined();
    expect(sect.leaderId).toBe(actor.id);
    expect(actor.sectRank).toBe('掌门'); expect(incumbent.sectRank).not.toBe('掌门');
    expect(incumbent.alive).toBe(true); expect(incumbent.hp).toBe(1);
    expect(sect.succession?.method).toBe('challenge');
    expect(resolveLeadershipAction(world, actor, order('CHALLENGE_LEADERSHIP'), () => 1)).toBeNull();
  });

  it('reports failed clandestine coups to participants only and penalizes a surviving conspirator', () => {
    const { world, sect, actor, incumbent, supporter, second, connect, order } = fixture();
    connect(actor, supporter); connect(actor, second); connect(actor, incumbent, -50);
    incumbent.combatPower = 10000;
    const before = actor.contribution;
    const event = resolveLeadershipAction(world, actor, order('PLOT_COUP'), () => .5);
    expect(event?.witnessScope).toBe('participants');
    expect(event?.actorIds).toEqual(expect.arrayContaining([actor.id, incumbent.id, supporter.id, second.id]));
    expect(sect.leaderId).toBe(incumbent.id); expect(actor.alive).toBe(true);
    expect(actor.contribution).toBe(before - 12);
  });

  it('announces successful coups, clears former leadership, and preserves lethal inheritance', () => {
    const { world, sect, actor, incumbent, supporter, second, connect, order } = fixture();
    connect(actor, supporter); connect(actor, second); connect(actor, incumbent, -50);
    incumbent.hp = 1;
    incumbent.authoredTechnique = { id: 'last-scroll', name: '末卷', spiritRoot: '雷' };
    const event = resolveLeadershipAction(world, actor, order('PLOT_COUP'), () => .5);
    expect(event?.category).toBe('death');
    expect(sect.succession).toMatchObject({ leaderId: actor.id, method: 'coup' });
    expect(incumbent.alive).toBe(false); expect(incumbent.sectRank).not.toBe('掌门');
    expect(world.locations.find(({ id }) => id === sect.headquartersId)?.inheritanceScrolls).toContainEqual(incumbent.authoredTechnique);
  });
});
