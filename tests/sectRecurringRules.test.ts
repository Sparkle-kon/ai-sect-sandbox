import {describe,expect,it} from 'vitest';
import {ensureSectRecurringCast} from '../src/engine/sectRecurringCast';
import {projectSectRecurring,settleSectRecurringMonth} from '../src/engine/sectRecurring';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import type {WorldEvent} from '../src/types/world';

function month(){
  const prev=createManagedSectWorld(904,'classic','drunken-sword-hermitage',0);
  if(!prev?.sectManagement)throw new Error('missing starter fixture');
  const world=structuredClone(prev);
  world.tick++;
  world.month++;
  if(!ensureSectRecurringCast(world))throw new Error('missing recurring cast fixture');
  return {prev,world};
}

describe('来客只说自己知道的江湖事',()=>{
  it('天机阁不引用私下或远处消息；同月亲历的公开事件可跳转',()=>{
    const {prev,world}=month();
    const host=world.cultivators.find(person=>person.id==='elder-tianji-1');
    if(!host)throw new Error('missing original host');
    const root:WorldEvent={id:'evt-recurring-news-fixture',tick:world.tick,year:world.year,month:world.month,
      title:'天机台公开问道',description:'众人在天机台问道。',locationId:host.locationId,category:'diplomacy',actorIds:[host.id]};
    const privateEvent:WorldEvent={...root,id:'evt-fixture-private',witnessScope:'participants'};
    const unseen:WorldEvent={...root,id:'evt-fixture-away',actorIds:[],locationId:'loc-market'};
    world.events.unshift(privateEvent,unseen);
    const separate=structuredClone(world);
    expect(settleSectRecurringMonth(separate,prev,[privateEvent,unseen]).some(event=>event.id.endsWith('-guest-host'))).toBe(false);
    world.events.unshift(root);
    settleSectRecurringMonth(world,prev,[root,privateEvent,unseen]);
    expect(projectSectRecurring(world).find(row=>row.role==='host')).toMatchObject({outcome:'public_news',sourceEventId:root.id});
    world.events=world.events.filter(event=>event.id!==root.id);
    expect(projectSectRecurring(world).find(row=>row.role==='host')?.sourceEventId).toBeUndefined();
  });

  it('醉剑没有欠款，不会催不存在的债；旧月不虚报为今月',()=>{
    const {prev,world}=month();
    expect(world.sectManagement?.debt).toBeUndefined();
    expect(settleSectRecurringMonth(world,prev,[])).toContainEqual(expect.objectContaining({witnessScope:'participants'}));
    expect(projectSectRecurring(world).find(row=>row.role==='wang')).toMatchObject({outcome:'market_remark'});
    world.tick++;
    expect(projectSectRecurring(world)).toEqual([]);
  });
});
