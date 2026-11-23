import {describe,expect,it} from 'vitest';
import {settleSectComedyMonth,projectSectComicMoment,sectComicEventId} from '../src/engine/sectComedy';
import {observeSectJob,planSectJob,settleSectJobChore,snapshotSectJobEvidence} from '../src/engine/sectJobs';
import {settleSectJobReportRow,sectJobOutcomeOdds} from '../src/engine/sectJobReportRules';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';

function homeTurn(){
  const before=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0)!;
  const world=structuredClone(before);
  world.tick++;
  world.month++;
  const management=world.sectManagement!,cook=world.cultivators.find(row=>row.id===management.foundingDiscipleIds[0])!;
  cook.quirks=['drama'];
  const plan=planSectJob(world,cook,'kitchen');
  if(plan.kind!=='chore')throw new Error('need actual installed kitchen');
  const start=snapshotSectJobEvidence(world,cook);
  const source=settleSectJobChore(world,cook,plan);
  if(!source)throw new Error('need one real cooked meal');
  const base=observeSectJob(world,cook,{discipleId:cook.id,jobId:'kitchen'},plan,start,source,true);
  const odds=sectJobOutcomeOdds(world,cook,'kitchen');
  const roll=(odds.success+odds.windfall+odds.mishap/2)/Object.values(odds).reduce((a,b)=>a+b,0);
  const row=settleSectJobReportRow(world,base,()=>roll);
  expect(row).toMatchObject({phase:'performed',tier:'mishap',sourceEventId:source.id,effects:expect.arrayContaining([
    {kind:'herb',herbId:'earth_root',stage:'native',amount:-1},
  ])});
  world.events.unshift(source);
  management.latestReport={openedTick:before.tick,settledTick:world.tick,sectId:management.sectId,leaderId:management.leaderId,rows:[row]};
  return {world,before,management,cook,source};
}

describe('typed independent comedy effects',()=>{
  it('damages a truly used kitchen once only; prior cooking and RNG receipts remain unchanged',()=>{
    const {world,before,management,cook,source}=homeTurn();
    const costs=structuredClone(management.latestReport),rng=structuredClone(world.random);
    const event=settleSectComedyMonth(world,before);
    expect(event).toMatchObject({id:sectComicEventId(world.tick,management.sectId),witnessScope:'participants',actorIds:[cook.id]});
    expect(event?.locationId).toBeUndefined();
    expect(management.buildings.kitchen).toBe(0);
    expect(management.latestReport).toEqual(costs);
    expect(world.random).toEqual(rng);
    const view=projectSectComicMoment(world)!;
    expect(view.moment).toMatchObject({speakerId:cook.id,source:{phase:'performed',tier:'mishap',jobId:'kitchen',reportEventId:source.id},
      effects:[{kind:'kitchen_damage',amount:-1}]});
    expect(view.animation).toBe('smoke');
    expect(event?.description).not.toContain(view.quote);
    expect(projectSectComicMoment(world,view.moment)).toBeUndefined();
    expect(settleSectComedyMonth(world,before)).toBeUndefined();
    expect(management.comedy?.moments).toHaveLength(1);
  });

  it('does not turn a blocked kitchen into work or invent a physically present away speaker',()=>{
    const {world,before,management,cook}=homeTurn();
    management.buildings.kitchen=0;
    management.latestReport={...management.latestReport!,rows:[{discipleId:cook.id,jobId:'kitchen',phase:'unavailable',effects:[]}]};
    cook.alive=false;
    cook.hp=0;
    const beat=settleSectComedyMonth(world,before);
    expect(beat).toBeDefined();
    expect(projectSectComicMoment(world)?.moment).toMatchObject({source:{phase:'ambient'},effects:[]});
    expect(beat?.actorIds).not.toContain(cook.id);
    expect(management.buildings.kitchen).toBe(0);
  });
});
