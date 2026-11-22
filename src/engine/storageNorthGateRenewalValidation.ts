import type {WorldState} from '../types/world';
import {findNorthGateRenewalSource,northGateRenewalApertureAuthorized,northGateRenewalForSource} from './northGateRenewalTerms';

export function validateNorthGateRenewal(world:WorldState,fail:(path:string)=>never):void {
  const water=world.coldWaterVein;
  const renewed=water?.openings.filter(opening=>opening.renewal)??[];
  const hearing=world.northGateRenewal?.hearing;
  if(!hearing){
    // Earlier engines can write an advanced date before this optional ledger exists.
    if(renewed.length)fail('northGateRenewal.missing');
    return;
  }
  const source=findNorthGateRenewalSource(world);
  if(!source)fail('northGateRenewal.source');
  const expected=northGateRenewalForSource(source);
  if(hearing.id!==expected.id||hearing.openedTick!==expected.openedTick||
    hearing.expiresTick!==expected.expiresTick||hearing.openedTick>world.tick||
    (Object.keys(source) as Array<keyof typeof source>).some(key=>hearing.source[key]!==source[key]))
    fail('northGateRenewal.source');

  const within=(tick:number)=>tick>=hearing.openedTick&&tick<hearing.expiresTick&&tick<=world.tick;
  const endorsement=hearing.endorsement;
  if(endorsement){
    const member=world.households.members.find(row=>row.volunteerId===endorsement.volunteerId);
    const actor=world.cultivators.find(row=>row.id===endorsement.actorId);
    const enrollment=world.settlements.records.filter(row=>row.kind==='recruitment'&&row.cultivatorId===endorsement.actorId);
    const village=world.settlements.villages.find(row=>row.id===source.settlementId);
    const current=member?.status==='recruited'&&member.settledTick===endorsement.recruitedTick;
    const historical=member?.status==='deceased'&&actor&&(!actor.alive||actor.hp<=0)&&
      (member.settledTick??0)>=endorsement.signedTick&&(member.settledTick??Infinity)<=world.tick;
    if(!member||!actor||(!current&&!historical)||member.recruitedId!==actor.id||
      actor.id!==`recruit-${endorsement.volunteerId}`||
      !village?.volunteers.some(row=>row.id===endorsement.volunteerId&&row.enlistedCultivatorId===actor.id)||
      member.householdId!==endorsement.householdId||member.settlementId!==source.settlementId||
      endorsement.recruitedTick<member.registeredTick||endorsement.recruitedTick>=endorsement.signedTick||
      !within(endorsement.signedTick)||enrollment.length>1||enrollment.some(row=>
        row.tick!==endorsement.recruitedTick||row.volunteerId!==endorsement.volunteerId||
        row.settlementId!==source.settlementId||row.people!==1)||
      !world.households.groups.some(group=>group.id===endorsement.householdId&&group.presences.some(p=>p.settlementId===source.settlementId)))
      fail('northGateRenewal.endorsement');
  }

  // The old actuator cannot make a concurrent unsigned gate; earlier legitimate water debts stay untouched.
  if(water?.openings.some(row=>row.openedTick>=hearing.openedTick&&!row.renewal))fail('northGateRenewal.legacyBypass');
  const outcome=hearing.outcome;
  if(!outcome){
    if(renewed.length||world.tick>=hearing.expiresTick)fail('northGateRenewal.unsettled');
    return;
  }
  if(outcome.kind==='failed'){
    if(renewed.length||outcome.closedTick!==hearing.expiresTick||outcome.closedTick>world.tick)
      fail('northGateRenewal.failed');
    return;
  }
  const opening=renewed[0];
  if(renewed.length!==1||!opening||!within(outcome.openedTick)||!northGateRenewalApertureAuthorized(world,opening)||
    !world.cultivators.some(row=>row.id===outcome.actorId)||!world.sects.some(row=>row.id===outcome.sectId)||
    endorsement&&endorsement.signedTick>outcome.openedTick||
    outcome.stance==='accord'&&(!endorsement||endorsement.actorId===outcome.actorId||endorsement.signedTick>=outcome.openedTick))
    fail('northGateRenewal.reopened');
}
