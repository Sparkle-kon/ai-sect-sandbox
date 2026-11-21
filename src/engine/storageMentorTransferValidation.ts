import type {MentorTransfer,WorldState} from '../types/world';
import { MENTOR_TRANSFER_OFFER_TICKS, provenMentorReleaseSource } from './mentorTransferEngine';

function rowSequence(value:string,prefix:string):number|undefined{
  if(!value.startsWith(prefix))return undefined;
  const number=Number(value.slice(prefix.length));
  return Number.isSafeInteger(number)&&number>0&&value===prefix+number?number:undefined;
}
function hasSchedule(row:MentorTransfer):boolean{
  return row.acceptTick!==undefined&&row.periodTick===row.acceptTick+1&&
    row.acceptTick>row.offeredTick&&row.acceptTick<row.expiresTick;
}

export function validateMentorTransfers(
  world:WorldState, actors:ReadonlySet<string>, fail:(path:string)=>never,
):void{
  const {releases,transfers,nextId}=world.mentorTransfers;
  const sequence=new Set<number>(), closedStudents=new Set<string>();
  const usage=new Set<string>(), acceptedPeriods=new Set<string>();
  const realHistory=new Map(releases.map(row=>[row.id,row]));
  const sects=new Set(world.sects.map(({id})=>id));
  const sites=new Set(world.locations.map(({id})=>id));
  const claim=(id:string,prefix:string)=>{
    const counter=rowSequence(id,prefix);
    if(counter===undefined||counter>=nextId||sequence.has(counter))return false;
    sequence.add(counter);
    return true;
  };
  if(nextId<1)return fail('mentorTransfers.nextId');
  for(const row of releases){
    const proof=provenMentorReleaseSource(world,row.studentId,row.oldMentorId);
    if(!claim(row.id,'mentor-release-')||closedStudents.has(row.studentId)||!actors.has(row.studentId)||
      !actors.has(row.oldMentorId)||row.studentId!==row.endedById||row.endedTick>world.tick||
      !proof||row.formedTick!==proof.edge.formedTick||row.lastLessonTick!==proof.edge.lastLessonTick||
      row.sourceTuitionId!==proof.source.id||row.techniqueId!==proof.techniqueId||row.lastLessonTick>=row.endedTick)
      return fail('mentorTransfers.releases.source');
    closedStudents.add(row.studentId);
  }
  for(const row of transfers){
    const release=realHistory.get(row.releaseId);
    if(!claim(row.id,'mentor-transfer-')||!release||!actors.has(row.newMentorId)||
      release.studentId!==row.studentId||release.techniqueId!==row.techniqueId||
      row.newMentorId===row.studentId||row.newMentorId===release.oldMentorId||
      release.endedTick>=row.offeredTick||row.offeredTick>world.tick||row.expiresTick!==row.offeredTick+MENTOR_TRANSFER_OFFER_TICKS||
      !sects.has(row.sectId)||!sites.has(row.siteId)||row.closedTick!==undefined&&row.closedTick>world.tick)
      return fail('mentorTransfers.transfers.source');
    if(row.status==='offered'||row.status==='declined'||row.reason==='offer_expired'){
      if(row.acceptTick!==undefined||row.periodTick!==undefined||row.teachTick!==undefined||row.attendTick!==undefined||row.lesson)
        return fail('mentorTransfers.transfers.unaccepted');
      if(row.status==='offered'&&(row.reason!==undefined||row.closedTick!==undefined)||
        row.status==='declined'&&(row.reason!==undefined||row.closedTick===undefined||row.closedTick<=row.offeredTick||row.closedTick>=row.expiresTick)||
        row.reason==='offer_expired'&&(row.status!=='expired'||row.closedTick===undefined||row.closedTick<row.expiresTick))
        return fail('mentorTransfers.transfers.offer');
    }else{
      const {periodTick,teachTick,attendTick,closedTick,lesson}=row;
      if(!hasSchedule(row)||row.acceptTick!>world.tick||periodTick===undefined||
        teachTick!==undefined&&(teachTick!==periodTick||teachTick>world.tick)||
        attendTick!==undefined&&(attendTick!==periodTick||attendTick>world.tick))
        return fail('mentorTransfers.transfers.schedule');
      for(const actor of [row.studentId,row.newMentorId]){
        const key=JSON.stringify([actor,periodTick]);
        if(acceptedPeriods.has(key))return fail('mentorTransfers.transfers.doubleBooking');
        acceptedPeriods.add(key);
      }
      if(row.status==='accepted'&&(closedTick!==undefined||lesson||row.reason!==undefined)||
        row.status==='held'&&(row.reason!==undefined||closedTick!==periodTick||teachTick!==periodTick||attendTick!==periodTick||
          !lesson||lesson.tick!==periodTick||lesson.masteryBefore>90||lesson.masteryAfter!==lesson.masteryBefore+1||lesson.instructionSpent!==1)||
        row.status==='expired'&&(lesson||closedTick===undefined||closedTick<periodTick||
          !row.reason||row.reason==='absent_signature'&&closedTick===periodTick&&teachTick===periodTick&&attendTick===periodTick||
          row.reason!=='absent_signature'&&(teachTick!==periodTick||attendTick!==periodTick)))
        return fail('mentorTransfers.transfers.outcome');
    }
    if(row.status==='accepted'||row.status==='held'||row.status==='offered'&&row.expiresTick>world.tick){
      if(usage.has(row.releaseId))return fail('mentorTransfers.transfers.agreement');
      usage.add(row.releaseId);
    }
  }
  if(sequence.size!==nextId-1)return fail('mentorTransfers.nextId');
}
