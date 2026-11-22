import {describe,expect,it} from 'vitest';
import {availableCraftTrainingActions,visibleCraftTraining} from '../src/engine/craftTrainingEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {craftTrainingArtifactId,craftTrainingBlankId,craftTrainingEventId} from '../src/types/craftTraining';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {blankNativeCraftTraining,craftActor,craftAssert,craftChoice,craftDecision,craftFirst,craftKeeper,craftMonth,
  craftProject,craftSecond,craftSite,finishedNativeCraftTraining,offeredNativeCraftTraining} from './craftTrainingNativeFixture';

const holdings=(world:Parameters<typeof craftActor>[0])=>[craftActor(world,craftKeeper).spiritStones,craftActor(world,craftKeeper).herbs.earth_root];
const skill=(world:Parameters<typeof craftActor>[0])=>[craftActor(world,craftFirst).techniqueMastery,craftActor(world,craftSecond).techniqueMastery];
const outcomeItems=(world:Parameters<typeof craftActor>[0])=>world.cultivators.flatMap(actor=>actor.artifacts
  .filter(item=>item.craftTrainingOrigin).map(item=>({actor:actor.id,item})));
const reopen=(world:Parameters<typeof craftActor>[0])=>{
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
};

describe('native joint craft training at Taixu',()=>{
  it('funds only on the second independent consent, then gives the original blank and its artifact uniquely to real work',()=>{
    const {before,offered,first,funded,blank,world,row}=finishedNativeCraftTraining();
    const initialHolding=holdings(before),[stones,roots]=initialHolding;
    expect(holdings(offered)).toEqual(initialHolding);
    expect(holdings(first)).toEqual(initialHolding);
    expect(holdings(funded)).toEqual([stones-55,roots-2]);
    expect(row.traineeIds).toEqual([craftFirst,craftSecond]);
    expect(row.firstJoinedTick).toBe(first.tick);
    expect(row.secondJoinedTick).toBe(funded.tick);
    expect(funded.tick).toBe(first.tick+1);
    expect(blank.tick).toBe(funded.tick+1);
    expect(world.tick).toBe(blank.tick+1);
    expect(craftProject(funded)).toMatchObject({id:row.id,status:'funded',escrowStones:55,escrowRoots:2});
    expect(craftProject(blank)).toMatchObject({id:row.id,status:'blank',escrowStones:27,escrowRoots:1});
    const originalBlank=craftProject(blank)?.blank;
    craftAssert(originalBlank,'There is one numbered physical blank');
    expect(originalBlank.id).toBe(craftTrainingBlankId(row.id));
    expect(row.blank).toEqual(originalBlank);
    expect(row).toMatchObject({status:'completed',escrowStones:0,escrowRoots:0,
      blank:{actorId:craftFirst,tick:blank.tick,stonesUsed:28,rootsUsed:1},
      finish:{actorId:craftSecond,tick:world.tick,blankId:originalBlank.id,stonesUsed:27,rootsUsed:1}});
    expect(row.finish?.artifactId).toBe(craftTrainingArtifactId(row.id));
    for(const [phase,tick,actorId,slot] of [['blank',blank.tick,craftFirst,row.blank?.slot],['finish',world.tick,craftSecond,row.finish?.slot]] as const){
      expect(world.furnaceReservations.uses).toContainEqual(expect.objectContaining({tick,actorId,siteId:craftSite,kind:'forge',slot}));
      expect(world.events.find(event=>event.id===craftTrainingEventId(row.id,tick,phase)))
        .toMatchObject({witnessScope:'participants',actorIds:[actorId]});
    }
    const payments=world.resourceFlow.months.flatMap(month=>month.entries).filter(flow=>flow.refId===row.id);
    expect(payments.map(({tick,reason,good,amount})=>[tick,reason,good,amount])).toEqual([
      [funded.tick,'craft_training_deposit','stone',55],[funded.tick,'craft_training_deposit','earth_root',2],
      [blank.tick,'craft_training_fuel','stone',28],[blank.tick,'craft_training_material','earth_root',1],
      [world.tick,'craft_training_fuel','stone',27],[world.tick,'craft_training_material','earth_root',1],
    ]);
    expect(holdings(world)).toEqual([stones-55,roots-2]);
    expect(skill(blank)).toEqual([skill(funded)[0]+1,skill(funded)[1]]);
    expect(skill(world)).toEqual([skill(funded)[0]+1,skill(funded)[1]+1]);
    expect(outcomeItems(blank)).toEqual([]);
    expect(outcomeItems(world)).toEqual([{actor:craftKeeper,item:expect.objectContaining({id:row.finish?.artifactId,tier:'法器',craftTrainingOrigin:{projectId:row.id,blankId:originalBlank.id,siteId:craftSite,keeperId:craftKeeper,
        firstTraineeId:craftFirst,secondTraineeId:craftSecond,blankTick:blank.tick,finishedTick:world.tick}})}]);
    expect(visibleCraftTraining(world,craftActor(world,'elder-taixu-2'))).toEqual([]);
    for(const id of [craftKeeper,craftFirst,craftSecond]){
      expect(visibleCraftTraining(world,craftActor(world,id))).toEqual([expect.objectContaining({id:row.id})]);
    }
    for(const [id,move] of [[craftFirst,'blank'],[craftSecond,'blank'],[craftFirst,'finish'],[craftKeeper,'finish']] as const){
      expect(availableCraftTrainingActions(craftActor(blank,id),blank,blank.tick+1).some(o=>o.craftTrainingMove===move)).toBe(false);
      const refused=craftMonth(blank,{[id]:craftDecision('CRAFT_TRAINING',{craftTrainingMove:move,targetCraftTrainingId:row.id})});
      expect(outcomeItems(refused)).toEqual([]);
      expect(skill(refused)).toEqual(skill(blank));
      expect(holdings(refused)).toEqual(holdings(blank));
    }
    const restoredBlank=reopen(blank),restoredFinish=reopen(world);
    expect(encodeEraWorldSave(craftMonth(restoredBlank,{[craftSecond]:craftChoice(restoredBlank,craftSecond,'finish')}))).toBe(encodeEraWorldSave(world));
    expect(encodeEraWorldSave(craftMonth(restoredFinish))).toBe(encodeEraWorldSave(craftMonth(world)));
  });

  it('rejects an unrelated offered identity and does not debit or fabricate skill after an actual opt-out',()=>{
    const {before,world,row}=offeredNativeCraftTraining();
    for(const id of [craftKeeper,'elder-taixu-2']){
      expect(availableCraftTrainingActions(craftActor(world,id),world,world.tick+1).some(o=>o.craftTrainingMove==='join')).toBe(false);
      const impersonate=craftMonth(world,{[id]:craftDecision('CRAFT_TRAINING',{craftTrainingMove:'join',targetCraftTrainingId:row.id})});
      expect(craftProject(impersonate)?.firstJoinedTick).toBeUndefined();
      expect(craftProject(impersonate)?.secondJoinedTick).toBeUndefined();
      expect(holdings(impersonate)).toEqual(holdings(before));
    }
    const declines=craftMonth(world,{[craftSecond]:craftChoice(world,craftSecond,'decline')});
    expect(craftProject(declines)?.status).toBe('declined');
    expect(holdings(declines)).toEqual(holdings(before));
    expect(skill(declines)).toEqual(skill(before));
    expect(outcomeItems(declines)).toEqual([]);
    reopen(declines);
  });

  it('returns only remaining custody when the second trainee actually walks out after a genuine blank',()=>{
    const {before,world,row}=blankNativeCraftTraining();
    expect(craftActor(world,craftSecond).locationId).toBe(craftSite);
    const otherSite=knownMapLocations(world,craftActor(world,craftSecond)).find(site=>site.id==='loc-market');
    craftAssert(otherSite,'Second trainee must know a distinct real lower site');
    let departed=craftMonth(world,{[craftSecond]:craftDecision('EXPLORE',{targetLocationId:otherSite.id})});
    expect(craftActor(departed,craftSecond).locationId).toBe(otherSite.id);
    for(let i=0;i<8&&craftProject(departed)?.status==='blank';i++)departed=craftMonth(departed);
    expect(craftProject(departed)).toMatchObject({id:row.id,blank:row.blank,escrowStones:0,escrowRoots:0,refundedStones:27,refundedRoots:1});
    expect(outcomeItems(departed)).toEqual([]);
    expect(holdings(departed)).toEqual([holdings(before)[0]-28,holdings(before)[1]-1]);
    expect(holdings(craftMonth(departed))).toEqual(holdings(departed));
    expect(skill(departed)).toEqual(skill(world));
    reopen(departed);
  });

  it('records actual failed final testing without an artifact duplication, later refunds, or a false finish skill',()=>{
    const {before,blank,world,row}=finishedNativeCraftTraining(true);
    expect(craftActor(blank,craftSecond).hp).toBeLessThan(craftActor(blank,craftSecond).maxHp/2);
    expect(craftActor(blank,craftSecond).techniqueMastery).toBe(0);
    expect(row).toMatchObject({status:'failed',refundedStones:0,refundedRoots:0,
      finish:{actorId:craftSecond,grade:'failed',strained:true,stonesUsed:27,rootsUsed:1,masteryBefore:0,masteryAfter:0}});
    expect(row.finish?.artifactId).toBeUndefined();
    expect(outcomeItems(world)).toEqual([]);
    expect(holdings(world)).toEqual([holdings(before)[0]-55,holdings(before)[1]-2]);
    expect(holdings(craftMonth(world))).toEqual(holdings(world));
    expect(skill(world)).toEqual(skill(blank));
    reopen(world);
  });
});
