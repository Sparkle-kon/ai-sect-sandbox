import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {applyAnnotation} from '../src/engine/annotationsEngine';
import {possessAvatar,queueAvatarOrder,resolveAvatarInteraction} from '../src/engine/avatarEngine';
import {freezeColdHistory} from '../src/engine/coldHistoryEngine';
import {availableCouncilPlans,resolveCouncil} from '../src/engine/councilEngine';
import {buildConfirmedShareSave,inspectShareSavePrivacy,prepareShareSavePrivacy,SHARE_SAVE_REDACTED_TEXT} from '../src/engine/shareSavePrivacy';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {createTimeline,forkTimeline,readTimelineHead} from '../src/engine/timelineEngine';
import {executeGodIntervention} from '../src/engine/worldEngine';
import {workshopCapacityFixture} from './fixtures/workshopCapacityFixture';
import type {ChronicleAnchor,ChronicleChapter,WorldState} from '../src/types/world';

const whisper='霜桥内语甲乙';
const note='只供本人标注的云影';
const message='戒中单独叮咛甲乙';
const aside='模型给出的小说旁白甲乙';
const branchLabel='未公开的手写分支名';
const dialogueText='史牍真实对话逐字甲乙';

function fundedPrivateSnapshot(){
  const f=workshopCapacityFixture();
  let privateWorld=executeGodIntervention(f.world,{type:'WHISPER_MIND',targetCultivatorId:f.payer,whisperText:whisper});
  const origin=civicLikeSite(privateWorld,f.payer);
  const outcome=applyAnnotation(privateWorld,f.payer,{kind:'add_note',target:{kind:'site',locationId:origin},text:note});
  if(!outcome.ok)throw new Error('fixture could not register private note');
  privateWorld=outcome.world;
  expect(resolveAvatarInteraction(privateWorld,{mode:'ring',intent:'guide',targetCultivatorId:f.payer,message},()=>0,aside)).not.toBeNull();
  expect(possessAvatar(privateWorld,f.payer)).toBe(true);
  expect(queueAvatarOrder(privateWorld,'REST')).toBe(true);
  return {...f,world:privateWorld};
}
function civicLikeSite(world:WorldState,id:string){
  return world.cultivators.find(actor=>actor.id===id)!.locationId;
}
function historicalChapter(world:WorldState,chapterNumber:number){
  const actor=world.cultivators[0],startTick=(chapterNumber-1)*12+1,endTick=chapterNumber*12;
  const fact:ChronicleAnchor={id:`strict-chronicle-fact-${chapterNumber}`,tick:endTick-1,year:1001+chapterNumber,month:11,
    title:'仍保留的公开事实',description:'世界公开描述 保留原有内容',category:'diplomacy',actorIds:[actor.id],locationId:actor.locationId,
    dialogue:{kind:'sect_diplomacy',source:'llm',turns:[{speakerId:actor.id,speakerName:actor.name,text:dialogueText}]}};
  const chapter:ChronicleChapter={id:`chapter-${startTick}-${endTick}`,chapterNumber,startTick,endTick,title:'历史章标题',
    body:`公开演义重复了本章对话：${dialogueText}`,anchors:[fact],source:'utility',
    biographies:[{actorId:actor.id,name:actor.name,realm:actor.realm,anchorIds:[fact.id]}]};
  return chapter;
}

