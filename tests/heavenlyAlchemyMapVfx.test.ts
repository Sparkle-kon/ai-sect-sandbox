import {describe,expect,it} from 'vitest';
import {buildHeavenlyAlchemyMapVfx} from '../src/components/heavenlyAlchemyMapVfx';
import {resolveGuidedHeavenlyAlchemyTurn} from '../src/controllers/guidedHeavenlyAlchemyTurn';
import {possessAvatar} from '../src/engine/avatarEngine';
import {availableHeavenlyAlchemyActions} from '../src/engine/heavenlyAlchemyEngine';
import {actualHighAlchemyMaterials,brewActor,brewActorId,brewMonth,brewSiteId,highBrew} from './alchemyLightningNativeFixture';

describe('native furnace sight, guide and replay scope',()=>{
  it('emits actual visible peerless alchemy light only, never historical or failure',()=>{
    const base=actualHighAlchemyMaterials();
    const recipe=highBrew('nine_turn_golden','fierce');
    const superior=brewMonth(base,recipe,.99),lost=brewMonth(base,recipe,.001);
    expect(buildHeavenlyAlchemyMapVfx(superior,id=>id===brewSiteId,false))
      .toEqual([expect.objectContaining({siteId:brewSiteId,quality:'peerless'})]);
    expect(buildHeavenlyAlchemyMapVfx(superior,()=>false,false)).toEqual([]);
    expect(buildHeavenlyAlchemyMapVfx(superior,()=>true,true)).toEqual([]);
    expect(buildHeavenlyAlchemyMapVfx(brewMonth(superior,undefined),()=>true,false)).toEqual([]);
    expect(buildHeavenlyAlchemyMapVfx(lost,()=>true,false)).toEqual([]);
  });
  it('derives one legal guided choice only from the exact possessed body and current branch',()=>{
    const world=actualHighAlchemyMaterials();
    const actor=brewActor(world);
    const option=availableHeavenlyAlchemyActions(actor,world,world.tick+1)
      .find(row=>row.heavenlyAlchemyMove==='brew'&&row.targetHeavenlyRecipeId==='nine_turn_golden'&&row.heavenlyAlchemyHeat==='calm')!;
    expect(option).toBeDefined();
    const source={kind:'heavenly-alchemy' as const,world,branchId:'main',revision:2,actorId:brewActorId,option};
    expect(resolveGuidedHeavenlyAlchemyTurn(source,world,'main',2)).toBeUndefined();
    expect(possessAvatar(world,brewActorId)).toBe(true);
    expect(resolveGuidedHeavenlyAlchemyTurn(source,world,'main',2)?.decision)
      .toMatchObject({chosenAction:'HEAVENLY_ALCHEMY',targetHeavenlyRecipeId:'nine_turn_golden',heavenlyAlchemyHeat:'calm'});
    expect(resolveGuidedHeavenlyAlchemyTurn(source,structuredClone(world),'main',2)).toBeUndefined();
    expect(resolveGuidedHeavenlyAlchemyTurn(source,world,'fork',2)).toBeUndefined();
  });
});
