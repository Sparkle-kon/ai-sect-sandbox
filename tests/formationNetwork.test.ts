import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  advanceFormations, availableFormationActions, createFormationNetworkState, formationLinkAvailability, formationLinkSteps,
  FORMATION_BUFFER_CAP, FORMATION_DISPATCH_QI, FORMATION_DRAW_CAP, FORMATION_MAX_THROUGHPUT, FORMATION_OFFER_TICKS,
  FORMATION_OVERLOAD_QI, FORMATION_REPAIR_COST, FORMATION_SETUP_COST, resolveFormationAction, visibleFormationLinks,
} from '../src/engine/formationNetworkEngine';
import type { Cultivator, FormationLink, FormationMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(99536);
  world.formations = createFormationNetworkState();
  world.tick = 10;
  const [first, second, third] = world.sects;
  const setup = (sect: typeof first) => {
    sect.facilities.qi_array = 1;
    sect.spiritStones = 200;
    const site = world.locations.find(({ id }) => id === sect.headquartersId)!;
    const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
    site.ownerSectId = sect.id;
    leader.locationId = site.id;
    leader.qiProgress = 80;
    return { site, leader };
  };
  const origin = setup(first);
  const dest = setup(second);
  const observer = setup(third);
  const member = world.cultivators.find((actor) => actor.sectId === first.id && actor.id !== origin.leader.id)!;
  member.locationId = origin.site.id;
  member.qiProgress = 70;
  const act = (actor: Cultivator, formationMove: FormationMove, id: string) => resolveFormationAction(world, actor, {
    chosenAction: 'FORMATION_NETWORK', formationMove, innerMonologue: '实转灵气后再记账',
    ...(formationMove === 'offer' ? { targetSectId: id } : { targetFormationLinkId: id }),
  });
  const offer = () => {
    expect(act(origin.leader, 'offer', second.id)?.witnessScope).toBe('participants');
    return world.formations.links[0];
  };
  const fund = () => {
    const link = offer();
    expect(act(dest.leader, 'accept', link.id)?.title).toBe('两宗付资实接联阵');
    return link;
  };
  const conservation = (link: FormationLink) => {
    expect(link.sentTotal).toBe(link.deliveredTotal + link.transmissionLoss);
    expect(link.deliveredTotal).toBe(link.drawnTotal + link.heldA + link.heldB + link.dissipatedTotal);
  };
  return { world, first, second, third, origin, dest, observer, member, act, offer, fund, conservation };
}

