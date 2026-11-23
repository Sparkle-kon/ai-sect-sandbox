import {expect,it} from 'vitest';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload} from '../src/types/world';

it('opens real adult disciples with a modest native relationship and can stage a first-month rivalry without a synthetic past',()=>{
  const world=createManagedSectWorld(13071,'classic','drunken-sword-hermitage',0)!;
  const management=world.sectManagement!;
  const adults=world.cultivators.filter(actor=>management.foundingDiscipleIds.includes(actor.id)&&actor.age>=18);
  const [first,second]=adults;
  if(!first||!second)throw Error('Expected an established adult starter pair');
  const initial=world.relationships.find(row=>row.fromId===first.id&&row.toId===second.id);
  expect(initial).toMatchObject({type:'竞争',affinity:6});
  expect(world.events.some(row=>row.actorIds.includes(first.id)&&row.actorIds.includes(second.id))).toBe(false);
  const decisions:Record<string,LLMDecisionPayload>=Object.fromEntries(world.cultivators.map(actor=>
    [actor.id,{chosenAction:'REST',innerMonologue:'且歇一歇。'}]));
  const after=advanceWorldTick(world,decisions,()=>.2,'utility',undefined,{sectJobAssignments:[
    {discipleId:first.id,jobId:'cultivate'},{discipleId:second.id,jobId:'cultivate'},
  ]});
  expect(after.sectManagement?.pairDrama).toMatchObject({kind:'rivalry',outcome:'completed',tick:2});
  expect(after.sectManagement?.latestReport?.rows.map(row=>row.phase)).toEqual(['performed','performed']);
  expect(initial?.affinity).toBe(6);
});
