import type {Cultivator,LLMDecisionPayload,MentorRelease,MentorTransfer,MentorTransferState,Technique,WorldEvent,WorldState} from '../types/world';
import {hasCohortStaffedDuty} from './apprenticeCohortEngine';
import {mentorshipBudgetRemaining,spendMentorshipBudget} from './mentorshipEngine';
import {courierActedThisTick} from './sealedCourierEngine';
import {hasDueObservatoryDuty} from './staffedDutyEngine';

export const MENTOR_TRANSFER_OFFER_TICKS=4;
export const MENTOR_TRANSFER_MASTERY_GAIN=1;
export const createMentorTransferState=():MentorTransferState=>({releases:[],transfers:[],nextId:1});
export type MentorTransferOption={action:'MENTOR_TRANSFER'}&(
  | {mentorTransferMove:'end';targetOldMentorId:string;targetMentorReleaseId?:never;targetMentorTransferId?:never}
  | {mentorTransferMove:'offer';targetOldMentorId?:never;targetMentorReleaseId:string;targetMentorTransferId?:never}
  | {mentorTransferMove:'accept'|'decline'|'teach'|'attend';targetOldMentorId?:never;targetMentorReleaseId?:never;targetMentorTransferId:string}
);
const live=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0;
const actorAt=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id);
const exactOriginal=(a:Technique,b:Technique)=>!!a.id&&a.id===b.id&&a.name===b.name&&a.spiritRoot===b.spiritRoot&&
  a.authorId===b.authorId&&a.createdTick===b.createdTick;
const registered=(world:WorldState,id:string|undefined)=>world.scriptures.originals.find(row=>row.id===id&&row.technique.id===id)?.technique;
const senior=(actor:Cultivator)=>actor.sectRank==='掌门'||actor.sectRank==='长老'||actor.sectRank==='太上长老'||actor.sectRank==='真传弟子';
const safeSite=(world:WorldState,siteId:string)=>world.locations.some(row=>row.id===siteId&&row.type!=='abyss'&&row.type!=='secret_realm');
const currentState=(row:MentorTransfer)=>row.status==='offered'||row.status==='accepted';
function settled(world:WorldState,actor:Cultivator,siteId:string,tick:number){
  const id=actor.id;
  return actor.locationId===siteId&&actor.tribulation?.stage!=='lightning'&&actor.tribulation?.stage!=='heart_demon'&&
    !(actor.guardAssignment&&(actor.guardAssignment.expiresTick>tick)&&actor.guardAssignment.locationId!==siteId)&&
    !(tick===world.tick&&courierActedThisTick(world,actor))&&
    !world.couriers.dispatches.some(row=>row.courierId===id&&(row.status==='in_transit'||row.status==='returning'))&&
    !world.pilgrimages.journeys.some(row=>(row.organizerId===id||row.companionId===id)&&
      (row.status==='active'||row.startedTick===tick||row.lastMovedTick===tick))&&
    !world.escorts.contracts.some(row=>row.escortId===id&&row.status==='active')&&
    !world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(id))&&
    !world.boundaryReliefs.cases.some(row=>row.incomingId===id&&(row.status==='travelling'||row.status==='returning'))&&
    !world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(id))&&
    !world.occasions.some(row=>(row.status==='running'||row.status==='registration')&&row.participantIds.includes(id)&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(id)))&&
    !world.expeditionRescues.requests.some(row=>(row.explorerId===id||row.rescuerId===id)&&row.supplySpent===1&&
      (row.status==='extracting'||row.status==='interrupted'&&row.pathIndex>0&&!row.arrivedIds?.includes(id)&&
        world.occasions.some(occasion=>occasion.id===row.occasionId&&occasion.status==='running')));
}