describe('bilateral real owned formation relays', () => {
  it('offers privately without debit; rechecks actual bilateral state, then funds once for the canonical pair', () => {
    const { world, first, second, origin, dest, member, observer, act, offer } = fixture();
    expect(act(member, 'offer', second.id)).toBeNull();
    second.facilities.qi_array = 0;
    expect(act(origin.leader, 'offer', second.id)).toBeNull();
    second.facilities.qi_array = 1;
    delete dest.site.ownerSectId;
    expect(act(origin.leader, 'offer', second.id)).toBeNull();
    dest.site.ownerSectId = second.id;
    const link = offer();
    expect(link.sectAId < link.sectBId).toBe(true);
    expect(link.steps).toBe(formationLinkSteps(world, origin.site, dest.site));
    expect(link.steps).toBe(formationLinkSteps(world, dest.site, origin.site));
    expect(link.openedPaymentEach).toBe(0);
    expect(first.spiritStones).toBe(200);
    expect(second.spiritStones).toBe(200);
    expect(visibleFormationLinks(world, observer.leader)).toEqual([]);
    expect(act(dest.leader, 'offer', first.id)).toBeNull();
    expect(act(origin.leader, 'accept', link.id)).toBeNull();
    first.spiritStones = FORMATION_SETUP_COST - 1;
    expect(act(dest.leader, 'accept', link.id)).toBeNull();
    first.spiritStones = 200;
    expect(act(dest.leader, 'accept', link.id)).not.toBeNull();
    expect(act(dest.leader, 'accept', link.id)).toBeNull();
    expect(first.spiritStones).toBe(200 - FORMATION_SETUP_COST);
    expect(second.spiritStones).toBe(200 - FORMATION_SETUP_COST);
    expect(link).toMatchObject({ status: 'active', openedPaymentEach: FORMATION_SETUP_COST, heldA: 0, heldB: 0, sentTotal: 0 });
    expect(visibleFormationLinks(world, observer.leader)).toEqual([]);
    expect(visibleFormationLinks(world, dest.leader)).toEqual([link]);
  });

  it('deducts existing personal charge, accounts route losses, and delivers only an actual local bounded withdrawal', () => {
    const { world, origin, dest, observer, member, act, fund, conservation } = fixture();
    const link = fund();
    const firstQi = member.qiProgress;
    expect(act(member, 'dispatch', link.id)).not.toBeNull();
    expect(member.qiProgress).toBe(firstQi - FORMATION_DISPATCH_QI);
    const expected = FORMATION_DISPATCH_QI - Math.ceil(FORMATION_DISPATCH_QI / 5) - Math.ceil(link.steps / 6);
    expect(link.deliveredTotal).toBe(expected);
    expect(link.receipts[0]).toMatchObject({ kind: 'dispatch', fromSiteId: origin.site.id, toSiteId: dest.site.id,
      sent: FORMATION_DISPATCH_QI, delivered: expected, lost: FORMATION_DISPATCH_QI - expected });
    expect(act(dest.leader, 'dispatch', link.id)).toBeNull();
    expect(act(observer.leader, 'draw', link.id)).toBeNull();
    const originalLocation = dest.leader.locationId;
    dest.leader.locationId = origin.site.id;
    expect(act(dest.leader, 'draw', link.id)).toBeNull();
    dest.leader.locationId = originalLocation;
    dest.leader.qiProgress = 99.5;
    expect(act(dest.leader, 'draw', link.id)).toBeNull();
    dest.leader.qiProgress = 99;
    expect(act(dest.leader, 'draw', link.id)).not.toBeNull();
    expect(dest.leader.qiProgress).toBe(100);
    expect(link.drawnTotal).toBe(1);
    expect(act(dest.leader, 'draw', link.id)).toBeNull();
    conservation(link);
    const saved = structuredClone(link);
    world.tick++;
    expect(advanceFormations(world)).toEqual([]);
    expect(link).toEqual(saved);
    dest.leader.qiProgress = 1;
    expect(act(dest.leader, 'draw', link.id)).not.toBeNull();
    expect(dest.leader.qiProgress).toBe(1 + Math.min(FORMATION_DRAW_CAP, expected - 1));
    conservation(link);
  });

  it('bounds buffer capacity and explicit overload, breaks no more than once, and restores only with paid repair', () => {
    const { world, first, origin, dest, member, act, fund, conservation } = fixture();
    const link = fund();
    expect(act(member, 'overload', link.id)).toBeNull();
    expect(act(origin.leader, 'overload', link.id)?.title).toBe('超限调拨致阵链断开');
    expect(origin.leader.qiProgress).toBe(80 - FORMATION_OVERLOAD_QI);
    const delivered = FORMATION_MAX_THROUGHPUT - Math.ceil(FORMATION_MAX_THROUGHPUT / 5) - Math.ceil(link.steps / 6);
    expect(link).toMatchObject({ status: 'broken', brokenTick: world.tick, deliveredTotal: delivered });
    expect(act(origin.leader, 'overload', link.id)).toBeNull();
    expect(act(origin.leader, 'repair', link.id)).toBeNull();
    const stones = first.spiritStones;
    world.tick++;
    expect(act(origin.leader, 'repair', link.id)).not.toBeNull();
    expect(act(origin.leader, 'repair', link.id)).toBeNull();
    expect(first.spiritStones).toBe(stones - FORMATION_REPAIR_COST);
    expect(link).toMatchObject({ status: 'active', brokenTick: world.tick - 1, repairTotal: FORMATION_REPAIR_COST });
    expect(act(member, 'dispatch', link.id)).not.toBeNull();
    world.tick++;
    expect(act(member, 'dispatch', link.id)).not.toBeNull();
    expect(link.heldA + link.heldB).toBe(FORMATION_BUFFER_CAP);
    expect(act(member, 'dispatch', link.id)).toBeNull();
    world.tick++;
    expect(act(member, 'dispatch', link.id)).toBeNull();
    expect(act(dest.leader, 'draw', link.id)).not.toBeNull();
    conservation(link);
  });

  it('suspends war without erasing property, then closes once only when an actual pinned endpoint is lost', () => {
    const { world, first, second, origin, dest, member, act, fund, conservation } = fixture();
    const link = fund();
    expect(act(member, 'dispatch', link.id)).not.toBeNull();
    world.tick++;
    const stored = link.heldA + link.heldB;
    world.diplomacy = [{ sectAId: first.id, sectBId: second.id, affinity: -100, pact: 'war', sinceTick: world.tick }];
    expect(formationLinkAvailability(world, link)).toBe('hostility');
    expect(advanceFormations(world)).toEqual([]);
    expect(act(dest.leader, 'draw', link.id)).toBeNull();
    expect(link.heldA + link.heldB).toBe(stored);
    world.diplomacy[0].pact = 'neutral';
    expect(formationLinkAvailability(world, link)).toBe('ready');
    delete dest.site.ownerSectId;
    expect(formationLinkAvailability(world, link)).toBe('site_lost');
    expect(act(origin.leader, 'dispatch', link.id)).toBeNull();
    expect(advanceFormations(world)).toHaveLength(1);
    expect(advanceFormations(world)).toEqual([]);
    expect(link).toMatchObject({ status: 'ended', endReason: 'site_lost', dissipatedTotal: stored, heldA: 0, heldB: 0 });
    conservation(link);
  });

  it('does not turn a declined or expired handshake into any charge or public link', () => {
    const { world, first, second, origin, dest, observer, offer, act } = fixture();
    const deal = offer();
    expect(act(dest.leader, 'decline', deal.id)?.witnessScope).toBe('participants');
    expect(availableFormationActions(origin.leader, world, false).some(({ formationMove }) => formationMove === 'offer')).toBe(false);
    expect(act(origin.leader, 'offer', second.id)).not.toBeNull();
    const other = world.formations.links[1];
    world.tick += FORMATION_OFFER_TICKS;
    expect(act(dest.leader, 'accept', other.id)).toBeNull();
    expect(advanceFormations(world)).toHaveLength(1);
    expect(advanceFormations(world)).toEqual([]);
    expect(visibleFormationLinks(world, observer.leader)).toEqual([]);
    expect([first.spiritStones, second.spiritStones]).toEqual([200, 200]);
    expect(other).toMatchObject({ status: 'expired', openedPaymentEach: 0, sentTotal: 0, settledTick: world.tick });
  });
});
