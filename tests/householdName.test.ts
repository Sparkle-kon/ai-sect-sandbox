import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceHouseholds } from '../src/engine/householdEngine';
import {
  advanceHouseholdNames, availableHouseholdNameActions, HOUSEHOLD_NAME_ALIASES, HOUSEHOLD_NAME_OFFER_TICKS,
  lookupHouseholdNames, projectHouseholdNames, resolveHouseholdNameAction,
} from '../src/engine/householdNameEngine';
import { resolveSettlementAction } from '../src/engine/settlementEngine';
import type { Cultivator, HouseholdNameMove, LLMDecisionPayload } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(937);
  world.tick = 20;
  const village = world.settlements.villages.find(row=>row.locationId==='loc-market')!;
  const [volunteer1,volunteer2] = village.volunteers;
  village.stress = 0;
  const witness = world.cultivators.find(actor=>actor.id===world.sects[0].leaderId)!;
  const elsewhere = world.settlements.villages.find(row=>row.id!==village.id)!;
  const young = world.cultivators.find(actor=>actor.id!==witness.id)!;
  const visitor = world.cultivators.find(actor=>actor.id!==witness.id && actor.id!==young.id)!;
  young.age = 17;
  young.locationId = village.locationId;
  witness.age = 35;
  witness.locationId = village.locationId;
  visitor.age = 31;
  visitor.locationId = elsewhere.locationId;
  const recruit = (person: typeof volunteer1) => {
    Object.assign(person,{name:'陈寻鹤',age:25,willingness:99,aptitude:99});
    expect(resolveSettlementAction(world,witness,{chosenAction:'RECRUIT_SETTLER',innerMonologue:'',
      targetSettlementId:village.id,targetVolunteerId:person.id})).not.toBeNull();
    return world.cultivators.at(-1)!;
  };
  const owner = recruit(volunteer1);
  ++world.tick;
  const fellow = recruit(volunteer2);
  const [alias,otherAlias] = HOUSEHOLD_NAME_ALIASES;
  const act = (actor: Cultivator,nameMove: HouseholdNameMove,fields: Partial<LLMDecisionPayload> = {}) =>
    resolveHouseholdNameAction(world,actor,{chosenAction:'HOUSEHOLD_NAME',innerMonologue:'仅核验实际本人',nameMove,...fields});
  const offer = (actor = owner,value: string = alias) => {
    expect(act(actor,'offer',{householdAlias:value})).not.toBeNull();
    return world.householdNames.entries.at(-1)!;
  };
  const lookup = (name: string,viewer = witness) => lookupHouseholdNames(world,viewer,village.id,name);
  return {world,village,elsewhere,volunteer1,volunteer2,witness,young,visitor,owner,fellow,alias,otherAlias,act,offer,lookup};
}