/** A retained native paid, completed acceptance of this actual latest historical learned edge. */
export function provenMentorReleaseSource(world:WorldState,studentId:string,oldMentorId?:string){
  const lineage=world.mentorship.lineage.filter(row=>row.studentId===studentId);
  const edge=lineage.length===1?lineage[0]:undefined;
  if(!edge||edge.lessons<1||edge.formedTick>edge.lastLessonTick||edge.studentId===edge.mentorId||
      oldMentorId!==undefined&&edge.mentorId!==oldMentorId)return undefined;
  const original=registered(world,edge.technique.id);
  if(!original||!exactOriginal(edge.technique,original))return undefined;
  const paid=world.mentorship.offers.filter(row=>row.mentorId===edge.mentorId&&row.studentId===studentId&&row.status==='accepted'&&
    row.id===`tuition-${row.createdTick}-${row.mentorId}-${row.studentId}`&&
    row.resolvedTick===edge.lastLessonTick&&row.createdTick<=edge.lastLessonTick&&edge.lastLessonTick<row.expiresTick&&
    exactOriginal(row.technique,original));
  return paid.length===1?{edge,source:paid[0],techniqueId:original.id!}:undefined;
}

function genuineRelease(world:WorldState,row:MentorRelease):boolean{
  const proof=provenMentorReleaseSource(world,row.studentId,row.oldMentorId);
  return !!proof&&row.endedById===row.studentId&&row.endedTick>proof.edge.lastLessonTick&&
    row.formedTick===proof.edge.formedTick&&row.lastLessonTick===proof.edge.lastLessonTick&&row.sourceTuitionId===proof.source.id&&
    row.techniqueId===proof.techniqueId;
}

function eligiblePair(world:WorldState,release:MentorRelease,teacher:Cultivator|undefined,siteId:string,sectId:string,tick:number){
  const student=actorAt(world,release.studentId),original=registered(world,release.techniqueId);
  if(!live(student)||!live(teacher)||!original||!genuineRelease(world,release)||
      teacher.id===release.oldMentorId||teacher.id===student.id||teacher.service?.status==='retired'||!senior(teacher)||
      teacher.sectId!==sectId||student.sectId!==sectId||!Number.isFinite(teacher.techniqueMastery)||
      !Number.isFinite(student.techniqueMastery)||student.techniqueMastery<0||teacher.techniqueMastery>100||
      teacher.techniqueMastery<55||teacher.techniqueMastery-student.techniqueMastery<10||
      !exactOriginal(teacher.technique,original)||!exactOriginal(student.technique,original)||
      !world.sects.some(row=>row.id===sectId&&row.headquartersId===siteId)||
      !world.locations.some(row=>row.id===siteId&&row.type==='sect_hq'&&row.ownerSectId===sectId)||
      !settled(world,student,siteId,tick)||!settled(world,teacher,siteId,tick))return undefined;
  return {teacher,student};
}
const dutyFree=(world:WorldState,actor:Cultivator,siteId:string,tick:number)=>
  !hasDueObservatoryDuty(world,actor,siteId,tick)&&!hasCohortStaffedDuty(world,actor,siteId,tick);

function periodPair(world:WorldState,row:MentorTransfer,tick:number){
  const release=world.mentorTransfers.releases.find(item=>item.id===row.releaseId);
  if(!release||release.studentId!==row.studentId||release.techniqueId!==row.techniqueId)return undefined;
  const pair=eligiblePair(world,release,actorAt(world,row.newMentorId),row.siteId,row.sectId,tick);
  return pair&&dutyFree(world,pair.teacher,row.siteId,tick)&&dutyFree(world,pair.student,row.siteId,tick)?pair:undefined;
}

