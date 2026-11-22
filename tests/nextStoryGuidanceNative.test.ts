import {describe,expect,it} from 'vitest';
import {projectNextStoryGuidance} from '../src/engine/nextStoryGuidance';
import {activeAvatar} from '../src/engine/avatarEngine';
import {queueGuidedHeartDemonChoice,releaseGuidedHeartDemon} from '../src/engine/heartDemonEngine';
import {actualNativeHeartFrame,trialActor} from './heartDemonNativeFixture';
import {actualTournament,actualTournamentOpen,actualTournamentSignup,tournamentActor,tournamentFrame} from './tournamentArenaNativeFixture';
import {actualNativeDungeonGate,dungeonActor,dungeonMove,dungeonOutsider} from './expeditionDungeonNativeFixture';

describe('one truthful current hint inside the existing story card',()=>{
  it('follows the real guided heart trial even after avatar expiry, and never guides a released or disputed source',()=>{
    const {lastLightning,frame,trial}=actualNativeHeartFrame(),owner=trialActor(frame);
    expect(activeAvatar(frame)).toBeUndefined();
    expect(projectNextStoryGuidance(lastLightning,trialActor(lastLightning))).toBeUndefined();
    expect(projectNextStoryGuidance(frame,owner)).toMatchObject({kind:'heart',title:'心魔当前',line:expect.stringContaining('先选')});
    expect(projectNextStoryGuidance(frame,{...owner})).toBeUndefined();
    const other=frame.cultivators.find(row=>row.id==='npc-3')!;
    expect(projectNextStoryGuidance(frame,other)).toBeUndefined();
    const queued=queueGuidedHeartDemonChoice(frame,owner.id,trial.id,'face');
    expect(projectNextStoryGuidance(queued,trialActor(queued))?.line).toContain('下一月才见实果');
    const released=releaseGuidedHeartDemon(frame,owner.id,trial.id);
    expect(projectNextStoryGuidance(released,trialActor(released))).toBeUndefined();
    const poisoned=structuredClone(frame);
    const original=poisoned.events.find(row=>row.id===trial.heartDemon?.finalWaveEventId)!;
    poisoned.events.push({...original,witnessScope:'participants'});
    expect(projectNextStoryGuidance(poisoned,trialActor(poisoned))).toBeUndefined();
    expect(Object.keys(projectNextStoryGuidance(frame,owner)!)).toEqual(['kind','title','line']);
  });

  it('only guides the actual admitted explorer, and changes wording with the verified current room and options',()=>{
    const {opening,enrolled,entered}=actualNativeDungeonGate();
    expect(projectNextStoryGuidance(opening,dungeonActor(opening))).toBeUndefined();
    expect(projectNextStoryGuidance(enrolled,dungeonActor(enrolled))).toBeUndefined();
    expect(projectNextStoryGuidance(entered,dungeonActor(entered))).toMatchObject({kind:'dungeon',line:expect.stringContaining('入内')});
    expect(projectNextStoryGuidance(entered,dungeonActor(entered,dungeonOutsider))).toBeUndefined();
    const garden=dungeonMove(entered,'enter','garden');
    expect(projectNextStoryGuidance(garden,dungeonActor(garden))?.line).toContain('先采');
    const hall=dungeonMove(garden,'gather','garden');
    expect(projectNextStoryGuidance(hall,dungeonActor(hall))?.line).toContain('开阵');
    const exited=dungeonMove(garden,'retreat','garden');
    expect(projectNextStoryGuidance(exited,dungeonActor(exited))).toBeUndefined();
  });

  it('requires a real public signup window or an actually commenced local round, not duplicate or pre-expired paperwork',()=>{
    const open=actualTournamentOpen();
    const viewerId='npc-6',viewer=tournamentActor(open,viewerId);
    expect(projectNextStoryGuidance(open,viewer)).toMatchObject({kind:'tournament',title:'大比尚在报名'});
    const removed=structuredClone(open);
    removed.events=removed.events.filter(row=>row.id!==`evt-${actualTournament(open).startedTick}-${actualTournament(open).id}-open`);
    expect(projectNextStoryGuidance(removed,tournamentActor(removed,viewerId))).toBeUndefined();
    const signed=actualTournamentSignup(open);
    expect(projectNextStoryGuidance(signed,tournamentActor(signed,viewerId))).toBeUndefined();
    const closing=tournamentFrame(signed);
    expect(projectNextStoryGuidance(closing,tournamentActor(closing,viewerId))).toBeUndefined();
    const commenced=tournamentFrame(closing);
    expect(projectNextStoryGuidance(commenced,tournamentActor(commenced,viewerId))).toMatchObject({kind:'tournament',title:'大比下一轮'});
    const disputed=structuredClone(commenced);
    const stamp=disputed.events.find(row=>row.id===`evt-${commenced.tick}-${actualTournament(commenced).id}-commence`)!;
    disputed.events.push({...stamp});
    expect(projectNextStoryGuidance(disputed,tournamentActor(disputed,viewerId))).toBeUndefined();
  });
});
