import {onUpperPassagePlane} from './upperPassageIsolation';
import type {WorldState} from '../types/world';
import { northGateRenewalApertureAuthorized } from './northGateRenewalTerms';
import {UPPER_PASSAGE_FEE,UPPER_PASSAGE_PATH,UPPER_PASSAGE_RELIEF_PETITION,UPPER_PASSAGE_STANDARD_PETITION,
  upperPassageId,upperPassageIndex,upperPassagePlane,upperPassageThroat,type UpperPassageJourney,type UpperPassageNodeId} from './upperPassageTerms';
import {waterVeinApertureActive,waterVeinPhase} from './waterVeinTerms';

type Receipt={actorId:string;nodeId?:UpperPassageNodeId;tick:number;category?:'death'};
type FlowProof={actorId:string;tick:number;amount:number;payment:'realm_passage_paid'|'upper_array_fund_paid'};
export function validateUpperPassage(world:WorldState,fail:(path:string)=>never):void {
  const passage=world.upperPassage;
  const rawFlows=world.resourceFlow.months.flatMap(month=>month.entries.filter(entry=>entry.mechanism==='upper_passage'||
    ('from' in entry&&entry.from.kind==='upper_passage')||('to' in entry&&entry.to.kind==='upper_passage')));
  const graphLocations=new Set<string>(UPPER_PASSAGE_PATH.slice(1));
  const rawEvents=world.events.filter(event=>event.id.startsWith('evt-upper-passage-')||
    event.locationId!==undefined&&graphLocations.has(event.locationId));
  if(world.locations.some(site=>graphLocations.has(site.id)))fail('upperPassage.separateAddresses');
  if(!passage){
    if(world.cultivators.some(actor=>onUpperPassagePlane(actor)||graphLocations.has(actor.locationId))||rawFlows.length||rawEvents.length)
      fail('upperPassage.missing');
    return;
  }
  const persons=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const openings=new Map(world.coldWaterVein?.openings.map(row=>[row.id,row]));
  const wells=new Map(world.villageWorks.projects.map(row=>[row.id,row]));
  const farms=new Map(world.seedCulture.plots.map(row=>[row.id,row]));
  const voyage=new Map<string,UpperPassageJourney>(), latest=new Map<string,UpperPassageJourney>();
  const events=new Map<string,Receipt>(),payments=new Map<string,FlowProof>();
  const goodTick=(tick:number)=>tick>=1&&tick<=world.tick;
  const touchedAperture=(id:string,tick:number)=>{
    const opening=openings.get(id);
    return !!opening&&waterVeinApertureActive(opening,tick)&&northGateRenewalApertureAuthorized(world,opening);
  };
  const flowKey=(id:string,reason:string)=>`${id}:${reason}`;
  const nodeAt=(row:UpperPassageJourney,tick:number)=>{
    for(let i=row.steps.length-1;i>=0;i--)if(row.steps[i].tick<tick)return row.steps[i].nodeId;
    return undefined;
  };
  let previousEntered=0,totalFunds=0;
  for(const row of passage.journeys){
    const body=persons.get(row.actorId), opening=openings.get(row.openingId), prior=latest.get(row.actorId);
    const well=wells.get(row.wellProjectId), first=row.steps[0], terminal=row.steps.at(-1);
    if(!body||voyage.has(row.id)||!goodTick(row.enteredTick)||row.enteredTick<previousEntered||
      row.id!==upperPassageId(row.enteredTick,row.actorId)||row.paidStones!==UPPER_PASSAGE_FEE||
      prior&&(prior.returnedTick===undefined||prior.returnedTick>=row.enteredTick)||
      !well||well.settlementId!==world.coldWaterVein?.settlementId||well.kind!=='well'||well.status!=='completed'||
      well.settledTick===undefined||well.settledTick>row.enteredTick||well.laborTotal!==4||
      !opening||opening.wellProjectId!==well.id||!touchedAperture(opening.id,row.enteredTick)||
      !first||!terminal||first.tick!==row.enteredTick||first.nodeId!=='realm-passage-lower-step'||
      first.direction!=='outbound'||first.crossingOpeningId!==undefined)
      fail('upperPassage.initial');
    latest.set(row.actorId,row);voyage.set(row.id,row);previousEntered=row.enteredTick;
    events.set(`evt-${row.id}-enter-${row.enteredTick}`,{actorId:row.actorId,nodeId:first.nodeId,tick:first.tick});
    payments.set(flowKey(row.id,'realm_passage_paid'),{actorId:row.actorId,tick:row.enteredTick,amount:UPPER_PASSAGE_FEE,payment:'realm_passage_paid'});
    for(let i=1;i<row.steps.length;i++){
      const from=row.steps[i-1],to=row.steps[i],s=upperPassageIndex(from.nodeId),d=upperPassageIndex(to.nodeId);
      const flipped=from.direction!==to.direction;
      const crossing=upperPassageThroat(s,d);
      if(!goodTick(to.tick)||from.tick>=to.tick||s<1||d<0||d!==s+(to.direction==='outbound'?1:-1)||
        flipped&&to.direction!=='inbound'||crossing!==(to.crossingOpeningId!==undefined)||
        (to.crossingOpeningId!==undefined&&!touchedAperture(to.crossingOpeningId,to.tick)))fail('upperPassage.steps');
      events.set(`evt-${row.id}-${flipped?'turnback':'advance'}-${to.tick}`,{actorId:row.actorId,nodeId:to.nodeId,tick:to.tick});
    }
    if(row.direction!==terminal.direction||
      (row.returnedTick!==undefined)!==(terminal.nodeId==='loc-vein-north')||
      row.returnedTick!==undefined&&(row.returnedTick!==terminal.tick||row.deceasedTick!==undefined)||
      row.deceasedTick!==undefined&&(!goodTick(row.deceasedTick)||row.deceasedTick<terminal.tick||body.alive&&body.hp>0))
      fail('upperPassage.terminal');
    if(row.deceasedTick!==undefined)
      events.set(`evt-upper-passage-${row.deceasedTick}-${row.actorId}-oldage`,{actorId:row.actorId,tick:row.deceasedTick,category:'death'});
    const reading=row.reading;
    if(reading){
      if(!goodTick(reading.tick)||reading.tick>=(row.returnedTick??Infinity)||reading.tick>(row.deceasedTick??Infinity)||
        row.steps.some(step=>step.tick===reading.tick)||nodeAt(row,reading.tick)!=='realm-upper-array'||
        reading.openingId!==row.openingId||reading.wellProjectId!==row.wellProjectId||reading.siteId!=='loc-vein-north'||
        reading.veinId!=='north-cold-water')fail('upperPassage.reading');
      const loss=reading.loss;
      if(loss){
        const farm=farms.get(loss.plotId);
        const serial=Number(/^seed-plot-([1-9][0-9]*)$/u.exec(loss.plotId)?.[1]);
        if(!Number.isSafeInteger(serial)||serial>=world.seedCulture.nextPlotId||
          !goodTick(loss.sampleTick)||loss.sampleTick>loss.harvestedTick||loss.harvestedTick>=reading.tick||
          waterVeinPhase(opening,loss.sampleTick).fieldDeficit!==loss.fieldDeficit||
          farm&&(farm.ownerId!==row.actorId||farm.siteId!=='loc-vein-north'||farm.status!=='harvested'||
            farm.settledTick!==loss.harvestedTick||farm.yield!==loss.yield||
            !farm.weather.some(sample=>sample.tick===loss.sampleTick&&sample.waterDeficit===loss.fieldDeficit)))
          fail('upperPassage.reading.loss');
      }
      events.set(`evt-${row.id}-read-${reading.tick}`,{actorId:row.actorId,nodeId:'realm-upper-array',tick:reading.tick});
    }
    const petition=row.petition;
    if(petition){
      const due=reading?.loss?UPPER_PASSAGE_RELIEF_PETITION:UPPER_PASSAGE_STANDARD_PETITION;
      if(!reading||petition.readingTick!==reading.tick||!goodTick(petition.tick)||petition.tick<=reading.tick||
        petition.tick>=(row.returnedTick??Infinity)||petition.tick>(row.deceasedTick??Infinity)||
        row.steps.some(step=>step.tick===petition.tick)||nodeAt(row,petition.tick)!=='realm-upper-council'||
        petition.paidStones!==due||petition.outcome!==(reading.loss?'lower_relief':'ordinary'))fail('upperPassage.petition');
      totalFunds+=petition.paidStones;
      events.set(`evt-${row.id}-petition-${petition.tick}`,{actorId:row.actorId,nodeId:'realm-upper-council',tick:petition.tick});
      payments.set(flowKey(row.id,'upper_array_fund_paid'),{actorId:row.actorId,tick:petition.tick,amount:petition.paidStones,payment:'upper_array_fund_paid'});
    }
  }
  if(passage.upperReserve!==totalFunds)fail('upperPassage.reserve');
  for(const body of world.cultivators){
    const recent=latest.get(body.id),last=recent?.steps.at(-1);
    if(onUpperPassagePlane(body)){
      if(!recent||!last||recent.returnedTick!==undefined||body.locationId!==last.nodeId||
        body.positionPlane!==upperPassagePlane(last.nodeId)||(!body.alive||body.hp<=0)!==(recent.deceasedTick!==undefined))
        fail('upperPassage.actor.position');
    }else if(graphLocations.has(body.locationId)||recent&&recent.returnedTick===undefined)fail('upperPassage.actor.lower');
  }
  const pending=world.playerAvatar.pendingOrder;
  if(pending?.action==='UPPER_PASSAGE'&&pending.upperPassageMove!=='enter'){
    const body=persons.get(pending.actorId),row=latest.get(pending.actorId);
    const next=pending.targetUpperPassageNodeId;
    const move=pending.upperPassageMove;
    if(!body||!onUpperPassagePlane(body)||!row||row.returnedTick!==undefined||row.deceasedTick!==undefined)
      fail('upperPassage.pending');
    if(move==='read'||move==='petition'){
      const node=move==='read'?'realm-upper-array':'realm-upper-council';
      if(body.locationId!==node||next!==node)fail('upperPassage.pending.target');
    }else{
      const i=upperPassageIndex(body.locationId),j=upperPassageIndex(next);
      if(move==='turnback'?row.direction!=='outbound'||j!==i-1:j!==i+(row.direction==='outbound'?1:-1))
        fail('upperPassage.pending.path');
    }
  }
  const confirmedEvents=new Set<string>();
  for(const event of rawEvents){
    const row=events.get(event.id);
    if(!row||confirmedEvents.has(event.id)||row.tick!==event.tick||row.nodeId!==event.locationId||
      event.category!==(row.category??'diplomacy')||event.witnessScope!=='participants'||event.actorIds.length!==1||event.actorIds[0]!==row.actorId)
      fail('upperPassage.event');
    confirmedEvents.add(event.id);
  }
  const paid=new Set<string>();
  for(const flow of rawFlows){
    const key=flowKey(flow.refId,flow.reason), expected=payments.get(key);
    if(!expected||paid.has(key)||flow.mechanism!=='upper_passage'||flow.tick!==expected.tick||flow.amount!==expected.amount||
      flow.good!=='stone'||flow.visibility.kind!=='participants'||flow.visibility.actorIds.length!==1||
      flow.visibility.actorIds[0]!==expected.actorId||!('from' in flow)||flow.from.kind!=='actor'||flow.from.id!==expected.actorId)
      fail('upperPassage.flow');
    if(expected.payment==='realm_passage_paid'){
      if(flow.kind!=='consumption')fail('upperPassage.flow.admission');
    }else if(flow.kind!=='transfer'||flow.to.kind!=='upper_passage'||flow.to.id!=='realm-upper-council')fail('upperPassage.flow.reserve');
    paid.add(key);
  }
  const complete=new Set(world.resourceFlow.months.filter(month=>month.totalEntries===month.entries.length).map(month=>month.tick));
  for(const [key,expected] of payments)if(complete.has(expected.tick)&&!paid.has(key))fail('upperPassage.flow.missing');
}