describe('local household names follow durable actual enrollment',()=>{
  it('supports duplicates as distinct verified register entrants and never rewrites world identity',()=>{
    const {world,village,owner,fellow,witness,alias,act,offer,lookup} = fixture();
    const original = {households:structuredClone(world.households),relations:structuredClone(world.relationships),
      pop:village.population,realName:owner.name};
    const first = offer();
    const second = offer(fellow);
    expect(lookup(alias)).toEqual({status:'unresolved',matches:[]});
    expect(projectHouseholdNames(world,witness,village.id)?.proposals).toEqual([]);
    expect(projectHouseholdNames(world,owner,village.id)?.proposals.map(row=>row.id)).toEqual([first.id]);
    ++world.tick;
    expect(act(witness,'verify',{targetHouseholdNameId:first.id})).toMatchObject({witnessScope:'participants',
      actorIds:[owner.id,witness.id],locationId:village.locationId});
    expect(lookup(alias)).toMatchObject({status:'unique',matches:[{actorId:owner.id}]});
    expect(act(witness,'verify',{targetHouseholdNameId:second.id})).not.toBeNull();
    expect(lookup(alias)).toMatchObject({status:'ambiguous',matches:[{actorId:owner.id},{actorId:fellow.id}]});
    expect(lookup(owner.name).status).toBe('ambiguous');
    expect([owner.name,fellow.name]).toEqual([original.realName,original.realName]);
    expect(world.households).toEqual(original.households);
    expect(world.relationships).toEqual(original.relations);
    expect(village.population).toBe(original.pop);
  });

  it('requires later independent canonical local adults and the exact stored four-field enrollment',()=>{
    const {world,village,owner,witness,young,visitor,alias,otherAlias,act,offer} = fixture();
    expect(act(owner,'offer',{householdAlias:'随意未登记的名字'})).toBeNull();
    expect(act(owner,'offer',{householdAlias:alias,targetSettlementId:village.id})).toBeNull();
    expect(act(visitor,'offer',{householdAlias:alias})).toBeNull();
    const row = offer();
    expect(act(owner,'offer',{householdAlias:otherAlias})).toBeNull();
    expect(act(witness,'verify',{targetHouseholdNameId:row.id})).toBeNull();
    expect(availableHouseholdNameActions(witness,world,world.tick+1)).toContainEqual({
      action:'HOUSEHOLD_NAME',nameMove:'verify',targetHouseholdNameId:row.id});
    expect(availableHouseholdNameActions(witness,world,world.tick+2)).toEqual([]);
    ++world.tick;
    const verification = {targetHouseholdNameId:row.id};
    expect(act(owner,'verify',verification)).toBeNull();
    expect(act(young,'verify',verification)).toBeNull();
    expect(act(visitor,'verify',verification)).toBeNull();
    expect(act(structuredClone(witness),'verify',verification)).toBeNull();
    expect(act(witness,'verify',{...verification,householdAlias:alias})).toBeNull();
    const oldHousehold = row.householdId;
    row.householdId = 'different-household';
    expect(act(witness,'verify',verification)).toBeNull();
    row.householdId = oldHousehold;
    expect(act(witness,'verify',verification)).not.toBeNull();
    expect(row.witnessId).toBe(witness.id);
    expect(act(witness,'verify',verification)).toBeNull();
  });

  it('remote withdrawal/verification fails, stale journey anchor is not physical, and expiry is a no-op on aliases',()=>{
    const {world,village,elsewhere,owner,witness,alias,act,offer,lookup} = fixture();
    const row = offer();
    ++world.tick;
    owner.locationId = elsewhere.locationId;
    expect(act(owner,'withdraw',{targetHouseholdNameId:row.id})).toBeNull();
    expect(act(witness,'verify',{targetHouseholdNameId:row.id})).toBeNull();
    expect(advanceHouseholdNames(world)).toEqual([]);
    owner.locationId = village.locationId;
    // An existing true journey defines a participant as out of the named origin until completion.
    world.relocations.plans.push({status:'in_transit',garrisonIds:[owner.id]} as WorldStateRelocation);
    expect(act(witness,'verify',{targetHouseholdNameId:row.id})).toBeNull();
    expect(projectHouseholdNames(world,owner,village.id)).toBeUndefined();
    world.relocations.plans.pop();
    world.tick = row.openedTick+HOUSEHOLD_NAME_OFFER_TICKS;
    expect(act(witness,'verify',{targetHouseholdNameId:row.id})).toBeNull();
    expect(advanceHouseholdNames(world)).toHaveLength(1);
    expect(row).toMatchObject({status:'expired',closedTick:world.tick});
    expect(lookup(alias).status).toBe('unresolved');
    expect(advanceHouseholdNames(world)).toEqual([]);
  });

  it('keeps historical same-name memorial versus a real unverified visitor separate and omits nonlocal data',()=>{
    const {world,village,elsewhere,volunteer1,volunteer2,owner,fellow,witness,visitor,lookup} = fixture();
    owner.alive=false; owner.hp=0;
    advanceHouseholds(world);
    fellow.locationId=elsewhere.locationId;
    village.volunteers=village.volunteers.filter(person=>person!==volunteer1 && person!==volunteer2);
    const projected = projectHouseholdNames(world,witness,village.id)!;
    expect(projected.entries.find(row=>row.actorId===fellow.id)).toMatchObject({status:'recruited',name:fellow.name,volunteerId:volunteer2.id});
    expect(projected.entries.find(row=>row.actorId===fellow.id)).not.toHaveProperty('present');
    expect(projected.entries.find(row=>row.actorId===fellow.id)).not.toHaveProperty('locationId');
    expect(projected.entries.find(row=>row.actorId===owner.id)).toMatchObject({status:'deceased',name:owner.name,volunteerId:volunteer1.id});
    expect(lookup(owner.name).status).toBe('ambiguous');
    visitor.name=owner.name;
    expect(lookup(owner.name).matches).toHaveLength(2);
    visitor.locationId=village.locationId;
    expect(lookup(owner.name).matches).toContainEqual({id:`visitor:${visitor.id}`,status:'visitor',actorId:visitor.id,name:visitor.name,present:true});
    expect(projectHouseholdNames(world,witness,elsewhere.id)).toBeUndefined();
    expect(lookup(owner.name,structuredClone(witness))).toEqual({status:'unresolved',matches:[]});
    world.households.members=world.households.members.filter(row=>row.recruitedId!==fellow.id);
    expect(lookup(owner.name).status).toBe('ambiguous'); // Memorial and visitor must remain separate.
    visitor.locationId=elsewhere.locationId;
    expect(lookup(owner.name)).toMatchObject({status:'unresolved',matches:[{status:'deceased',actorId:owner.id}]});
  });

  it('requires separate verification to clear, keeps no implicit new alias, and retains a clear past compaction',()=>{
    const {world,witness,owner,alias,act,offer,lookup} = fixture();
    expect(act(owner,'offer_clear')).toBeNull();
    const row = offer(); ++world.tick;
    expect(act(witness,'verify',{targetHouseholdNameId:row.id})).not.toBeNull(); ++world.tick;
    expect(act(owner,'offer_clear')).not.toBeNull();
    const cancelled = world.householdNames.entries.at(-1)!;
    expect(lookup(alias).status).toBe('unique');
    expect(act(owner,'withdraw',{targetHouseholdNameId:cancelled.id})).not.toBeNull();
    ++world.tick;
    expect(act(witness,'verify',{targetHouseholdNameId:cancelled.id})).toBeNull();
    expect(act(owner,'offer_clear')).not.toBeNull();
    const clear = world.householdNames.entries.at(-1)!;
    ++world.tick;
    expect(act(witness,'verify',{targetHouseholdNameId:clear.id})).not.toBeNull();
    expect(lookup(alias).status).toBe('unresolved');
    for(let i=0;i<110;i++) world.householdNames.entries.push({...cancelled,id:`cold-${i}`});
    advanceHouseholdNames(world);
    expect(world.householdNames.entries).toHaveLength(97);
    expect(world.householdNames.entries).toContain(clear);
    expect(world.householdNames.entries).not.toContain(row);
    expect(lookup(alias)).toEqual({status:'unresolved',matches:[]});
    expect(lookup(owner.name).status).toBe('ambiguous');
  });
});

type WorldStateRelocation = ReturnType<typeof createInitialWorld>['relocations']['plans'][number];
