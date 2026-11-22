import {describe,expect,it} from 'vitest';
import {possessAvatar,queueAvatarWorkshopEstate} from '../src/engine/avatarEngine';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {availableWorkshopEstateActions} from '../src/engine/workshopEngine';
import type {WorkshopEstateMove,WorkshopQualityFloor,WorldState} from '../src/types/world';
import {buildEstatePhysicalBlank,estateActor,estateActualDischarge,estateHeirId,estateMakerId,estateMonth,estateOpenAfterNativeDeath,
  estateOrder,estatePatronId,estateWork,nativeEstateTerms,patronEstate} from './workshopEstateNativeFixture';

const reload=(world:WorldState)=>decodeWorldSave(encodeWorldSave(world));
const extension=(world:WorldState)=>estateWork(world).estateContinuation!;
const next=(world:WorldState,actorId:string,workshopEstateMove:WorkshopEstateMove)=>estateMonth(world,{
  [actorId]:estateOrder('WORKSHOP_ESTATE',{workshopEstateMove,targetWorkshopId:estateWork(world).id}),
});
function altered(raw:string,mutate:(world:WorldState)=>void){
  const tree=JSON.parse(raw) as {world:WorldState};
  mutate(tree.world);
  return ()=>decodeWorldSave(JSON.stringify(tree));
}
function prepared(floor:WorkshopQualityFloor='standard'){
  const {world}=estateActualDischarge(floor),start=reload(world);
  const offered=reload(next(start,estateHeirId,'offer'));
  expect(extension(offered)).toMatchObject({phase:'offered',beneficiaryId:estateHeirId,offeredTick:19});
  const resumed=reload(next(offered,estateMakerId,'accept'));
  expect(extension(resumed)).toMatchObject({phase:'resumed',resumeTick:20,workUntilTick:24});
  const command=estateOrder('WORKSHOP',{workshopMove:'work',targetWorkshopId:estateWork(resumed).id});
  const completed=estateMonth(resumed,{[estateMakerId]:command});
  expect(extension(completed)).toMatchObject({phase:'completed',closedTick:21});
  return {start,offered,resumed,completed,command};
}
const refund=(world:WorldState,good:'stone'|'earth_root')=>world.resourceFlow.months.flatMap(month=>month.entries).find(step=>
  step.reason==='workshop_refund'&&step.refId===estateWork(world).id&&step.good===good)!;

