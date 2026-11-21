import {describe,expect,it} from 'vitest';
import {availableMentorTransferActions,advanceMentorTransfers,projectMentorTransfers,resolveMentorTransferAction} from '../src/engine/mentorTransferEngine';
import {availableMentorshipActions,mentorshipBudgetRemaining,spendMentorshipBudget} from '../src/engine/mentorshipEngine';
import {move,next,offeredTransfer,priorActualMentorship} from './fixtures/mentorTransferFixture';

describe('native voluntary mentor transfer, skills intact',()=>{
  it('ends native original authority without rewriting its research and uses one later actual teaching slot, preserving all old education',()=>{
    const {world,old,student,teacher,outsider,target,transfer,source}=offeredTransfer();
    const lineage=structuredClone(world.mentorship.lineage),technique=structuredClone(student.technique),
      cohort=structuredClone(world.apprenticeCohorts),rank=student.sectRank;
    expect(availableMentorshipActions(old,world).some(row=>row.action==='TEACH'&&row.targetCultivatorId===student.id)).toBe(false);
    expect(resolveMentorTransferAction(world,student,move('accept',target))).toBeNull();
    expect(projectMentorTransfers(world,outsider)).toEqual({releases:[],transfers:[]});
    expect(projectMentorTransfers(world,old).transfers).toEqual([]);
    next(world);
    expect(resolveMentorTransferAction(world,teacher,move('accept',target))).toBeNull();
    expect(resolveMentorTransferAction(world,student,move('accept',target))).not.toBeNull();
    expect(mentorshipBudgetRemaining(teacher,world)).toBe(2);
    const masteryBefore=student.techniqueMastery;
    next(world);
    expect(resolveMentorTransferAction(world,student,move('attend',target))).not.toBeNull();
    expect(resolveMentorTransferAction(world,teacher,move('teach',target))).not.toBeNull();
    expect(mentorshipBudgetRemaining(teacher,world)).toBe(2);
    expect(student.techniqueMastery).toBe(masteryBefore);
    expect(advanceMentorTransfers(world)).toHaveLength(1);
    expect(advanceMentorTransfers(world)).toEqual([]);
    expect(transfer.lesson).toEqual({tick:world.tick,masteryBefore,masteryAfter:masteryBefore+1,instructionSpent:1});
    expect(mentorshipBudgetRemaining(teacher,world)).toBe(1);
    expect(world.mentorship.lineage).toEqual(lineage);
    expect(world.mentorship.offers).toContainEqual(source);
    expect(world.apprenticeCohorts).toEqual(cohort);
    expect(student.technique).toEqual(technique);
    expect(student.sectRank).toBe(rank);
  });

  it('records refusal with no debt/lineage, and accepts no old source reconstructed without its retained voucher',()=>{
    const {world,student,teacher,target,transfer}=offeredTransfer();
    const before=structuredClone(world.mentorship.lineage);
    next(world);
    expect(resolveMentorTransferAction(world,student,move('decline',target))).not.toBeNull();
    for(let i=0;i<5;i++){next(world);expect(advanceMentorTransfers(world)).toEqual([]);}
    expect(transfer.status).toBe('declined');
    expect(world.mentorship.lineage).toEqual(before);
    expect(mentorshipBudgetRemaining(teacher,world)).toBe(2);
    const legacy=priorActualMentorship();
    legacy.world.mentorship.offers=[];
    next(legacy.world);
    expect(availableMentorTransferActions(legacy.student,legacy.world).some(row=>row.mentorTransferMove==='end')).toBe(false);
  });

  it('does not double count when already signed actors lose the remaining native teaching budget',()=>{
    const {world,teacher,student,target,transfer}=offeredTransfer();
    next(world);expect(resolveMentorTransferAction(world,student,move('accept',target))).not.toBeNull();
    next(world);expect(resolveMentorTransferAction(world,teacher,move('teach',target))).not.toBeNull();
    expect(resolveMentorTransferAction(world,student,move('attend',target))).not.toBeNull();
    const before=student.techniqueMastery;
    expect(spendMentorshipBudget(world,teacher)).toBe(true);
    expect(spendMentorshipBudget(world,teacher)).toBe(true);
    expect(advanceMentorTransfers(world)).toEqual([]);
    expect(transfer).toMatchObject({status:'expired',reason:'no_budget'});
    expect(transfer.lesson).toBeUndefined();
    expect(student.techniqueMastery).toBe(before);
  });
});
