import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeSanctuaryPass, advanceSanctuaries, availableSanctuaryActions, createSanctuaryState, interceptSanctuaryDuel, resolveSanctuaryAction,
  sanctuaryCanShield, SANCTUARY_BLOCK_HP, SANCTUARY_CHARTER_TICKS, SANCTUARY_FOUND_COST, SANCTUARY_KARMA_PENALTY,
  SANCTUARY_MAX_SHIELD, SANCTUARY_PASS_TICKS, SANCTUARY_REPAIR_COST, visibleSanctuaries } from '../src/engine/sanctuaryEngine';
import type { Cultivator, SanctuaryMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(102030);
  world.sanctuary = createSanctuaryState();
  world.tick = 8;
  const sponsor = world.sects[0];
  const rival = world.sects[1];
  const site = world.locations.find(({ id }) => id === 'loc-market')!;
  const leader = world.cultivators.find(({ id }) => id === sponsor.leaderId)!;
  const rivalLeader = world.cultivators.find(({ id }) => id === rival.leaderId)!;
  const [visitor, attacker, witness] = world.cultivators.filter((person) => person.id !== leader.id && person.id !== rivalLeader.id && person.sectId !== sponsor.id);
  leader.locationId = site.id;
  for (const actor of [visitor, attacker, witness]) { actor.locationId = site.id; actor.karma = 5; }
  const move = (actor: Cultivator, sanctuaryMove: SanctuaryMove, id: string) => resolveSanctuaryAction(world, actor,
    { chosenAction: 'SANCTUARY', sanctuaryMove, innerMonologue: '仅依实账',
      ...(sanctuaryMove === 'found' ? { targetLocationId: id } : { targetSanctuaryId: id }) });
  const found = () => {
    expect(move(leader, 'found', site.id)?.title).toBe('避难章程生效');
    return world.sanctuary.charters[0];
  };
  return { world, sponsor, rival, leader, rivalLeader, visitor, attacker, witness, site, move, found };
}

