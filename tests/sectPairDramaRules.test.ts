import {describe,expect,it} from 'vitest';
import {possessAvatar} from '../src/engine/avatarEngine';
import {canFinishSectPairBlame,planSectPairDrama,projectSectPairDrama,settleSectPairDrama} from '../src/engine/sectPairDrama';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import type {SectJobAssignment,SectJobReport,SectJobReportRow} from '../src/types/sectJobs';
import type {RelationshipEdge} from '../src/types/world';

function fixture(jobId:SectJobAssignment['jobId']='cultivate',type:RelationshipEdge['type']='同门',affinity=28){
  const world=createManagedSectWorld(13071,'classic','qingyun-odd-jobs',0);
  const managed=world?.sectManagement;
  if(!world||!managed)throw new Error('Missing managed sect');
  const adults=managed.foundingDiscipleIds.slice(1,3).map(id=>{
    const actor=world.cultivators.find(row=>row.id===id);
    if(!actor)throw new Error('Missing disciple');
    return actor;
  });
  const [a,b]=adults;
  a.quirks=['lovestruck']; b.quirks=['neat_freak'];
  world.relationships=world.relationships.filter(row=>![a.id,b.id].includes(row.fromId)||![a.id,b.id].includes(row.toId));
  const edge:RelationshipEdge={fromId:b.id,toId:a.id,type,affinity,note:'已经存在的同门因缘'};
  world.relationships.push(edge);
  const orders=new Map<string,SectJobAssignment>(adults.map(actor=>[actor.id,{discipleId:actor.id,jobId}]));
  const perform=(rowOverride:Partial<SectJobReportRow>={}):SectJobReport=>{
    world.tick++;
    return managed.latestReport={openedTick:world.tick-1,settledTick:world.tick,sectId:managed.sectId,leaderId:managed.leaderId,
      rows:adults.map(actor=>({discipleId:actor.id,jobId,phase:'performed',siteId:managed.homeSiteId,tier:'success',effects:[],...rowOverride}))};
  };
  return {world,managed,a,b,edge,orders,perform};
}

describe('同门小插曲：证据、隐私与关系边界',()=>{
  it('既不猜测互有情意，也不向掌门或另一人展示私念',()=>{
    const {world,a,b,edge,orders,perform}=fixture();
    const scene=planSectPairDrama(world,orders);
    if(!scene)throw new Error('Missing private scene');
    expect(scene.initiatorId).toBe(a.id);
    const report=perform();
    expect(settleSectPairDrama(world,scene,{...report})).toBeUndefined();
    const event=settleSectPairDrama(world,scene,report);
    if(!event)throw new Error('Missing private scene receipt');
    world.events.push(event);
    expect(settleSectPairDrama(world,scene,report)).toBeUndefined();
    expect(edge).toMatchObject({type:'同门',affinity:29,note:'已经存在的同门因缘'});
    expect(event).toMatchObject({actorIds:[a.id],witnessScope:'participants'});
    expect(event.locationId).toBeUndefined();
    expect(projectSectPairDrama(world)).toMatchObject({title:'一同办差'});
    expect(possessAvatar(world,b.id)).toBe(true);
    expect(projectSectPairDrama(world)).toMatchObject({title:'一同办差'});
    world.playerAvatar.switchAvailableTick=world.tick;
    expect(possessAvatar(world,a.id)).toBe(true);
    expect(projectSectPairDrama(world)).toMatchObject({title:'一句未说出口',voices:[
      {actorId:a.id,name:a.name,text:expect.stringContaining('临到开口')},
      {actorId:b.id,name:b.name,text:expect.stringContaining('差事已回完')},
    ]});
    world.tick++;
    expect(projectSectPairDrama(world)).toBeUndefined();
  });

  it('重复关系和已有道侣不会被猜成同门心事',()=>{
    const {world,a,b,edge,orders}=fixture();
    const leader=world.sectManagement?.leaderId;
    if(!leader)throw new Error('Missing leader');
    world.relationships.push({...edge,fromId:a.id,toId:b.id});
    expect(planSectPairDrama(world,orders)).toBeUndefined();
    world.relationships.pop();
    world.relationships.push({fromId:a.id,toId:leader,type:'道侣',affinity:80,note:'已有道侣'});
    expect(planSectPairDrama(world,orders)?.kind).not.toBe('crush');
  });

  it('竞争到了边界也不改既存关系，重伤或未执行皆不结算',()=>{
    const {world,managed,b,edge,orders,perform}=fixture('cultivate','竞争',79);
    const scene=planSectPairDrama(world,orders);
    if(!scene)throw new Error('Missing rivalry scene');
    const report=perform({tier:'disaster'});
    expect(settleSectPairDrama(world,scene,report)).toBeUndefined();
    managed.latestReport={...report,rows:report.rows.map(row=>({...row,tier:'success'}))};
    const latest=managed.latestReport;
    const hp=b.hp;
    b.hp=b.maxHp*.2;
    expect(settleSectPairDrama(world,scene,latest)).toBeUndefined();
    b.hp=hp;
    expect(settleSectPairDrama(world,scene,latest)).toBeDefined();
    expect(managed.pairDrama?.affinityChange).toBe(0);
    expect(edge).toMatchObject({type:'竞争',affinity:79});
  });

  it('两份没做成并不等于同时甩锅：还须确认原地接过值班',()=>{
    const {world,a,b,edge,orders,perform}=fixture('guard','同门',-59);
    a.quirks=['contrarian'];b.quirks=['drama'];
    const scene=planSectPairDrama(world,orders);
    if(!scene)throw new Error('Missing blame scene');
    const report=perform({phase:'unavailable',tier:undefined,siteId:undefined});
    expect(settleSectPairDrama(world,scene,report)).toBeUndefined();
    b.currentAction='CULTIVATE';
    expect(canFinishSectPairBlame(world,scene)).toBe(false);
    expect(settleSectPairDrama(world,scene,report,true)).toBeUndefined();
    b.currentAction='REST';
    expect(canFinishSectPairBlame(world,scene)).toBe(true);
    expect(settleSectPairDrama(world,scene,report,true)).toBeDefined();
    expect(edge).toMatchObject({type:'同门',affinity:-59});
  });
});
