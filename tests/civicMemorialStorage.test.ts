import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { availableChronicleErrataActions } from '../src/engine/chronicleErrataEngine';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { civicActor as actor,civicChoice as choice,civicMemorialFixture,civicMove as move,civicTurn as turn } from './fixtures/civicMemorialFixture';
import type { WorldState } from '../src/types/world';

function confirmed(withErrata=false){
  const f=civicMemorialFixture();
  const {world,deedId,sourceEventId,proposer,witness,other,editor}=f;
  const opened=turn(world,{[proposer]:move('propose',deedId),...(withErrata?{
    [witness]:choice('CHRONICLE_ERRATA',{chronicleErrataMove:'retell',targetChronicleSourceId:sourceEventId,chronicleReliefReading:'full_supplies'}),
    [other]:choice('CHRONICLE_ERRATA',{chronicleErrataMove:'retell',targetChronicleSourceId:sourceEventId,chronicleReliefReading:'unfunded'}),
  }:{})});
  const id=opened.civicMemorials.memorials[0].id;
  const state=turn(opened,{[witness]:move('verify',id),...(withErrata?{
    [editor]:choice('CHRONICLE_ERRATA',{chronicleErrataMove:'correct',targetChronicleSourceId:sourceEventId}),
  }:{})});
  expect(state.civicMemorials.memorials[0].status).toBe('verified');
  return {...f,state};
}
function corrupt(save:string,edit:(world:WorldState)=>void){
  const data=JSON.parse(save) as {world:WorldState};edit(data.world);
  return ()=>decodeWorldSave(JSON.stringify(data));
}

describe('civic memorial save provenance',()=>{
  it('loads an old slot and preserves separate original and contested readings after the ordinary chronicle window',()=>{
    const old=JSON.parse(encodeWorldSave(createInitialWorld(89))) as {world:Partial<WorldState>};
    delete old.world.civicMemorials;
    expect(decodeWorldSave(JSON.stringify(old)).civicMemorials).toEqual({deeds:[],memorials:[],nextDeedId:1,nextMemorialId:1});
    const {state,sourceEventId,editor}=confirmed(true);
    const saved=state.civicMemorials.deeds[0];
    expect(saved.errata?.retellings.length).toBe(2);
    expect(saved.errata?.correction).toBeDefined();
    let next=state;
    while(next.tick-saved.tick<=24)next=turn(next);
    expect(availableChronicleErrataActions(actor(next,editor),next).some(row=>row.targetChronicleSourceId===sourceEventId)).toBe(false);
    expect(decodeWorldSave(encodeWorldSave(next)).civicMemorials.deeds[0]).toEqual(saved);
  });

  it('rejects a convenient same name, a verifier who never witnessed, or a missing actual private debit',()=>{
    const {state,sameNameId,outsider}=confirmed();
    const save=encodeWorldSave(state);
    expect(corrupt(save,world=>{world.civicMemorials.deeds[0].subjectId=sameNameId;})).toThrow('civicMemorials.deeds.identity');
    expect(corrupt(save,world=>{world.civicMemorials.memorials[0].verification!.verifierId=outsider;})).toThrow('civicMemorials.memorials.verification');
    expect(corrupt(save,world=>{
      world.resourceFlow.months.flatMap(month=>month.entries).find(row=>row.mechanism==='civic_memorial')!.reason='other_payment';
    })).toThrow('civicMemorials.memorials.journal');
    expect(corrupt(save,world=>{world.settlements.records=world.settlements.records.filter(row=>row.kind!=='relief');}))
      .toThrow('civicMemorials.deeds.source');
  });
});
