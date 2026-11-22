import {describe,expect,it} from 'vitest';
import {possessAvatar} from '../src/engine/avatarEngine';
import {heartDemonResultEventId,queueGuidedHeartDemonChoice,releaseGuidedHeartDemon} from '../src/engine/heartDemonEngine';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {actualNativeHeartFrame,focusTrial,trialActor,trialTurn} from './heartDemonNativeFixture';

const selected=(world:WorldState)=>{
  const trial=trialActor(world).tribulation;
  if(!trial?.heartDemon)throw Error('Expected actual heart frame');
  return {actor:trialActor(world),trial,frame:trial.heartDemon};
};
const reopen=(world:WorldState)=>{
  const raw=encodeWorldSave(world),restored=decodeWorldSave(raw);
  expect(encodeWorldSave(restored)).toBe(raw);
  return restored;
};

describe('strict native heart-demon storage',()=>{
  it('does not retrofit old in-flight tribulations and preserves their byte-identical optional absence',()=>{
    const {opening}=actualNativeHeartFrame();
    let legacy=structuredClone(opening);
    const trial=trialActor(legacy).tribulation!;
    delete trial.heartGuide;
    delete trial.heartTheatreArmed;
    const raw=encodeWorldSave(legacy);
    expect(raw).not.toContain('"heartTheatreArmed"');
    expect(raw).not.toContain('"heartDemon"');
    expect(encodeWorldSave(reopen(legacy))).toBe(raw);
    for(let i=0;i<3;i++)legacy=trialTurn(legacy,{...focusTrial,tribulationStance:'guard'});
    expect(trialActor(legacy).tribulation?.stage).toBe('heart_demon');
    expect(trialActor(reopen(legacy)).tribulation?.heartDemon).toBeUndefined();
    expect(trialActor(reopen(trialTurn(legacy,focusTrial))).tribulation?.stage).toBe('passed');
  });

  it('accepts an older unanswered guide and never converts released or changed possession into a fake player opinion',()=>{
    const {frame:world,trial}=actualNativeHeartFrame();
    const unanswered=reopen(trialTurn(trialTurn(world,focusTrial),focusTrial));
    expect(selected(unanswered).frame.openedTick).toBe(world.tick);
    expect(selected(unanswered).frame.result).toBeUndefined();
    const quit=releaseGuidedHeartDemon(unanswered,trialActor(unanswered).id,trial.id);
    expect(selected(reopen(quit)).frame.releasedTick).toBe(unanswered.tick);
    expect(selected(reopen(trialTurn(quit,focusTrial))).frame.result?.origin).toBe('utility');

    const queued=queueGuidedHeartDemonChoice(unanswered,trialActor(unanswered).id,trial.id,'face');
    const changed=structuredClone(queued);
    const newcomer=changed.cultivators.find(person=>person.id!==trialActor(changed).id&&person.alive);
    expect(newcomer&&possessAvatar(changed,newcomer.id)).toBe(true);
    const settled=trialTurn(reopen(changed),focusTrial);
    const raw=encodeEraWorldSave(settled);
    expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
    expect(selected(settled).frame.result).toMatchObject({choice:'face',origin:'player',resolvedTick:queued.tick+1});
  });

  it('rejects arbitrary private material, future steps, and mismatched final-wave or participant provenance',()=>{
    const {frame:world}=actualNativeHeartFrame();
    const edit=(modify:(world:WorldState)=>void)=>{
      const copy=structuredClone(world);modify(copy);
      return ()=>encodeWorldSave(copy);
    };
    expect(edit(w=>{Object.assign(selected(w).frame.evidence,{rawQuote:'隐秘原话'});})).toThrow(/heartDemon.evidence.rawQuote/);
    expect(edit(w=>{selected(w).frame.finalWaveEventId+='-counterfeit';})).toThrow(/heartDemon.frame/);
    expect(edit(w=>{const {frame}=selected(w);w.events.find(row=>row.id===frame.finalWaveEventId)!.witnessScope='participants';}))
      .toThrow(/heartDemon.wave/);
    expect(edit(w=>{selected(w).trial.heartGuide!.actorId='npc-2';})).toThrow(/heartDemon.guide/);
    expect(edit(w=>{selected(w).frame.queued={choice:'face',queuedTick:w.tick+1};})).toThrow(/heartDemon.queue/);
    expect(edit(w=>{selected(w).frame.evidence={kind:'bond',otherActorId:trialActor(w).id,role:'血仇',
      source:{kind:'scene',eventId:`evt-1-${trialActor(w).id}-duel`,tick:1}};})).toThrow(/heartDemon.bond/);
  });

  it('ties a named illusion to a real prior same-site native scene and rejects substitute people',()=>{
    const {initial}=actualNativeHeartFrame(false);
    const discoverer=trialActor(initial);
    const peer=initial.cultivators.find(other=>other.alive&&other.hp>0&&other.sectId!==discoverer.sectId&&other.id!==discoverer.id&&
      !initial.relationships.some(edge=>edge.fromId===discoverer.id&&edge.toId===other.id||edge.toId===discoverer.id&&edge.fromId===other.id));
    if(!peer)throw Error('Expected a different living original character');
    peer.locationId=discoverer.locationId; // Controlled initial co-presence; the scene and bond are not authored.
    const meeting=trialTurn(initial,{chosenAction:'SOCIALIZE',targetCultivatorId:peer.id,innerMonologue:'当面论道。'});
    const source=meeting.events.find(row=>row.id===`evt-${meeting.tick}-${discoverer.id}-social`);
    expect(source?.actorIds).toEqual([discoverer.id,peer.id]);
    expect(meeting.relationships).toContainEqual(expect.objectContaining({fromId:discoverer.id,toId:peer.id,type:'挚友'}));
    expect(meeting.witnessedPersonalStory.scenes).toContainEqual(expect.objectContaining({eventId:source?.id,tick:meeting.tick}));
    expect(possessAvatar(meeting,discoverer.id)).toBe(true);
    let opened=trialTurn(meeting,{chosenAction:'BREAKTHROUGH',innerMonologue:'本月真实引劫。'});
    for(let step=0;step<3;step++)opened=trialTurn(opened,{...focusTrial,tribulationStance:'guard'});
    const proof=selected(reopen(opened)).frame.evidence;
    expect(proof).toMatchObject({kind:'bond',otherActorId:peer.id,role:'挚友',source:{kind:'scene',eventId:source?.id,tick:meeting.tick}});
    const changed=structuredClone(opened);
    const raw=changed.events.find(row=>row.id===source?.id);
    const substitute=changed.cultivators.find(row=>row.id!==discoverer.id&&row.id!==peer.id);
    if(!raw||!substitute)throw Error('Expected current raw proof and a distinct outsider');
    raw.actorIds=[discoverer.id,substitute.id];
    expect(()=>encodeWorldSave(changed)).toThrow(/heartDemon.bond/);
  });

  it('keeps genuine same-turn exterior death distinct from choice failure and withholds private results from public indexing',()=>{
    const {frame:world,trial}=actualNativeHeartFrame();
    const queued=queueGuidedHeartDemonChoice(world,trialActor(world).id,trial.id,'face');
    const site=world.locations.find(row=>row.id===trialActor(world).locationId);
    if(!site)throw Error('Expected the actual trial site');
    let aboutToDie=queued;
    for(let i=0;i<8&&trialActor(aboutToDie).alive;i++)aboutToDie=applyMapBrush(aboutToDie,'meteor',[site]);
    expect(trialActor(aboutToDie).alive).toBe(false);
    const cancelled=selected(reopen(aboutToDie)).frame;
    expect(cancelled.cancelledTick).toBe(world.tick);
    expect(cancelled.result).toBeUndefined();
    expect(cancelled.queued).toBeUndefined();
    expect(aboutToDie.events.some(row=>row.id===heartDemonResultEventId(cancelled.id))).toBe(false);

    const legitimate=trialTurn(queued,focusTrial);
    const changed=structuredClone(legitimate);
    const result=selected(changed).frame.result;
    if(!result)throw Error('Actual accepted player result required');
    const event=changed.events.find(row=>row.id===heartDemonResultEventId(selected(changed).frame.id));
    if(!event)throw Error('Actual auxiliary private receipt required');
    const {witnessScope,...copy}=event;
    expect(witnessScope).toBe('participants');
    result.masteryDelta=40;
    expect(()=>encodeWorldSave(changed)).toThrow(/heartDemon.result/);
    result.masteryDelta=selected(legitimate).frame.result!.masteryDelta;
    delete event.witnessScope;
    expect(()=>encodeWorldSave(changed)).toThrow(/heartDemon.privateReceipt/);
    event.witnessScope='participants';
    changed.chronicleArchive.anchors.push(copy);
    expect(()=>encodeWorldSave(changed)).toThrow(/heartDemon.publicArchive/);
  });
});
