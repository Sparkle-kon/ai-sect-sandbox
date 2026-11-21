import {describe, expect, it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectProtagonistSuccession} from '../src/engine/protagonistSuccession';
import {createTimeline, forkTimeline, readTimelineHead, readTimelineSnapshot, recordTimelineWorld, selectTimelineBranch}
  from '../src/engine/timelineEngine';
import {projectWitnessedPersonalStory} from '../src/engine/witnessedPersonalStory';
import {advanceWorldTick, executeGodIntervention} from '../src/engine/worldEngine';
import type {LLMDecisionPayload, WorldState} from '../src/types/world';
import {arrivedCourierHandoff, handoffPerson} from './fixtures/courierHandoffFixture';

const quiet=(world:WorldState):Record<string,LLMDecisionPayload>=>Object.fromEntries(world.cultivators.map(({id})=>
  [id,{chosenAction:'REST',innerMonologue:'此回静候。'}]));
const socialize=(id:string):LLMDecisionPayload=>({chosenAction:'SOCIALIZE',targetCultivatorId:id,
  spokenLine:'不把这段暧昧字句直接添作有署名的心声。',innerMonologue:'实际在场。'});
const relocate=(id:string):LLMDecisionPayload=>({chosenAction:'EXPLORE',targetLocationId:id,innerMonologue:'照实跨站。'});
const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const sceneIDs=(world:WorldState,id:string)=>projectWitnessedPersonalStory(world,id)?.scenes.map(row=>row.eventId)??[];

function nativePersonalScene(){
  const base=createInitialWorld(764);
  const [speaker,target,onlooker,late]=base.cultivators;
  for(const row of [speaker,target,onlooker,late]){
    row.locationId='loc-market';
    row.hp=row.maxHp;
    row.age=28;
    row.lifespan=120;
  }
  onlooker.name='闻静';
  late.name='闻静'; // No identity joining, even with indistinguishable names.
  late.locationId='loc-taixu';
  const actions={...quiet(base),[speaker.id]:socialize(target.id),[late.id]:relocate('loc-market')};
  const world=advanceWorldTick(base,actions);
  const source=world.events.find(row=>row.id==='evt-'+world.tick+'-'+speaker.id+'-social')!;
  expect(source).toBeDefined();
  return {base,world,source,actions,speakerId:speaker.id,targetId:target.id,onlookerId:onlooker.id,lateId:late.id};
}

