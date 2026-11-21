import type {
  Cultivator,InfirmaryCase,LLMDecisionPayload,Sect,SectStipend,SectStipendMove,SectStipendPeriod,SectStipendsState,
  WorldEvent,WorldState,
} from '../types/world';
import { INFIRMARY_TREATMENT_HERBS,INFIRMARY_TREATMENT_STONES } from './infirmaryEngine';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { flowActor,flowSect,recordResourceFlow } from './resourceFlowEngine';
import { SECT_CREDIT_RESERVE,sectCreditExposure } from './sectCreditEngine';

export const SECT_STIPEND_AMOUNT=12;
export const SECT_STIPEND_PERIODS=3;
export const SECT_STIPEND_OFFER_TICKS=3;
export const createSectStipendsState=():SectStipendsState=>({stipends:[],nextId:1});
export type SectStipendOption =
  | {action:'SECT_STIPEND';stipendMove:'offer';targetInfirmaryCaseId:string;targetStipendId?:never}
  | {action:'SECT_STIPEND';stipendMove:Exclude<SectStipendMove,'offer'>;targetStipendId:string;targetInfirmaryCaseId?:never};

const personAt=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id);
const sectAt=(world:WorldState,id:string)=>world.sects.find(sect=>sect.id===id);
const live=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive && actor.hp>0;
const authorityId=(record:SectStipend)=>record.handoffs.at(-1)?.toId??record.sponsorId;

function titled(world:WorldState,sect:Sect,siteId:string):boolean {
  return sect.headquartersId===siteId && world.locations.some(site=>site.id===siteId&&site.ownerSectId===sect.id &&
    site.type!=='abyss' && site.type!=='secret_realm') &&
    !world.relocations.plans.some(row=>row.sectId===sect.id&&row.status==='in_transit');
}
function present(world:WorldState,actor:Cultivator|undefined,sectId:string,siteId:string,tick:number):actor is Cultivator {
  if(!live(actor)||actor.age<18 || actor.sectId!==sectId||actor.locationId!==siteId || pilgrimageCheckpoint(world,actor) ||
      actor.tribulation?.stage==='lightning'||actor.tribulation?.stage==='heart_demon') return false;
  const id=actor.id;
  return !(actor.guardAssignment && actor.guardAssignment.locationId!==siteId &&
      actor.guardAssignment.assignedTick<=tick && tick<actor.guardAssignment.expiresTick) &&
    !world.pilgrimages.journeys.some(row=>(row.organizerId===id||row.companionId===id) &&
      (row.status==='active'||row.startedTick===tick||row.lastMovedTick===tick)) &&
    !world.couriers.dispatches.some(row=>row.courierId===id && (row.status==='in_transit'||row.status==='returning'||
      row.acceptedTick!==undefined&&(row.acceptedTick===tick||row.lastAdvancedTick===tick||row.settledTick===tick))) &&
    !world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(id)) &&
    !world.boundaryReliefs.cases.some(row=>row.incomingId===id&&(row.status==='travelling'||row.status==='returning')) &&
    !world.escorts.contracts.some(row=>row.status==='active'&&row.escortId===id) &&
    !world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(id)) &&
    !world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(id)&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(id))) &&
    !world.expeditionRescues.requests.some(row=>row.gateSiteId===siteId&&(row.explorerId===id||row.rescuerId===id)&&
      row.supplySpent===1&&(row.status==='extracting'||row.status==='interrupted'&&row.pathIndex>0&&
        !row.arrivedIds?.includes(id)&&world.occasions.some(occasion=>occasion.id===row.occasionId&&occasion.status==='running')));
}
function leader(world:WorldState,actor:Cultivator|undefined,sect:Sect,siteId:string,tick:number):actor is Cultivator {
  return present(world,actor,sect.id,siteId,tick)&&actor.id===sect.leaderId&&actor.sectRank==='掌门'&&
    actor.service?.status!=='retired'&&titled(world,sect,siteId);
}