describe('strict original funded blank and estate-continuation storage',()=>{
  it('preserves exact legacy bytes and requires an actual native probate and only remaining paid custody to hold',()=>{
    const ordinary=buildEstatePhysicalBlank(),oldRaw=encodeWorldSave(ordinary);
    expect(oldRaw).not.toContain('estateContinuation');
    expect(encodeWorldSave(decodeWorldSave(oldRaw))).toBe(oldRaw);
    const {world}=estateOpenAfterNativeDeath(),raw=encodeWorldSave(world),record=estateWork(reload(world));
    expect(record.status).toBe('probate_hold');
    expect(record.estateContinuation).toMatchObject({estateId:'estate-'+estatePatronId,heldTick:13,
      heldStones:nativeEstateTerms.totalStones-nativeEstateTerms.blankFuel,heldHerbs:1,phase:'held'});
    expect(patronEstate(world)).toMatchObject({deceasedId:estatePatronId,openedTick:13,status:'open'});
    expect(raw).toBe(encodeWorldSave(decodeWorldSave(raw)));
    const mutations:Array<[string,(world:WorldState)=>void]>=[
      ['workshops.estate.source',w=>{delete estateWork(w).estateContinuation;}],
      ['workshops.estate.probate',w=>{extension(w).heldTick++;}],
      ['workshops.estate.probate',w=>{extension(w).estateId='estate-'+estateHeirId;}],
      ['workshops.estate.heldBalance',w=>{extension(w).heldStones++;}],
      ['workshops.estate.offer',w=>{extension(w).beneficiaryId=estateHeirId;}],
      ['estateContinuation.phantomEstateDeposit',w=>{Object.assign(extension(w),{phantomEstateDeposit:42});}],
    ];
    for(const [field,mutate] of mutations)expect(altered(raw,mutate)).toThrow(field);
  });

  it('requires an adjudicated beneficiary, a later reply from the maker and the original paid finish',()=>{
    const {offered,resumed,completed,command}=prepared(),raw=encodeWorldSave(completed);
    expect(encodeWorldSave(estateMonth(reload(resumed),{[estateMakerId]:command}))).toBe(raw);
    expect(encodeWorldSave(reload(completed))).toBe(raw);
    const portable=encodeEraWorldSave(completed);
    expect(encodeEraWorldSave(decodeEraWorldSave(portable))).toBe(portable);
    const done=estateWork(completed);
    expect(done.work.map(receipt=>[receipt.tick,receipt.stage])).toEqual([[12,'blank'],[21,'finish']]);
    expect(estateActor(completed,estateHeirId).artifacts.some(artifact=>artifact.id===done.work[1].artifactId)).toBe(true);
    const offerRaw=encodeWorldSave(offered),resumeRaw=encodeWorldSave(resumed);
    expect(altered(offerRaw,w=>{extension(w).beneficiaryId=estateMakerId;})).toThrow('workshops.estate.offer');
    expect(altered(offerRaw,w=>{patronEstate(w).beneficiaryId=estateMakerId;})).toThrow('workshops.estate.offer');
    expect(altered(offerRaw,w=>{patronEstate(w).eligibleHeirs=patronEstate(w).eligibleHeirs.filter(row=>row.actorId!==estateHeirId);
      patronEstate(w).claims=patronEstate(w).claims.filter(row=>row.actorId!==estateHeirId);})).toThrow('workshops.estate.offer');
    expect(altered(resumeRaw,w=>{extension(w).resumeTick=extension(w).offeredTick;})).toThrow('workshops.estate.resume');
    expect(altered(resumeRaw,w=>{extension(w).workUntilTick!++;})).toThrow('workshops.estate.resume');
    const finish=completed.events.find(event=>event.id===`evt-workshop-${done.id}-21-finish-1`)!;
    expect(finish.actorIds).toEqual([estateHeirId,estateMakerId]);
    expect(altered(raw,w=>{w.events.find(event=>event.id===finish.id)!.actorIds=[estatePatronId,estateMakerId];}))
      .toThrow('workshops.estate.event');
    expect(altered(raw,w=>{delete w.events.find(event=>event.id===finish.id)!.witnessScope;}))
      .toThrow('workshops.estate.event');
  });

  it('rejects a redirected, extra or premature refund while the exact estate release round-trips',()=>{
    const {offered}=prepared(),cancelled=next(offered,estateMakerId,'decline');
    const exact=encodeWorldSave(cancelled),record=estateWork(decodeWorldSave(exact));
    expect(record).toMatchObject({status:'cancelled',closeReason:'estate_returned',estateContinuation:{phase:'released',releaseReason:'declined',closedTick:20}});
    expect(refund(cancelled,'stone')).toMatchObject({kind:'transfer',to:{kind:'actor',id:estatePatronId},amount:record.refundedStones});
    expect(refund(cancelled,'earth_root')).toMatchObject({kind:'transfer',to:{kind:'actor',id:estatePatronId},amount:1});
    expect(altered(exact,w=>{
      const payment=refund(w,'stone');if(payment.kind==='transfer')payment.to.id=estateHeirId;
    })).toThrow('workshops.estate.journal');
    expect(altered(exact,w=>{
      const payment=refund(w,'stone'),month=w.resourceFlow.months.find(book=>book.tick===payment.tick)!;
      month.entries.push({...structuredClone(payment),id:w.resourceFlow.nextId++});
      month.totalEntries++;
      month.totals.find(good=>good.good==='stone')!.transfer+=payment.amount;
    })).toThrow('workshops.estate.journal');
    expect(altered(exact,w=>{extension(w).releaseReason='lapsed';})).toThrow('workshops.estate.returnReason');
    expect(altered(exact,w=>{delete estateWork(w).estateContinuation;})).toThrow('workshops.estate.source');
    expect(altered(exact,w=>{refund(w,'stone').reason='workshop_deposit';})).toThrow('workshops.estate.journal');
  });

  it('keeps the actual unqualified finish and only refunds the original estate the unpaid wage',()=>{
    const {completed}=prepared('fine'),raw=encodeWorldSave(completed),persisted=decodeWorldSave(raw),order=estateWork(persisted);
    expect(order).toMatchObject({status:'completed',qualityFloor:'fine',refundedStones:nativeEstateTerms.feePerPiece,refundedHerbs:0});
    expect(order.work[1]).toMatchObject({tick:21,stage:'finish',quality:'standard'});
    expect(order.work[1].artifactId).toBeUndefined();
    expect(order.work[1].feePaid).toBeUndefined();
    expect(refund(persisted,'stone')).toMatchObject({amount:nativeEstateTerms.feePerPiece,kind:'transfer',
      to:{kind:'actor',id:estatePatronId}});
    expect(persisted.resourceFlow.months.flatMap(book=>book.entries).some(line=>line.refId===order.id&&line.reason==='workshop_wage')).toBe(false);
    expect(altered(raw,w=>{estateWork(w).work[1].feePaid=nativeEstateTerms.feePerPiece;})).toThrow('workshops.work.quality');
  });

  it('round-trips exact next witnessed estate avatar intent without taking work custody on queue',()=>{
    const {world}=estateActualDischarge(),slot=reload(world),order=estateWork(slot);
    expect(possessAvatar(slot,estateHeirId)).toBe(true);
    const offer=availableWorkshopEstateActions(estateActor(slot,estateHeirId),slot,slot.tick+1).find(entry=>entry.workshopEstateMove==='offer')!;
    expect(queueAvatarWorkshopEstate(slot,estateHeirId,offer)).toBe(true);
    const raw=encodeWorldSave(slot),after=decodeWorldSave(raw);
    expect(after.playerAvatar.pendingOrder).toEqual(slot.playerAvatar.pendingOrder);
    expect(estateWork(after).escrowStones).toBe(order.escrowStones);
    expect(extension(estateMonth(after))).toMatchObject({phase:'offered',beneficiaryId:estateHeirId});
    expect(altered(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetCultivatorId:estateMakerId});}))
      .toThrow('pendingOrder.targetCultivatorId');
    expect(altered(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetWorkshopId:'commission-999'});}))
      .toThrow('playerAvatar.workshopEstateOrder');
  });
});
