import { describe,expect,it } from 'vitest';
import { proveWorkshopArtifactOrigin } from '../src/engine/artifactSalvageEngine';
import { decodeWorldSave,encodeWorldSave } from '../src/engine/storageEngine';
import { workshopCapacityActor as actor,workshopCapacityChoice as choice,workshopCapacityFixture,workshopCapacityMove as move,
  workshopCapacityOrder as orderAt,workshopCapacityTurn as turn } from './fixtures/workshopCapacityFixture';
import type { WorldState } from '../src/types/world';

function corrupt(raw:string,edit:(world:WorldState)=>void){
  const value=JSON.parse(raw) as {world:WorldState};
  edit(value.world);
  return ()=>decodeWorldSave(JSON.stringify(value));
}

describe('capacity terms retain signed histories and exact crafting provenance',()=>{
  it('requires both separately dated signatures and the exact current true closure and custody journal',()=>{
    const {world,payer,orderId}=workshopCapacityFixture();
    const offered=decodeWorldSave(encodeWorldSave(world));
    expect(orderAt(offered,orderId).capacityOffer).toEqual(orderAt(world,orderId).capacityOffer);
    expect(orderAt(offered,orderId).capacityAmendment).toBeUndefined();
    const accepted=turn(offered,{[payer]:move('accept',orderId)});
    const raw=encodeWorldSave(accepted);
    expect(decodeWorldSave(raw).workshops).toEqual(accepted.workshops);
    expect(corrupt(raw,state=>{orderAt(state,orderId).capacityOffer!.caseId='furnace-safety-999';}))
      .toThrow('workshops.capacity.physicalSource');
    expect(corrupt(raw,state=>{orderAt(state,orderId).capacityAmendment!.acceptedTick=orderAt(state,orderId).capacityOffer!.offeredTick;}))
      .toThrow('workshops.capacity.amendment');
    expect(corrupt(raw,state=>{orderAt(state,orderId).capacityAmendment!.workUntilTick++;}))
      .toThrow('workshops.capacity.amendment');
    expect(corrupt(raw,state=>{
      state.resourceFlow.months.flatMap(({entries})=>entries).find(row=>row.reason==='workshop_capacity_release')!.reason='workshop_refund';
    })).toThrow('workshops.capacity.releaseJournal');
  });

  it('recognizes a real first-piece delivery after the immutable old due date as ordinary valid later salvage provenance',()=>{
    const {world,payer,maker,supervisor,orderId,caseId,originalDeadline,work,blankTick}=workshopCapacityFixture();
    let state=turn(world,{[payer]:move('accept',orderId)});
    const hazardEnd=state.mapHazards.find(({kind})=>kind==='beast_tide')!.expiresTick;
    while(state.tick+1<hazardEnd)state=turn(state);
    for(const furnaceSafetyMove of ['inspect','repair','reopen'] as const) {
      state=turn(state,{[supervisor]:choice('FURNACE_SAFETY',{furnaceSafetyMove,targetFurnaceSafetyId:caseId})});
    }
    const done=decodeWorldSave(encodeWorldSave(turn(state,{[maker]:work})));
    const retained=orderAt(done,orderId);
    const item=actor(done,payer).artifacts[0];
    expect(done.tick).toBeGreaterThanOrEqual(originalDeadline);
    expect(retained.deadlineTick).toBe(originalDeadline);
    expect(retained.work).toHaveLength(2);
    expect(proveWorkshopArtifactOrigin(done,item)).toEqual({orderId,piece:1,makerId:maker,siteId:retained.siteId,blankTick,finishedTick:done.tick});
  });
});