describe('witnesses come from authoritative emission time, not later location, rumor or another branch',()=>{
  it('only a settled observer present at the actual action knows it, even if a same-named actor arrives later',()=>{
    const f=nativePersonalScene(),{base,world,source,speakerId,onlookerId,lateId}=f;
    expect(person(world,onlookerId).locationId).toBe(source.locationId);
    expect(person(world,lateId).locationId).toBe(source.locationId); // real EXPLORE happened after action in this same replayable turn
    expect(person(world,onlookerId).name).toBe(person(world,lateId).name);
    expect(projectWitnessedPersonalStory(world,speakerId)?.scenes.find(row=>row.eventId===source.id)?.paragraph).toContain('你在当地');
    expect(projectWitnessedPersonalStory(world,onlookerId)?.scenes.find(row=>row.eventId===source.id)?.paragraph).toContain('你在现场');
    expect(sceneIDs(world,lateId)).not.toContain(source.id);
    expect(projectWitnessedPersonalStory(world,onlookerId,source.tick-1)?.scenes.map(row=>row.eventId)).not.toContain(source.id);
    expect(base.witnessedPersonalStory.scenes).toHaveLength(0);
    const sameTempo=structuredClone(base);
    // Independent generated timeline from the same decisive date and same exact action IDs;
    // the underlying actor's presence differs before the action.
    person(sameTempo,onlookerId).locationId='loc-taixu';
    const alternative=advanceWorldTick(sameTempo,{...f.actions,[onlookerId]:relocate('loc-market')});
    expect(alternative.events.some(row=>row.id===source.id)).toBe(true);
    expect(person(alternative,onlookerId).locationId).toBe('loc-market');
    expect(sceneIDs(alternative,onlookerId)).not.toContain(source.id);
    expect(sceneIDs(world,onlookerId)).toContain(source.id);
  });

  it('uses the actual fork’s retained witness state even when matching action IDs reappear at the same later tick',()=>{
    const f=nativePersonalScene(),{base,speakerId,targetId,onlookerId}=f;
    const foundation=createTimeline(base);
    const before=advanceWorldTick(base,quiet(base));
    const main=advanceWorldTick(before,{...quiet(before),[speakerId]:socialize(targetId)});
    let timeline=recordTimelineWorld(recordTimelineWorld(foundation,before),main);
    timeline=forkTimeline(timeline,base.tick,{type:'WHISPER_MIND',targetCultivatorId:onlookerId,
      whisperText:'这句独属另一条支线的私语'});
    const otherId=timeline.activeBranchId;
    const branchStart=readTimelineHead(timeline)!;
    const moved=advanceWorldTick(branchStart,{...quiet(branchStart),[onlookerId]:relocate('loc-taixu')});
    expect(person(moved,onlookerId).locationId).toBe('loc-taixu');
    timeline=recordTimelineWorld(timeline,moved);
    const branch=advanceWorldTick(moved,{...quiet(moved),[speakerId]:socialize(targetId),
      [onlookerId]:relocate('loc-market')});
    timeline=recordTimelineWorld(timeline,branch);
    const source=main.events.find(row=>row.id.endsWith('-'+speakerId+'-social'))!;
    expect(branch.events.some(row=>row.id===source.id)).toBe(true);
    expect(person(branch,onlookerId).locationId).toBe(person(main,onlookerId).locationId);
    expect(sceneIDs(readTimelineHead(timeline)!,onlookerId)).not.toContain(source.id);
    expect(sceneIDs(readTimelineSnapshot(timeline,moved.tick,otherId)!,onlookerId)).not.toContain(source.id);
    timeline=selectTimelineBranch(timeline,'main');
    expect(sceneIDs(readTimelineHead(timeline)!,onlookerId)).toContain(source.id);
    expect(sceneIDs(readTimelineSnapshot(timeline,before.tick)!,onlookerId)).not.toContain(source.id);
    expect(sceneIDs(readTimelineHead(selectTimelineBranch(timeline,otherId))!,onlookerId)).not.toContain(source.id);
  });

  it('lets a once valid observation age out of live readout without altering a genuine prior snapshot',()=>{
    const f=nativePersonalScene(),{source,onlookerId}=f;
    const history=createTimeline(f.world);
    let current=f.world;
    for(let count=0;count<13;count++)current=advanceWorldTick(current,quiet(current),()=>.99);
    expect(current.events.some(row=>row.id===source.id)).toBe(true);
    expect(current.witnessedPersonalStory.scenes.some(row=>row.eventId===source.id)).toBe(false);
    expect(sceneIDs(current,onlookerId)).not.toContain(source.id);
    expect(sceneIDs(readTimelineHead(history)!,onlookerId)).toContain(source.id);
  });

  it('announces no story if the canonical public source vanished, conflicts, is private, or belongs to a dead viewer',()=>{
    const f=nativePersonalScene(),{world,source,onlookerId,lateId}=f;
    const baseline=JSON.stringify(world);
    const originalLead=projectProtagonistSuccession(world);
    const beforeRNG=world.random.state;
    const original=projectWitnessedPersonalStory(world,onlookerId);
    expect(original?.scenes.some(row=>row.eventId===source.id)).toBe(true);
    expect(JSON.stringify(original)).not.toContain('暧昧字句');
    expect(JSON.stringify(original)).not.toContain(lateId);
    expect(world.random.state).toBe(beforeRNG);
    expect(projectProtagonistSuccession(world)).toEqual(originalLead);
    expect(JSON.stringify(world)).toBe(baseline);

    for(const mutation of ['missing','duplicate','private','wrong_players','future','expired','dead'] as const){
      const changed=structuredClone(world);
      const row=changed.events.find(item=>item.id===source.id)!;
      if(mutation==='missing') changed.events=changed.events.filter(item=>item.id!==source.id);
      else if(mutation==='duplicate') changed.events.push({...row,title:'不同来源发生冲突'});
      else if(mutation==='private') row.witnessScope='participants';
      else if(mutation==='wrong_players') row.actorIds=[f.speakerId,lateId];
      else if(mutation==='future') row.tick=changed.tick+1;
      else if(mutation==='expired') changed.tick+=13;
      else {person(changed,onlookerId).alive=false;person(changed,onlookerId).hp=0;}
      const unchanged=JSON.stringify(changed);
      expect(sceneIDs(changed,onlookerId)).not.toContain(source.id);
      expect(JSON.stringify(changed)).toBe(unchanged);
    }

    const privateScene=executeGodIntervention(world,{type:'WHISPER_MIND',targetCultivatorId:onlookerId,whisperText:'本句是私密天道传音'});
    expect(JSON.stringify(projectWitnessedPersonalStory(privateScene,onlookerId))).not.toContain('本句是私密天道传音');
    expect(sceneIDs(privateScene,onlookerId)).not.toContain(privateScene.events[0].id);
    // A local second-hand rumor carrying the original event ID is not a native signed witness.
    const rumor=structuredClone(world);
    const old=person(rumor,onlookerId).rumors.find(row=>row.originEventId===source.id)!;
    expect(old).toBeDefined();
    person(rumor,lateId).rumors.push({...old,provenance:'conversation',hops:1,confidence:84});
    expect(sceneIDs(rumor,lateId)).not.toContain(source.id);
  });

  it('will not credit a real moving courier whose old nominal origin still equals the scene site',()=>{
    const f=arrivedCourierHandoff(),{world,originalId,originId}=f;
    const [speaker,target]=world.cultivators.filter(row=>row.id!==originalId&&row.id!==f.newId&&row.id!==f.recipientId);
    for(const actor of [speaker,target])actor.locationId=originId;
    expect(handoffPerson(world,originalId).locationId).toBe(originId);
    const next=advanceWorldTick(world,{...quiet(world),[speaker.id]:socialize(target.id)},()=>.9);
    const source=next.events.find(row=>row.id==='evt-'+next.tick+'-'+speaker.id+'-social')!;
    expect(source.locationId).toBe(originId);
    expect(sceneIDs(next,speaker.id)).toContain(source.id);
    expect(sceneIDs(next,originalId)).not.toContain(source.id);
  });
});