export function availableMentorTransferActions(actor:Cultivator,world:WorldState,executionTick=world.tick):MentorTransferOption[]{
  if(!live(actor)||!world.cultivators.includes(actor)||(executionTick!==world.tick&&executionTick!==world.tick+1))return [];
  const options:MentorTransferOption[]=[],state=world.mentorTransfers;
  if(safeSite(world,actor.locationId)&&settled(world,actor,actor.locationId,executionTick)&&
      !state.releases.some(row=>row.studentId===actor.id)){
    const proof=provenMentorReleaseSource(world,actor.id);
    if(proof&&proof.edge.lastLessonTick<executionTick)options.push({action:'MENTOR_TRANSFER',mentorTransferMove:'end',targetOldMentorId:proof.edge.mentorId});
  }
  if(senior(actor))for(const release of state.releases){
    if(release.endedTick>=executionTick||state.transfers.some(row=>row.releaseId===release.id&&
        (row.status==='held'||row.status==='accepted'||row.status==='offered'&&executionTick<row.expiresTick))||
        !eligiblePair(world,release,actor,actor.locationId,actor.sectId,executionTick))continue;
    options.push({action:'MENTOR_TRANSFER',mentorTransferMove:'offer',targetMentorReleaseId:release.id});
  }
  for(const row of state.transfers){
    if(!currentState(row)||(row.studentId!==actor.id&&row.newMentorId!==actor.id))continue;
    if(row.status==='offered'&&row.studentId===actor.id&&row.offeredTick<executionTick&&executionTick<row.expiresTick){
      options.push({action:'MENTOR_TRANSFER',mentorTransferMove:'decline',targetMentorTransferId:row.id});
      const parties=new Set([row.studentId,row.newMentorId]);
      const conflict=state.transfers.some(other=>other.status==='accepted'&&other.periodTick===executionTick+1&&
        (parties.has(other.studentId)||parties.has(other.newMentorId)));
      if(!conflict&&periodPair(world,row,executionTick))options.push({action:'MENTOR_TRANSFER',mentorTransferMove:'accept',targetMentorTransferId:row.id});
    }
    if(row.status!=='accepted'||row.periodTick!==executionTick)continue;
    const period=periodPair(world,row,executionTick);
    if(!period||!mentorshipBudgetRemaining(period.teacher,world,executionTick))continue;
    if(row.newMentorId===actor.id&&row.teachTick===undefined)
      options.push({action:'MENTOR_TRANSFER',mentorTransferMove:'teach',targetMentorTransferId:row.id});
    if(row.studentId===actor.id&&row.attendTick===undefined)
      options.push({action:'MENTOR_TRANSFER',mentorTransferMove:'attend',targetMentorTransferId:row.id});
  }
  return options;
}