describe('count-only shared world preflight and separately confirmed exact redaction',()=>{
  it('covers actual private notes, whisper replicas and avatar transcript without changing funded custody or pending order',()=>{
    const {world,orderId}=fundedPrivateSnapshot();
    const before=encodeWorldSave(world);
    expect(before).toContain(whisper);
    expect(before).toContain(note);
    expect(before).toContain(message);
    expect(before).toContain(aside);
    const ordinary=inspectShareSavePrivacy(world);
    const preview=prepareShareSavePrivacy(world);
    expect(preview).toMatchObject({status:'ready',protectedStateVerified:true,branchLabels:'not_exported',
      counts:{privateNotes:1,avatarTranscriptFields:3},protectedCounts:{avatarBound:true,avatarOrderPending:true}});
    expect(preview.counts).toEqual(ordinary.counts);
    expect(preview.counts.whisperMemoryFields).toBeGreaterThanOrEqual(1);
    expect(preview.counts.participantEventFields).toBeGreaterThanOrEqual(2);
    expect(preview.originalBytes).toBe(new TextEncoder().encode(before).byteLength);
    for(const secret of [whisper,note,message,aside])expect(JSON.stringify(preview)).not.toContain(secret);
    expect(buildConfirmedShareSave(world,{...preview})).toBeUndefined();
    const saved=buildConfirmedShareSave(world,preview)!;
    expect(saved.bytes).toBe(new TextEncoder().encode(saved.json).byteLength);
    expect(saved.bytes).toBe(preview.redactedBytes);
    for(const secret of [whisper,note,message,aside])expect(saved.json).not.toContain(secret);
    const exported=decodeWorldSave(saved.json);
    expect(exported.workshops.orders.find(row=>row.id===orderId)).toEqual(world.workshops.orders.find(row=>row.id===orderId));
    expect(exported.resourceFlow).toEqual(world.resourceFlow);
    expect(exported.furnaceReservations).toEqual(world.furnaceReservations);
    expect(exported.playerAvatar.pendingOrder).toEqual(world.playerAvatar.pendingOrder);
    expect(exported.playerAvatar.possessedId).toBe(world.playerAvatar.possessedId);
    const raw=world.playerAvatar.transcript[0];
    expect(exported.playerAvatar.transcript[0]).toEqual({...raw,message:SHARE_SAVE_REDACTED_TEXT,
      reply:SHARE_SAVE_REDACTED_TEXT,effect:SHARE_SAVE_REDACTED_TEXT});
    expect(exported.annotations).toEqual({...world.annotations,notes:[]});
    expect(encodeWorldSave(world)).toEqual(before);
    expect(buildConfirmedShareSave(world,preview)).toBeUndefined();
  });

  it('redacts structured dialogue in each hot and cold container and political free text, with no branch label leakage',()=>{
    const world=createInitialWorld(919);
    world.tick=210;world.month=1;
    const first=historicalChapter(world,1),later=historicalChapter(world,2);
    world.chronicleArchive.chapters=[later];
    world.coldHistory=freezeColdHistory({chapters:[first],droppedChapters:0});
    world.chronicleArchive.anchors=[{...historicalChapter(world,3).anchors[0],tick:world.tick-1}];
    world.events=[{...historicalChapter(world,4).anchors[0]}];
    const sect=world.sects.find(row=>row.id==='sect-danxia')!;
    const leader=world.cultivators.find(row=>row.id===sect.leaderId)!;
    const party=world.cultivators.filter(row=>row.sectId===sect.id);
    const [elder1,elder2,candidate]=party.filter(row=>row.id!==leader.id);
    for(const actor of party){
      actor.locationId=sect.headquartersId;
      actor.pills.foundation=0;
      actor.tribulation=undefined;
    }
    elder1.sectRank=elder2.sectRank='长老';
    candidate.sectRank='外门弟子';
    candidate.realm='练气';
    leader.pills.foundation=1;
    const plan=availableCouncilPlans(world,sect.id).find(row=>row.proposal.kind==='allocate_pill')!;
    expect(plan).toBeDefined();
    expect(resolveCouncil(world,plan,plan.voterIds.map(voterId=>({voterId,vote:'abstain',reason:dialogueText,opening:dialogueText})))).not.toBeNull();
    const timeline=forkTimeline(createTimeline(world),world.tick,{type:'SPAWN_TREASURE',targetLocationId:world.locations[0].id},branchLabel);
    expect(timeline.branches.some(row=>row.label===branchLabel)).toBe(true);
    const exact=readTimelineHead(timeline)!;
    const before=encodeWorldSave(exact),review=prepareShareSavePrivacy(exact);
    expect(review).toMatchObject({status:'ready',counts:{eventDialogueBlocks:1,archiveDialogueBlocks:3,chapterProseFields:2}});
    expect(review.counts.councilDialogueFields).toBeGreaterThan(0);
    const saved=buildConfirmedShareSave(exact,review)!;
    expect(saved.json).not.toContain(branchLabel);
    expect(saved.json).not.toContain(dialogueText);
    const safe=decodeWorldSave(saved.json);
    expect(safe.coldHistory.chapters[0]).toMatchObject({id:first.id,body:SHARE_SAVE_REDACTED_TEXT,biographies:first.biographies});
    expect(safe.coldHistory.chapters[0].anchors[0]).not.toHaveProperty('dialogue');
    expect(safe.councils[0]).toMatchObject({voterIds:exact.councils[0].voterIds,status:exact.councils[0].status,tally:exact.councils[0].tally});
    expect(safe.councils[0].ballots.map(({reason})=>reason)).toEqual(exact.councils[0].ballots.map(()=>SHARE_SAVE_REDACTED_TEXT));
    expect(encodeWorldSave(exact)).toEqual(before);
  });

  it('does not treat a changed or malformed source as approved even if byte length or tick still match',()=>{
    const {world,orderId}=fundedPrivateSnapshot();
    const approval=prepareShareSavePrivacy(world);
    expect(buildConfirmedShareSave(structuredClone(world),approval)).toBeUndefined();
    world.annotations.notes[0].text='只供本人标注的竹影';
    expect(new TextEncoder().encode(encodeWorldSave(world)).byteLength).toBe(approval.originalBytes);
    expect(buildConfirmedShareSave(world,approval)).toBeUndefined();
    world.workshops.orders.find(row=>row.id===orderId)!.escrowStones++;
    const result=prepareShareSavePrivacy(world);
    expect(result).toMatchObject({status:'invalid_source',redactedBytes:null,protectedStateVerified:false});
    expect(buildConfirmedShareSave(world,result)).toBeUndefined();
  });
});
