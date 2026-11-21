import {describe,expect,it,vi} from 'vitest';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {advanceToolLoans,availableToolLoanActions,projectLocalToolLoanStatus,projectToolLoans,resolveToolLoanAction} from '../src/engine/toolLoanEngine';
import {availableWorkshopActions,resolveWorkshopAction} from '../src/engine/workshopEngine';
import {acceptedToolLoan,offeredToolLoan,preparedToolFinish,toolChoice,toolJob,toolPerson,toolTurn,toolWork,usedToolLoan}
  from './fixtures/toolLoanFixture';
import type {WorldState} from '../src/types/world';

const row=(world:WorldState)=>world.toolLoans.loans[0];
const scope=(f:ReturnType<typeof offeredToolLoan>,id:string)=>toolPerson(f.world,id);

describe('the workshop holds one original unbound implement while someone else uses it',()=>{
  it('uses distinct consent and physically transfers the original object from owner, never into borrower combat stock',()=>{
    const f=offeredToolLoan(),{world}=f;
    const lender=scope(f,f.lenderId),maker=scope(f,f.borrowerId),outsider=scope(f,f.outsiderId);
    const original=lender.artifacts.find(item=>item.id===f.artifactId);
    expect(original?.workshopOrigin?.orderId).toBe(f.sourceOrderId);
    expect(resolveToolLoanAction(world,maker,toolChoice('accept',f.id))).toBeNull();
    world.tick++;
    expect(resolveToolLoanAction(world,lender,toolChoice('accept',f.id))).toBeNull();
    expect(resolveToolLoanAction(world,outsider,toolChoice('accept',f.id))).toBeNull();
    expect(resolveToolLoanAction(world,maker,toolChoice('accept',f.id))?.witnessScope).toBe('participants');
    expect(row(world).custody).toBe(original);
    expect(lender.artifacts.some(item=>item.id===f.artifactId)).toBe(false);
    expect(maker.artifacts.some(item=>item.id===f.artifactId)).toBe(false);
    expect(resolveToolLoanAction(world,maker,toolChoice('accept',f.id))).toBeNull();
    expect(projectToolLoans(world,outsider)).toEqual([]);
    expect(JSON.stringify(projectToolLoans(world,maker))).not.toContain('custody');
  });

  it('rejects stale condition before identity transfer; a still-proven legacy tool receives a durable stamp',()=>{
    const f=offeredToolLoan(),{world}=f,lender=scope(f,f.lenderId),borrower=scope(f,f.borrowerId);
    const original=lender.artifacts.find(item=>item.id===f.artifactId)!;
    const provenance=original.workshopOrigin,nominal=original.durability!;
    delete original.workshopOrigin; // Older native world retained its genuine workshop order.
    world.tick++;
    original.durability=nominal-1;
    expect(resolveToolLoanAction(world,borrower,toolChoice('accept',f.id))).toBeNull();
    expect(row(world).custody).toBeUndefined();
    expect(lender.artifacts.find(item=>item.id===f.artifactId)).toBe(original);
    original.durability=nominal;
    expect(resolveToolLoanAction(world,borrower,toolChoice('accept',f.id))).not.toBeNull();
    expect(row(world).custody).toBe(original);
    expect(original.workshopOrigin).toEqual(provenance);
    expect(projectLocalToolLoanStatus(world,borrower)).toEqual({siteId:f.siteId,active:1,awaiting:0});
    expect(projectLocalToolLoanStatus(world,scope(f,f.outsiderId))).toBeUndefined();
  });

  it('rejects an explicitly claimed tool at blank or wrong order before normal spend/slot/RNG, then records real exact finish and wear',()=>{
    const f=acceptedToolLoan(),{world}=f,maker=scope(f,f.borrowerId);
    const tool=row(world).custody!,roll=vi.fn(()=>.3),initial=tool.durability!;
    world.tick++;
    const prior=structuredClone({order:toolJob(world,f.workshopId),slots:world.furnaceReservations});
    expect(resolveWorkshopAction(world,maker,toolWork(f.workshopId,f.id),roll)).toBeNull();
    expect(resolveWorkshopAction(world,maker,toolWork(f.sourceOrderId,f.id),roll)).toBeNull();
    expect(roll).not.toHaveBeenCalled();
    expect(toolJob(world,f.workshopId)).toEqual(prior.order);
    expect(world.furnaceReservations).toEqual(prior.slots);
    expect(tool.durability).toBe(initial);
    expect(resolveWorkshopAction(world,maker,toolWork(f.workshopId),roll)).not.toBeNull();
    expect(roll).not.toHaveBeenCalled();
    world.tick++;
    const fork=structuredClone(world);
    const choices=availableWorkshopActions(maker,world,false).filter(item=>item.workshopMove==='work');
    expect(choices.map(choice=>choice.targetToolLoanId)).toEqual([undefined,f.id]);
    expect(resolveWorkshopAction(world,maker,toolWork(f.workshopId,'tool-loan-999999'),roll)).toBeNull();
    expect(resolveWorkshopAction(world,maker,toolWork(f.workshopId,f.id),roll)).not.toBeNull();
    expect(resolveWorkshopAction(fork,toolPerson(fork,f.borrowerId),toolWork(f.workshopId),()=>.3)).not.toBeNull();
    const withTool=toolJob(world,f.workshopId).work[1],base=toolJob(fork,f.workshopId).work[1];
    expect(withTool.qualityScore).toBe(Math.min(100,base.qualityScore!+2));
    expect(withTool.toolUse).toEqual({loanId:f.id,baseScore:base.qualityScore,scoreBonus:2});
    expect(row(world).wear).toMatchObject({workshopId:f.workshopId,stage:'finish',piece:1,durabilityBefore:initial,
      durabilityAfter:initial-2,scoreBonus:2,tick:world.tick});
    expect(tool.durability).toBe(initial-2);
    expect(row(fork).custody?.durability).toBe(initial);
    expect(resolveWorkshopAction(world,maker,toolWork(f.workshopId,f.id),roll)).toBeNull();
    expect(roll).toHaveBeenCalledTimes(1);
  });

  it('failed physical furnace authorization never wears or assisted-finishes the tool',()=>{
    const f=preparedToolFinish(),site=f.world.locations.find(item=>item.id===f.siteId)!;
    const struck=applyMapBrush(f.world,'beast_tide',[site]);
    const initial=row(struck).custody?.durability;
    const world=toolTurn(struck,{[f.borrowerId]:toolWork(f.workshopId,f.id)});
    expect(toolJob(world,f.workshopId).work).toHaveLength(1);
    expect(row(world).wear).toBeUndefined();
    expect(row(world).custody?.durability).toBe(initial);
  });

  it('keeps original custody after the referenced job closes until the original owner confirms a physical reclaim',()=>{
    const f=usedToolLoan(),{world}=f;
    const lender=scope(f,f.lenderId),maker=scope(f,f.borrowerId);
    expect(row(world)).toMatchObject({status:'awaiting_recovery',release:{reason:'workshop_closed'}});
    const original=row(world).custody!,wear=original.durability;
    expect(resolveToolLoanAction(world,lender,toolChoice('reclaim',f.id))).toBeNull();
    world.tick++;
    const offsite=world.locations.find(item=>item.id!==f.siteId)!;
    lender.locationId=offsite.id;
    expect(availableToolLoanActions(lender,world).some(item=>item.toolLoanMove==='reclaim')).toBe(false);
    lender.locationId=f.siteId;
    expect(resolveToolLoanAction(world,maker,toolChoice('reclaim',f.id))).toBeNull();
    expect(resolveToolLoanAction(world,lender,toolChoice('reclaim',f.id))).not.toBeNull();
    expect(row(world)).toMatchObject({status:'returned',closedTick:world.tick});
    expect(row(world).custody).toBeUndefined();
    expect(lender.artifacts.find(item=>item.id===f.artifactId)).toBe(original);
    expect(original.durability).toBe(wear);
    expect(resolveToolLoanAction(world,lender,toolChoice('reclaim',f.id))).toBeNull();
  });

  it('borrower death leaves original for lender, while lender death routes exact worn artifact into ordinary original estate',()=>{
    const f=usedToolLoan(),borrowerFork=structuredClone(f.world),maker=toolPerson(borrowerFork,f.borrowerId);
    maker.alive=false;maker.hp=0;
    const borrowerDeath=toolTurn(borrowerFork);
    expect(row(borrowerDeath).custody?.id).toBe(f.artifactId);
    expect(borrowerDeath.estates.entries.find(item=>item.deceasedId===f.borrowerId)?.holdings.artifacts
      .some(item=>item.id===f.artifactId)).toBe(false);
    const lender=scope(f,f.lenderId),damage=row(f.world).custody?.durability;
    lender.alive=false;lender.hp=0;
    const lenderDeath=toolTurn(f.world);
    expect(row(lenderDeath)).toMatchObject({status:'probate'});
    expect(row(lenderDeath).custody).toBeUndefined();
    expect(lenderDeath.estates.entries.find(item=>item.deceasedId===f.lenderId)?.holdings.artifacts
      .find(item=>item.id===f.artifactId)?.durability).toBe(damage);
    expect(advanceToolLoans(lenderDeath)).toEqual([]);
  });
});
