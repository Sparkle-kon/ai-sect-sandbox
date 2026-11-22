import {describe,expect,it} from 'vitest';
import {activeHeartDemonAftermath,availableHeartDemonRecovery,heartDemonRecoveryEventId,
  projectHeartDemonAftermath} from '../src/engine/heartDemonAftermathEngine';
import {queueGuidedHeartDemonChoice} from '../src/engine/heartDemonEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {actualNativeHeartFrame,trialActor,trialTurn} from './heartDemonNativeFixture';

const roundTrip=(world:WorldState)=>decodeEraWorldSave(encodeEraWorldSave(world));
describe('native survivor aftermath and deliberate quiet recovery',()=>{
  it('captures only real completed survivor outcomes in three exact siblings, not the opened flashback',()=>{
    const {frame,trial}=actualNativeHeartFrame();
    const actor=trialActor(frame);
    expect(actor.heartDemonAftermath).toBeUndefined();
    for(const [choice,qi] of [['sever',8],['wrath',12],['face',4]] as const){
      const completed=trialTurn(queueGuidedHeartDemonChoice(frame,actor.id,trial.id,choice)),owner=trialActor(completed);
      const row=owner.heartDemonAftermath;
      expect(row).toMatchObject({trialId:trial.id,resolvedTick:completed.tick,endsTick:completed.tick+6,choice,outcome:'passed'});
      expect(Object.keys(row!).sort()).toEqual(['choice','endsTick','outcome','resolvedTick','resultEventId','siteId','trialId']);
      expect(activeHeartDemonAftermath(completed,owner)).toBeUndefined();
      expect(activeHeartDemonAftermath(completed,owner,completed.tick+1)).toBe(row);
      expect(activeHeartDemonAftermath(completed,owner,completed.tick+6)).toBe(row);
      expect(activeHeartDemonAftermath(completed,owner,completed.tick+7)).toBeUndefined();
      expect(projectHeartDemonAftermath(completed,owner)).toMatchObject({status:'active',qiCost:qi});
      expect(projectHeartDemonAftermath(completed,completed.cultivators[1],owner)).toBeUndefined();
      expect(projectHeartDemonAftermath(completed,{...owner})).toBeUndefined();
      expect(encodeEraWorldSave(roundTrip(completed))).toBe(encodeEraWorldSave(completed));
    }
    expect(actor.heartDemonAftermath).toBeUndefined();
  });

  it('keeps survived backlash distinct and pays the exact marked REST once, unlike ordinary healing',()=>{
    const {frame,trial}=actualNativeHeartFrame();
    const actor=trialActor(frame);
    actor.personality='刚正';actor.techniqueMastery=0;actor.karma=-100;trial.pressure=100;
    const failed=trialTurn(queueGuidedHeartDemonChoice(frame,actor.id,trial.id,'wrath'));
    const owner=trialActor(failed);
    expect(owner).toMatchObject({alive:true,heartDemonAftermath:{choice:'wrath',outcome:'failed'}});
    expect(projectHeartDemonAftermath(failed,owner)).toMatchObject({qiCost:16});
    const option=availableHeartDemonRecovery(failed,owner,failed.tick+1);
    expect(option).toEqual({action:'REST',targetHeartDemonAftermathId:trial.id});
    const quiet=trialTurn(failed);
    expect(trialActor(quiet).heartDemonAftermath?.recovery).toBeUndefined();
    expect(trialActor(quiet).hp).toBeGreaterThan(owner.hp);
    const healed=trialTurn(roundTrip(failed),{chosenAction:'REST',targetHeartDemonAftermathId:trial.id,innerMonologue:'静坐收心。'});
    const settled=trialActor(healed);
    const receipt=heartDemonRecoveryEventId(trial.id,healed.tick);
    expect(settled.qiProgress).toBe(owner.qiProgress-16);
    expect(settled.hp).toBe(owner.hp);
    expect(settled.heartDemonAftermath?.recovery).toEqual({tick:healed.tick,siteId:settled.locationId,qiBefore:owner.qiProgress,qiPaid:16,eventId:receipt});
    expect(healed.events.filter(row=>row.id===receipt)).toEqual([expect.objectContaining({witnessScope:'participants',actorIds:[owner.id]})]);
    expect(availableHeartDemonRecovery(healed,settled,healed.tick+1)).toBeUndefined();
    expect(activeHeartDemonAftermath(healed,settled)).toBeUndefined();
    expect(encodeEraWorldSave(roundTrip(healed))).toBe(encodeEraWorldSave(healed));
    const malformed=structuredClone(healed);
    trialActor(malformed).heartDemonAftermath!.recovery!.qiPaid=4;
    expect(()=>roundTrip(malformed)).toThrow(/heartDemonAftermath\.recovery/);
    const publicCopy=structuredClone(healed);
    delete publicCopy.events.find(row=>row.id===receipt)!.witnessScope;
    expect(()=>roundTrip(publicCopy)).toThrow(/heartDemonAftermath\.privateReceipt/);
  });
});
