import {describe,expect,it} from 'vitest';
import {availableWorkshopActions,availableWorkshopEstateActions,resolveWorkshopEstateAction} from '../src/engine/workshopEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {
  estateActualDischarge,estateActor,estateHeirId,estateMakerId,estateMonth,estateOpenAfterNativeDeath,estateOrder,
  estatePatronId,estateVisit,estateWork,estateWorkshopSite,nativeEstateTerms,patronEstate,
} from './workshopEstateNativeFixture';

const heldStones=nativeEstateTerms.totalStones-nativeEstateTerms.blankFuel;
const heldRoots=nativeEstateTerms.totalHerbs-1;
const flow=(world:WorldState)=>world.resourceFlow.months.flatMap(month=>month.entries)
  .filter(row=>row.mechanism==='workshop'&&row.refId===estateWork(world).id);
const wallet=(world:WorldState,id:string)=>estateActor(world,id).spiritStones;
const workshopId=(world:WorldState)=>estateWork(world).id;
const choice=(world:WorldState,workshopEstateMove:'offer'|'accept'|'decline')=>
  estateOrder('WORKSHOP_ESTATE',{workshopEstateMove,targetWorkshopId:workshopId(world)});
function go(world:WorldState,id:string,move:'offer'|'accept'|'decline'){
  const legal=availableWorkshopEstateActions(estateActor(world,id),world,world.tick+1).some(row=>
    row.workshopEstateMove===move&&row.targetWorkshopId===workshopId(world));
  expect(legal).toBe(true);
  return estateMonth(world,{[id]:choice(world,move)});
}
function restore(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}
const work=(world:WorldState)=>estateOrder('WORKSHOP',{workshopMove:'work',targetWorkshopId:workshopId(world)});

