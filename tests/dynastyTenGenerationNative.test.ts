import {describe,expect,it} from 'vitest';
import {actualTenGenerationDynasty} from './dynastyTenGenerationNativeFixture';
import {projectCultivationClans} from '../src/engine/cultivationClanEngine';
import {projectProtagonistSuccession} from '../src/engine/protagonistSuccession';

describe('a true nine-link family line spanning ten generations',()=>{
  it('runs one seed continuously through actual growth, save checkpoints, and an independently earned lead',()=>{
    const result=actualTenGenerationDynasty(),{world,lineage,checkpoints,old,successor}=result;
    expect(lineage.map(row=>row.adult)).toEqual([232,465,698,931,1164,1397,1630,1863,2096]);
    expect(lineage.slice(1).map(row=>row.parent)).toEqual(lineage.slice(0,-1).map(row=>row.actorId));
    expect(lineage.every(row=>row.adult-row.born===216&&row.earnedTicks.length===9)).toBe(true);
    expect(checkpoints).toEqual([698,1397,2096,2100,2112]);
    expect([result.livingAtLastMaturity,result.rosterAtLastMaturity,world.tick]).toEqual([22,29,2112]);
    expect(old).toMatchObject({actorId:'elder-taixu-1',endedTick:2111,closeReason:'receded'});
    expect(successor).toMatchObject({actorId:lineage[8].actorId,openedTick:2111,predecessorArcId:old.id});
    expect(old.opening.map(fact=>fact.tick)).toEqual([2097,2098,2099]);
    expect(successor.opening.map(fact=>fact.tick)).toEqual([2105,2106,2107]);
    expect(new Set([...old.opening,...successor.opening].map(fact=>fact.eventId)).size).toBe(6);

    // Synthetic read-only negative control, deliberately separate from the native progression.
    const isolated=structuredClone(world);
    const heir=isolated.cultivators.find(row=>row.id===lineage[8].actorId)!;
    const linked=new Set(lineage.flatMap(row=>[row.actorId,row.parent,row.partner]));
    const stranger=isolated.cultivators.find(row=>row.alive&&row.hp>0&&row.age>=18&&!linked.has(row.id))!;
    expect(stranger?.alive).toBe(true);
    stranger.name=heir.name;
    expect(stranger.id).not.toBe(heir.id);
    expect(projectCultivationClans(isolated,heir)?.unions.flatMap(row=>row.children.map(child=>child.id))).toContain(lineage[8].childId);
    expect(projectCultivationClans(isolated,stranger)?.unions.flatMap(row=>row.children.map(child=>child.id))??[]).not.toContain(lineage[8].childId);
    expect(projectProtagonistSuccession(isolated).active?.actorId).toBe(heir.id);
  },90_000);
});
