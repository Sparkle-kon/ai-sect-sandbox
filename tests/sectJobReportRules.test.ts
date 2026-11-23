import {describe,expect,it,vi} from 'vitest';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {observeSectJob,planSectJob,settleSectJobChore,snapshotSectJobEvidence} from '../src/engine/sectJobs';
import {pickSectJobTier,sectJobOutcomeOdds,settleSectJobReportRow} from '../src/engine/sectJobReportRules';
import {SECT_JOB_TIERS,type SectJobTier} from '../src/types/sectJobs';

function nativeGuard(){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
  const id=world.sectManagement!.foundingDiscipleIds[0];
  const actor=world.cultivators.find(row=>row.id===id)!;
  const plan=planSectJob(world,actor,'guard');
  if(plan.kind!=='chore')throw new Error('The beginning gate must be usable by a local disciple');
  const before=snapshotSectJobEvidence(world,actor);
  const event=settleSectJobChore(world,actor,plan);
  if(!event)throw new Error('Needed one exact home guard shift');
  const observed=observeSectJob(world,actor,{discipleId:id,jobId:'guard'},plan,before,event,true);
  expect(observed.nativeEffects).toEqual([{kind:'contribution',amount:2,stage:'native'}]);
  return {world,actor,observed};
}
function inBand(weights:ReturnType<typeof sectJobOutcomeOdds>,desired:SectJobTier){
  let start=0;
  for(const tier of SECT_JOB_TIERS){
    if(tier===desired)return (start+weights[tier]/2)/Object.values(weights).reduce((a,b)=>a+b,0);
    start+=weights[tier];
  }
  throw new Error('Unknown outcome');
}

describe('deterministic real sect-work follow-up',()=>{
  it.each(SECT_JOB_TIERS)('outcome %s keeps the original guard shift and uses one distinct real mechanical result',tier=>{
    const {world,actor,observed}=nativeGuard(),before={qi:actor.qiProgress,hp:actor.hp,merit:actor.contribution};
    const weights=sectJobOutcomeOdds(world,actor,'guard'),rand=vi.fn(()=>inBand(weights,tier));
    const result=settleSectJobReportRow(world,observed,rand);
    expect(rand).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({tier,phase:'performed',sourceEventId:observed.sourceEventId,siteId:observed.siteId});
    expect(result.effects[0]).toEqual({kind:'contribution',amount:2,stage:'native'});
    expect(actor.contribution).toBe(before.merit);
    if(tier==='success'){
      expect(result.effects).toHaveLength(1);
      expect(actor.qiProgress).toBe(before.qi);
      expect(actor.hp).toBe(before.hp);
    }
    if(tier==='windfall'||tier==='mishap'){
      expect(result.effects[1]).toEqual({kind:'qi',amount:tier==='windfall'?6:-5,stage:'follow_up'});
      expect(actor.qiProgress).toBe(before.qi+(tier==='windfall'?6:-5));
      expect(actor.hp).toBe(before.hp);
    }
    if(tier==='disaster'){
      expect(actor.hp).toBeLessThan(before.hp);
      expect(actor.hp).toBeGreaterThan(0);
      expect(result.effects[1]).toEqual({kind:'hp',amount:actor.hp-before.hp,stage:'follow_up'});
    }
  });

  it('uses authored quirks and actual building states without touching deterministic RNG during preview',()=>{
    const {world,actor}=nativeGuard();
    const rng=structuredClone(world.random);
    actor.quirks=['coward_king'];
    const reluctant=sectJobOutcomeOdds(world,actor,'guard');
    actor.quirks=['neat_freak'];
    const careful=sectJobOutcomeOdds(world,actor,'guard');
    expect(careful.success).toBeGreaterThan(reluctant.success);
    expect(careful.mishap).toBeLessThan(reluctant.mishap);
    world.sectManagement!.buildings.gate=4;
    const furnished=sectJobOutcomeOdds(world,actor,'guard');
    expect(furnished.success).toBeGreaterThan(careful.success);
    expect(furnished.disaster).toBeLessThan(careful.disaster);
    expect(world.random).toEqual(rng);
    expect(pickSectJobTier({success:10,windfall:0,mishap:0,disaster:5},0)).toBe('success');
    expect(pickSectJobTier({success:10,windfall:0,mishap:0,disaster:5},1)).toBe('disaster');
  });

  it('does not roll pending/blocked work; saturated resources cannot claim a nonexistent gain or bruise',()=>{
    const {world,actor,observed}=nativeGuard(),ignored=vi.fn(()=>.9);
    for(const phase of ['on_route','unavailable'] as const)
      expect(settleSectJobReportRow(world,{...observed,phase},ignored)).toMatchObject({phase,effects:[]});
    expect(ignored).not.toHaveBeenCalled();
    actor.qiProgress=100;
    actor.hp=1;
    const windfall=sectJobOutcomeOdds(world,actor,'guard');
    const result=settleSectJobReportRow(world,observed,()=>inBand(windfall,'windfall'));
    expect(result.effects.at(-1)).toEqual({kind:'contribution',amount:1,stage:'follow_up'});
    expect(actor.hp).toBe(1);
    actor.contribution=9999;
    expect(sectJobOutcomeOdds(world,actor,'guard')).toMatchObject({windfall:0,disaster:0});
    const noRoom=settleSectJobReportRow(world,observed,()=>0);
    expect(noRoom.tier).toBe('success');
    expect(noRoom.effects).toEqual(observed.nativeEffects);
    expect(actor.hp).toBe(1);
    actor.qiProgress=0;
    expect(sectJobOutcomeOdds(world,actor,'guard').mishap).toBe(0);
  });
});
