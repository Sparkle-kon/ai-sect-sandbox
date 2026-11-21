import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceSharedCommons, availableSharedCommonsActions, COMMONS_MAINTENANCE_UNIT, COMMONS_OFFER_TICKS, COMMONS_ROUND_TICKS,
  COMMONS_TERM_TICKS, commonsHarvestLimit, currentCommonsRound, createSharedCommonsState, resolveSharedCommonsAction,
  settleCommonsHarvest, visibleSharedCommons } from '../src/engine/sharedCommonsEngine';
import type { Cultivator, LLMDecisionPayload } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(8772);
  world.sharedCommons = createSharedCommonsState();
  world.tick = 20;
  const site = world.locations.find(({ id }) => id === 'loc-market')!;
  site.herbs.jade_leaf = 9;
  site.herbCapacity.jade_leaf = 9;
  const [lead, , , last] = world.sects;
  for (const sect of world.sects) sect.spiritStones = 100;
  const representatives = world.sects.map((sect) => world.cultivators.find(({ id }) => id === sect.leaderId)!);
  const proposer = representatives[0];
  proposer.locationId = site.id;
  for (let i = 1; i < representatives.length; i++) representatives[i].locationId = world.sects[i].headquartersId;
  const outsider = world.cultivators.find((actor) => actor.sectId === last.id && actor.id !== last.leaderId)!;
  outsider.locationId = site.id;
  const act = (actor: Cultivator, fields: Partial<LLMDecisionPayload>) =>
    resolveSharedCommonsAction(world, actor, { chosenAction: 'SHARED_COMMONS', innerMonologue: '本人以实账共同签署', ...fields });
  const offer = () => {
    const option = availableSharedCommonsActions(proposer, world).find((row) => row.commonsMove === 'offer' && row.targetLocationId === site.id && row.targetHerbId === 'jade_leaf' &&
      row.targetSectId !== last.id && row.targetCommonsThirdSectId !== last.id)!;
    expect(option).toBeDefined();
    const { action: _action, ...fields } = option;
    expect(act(proposer, fields)?.witnessScope).toBe('participants');
    return world.sharedCommons.pacts.at(-1)!;
  };
  const signed = () => {
    const row = offer();
    for (const guest of row.parties.slice(1)) {
      expect(act(world.cultivators.find(({ id }) => id === guest.signerId)!, { commonsMove: 'sign', targetCommonsId: row.id })).not.toBeNull();
    }
    return row;
  };
  const gather = (actor: Cultivator, amount: number) => {
    if (!settleCommonsHarvest(world, actor, site, 'jade_leaf', amount)) return false;
    site.herbs.jade_leaf -= amount;
    actor.herbs.jade_leaf += amount;
    return true;
  };
  return { world, site, lead, proposer, outsider, act, offer, signed, gather };
}

