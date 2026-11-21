import type {DanxiaMedicineCommitment, WorldState} from '../types/world';
import {DANXIA_MEDICINE_ACK_TICKS,DANXIA_MEDICINE_LEAVES,DANXIA_MEDICINE_MAX_STEPS,DANXIA_MEDICINE_OFFER_TICKS,
  DANXIA_MEDICINE_STRIDE,danxiaMedicineId,danxiaMedicineParties} from './danxiaMedicineTerms';
import {DANXIA_SECT_ID,danxiaShortageId} from './danxiaShortageTerms';
import {routeWarningHazardValid} from './routeWarningProof';
import {courierPublicPath} from './sealedCourierEngine';
import {terrainTileAt} from './terrainEngine';

const CLOSED=new Set(['observed','brewed','brew_failed','received','recovered','lost']);
const RETAIN=new Set(['retained','recoverable','brewed','brew_failed','recovered']);
const SHIP=new Set(['offered','in_transit','arrived','returning','recoverable','received','recovered','lost']);
const PREFIX=/^evt-(\d+)-(danxia-medicine-danxia-shortage-care-followup-[1-9]\d*)-/;
const equals=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((v,i)=>v===b[i]);

function verifyJournal(world:WorldState,commitments:Map<string,DanxiaMedicineCommitment>,fail:(path:string)=>never){
  const phases=new Set<string>();
  const complete=new Set<number>();
  for(const month of world.resourceFlow.months) {
    if(month.entries.length===month.totalEntries)complete.add(month.tick);
    for(const entry of month.entries){
      const from='from' in entry?entry.from:undefined;
      const to='to' in entry?entry.to:undefined;
      const linked=from?.kind==='danxia_medicine'?from.id:to?.kind==='danxia_medicine'?to.id:undefined;
      if(!linked&&entry.mechanism!=='danxia_medicine'&&!entry.reason.startsWith('danxia_medicine_'))continue;
      const row=linked&&commitments.get(linked);
      if(!row||entry.good!=='jade_leaf'||entry.amount!==DANXIA_MEDICINE_LEAVES||entry.visibility.kind!=='participants')
        fail('danxiaMedicine.journal.source');
      const brew=entry.mechanism==='alchemy';
      const parties=brew?[row.discipleId]:danxiaMedicineParties(row);
      if(!equals(entry.visibility.actorIds,parties))fail('danxiaMedicine.journal.scope');
      if(brew){
        if(entry.kind!=='consumption'||entry.reason!=='brew_material'||entry.refId!==row.originId||from?.kind!=='danxia_medicine'||
          row.settlement?.tick!==entry.tick||(row.status!=='brewed'&&row.status!=='brew_failed'))fail('danxiaMedicine.journal.brew');
      } else if(entry.mechanism!=='danxia_medicine'||entry.refId!==row.id)fail('danxiaMedicine.journal.mechanism');
      if(!brew){
        switch(entry.reason){
          case 'danxia_medicine_reserve':
            if(entry.kind!=='transfer'||from?.kind!=='actor'||from.id!==row.discipleId||to?.kind!=='danxia_medicine'||
              row.reservedTick!==entry.tick)fail('danxiaMedicine.journal.deposit');
            break;
          case 'danxia_medicine_delivery':
          case 'danxia_medicine_refund':
            if(entry.kind!=='transfer'||from?.kind!=='danxia_medicine'||to?.kind!=='actor'||
              row.settlement?.tick!==entry.tick||row.settlement.actorId!==to.id||
              row.status!==(entry.reason==='danxia_medicine_delivery'?'received':'recovered'))fail('danxiaMedicine.journal.transfer');
            break;
          case 'danxia_medicine_loss':
            if(entry.kind!=='loss'||from?.kind!=='danxia_medicine'||row.status!=='lost'||row.settlement?.tick!==entry.tick)
              fail('danxiaMedicine.journal.loss');
            break;
          default:fail('danxiaMedicine.journal.reason');
        }
      }
      const phase=row.id+(entry.reason==='danxia_medicine_reserve'?':reserved':':settled');
      if(phases.has(phase))fail('danxiaMedicine.journal.duplicate');
      phases.add(phase);
    }
  }
  for(const row of commitments.values()){
    if(row.reservedTick!==undefined&&complete.has(row.reservedTick)&&!phases.has(row.id+':reserved')||
      row.settlement&&row.choice!=='observe'&&complete.has(row.settlement.tick)&&!phases.has(row.id+':settled'))
      fail('danxiaMedicine.journal.missing');
  }
}

