import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceTerritorialLeases, authorizedHerbHarvestLimit, availableTerritorialLeaseActions, createTerritorialLeaseState, LEASE_DEPOSIT,
  LEASE_OFFER_TICKS, LEASE_QUOTA, LEASE_TERM_TICKS, LEASE_TREASURY_CAP, LEASE_UNIT_RENT, resolveTerritorialLeaseAction,
  settleLeasedHerbHarvest, territorialLeaseAvailability, visibleTerritorialLeases } from '../src/engine/territorialLeaseEngine';
import type { Cultivator, HerbId, RelocationPlan, TerritorialLease, TerritorialLeaseMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(50290);
  world.territorialLeases = createTerritorialLeaseState();
  world.tick = 10;
  const [owner, lessee, outsider] = world.sects;
  const site = world.locations.find(({ id }) => id === owner.headquartersId)!;
  const tenantSite = world.locations.find(({ id }) => id === lessee.headquartersId)!;
  const leader = (sect: typeof owner) => {
    const signer = world.cultivators.find(({ id }) => id === sect.leaderId)!;
    signer.locationId = sect.headquartersId;
    return signer;
  };
  const ownerSigner = leader(owner), lesseeSigner = leader(lessee), third = leader(outsider);
  const tenant = world.cultivators.find((actor) => actor.sectId === lessee.id && actor.id !== lesseeSigner.id)!;
  const cousin = world.cultivators.find((actor) => actor.sectId === lessee.id && actor.id !== lesseeSigner.id && actor.id !== tenant.id)!;
  const neutral = world.locations.find(({ id }) => id === 'loc-vein-north')!;
  owner.spiritStones = 100;
  lessee.spiritStones = 100;
  site.herbs.jade_leaf = 12;
  site.herbs.earth_root = 9;
  tenant.herbs.jade_leaf = 3;
  tenant.herbs.earth_root = 0;
  cousin.herbs.jade_leaf = 0;
  cousin.herbs.earth_root = 0;
  for (const actor of [tenant, cousin]) actor.locationId = site.id;
  const act = (actor: Cultivator, leaseMove: TerritorialLeaseMove, id = '', targetSectId = lessee.id) =>
    resolveTerritorialLeaseAction(world, actor, { chosenAction: 'TERRITORIAL_LEASE', leaseMove, innerMonologue: '据实签署',
      ...(leaseMove === 'offer' ? { targetLocationId: id || site.id, targetSectId } : { targetTerritorialLeaseId: id }) });
  const offer = () => {
    expect(act(ownerSigner, 'offer')?.witnessScope).toBe('participants');
    return world.territorialLeases.leases.at(-1)!;
  };
  const accept = () => {
    const row = offer();
    expect(act(lesseeSigner, 'accept', row.id)?.title).toBe('双签后封存真实采集押金');
    return row;
  };
  const gather = (actor: Cultivator, herbId: HerbId, amount: number) => {
    if (!settleLeasedHerbHarvest(world, actor, site, herbId, amount)) return false;
    site.herbs[herbId] -= amount;
    actor.herbs[herbId] += amount;
    return true;
  };
  const check = (row: TerritorialLease) => {
    expect(row.escrow + row.rentPaid + row.refunded).toBe(LEASE_DEPOSIT);
    expect(row.rentPaid).toBe(row.usedUnits * LEASE_UNIT_RENT);
  };
  return { world, owner, lessee, outsider, site, tenantSite, neutral, ownerSigner, lesseeSigner, tenant, cousin, third, act, offer, accept, gather, check };
}