describe('shared neutral commons backed by real stock and treasuries', () => {
  it('requires exact unanimous representatives and opens the first round later without changing title', () => {
    const { world, site, proposer, outsider, act, offer } = fixture();
    const own = world.sects.find(({ id }) => id === proposer.sectId)!;
    proposer.locationId = own.headquartersId;
    const hq = world.locations.find(({ id }) => id === own.headquartersId)!;
    delete hq.ownerSectId;
    expect(availableSharedCommonsActions(proposer, world)).toEqual([]);
    hq.ownerSectId = own.id;
    const row = offer();
    proposer.locationId = site.id;
    expect(row.parties.map(({ share }) => share)).toEqual([2, 1, 1]);
    expect(row.offerExpiresTick).toBe(world.tick + COMMONS_OFFER_TICKS);
    expect(visibleSharedCommons(world, outsider)).toEqual([]);
    expect(act(outsider, { commonsMove: 'sign', targetCommonsId: row.id })).toBeNull();
    const [a,b] = row.parties.slice(1).map(({ signerId }) => world.cultivators.find(({ id }) => id === signerId)!);
    expect(act(a, { commonsMove: 'sign', targetCommonsId: row.id })).not.toBeNull();
    expect(act(a, { commonsMove: 'sign', targetCommonsId: row.id })).toBeNull();
    expect(world.sects.every((sect) => sect.spiritStones === 100)).toBe(true);
    expect(row.status).toBe('offered');
    expect(act(b, { commonsMove: 'sign', targetCommonsId: row.id })).not.toBeNull();
    expect(row).toMatchObject({ activatedTick: world.tick, startsTick: world.tick + 1, endsTick: world.tick + 1 + COMMONS_TERM_TICKS, status: 'active' });
    expect(advanceSharedCommons(world)).toEqual([]);
    expect(commonsHarvestLimit(world, proposer, site, 'jade_leaf')).toBe(2);
    world.tick++;
    expect(advanceSharedCommons(world)).toHaveLength(1);
    expect(advanceSharedCommons(world)).toEqual([]);
    expect(site.ownerSectId).toBeUndefined();
    const round = currentCommonsRound(world, row)!;
    expect(round).toMatchObject({ stockAtOpen: 9, reserved: 8, startTick: world.tick, endsTick: world.tick + COMMONS_ROUND_TICKS });
    expect(round.allocations.map(({ quota }) => quota)).toEqual([4, 2, 2]);
    expect(round.allocations.map(({ maintenancePaid }) => maintenancePaid)).toEqual([2, 1, 1].map((n) => n * COMMONS_MAINTENANCE_UNIT));
    expect(visibleSharedCommons(world, outsider)).toHaveLength(1);
  });

  it('limits every actor to an actual paid share or public remainder, with no stock duplication and no default bypass', () => {
    const { world, site, proposer, outsider, signed, gather } = fixture();
    const row = signed();
    const defaulter = world.sects.find(({ id }) => id === row.parties[1].sectId)!;
    defaulter.spiritStones = 2;
    const debtor = world.cultivators.find(({ id }) => id === defaulter.leaderId)!;
    debtor.locationId = site.id;
    world.tick++;
    advanceSharedCommons(world);
    const round = row.rounds[0];
    expect(round.allocations[1]).toMatchObject({ maintenanceDue: 3, maintenancePaid: 0, quota: 0 });
    expect(defaulter.spiritStones).toBe(2);
    expect(round.reserved).toBe(6);
    expect(commonsHarvestLimit(world, debtor, site, 'jade_leaf')).toBe(0);
    expect(commonsHarvestLimit(world, debtor, site, 'earth_root')).toBe(2);
    expect(gather(debtor, 1)).toBe(false);
    expect(gather(outsider, 2)).toBe(true);
    expect(commonsHarvestLimit(world, outsider, site, 'jade_leaf')).toBe(1);
    expect(gather(outsider, 2)).toBe(false);
    expect(gather(proposer, 2)).toBe(true);
    expect(gather(proposer, 1)).toBe(false);
    expect(site.herbs.jade_leaf).toBe(5);
    expect(round.allocations[0].used).toBe(2);
    expect(visibleSharedCommons(world, outsider)[0].rounds[0].harvests).toEqual([]);
    expect(site.herbs.jade_leaf - round.allocations.reduce((sum, a) => sum + a.quota - a.used, 0)).toBe(1);
  });

  it('rotates scarce rounding fairly, and releases old rights immediately on title change without overwriting ownership', () => {
    const { world, site, proposer, signed } = fixture();
    const row = signed();
    site.herbs.jade_leaf = 3;
    world.tick++;
    advanceSharedCommons(world);
    expect(row.rounds[0].allocations.map(({ quota }) => quota)).toEqual([1, 1, 0]);
    world.tick += 2 * COMMONS_ROUND_TICKS;
    advanceSharedCommons(world);
    expect(row.rounds[1].allocations.map(({ quota }) => quota)).toEqual([1, 0, 1]);
    site.ownerSectId = world.sects[1].id;
    expect(currentCommonsRound(world, row)).toBeUndefined();
    expect(commonsHarvestLimit(world, proposer, site, 'jade_leaf')).toBe(2); // canonical title gate now determines actual access.
    const supplies = site.herbs.jade_leaf;
    expect(advanceSharedCommons(world)).toHaveLength(1);
    expect(advanceSharedCommons(world)).toEqual([]);
    expect(row).toMatchObject({ status: 'closed', closeReason: 'title_change' });
    expect(site.ownerSectId).toBe(world.sects[1].id);
    expect(site.herbs.jade_leaf).toBe(supplies);
  });
});
