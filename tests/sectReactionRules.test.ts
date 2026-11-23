import {describe,expect,it} from 'vitest';
import {resolveAlchemy} from '../src/engine/alchemyEngine';
import {projectSectFurnaceReaction,projectSectReportReaction} from '../src/engine/sectReaction';
import {applySectGrowthCommand} from '../src/engine/sectGrowth';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import type {SectJobReportRow} from '../src/types/sectJobs';

function fixture(){
  const world=createManagedSectWorld(10001,'classic','qingyun-odd-jobs',0);
  if(!world?.sectManagement)throw new Error('missing managed fixture');
  const state=world.sectManagement;
  const actor=world.cultivators.find(person=>person.id===state.foundingDiscipleIds[0]);
  const sect=world.sects.find(row=>row.id===state.sectId);
  if(!actor||!sect)throw new Error('missing actor or sect');
  world.tick++;
  world.month++;
  return {world,state,actor,sect};
}

describe('舞台反应只增演出，不改实况',()=>{
  it('真实花费一次炼丹材料并失败才会冒烟，既不摇晃也不损炉',()=>{
    const {world,state,actor,sect}=fixture();
    sect.spiritStones+=200;
    expect(applySectGrowthCommand(world,{kind:'upgrade',building:'furnace'})).toBe(true);
    const home=world.locations.find(row=>row.id===state.homeSiteId);
    expect(home?.furnaceGrade).toBe(1);
    actor.herbs.jade_leaf=4;
    actor.herbs.earth_root=3;
    actor.spiritStones=150;
    const event=resolveAlchemy(world,actor,{chosenAction:'BREW_PILL',targetPillId:'foundation',innerMonologue:'看住火。'},()=>.99);
    if(!event||!home)throw new Error('missing real failed brew');
    world.events.unshift(event);
    const projected=projectSectFurnaceReaction(world);
    expect(projected).toMatchObject({id:event.id,actorId:actor.id,tick:world.tick,siteId:home.id,kind:'smoke',cause:'furnace'});
    expect(projected?.shake).toBeUndefined();
    expect(home.furnaceGrade).toBe(1);
    const counterfeit=structuredClone(world);
    counterfeit.resourceFlow.months.at(-1)!.entries=counterfeit.resourceFlow.months.at(-1)!.entries.filter(row=>row.reason!=='brew_material');
    expect(projectSectFurnaceReaction(counterfeit)).toBeUndefined();
  });

  it('未完成差事或非当月报告没有反应，确有伤势不用滑稽动画，外出只留画像',()=>{
    const {world,state,actor}=fixture();
    const row:SectJobReportRow={discipleId:actor.id,jobId:'explore',phase:'performed',tier:'mishap',
      siteId:state.homeSiteId,effects:[]};
    const report={openedTick:world.tick-1,settledTick:world.tick,sectId:state.sectId,leaderId:state.leaderId,rows:[row]};
    state.latestReport=report;
    expect(projectSectReportReaction(world,report,row)).toMatchObject({kind:'soul',siteId:state.homeSiteId});
    expect(projectSectReportReaction(world,structuredClone(report),row)).toBeUndefined();
    actor.hp=1;
    actor.locationId='loc-market';
    const hurt=projectSectReportReaction(world,report,row);
    expect(hurt?.kind).toBe('hurt');
    expect(hurt?.siteId).toBeUndefined();
    actor.alive=false;
    expect(projectSectReportReaction(world,report,row)).toBeUndefined();
  });
});
