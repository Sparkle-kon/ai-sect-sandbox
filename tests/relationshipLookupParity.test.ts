import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {availableEncounters,firstActorRelationships} from '../src/engine/encounterEngine';
import type {RelationshipEdge} from '../src/types/world';

const edge=(fromId:string,toId:string,affinity:number):RelationshipEdge=>
  ({fromId,toId,affinity,type:affinity<0?'血仇':'挚友',note:'范围核对'});
const linear=(rows:readonly RelationshipEdge[],a:string,b:string)=>rows.find(row=>
  (row.fromId===a&&row.toId===b)||(row.fromId===b&&row.toId===a));

describe('local relationship indexing preserves exact earlier lookup semantics',()=>{
  it('uses the first edge in either direction, never a later duplicate or an unrelated edge',()=>{
    const a='同行甲',b='同行乙',c='同行丙',d='同行丁';
    const rows=[edge(d,c,-77),edge(b,a,79),edge(a,b,-52),edge(c,a,-61),edge(a,c,70),edge(a,a,8)];
    const scope=firstActorRelationships(rows,a);
    for(const id of [a,b,c,d,'无关系'])expect(scope.get(id)).toBe(linear(rows,a,id));
    expect(scope.get(b)?.affinity).toBe(79);
    expect(scope.get(c)?.affinity).toBe(-61);
    expect(scope.has(d)).toBe(false);
    const changed=firstActorRelationships([...rows].reverse(),a);
    expect(changed.get(b)?.affinity).toBe(-52);
    expect(changed.get(c)?.affinity).toBe(70);
    expect(scope.get(b)?.affinity).toBe(79);
  });

  it('rechecks native encounter eligibility after world updates and never changes the original relation array order',()=>{
    const world=createInitialWorld(2031);
    const [actor,target]=world.cultivators;
    actor.locationId=target.locationId='loc-market';
    for(const person of [actor,target]) {person.hp=person.maxHp;person.qiProgress=30;}
    const positive=edge(target.id,actor.id,79),negative=edge(actor.id,target.id,-62);
    world.relationships=[positive,negative];
    const canPractice=()=>availableEncounters(actor,world).some(row=>row.action==='DUAL_CULTIVATE'&&row.targetId===target.id);
    expect(canPractice()).toBe(true);
    expect(world.relationships).toEqual([positive,negative]);
    world.relationships.reverse();
    expect(canPractice()).toBe(false);
    world.relationships.splice(0,1);
    expect(canPractice()).toBe(true);
    positive.affinity=-81;
    expect(canPractice()).toBe(false);
  });
});