function clinicProof(world:WorldState,sect:Sect,row:InfirmaryCase,tick:number):{
  recipient:Cultivator;service:SectStipend['service'];
}|undefined {
  const receipt=row.receipt;
  if(!receipt||row.status!=='treated'||row.sectId!==sect.id||row.siteId!==sect.headquartersId||row.patientId===receipt.guardId||
      row.queuedTick>=receipt.tick||row.settledTick!==receipt.tick||receipt.stonesSpent!==INFIRMARY_TREATMENT_STONES||
      receipt.herbsSpent!==INFIRMARY_TREATMENT_HERBS||!((receipt.hpRestored>0)||(receipt.toxicityRemoved>0))||
      !personAt(world,row.patientId)) return undefined;
  const shift=world.infirmaries.shifts.find(item=>item.id===receipt.shiftId && item.guardId===receipt.guardId &&
    item.sectId===sect.id && item.siteId===row.siteId && item.startedTick<receipt.tick && receipt.tick<item.expiresTick);
  const recipient=personAt(world,receipt.guardId);
  if(!shift || !present(world,recipient,sect.id,row.siteId,tick) || recipient.service?.status!=='retired' ||
      recipient.service.formerSectId!==sect.id || receipt.tick>=recipient.service.retiredTick || recipient.service.retiredTick>=tick) return undefined;
  const retirement=world.serviceRetirement.history.find(item=>item.kind==='retire'&&item.actorId===recipient.id&&
    item.sectId===sect.id&&item.tick===recipient.service?.retiredTick&&item.infirmaryShiftIds.includes(shift.id));
  if(!retirement) return undefined;
  return {recipient,service:{retirementId:retirement.id,retiredTick:retirement.tick,caseId:row.id,shiftId:shift.id,
    patientId:row.patientId,servedTick:receipt.tick}};
}
function stillRetired(person:Cultivator|undefined,record:SectStipend):person is Cultivator {
  return live(person) && person.sectId===record.sectId && person.service?.status==='retired' &&
    person.service.formerSectId===record.sectId && person.service.retiredTick===record.service.retiredTick;
}
function hasAvailableTreasury(world:WorldState,sect:Sect):boolean {
  const exposure=sectCreditExposure(world,sect.id);
  return Number.isFinite(sect.spiritStones) && sect.spiritStones >=
    SECT_CREDIT_RESERVE+exposure.payable+exposure.pendingOutgoing+SECT_STIPEND_AMOUNT;
}
function adoptedSuccession(world:WorldState,record:SectStipend,actor:Cultivator,sect:Sect,tick:number) {
  const succession=sect.succession;
  const fromId=authorityId(record);
  return succession && succession.method==='election'&&succession.previousLeaderId===fromId&&
    succession.leaderId===actor.id&&actor.id!==fromId&&actor.id!==record.recipientId&&
    succession.tick>= (record.handoffs.at(-1)?.adoptedTick??record.acceptedTick??record.offeredTick)&&
    succession.tick<tick&&leader(world,actor,sect,record.siteId,tick)?succession:undefined;
}

