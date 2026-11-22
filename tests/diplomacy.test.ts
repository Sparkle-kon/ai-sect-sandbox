import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeSiegeForActor, adjustSectAffinity, advanceDiplomacy, availableDiplomacyActions, resolveDiplomacyAction, sectRelation, SIEGE_COST } from '../src/engine/diplomacyEngine';
import type { LLMDecisionPayload } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.diplomacy = []; world.sieges = []; world.tributeDemands = [];
  const [own, target, ally, other] = world.sects;
  const actor = world.cultivators.find(({ id }) => id === own.leaderId)!;
  const opponent = world.cultivators.find(({ id }) => id === target.leaderId)!;
  const action = (chosenAction: LLMDecisionPayload['chosenAction'], targetSectId = target.id): LLMDecisionPayload =>
    ({ chosenAction, targetSectId, innerMonologue: '议事' });
  for (const person of world.cultivators) {
    person.locationId = world.sects.find(({ id }) => id === person.sectId)!.headquartersId;
    person.hp = person.maxHp = 500;
    person.combatPower = person.sectId === target.id ? 200 : 1500;
  }
  return { world, own, target, ally, other, actor, opponent, action };
}

function initializeSiege(f: ReturnType<typeof fixture>) {
  const { world, own, target, ally, other, actor, action } = f;
  for (const friendly of [ally, other]) {
    adjustSectAffinity(world, own.id, friendly.id, 60);
    expect(resolveDiplomacyAction(world, actor, action('OFFER_ALLIANCE', friendly.id))).not.toBeNull();
  }
  adjustSectAffinity(world, own.id, target.id, -60);
  expect(resolveDiplomacyAction(world, actor, action('DECLARE_WAR'))).not.toBeNull();
  world.tick += 3;
  return resolveDiplomacyAction(world, actor, action('LAUNCH_SIEGE'));
}

