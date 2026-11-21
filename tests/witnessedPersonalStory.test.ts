import {describe,expect,it} from 'vitest';
import {advanceWitnessedPersonalStory,projectWitnessedPersonalStory,WITNESSED_PERSONAL_STORY_TICKS} from '../src/engine/witnessedPersonalStory';
import {createTimeline,forkTimeline,readTimelineHead} from '../src/engine/timelineEngine';
import {dialoguePerson} from './fixtures/publicDialogueFixture';
import {nativeCourierHandoffRoute} from './fixtures/courierHandoffFixture';
import {playWitnessedPersonalScene,witnessedPersonalStoryFixture} from './fixtures/witnessedPersonalStoryFixture';

describe('strict firsthand personal scenes',()=>{
  it('records actual settled local observers and own role but no original quote, thought, ambient rumor or names',()=>{
    const f=witnessedPersonalStoryFixture(),{world,event}=playWitnessedPersonalScene(f.world,f.actorId,f.firstId);
    const read=projectWitnessedPersonalStory(world,f.observerId);
    const witness=world.witnessedPersonalStory.scenes.find(row=>row.eventId===event.id);
    expect(witness?.witnessIds).toContain(f.observerId);
    expect(witness?.witnessIds).not.toContain(f.remoteId);
    expect(read?.scenes).toEqual([expect.objectContaining({eventId:event.id,tick:event.tick,paragraph:'你在现场看见两位修士坐而论道。'})]);
    expect(JSON.stringify(read)).not.toContain(event.description);
    expect(JSON.stringify(read)).not.toContain('旁人不应读出深藏的心思');
    expect(JSON.stringify(read)).not.toContain(dialoguePerson(world,f.firstId).name);
    expect(projectWitnessedPersonalStory(world,f.actorId)?.scenes[0].paragraph).toBe('你在当地与另一位修士坐而论道。');
    expect(projectWitnessedPersonalStory(world,f.remoteId)?.scenes).toEqual([]);
    expect(projectWitnessedPersonalStory(world)).toBeUndefined();
  });

  it('ignores a genuine same-turn arrival after the native scene emitted, while keeping an actor who left after seeing it',()=>{
    const f=witnessedPersonalStoryFixture();
    const first=playWitnessedPersonalScene(f.world,f.actorId,f.firstId,{
      [f.remoteId]:{chosenAction:'EXPLORE',targetLocationId:'loc-market',innerMonologue:'入坊。'},
    });
    expect(dialoguePerson(first.world,f.remoteId).locationId).toBe('loc-market');
    expect(projectWitnessedPersonalStory(first.world,f.remoteId)?.scenes).toEqual([]);
    const leaving=playWitnessedPersonalScene(f.world,f.actorId,f.firstId,{
      [f.observerId]:{chosenAction:'EXPLORE',targetLocationId:f.otherSiteId,innerMonologue:'出坊。'},
    });
    expect(dialoguePerson(leaving.world,f.observerId).locationId).toBe(f.otherSiteId);
    expect(projectWitnessedPersonalStory(leaving.world,f.observerId)?.scenes).toHaveLength(1);
  });

  it('never treats an actually moving native courier as physically present at the stale origin',()=>{
    const f=nativeCourierHandoffRoute();
    const partner=dialoguePerson(f.world,f.outsiderId);
    partner.locationId=f.originId;
    const {world,event}=playWitnessedPersonalScene(f.world,f.senderId,partner.id);
    expect(world.couriers.dispatches[0].status).toBe('in_transit');
    expect(dialoguePerson(world,f.originalId).locationId).toBe(f.originId);
    expect(projectWitnessedPersonalStory(world,f.senderId)?.scenes[0].eventId).toBe(event.id);
    expect(projectWitnessedPersonalStory(world,f.originalId)?.scenes).toEqual([]);
  });

  it('never resurrects a private, absent, conflicting or age-expired native proof, even with the old personal attestation',()=>{
    const f=witnessedPersonalStoryFixture();
    const {world,event}=playWitnessedPersonalScene(f.world,f.actorId,f.firstId);
    expect(projectWitnessedPersonalStory(world,f.observerId,event.tick-1)?.scenes).toEqual([]);
    const missing=structuredClone(world);
    missing.events=missing.events.filter(row=>row.id!==event.id);
    expect(projectWitnessedPersonalStory(missing,f.observerId)?.scenes).toEqual([]);
    const hidden=structuredClone(world);
    hidden.events.find(row=>row.id===event.id)!.witnessScope='participants';
    expect(projectWitnessedPersonalStory(hidden,f.observerId)?.scenes).toEqual([]);
    const duplicate=structuredClone(world);
    duplicate.events.push({...event,locationId:f.otherSiteId});
    expect(projectWitnessedPersonalStory(duplicate,f.observerId)?.scenes).toEqual([]);
    world.tick=event.tick+WITNESSED_PERSONAL_STORY_TICKS+1;
    expect(projectWitnessedPersonalStory(world,f.observerId)?.scenes).toEqual([]);
    advanceWitnessedPersonalStory(world);
    expect(world.witnessedPersonalStory.scenes).toEqual([]);
    dialoguePerson(world,f.observerId).alive=false;
    expect(projectWitnessedPersonalStory(world,f.observerId)).toBeUndefined();
  });

  it('isolates the recorded exact local witness set across same-turn native branch scenes',()=>{
    const f=witnessedPersonalStoryFixture();
    const timeline=forkTimeline(createTimeline(f.world),f.world.tick,{
      type:'WHISPER_MIND',targetCultivatorId:f.observerId,whisperText:'此令不能出现在公开亲历。',
    });
    const original=readTimelineHead(timeline,'main')!, branch=readTimelineHead(timeline)!;
    dialoguePerson(branch,f.observerId).locationId=f.otherSiteId;
    const a=playWitnessedPersonalScene(original,f.actorId,f.firstId);
    const b=playWitnessedPersonalScene(branch,f.actorId,f.firstId);
    expect(a.event.id).toBe(b.event.id);
    expect(projectWitnessedPersonalStory(a.world,f.observerId)?.scenes).toHaveLength(1);
    expect(projectWitnessedPersonalStory(b.world,f.observerId)?.scenes).toEqual([]);
  });
});