export function validateDanxiaMedicineHistory(world:WorldState,actorIds:ReadonlySet<string>,fail:(path:string)=>never):void{
  const pending=world.playerAvatar.pendingOrder;
  const rows=world.danxiaMedicine.commitments;
  // Read the existing journal even when no rows: a forged orphan endpoint must never escape validation.
  const byId=new Map<string,DanxiaMedicineCommitment>();
  const eventAuthority=new Map<string,{row:DanxiaMedicineCommitment;tick:number;kind:WorldState['events'][number]['category'];locationId?:string}>();
  if(rows.length){
    const shortageById=new Map(world.danxiaShortages.cases.map(row=>[row.id,row]));
    const appointments=new Map(world.careFollowups.appointments.map(row=>[row.id,row]));
    const members=new Map(world.households.members.map(row=>[row.volunteerId,row]));
    const sites=new Map(world.locations.map(site=>[site.id,site]));
    const villages=new Map(world.settlements.villages.map(village=>[village.id,village]));
    const activeEscorts=new Set<string>();
    for(const row of rows){
      const {id,choice,status,escrow,startedTick,offerUntilTick,reservedTick,acceptedTick,departedTick,arrivedTick,
        receiveUntilTick,path,pathIndex,lastMovedTick,returnStartedTick,returnedTick,disposition,hazard,settlement}=row;
      const source=shortageById.get(row.shortageId), appointment=appointments.get(row.appointmentId), member=members.get(row.volunteerId);
      const origin=sites.get(row.originId),destination=sites.get(row.destinationId),village=villages.get(row.settlementId);
      const settled=CLOSED.has(status), ship=choice==='offer_ship';
      const at=(at:number|undefined)=>at===undefined||at>=startedTick&&at<=world.tick;
      if(byId.has(id)||id!==danxiaMedicineId(row.shortageId)||row.shortageId!==danxiaShortageId(row.appointmentId)||!origin||!destination||
          row.originId===row.destinationId||!village||village.locationId!==row.destinationId||
          !actorIds.has(row.discipleId)||!actorIds.has(row.patientId)||row.discipleId===row.patientId||
          ship!==!!row.escortId||row.escortId&&(!actorIds.has(row.escortId)||[row.discipleId,row.patientId].includes(row.escortId))||
          !appointment||appointment.sourceCaseId!==row.sourceCaseId||appointment.patientId!==row.patientId||
          appointment.sectId!==DANXIA_SECT_ID||appointment.siteId!==row.originId||appointment.dueTick>startedTick||
          appointment.expiresTick<startedTick||!member||member.householdId!==row.householdId||member.settlementId!==row.settlementId||
          member.recruitedId!==row.patientId||!['recruited','deceased'].includes(member.status)||
          (!source||source.siteId!==row.originId||source.discipleId!==row.discipleId||source.patientId!==row.patientId||
            source.settlementId!==row.settlementId||source.householdId!==row.householdId||source.volunteerId!==row.volunteerId||
            source.appointmentId!==row.appointmentId||source.sourceCaseId!==row.sourceCaseId||
            startedTick<source.openedTick||startedTick>source.openedTick+1)||
          !at(startedTick)||offerUntilTick!==startedTick+DANXIA_MEDICINE_OFFER_TICKS||
          (choice==='observe'?status!=='observed'||reservedTick!==undefined:reservedTick!==startedTick||
            !(ship?SHIP:RETAIN).has(status))||escrow!==(settled?0:DANXIA_MEDICINE_LEAVES)||
          settled!==!!settlement||settlement&&(settlement.kind!==status||!at(settlement.tick)))fail('danxiaMedicine.commitments.source');

      if(![acceptedTick,departedTick,arrivedTick,lastMovedTick,returnStartedTick,returnedTick,disposition?.tick].every(at)||
        (acceptedTick!==undefined)!==!!path||(acceptedTick!==undefined)!==(pathIndex!==undefined)||
        acceptedTick!==undefined&&(!ship||acceptedTick<=startedTick||acceptedTick>=offerUntilTick)||
        departedTick!==undefined&&(acceptedTick===undefined||departedTick<=acceptedTick)||
        lastMovedTick!==undefined&&(departedTick===undefined||lastMovedTick<departedTick)||
        (arrivedTick!==undefined)!==(receiveUntilTick!==undefined)||
        arrivedTick!==undefined&&(departedTick===undefined||arrivedTick<departedTick||arrivedTick>(lastMovedTick??-1)||
          receiveUntilTick!==arrivedTick+DANXIA_MEDICINE_ACK_TICKS)||
        returnStartedTick!==undefined&&(!disposition||departedTick===undefined||returnStartedTick<departedTick||
          (arrivedTick!==undefined&&returnStartedTick<arrivedTick))||
        returnedTick!==undefined&&(returnStartedTick===undefined||returnedTick<=returnStartedTick||returnedTick!==lastMovedTick||pathIndex!==0)||
        (status==='retained'||status==='offered')&&(world.tick>=offerUntilTick||acceptedTick!==undefined||disposition!==undefined)||
        (status==='in_transit'||status==='arrived'||status==='returning')&&acceptedTick===undefined||
        status==='in_transit'&&(arrivedTick!==undefined||returnStartedTick!==undefined||disposition!==undefined)||
        status==='arrived'&&(arrivedTick===undefined||returnStartedTick!==undefined||world.tick>=receiveUntilTick!)||
        status==='returning'&&(returnStartedTick===undefined||returnedTick!==undefined)||
        (status==='recoverable'||status==='recovered')&&(!disposition||departedTick!==undefined&&returnedTick===undefined)||
        status==='lost'&&(!disposition||departedTick===undefined)||
        (status==='observed'||status==='brewed'||status==='brew_failed'||status==='received')&&disposition!==undefined)
        fail('danxiaMedicine.commitments.clock');
      if(path){
        const native=courierPublicPath(world,origin,destination);
        if(path.length<2||path.length-1>DANXIA_MEDICINE_MAX_STEPS||native.length!==path.length||
          path.some((point,i)=>native[i].x!==point.x||native[i].y!==point.y)||pathIndex===undefined||pathIndex>=path.length||
          departedTick===undefined&&pathIndex!==0||pathIndex>(world.tick-acceptedTick!)*DANXIA_MEDICINE_STRIDE||
          (status==='arrived'||status==='received')&&pathIndex!==path.length-1||status==='in_transit'&&pathIndex===path.length-1||
          arrivedTick!==undefined&&arrivedTick-acceptedTick!<Math.ceil((path.length-1)/DANXIA_MEDICINE_STRIDE))
          fail('danxiaMedicine.commitments.route');
      }
      if(hazard&&(!settlement||status!=='lost'||hazard.intensity!==3||(hazard.kind!=='meteor'&&hazard.kind!=='beast_tide')||
          !routeWarningHazardValid(world,hazard,settlement.tick)||
          !path?.slice(1).some(point=>terrainTileAt(world,point.x,point.y)?.id===hazard.tileId))||
        status==='lost'&&!hazard&&world.cultivators.find(actor=>actor.id===row.escortId)?.alive||
        disposition?.reason==='route_lost'&&!hazard)fail('danxiaMedicine.commitments.loss');
      if(settlement){
        const brew=status==='brewed'||status==='brew_failed';
        const role=status==='received'?row.patientId:status==='lost'?row.escortId:row.discipleId;
        if(settlement.actorId!==role||brew!==(settlement.artifactEventId!==undefined)||
          status==='observed'&&settlement.tick!==startedTick||
          brew&&(settlement.tick<=startedTick||settlement.tick>=offerUntilTick||
            settlement.artifactEventId!==`evt-${settlement.tick}-${row.discipleId}-alchemy`)||
          status==='received'&&(arrivedTick===undefined||settlement.tick<=arrivedTick||settlement.tick>=receiveUntilTick!)||
          status==='recovered'&&(settlement.tick<(returnedTick??disposition?.tick??Infinity)))
          fail('danxiaMedicine.commitments.settlement');
        if(settlement.artifactEventId)eventAuthority.set(settlement.artifactEventId,{row,tick:settlement.tick,kind:'breakthrough',locationId:row.originId});
      }
      const locked=status==='in_transit'||status==='arrived'||status==='returning'||status==='lost'&&!!returnStartedTick&&returnedTick===undefined;
      if(locked&&row.escortId){
        if(activeEscorts.has(row.escortId))fail('danxiaMedicine.commitments.carrier');
        activeEscorts.add(row.escortId);
      }
      byId.set(id,row);
    }
  }
  if(pending?.action==='DANXIA_MEDICINE'){
    if(pending.queuedTick>world.tick||pending.danxiaMedicineMove==='observe')fail('playerAvatar.danxiaMedicine.order');
    if(pending.danxiaMedicineMove==='retain'||pending.danxiaMedicineMove==='offer_ship'){
      const source=world.danxiaShortages.cases.find(row=>row.id===pending.targetDanxiaShortageId);
      if(source?.discipleId!==pending.actorId||pending.targetCultivatorId!==undefined&&
        (!actorIds.has(pending.targetCultivatorId)||[source.discipleId,source.patientId].includes(pending.targetCultivatorId)))
        fail('playerAvatar.danxiaMedicine.order');
    }else{
      const row=pending.targetDanxiaMedicineId&&byId.get(pending.targetDanxiaMedicineId);
      const role=pending.danxiaMedicineMove;
      if(!row||!(role==='brew'||role==='recover'?row.discipleId===pending.actorId:
        role==='accept'?row.escortId===pending.actorId:role==='receive'?row.patientId===pending.actorId:
        row.escortId===pending.actorId||row.patientId===pending.actorId))fail('playerAvatar.danxiaMedicine.order');
    }
  }
  verifyJournal(world,byId,fail);
  if(!byId.size)return;
  const rawSeen=new Set<string>();
  for(const event of world.events){
    const match=PREFIX.exec(event.id), art=eventAuthority.get(event.id);
    const row=match?byId.get(match[2]):art?.row;
    if(!row)continue;
    if(rawSeen.has(event.id)||event.witnessScope!=='participants'||!equals(event.actorIds,danxiaMedicineParties(row))||
      event.tick!==(art?.tick??Number(match?.[1]))||event.tick<row.startedTick||event.tick>world.tick||
      event.category!==(art?.kind??'diplomacy')||art&&art.locationId!==event.locationId)
      fail('danxiaMedicine.events.private');
    rawSeen.add(event.id);
  }
  const privateAnchor=({id}:{id:string})=>eventAuthority.has(id)||byId.has(PREFIX.exec(id)?.[2]??'');
  if(world.chronicleArchive.anchors.some(privateAnchor)||world.chronicleArchive.chapters.some(chapter=>chapter.anchors.some(privateAnchor))||
    world.coldHistory.chapters.some(chapter=>chapter.anchors.some(privateAnchor)))fail('danxiaMedicine.publicArchive');
}