export function availableSectStipendActions(actor:Cultivator,world:WorldState,executionTick=world.tick):SectStipendOption[]{
  if ((executionTick!==world.tick&&executionTick!==world.tick+1)||!world.cultivators.includes(actor)) return [];
  const sect=actor.sectId && sectAt(world,actor.sectId);
  if(!sect || !present(world,actor,sect.id,sect.headquartersId,executionTick))return [];
  const isLeader=leader(world,actor,sect,sect.headquartersId,executionTick);
  const options:SectStipendOption[]=[];
  for(const record of world.sectStipends.stipends){
    if(record.sectId!==sect.id)continue;
    const recipient=personAt(world,record.recipientId);
    if(record.status==='offered' && executionTick<record.expiresTick){
      if(record.recipientId===actor.id&&stillRetired(actor,record)&&executionTick>record.offeredTick){
        options.push({action:'SECT_STIPEND',stipendMove:'decline',targetStipendId:record.id});
        if(hasAvailableTreasury(world,sect)&&
            leader(world,personAt(world,record.sponsorId),sect,record.siteId,executionTick)&&
            actor.locationId===record.siteId)
          options.push({action:'SECT_STIPEND',stipendMove:'accept',targetStipendId:record.id});
      }
      if(isLeader&&actor.id===record.sponsorId)
        options.push({action:'SECT_STIPEND',stipendMove:'withdraw',targetStipendId:record.id});
    } else if(record.status==='active' && record.acceptedTick!==undefined && executionTick<=record.acceptedTick+SECT_STIPEND_PERIODS){
      if(record.recipientId===actor.id&&stillRetired(actor,record)&&actor.locationId===record.siteId)
        options.push({action:'SECT_STIPEND',stipendMove:'withdraw',targetStipendId:record.id});
      if(stillRetired(recipient,record)&&adoptedSuccession(world,record,actor,sect,executionTick))
        options.push({action:'SECT_STIPEND',stipendMove:'adopt',targetStipendId:record.id});
    }
  }
  if(isLeader&&hasAvailableTreasury(world,sect)) for(const treatment of world.infirmaries.cases){
    const proof=clinicProof(world,sect,treatment,executionTick);
    if(proof && proof.recipient.id!==actor.id && !world.sectStipends.stipends.some(row=>
      (row.service.retirementId===proof.service.retirementId || row.service.caseId===proof.service.caseId) &&
      (row.acceptedTick!==undefined||row.status==='offered'&&executionTick<row.expiresTick)))
      options.push({action:'SECT_STIPEND',stipendMove:'offer',targetInfirmaryCaseId:treatment.id});
  }
  return options;
}
const keys=['chosenAction','innerMonologue','spokenLine','stipendMove'];
function event(world:WorldState,record:SectStipend,suffix:string,title:string,description:string):WorldEvent {
  return {id:`evt-${world.tick}-${record.id}-${suffix}`,tick:world.tick,year:world.year,month:world.month,title,description,
    actorIds:[authorityId(record),record.recipientId],locationId:record.siteId,category:'diplomacy',witnessScope:'participants'};
}
export function resolveSectStipendAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null {
  const move=payload.stipendMove;
  const targetKey=move==='offer'?'targetInfirmaryCaseId':'targetStipendId';
  if(payload.chosenAction!=='SECT_STIPEND'||Object.keys(payload).some(key=>![...keys,targetKey].includes(key)))return null;
  const option=availableSectStipendActions(actor,world).find(row=>row.stipendMove===move&&row[targetKey]===payload[targetKey]);
  if(!option)return null;
  const sect=actor.sectId && sectAt(world,actor.sectId);
  if(!sect)return null;
  if(option.stipendMove==='offer'){
    const treatment=world.infirmaries.cases.find(row=>row.id===option.targetInfirmaryCaseId);
    const proof=treatment&&clinicProof(world,sect,treatment,world.tick);
    if(!proof)return null;
    const record:SectStipend={id:`sect-stipend-${world.sectStipends.nextId++}`,sectId:sect.id,siteId:sect.headquartersId,
      recipientId:proof.recipient.id,sponsorId:actor.id,service:proof.service,offeredTick:world.tick,
      expiresTick:world.tick+SECT_STIPEND_OFFER_TICKS,status:'offered',handoffs:[],periods:[]};
    world.sectStipends.stipends.push(record);
    return event(world,record,'offer','退居俸养邀约','曾经实际护诊已凭正式记录核验。这里只提出到期审账的俸养，不先扣款或立债。');
  }
  const record=world.sectStipends.stipends.find(row=>row.id===option.targetStipendId);
  if(!record)return null;
  if(option.stipendMove==='adopt'){
    const succession=adoptedSuccession(world,record,actor,sect,world.tick);
    if(!succession||!succession.previousLeaderId)return null;
    record.handoffs.push({fromId:succession.previousLeaderId,toId:actor.id,successionTick:succession.tick,adoptedTick:world.tick});
    return event(world,record,'adopt','新掌门亲自承接俸养','仅延续尚未到期的原约；之前未兑不补发，不移交官位或另立债务。');
  }
  if(option.stipendMove==='accept'){
    record.status='active';record.acceptedTick=world.tick;
    return event(world,record,'accept','退居人本人同意俸养','受领人明示同意。未来三期分别按原额与可用公库核验。');
  }
  record.status=option.stipendMove==='decline'?'declined':'withdrawn';
  record.closedTick=world.tick;record.closedById=actor.id;
  return event(world,record,option.stipendMove,'俸养未再续行','不改变既兑记录；未到期款不会产生欠账。');
}

function closeReason(record:SectStipend,recipient:Cultivator|undefined):SectStipend['closure']{
  if(recipient && !recipient.alive)return 'recipient_died';
  if(!recipient || recipient.sectId!==record.sectId)return 'affiliation_changed';
  if(recipient.service?.status!=='retired'||recipient.service.retiredTick!==record.service.retiredTick||
      recipient.service.formerSectId!==record.sectId)return 'returned_to_service';
  return undefined;
}

