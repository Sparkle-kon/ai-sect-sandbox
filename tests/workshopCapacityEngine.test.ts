import {describe,expect,it} from 'vitest';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {projectResourceFlowMonth} from '../src/engine/resourceFlowEngine';
import {availableWorkshopCapacityActions,resolveWorkshopCapacityAction,workshopTerms} from '../src/engine/workshopEngine';
import {workshopCapacityActor as actor,workshopCapacityChoice as choice,workshopCapacityFixture,workshopCapacityMove as move,
  workshopCapacityOrder as orderAt,workshopCapacityTurn as turn} from './fixtures/workshopCapacityFixture';

describe('verified capacity agreement releases only the completely unstarted piece',()=>{
  it.each([false,true])('keeps the original queue, paid blank and terms, then really finishes that one piece past original due (reverse %s)',reverse=>{
    const f=workshopCapacityFixture(false,reverse);
    const {world,payer,maker,supervisor,orderId,caseId,work,originalDeadline,blankTick,bookingId}=f;
    const old=orderAt(world,orderId);
    expect(old.capacityOffer).toEqual({caseId,damagedTick:world.tick,blankTick,makerId:maker,offeredTick:world.tick});
    const one=workshopTerms(old.tier,1);
    expect(old).toMatchObject({quantity:2,deadlineTick:originalDeadline,status:'active',escrowStones:110-one.blankFuel,escrowHerbs:3});
    expect(old.capacityAmendment).toBeUndefined();
    expect(resolveWorkshopCapacityAction(world,actor(world,payer),move('accept',orderId))).toBeNull();
    expect(resolveWorkshopCapacityAction(world,actor(world,maker),move('accept',orderId))).toBeNull();
    expect(availableWorkshopCapacityActions(actor(world,payer),world,world.tick+1)).toEqual([
      {action:'WORKSHOP_CAPACITY',workshopCapacityMove:'accept',targetWorkshopId:orderId},
    ]);
    const no=turn(world,{},reverse);
    let paid=turn(world,{[payer]:move('accept',orderId)},reverse);
    const redirected=orderAt(paid,orderId);
    expect(redirected).toMatchObject({quantity:2,deadlineTick:originalDeadline,status:'active',work:old.work,
      escrowStones:one.finishFuel+one.feePerPiece,escrowHerbs:1,refundedStones:one.totalStones,refundedHerbs:one.totalHerbs,
      capacityAmendment:{acceptedTick:paid.tick,patronId:payer,keptQuantity:1,releasedQuantity:1,workUntilTick:originalDeadline+4,
        releasedStones:one.totalStones,releasedHerbs:one.totalHerbs}});
    expect(actor(paid,payer).spiritStones-actor(no,payer).spiritStones).toBe(one.totalStones);
    expect(actor(paid,payer).herbs.earth_root-actor(no,payer).herbs.earth_root).toBe(one.totalHerbs);
    expect(actor(paid,maker).spiritStones-actor(no,maker).spiritStones).toBe(0);
    const adjustments=projectResourceFlowMonth(paid,paid.tick,{kind:'observer'})?.rows.filter(row=>row.refId===orderId&&
      row.reason==='workshop_capacity_release');
    expect(adjustments?.map(({good,amount})=>[good,amount])).toEqual([['stone',one.totalStones],['earth_root',one.totalHerbs]]);
    expect(resolveWorkshopCapacityAction(paid,actor(paid,payer),move('accept',orderId))).toBeNull();
    expect(paid.furnaceReservations.reservations.find(row=>row.id===bookingId)?.status).toBe('queued');
    expect(decodeWorldSave(encodeWorldSave(paid)).workshops).toEqual(paid.workshops);
    const endHazard=paid.mapHazards.find(row=>row.kind==='beast_tide')!.expiresTick;
    while(paid.tick+1<endHazard)paid=turn(paid,{},reverse);
    for(const furnaceSafetyMove of ['inspect','repair','reopen'] as const){
      paid=turn(paid,{[supervisor]:choice('FURNACE_SAFETY',{furnaceSafetyMove,targetFurnaceSafetyId:caseId}),[maker]:work},reverse);
      expect(paid.furnaceSafety.cases.find(row=>row.id===caseId)?.receipts.at(-1)?.kind).toBe(furnaceSafetyMove);
      expect(orderAt(paid,orderId).work).toEqual(old.work);
    }
    expect(paid.tick).toBeGreaterThanOrEqual(originalDeadline);
    const final=turn(paid,{[maker]:work},reverse);
    expect(orderAt(final,orderId)).toMatchObject({status:'completed',deadlineTick:originalDeadline,quantity:2,
      escrowStones:0,escrowHerbs:0,refundedStones:one.totalStones,refundedHerbs:2,
      work:[{stage:'blank',piece:1,tick:blankTick},{stage:'finish',piece:1,tick:final.tick,artifactId:expect.any(String)}]});
    expect(final.furnaceReservations.uses.find(row=>row.reservationId===bookingId)).toMatchObject({kind:'workshop',workshopOrderId:orderId});
    expect(actor(final,payer).artifacts).toHaveLength(1);
    expect(decodeWorldSave(encodeWorldSave(final)).workshops).toEqual(final.workshops);
    const fresh=turn(final,{[payer]:f.offer},reverse);
    expect(fresh.workshops.orders.at(-1)).toMatchObject({status:'offered',quantity:2});
    const accepted=turn(fresh,{[maker]:choice('WORKSHOP',{workshopMove:'accept',targetWorkshopId:fresh.workshops.orders.at(-1)!.id})},reverse);
    expect(accepted.workshops.orders.at(-1)).toMatchObject({status:'active',escrowStones:110,escrowHerbs:4});
    expect(actor(accepted,payer).artifacts[0].id).toBe(actor(final,payer).artifacts[0].id);
  });

  it('does not accept a malformed order, forged participant, or an impossible refund into a full actual inventory',()=>{
    const {world,payer,maker,orderId}=workshopCapacityFixture();
    world.tick++;
    const current=orderAt(world,orderId);
    const prior=current.escrowStones;
    expect(resolveWorkshopCapacityAction(world,structuredClone(actor(world,payer)),move('accept',orderId))).toBeNull();
    expect(resolveWorkshopCapacityAction(world,actor(world,payer),{...move('accept',orderId),targetCultivatorId:maker})).toBeNull();
    expect(resolveWorkshopCapacityAction(world,actor(world,payer),move('accept','commission-999'))).toBeNull();
    actor(world,payer).herbs.earth_root=9999;
    expect(availableWorkshopCapacityActions(actor(world,payer),world)).toEqual([]);
    expect(resolveWorkshopCapacityAction(world,actor(world,payer),move('accept',orderId))).toBeNull();
    expect(current.capacityAmendment).toBeUndefined();
    expect(current.escrowStones).toBe(prior);
    expect(current.refundedStones).toBe(0);
  });

  it('leaves institutional scope untouched and honors the ordinary custody return only after an amended first piece expires',()=>{
    const charter=workshopCapacityFixture(true);
    const legacy=orderAt(charter.world,charter.orderId);
    expect(legacy.institution).toBeDefined();
    expect(legacy.capacityOffer).toBeUndefined();
    const charterPreview=availableWorkshopCapacityActions(actor(charter.world,charter.maker),charter.world,charter.world.tick+1);
    expect(charterPreview).toEqual([]);
    const {world,payer,orderId,originalDeadline}=workshopCapacityFixture();
    let amended=turn(world,{[payer]:move('accept',orderId)});
    const one=workshopTerms('法器',1);
    while(amended.tick<originalDeadline+4)amended=turn(amended);
    const ended=orderAt(amended,orderId);
    expect(ended).toMatchObject({status:'expired',deadlineTick:originalDeadline,settledTick:originalDeadline+4,closeReason:'work_expired',
      refundedStones:110-one.blankFuel,refundedHerbs:3,escrowStones:0,escrowHerbs:0});
    expect(ended.work).toHaveLength(1);
    expect(actor(amended,payer).artifacts).toEqual([]);
    const remaining=projectResourceFlowMonth(amended,amended.tick,{kind:'observer'})?.rows.filter(row=>row.refId===orderId&&row.reason==='workshop_refund');
    expect(remaining?.map(({good,amount})=>[good,amount])).toEqual([
      ['stone',one.finishFuel+one.feePerPiece],['earth_root',1],
    ]);
  });
});
