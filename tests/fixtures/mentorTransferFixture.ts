import {expect} from 'vitest';
import {createInitialWorld} from '../../src/data/initialWorld';
import {resolveMentorTransferAction} from '../../src/engine/mentorTransferEngine';
import {maintainMentorship,resolveMentorshipAction} from '../../src/engine/mentorshipEngine';
import {authorTechnique,gainMastery} from '../../src/engine/techniqueEngine';
import type {LLMDecisionPayload,MentorTransferMove,WorldState} from '../../src/types/world';

const payload=(chosenAction:LLMDecisionPayload['chosenAction'],extra:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'按原功法续学',...extra});
export const move=(mentorTransferMove:MentorTransferMove,extra:Partial<LLMDecisionPayload>={})=>payload('MENTOR_TRANSFER',{mentorTransferMove,...extra});
export const next=(world:WorldState)=>{world.tick++;world.month=world.month%12+1;maintainMentorship(world);};

export function priorActualMentorship(){
  const world=createInitialWorld(91257);
  world.tick=20;world.month=7;
  const sect=world.sects[0],old=world.cultivators.find(row=>row.id===sect.leaderId)!;
  const [student,teacher,outsider]=world.cultivators.filter(row=>!world.sects.some(group=>group.leaderId===row.id));
  for(const actor of [old,student,teacher]){
    actor.sectId=sect.id;actor.locationId=sect.headquartersId;actor.alive=true;actor.hp=actor.maxHp;actor.age=38;
    actor.lifespan=120;actor.guardAssignment=undefined;actor.tribulation=undefined;actor.currentAction='REST';
  }
  old.realm='元婴';old.techniqueMastery=94;
  expect(authorTechnique(old,world)).not.toBeNull();
  gainMastery(old,40);
  student.techniqueMastery=10;
  teacher.technique={...old.technique};teacher.techniqueMastery=90;teacher.sectRank='长老';
  next(world);
  expect(resolveMentorshipAction(world,old,payload('TEACH',{targetCultivatorId:student.id}),()=>.99)).not.toBeNull();
  const source=world.mentorship.offers[0];
  next(world);
  expect(resolveMentorshipAction(world,student,payload('ACCEPT_TUITION',{targetTuitionId:source.id}),()=>.99)).not.toBeNull();
  return {world,sect,old,student,teacher,outsider,source};
}

export function offeredTransfer(){
  const f=priorActualMentorship(),{world,student,teacher,old}=f;
  expect(resolveMentorTransferAction(world,student,move('end',{targetOldMentorId:old.id}))).toBeNull();
  next(world);
  expect(resolveMentorTransferAction(world,student,move('end',{targetOldMentorId:old.id}))).not.toBeNull();
  const release=world.mentorTransfers.releases[0];
  expect(release.sourceTuitionId).toBe(f.source.id);
  expect(resolveMentorTransferAction(world,teacher,move('offer',{targetMentorReleaseId:release.id}))).toBeNull();
  next(world);
  expect(resolveMentorTransferAction(world,old,move('offer',{targetMentorReleaseId:release.id}))).toBeNull();
  expect(resolveMentorTransferAction(world,teacher,move('offer',{targetMentorReleaseId:release.id}))).not.toBeNull();
  const transfer=world.mentorTransfers.transfers[0];
  return {...f,release,transfer,target:{targetMentorTransferId:transfer.id}};
}