export function advanceSectStipends(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const record of world.sectStipends.stipends){
    if(record.status!=='active'&&record.status!=='offered')continue;
    const recipient=personAt(world,record.recipientId), sect=sectAt(world,record.sectId);
    const closure=closeReason(record,recipient);
    if(closure){
      record.status='closed';record.closure=closure;record.closedTick=world.tick;
      events.push(event(world,record,'closed','退居俸养终止','原受领条件已经不再成立；此前记录保留，不新生未到期款。'));
      continue;
    }
    if(record.status==='offered'){
      if(world.tick>=record.expiresTick){record.status='expired';record.closedTick=world.tick;}
      continue;
    }
    const accepted=record.acceptedTick;
    if(accepted===undefined||!recipient)continue;
    const dueTick=accepted+record.periods.length+1;
    if(dueTick!==world.tick||record.periods.length>=SECT_STIPEND_PERIODS)continue;
    const signer=personAt(world,authorityId(record));
    const reason:SectStipendPeriod['reason']=!sect||!titled(world,sect,record.siteId)?'title_unavailable':
      !leader(world,signer,sect,record.siteId,world.tick)?'authority_absent':
      !present(world,recipient,sect.id,record.siteId,world.tick)?'recipient_absent':
      !hasAvailableTreasury(world,sect)?'treasury_short':
      !Number.isFinite(recipient.spiritStones)||recipient.spiritStones<0||
      recipient.spiritStones+SECT_STIPEND_AMOUNT>1_000_000_000?'recipient_capacity':undefined;
    const period:SectStipendPeriod={dueTick,settledTick:world.tick,dueAmount:SECT_STIPEND_AMOUNT,
      paidAmount:reason?0:SECT_STIPEND_AMOUNT,status:reason?'unpaid':'paid',
      ...(signer&&sect&&leader(world,signer,sect,record.siteId,world.tick)?{authorityId:signer.id}:{}),...(reason?{reason}:{})};
    if(!reason&&sect&&signer){
      sect.spiritStones-=SECT_STIPEND_AMOUNT;recipient.spiritStones+=SECT_STIPEND_AMOUNT;
      recordResourceFlow(world,{kind:'transfer',mechanism:'sect_stipend',refId:record.id,reason:'stipend_payment',
        good:'stone',amount:SECT_STIPEND_AMOUNT,from:flowSect(sect.id),to:flowActor(recipient.id),
        visibility:{kind:'participants',actorIds:[signer.id,recipient.id]}});
    }
    record.periods.push(period);
    events.push(event(world,record,`period-${dueTick}`,reason?'本期俸养未实兑':'本期俸养已实兑',
      reason?'本期未实付；不追欠，不补记公库或个人财物。':'公库实际划付十二枚灵石给本人；不是晋升或追加奖赏。'));
    if(record.periods.length===SECT_STIPEND_PERIODS){record.status='completed';record.closedTick=world.tick;}
  }
  return events;
}

export function projectSectStipends(world:WorldState,viewer?:Cultivator) {
  if(!viewer||!world.cultivators.includes(viewer))return [];
  return world.sectStipends.stipends.flatMap(record=>{
    const sect=sectAt(world,record.sectId);
    if(viewer.id!==record.recipientId&&viewer.id!==record.sponsorId&&viewer.id!==authorityId(record)&&
        !record.handoffs.some(row=>row.fromId===viewer.id||row.toId===viewer.id)&&
        !(sect&&record.status==='active'&&adoptedSuccession(world,record,viewer,sect,world.tick)))return [];
    return [{id:record.id,sectId:record.sectId,siteId:record.siteId,status:record.status,role:viewer.id===record.recipientId?'recipient' as const:'authority' as const,
      offeredTick:record.offeredTick,expiresTick:record.expiresTick,acceptedTick:record.acceptedTick,closedTick:record.closedTick,
      closure:record.closure,earnedServiceTick:record.service.servedTick,retiredTick:record.service.retiredTick,
      handoffs:record.handoffs.map(({successionTick,adoptedTick})=>({successionTick,adoptedTick})),
      periods:record.periods.map(({authorityId:_,...period})=>period)}];
  });
}

export function projectLocalSectStipendStatus(world:WorldState,viewer?:Cultivator):
  {siteId:string;paid:number;unpaid:number}|undefined {
  if(!viewer)return undefined;
  const sect=viewer.sectId&&sectAt(world,viewer.sectId);
  if(!sect||!titled(world,sect,sect.headquartersId)||
      !present(world,viewer,sect.id,sect.headquartersId,world.tick))return undefined;
  const periods=projectSectStipends(world,viewer).filter(row=>row.siteId===sect.headquartersId)
    .flatMap(row=>row.periods.filter(period=>period.dueTick===world.tick));
  if(periods.length===0)return undefined;
  const paid=periods.filter(row=>row.status==='paid').length;
  return {siteId:sect.headquartersId,paid,unpaid:periods.length-paid};
}
