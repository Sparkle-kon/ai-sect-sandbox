import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { createHouseholdState, initializeHouseholds, registerHouseholdVolunteer, retireHouseholdVolunteer } from '../src/engine/householdEngine';
import { MORTAL_OLD_AGE_TICKS } from '../src/engine/mortalAgeCohorts';
import { advanceSettlements, MORTAL_MATURITY_TICKS } from '../src/engine/settlementEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { regionForPoint } from '../src/engine/regionalSimulationEngine';
import type { MortalSettlement, WorldState } from '../src/types/world';

const firstBirth=13;
const due=firstBirth+MORTAL_OLD_AGE_TICKS;
const source='village-loc-market-east',destination='village-loc-market';
const byId=(world:WorldState,id:string):MortalSettlement=>world.settlements.villages.find(village=>village.id===id)!;
function tick(world:WorldState) {
  world.tick++;
  if (world.month===12){ world.month=1; world.year++; }
  else world.month++;
  return advanceSettlements(world);
}
function anyAge(world:WorldState,villageId:string,bornTick:number) {
  return world.households.groups.flatMap(group => group.presences.filter(site => site.settlementId===villageId)
    .flatMap(site => (site.adultAgeCohorts ?? []).filter(cohort=>cohort.bornTick===bornTick)
      .map(cohort=>({householdId:group.id,...cohort}))));
}
function prepare(){
  const world=createInitialWorld(5);
  for (const village of world.settlements.villages) {
    village.stress = 0;
    village.capacity=village.population;
  }
  const from=byId(world,source), target=byId(world,destination);
  from.population=2; from.capacity=120; from.volunteers=[];
  target.capacity=300;
  // Controlled initial population, not historical aging or injected age/cohort records.
  world.households=createHouseholdState();
  initializeHouseholds(world);
  return world;
}

describe('native mortal cohorts age by the recorded birth month, not by fabricated past ages', () => {
  it('raises two genuine births, migrates aged slices to a different region, then registers exact old-age deaths in the real destination', () => {
    let w=prepare();
    const before=encodeEraWorldSave(w);
    expect(decodeEraWorldSave(before).mortalAgeTrackingSinceTick).toBeUndefined();
    expect(encodeEraWorldSave(decodeEraWorldSave(before))).toBe(before);
    const site=byId(w,source).locationId, target=byId(w,destination).locationId;
    expect(regionForPoint(w,w.locations.find(loc=>loc.id===site)!)).not.toBe(regionForPoint(w,w.locations.find(loc=>loc.id===target)!));
    const until=(stop:number)=>{
      while(w.tick<stop){
        const next=w.tick+1;
        if(next===firstBirth+MORTAL_MATURITY_TICKS)byId(w,source).stress=66; // keep this real mature class anonymous for the migration.
        else if(next===231)byId(w,source).stress=48;
        else byId(w,source).stress=0;
        tick(w);
      }
    };
    until(firstBirth);
    expect(w.mortalAgeTrackingSinceTick).toBe(firstBirth);
    expect(byId(w,source).juvenileCohorts.find(item=>item.bornTick===firstBirth)?.count).toBe(3);
    until(firstBirth+12);
    expect(byId(w,source).juvenileCohorts.find(item=>item.bornTick===firstBirth+12)?.count).toBe(3);
    until(firstBirth+MORTAL_MATURITY_TICKS-1);
    expect(anyAge(w,source,firstBirth)).toEqual([]);
    until(firstBirth+MORTAL_MATURITY_TICKS);
    const firstAdults=anyAge(w,source,firstBirth);
    expect(firstAdults.reduce((n,item)=>n+item.count,0)).toBe(3);
    expect(byId(w,source).juvenileCohorts.some(item=>item.bornTick===firstBirth)).toBe(false);
    until(231);
    const move=w.settlements.records.find(row=>row.kind==='migration'&&row.tick===231&&row.settlementId===source);
    expect(move).toMatchObject({targetSettlementId:destination,people:4});
    const moved=anyAge(w,destination,firstBirth).filter(item=>firstAdults.some(proof=>proof.householdId===item.householdId));
    expect(moved.reduce((n,item)=>n+item.count,0)).toBeGreaterThan(0);
    expect(anyAge(w,source,firstBirth).reduce((n,item)=>n+item.count,0)+moved.reduce((n,item)=>n+item.count,0)).toBe(3);
    until(due-1);
    const agedHere=anyAge(w,destination,firstBirth).filter(item=>moved.some(proof=>proof.householdId===item.householdId));
    expect(agedHere).toEqual(moved);
    const exact=encodeEraWorldSave(w);
    const restored=decodeEraWorldSave(exact);
    expect(encodeEraWorldSave(restored)).toBe(exact);
    until(due);
    const local=w.settlements.records.find(row=>row.kind==='old_age'&&row.tick===due&&row.settlementId===destination);
    expect(local?.oldAgeCohorts).toEqual(expect.arrayContaining(moved));
    const census=w.villageCensuses.periods.at(-1)!;
    expect(census.movements).toContainEqual({id:local?.id,villageId:destination,kind:'death',deathCause:'old_age',people:local?.people});
    expect(byId(w,destination).lastDisasterTick).toBeUndefined();
    expect(advanceSettlements(w)).toEqual([]);
    tick(restored);
    expect(encodeEraWorldSave(w)).toBe(encodeEraWorldSave(restored));
    const forged=structuredClone(w);
    forged.settlements.records.find(row=>row.id===local?.id)!.oldAgeCohorts![0].bornTick++;
    expect(()=>encodeEraWorldSave(forged)).toThrow();
  });

  it('uses the real exposed birth age for a listed candidate and returns the same slice on retirement', () => {
    const world=prepare();
    const origin=byId(world,source);
    while(world.tick<firstBirth+MORTAL_MATURITY_TICKS){
      if(world.tick===firstBirth+MORTAL_MATURITY_TICKS-1)origin.stress=66;
      tick(world);
    }
    const cohortCount=anyAge(world,source,firstBirth).reduce((n,item)=>n+item.count,0);
    const newVolunteer={id:source+'-vol-'+origin.nextVolunteerSequence++,name:'新登记人',age:39,
      spiritRoot:'木' as const,willingness:80,aptitude:80};
    origin.volunteers.push(newVolunteer);
    expect(registerHouseholdVolunteer(world,origin,newVolunteer,firstBirth)).toBe(true);
    const named=world.households.members.find(member=>member.volunteerId===newVolunteer.id);
    expect(named?.knownBornTick).toBe(firstBirth);
    expect(newVolunteer.age).toBe(18);
    expect(anyAge(world,source,firstBirth).reduce((n,item)=>n+item.count,0)).toBe(cohortCount-1);
    retireHouseholdVolunteer(world,origin,newVolunteer);
    origin.volunteers.pop();
    expect(named?.knownBornTick).toBeUndefined();
    expect(named?.status).toBe('retired');
    expect(anyAge(world,source,firstBirth).reduce((n,item)=>n+item.count,0)).toBe(cohortCount);
  });
});
