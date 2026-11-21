import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableScriptureActions } from '../src/engine/scriptureEngine';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { pavilionActor,pavilionLoanCheckedOutFixture,pavilionMove,pavilionTurn } from './fixtures/pavilionLoanFixture';
import type { WorldState } from '../src/types/world';

const mayAdopt=(world:WorldState,actorId:string,editionId:string)=>availableScriptureActions(pavilionActor(world,actorId),world)
  .some((option)=>option.editionMove==='adopt'&&option.targetScriptureEditionId===editionId);
function states() {
  const {world,borrower,rival,editionId,siteId,loanId}=pavilionLoanCheckedOutFixture();
  const before=decodeWorldSave(encodeWorldSave(world));
  const offsite=before.locations.find((site)=>site.type==='market' && site.id!==siteId)!;
  pavilionActor(before,borrower).locationId=offsite.id;
  const read=pavilionTurn(before,{[borrower]:pavilionMove('read',loanId)});
  expect(read.pavilionLoans.loans[0].read).toMatchObject({siteId:offsite.id,credited:true});
  const back=decodeWorldSave(encodeWorldSave(read));
  pavilionActor(back,borrower).locationId=siteId;
  const returned=pavilionTurn(back,{[borrower]:pavilionMove('return',loanId)});
  expect(returned.pavilionLoans.loans[0].returned?.tick).toBe(returned.tick);
  return {world,returned,rival,borrower,editionId};
}
function corrupt(save:string,mutation:(world:WorldState)=>void) {
  const data=JSON.parse(save) as {world:WorldState};
  mutation(data.world);
  return () => decodeWorldSave(JSON.stringify(data));
}

describe('exact shelf copy and loan history through save round trips',()=>{
  it('migrates old slots; a circulating copy is not an extra public copy, and actual return restores it',()=>{
    const prior=JSON.parse(encodeWorldSave(createInitialWorld(141))) as {world:Partial<WorldState>};
    delete prior.world.pavilionLoans;
    expect(decodeWorldSave(JSON.stringify(prior)).pavilionLoans).toEqual({nextShiftId:1,nextLoanId:1,copies:[],shifts:[],loans:[]});
    const {world,returned,rival,borrower,editionId}=states();
    expect(mayAdopt(world,rival,editionId)).toBe(false);
    expect(mayAdopt(world,borrower,editionId)).toBe(true);
    const verified=decodeWorldSave(encodeWorldSave(returned));
    expect(mayAdopt(verified,rival,editionId)).toBe(true);
    expect(verified.scriptures.editions).toEqual(world.scriptures.editions);
    expect(verified.pavilionLoans.copies).toEqual(world.pavilionLoans.copies);
    expect(verified.pavilionLoans.loans[0].read?.masteryAfter).toBe(verified.pavilionLoans.loans[0].read!.masteryBefore+2);
    expect(pavilionActor(verified,borrower).activeEdition).toEqual(pavilionActor(world,borrower).activeEdition);
  });

  it('rejects a second shelf copy, changed term, false proficiency, unstaffed return and overlapping real desk claims',()=>{
    const {returned,rival}=states();
    const actual=encodeWorldSave(returned);
    expect(corrupt(actual,(world)=>{world.pavilionLoans.copies.push(world.pavilionLoans.copies[0]);})).toThrow('pavilionLoans.copies.provenance');
    expect(corrupt(actual,(world)=>{world.pavilionLoans.loans[0].dueTick++;})).toThrow('pavilionLoans.loans.source');
    expect(corrupt(actual,(world)=>{world.pavilionLoans.loans[0].read!.masteryAfter++;})).toThrow('pavilionLoans.loans.read');
    expect(corrupt(actual,(world)=>{world.pavilionLoans.loans[0].returned!.shiftId='pavilion-shift-99';})).toThrow('pavilionLoans.shifts.service');
    expect(corrupt(actual,(world)=>{
      const state=world.pavilionLoans,first=state.shifts[0];
      state.shifts.push({...first,id:`pavilion-shift-${state.nextShiftId++}`,actorId:rival});
    })).toThrow('pavilionLoans.shifts.overlap');
  });
});