describe('true title, actual pooled plant harvest and conserved rental custody', () => {
  it('preserves unowned and title-holder access, and funds from the validated lessee only once without changing title', () => {
    const { world, owner, lessee, site, neutral, ownerSigner, lesseeSigner, tenant, third, act, offer } = fixture();
    expect(authorizedHerbHarvestLimit(world, ownerSigner, site)).toBe(2);
    expect(authorizedHerbHarvestLimit(world, tenant, site)).toBe(0);
    tenant.locationId = neutral.id;
    expect(authorizedHerbHarvestLimit(world, tenant, neutral)).toBe(2);
    tenant.locationId = site.id;
    expect(act(ownerSigner, 'offer', neutral.id)).toBeNull();
    expect(act(tenant, 'offer')).toBeNull();
    const row = offer();
    expect(row.escrow).toBe(0);
    expect(act(ownerSigner, 'offer', site.id, third.sectId)).toBeNull();
    expect(visibleTerritorialLeases(world, third)).toEqual([]);
    expect(visibleTerritorialLeases(world, lesseeSigner)).toEqual([row]);
    expect(act(third, 'accept', row.id)).toBeNull();
    lessee.spiritStones = LEASE_DEPOSIT - 1;
    expect(act(lesseeSigner, 'accept', row.id)).toBeNull();
    lessee.spiritStones = 100;
    expect(act(lesseeSigner, 'accept', row.id)).not.toBeNull();
    expect(act(lesseeSigner, 'accept', row.id)).toBeNull();
    expect([owner.spiritStones,lessee.spiritStones]).toEqual([100, 100 - LEASE_DEPOSIT]);
    expect(row).toMatchObject({ escrow: LEASE_DEPOSIT, endsTick: world.tick + LEASE_TERM_TICKS });
    expect(site.ownerSectId).toBe(owner.id);
    expect(authorizedHerbHarvestLimit(world, tenant, site)).toBe(2);
  });

  it('settles each actual herb to shared quota, rejects duplicates and preserves other kinds for owner access', () => {
    const { world, owner, site, ownerSigner, tenant, cousin, accept, check, gather } = fixture();
    const row = accept();
    expect(gather(tenant, 'jade_leaf', 3)).toBe(false);
    expect(gather(tenant, 'jade_leaf', 2)).toBe(true);
    expect(gather(tenant, 'earth_root', 1)).toBe(false);
    expect(gather(cousin, 'earth_root', 2)).toBe(true);
    expect(site.herbs.jade_leaf).toBe(10);
    expect(cousin.herbs.earth_root).toBe(2);
    expect(row.rentPaid).toBe(4 * LEASE_UNIT_RENT);
    world.tick++;
    site.herbs.jade_leaf = 1;
    expect(gather(tenant, 'jade_leaf', 2)).toBe(false);
    expect(gather(tenant, 'jade_leaf', 1)).toBe(true);
    expect(authorizedHerbHarvestLimit(world, cousin, site)).toBe(1);
    expect(gather(cousin, 'earth_root', 2)).toBe(false);
    expect(gather(cousin, 'earth_root', 1)).toBe(true);
    expect(row.usedUnits).toBe(LEASE_QUOTA);
    expect(row.receipts).toHaveLength(4);
    expect(owner.spiritStones).toBe(100 + LEASE_DEPOSIT);
    expect(territorialLeaseAvailability(world, row)).toBe('exhausted');
    expect(authorizedHerbHarvestLimit(world, tenant, site)).toBe(0);
    expect(authorizedHerbHarvestLimit(world, ownerSigner, site)).toBe(2);
    check(row);
  });

  it('ends access immediately on real title change and refunds only unearned escrow to the one current treasury slot', () => {
    const { world, owner, lessee, outsider, site, tenantSite, ownerSigner, tenant, cousin, accept, check, gather } = fixture();
    const row = accept();
    expect(gather(tenant, 'jade_leaf', 2)).toBe(true);
    expect(owner.spiritStones).toBe(108);
    const transit: RelocationPlan = { id: 'lease-test-convoy', sectId: lessee.id, originId: tenantSite.id, destinationId: 'loc-vein-north',
      status: 'in_transit', openedTick: 1, deadlineTick: 4, proposerId: 'relocating', voterIds: [], votes: [], garrisonIds: [],
      path: [], pathIndex: 0, stoneCost: 0, earthCost: 0, custody: { stones: LEASE_TREASURY_CAP - 5, pavilion: [] }, spent: true };
    world.relocations.plans.push(transit);
    lessee.spiritStones = 3;
    site.ownerSectId = outsider.id;
    expect(authorizedHerbHarvestLimit(world, tenant, site)).toBe(0);
    expect(authorizedHerbHarvestLimit(world, cousin, site)).toBe(0);
    expect(authorizedHerbHarvestLimit(world, ownerSigner, site)).toBe(0);
    expect(territorialLeaseAvailability(world, row)).toBe('title_change');
    expect(advanceTerritorialLeases(world)).toHaveLength(2);
    expect(row).toMatchObject({ status: 'closed', endReason: 'title_change', rentPaid: 8, refunded: 2, escrow: 14 });
    expect(lessee.spiritStones).toBe(3);
    expect(transit.custody.stones).toBe(LEASE_TREASURY_CAP - 3);
    expect(advanceTerritorialLeases(world)).toEqual([]);
    expect(transit.custody.stones).toBe(LEASE_TREASURY_CAP - 3);
    check(row);
    world.tick++;
    transit.custody.stones -= 14;
    expect(advanceTerritorialLeases(world)).toHaveLength(1);
    expect(advanceTerritorialLeases(world)).toEqual([]);
    expect(row).toMatchObject({ rentPaid: 8, refunded: 16, escrow: 0 });
    expect(owner.spiritStones).toBe(108);
    expect(site.ownerSectId).toBe(outsider.id);
    check(row);
  });

  it('pauses gathering during hostility, then surrenders unused rights or expires an unsigned offer without spending', () => {
    const { world, owner, lessee, site, ownerSigner, lesseeSigner, tenant, act, offer, accept, check, gather } = fixture();
    const row = accept();
    world.diplomacy = [{ sectAId: owner.id, sectBId: lessee.id, affinity: -80, sinceTick: world.tick, pact: 'war' }];
    expect(territorialLeaseAvailability(world, row)).toBe('hostility');
    expect(authorizedHerbHarvestLimit(world, tenant, site)).toBe(0);
    expect(advanceTerritorialLeases(world)).toEqual([]);
    expect(row.refunded).toBe(0);
    world.diplomacy[0].pact = 'neutral';
    owner.spiritStones = LEASE_TREASURY_CAP;
    expect(territorialLeaseAvailability(world, row)).toBe('treasury_full');
    expect(gather(tenant, 'jade_leaf', 1)).toBe(false);
    owner.spiritStones = 100;
    expect(gather(tenant, 'jade_leaf', 1)).toBe(true);
    expect(act(lesseeSigner, 'surrender', row.id)?.title).toBe('承租方主动交回采集许可');
    expect(act(lesseeSigner, 'surrender', row.id)).toBeNull();
    expect(authorizedHerbHarvestLimit(world, tenant, site)).toBe(0);
    check(row);
    expect(lessee.spiritStones).toBe(96);
    expect(availableTerritorialLeaseActions(ownerSigner, world, false).some(({ leaseMove }) => leaseMove === 'offer')).toBe(false);
    const unsigned = offer();
    world.tick += LEASE_OFFER_TICKS;
    expect(act(lesseeSigner, 'accept', unsigned.id)).toBeNull();
    expect(advanceTerritorialLeases(world)).toHaveLength(1);
    expect(unsigned).toMatchObject({ status: 'expired', escrow: 0, refunded: 0, usedUnits: 0 });
  });
});