describe('genuine funded blank survives death, probate, and exact maker/heir consent',()=>{
  it('freezes the original balance and blank during actual native probate, not a second order or appointment',()=>{
    const {before,world:started}=estateOpenAfterNativeDeath('standard',true);
    const id=workshopId(before),original=estateWork(before).work[0];
    expect(estateWork(started)).toMatchObject({id,patronId:estatePatronId,makerId:estateMakerId,escrowStones:heldStones,
      escrowHerbs:heldRoots,refundedStones:0,refundedHerbs:0,work:[original],
      estateContinuation:{phase:'held',estateId:patronEstate(started).id,heldTick:13,heldStones,heldHerbs:heldRoots}});
    expect(wallet(started,estatePatronId)).toBe(0);
    let world=restore(started);
    while(world.tick<patronEstate(started).closesTick){
      expect(availableWorkshopEstateActions(estateActor(world,estateHeirId),world)).toEqual([]);
      expect(availableWorkshopActions(estateActor(world,estateMakerId),world).some(row=>
        row.targetWorkshopId===id&&(row.workshopMove==='work'||row.workshopMove==='cancel'))).toBe(false);
      expect(flow(world).some(row=>row.reason==='workshop_wage'||row.reason==='workshop_refund')).toBe(false);
      world=estateMonth(world,{[estateMakerId]:work(world)});
      expect(estateWork(world).work).toEqual([original]);
      expect(estateWork(world).escrowStones).toBe(heldStones);
    }
    expect(patronEstate(world)).toMatchObject({status:'settled',beneficiaryId:estateHeirId});
    expect(world.workshops.orders).toHaveLength(1);
  });

  it('resumes only after two exact consents and finishes the original blank for the actual adjudicated heir',()=>{
    const {before,world:discharged}=estateActualDischarge();
    const base=restore(discharged),original=estateWork(before),id=original.id;
    expect(estateWork(base).estateContinuation).toMatchObject({phase:'held',estateId:patronEstate(base).id});
    const offered=go(base,estateHeirId,'offer');
    expect(estateWork(offered).estateContinuation).toMatchObject({phase:'offered',beneficiaryId:estateHeirId,
      offeredTick:offered.tick,replyUntilTick:offered.tick+3});
    expect(availableWorkshopEstateActions(estateActor(offered,estateMakerId),offered).some(row=>row.workshopEstateMove==='accept')).toBe(false);
    expect(resolveWorkshopEstateAction(offered,estateActor(offered,estateHeirId),choice(offered,'accept'))).toBeNull();
    expect(resolveWorkshopEstateAction(offered,structuredClone(estateActor(offered,estateMakerId)),choice(offered,'accept'))).toBeNull();
    const resumed=go(offered,estateMakerId,'accept');
    expect(estateWork(resumed).estateContinuation).toMatchObject({phase:'resumed',resumeTick:resumed.tick,workUntilTick:resumed.tick+4});
    expect(estateWork(resumed).work).toEqual(original.work);
    expect(estateWork(resumed).escrowStones).toBe(heldStones);
    expect(flow(resumed).filter(row=>row.reason==='workshop_wage')).toHaveLength(0);
    const maker=estateActor(resumed,estateMakerId);
    expect(availableWorkshopActions(maker,resumed).some(row=>row.workshopMove==='work'&&row.targetWorkshopId===id)).toBe(false);
    expect(availableWorkshopActions(maker,resumed,true,resumed.tick+1).some(row=>row.workshopMove==='work'&&row.targetWorkshopId===id)).toBe(true);
    const done=estateMonth(resumed,{[estateMakerId]:work(resumed)});
    expect(estateWork(done)).toMatchObject({id,patronId:estatePatronId,makerId:estateMakerId,status:'completed',
      escrowStones:0,escrowHerbs:0,refundedStones:0,refundedHerbs:0,estateContinuation:{phase:'completed',beneficiaryId:estateHeirId},
      work:[original.work[0],{stage:'finish',piece:1,makerId:estateMakerId,feePaid:nativeEstateTerms.feePerPiece}]});
    const artifactId=`workshop-artifact-${id}-1`;
    const owners=done.cultivators.filter(row=>row.artifacts.some(item=>item.id===artifactId)).map(row=>row.id);
    expect(owners).toEqual([estateHeirId]);
    expect(done.events.find(row=>row.id===`evt-workshop-${id}-${done.tick}-finish-1`)).toMatchObject({
      actorIds:[estateHeirId,estateMakerId],witnessScope:'participants',locationId:estateWorkshopSite});
    expect(estateActor(done,estateHeirId).artifacts.find(row=>row.id===artifactId)).toMatchObject({
      workshopOrigin:{orderId:id,makerId:estateMakerId,blankTick:12,finishedTick:done.tick,piece:1,siteId:estateWorkshopSite}});
    expect(flow(done).filter(row=>row.reason==='workshop_wage')).toEqual([expect.objectContaining({tick:done.tick,
      amount:nativeEstateTerms.feePerPiece,kind:'transfer',to:{kind:'actor',id:estateMakerId}})]);
    expect(encodeEraWorldSave(estateMonth(restore(resumed),{[estateMakerId]:work(resumed)}))).toBe(encodeEraWorldSave(done));
    expect(encodeEraWorldSave(estateMonth(restore(done)))).toBe(encodeEraWorldSave(estateMonth(done)));
    expect(estateWork(before).work).toHaveLength(1);
    expect(before.workshops.orders).toHaveLength(1);
  });

  it('pays no wage for an original final piece that fails the originally agreed quality threshold',()=>{
    const {before,world:discharged}=estateActualDischarge('fine');
    const offered=go(discharged,estateHeirId,'offer'),resumed=go(offered,estateMakerId,'accept');
    const done=estateMonth(resumed,{[estateMakerId]:work(resumed)});
    const id=workshopId(done),original=estateWork(before).work[0];
    expect(estateWork(done)).toMatchObject({id,status:'completed',qualityFloor:'fine',escrowStones:0,escrowHerbs:0,
      refundedStones:nativeEstateTerms.feePerPiece,refundedHerbs:0,estateContinuation:{phase:'completed'},
      work:[original,{stage:'finish',piece:1,quality:'standard',stonesUsed:nativeEstateTerms.finishFuel,herbsUsed:1}]});
    expect(estateWork(done).work[1]).not.toHaveProperty('artifactId');
    expect(estateWork(done).work[1]).not.toHaveProperty('feePaid');
    expect(flow(done).some(row=>row.reason==='workshop_wage')).toBe(false);
    expect(flow(done).filter(row=>row.reason==='workshop_refund')).toEqual([expect.objectContaining({
      good:'stone',amount:nativeEstateTerms.feePerPiece,to:{kind:'actor',id:estatePatronId},
    })]);
    expect(wallet(done,estateHeirId)).toBe(wallet(discharged,estateHeirId)+nativeEstateTerms.feePerPiece);
    expect(encodeEraWorldSave(estateMonth(restore(resumed),{[estateMakerId]:work(resumed)}))).toBe(encodeEraWorldSave(done));
  });

  it('returns only the remaining estate-bound custody once after refusal or the resumed deadline is missed',()=>{
    const {before,world:discharged}=estateActualDischarge(),id=workshopId(discharged);
    const offered=go(discharged,estateHeirId,'offer');
    const declined=go(offered,estateMakerId,'decline');
    const resumed=go(offered,estateMakerId,'accept');
    let missed=restore(resumed);
    const deadline=estateWork(resumed).estateContinuation!.workUntilTick!;
    missed=estateMonth(missed);
    estateVisit(missed,estateHeirId,'loc-market-east');
    while(missed.tick<deadline)missed=estateMonth(missed);
    for(const [terminal,reason] of [[declined,'declined'],[missed,'lapsed']] as const){
      expect(estateWork(terminal)).toMatchObject({id,patronId:estatePatronId,makerId:estateMakerId,
        status:'cancelled',closeReason:'estate_returned',escrowStones:0,escrowHerbs:0,refundedStones:heldStones,refundedHerbs:heldRoots,work:estateWork(before).work,
        estateContinuation:{phase:'released',releaseReason:reason,closedTick:terminal.tick}});
      expect(wallet(terminal,estateHeirId)).toBe(wallet(discharged,estateHeirId)+heldStones);
      expect(estateActor(terminal,estateHeirId).herbs.earth_root).toBe(estateActor(discharged,estateHeirId).herbs.earth_root+heldRoots);
      expect(wallet(terminal,estatePatronId)).toBe(0);
      expect(patronEstate(terminal).distributed.stones).toBe(patronEstate(discharged).distributed.stones+heldStones);
      expect(patronEstate(terminal).distributed.herbs.earth_root).toBe(patronEstate(discharged).distributed.herbs.earth_root+heldRoots);
      expect(flow(terminal).filter(row=>row.reason==='workshop_wage')).toHaveLength(0);
      const returns=flow(terminal).filter(row=>row.reason==='workshop_refund');
      expect(returns).toEqual(expect.arrayContaining([
        expect.objectContaining({good:'stone',amount:heldStones,to:{kind:'actor',id:estatePatronId}}),
        expect.objectContaining({good:'earth_root',amount:heldRoots,to:{kind:'actor',id:estatePatronId}}),
      ]));
      expect(returns).toHaveLength(2);
      const reread=restore(terminal),later=estateMonth(reread);
      expect(estateWork(later).work).toHaveLength(1);
      expect(wallet(later,estateHeirId)).toBe(wallet(terminal,estateHeirId));
      expect(flow(later).filter(row=>row.reason==='workshop_refund')).toHaveLength(2);
    }
  });
});
