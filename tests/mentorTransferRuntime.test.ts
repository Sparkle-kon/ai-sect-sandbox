import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {requestCultivatorLLMDecision} from '../src/engine/llmBrain';
import {llmScheduler} from '../src/engine/llmScheduler';
import {availableMentorTransferActions} from '../src/engine/mentorTransferEngine';
import {availableMentorshipActions,mentorshipBudgetRemaining} from '../src/engine/mentorshipEngine';
import {authorTechnique,gainMastery} from '../src/engine/techniqueEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMConfig,LLMDecisionPayload,MentorTransferMove,WorldState} from '../src/types/world';

const config:LLMConfig={enabled:true,apiBaseUrl:'https://provider.invalid/v1',apiKey:'fixture',model:'test-only'};
const payload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'按原本和实际到场行事。',...fields});
const move=(mentorTransferMove:MentorTransferMove,fields:Partial<LLMDecisionPayload>)=>
  payload('MENTOR_TRANSFER',{mentorTransferMove,...fields});
const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const advance=(world:WorldState,orders:Record<string,LLMDecisionPayload>={},utility:readonly string[]=[])=>advanceWorldTick(world,{
  ...Object.fromEntries(world.cultivators.filter(({id})=>!utility.includes(id)).map(({id})=>[id,payload('REST')])),...orders,
},()=>.99);
const nativeBudget=(world:WorldState,teacherId:string)=>mentorshipBudgetRemaining(person(world,teacherId),world);
const providerReply=(value:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}));

function priorNativeTuition(){
  const setup=createInitialWorld(91257);
  setup.tick=20;setup.month=7;
  const sect=setup.sects[0];
  const old=person(setup,sect.leaderId!);
  const [student,teacher,outsider]=setup.cultivators.filter(row=>!setup.sects.some(group=>group.leaderId===row.id));
  for(const actor of [old,student,teacher]){
    actor.sectId=sect.id;actor.locationId=sect.headquartersId;actor.alive=true;actor.hp=actor.maxHp;actor.age=38;
    actor.lifespan=120;actor.guardAssignment=undefined;actor.tribulation=undefined;actor.currentAction='REST';
  }
  old.realm='元婴';old.techniqueMastery=94;
  expect(authorTechnique(old,setup)).not.toBeNull();
  gainMastery(old,40);
  student.techniqueMastery=10;student.personality='刚正';
  teacher.technique={...old.technique};teacher.techniqueMastery=90;teacher.sectRank='长老';
  teacher.realm='金丹';teacher.contribution=105;
  outsider.name=teacher.name;
  const invite=advance(setup,{[old.id]:payload('TEACH',{targetCultivatorId:student.id})});
  const offer=invite.mentorship.offers.find(row=>row.mentorId===old.id&&row.studentId===student.id)!;
  expect(offer.status).toBe('pending');
  expect(nativeBudget(invite,old.id)).toBe(1);
  const world=advance(invite,{[student.id]:payload('ACCEPT_TUITION',{targetTuitionId:offer.id})});
  expect(world.mentorship.offers.find(row=>row.id===offer.id)?.status).toBe('accepted');
  expect(world.mentorship.lineage.find(row=>row.studentId===student.id)?.lessons).toBe(1);
  return {world,studentId:student.id,teacherId:teacher.id,oldId:old.id,outsiderId:outsider.id,tuitionId:offer.id};
}
function offeredNativeTransfer(){
  const f=priorNativeTuition(),{world,studentId,teacherId,oldId}=f;
  const ended=advance(world,{[studentId]:move('end',{targetOldMentorId:oldId})});
  const release=ended.mentorTransfers.releases.find(row=>row.studentId===studentId)!;
  expect(release?.sourceTuitionId).toBe(f.tuitionId);
  expect(availableMentorshipActions(person(ended,oldId),ended).some(row=>row.action==='TEACH'&&row.targetCultivatorId===studentId)).toBe(false);
  const offered=advance(ended,{[teacherId]:move('offer',{targetMentorReleaseId:release.id})});
  const transfer=offered.mentorTransfers.transfers.find(row=>row.studentId===studentId)!;
  expect(transfer?.status).toBe('offered');
  expect(nativeBudget(offered,teacherId)).toBe(2);
  return {...f,beforeEnd:world,world:offered,transferId:transfer.id};
}