describe('diplomatic pacts, tribute and bounded sieges', () => {
  it('maintains a single symmetric clamped relation and lets only local leaders enact alliance', () => {
    const { world, own, target, actor, opponent, action } = fixture();
    adjustSectAffinity(world, own.id, target.id, 70);
    adjustSectAffinity(world, target.id, own.id, 50);
    expect(world.diplomacy).toHaveLength(1);
    expect(sectRelation(world, own.id, target.id)).toMatchObject({ affinity: 100, pact: 'neutral' });
    opponent.locationId = own.headquartersId;
    expect(resolveDiplomacyAction(world, actor, action('OFFER_ALLIANCE'))).toBeNull();
    opponent.locationId = target.headquartersId;
    expect(resolveDiplomacyAction(world, actor, action('OFFER_ALLIANCE'))?.actorIds).toEqual([actor.id, opponent.id]);
    adjustSectAffinity(world, own.id, target.id, -200);
    world.tick += 3;
    expect(resolveDiplomacyAction(world, actor, action('DECLARE_WAR'))).not.toBeNull();
    adjustSectAffinity(world, own.id, target.id, 150);
    world.tick += 3;
    expect(resolveDiplomacyAction(world, actor, action('OFFER_ALLIANCE'))).toBeNull();
    expect(sectRelation(world, target.id, own.id)?.pact).toBe('war');
  });

  it('makes tribute delayed, conserves both treasuries and settles once', () => {
    const { world, own, target, actor, action } = fixture();
    adjustSectAffinity(world, own.id, target.id, -40);
    const cash = [own.spiritStones, target.spiritStones];
    expect(resolveDiplomacyAction(world, actor, action('DEMAND_TRIBUTE'))).not.toBeNull();
    expect(advanceDiplomacy(world, () => .5)).toEqual([]);
    expect(world.tributeDemands[0].status).toBe('pending');
    world.tick++;
    expect(advanceDiplomacy(world, () => .5)[0].title).toBe('贡赋入库');
    const demand = world.tributeDemands[0];
    expect(demand.status).toBe('paid');
    expect([own.spiritStones, target.spiritStones]).toEqual([cash[0] + demand.amount, cash[1] - demand.amount]);
    expect(advanceDiplomacy(world, () => .5)).toEqual([]);
  });

  it('does not transfer anything when the demanded treasury cannot pay', () => {
    const { world, own, target, actor, action } = fixture();
    adjustSectAffinity(world, own.id, target.id, -40);
    target.spiritStones = 1;
    const cash = own.spiritStones;
    resolveDiplomacyAction(world, actor, action('DEMAND_TRIBUTE'));
    world.tick++;
    expect(advanceDiplomacy(world, () => .5)[0].title).toBe('拒纳贡赋');
    expect(target.spiritStones).toBe(1); expect(own.spiritStones).toBe(cash);
  });

  it('requires five unique living participants and stages the coalition before an actual array breach', () => {
    const { world, own, target, actor, action, ...rest } = fixture();
    adjustSectAffinity(world, own.id, target.id, -60);
    resolveDiplomacyAction(world, actor, action('DECLARE_WAR'));
    world.tick += 3;
    expect(availableDiplomacyActions(actor, world)).not.toContainEqual({ action: 'LAUNCH_SIEGE', targetSectId: target.id });
    world.diplomacy = [];
    const cash = own.spiritStones;
    expect(initializeSiege({ world, own, target, actor, action, ...rest })?.title).toBe('宗门集结攻山');
    const siege = world.sieges[0];
    expect(own.spiritStones).toBe(cash - SIEGE_COST);
    expect(new Set(siege.participantIds).size).toBeGreaterThanOrEqual(5);
    expect(activeSiegeForActor(world, actor)).toBe(siege);
    target.arrayHp = target.arrayMaxHp = 200;
    world.tick++;
    expect(advanceDiplomacy(world, () => .5)[0].title).toBe('联军完成集结');
    expect(advanceDiplomacy(world, () => .5)).toEqual([]);
    world.tick++;
    expect(advanceDiplomacy(world, () => .5)[0].title).toBe('联军抵达山门');
    expect(actor.locationId).toBe(target.headquartersId);
    for (let i = 0; i < 7 && siege.status === 'sieging'; i++) {
      world.tick++;
      advanceDiplomacy(world, () => .5);
    }
    expect(target.arrayHp).toBe(0);
    expect(siege.status).toBe('victory');
    expect(actor.hp).toBeLessThan(500);
    expect(actor.locationId).toBe(own.headquartersId);
    expect(activeSiegeForActor(world, actor)).toBeUndefined();
    expect(own.spiritStones + target.spiritStones).toBe(cash - SIEGE_COST + 4600);
  });

  it('repels the expedition without granting a reward if living participants are lost', () => {
    const f = fixture();
    expect(initializeSiege(f)).not.toBeNull();
    const siege = f.world.sieges[0];
    const raid = f.world.cultivators.filter(({ id }) => siege.participantIds.includes(id));
    for (const person of raid.slice(4)) person.alive = false;
    const cash = f.own.spiritStones;
    f.world.tick++;
    expect(advanceDiplomacy(f.world, () => .5)[0].title).toBe('攻山退兵');
    expect(siege.status).toBe('repelled');
    expect(f.own.spiritStones).toBe(cash);
  });
  it('does not pull someone from an independent plane into a lower siege or a stale marching roster',()=>{
    const f=fixture();
    const frontier=f.world.cultivators.find(row=>row.id!==f.actor.id&&row.sectId===f.own.id)!;
    const upper=f.world.cultivators.find(row=>row.sectId===f.ally.id&&row.id!==f.ally.leaderId)!;
    // Deliberate stale-roster boundary. The real archived E43 overlap supplies the normal-world positive.
    frontier.positionPlane='frontier';frontier.locationId='frontier-north-home';
    upper.positionPlane='upper';upper.locationId='array-field-home';
    expect(initializeSiege(f)).not.toBeNull();
    const siege=f.world.sieges[0], before=f.own.spiritStones;
    expect(siege.participantIds).not.toContain(frontier.id);
    expect(siege.participantIds).not.toContain(upper.id);
    const stale=f.world.cultivators.find(row=>row.id!==f.actor.id&&siege.participantIds.includes(row.id))!;
    stale.positionPlane='threshold';stale.locationId='realm-passage-upper-step';
    f.world.tick++;
    const events=advanceDiplomacy(f.world,()=>.5);
    expect(events.every(row=>![frontier,upper,stale].some(actor=>row.actorIds.includes(actor.id)))).toBe(true);
    expect([frontier.locationId,upper.locationId,stale.locationId]).toEqual(['frontier-north-home','array-field-home','realm-passage-upper-step']);
    expect(f.own.spiritStones).toBe(before);
  });
});
