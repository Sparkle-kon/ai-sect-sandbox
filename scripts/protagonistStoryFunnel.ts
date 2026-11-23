import type {Cultivator,WorldState} from '../src/types/world';
import {availableBountyHunts} from '../src/engine/bountyEngine';
import {hasReachablePilgrimageDeparture} from '../src/engine/pilgrimageEngine';
import {protagonistHandoffExitAuthority} from '../src/engine/protagonistHandoff';
import {projectProtagonistSuccession} from '../src/engine/protagonistSuccession';
import {verifiedImmortalAscension} from '../src/engine/ascensionProof';
import type {StoryAuditTurn} from './storyTriggerAuditTerms';

const local=(actor:Cultivator|undefined):actor is Cultivator=>!!actor&&actor.alive&&actor.hp>0&&actor.positionPlane===undefined;
const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id);

export function createProtagonistStoryFunnel(){
  const counts={
    flight:{leadMonths:0,priorEscrowedBountyMonths:0,admittedLocalHunterMonths:0,admittedSearchHunterMonths:0,
      recordedSearchMonths:0,recordedContactMonths:0,leadAliveAfterCombatMonths:0,
      priorAcceptedParkedMonths:0,parkedReachableAtContactMonths:0,liveCaptureMonths:0,openedFlights:0},
    succession:{openedArcs:0,closedArcs:0,verifiedPublicDeath:0,verifiedAscension:0,ordinaryReceded:0,
      evidenceLost:0,unverifiedPublicDeath:0,recordedHandoffs:0},
  };
  function observe({before,after,events}:StoryAuditTurn){
    if(after.tick!==before.tick+1)return;
    const succession=counts.succession;
    const previousArcs=new Map(before.protagonistSuccession.arcs.map(row=>[row.id,row]));
    for(const arc of after.protagonistSuccession.arcs){
      const prior=previousArcs.get(arc.id);
      if(!prior&&arc.openedTick===before.tick){
        succession.openedArcs++;
        if(arc.handoff)succession.recordedHandoffs++;
      }
      if(arc.endedTick!==before.tick||prior?.endedTick!==undefined)continue;
      succession.closedArcs++;
      if(arc.closeReason==='public_death'){
        if(arc.death&&protagonistHandoffExitAuthority(before,arc,{exitKind:'public_death',exitEventId:arc.death.eventId},before.tick)==='verified')
          succession.verifiedPublicDeath++;
        else succession.unverifiedPublicDeath++;
      } else if(arc.closeReason==='receded'){
        const actor=person(before,arc.actorId),terminal=actor&&verifiedImmortalAscension(before,actor)?.terminal;
        if(terminal&&protagonistHandoffExitAuthority(before,arc,{exitKind:'ascension',exitEventId:terminal.eventId},before.tick)==='verified')
          succession.verifiedAscension++;
        else succession.ordinaryReceded++;
      } else if(arc.closeReason==='evidence_lost')succession.evidenceLost++;
    }

    const flight=counts.flight;
    flight.openedFlights+=(after.protagonistFlights??[]).filter(row=>row.openedTick===after.tick).length;
    const active=projectProtagonistSuccession(before).active;
    const lead=active&&person(before,active.actorId);
    if(!local(lead))return;
    flight.leadMonths++;
    const bounties=before.bounties.filter(row=>row.targetCultivatorId===lead.id&&row.status==='open'&&row.issuedTick<=before.tick&&row.escrow.length>0);
    if(bounties.length===0)return;
    flight.priorEscrowedBountyMonths++;
    const ids=new Set(bounties.map(row=>row.id));
    const admitted=before.cultivators.filter(actor=>local(actor)&&availableBountyHunts(actor,before).some(move=>ids.has(move.targetBountyId)));
    if(admitted.some(actor=>actor.locationId===lead.locationId))flight.admittedLocalHunterMonths++;
    if(admitted.some(actor=>actor.locationId!==lead.locationId))flight.admittedSearchHunterMonths++;

    const current=events.filter(row=>row.tick===after.tick&&row.year===after.year&&row.month===after.month&&row.witnessScope===undefined);
    const priorBounty=(id:string)=>ids.has(id);
    if(current.some(event=>event.category==='intrigue'&&event.actorIds.length===1&&
      bounties.some(bounty=>event.id===`evt-${after.tick}-bounty-${bounty.id}-${event.actorIds[0]}-search`)))flight.recordedSearchMonths++;
    const surviving=person(after,lead.id);
    if(local(surviving)&&after.bounties.some(row=>priorBounty(row.id)&&row.status==='claimed'&&row.settledTick===after.tick))
      flight.liveCaptureMonths++;

    const parked=before.pilgrimages.journeys.filter(row=>row.organizerId===lead.id&&row.status==='active'&&!row.path.length&&
      row.startedTick!==undefined&&row.startedTick<=before.tick&&row.stopsVisited.at(-1)?.locationId===lead.locationId);
    const priorJourney=parked.length===1?parked[0]:undefined;
    if(priorJourney){
      const guide=person(before,priorJourney.companionId);
      if(local(guide)&&guide.locationId===lead.locationId)flight.priorAcceptedParkedMonths++;
    }
    // Native PURSUE_BOUNTY retains this action after calling the normal duel. Other duels do not count here.
    const contacts=current.filter(event=>{
      const hunter=person(after,event.actorIds[0]??'');
      return hunter?.currentAction==='PURSUE_BOUNTY'&&event.actorIds.length===2&&event.actorIds[1]===lead.id&&
        !!event.locationId&&((event.category==='combat'&&event.id===`evt-${after.tick}-${hunter.id}-duel`)||
          (event.category==='death'&&event.id===`evt-${after.tick}-${hunter.id}-kill`));
    });
    if(!contacts.length)return;
    flight.recordedContactMonths++;
    const survivingFight=contacts.find(event=>event.duelWinnerId===lead.id&&event.category==='combat'&&
      event.damage?.some(hit=>hit.cultivatorId===lead.id&&hit.amount>0));
    if(!local(surviving)||!survivingFight)return;
    flight.leadAliveAfterCombatMonths++;
    if(!priorJourney||survivingFight.locationId!==lead.locationId||surviving.locationId!==lead.locationId)return;
    const oldGuide=person(before,priorJourney.companionId),guide=person(after,priorJourney.companionId);
    const journey=after.pilgrimages.journeys.find(row=>row.id===priorJourney.id);
    if(local(oldGuide)&&local(guide)&&guide.id!==survivingFight.actorIds[0]&&oldGuide.locationId===lead.locationId&&
      guide.locationId===lead.locationId&&journey?.status==='active'&&journey.lastMovedTick!==after.tick&&
      priorJourney.legIndex===journey.legIndex&&(journey.expiresTick??0)>after.tick+3&&hasReachablePilgrimageDeparture(after,journey,3))
      flight.parkedReachableAtContactMonths++;
  }
  // Eligible successors rejected during election are not stored; do not infer them from unrelated arcs.
  return {observe,summary:()=>structuredClone(counts)};
}