function event(world:WorldState,id:string,token:string,title:string,description:string,actorIds:string[],locationId?:string):WorldEvent{
  return {id:`evt-${id}-${token}-${world.tick}`,title,description,tick:world.tick,year:world.year,month:world.month,
    actorIds,category:'breakthrough',witnessScope:'participants',...(locationId?{locationId}:{})};
}
export function resolveMentorTransferAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='MENTOR_TRANSFER')return null;
  const keys=new Set(['chosenAction','innerMonologue','spokenLine','mentorTransferMove','targetOldMentorId','targetMentorReleaseId','targetMentorTransferId']);
  if(Object.keys(payload).some(key=>!keys.has(key)))return null;
  const choice=availableMentorTransferActions(actor,world).find(option=>option.mentorTransferMove===payload.mentorTransferMove&&
    option.targetOldMentorId===payload.targetOldMentorId&&option.targetMentorReleaseId===payload.targetMentorReleaseId&&
    option.targetMentorTransferId===payload.targetMentorTransferId);
  if(!choice)return null;
  const state=world.mentorTransfers;
  if(choice.mentorTransferMove==='end'){
    const {edge,source,techniqueId}=provenMentorReleaseSource(world,actor.id,choice.targetOldMentorId)!;
    const row:MentorRelease={id:`mentor-release-${state.nextId++}`,studentId:actor.id,oldMentorId:edge.mentorId,
      sourceTuitionId:source.id,techniqueId,formedTick:edge.formedTick,lastLessonTick:edge.lastLessonTick,endedTick:world.tick,endedById:actor.id};
    state.releases.push(row);
    return event(world,row.id,'ended','原授业约止','今后不再按旧约授业。旧课、已学功法和熟练均保留。',[actor.id,row.oldMentorId],actor.locationId);
  }
  if(choice.mentorTransferMove==='offer'){
    const release=state.releases.find(item=>item.id===choice.targetMentorReleaseId)!;
    const row:MentorTransfer={id:`mentor-transfer-${state.nextId++}`,releaseId:release.id,studentId:release.studentId,
      newMentorId:actor.id,techniqueId:release.techniqueId,sectId:actor.sectId,siteId:actor.locationId,offeredTick:world.tick,
      expiresTick:world.tick+MENTOR_TRANSFER_OFFER_TICKS,status:'offered'};
    state.transfers.push(row);
    return event(world,row.id,'offer','续学邀约待应','只提出按原功法续学。尚未排课或花用教学额度。',[row.studentId,row.newMentorId],row.siteId);
  }
  const row=state.transfers.find(item=>item.id===choice.targetMentorTransferId)!;
  if(choice.mentorTransferMove==='decline'){row.status='declined';row.closedTick=world.tick;}
  else if(choice.mentorTransferMove==='accept'){row.status='accepted';row.acceptTick=world.tick;row.periodTick=world.tick+1;}
  else if(choice.mentorTransferMove==='teach')row.teachTick=world.tick;
  else row.attendTick=world.tick;
  const confirmation=choice.mentorTransferMove==='decline'?'学生谢绝本次邀约。':choice.mentorTransferMove==='accept'?
    '学生应允并排定下期。尚未授课。':'本人签认本期到场，仍待核实另一方与实际教学额度。';
  return event(world,row.id,choice.mentorTransferMove,'续学约签认',confirmation,[row.studentId,row.newMentorId],row.siteId);
}

export function advanceMentorTransfers(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const row of world.mentorTransfers.transfers){
    if(row.status==='offered'&&world.tick>=row.expiresTick){row.status='expired';row.closedTick=world.tick;row.reason='offer_expired';continue;}
    if(row.status!=='accepted'||row.periodTick===undefined||row.periodTick>world.tick)continue;
    row.closedTick=world.tick;
    const pair=row.periodTick===world.tick?periodPair(world,row,world.tick):undefined;
    if(row.teachTick!==world.tick||row.attendTick!==world.tick){row.status='expired';row.reason='absent_signature';continue;}
    if(!pair){row.status='expired';row.reason='unavailable';continue;}
    if(!spendMentorshipBudget(world,pair.teacher)){row.status='expired';row.reason='no_budget';continue;}
    const masteryBefore=pair.student.techniqueMastery;
    pair.student.techniqueMastery=Math.min(100,masteryBefore+MENTOR_TRANSFER_MASTERY_GAIN);
    row.status='held';
    row.lesson={tick:world.tick,masteryBefore,masteryAfter:pair.student.techniqueMastery,instructionSpent:1};
    events.push(event(world,row.id,'held','原功法续学一期','两人确实同堂，实际用去一份教学额度。没有改修功法或变更原师承记录。',
      [row.studentId,row.newMentorId],row.siteId));
  }
  return events;
}

export function projectMentorTransfers(world:WorldState,viewer?:Cultivator){
  if(!live(viewer)||!world.cultivators.includes(viewer))return {releases:[],transfers:[]};
  const owned=world.mentorTransfers.releases.filter(row=>row.studentId===viewer.id||row.oldMentorId===viewer.id);
  const transfers=world.mentorTransfers.transfers.filter(row=>row.studentId===viewer.id||row.newMentorId===viewer.id);
  return {releases:owned.map(row=>({...row})),transfers:transfers.map(row=>({...row,...(row.lesson?{lesson:{...row.lesson}}:{})}))};
}
