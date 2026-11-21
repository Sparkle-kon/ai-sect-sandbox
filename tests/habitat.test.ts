import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceHabitats, availableHabitatActions, createHabitatState, HABITAT_RESTORATION_TICKS, HABITAT_RESTORE_ROOTS, HABITAT_RESTORE_STONES,
  HABITAT_SURVEY_DELAY, HABITAT_SURVEY_WINDOW, habitatCanReceiveWildBeast, habitatCapacity, habitatOccupancy,
  isRewildingAcclimating, resolveHabitatAction, visibleHabitats } from '../src/engine/habitatEngine';
import { availableBeastTames, petCombatBonus } from '../src/engine/spiritBeastEngine';
import type { Cultivator, HabitatMove, LLMDecisionPayload, SpiritBeast } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(401);
  world.habitats = createHabitatState();
  world.tick = 10;
  const [sponsor, rival] = world.sects;
  const site = world.locations.find(({ id }) => id === 'loc-vein-north')!;
  const steward = world.cultivators.find(({ id }) => id === sponsor.leaderId)!;
  const [owner, observer, stranger] = world.cultivators.filter((actor) => actor.id !== steward.id);
  for (const actor of [steward, owner, observer]) actor.locationId = site.id;
  stranger.locationId = 'loc-market';
  owner.sectRank = '外门弟子';
  steward.herbs.earth_root = 6;
  sponsor.spiritStones = 100;
  const beast = world.spiritBeasts.find(({ locationId }) => locationId === site.id)!;
  beast.tamedBy = owner.id;
  beast.hp = beast.maxHp;
  owner.herbs.jade_leaf = 4;
  observer.herbs.jade_leaf = 4;
  const move = (actor: Cultivator, habitatMove: HabitatMove, fields: Partial<LLMDecisionPayload> = {}) =>
    resolveHabitatAction(world, actor, { chosenAction: 'HABITAT', innerMonologue: '只据实地记录', habitatMove, ...fields });
  const restore = () => {
    expect(move(steward, 'restore', { targetLocationId: site.id })?.title).toBe('实物恢复灵兽栖地');
    return world.habitats.stewardships[0];
  };
  const release = () => {
    expect(move(owner, 'release', { targetBeastId: beast.id })?.title).toBe('原有灵兽解除认主并放归');
    return world.habitats.releases[0];
  };
  const wild = (id: string, locationId: string): SpiritBeast => ({ ...beast, id, locationId, tamedBy: undefined });
  return { world, sponsor, rival, site, steward, owner, observer, stranger, beast, move, restore, release, wild };
}

