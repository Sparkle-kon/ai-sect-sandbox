import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { acceptedSectStipend,stipendTurn } from './fixtures/sectStipendFixture';
import type { WorldState } from '../src/types/world';

const redo=(world:WorldState)=>decodeWorldSave(encodeWorldSave(world));
function corrupt(raw:string,edit:(world:WorldState)=>void){
  const parsed=JSON.parse(raw) as {world:WorldState};
  edit(parsed.world);
  return ()=>decodeWorldSave(JSON.stringify(parsed));
}
function paid(){
  const f=acceptedSectStipend();
  const state=stipendTurn(redo(f.world));
  expect(state.sectStipends.stipends[0].periods).toMatchObject([{status:'paid',paidAmount:12}]);
  return {f,state};
}

describe('native stipend saves keep standalone verified terms and actual payouts',()=>{
  it('adds no obligation to old saves and round-trips a real paid period without changing ranked roles or healing history',()=>{
    const old=JSON.parse(encodeWorldSave(createInitialWorld(702))) as {world:Partial<WorldState>};
    delete old.world.sectStipends;
    expect(decodeWorldSave(JSON.stringify(old)).sectStipends).toEqual({stipends:[],nextId:1});
    const {f,state}=paid();
    const restored=redo(state);
    expect(restored.sectStipends).toEqual(state.sectStipends);
    expect(restored.infirmaries.cases.find(row=>row.id===f.caseId)).toEqual(f.world.infirmaries.cases.find(row=>row.id===f.caseId));
    const untouched=structuredClone(f.world);
    untouched.sectStipends.stipends=[];
    const baseline=stipendTurn(untouched);
    expect(restored.cultivators.find(row=>row.id===f.recipientId)?.sectRank)
      .toBe(baseline.cultivators.find(row=>row.id===f.recipientId)?.sectRank);
  });
  it('rejects duplicate service qualification, borrowed clinician evidence or a forged/missing real transfer',()=>{
    const {f,state}=paid(), raw=encodeWorldSave(state);
    expect(corrupt(raw,world=>{
      const current=world.sectStipends,source=current.stipends[0];
      current.stipends.push({...source,id:`sect-stipend-${current.nextId++}`});
    })).toThrow('sectStipends.qualification.repeat');
    expect(corrupt(raw,world=>{world.sectStipends.stipends[0].service.patientId=f.leaderId;})).toThrow('sectStipends.qualification.source');
    expect(corrupt(raw,world=>{world.sectStipends.stipends[0].periods[0].authorityId=f.patientId;})).toThrow('sectStipends.periods.source');
    expect(corrupt(raw,world=>{
      world.resourceFlow.months.flatMap(month=>month.entries).find(row=>row.mechanism==='sect_stipend')!.reason='other_payment';
    })).toThrow('sectStipends.journal.source');
  });
});
