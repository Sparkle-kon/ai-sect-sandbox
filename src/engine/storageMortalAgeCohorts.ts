import type { WorldState } from '../types/world';
import { MORTAL_OLD_AGE_TICKS } from './mortalAgeCohorts';
import { MORTAL_MATURITY_TICKS } from './reincarnationEngine';

export function validateMortalAgeCohorts(world: WorldState, fail:(path:string)=>never): void {
  const start = world.mortalAgeTrackingSinceTick;
  const groupIds = new Map(world.households.groups.map(group => [group.id,group]));
  const villages = new Map(world.settlements.villages.map(village => [village.id,village]));
  // A retained checkpoint may seek by tick without changing its displayed calendar.
  // Birth cadence belongs to the observed birth baseline, not to that viewing clock.
  const isKnownBirth = (tick:number) => start !== undefined && tick >= start && (tick-start)%12===0;
  if (start !== undefined && (start < 1 || start > world.tick || !isKnownBirth(start))) fail('mortalAgeTracking.start');
  for (const group of world.households.groups) {
    let totalTracked = 0;
    for (const site of group.presences) {
      if (!site.adultAgeCohorts) continue;
      let previous = 0, atSite = 0;
      for (const item of site.adultAgeCohorts) {
        const age = world.tick - item.bornTick;
        if (item.count < 1 || item.bornTick <= previous || item.bornTick < group.createdTick || !isKnownBirth(item.bornTick) ||
            age < MORTAL_MATURITY_TICKS || age >= MORTAL_OLD_AGE_TICKS) fail('mortalAgeTracking.adults');
        previous = item.bornTick;
        atSite += item.count;
      }
      if (!site.adultAgeCohorts.length || atSite > site.adults) fail('mortalAgeTracking.adult_budget');
      totalTracked += atSite;
    }
    const births = group.presences.reduce((sum,site) => sum + site.births,0);
    if (totalTracked > births) fail('mortalAgeTracking.birth_budget');
  }
  const totals = new Map<string,number>();
  for (const group of world.households.groups)
    totals.set(group.id,group.presences.reduce((sum,site) => sum + (site.adultAgeCohorts ?? []).reduce((n,item) => n+item.count,0),0));
  for (const member of world.households.members) {
    const born = member.knownBornTick;
    if (born === undefined) continue;
    const group = groupIds.get(member.householdId);
    const actual = villages.get(member.settlementId)?.volunteers.find(item => item.id === member.volunteerId);
    if (!group || !actual || actual.enlistedCultivatorId || member.status !== 'resident' || !isKnownBirth(born) ||
        born < group.createdTick || member.registeredTick - born < MORTAL_MATURITY_TICKS ||
        actual.age !== Math.floor((world.tick - born) / 12) || actual.age < 18 || actual.age > 47)
      fail('mortalAgeTracking.volunteer');
    totals.set(group.id,(totals.get(group.id) ?? 0)+1);
  }
  for (const receipt of world.settlements.records) {
    if (receipt.kind !== 'old_age') {
      if (receipt.oldAgeCohorts !== undefined) fail('mortalAgeTracking.death_kind');
      continue;
    }
    if (receipt.tick > world.tick || receipt.tick < 1 || receipt.id !== `settlement-${receipt.tick}-old_age-${receipt.settlementId}-registered` ||
        receipt.actorId || receipt.targetSettlementId || receipt.cultivatorId || receipt.volunteerId || receipt.sectId ||
        receipt.stones !== 0 || receipt.herbs !== 0 || !receipt.oldAgeCohorts?.length) fail('mortalAgeTracking.death_receipt');
    const keys = new Set<string>();
    let deathCount = 0;
    for (const item of receipt.oldAgeCohorts) {
      const group = groupIds.get(item.householdId);
      const atSite = group?.presences.find(site => site.settlementId === receipt.settlementId);
      const key = JSON.stringify([item.householdId,item.bornTick]);
      if (!group || !atSite || !isKnownBirth(item.bornTick) || item.bornTick < group.createdTick || item.count < 1 ||
          atSite.deaths < item.count || keys.has(key) || receipt.tick - item.bornTick !== MORTAL_OLD_AGE_TICKS)
        fail('mortalAgeTracking.death_age');
      keys.add(key);
      deathCount += item.count;
      totals.set(group.id,(totals.get(group.id) ?? 0)+item.count);
    }
    if (deathCount !== receipt.people) fail('mortalAgeTracking.death_total');
  }
  for (const [id,total] of totals) {
    if (total > (groupIds.get(id)?.presences.reduce((sum,site) => sum + site.births,0) ?? 0)) fail('mortalAgeTracking.birth_budget');
  }
}
