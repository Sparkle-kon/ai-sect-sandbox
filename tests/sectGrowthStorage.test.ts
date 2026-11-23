import { describe, expect, it } from 'vitest';
import { applySectGrowthCommand } from '../src/engine/sectGrowth';
import { createManagedSectWorld } from '../src/engine/starterSectWorld';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { sameGeneratedWorld } from '../src/engine/worldIdentity';
import type { SectGrowthState } from '../src/types/sectGrowth';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

function start(kind:'qingyun-odd-jobs'|'drunken-sword-hermitage'='qingyun-odd-jobs'){
  return createManagedSectWorld(13071,'classic',kind,0)!;
}
function dated(world:WorldState,tick:number):WorldState {
  const copy=structuredClone(world);
  const date=copy.year*12+copy.month-1+tick-copy.tick;
  copy.tick=tick;
  copy.year=Math.floor(date/12);
  copy.month=date%12+1;
  return copy;
}
function unchanged(world:WorldState){
  const bytes=encodeEraWorldSave(world),restored=decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(restored)).toBe(bytes);
  return restored;
}

describe('managed growth storage authority',()=>{
  it('retains the original creation note, permits later whole reductions and clearing, preserves legacy absence',()=>{
    const world=start(),original=unchanged(world);
    expect(original.sectManagement?.growth).toBeUndefined();
    const wrongBirth=structuredClone(world);
    wrongBirth.sectManagement!.debt!.principal=41;
    expect(()=>encodeEraWorldSave(wrongBirth)).toThrow(/sectManagement.debt/u);

    const later=dated(world,2);
    later.sectManagement!.debt!.principal=45;
    expect(unchanged(later).sectManagement?.debt?.principal).toBe(45);
    for(const principal of [.5,0,81]){
      const fake=structuredClone(later);
      fake.sectManagement!.debt!.principal=principal;
      expect(()=>encodeEraWorldSave(fake)).toThrow(/sectManagement.debt/u);
    }
    delete later.sectManagement!.debt;
    expect(unchanged(later).sectManagement?.debt).toBeUndefined();
    expect(sameGeneratedWorld(world,later)).toBe(true);

    const unrelated=dated(start('drunken-sword-hermitage'),3);
    unrelated.sectManagement!.debt={creditorId:'npc-1',principal:12,dueTick:7};
    expect(()=>encodeEraWorldSave(unrelated)).toThrow(/sectManagement.debt/u);
  });

  it('roundtrips exact native money transfers and the first measured growth cycle',()=>{
    const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'本月照看山门。'};
    const next=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,rest])),()=>.99,
      'utility',undefined,{capturePresentation:false,captureTrace:false});
    const birth=start(),debt=birth.sectManagement!.debt!;
    expect(applySectGrowthCommand(birth,{kind:'repay',amount:1})).toBe(false);
    let world=next(birth);
    const {sectId}=world.sectManagement!;
    const balances=(frame:WorldState)=>({funds:frame.sects.find(row=>row.id===sectId)!.spiritStones,
      purse:frame.cultivators.find(row=>row.id===debt.creditorId)!.spiritStones});
    const payment=balances(world);
    expect(applySectGrowthCommand(world,{kind:'repay',amount:5})).toBe(true);
    expect(balances(world)).toEqual({funds:payment.funds-5,purse:payment.purse+5});
    expect(unchanged(world).sectManagement?.debt?.principal).toBe(75);
    while(world.tick<7)world=next(world);
    const final=balances(world);
    expect(final.funds).toBeGreaterThanOrEqual(75);
    expect(applySectGrowthCommand(world,{kind:'repay',amount:75})).toBe(true);
    expect(balances(world)).toEqual({funds:final.funds-75,purse:final.purse+75});
    expect(unchanged(world).sectManagement?.debt).toBeUndefined();
    while(world.tick<13)world=next(world);
    const grown=unchanged(world).sectManagement?.growth;
    expect(grown).toMatchObject({closing:{tick:13,overduePrincipal:0,negativeMonths:0},
      review:{tick:13,year:world.year}});
  });

  it('preserves a native calendar annual review and frozen old failure while rejecting impossible accounting',()=>{
    const positive=dated(start(),13);
    const review:SectGrowthState={
      closing:{tick:13,treasury:49_986,overduePrincipal:80,closingNet:49_906,livingDisciples:3,negativeMonths:0},
      review:{tick:13,year:positive.year,previousRating:'不入流',rating:'七品',score:34,stipend:14},
    };
    positive.sectManagement!.growth=review;
    expect(unchanged(positive).sectManagement?.growth).toEqual(review);
    const invalidReview=[
      {...review,review:{...review.review!,year:positive.year+1}},
      {...review,review:{...review.review!,tick:12}},
      {...review,review:{...review.review!,rating:'天下名门' as const}},
      {...review,review:{...review.review!,stipend:16}},
      {...review,closing:{...review.closing,closingNet:49_904}},
      {...review,closing:{...review.closing,overduePrincipal:60,closingNet:49_926}},
    ];
    for(const growth of invalidReview){
      const forged=structuredClone(positive);
      forged.sectManagement!.growth=growth;
      expect(()=>encodeEraWorldSave(forged)).toThrow(/sectManagement.growth/u);
    }

    const oldFailure=dated(start(),18);
    const failure:SectGrowthState={
      closing:{tick:10,treasury:22,overduePrincipal:80,closingNet:-58,livingDisciples:2,negativeMonths:3},
      failure:{tick:10,reason:'bankruptcy'},
    };
    oldFailure.sectManagement!.growth=failure;
    oldFailure.cultivators.find(actor=>actor.id===oldFailure.sectManagement!.foundingDiscipleIds[0])!.sectId='';
    expect(unchanged(oldFailure).sectManagement?.growth).toEqual(failure);
    oldFailure.sectManagement!.growth={closing:failure.closing};
    expect(()=>encodeEraWorldSave(oldFailure)).toThrow(/sectManagement.growth.failure/u);
  });
});
