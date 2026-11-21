import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {createCampaignJournal,createMemoryCampaignBackend} from '../src/engine/campaignJournal';
import type {CampaignJournalRecord} from '../src/engine/campaignJournal';
import {sealCampaignSource} from '../src/engine/campaignMemento';
import {detectCampaignStop} from '../src/engine/campaignStopCondition';
import {createTimeline} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {CampaignCheckpoint} from '../src/engine/fastForwardCampaignEngine';
import type {WorldState} from '../src/types/world';

const version='a'.repeat(64),updatedVersion='b'.repeat(64);
const step=(world:WorldState)=>advanceWorldTick(world,undefined,undefined,'utility');
const take=(original:WorldState,world:WorldState,requestedTicks:number):CampaignCheckpoint=>({
  startTick:original.tick,requestedTicks,completedTicks:world.tick-original.tick,baseRandomState:original.random.state,
  baseInterventionSequence:original.interventionSequence,world,
});
async function legacySeal(r:CampaignJournalRecord){
  // E1-4 digest order frozen independently of the E1-5 implementation.
  const material=['campaign-journal',1,r.id,r.generation,r.revision,r.status,r.ruleVersion,r.topologySha256,r.sourceTimelineId,r.sourceBranchId,
    [r.source.sha256,r.source.tick,r.source.year,r.source.month],r.baseRandomState,r.baseInterventionSequence,
    [r.target.tick,r.target.year,r.target.month],r.requestedTicks,r.completedTicks,
    r.head?[r.head.sha256,r.head.bytes]:null,r.previousSha256??null,r.committedBranchId??null];
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(material)));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
function november(){
  let source=createInitialWorld(2031);
  for(let n=0;n<10;n++)source=step(source);
  const actor=source.cultivators.find(row=>row.alive&&row.hp>0)!;
  actor.age=actor.lifespan-1;
  return {source,actorId:actor.id,stopCondition:{kind:'actor_died' as const,actorId:actor.id}};
}
const memento=(world:WorldState)=>sealCampaignSource(createTimeline(world),'native-stop-test',world);

