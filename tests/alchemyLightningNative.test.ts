import {describe,expect,it} from 'vitest';
import {availableHeavenlyAlchemyActions} from '../src/engine/heavenlyAlchemyEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {applyCultivatorBrainDecision,executeGodIntervention} from '../src/engine/worldEngine';
import type {WorldState} from '../src/types/world';
import {actualHighAlchemyMaterials,actualWardAlchemyMaterials,brewActor,brewActorId,brewMonth,brewSiteId,highBrew,highTake} from './alchemyLightningNativeFixture';

const strict=(world:WorldState)=>{
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
};
const recent=(world:WorldState)=>brewActor(world).heavenlyAlchemy?.attempts.at(-1);

describe('real fire, supplies and qualities from an existing native furnace',()=>{
  it('creates distinct common and peerless material receipts from the exact same furnace and produces no pill on real paid failure',()=>{
    const materials=actualHighAlchemyMaterials();
    const same=executeGodIntervention(materials,{type:'TRIBULATION_STRIKE',targetCultivatorId:brewActorId});
    const prior=brewActor(same);
    expect(prior.herbs.jade_leaf).toBeGreaterThanOrEqual(2);
    expect(prior.herbs.star_bloom).toBeGreaterThanOrEqual(3);
    const common=brewMonth(strict(same),highBrew('nine_turn_golden','calm'),.2);
    const peerless=brewMonth(strict(same),highBrew('nine_turn_golden','fierce'),.99);
    const lost=brewMonth(strict(same),highBrew('nine_turn_golden','fierce'),.001);
    for(const world of [common,peerless,lost]){
      const actor=brewActor(world);
      expect([prior.spiritStones-actor.spiritStones,prior.herbs.jade_leaf-actor.herbs.jade_leaf,
        prior.herbs.star_bloom-actor.herbs.star_bloom]).toEqual([120,2,3]);
      expect(actor.pills.golden).toBe(prior.pills.golden);
      expect(recent(world)).toMatchObject({tick:world.tick,siteId:brewSiteId,recipeId:'nine_turn_golden'});
      expect(world.furnaceReservations.uses).toContainEqual(expect.objectContaining({actorId:brewActorId,siteId:brewSiteId,kind:'brew',tick:world.tick}));
    }
    expect(recent(common)?.quality).toBe('common');
    expect(recent(peerless)?.quality).toBe('peerless');
    expect(recent(lost)?.quality).toBeUndefined();
    expect(availableHeavenlyAlchemyActions(brewActor(lost),lost,lost.tick+1).some(row=>row.heavenlyAlchemyMove==='take')).toBe(false);
    const check=strict(peerless),at=brewActor(check),before=encodeEraWorldSave(check);
    expect(applyCultivatorBrainDecision(check,at,highBrew('nine_turn_golden','calm'),()=>0)).toBeNull();
    expect(encodeEraWorldSave(check)).toBe(before);
    const plain=brewMonth(strict(common),highTake('nine_turn_golden','common'));
    const stronger=brewMonth(strict(peerless),highTake('nine_turn_golden','peerless'));
    expect(recent(plain)?.use?.tick).toBe(plain.tick);
    expect(recent(stronger)?.use?.tick).toBe(stronger.tick);
    expect(brewActor(stronger).qiProgress).toBeGreaterThan(brewActor(plain).qiProgress);
    expect(brewActor(stronger).hp).toBeGreaterThan(brewActor(plain).hp);
    expect(availableHeavenlyAlchemyActions(brewActor(stronger),stronger,stronger.tick+1)
      .some(row=>row.heavenlyAlchemyMove==='take'&&row.heavenlyAlchemyQuality==='peerless')).toBe(false);
    expect(strict(stronger).tick).toBe(stronger.tick);
  });

  it('retains the original ordinary golden inventory and grade semantics without calling it refined quality',()=>{
    const raw=actualHighAlchemyMaterials();
    const result=brewMonth(raw,{chosenAction:'BREW_PILL',targetPillId:'golden',innerMonologue:'以旧法亲身开炉。'},.1);
    expect(brewActor(result).pills.golden-brewActor(raw).pills.golden).toBe(1);
    expect(brewActor(result).heavenlyAlchemy).toBeUndefined();
    expect(brewActor(result).publicAlchemy).toEqual([{siteId:brewSiteId,firstTick:result.tick,lastTick:result.tick,successes:1,bestGrade:3}]);
  });

  it('makes distinctly paid 渡劫神丹 from truly gathered ruin moss and prepares only a native ward',()=>{
    const materials=actualWardAlchemyMaterials(),before=brewActor(materials);
    const cooked=brewMonth(strict(materials),highBrew('tribulation_divine','fierce'),.99);
    const attempt=recent(cooked)!;
    expect(attempt).toMatchObject({recipeId:'tribulation_divine',siteId:brewSiteId});
    expect(attempt.quality).toBeDefined();
    const actor=brewActor(cooked);
    expect([before.spiritStones-actor.spiritStones,before.herbs.earth_root-actor.herbs.earth_root,
      before.herbs.star_bloom-actor.herbs.star_bloom,before.herbs.shadow_moss-actor.herbs.shadow_moss]).toEqual([180,2,2,2]);
    expect(actor.pills).toEqual(before.pills);
    const ready=brewMonth(strict(cooked),highTake('tribulation_divine',attempt.quality!));
    expect(recent(ready)?.use?.tick).toBe(ready.tick);
    expect(brewActor(ready).heavenlyAlchemy?.ward?.brewId).toBe(attempt.id);
    expect(brewActor(ready).hp).toBe(actor.hp);
    expect(strict(ready).tick).toBe(ready.tick);
  });

  it('consumes one truly brewed ward only on the next actual native lightning wave',()=>{
    const pilgrim='npc-6',lab=actualWardAlchemyMaterials(pilgrim);
    const owner=(world:WorldState)=>brewActor(world,pilgrim);
    const turn=(world:WorldState,order:Parameters<typeof brewMonth>[1])=>brewMonth(world,order,.2,pilgrim);
    const brewed=brewMonth(lab,highBrew('tribulation_divine','fierce'),.99,pilgrim);
    const attempt=owner(brewed).heavenlyAlchemy?.attempts.at(-1)!;
    expect(attempt.quality).toBeDefined();
    let poised=brewed;
    for(let i=0;i<3&&owner(poised).qiProgress<90;i++){
      poised=turn(poised,{chosenAction:'CULTIVATE',innerMonologue:'实地吐纳养息。'});
    }
    expect(owner(poised)).toMatchObject({realm:'筑基',realmStage:9});
    expect(owner(poised).qiProgress).toBeGreaterThanOrEqual(90);
    const selected=turn(strict(poised),highTake('tribulation_divine',attempt.quality!)),control=turn(poised,undefined);
    expect(owner(selected).hp).toBe(owner(control).hp);
    const open=(world:WorldState)=>turn(world,{chosenAction:'BREAKTHROUGH',innerMonologue:'在此当面正式引雷。'});
    const wardTrial=open(selected),bareTrial=open(control);
    expect(owner(wardTrial).tribulation?.stage).toBe('lightning');
    expect(owner(bareTrial).tribulation?.stage).toBe('lightning');
    expect(owner(wardTrial).heavenlyAlchemy?.ward?.brewId).toBe(attempt.id);
    const wave=(world:WorldState)=>turn(world,{chosenAction:'FACE_TRIBULATION',tribulationStance:'guard',innerMonologue:'亲身守第一重。'});
    const mitigated=wave(strict(wardTrial)),bare=wave(bareTrial);
    expect(owner(wardTrial).hp-owner(mitigated).hp).toBeLessThan(owner(bareTrial).hp-owner(bare).hp);
    const receipt=owner(mitigated).heavenlyAlchemy?.attempts.at(-1);
    expect(receipt?.use).toMatchObject({wardSpentTick:mitigated.tick,wardTrialId:owner(mitigated).tribulation?.id,wardWave:1});
    expect(owner(mitigated).heavenlyAlchemy?.ward).toBeUndefined();
    expect(owner(wave(mitigated)).heavenlyAlchemy?.attempts.at(-1)?.use).toEqual(receipt?.use);
  });
});
