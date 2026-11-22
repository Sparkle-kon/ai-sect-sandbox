import { describe,expect,it } from 'vitest';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { projectGuidedHeartDemon, queueGuidedHeartDemonChoice, releaseGuidedHeartDemon } from '../src/engine/heartDemonEngine';
import { decodeEraWorldSave,encodeEraWorldSave } from '../src/engine/storageEngine';
import type { WorldState } from '../src/types/world';
import { actualNativeHeartFrame,focusTrial,trialActor,trialTurn } from './heartDemonNativeFixture';

function strict(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}

describe('native heart-demon theatre completes only through the actual trial',()=>{
  it('holds a genuinely sealed choice across later months and save; a queued answer settles once then opens destiny',()=>{
    const {initial,opening,frame,trial}=actualNativeHeartFrame();
    const scene=trial.heartDemon!;
    expect(trial.heartGuide).toMatchObject({actorId:scene.actorId,trialId:trial.id,grantedTick:opening.tick,
      bindingGeneration:initial.playerAvatar.switchAvailableTick,originalPossessionUntilTick:initial.playerAvatar.possessionUntilTick});
    expect(frame.events).toContainEqual(expect.objectContaining({id:scene.finalWaveEventId,tick:frame.tick,actorIds:[scene.actorId]}));
    expect(projectGuidedHeartDemon(frame)).toBeDefined();
    const held=trialTurn(strict(frame));
    expect(held.tick).toBe(frame.tick+1);
    expect(trialActor(held).tribulation).toEqual(trial);
    expect(trialActor(held).destinyTraits).toBeUndefined();
    expect(trialActor(held).hp).toBe(trialActor(frame).hp);
    expect(queueGuidedHeartDemonChoice(held,scene.actorId,'stale-other-trial','face')).toBe(held);
    const queued=queueGuidedHeartDemonChoice(held,scene.actorId,trial.id,'face');
    expect(queued.tick).toBe(held.tick);
    expect(trialActor(held).tribulation?.heartDemon?.queued).toBeUndefined();
    expect(trialActor(queued).tribulation?.heartDemon?.queued).toEqual({choice:'face',queuedTick:held.tick});
    expect(queueGuidedHeartDemonChoice(queued,scene.actorId,trial.id,'wrath')).toBe(queued);
    const passed=trialTurn(queued);
    expect(encodeEraWorldSave(trialTurn(strict(queued)))).toBe(encodeEraWorldSave(passed));
    const actor=trialActor(passed);
    expect(actor).toMatchObject({realm:'金丹',realmStage:1,tribulation:{stage:'passed',resolvedTick:passed.tick}});
    expect(actor.tribulation?.heartDemon?.result).toMatchObject({choice:'face',origin:'player',outcome:'passed',resolvedTick:passed.tick});
    expect(actor.destinyTraits?.pending).toMatchObject({realm:'金丹',openedTick:passed.tick,
      sourceEventId:`evt-${passed.tick}-${actor.id}-tribulation-passed`});
    const later=trialTurn(passed);
    expect(trialActor(later).tribulation?.heartDemon?.result).toEqual(actor.tribulation?.heartDemon?.result);
  });

  it('relinquishes protection with no synthetic result or cost, then leaves the actual next turn to the cultivator',()=>{
    const {frame,trial}=actualNativeHeartFrame();
    const original=trialActor(frame),released=releaseGuidedHeartDemon(frame,original.id,trial.id);
    expect(released).not.toBe(frame);
    expect(released.tick).toBe(frame.tick);
    const now=trialActor(released);
    expect([now.hp,now.karma,now.techniqueMastery,now.realm]).toEqual([original.hp,original.karma,original.techniqueMastery,original.realm]);
    expect(now.tribulation?.heartDemon).toMatchObject({releasedTick:frame.tick});
    expect(now.tribulation?.heartDemon?.result).toBeUndefined();
    expect(projectGuidedHeartDemon(released)).toBeUndefined();
    const after=trialTurn(strict(released));
    expect(trialActor(after).tribulation?.heartDemon?.result).toMatchObject({origin:'utility',resolvedTick:after.tick});
  });

  it('keeps a legacy pre-armed-save trial on its original uninterrupted path',()=>{
    const {lastLightning}=actualNativeHeartFrame();
    // Explicit migration fixture: optional fields absent, as in a prior build's in-flight trial.
    const legacy=structuredClone(lastLightning);
    const trial=trialActor(legacy).tribulation!;
    delete trial.heartTheatreArmed;
    delete trial.heartGuide;
    const heart=trialTurn(strict(legacy),{...focusTrial,tribulationStance:'guard'});
    expect(trialActor(heart).tribulation?.stage).toBe('heart_demon');
    expect(trialActor(heart).tribulation?.heartDemon).toBeUndefined();
    const completed=trialTurn(heart,focusTrial);
    expect(trialActor(completed).tribulation?.stage).toBe('passed');
    expect(trialActor(completed).tribulation?.heartDemon).toBeUndefined();
  });

  it('cancels a queued answer on a true native lethal meteor without playing out a choice',()=>{
    const {frame,trial}=actualNativeHeartFrame();
    const site=frame.locations.find(row=>row.id===trial.heartDemon?.siteId)!;
    let ruined=queueGuidedHeartDemonChoice(frame,trialActor(frame).id,trial.id,'wrath');
    expect(trialActor(ruined).tribulation?.heartDemon?.queued?.choice).toBe('wrath');
    for(let blow=0;blow<6&&trialActor(ruined).alive;blow++)ruined=applyMapBrush(ruined,'meteor',[site]);
    const dead=trialActor(ruined);
    expect(dead).toMatchObject({alive:false,hp:0,realm:'筑基',tribulation:{stage:'failed',resolvedTick:ruined.tick}});
    expect(dead.tribulation?.heartDemon).toMatchObject({cancelledTick:ruined.tick});
    expect(dead.tribulation?.heartDemon?.queued).toBeUndefined();
    expect(dead.tribulation?.heartDemon?.result).toBeUndefined();
    expect(dead.destinyTraits).toBeUndefined();
    const restored=strict(ruined);
    expect(projectGuidedHeartDemon(restored)?.frame).toMatchObject({cancelledTick:ruined.tick});
    expect(queueGuidedHeartDemonChoice(restored,dead.id,trial.id,'face')).toBe(restored);
    expect(projectGuidedHeartDemon(trialTurn(restored))).toBeUndefined();
  });

  it('settles all three legitimate choices in independent branches with different actual moral and mastery effects',()=>{
    const {frame,trial}=actualNativeHeartFrame();
    const before=trialActor(frame);
    const actual=(['sever','wrath','face'] as const).map(choice=>{
      const current=strict(frame);
      const queued=queueGuidedHeartDemonChoice(current,before.id,trial.id,choice);
      const world=trialTurn(queued);
      const after=trialActor(world),result=after.tribulation?.heartDemon?.result;
      expect(result).toMatchObject({choice,origin:'player',resolvedTick:world.tick,
        karmaDelta:after.karma-before.karma,masteryDelta:after.techniqueMastery-before.techniqueMastery});
      expect(after.sectId).toBe(before.sectId);
      return [result?.karmaDelta,result?.masteryDelta];
    });
    expect(actual).toEqual([[-2,3],[-7,8],[4,5]]);
    expect(trial.heartDemon?.result).toBeUndefined();
  });
});