describe('persisted native stop condition and exact reached receipt',()=>{
  it('resumes a partial at December and prepares the actually witnessed January death early',async()=>{
    const {source,actorId,stopCondition}=november(),origin=await memento(source);
    const backend=createMemoryCampaignBackend(),old=createCampaignJournal(backend);
    const begin=await old.begin(origin,6,version,{stopCondition});
    const december=step(source),partial=await old.checkpoint(begin,take(source,december,6));
    expect(partial).toMatchObject({stopCondition,status:'pending',completedTicks:1});
    const resumed=createCampaignJournal(backend),before=(await resumed.load())!;
    expect(before.checkpoint.world.month).toBe(12);
    expect(before.record.stopCondition).toEqual(stopCondition);
    expect(before.checkpoint.stopReceipt).toBeUndefined();
    await expect(resumed.claim(before.record,updatedVersion)).rejects.toMatchObject({code:'rule'});
    expect((await resumed.loadSource(before.record)).world.tick).toBe(source.tick);
    const claim=await resumed.claim(before.record,version);
    const january=step(before.checkpoint.world);
    const receipt=detectCampaignStop(stopCondition,before.checkpoint.world,january,january.events)!;
    expect(receipt).toMatchObject({kind:'actor_died',actorId,month:1,tick:13,eventId:`evt-13-${actorId}-oldage`});
    await expect(resumed.checkpoint(claim,take(source,january,6))).rejects.toMatchObject({code:'invalid'});
    await expect(resumed.checkpoint(claim,{...take(source,january,6),stopReceipt:{...receipt,tick:12}})).rejects.toMatchObject({code:'invalid'});
    const ready=await resumed.checkpoint(claim,{...take(source,january,6),stopReceipt:receipt});
    expect(ready).toMatchObject({status:'ready',stopCondition,stopReceipt:receipt,completedTicks:2,requestedTicks:6,
      target:{tick:17,year:source.year+1,month:5}});
    const reloaded=(await old.load())!;
    expect(reloaded.checkpoint.stopReceipt).toEqual(receipt);
    expect(reloaded.checkpoint.world.tick).toBe(13);
    await expect(resumed.checkpoint(ready,take(source,step(january),6))).rejects.toMatchObject({code:'conflict'});
    expect((await resumed.finalize(ready,'branch-1')).stopReceipt).toEqual(receipt);
    expect((await old.load())?.record.stopReceipt).toEqual(receipt);
  });

  it('preserves legacy date-only seal bytes and distinguishes real absence at horizon vs a hit at horizon',async()=>{
    const {source,stopCondition}=november(),origin=await memento(source);
    const december=step(source),january=step(december);
    const dateOnly=createCampaignJournal(createMemoryCampaignBackend());
    const first=await dateOnly.begin(origin,2,version);
    expect(first.seal).toBe(await legacySeal(first));
    const finished=await dateOnly.checkpoint(first,take(source,january,2));
    expect(finished.seal).toBe(await legacySeal(finished));
    expect((await dateOnly.load())?.record.stopCondition).toBeUndefined();

    const survivor=source.cultivators.find(person=>person.id!==stopCondition.actorId&&january.cultivators.some(other=>other.id===person.id&&other.alive))!;
    const noStop=createCampaignJournal(createMemoryCampaignBackend());
    const noStopPlan=await noStop.begin(origin,2,version,{stopCondition:{kind:'actor_died',actorId:survivor.id}});
    const deadline=await noStop.checkpoint(noStopPlan,take(source,january,2));
    expect(deadline.status).toBe('ready');
    expect((await noStop.load())?.checkpoint.stopReceipt).toBeUndefined();

    const hitAtDeadline=createCampaignJournal(createMemoryCampaignBackend());
    const hit=await hitAtDeadline.begin(origin,2,version,{stopCondition});
    const receipt=detectCampaignStop(stopCondition,december,january,january.events)!;
    const due=await hitAtDeadline.checkpoint(hit,{...take(source,january,2),stopReceipt:receipt});
    expect(due.status).toBe('ready');
    expect(due.completedTicks).toBe(due.requestedTicks);
    expect((await hitAtDeadline.load())?.checkpoint.stopReceipt).toEqual(receipt);
  });

  it('refuses forged selection, changed seal fields, fabricated receipts and early no-trigger readiness',async()=>{
    const {source,stopCondition}=november(),origin=await memento(source);
    const backend=createMemoryCampaignBackend(),journal=createCampaignJournal(backend);
    await expect(journal.begin(origin,6,version,{stopCondition:{...stopCondition,actorId:'fake-id'}})).rejects.toMatchObject({code:'invalid'});
    const first=await journal.begin(origin,6,version,{stopCondition});
    const december=step(source);
    const fake={kind:'actor_died' as const,actorId:stopCondition.actorId,tick:december.tick,year:december.year,month:december.month};
    await expect(journal.checkpoint(first,{...take(source,december,6),stopReceipt:fake})).rejects.toMatchObject({code:'invalid'});
    const pending=await journal.checkpoint(first,take(source,december,6));
    await expect(journal.finalize(pending,'branch-1')).rejects.toMatchObject({code:'conflict'});
    const newActor=source.cultivators[1].id;
    const tampered=createCampaignJournal({...backend,read:async()=>({...pending,stopCondition:{...stopCondition,actorId:newActor}})});
    await expect(tampered.load()).rejects.toMatchObject({code:'integrity'});
    const wrongFields=createCampaignJournal({...backend,read:async()=>({...pending,stopCondition:{...stopCondition,sourceLabel:'spoof'}})});
    await expect(wrongFields.load()).rejects.toMatchObject({code:'invalid'});
    expect((await journal.load())?.record.status).toBe('pending');
  });
});
