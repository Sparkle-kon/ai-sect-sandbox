import {describe,expect,it} from 'vitest';
import { decodeWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { advanceMentorTransfers } from '../src/engine/mentorTransferEngine';
import type {WorldState} from '../src/types/world';
import { resolveMentorTransferAction } from '../src/engine/mentorTransferEngine';
import { move, next, offeredTransfer, priorActualMentorship } from './fixtures/mentorTransferFixture';

const tamper=(save:string,mutate:(world:WorldState)=>void)=>{
  const payload:{world:WorldState}=JSON.parse(save);mutate(payload.world);
  return ()=>decodeWorldSave(JSON.stringify(payload));
};
function held(){
  const f=offeredTransfer(),{world,student,teacher,target}=f;next(world);
  expect(resolveMentorTransferAction(world,student,move('accept',target))).not.toBeNull();
  next(world);
  expect(resolveMentorTransferAction(world,student,move('attend',target))).not.toBeNull();
  expect(resolveMentorTransferAction(world,teacher,move('teach',target))).not.toBeNull();
  expect(advanceMentorTransfers(world)).toHaveLength(1);
  return f;
}
describe('mentor transfer signed native save proofs',()=>{
  it('migrates legacy learned records without inventing a release and preserves authentic held records',()=>{
    const {world}=priorActualMentorship();
    const stale:{world:Partial<WorldState>}=JSON.parse(encodeWorldSave(world));
    delete stale.world.mentorTransfers;
    const previous=decodeWorldSave(JSON.stringify(stale));
    expect(previous.mentorTransfers).toEqual({releases:[],transfers:[],nextId:1});
    expect(previous.mentorship).toEqual(world.mentorship);
    const done=held(), roundtrip=decodeWorldSave(encodeWorldSave(done.world));
    expect(roundtrip.mentorTransfers).toEqual(done.world.mentorTransfers);
    expect(roundtrip.mentorship).toEqual(done.world.mentorship);
  });

  it('rejects replacement credentials, early scheduling, invented mastery and attendance, or redebit',()=>{
    const f=held(), raw=encodeWorldSave(f.world);
    expect(tamper(raw,world=>{world.mentorTransfers.releases[0].sourceTuitionId='false-old-receipt';}))
      .toThrow('mentorTransfers.releases.source');
    expect(tamper(raw,world=>{world.mentorTransfers.releases[0].endedById=f.old.id;}))
      .toThrow('mentorTransfers.releases.source');
    expect(tamper(raw,world=>{world.mentorTransfers.transfers[0].periodTick=world.tick-1;}))
      .toThrow('mentorTransfers.transfers.schedule');
    expect(tamper(raw,world=>{delete world.mentorTransfers.transfers[0].attendTick;}))
      .toThrow('mentorTransfers.transfers.outcome');
    expect(tamper(raw,world=>{world.mentorTransfers.transfers[0].lesson!.masteryAfter+=1;}))
      .toThrow('mentorTransfers.transfers.outcome');
    expect(tamper(raw,world=>{const [row]=world.mentorTransfers.transfers;
      world.mentorTransfers.transfers.push({...row,id:`mentor-transfer-${world.mentorTransfers.nextId++}`});}))
      .toThrow('mentorTransfers.transfers.doubleBooking');
  });

  it('retains an actual release source through maintenance beyond ordinary tuition history',()=>{
    const f=offeredTransfer();const {world,source}=f;
    for(let index=0;index<170;index++){
      world.mentorship.offers.unshift({...source,id:`unrelated-old-${index}`,status:'declined'});
    }
    next(world);
    expect(world.mentorship.offers).toContainEqual(source);
    const decoded=decodeWorldSave(encodeWorldSave(world));
    expect(decoded.mentorTransfers.releases[0].sourceTuitionId).toBe(source.id);
  });
});