describe('physical sanctuary restoration and same-beast rewilding', () => {
  it('charges the qualified local steward once using actual stock and enables one additional nonstacking carrying slot', () => {
    const { world, sponsor, rival, site, steward, owner, move, restore } = fixture();
    const baseline = habitatCapacity(world, site.id);
    expect(baseline).toBeGreaterThanOrEqual(1);
    expect(move(owner, 'restore', { targetLocationId: site.id })).toBeNull();
    expect(move(steward, 'restore', { targetLocationId: steward.sectId })).toBeNull();
    site.ownerSectId = rival.id;
    expect(move(steward, 'restore', { targetLocationId: site.id })).toBeNull();
    delete site.ownerSectId;
    sponsor.spiritStones = HABITAT_RESTORE_STONES - 1;
    expect(move(steward, 'restore', { targetLocationId: site.id })).toBeNull();
    sponsor.spiritStones = 100;
    const restoration = restore();
    expect(sponsor.spiritStones).toBe(100 - HABITAT_RESTORE_STONES);
    expect(steward.herbs.earth_root).toBe(6 - HABITAT_RESTORE_ROOTS);
    expect(habitatCapacity(world, site.id)).toBe(baseline + 1);
    expect(move(steward, 'restore', { targetLocationId: site.id })).toBeNull();
    expect(restoration.expiresTick).toBe(world.tick + HABITAT_RESTORATION_TICKS);
    site.ownerSectId = rival.id;
    expect(habitatCapacity(world, site.id)).toBe(baseline);
    expect(advanceHabitats(world)).toHaveLength(1);
    expect(restoration.endReason).toBe('site_lost');
    expect(advanceHabitats(world)).toEqual([]);
  });

  it('counts only physically present wild individuals and stops additional entries at real capacity', () => {
    const { world, site, owner, beast, restore, release, wild, move } = fixture();
    const baseline = habitatCapacity(world, site.id);
    expect(habitatOccupancy(world, site.id)).toBe(0);
    const away = wild('away', 'loc-blood');
    expect(away.homeLocationId).toBe(site.id);
    world.spiritBeasts.push(away);
    expect(habitatOccupancy(world, site.id)).toBe(0);
    restore();
    for (let i = 0; i <= baseline; i++) world.spiritBeasts.push(wild(`local-${i}`, site.id));
    expect(habitatOccupancy(world, site.id)).toBe(baseline + 1);
    expect(habitatCanReceiveWildBeast(world, site.id)).toBe(false);
    expect(move(owner, 'release', { targetBeastId: beast.id })).toBeNull();
    world.spiritBeasts.find(({ id }) => id === 'local-0')!.locationId = 'loc-blood';
    expect(habitatCanReceiveWildBeast(world, site.id)).toBe(true);
    release();
    expect(habitatOccupancy(world, site.id)).toBe(baseline + 1);
    const size = world.spiritBeasts.length;
    world.tick += HABITAT_RESTORATION_TICKS;
    expect(advanceHabitats(world)).toHaveLength(2);
    expect(habitatCapacity(world, site.id)).toBe(baseline);
    expect(habitatCanReceiveWildBeast(world, site.id)).toBe(false);
    expect(habitatOccupancy(world, site.id)).toBe(baseline + 1);
    expect(world.spiritBeasts).toHaveLength(size);
  });

  it('preserves the same beast and actual stats, ends pet help, and allows a later healthy local sighting by someone else only', () => {
    const { world, site, owner, observer, stranger, beast, move, restore, release } = fixture();
    expect(petCombatBonus(world, owner)).toBeGreaterThan(1);
    expect(move(owner, 'release', { targetBeastId: beast.id })).toBeNull();
    restore();
    const hp = beast.hp;
    const roster = world.spiritBeasts.map(({ id }) => id);
    beast.hp = 1;
    expect(move(owner, 'release', { targetBeastId: beast.id })).toBeNull();
    beast.hp = hp;
    const proof = release();
    expect(beast).toMatchObject({ hp, locationId: site.id, homeLocationId: site.id });
    expect(beast.tamedBy).toBeUndefined();
    expect(world.spiritBeasts.map(({ id }) => id)).toEqual(roster);
    expect(petCombatBonus(world, owner)).toBe(1);
    expect(proof).toMatchObject({ status: 'monitoring', releasedTick: world.tick, earliestSurveyTick: world.tick + HABITAT_SURVEY_DELAY,
      deadlineTick: world.tick + HABITAT_SURVEY_WINDOW });
    expect(proof.observation).toBeUndefined();
    const fields = { targetBeastReleaseId: proof.id };
    expect(move(observer, 'survey', fields)).toBeNull();
    expect(isRewildingAcclimating(world, beast.id)).toBe(true);
    expect(availableBeastTames(observer, world).some(({ targetBeastId }) => targetBeastId === beast.id)).toBe(false);
    world.tick += HABITAT_SURVEY_DELAY;
    expect(isRewildingAcclimating(world, beast.id)).toBe(false);
    expect(move(stranger, 'survey', fields)).toBeNull();
    expect(move(owner, 'survey', fields)).toBeNull();
    beast.hp = 1;
    expect(move(observer, 'survey', fields)).toBeNull();
    beast.hp = hp;
    expect(move(observer, 'survey', fields)?.witnessScope).toBe('participants');
    expect(proof).toMatchObject({ status: 'sighted', settledTick: world.tick, observation: { tick: world.tick, observerId: observer.id, hp } });
    expect(move(observer, 'survey', fields)).toBeNull();
  });

  it('expires a migrated beast as unconfirmed rather than guessing whereabouts or showing remote occupancy', () => {
    const { world, site, owner, observer, stranger, beast, restore, release } = fixture();
    restore();
    const record = release();
    owner.locationId = 'loc-market';
    beast.locationId = 'loc-blood';
    world.tick = record.earliestSurveyTick;
    expect(availableHabitatActions(observer, world).some(({ habitatMove }) => habitatMove === 'survey')).toBe(false);
    expect(visibleHabitats(world, stranger)).toEqual([]);
    const receipt = visibleHabitats(world, owner)[0];
    expect(receipt).toMatchObject({ siteId: site.id, releases: [record] });
    expect(receipt).not.toHaveProperty('capacity');
    expect(receipt).not.toHaveProperty('wildOccupancy');
    expect(JSON.stringify(receipt)).not.toContain('loc-blood');
    world.tick = record.deadlineTick;
    expect(advanceHabitats(world)[0]).toMatchObject({ witnessScope: 'participants', locationId: undefined });
    expect(record).toMatchObject({ status: 'unconfirmed', settledTick: world.tick });
    expect(record.observation).toBeUndefined();
    expect(advanceHabitats(world)).toEqual([]);
  });
});
