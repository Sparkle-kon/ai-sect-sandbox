import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceBounties, availableBountyHunts, pursueBounty, recordTransgression } from '../src/engine/bountyEngine';
import type { LLMDecisionPayload, WorldEvent } from '../src/types/world';

function fixture() {
  const world = createInitialWorld();
  world.bounties = [];
  const [hunter, allyHunter, target] = [world.cultivators[0], world.cultivators[4], world.cultivators[2]];
  const [sponsor, , ally] = world.sects;
  world.diplomacy = [{ sectAId: sponsor.id, sectBId: ally.id, affinity: 80, pact: 'alliance', sinceTick: world.tick }];
  const bountyAction = (): LLMDecisionPayload => ({ chosenAction: 'PURSUE_BOUNTY', targetBountyId: world.bounties[0].id, innerMonologue: '追缉' });
  const fight = (actor = hunter): WorldEvent => ({ id: 'duel-fixture', tick: world.tick, year: world.year, month: world.month,
    title: '斗法', description: '激斗告终。', category: 'combat', actorIds: [actor.id, target.id] });
  return { world, hunter, allyHunter, target, sponsor, ally, bountyAction, fight };
}
const issue = ({ world, target }: ReturnType<typeof fixture>) => {
  recordTransgression(target, 'betrayal');
  recordTransgression(target, 'killing');
  advanceBounties(world);
  return world.bounties[0];
};

describe('righteous bounty escrow and eligible claims', () => {
  it('accumulates only recorded misconduct and escrows conserved funds from sponsor and allied sect', () => {
    const f = fixture();
    const { world, target, sponsor, ally } = f;
    target.karma = 0; target.transgressions = 0;
    expect(advanceBounties(world)).toEqual([]);
    const treasury = sponsor.spiritStones + ally.spiritStones;
    const bounty = issue(f);
    expect(target.transgressions).toBe(5);
    expect(target.karma).toBe(-30);
    expect(bounty.sponsorSectIds).toEqual([sponsor.id, ally.id]);
    expect(bounty.escrow.reduce((total, { amount }) => total + amount, 0)).toBe(bounty.reward);
    expect(sponsor.spiritStones + ally.spiritStones + bounty.reward).toBe(treasury);
    expect(advanceBounties(world)).toEqual([]);
  });

  it('does not issue obligations with insufficient righteous funds', () => {
    const f = fixture();
    f.sponsor.spiritStones = 174;
    f.target.transgressions = 15;
    expect(advanceBounties(f.world)).toEqual([]);
    expect(f.world.bounties).toEqual([]);
    expect(f.sponsor.spiritStones).toBe(174);
  });

  it('does not expose remote positions and follows only known, credible, possibly stale leads', () => {
    const f = fixture(); issue(f);
    const { world, hunter, target, bountyAction } = f;
    const hiddenLocation = target.locationId;
    expect(hunter.locationId).not.toBe(hiddenLocation);
    expect(availableBountyHunts(hunter, world)).toEqual([]);
    const known = world.locations.find(({ id }) => id !== hunter.locationId && id !== target.locationId)!;
    hunter.rumors = [{ id: 'bait', subject: `${target.name}现身`, originTick: world.tick, learnedTick: world.tick,
      provenance: 'fabricated', confidence: 100, hops: 0, locationId: hiddenLocation }];
    expect(availableBountyHunts(hunter, world)).toEqual([]);
    hunter.rumors.push({ ...hunter.rumors[0], id: 'real', provenance: 'witness', locationId: known.id, confidence: 70 });
    const duel = vi.fn(() => null);
    expect(pursueBounty(world, hunter, bountyAction(), duel)?.title).toBe('循线追索');
    expect(duel).not.toHaveBeenCalled();
    expect(hunter.locationId).toBe(known.id);
    expect(target.locationId).toBe(hiddenLocation);
    expect(availableBountyHunts(hunter, world)).toEqual([]);
  });

  it('requires a verified win, then pays and captures once using the actual escrow balance', () => {
    const f = fixture(); const bounty = issue(f);
    const { world, allyHunter, target, sponsor, bountyAction, fight } = f;
    allyHunter.locationId = target.locationId;
    const stones = allyHunter.spiritStones;
    expect(availableBountyHunts(allyHunter, world)).toHaveLength(1);
    expect(pursueBounty(world, allyHunter, bountyAction(), () => ({ event: fight(allyHunter), winnerId: target.id }))?.title).toBe('斗法');
    expect(bounty.status).toBe('open');
    expect(pursueBounty(world, allyHunter, bountyAction(), () => fight(allyHunter))?.title).toBe('斗法');
    expect(bounty.status).toBe('open');
    expect(pursueBounty(world, allyHunter, bountyAction(), () => ({ event: fight(allyHunter), winnerId: allyHunter.id }))?.title).toBe('悬赏目标归案');
    expect(bounty.status).toBe('claimed');
    expect(allyHunter.spiritStones).toBe(stones + bounty.reward);
    expect(bounty.escrow).toEqual([]);
    expect(target.alive).toBe(true); expect(target.locationId).toBe(sponsor.headquartersId); expect(target.qiProgress).toBe(0);
    expect(pursueBounty(world, allyHunter, bountyAction(), () => null)).toBeNull();
  });

  it('refunds a third-party death precisely once, but awards a confirmed lethal hunt', () => {
    const f = fixture(); const before = [f.sponsor.spiritStones, f.ally.spiritStones]; const bounty = issue(f);
    f.target.alive = false; f.target.hp = 0;
    expect(advanceBounties(f.world)[0]?.title).toBe('天机悬赏撤销');
    expect([f.sponsor.spiritStones, f.ally.spiritStones]).toEqual(before);
    expect(bounty.status).toBe('withdrawn');
    expect(advanceBounties(f.world)).toEqual([]);
    const g = fixture(); const active = issue(g);
    g.hunter.locationId = g.target.locationId;
    const cash = g.hunter.spiritStones;
    expect(pursueBounty(g.world, g.hunter, g.bountyAction(), () => {
      g.target.alive = false; g.target.hp = 0; return { ...g.fight(), category: 'death' };
    })?.category).toBe('death');
    expect(active.hunterId).toBe(g.hunter.id);
    expect(g.hunter.spiritStones).toBe(cash + active.reward);
  });
});
