import {describe,expect,it} from 'vitest';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceSectGrowth,applySectGrowthCommand,projectSectGrowth,quoteSectGrowthCommand,sectAnnualStipend} from '../src/engine/sectGrowth';
import type {SectGrowthCommand} from '../src/types/sectGrowth';
import type {WorldState} from '../src/types/world';

const start=(starter:'qingyun-odd-jobs'|'drunken-sword-hermitage'='qingyun-odd-jobs')=>
  createManagedSectWorld(2031,'classic',starter,0)!;
const main=(world:WorldState)=>world.sects.find(row=>row.id===world.sectManagement!.sectId)!;
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
function month(before:WorldState,treasury?:number){
  const world=structuredClone(before);
  world.tick++;
  world.month=before.month%12+1;
  world.year=before.year+Number(world.month===1);
  if(treasury!==undefined)main(world).spiritStones=treasury;
  const events=advanceSectGrowth(world,before);
  return {world,events};
}
function toTick(initial:WorldState,target:number,treasury?:number){
  let world=initial;
  while(world.tick<target)world=month(world,treasury).world;
  return world;
}

describe('finite sect growth accounting',()=>{
  it('repays the real Wang without borrowing, creating no phantom payment when blocked',()=>{
    const initial=start(),management=initial.sectManagement!;
    expect(projectSectGrowth(initial)?.debt).toMatchObject({monthsRemaining:6,principal:80,canRepay:false});
    expect(applySectGrowthCommand(initial,{kind:'repay'})).toBe(false);
    const {world,events}=month(initial,35),wang=actor(world,management.debt!.creditorId);
    expect(events[0]).toMatchObject({title:'王掌柜的借条',actorIds:[management.leaderId,wang.id]});
    expect(events[0]?.locationId).toBeUndefined();
    expect(quoteSectGrowthCommand(world,{kind:'repay'})).toEqual({kind:'repay',amount:35});
    const balance=wang.spiritStones;
    for(const amount of [NaN,0,-1,1.2,36])expect(applySectGrowthCommand(world,{kind:'repay',amount})).toBe(false);
    expect(applySectGrowthCommand(world,{kind:'repay',amount:10})).toBe(true);
    expect(main(world).spiritStones).toBe(25);
    expect(wang.spiritStones).toBe(balance+10);
    expect(world.sectManagement?.debt?.principal).toBe(70);
    expect(world.resourceFlow.months.at(-1)?.entries).toContainEqual(expect.objectContaining({
      kind:'transfer',amount:10,reason:'management_debt_repaid',from:{kind:'sect',id:management.sectId},to:{kind:'actor',id:wang.id},
    }));
    main(world).spiritStones=100;
    expect(applySectGrowthCommand(world,{kind:'repay'})).toBe(true);
    expect(main(world).spiritStones).toBe(30);
    expect(wang.spiritStones).toBe(balance+80);
    expect(world.sectManagement?.debt).toBeUndefined();
    expect(applySectGrowthCommand(world,{kind:'repay'})).toBe(false);
  });

  it('buys exactly the quoted level and preserves a stronger already-built native facility',()=>{
    const world=start('drunken-sword-hermitage'),sect=main(world),management=world.sectManagement!;
    const home=world.locations.find(row=>row.id===management.homeSiteId)!;
    home.furnaceGrade=3;
    sect.facilities.alchemy_hall=3;
    expect(quoteSectGrowthCommand(world,{kind:'upgrade',building:'furnace'})).toEqual({kind:'upgrade',building:'furnace',level:1,cost:20});
    expect(applySectGrowthCommand(world,{kind:'upgrade',building:'furnace'})).toBe(true);
    expect(sect.spiritStones).toBe(10);
    expect(management.buildings.furnace).toBe(1);
    expect(home.furnaceGrade).toBe(3);
    expect(sect.facilities.alchemy_hall).toBe(3);
    expect(applySectGrowthCommand(world,{kind:'upgrade',building:'furnace'})).toBe(false);
    expect(applySectGrowthCommand(world,{kind:'upgrade',building:'furnace',price:0} as unknown as SectGrowthCommand)).toBe(false);
    expect(applySectGrowthCommand(world,{kind:'repay'})).toBe(false);
  });

  it('counts only three truly overdue consecutive closes, does not count away disciples as gone, and freezes failure',()=>{
    const initial=start();
    for(const id of initial.sectManagement!.foundingDiscipleIds)actor(initial,id).locationId='loc-market';
    const due=toTick(initial,7,20);
    expect(due.sectManagement?.growth?.closing).toMatchObject({tick:7,negativeMonths:0,livingDisciples:3});
    const first=month(due,20).world;
    expect(first.sectManagement?.growth?.closing).toMatchObject({closingNet:-60,overduePrincipal:80,negativeMonths:1});
    const recovered=month(first,80).world;
    expect(recovered.sectManagement?.growth?.closing).toMatchObject({closingNet:0,negativeMonths:0});
    const two=toTick(recovered,11,20);
    expect(two.sectManagement?.growth?.closing.negativeMonths).toBe(2);
    const failed=month(two,20);
    expect(failed.world.sectManagement?.growth?.failure).toEqual({reason:'bankruptcy',tick:12});
    expect(failed.events).toHaveLength(1);
    expect(quoteSectGrowthCommand(failed.world,{kind:'repay'})).toBeUndefined();
    expect(month(failed.world,100).world.sectManagement?.growth).toEqual(failed.world.sectManagement?.growth);
  });

  it('awards one annual rating and exact capped stipend only after twelve complete dates',()=>{
    const pre=toTick(start('drunken-sword-hermitage'),12,80);
    main(pre).reputation=95;
    expect(pre.sectManagement?.growth?.review).toBeUndefined();
    const {world,events}=month(pre,49_999.5);
    expect(world.sectManagement?.growth?.review).toMatchObject({tick:13,year:world.year,previousRating:'不入流',stipend:0});
    expect(events).toHaveLength(1);
    expect(advanceSectGrowth(world,pre)).toEqual([]);
    const clean=month(pre,80).world,review=clean.sectManagement!.growth!.review!;
    expect(review.stipend).toBe(sectAnnualStipend(review.rating));
    expect(review.stipend).toBeGreaterThan(0);
    expect(main(clean).spiritStones).toBe(80+review.stipend);
    expect(projectSectGrowth(clean)?.nextReviewTick).toBe(25);
  });
});