describe('site-scoped, voluntarily taken sanctuary rights', () => {
  it('charges one legitimate charter, rejects forged/foreign sites and admits war visitors without faction changes', () => {
    const { world, sponsor, rival, leader, rivalLeader, visitor, site, move, found } = fixture();
    expect(move(leader, 'found', 'not-a-site')).toBeNull();
    expect(move(leader, 'found', 'loc-secret-1')).toBeNull();
    expect(move(visitor, 'found', site.id)).toBeNull();
    site.ownerSectId = rival.id;
    expect(move(leader, 'found', site.id)).toBeNull();
    delete site.ownerSectId;
    const oldStones = sponsor.spiritStones;
    const charter = found();
    expect(charter).toMatchObject({ siteId: site.id, sponsorSectId: sponsor.id, maxShieldHp: SANCTUARY_MAX_SHIELD,
      expiresTick: world.tick + SANCTUARY_CHARTER_TICKS });
    expect(sponsor.spiritStones).toBe(oldStones - SANCTUARY_FOUND_COST);
    rivalLeader.locationId = site.id;
    expect(move(rivalLeader, 'found', site.id)).toBeNull();
    expect(move(leader, 'found', site.id)).toBeNull();
    expect(activeSanctuaryPass(world, visitor)).toBeUndefined();
    visitor.sectId = rival.id;
    visitor.locationId = rival.headquartersId;
    world.diplomacy = [{ sectAId: sponsor.id, sectBId: rival.id, pact: 'war', sinceTick: 1, affinity: -80 }];
    expect(move(visitor, 'take_pass', charter.id)?.witnessScope).toBe('participants');
    expect(activeSanctuaryPass(world, visitor)?.expiresTick).toBe(world.tick + SANCTUARY_PASS_TICKS);
    expect(visitor.locationId).toBe(rival.headquartersId);
    expect(world.diplomacy[0].pact).toBe('war');
    expect(move(visitor, 'take_pass', charter.id)).toBeNull();
    expect(move(visitor, 'surrender', charter.id)?.witnessScope).toBe('participants');
    expect(move(visitor, 'take_pass', charter.id)).toBeNull();
    expect(world.sanctuary.passes[0]).toMatchObject({ endReason: 'surrendered', endedTick: world.tick });
  });

  it('uses a finite shared ward at the real location; preserves actual combat at zero, charges verified repairs once', () => {
    const { world, sponsor, leader, visitor, attacker, site, move, found } = fixture();
    const charter = found();
    expect(move(visitor, 'take_pass', charter.id)).not.toBeNull();
    const unrelated = world.locations.find(({ id }) => id === 'loc-market-east')!;
    for (const actor of [attacker, visitor]) actor.locationId = unrelated.id;
    expect(sanctuaryCanShield(world, attacker, visitor)).toBe(false);
    expect(interceptSanctuaryDuel(world, attacker, visitor)).toBeUndefined();
    for (const actor of [attacker, visitor]) actor.locationId = site.id;
    const startingHp = visitor.hp;
    for (let i = 0; i < 3; i++) {
      expect(sanctuaryCanShield(world, attacker, visitor)).toBe(true);
      const block = interceptSanctuaryDuel(world, attacker, visitor);
      expect(block?.blocked).toBe(true);
      expect(interceptSanctuaryDuel(world, attacker, visitor)).toEqual(block);
      expect(charter.shieldHp).toBe(SANCTUARY_MAX_SHIELD - (i + 1) * SANCTUARY_BLOCK_HP);
      expect(attacker.karma).toBe(5 - (i + 1) * SANCTUARY_KARMA_PENALTY);
      world.tick++;
    }
    expect(visitor.hp).toBe(startingHp);
    expect(sanctuaryCanShield(world, attacker, visitor)).toBe(false);
    expect(interceptSanctuaryDuel(world, attacker, visitor)?.blocked).toBe(false);
    expect(world.sanctuary.incidents.at(-1)).toMatchObject({ kind: 'exhausted', shieldSpent: 0 });
    expect(activeSanctuaryPass(world, visitor)).toBeDefined();
    const cash = sponsor.spiritStones;
    expect(move(leader, 'repair', charter.id)).not.toBeNull();
    expect(charter.shieldHp).toBe(30);
    expect(move(leader, 'repair', charter.id)).toBeNull();
    expect(sponsor.spiritStones).toBe(cash - SANCTUARY_REPAIR_COST);
    expect(charter.stonesSpent).toBe(SANCTUARY_FOUND_COST + SANCTUARY_REPAIR_COST);
  });

  it('revokes a visitor who makes a local attack; does not spend the ward for an unprotected defender or reveal other passes', () => {
    const { world, leader, visitor, attacker, witness, move, found } = fixture();
    const charter = found();
    expect(move(visitor, 'take_pass', charter.id)).not.toBeNull();
    expect(visibleSanctuaries(world, witness)[0]).toEqual({ charter, ownPass: undefined, incidents: [] });
    expect(interceptSanctuaryDuel(world, visitor, attacker)?.blocked).toBe(false);
    expect(world.sanctuary.passes[0]).toMatchObject({ status: 'ended', endReason: 'violation' });
    expect(attacker.karma).toBe(5);
    expect(visitor.karma).toBe(5 - SANCTUARY_KARMA_PENALTY);
    expect(charter.shieldHp).toBe(SANCTUARY_MAX_SHIELD);
    expect(world.sanctuary.incidents.at(-1)?.kind).toBe('forfeited');
    expect(visibleSanctuaries(world, visitor)[0].incidents).toHaveLength(1);
    expect(visibleSanctuaries(world, leader)[0].incidents).toHaveLength(0);
    expect(activeSanctuaryPass(world, visitor)).toBeUndefined();
    expect(move(visitor, 'take_pass', charter.id)).toBeNull();
    expect(move(witness, 'take_pass', charter.id)).not.toBeNull();
    expect(interceptSanctuaryDuel(world, visitor, witness)?.blocked).toBe(true);
  });

  it('validates exact expiry, recorded loss of jurisdiction, and closed charters even before maintenance', () => {
    const { world, rival, visitor, attacker, site, found, move } = fixture();
    const charter = found();
    expect(move(visitor, 'take_pass', charter.id)).not.toBeNull();
    world.tick += SANCTUARY_PASS_TICKS;
    expect(activeSanctuaryPass(world, visitor)).toBeUndefined();
    expect(interceptSanctuaryDuel(world, attacker, visitor)).toBeUndefined();
    expect(advanceSanctuaries(world)[0]?.title).toBe('通行敕令失效');
    expect(world.sanctuary.passes[0].endReason).toBe('expiry');
    expect(advanceSanctuaries(world)).toEqual([]);
    expect(move(attacker, 'take_pass', charter.id)).not.toBeNull();
    site.ownerSectId = rival.id;
    expect(activeSanctuaryPass(world, attacker)).toBeUndefined();
    expect(advanceSanctuaries(world).map(({ title }) => title)).toEqual(['避难章程终止', '通行敕令失效']);
    expect(charter.endReason).toBe('site_lost');
    expect(world.sanctuary.passes[1].endReason).toBe('charter_ended');
  });

  it('does not register unknown veins, warranted visitors, or more than one valid pass at a time', () => {
    const { world, sponsor, leader, visitor, site, found, move } = fixture();
    const primary = found();
    const vein = world.locations.find(({ id }) => id === 'loc-vein-north')!;
    leader.locationId = vein.id;
    expect(move(leader, 'found', vein.id)).not.toBeNull();
    const secondary = world.sanctuary.charters[1];
    visitor.locationId = site.id;
    visitor.exploredTileIds = [];
    visitor.rumors = [];
    expect(visibleSanctuaries(world, visitor).map((item) => item.charter.id)).toEqual([primary.id]);
    expect(move(visitor, 'take_pass', secondary.id)).toBeNull();
    world.bounties.push({ id: 'active-warrant', targetCultivatorId: visitor.id, sponsorSectIds: [sponsor.id],
      reason: '依据悬赏台', issuedTick: world.tick, reward: 60, status: 'open', escrow: [{ sectId: sponsor.id, amount: 60 }] });
    expect(move(visitor, 'take_pass', primary.id)).toBeNull();
    world.bounties.pop();
    expect(move(visitor, 'take_pass', primary.id)).not.toBeNull();
    visitor.locationId = vein.id;
    expect(availableSanctuaryActions(visitor, world).some(({ sanctuaryMove }) => sanctuaryMove === 'take_pass')).toBe(false);
  });
});
