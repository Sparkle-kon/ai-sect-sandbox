import type {WorldState} from '../types/world';
import {UPPER_ARRAY_FIELD_COUNCIL,UPPER_ARRAY_FIELD_ENTRY_STONES,UPPER_ARRAY_FIELD_GATE,UPPER_ARRAY_FIELD_HOME,
  UPPER_ARRAY_FIELD_HOME_ROOTS,UPPER_ARRAY_FIELD_HOME_STONES,isUpperArrayFieldCouncilEvent,isUpperArrayFieldEventId,upperArrayFieldActedOutsideGeography,upperArrayFieldEdge,
  upperArrayFieldMovementEventId,upperArrayFieldResidenceId,upperArrayFieldSite,upperArrayFieldVisitId,
  type UpperArrayFieldMove,type UpperArrayFieldVisit} from './upperArrayFieldTerms';

export function validateUpperArrayFieldMovement(world:WorldState,fail:(path:string)=>never):void{
  const state=world.upperArrayField;
  if(world.locations.some(row=>upperArrayFieldSite(row.id)))fail('upperArrayField.lowerAddressReuse');
  if(!state){
    if(world.cultivators.some(row=>upperArrayFieldSite(row.locationId))||
      world.events.some(row=>isUpperArrayFieldEventId(row.id)||row.locationId!==undefined&&upperArrayFieldSite(row.locationId))||
      world.resourceFlow.months.some(month=>month.entries.some(row=>row.mechanism==='upper_array_field')))
      fail('upperArrayField.missing');
    return;
  }
  if(world.events.some(row=>row.locationId!==undefined&&upperArrayFieldSite(row.locationId)&&!isUpperArrayFieldEventId(row.id)))
    fail('upperArrayField.untypedEvent');
  if(!state.visits.length&&!state.trade)fail('upperArrayField.empty'); // A genuine pre-departure accord may precede the first visit.
  const time=(tick:number)=>Number.isSafeInteger(tick)&&tick>=1&&tick<=world.tick;
  const actors=new Map(world.cultivators.map(row=>[row.id,row]));
  const journeys=new Map(world.upperPassage?.journeys.map(row=>[row.id,row]));
  const ids=new Map<string,UpperArrayFieldVisit>(),latest=new Map<string,UpperArrayFieldVisit>();
  const payments=new Map<string,{actorId:string;tick:number;stones:number;roots:number;reason:string}>();
  const events=new Map<string,{actorId:string;tick:number;siteId:string}>();
  const evt=(ref:string,move:UpperArrayFieldMove,tick:number,actorId:string,siteId:string)=>
    events.set(upperArrayFieldMovementEventId(ref,move,tick),{actorId,tick,siteId});
  const actionDates=new Set<string>();
  const date=(actorId:string,tick:number)=>{
    const key=JSON.stringify([actorId,tick]);
    if(actionDates.has(key)||upperArrayFieldActedOutsideGeography(world,actorId,tick))fail('upperArrayField.movement.sameMonth');
    actionDates.add(key);
  };
  let entered=0;
  for(const visit of state.visits){
    const actor=actors.get(visit.actorId),journey=journeys.get(visit.journeyId),prior=latest.get(visit.actorId);
    const first=visit.steps[0],terminal=visit.steps.at(-1);
    const before=journey?.steps.filter(step=>step.tick<visit.enteredTick).at(-1);
    const end=visit.exitedTick??visit.deceasedTick??Infinity;
    if(!actor||!journey||journey.actorId!==visit.actorId||!journey.reading||!journey.petition||
      journey.petition.readingTick!==journey.reading.tick||journey.petition.tick>=visit.enteredTick||
      before?.nodeId!==UPPER_ARRAY_FIELD_COUNCIL||before.direction!=='outbound'||
      journey.steps.some(step=>step.tick>=visit.enteredTick&&step.tick<=end)||
      !time(visit.enteredTick)||visit.enteredTick<entered||ids.has(visit.id)||
      visit.id!==upperArrayFieldVisitId(visit.enteredTick,visit.actorId)||visit.paidStones!==UPPER_ARRAY_FIELD_ENTRY_STONES||
      !first||!terminal||first.tick!==visit.enteredTick||first.siteId!==UPPER_ARRAY_FIELD_GATE||
      prior&&(prior.exitedTick===undefined||prior.exitedTick>=visit.enteredTick))fail('upperArrayField.visit.origin');
    date(visit.actorId,first.tick);
    evt(visit.id,'enter',first.tick,visit.actorId,first.siteId);
    for(let i=1;i<visit.steps.length;i++){
      const previous=visit.steps[i-1],step=visit.steps[i];
      if(!time(step.tick)||step.tick<=previous.tick||!upperArrayFieldEdge(previous.siteId,step.siteId))
        fail('upperArrayField.visit.step');
      date(visit.actorId,step.tick);
      evt(visit.id,'travel',step.tick,visit.actorId,step.siteId);
    }
    if(visit.exitedTick!==undefined){
      if(!time(visit.exitedTick)||visit.exitedTick<=terminal.tick||terminal.siteId!==UPPER_ARRAY_FIELD_GATE||visit.deceasedTick!==undefined)
        fail('upperArrayField.visit.exit');
      date(visit.actorId,visit.exitedTick);
      evt(visit.id,'exit',visit.exitedTick,visit.actorId,UPPER_ARRAY_FIELD_COUNCIL);
    }else if(journey.returnedTick!==undefined||visit.deceasedTick!==journey.deceasedTick||
      actor.positionPlane!=='upper'||actor.locationId!==terminal.siteId||
      (visit.deceasedTick!==undefined)!==(!actor.alive||actor.hp<=0)||
      visit.deceasedTick!==undefined&&(!time(visit.deceasedTick)||visit.deceasedTick<terminal.tick))
      fail('upperArrayField.visit.body');
    payments.set(visit.id,{actorId:visit.actorId,tick:visit.enteredTick,stones:UPPER_ARRAY_FIELD_ENTRY_STONES,roots:0,
      reason:'upper_array_field_entry_paid'});
    ids.set(visit.id,visit);
    latest.set(visit.actorId,visit);
    entered=visit.enteredTick;
  }
  for(const actor of world.cultivators)if(upperArrayFieldSite(actor.locationId)){
    const visit=latest.get(actor.id);
    if(!visit||visit.exitedTick!==undefined||actor.positionPlane!=='upper'||visit.steps.at(-1)?.siteId!==actor.locationId)
      fail('upperArrayField.person.address');
  }
  const settled=new Set<string>();
  for(const row of state.residences){
    const visit=ids.get(row.visitId),arrival=visit?.steps.filter(step=>step.tick<row.settledTick).at(-1);
    if(!time(row.settledTick)||settled.has(row.actorId)||row.id!==upperArrayFieldResidenceId(row.settledTick,row.actorId)||
      !visit||visit.actorId!==row.actorId||row.settledTick>=Math.min(visit.exitedTick??Infinity,visit.deceasedTick??Infinity)||
      arrival?.siteId!==UPPER_ARRAY_FIELD_HOME||row.homeSiteId!==UPPER_ARRAY_FIELD_HOME||
      row.paidStones!==UPPER_ARRAY_FIELD_HOME_STONES||row.paidRoots!==UPPER_ARRAY_FIELD_HOME_ROOTS)
      fail('upperArrayField.residence');
    date(row.actorId,row.settledTick);
    evt(row.id,'settle',row.settledTick,row.actorId,row.homeSiteId);
    payments.set(row.id,{actorId:row.actorId,tick:row.settledTick,stones:row.paidStones,roots:row.paidRoots,
      reason:'upper_array_field_home_paid'});
    settled.add(row.actorId);
  }
  const confirmed=new Set<string>();
  for(const row of world.events){
    if(!isUpperArrayFieldCouncilEvent(row.id))continue;
    const exact=events.get(row.id);
    if(!exact||confirmed.has(row.id)||row.tick!==exact.tick||row.locationId!==exact.siteId||row.category!=='diplomacy'||
      row.witnessScope!=='participants'||row.actorIds.length!==1||row.actorIds[0]!==exact.actorId)fail('upperArrayField.movement.event');
    confirmed.add(row.id);
  }
  const paid=new Set<string>(), key=(ref:string,good:string)=>JSON.stringify([ref,good]);
  const fullMonths=new Set(world.resourceFlow.months.filter(row=>row.totalEntries===row.entries.length).map(row=>row.tick));
  for(const month of world.resourceFlow.months)for(const row of month.entries){
    const payment=payments.get(row.refId);
    if(!payment&&row.reason!=='upper_array_field_entry_paid'&&row.reason!=='upper_array_field_home_paid')continue;
    const k=key(row.refId,row.good);
    const amount=row.good==='stone'?payment?.stones:row.good==='earth_root'?payment?.roots:undefined;
    if(!payment||paid.has(k)||row.mechanism!=='upper_array_field'||row.kind!=='consumption'||!amount||
      row.amount!==amount||row.reason!==payment.reason||row.tick!==payment.tick||row.from.kind!=='actor'||
      row.from.id!==payment.actorId||row.visibility.kind!=='participants'||row.visibility.actorIds.length!==1||
      row.visibility.actorIds[0]!==payment.actorId)fail('upperArrayField.movement.flow');
    paid.add(k);
  }
  for(const [id,row] of payments)if(fullMonths.has(row.tick)&&
    (!paid.has(key(id,'stone'))||row.roots>0&&!paid.has(key(id,'earth_root'))))fail('upperArrayField.movement.flowMissing');
}