beforeEach(()=>llmScheduler.resetTickBudget());
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('voluntary transfer through real turns and the same bounded decision authority',()=>{
  it('uses actual Utility acceptance and later independent signatures; one extra lesson never rewrites the old training',()=>{
    const f=offeredNativeTransfer(),{world,studentId,teacherId,transferId}=f;
    const previousInstruction=structuredClone(world.mentorship.lineage);
    const previousTechnique=structuredClone(person(world,studentId).technique);
    const previousRank=person(world,studentId).sectRank;
    const oldAccepted=structuredClone(world.mentorship.offers.find(row=>row.id===f.tuitionId));
    expect(availableMentorTransferActions(person(world,studentId),world)).toEqual([]);
    const accepted=advance(world,{},[studentId]);
    const response=accepted.mentorTransfers.transfers.find(row=>row.id===transferId)!;
    expect(response).toMatchObject({status:'accepted',acceptTick:accepted.tick,periodTick:accepted.tick+1});
    expect(nativeBudget(accepted,teacherId)).toBe(2);
    expect(person(accepted,studentId).techniqueMastery).toBe(person(world,studentId).techniqueMastery);
    const before=person(accepted,studentId).techniqueMastery;

    const held=advance(accepted,{},[studentId,teacherId]);
    const lesson=held.mentorTransfers.transfers.find(row=>row.id===transferId)!;
    expect(lesson).toMatchObject({status:'held',teachTick:held.tick,attendTick:held.tick,
      lesson:{tick:held.tick,masteryBefore:before,masteryAfter:before+1,instructionSpent:1}});
    expect(nativeBudget(held,teacherId)).toBe(1);
    expect(person(held,studentId).techniqueMastery).toBe(before+1);
    expect(person(held,studentId).technique).toEqual(previousTechnique);
    expect(person(held,studentId).sectRank).toBe(previousRank);
    expect(held.mentorship.lineage).toEqual(previousInstruction);
    expect(held.mentorship.offers.find(row=>row.id===f.tuitionId)).toEqual(oldAccepted);
    expect(held.apprenticeCohorts).toEqual(world.apprenticeCohorts);
    const repeat=advance(held,{[teacherId]:move('teach',{targetMentorTransferId:transferId}),
      [studentId]:move('attend',{targetMentorTransferId:transferId})});
    expect(repeat.mentorTransfers.transfers.find(row=>row.id===transferId)).toEqual(lesson);
    expect(nativeBudget(repeat,teacherId)).toBe(2);
  });

  it('accepts only a dated exact mock DTO without spoofed keys, and a model acceptance still cannot replace the other signature',async()=>{
    const f=offeredNativeTransfer(),{world,studentId,teacherId,outsiderId,transferId}=f;
    const student=person(world,studentId), outsider=person(world,outsiderId);
    const exact=move('accept',{targetMentorTransferId:transferId});
    const mock=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>providerReply(exact));
    vi.stubGlobal('fetch',mock);
    const initial=JSON.stringify(world),requestTick=world.tick+1;
    await expect(requestCultivatorLLMDecision(student,world,config,world.tick)).resolves.toBeUndefined();
    await expect(requestCultivatorLLMDecision(outsider,world,config,requestTick)).resolves.toBeUndefined();
    const acceptedFromModel=await requestCultivatorLLMDecision(student,world,config,requestTick);
    expect(acceptedFromModel).toEqual(exact);
    const sent=JSON.parse(String(mock.mock.calls.at(-1)?.[1]?.body)) as {messages:{content:string}[]};
    const line=sent.messages[1].content.split('\n').find(value=>value.includes('续结师承只可原样复制'))!;
    expect(line).toContain('"targetMentorTransferId":"'+transferId+'"');
    expect(line).not.toContain(person(world,teacherId).name);
    expect(line).not.toContain(f.tuitionId);
    expect(line).not.toContain(person(world,studentId).technique.name);
    for(const malicious of [
      {...exact,targetMentorTransferId:transferId+'-wrong'},
      {...exact,targetOldMentorId:f.oldId},
      {...exact,masteryAfter:100,rank:'掌门',instructionSpent:2},
      {...exact,mentorTransferMove:'attend'},
    ]){
      mock.mockResolvedValueOnce(providerReply(malicious));
      await expect(requestCultivatorLLMDecision(student,world,config,requestTick)).resolves.toBeUndefined();
    }
    expect(JSON.stringify(world)).toBe(initial);
    expect(mock).toHaveBeenCalledTimes(7);
    const accepted=advance(world,{[studentId]:acceptedFromModel!}), before=person(accepted,studentId).techniqueMastery;
    const noAttendance=advance(accepted,{[teacherId]:move('teach',{targetMentorTransferId:transferId})});
    const lost=noAttendance.mentorTransfers.transfers.find(row=>row.id===transferId)!;
    expect(lost).toMatchObject({status:'expired',reason:'absent_signature'});
    expect(lost.lesson).toBeUndefined();
    expect(nativeBudget(noAttendance,teacherId)).toBe(2);
    expect(person(noAttendance,studentId).techniqueMastery).toBe(before);
    expect(noAttendance.mentorship.lineage).toEqual(world.mentorship.lineage);
  });
});
