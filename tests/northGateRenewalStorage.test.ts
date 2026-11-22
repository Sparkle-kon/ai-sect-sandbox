import {describe,expect,it} from 'vitest';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {validateNorthGateRenewal} from '../src/engine/storageNorthGateRenewalValidation';
import {validateColdWaterVein} from '../src/engine/storageColdWaterVeinValidation';
import {availableNorthGateRenewalActions} from '../src/engine/northGateRenewalEngine';
import {findNorthGateRenewalSource,northGateRenewalDue} from '../src/engine/northGateRenewalTerms';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';

const master='elder-danxia-1';
const villager='recruit-village-loc-vein-north-vol-1';
const copies=(world:WorldState,change:(copy:WorldState)=>void)=>{
  const other=structuredClone(world);
  change(other);
  return other;
};
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const decisions=(world:WorldState)=>{
  const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'收息。'};
  return Object.fromEntries(world.cultivators.filter(row=>row.alive).map(row=>[row.id,rest]));
};
function atBoundary(){
  // Decoder unit fixture solely for the calendar boundary, not a millennial simulation claim.
  const {world}=prepareNorthWellHistoricalSource();
  const due=northGateRenewalDue(findNorthGateRenewalSource(world)!);
  world.tick=due;
  world.year+=3000;
  return world;
}

describe('native north gate hearing strict lifecycle and receipts',()=>{
  it('keeps the old optional ledger absent and validates actual expiry without an opening',()=>{
    const old=atBoundary();
    const fail=(path:string):never=>{throw new Error(path);};
    expect(()=>validateNorthGateRenewal(old,fail)).not.toThrow();
    expect(old.northGateRenewal).toBeUndefined();
    let current=old;
    for(let i=0;i<6;i++)current=advanceWorldTick(current,decisions(current));
    expect(current.northGateRenewal?.hearing.outcome).toEqual({kind:'failed',closedTick:old.tick+6});
    expect(()=>validateNorthGateRenewal(current,fail)).not.toThrow();
    expect(()=>validateNorthGateRenewal(copies(current,copy=>{
      const result=copy.northGateRenewal!.hearing.outcome;
      if(result?.kind==='failed')result.closedTick++;
    }),fail)).toThrow(/northGateRenewal.failed/u);
  });

  it('rejects a changed proof, loan, payment, independent signer or optional hearing stripped from a live receipt',()=>{
    const base=atBoundary();
    const choose=(world:WorldState,id:string,move:'endorse'|'accord')=>{
      const action=availableNorthGateRenewalActions(actor(world,id),world,world.tick+1).find(row=>row.northGateRenewalMove===move)!;
      return advanceWorldTick(world,{...decisions(world),[id]:{chosenAction:action.action,innerMonologue:'实址具押。',
        northGateRenewalMove:action.northGateRenewalMove,targetNorthGateRenewalId:action.targetNorthGateRenewalId}});
    };
    const funded=choose(choose(base,villager,'endorse'),master,'accord');
    expect(funded.northGateRenewal?.hearing.outcome).toMatchObject({kind:'reopened',paidStones:48,borrowedUnits:3,granaryRoots:1});
    const fail=(path:string):never=>{throw new Error(path);};
    const validate=(world:WorldState)=>{validateNorthGateRenewal(world,fail);validateColdWaterVein(world,fail);};
    expect(()=>validate(funded)).not.toThrow();
    for(const mutate of [
      (copy:WorldState)=>{copy.northGateRenewal!.hearing.source.passageTileId='tile-12-2';},
      (copy:WorldState)=>{copy.coldWaterVein!.openings.at(-1)!.borrowedUnits=9;},
      (copy:WorldState)=>{const result=copy.northGateRenewal!.hearing.outcome;if(result?.kind==='reopened')result.paidStones=64;},
      (copy:WorldState)=>{copy.northGateRenewal!.hearing.endorsement!.actorId=master;},
      (copy:WorldState)=>{delete copy.northGateRenewal;},
    ])expect(()=>validate(copies(funded,mutate))).toThrow(/northGateRenewal|coldWaterVein/u);
  });
});
