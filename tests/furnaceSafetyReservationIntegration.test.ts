import { describe, expect, it, vi } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveAlchemy } from '../src/engine/alchemyEngine';
import { availableFurnaceReservationActions, availableFurnaceSlotSummary, canUseFurnace, claimFurnaceUse,
  getFurnaceView, heldFurnaceReservation, openFurnaceTurn, settleFurnaceTurn } from '../src/engine/furnaceReservationEngine';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { FurnaceSafetyMove, LLMDecisionPayload, WorldState } from '../src/types/world';

const action = (chosenAction:LLMDecisionPayload['chosenAction'], fields:Partial<LLMDecisionPayload> = {}): LLMDecisionPayload =>
  ({chosenAction,innerMonologue:'只用实际炉体、候炉记录与支付凭据。',...fields});
const brew = action('BREW_PILL',{targetPillId:'foundation'});
const turn = (world:WorldState,moves:Record<string,LLMDecisionPayload>={},reverse=false) => {
  const input=structuredClone(world);
  if(reverse) input.cultivators.reverse();
  const options=Object.fromEntries(input.cultivators.map(({id})=>[id,moves[id]??action('REST')]));
  return advanceWorldTick(input,options,()=>.05);
};
const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const place=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id)!;
const safety=(furnaceSafetyMove:FurnaceSafetyMove,targetFurnaceSafetyId:string)=>
  action('FURNACE_SAFETY',{furnaceSafetyMove,targetFurnaceSafetyId});
const reserve=(targetLocationId:string,targetWorkshopId?:string)=>action('FURNACE_RESERVATION',
  {furnaceMove:'reserve',targetLocationId,targetWorkshopId});
function fixture(){
  const world=createInitialWorld(9301);
  world.tick=24;
  world.month=5;
  const sect=world.sects.find(row=>row.id==='sect-danxia')!;
  const site=place(world,sect.headquartersId);
  const supervisor=person(world,sect.leaderId!);
  const [a,b,c]=world.cultivators.filter(row=>row.sectId===sect.id&&row.id!==supervisor.id)
    .sort((left,right)=>left.id<right.id?-1:1);
  const remote=place(world,'loc-market');
  for(const row of world.cultivators) row.locationId=remote.id;
  for(const row of [supervisor,a,b,c]){
    row.locationId=site.id;
    row.hp=row.maxHp;
    row.spiritStones=300;
    row.herbs.earth_root=12;
    row.herbs.jade_leaf=12;
    row.pills.foundation=0;
  }
  site.furnaceGrade=1;
  remote.furnaceGrade=1;
  const strike=(input:WorldState)=>applyMapBrush(input,'beast_tide',[{x:site.x,y:site.y}]);
  return {world,siteId:site.id,remoteId:remote.id,supervisorId:supervisor.id,a:a.id,b:b.id,c:c.id,strike};
}

describe('real damaged furnace reservations and producing custody',()=>{
  it.each([false,true])('suspends original exact requests once per closed tick and resumes for production (reversed = %s)',reverse=>{
    const {world,siteId,supervisorId,a,b,c,strike}=fixture();
    const auto=turn(world,{[c]:brew},reverse);
    const oldUse=auto.furnaceReservations.uses.find(row=>row.actorId===c)!;
    expect(oldUse).toMatchObject({siteId,kind:'brew',tick:auto.tick});
    const queued=turn(auto,{[a]:reserve(siteId),[b]:reserve(siteId)},reverse);
    const original=structuredClone(queued.furnaceReservations.reservations);
    expect(original).toHaveLength(2);
    const damaged=turn(strike(queued),{[a]:brew,[b]:brew,[c]:reserve(siteId)},reverse);
    const exactCase=damaged.furnaceSafety.cases.find(row=>row.siteId===siteId)!;
    expect(exactCase).toMatchObject({damagedTick:damaged.tick,integrity:70,severity:1});
    expect(damaged.furnaceReservations.uses).toContainEqual(oldUse);
    expect(damaged.furnaceReservations.uses.filter(row=>row.tick===damaged.tick)).toEqual([]);
    expect(getFurnaceView(damaged,person(damaged,a))).toMatchObject({
      capacity:0,closed:true,installedCapacity:1,slots:[],queue:[{position:1,isOwn:true},{position:2,isOwn:false}],
    });
    expect(availableFurnaceSlotSummary(damaged,person(damaged,a))).toEqual({capacity:0,queued:2,used:0,reserved:0});
    for(const row of original){
      expect(damaged.furnaceReservations.reservations.find(akt=>akt.id===row.id)).toMatchObject({
        ...row,expiresTick:row.expiresTick+1,suspendedTicks:1,lastSuspendedTick:damaged.tick,
      });
    }
    openFurnaceTurn(damaged);
    settleFurnaceTurn(damaged);
    expect(damaged.furnaceReservations.reservations.map(row=>row.suspendedTicks)).toEqual([1,1]);
    expect(availableFurnaceReservationActions(person(damaged,c),damaged)).toEqual([]);
    const runner=person(damaged,a);
    const before={stones:runner.spiritStones,herbs:{...runner.herbs},pills:{...runner.pills}};
    const rng=vi.fn(()=>0);
    expect(resolveAlchemy(damaged,runner,brew,rng)).toBeNull();
    expect(rng).not.toHaveBeenCalled();
    expect({stones:runner.spiritStones,herbs:runner.herbs,pills:runner.pills}).toEqual(before);

    let next=turn(turn(damaged,{},reverse),{},reverse);
    for(const move of ['inspect','repair','reopen'] as const){
      next=turn(next,{[supervisorId]:safety(move,exactCase.id),[a]:brew,[b]:brew},reverse);
      expect(next.furnaceSafety.cases.find(row=>row.id===exactCase.id)?.receipts.at(-1)).toMatchObject({kind:move,tick:next.tick});
      expect(next.furnaceReservations.uses.filter(row=>row.tick===next.tick)).toEqual([]);
    }
    expect(next.furnaceReservations.reservations.map(row=>row.suspendedTicks)).toEqual([6,6]);
    const earlier=original.find(row=>row.actorId===a)!;
    expect(heldFurnaceReservation(next,person(next,a))).toBeUndefined();
    expect(heldFurnaceReservation(next,person(next,a),next.tick+1)).toMatchObject({id:earlier.id,assignedTick:next.tick+1});
    const reopened=turn(next,{[a]:brew,[b]:brew},reverse);
    expect(reopened.furnaceReservations.uses.filter(row=>row.tick===reopened.tick))
      .toMatchObject([{siteId,actorId:a,reservationId:earlier.id,kind:'brew',slot:1}]);
    expect(reopened.furnaceReservations.reservations.find(row=>row.actorId===a)).toMatchObject({id:earlier.id,status:'used',suspendedTicks:6});
    expect(reopened.furnaceReservations.reservations.find(row=>row.actorId===b)).toMatchObject({status:'queued',suspendedTicks:6});
  });

  it('never extends a real workshop contract or makes replacement goods after the original deadline',()=>{
    const {world,siteId,a,c,strike}=fixture();
    const offered=turn(world,{[c]:action('WORKSHOP',{workshopMove:'offer',targetCultivatorId:a,
      workshopTier:'法器',workshopQuantity:1,workshopQualityFloor:'standard'})});
    const order=offered.workshops.orders.at(-1)!;
    expect(order).toMatchObject({makerId:a,patronId:c,status:'offered',siteId});
    const accepted=turn(offered,{[a]:action('WORKSHOP',{workshopMove:'accept',targetWorkshopId:order.id})});
    const contract=accepted.workshops.orders.find(row=>row.id===order.id)!;
    expect(contract).toMatchObject({status:'active',work:[]});
    expect(contract.escrowStones).toBeGreaterThan(0);
    const queued=turn(accepted,{[a]:reserve(siteId,order.id)});
    const booking=queued.furnaceReservations.reservations.find(row=>row.workshopOrderId===order.id)!;
    expect(booking).toMatchObject({status:'queued',actorId:a});
    let current=strike(queued);
    const work=action('WORKSHOP',{workshopMove:'work',targetWorkshopId:order.id});
    while(current.tick<contract.deadlineTick!) current=turn(current,{[a]:work});
    const ended=current.workshops.orders.find(row=>row.id===order.id)!;
    expect(ended).toMatchObject({deadlineTick:contract.deadlineTick,settledTick:contract.deadlineTick,status:'expired',closeReason:'work_expired',
      escrowStones:0,escrowHerbs:0,work:[]});
    expect(ended.refundedStones).toBe(contract.escrowStones);
    expect(ended.refundedHerbs).toBe(contract.escrowHerbs);
    expect(current.furnaceReservations.reservations.find(row=>row.id===booking.id)).toMatchObject({
      status:'cancelled',reason:'workshop_closed',closedTick:contract.deadlineTick,
      suspendedTicks:contract.deadlineTick!-booking.requestedTick-1,
    });
    expect(current.furnaceReservations.uses.some(row=>row.workshopOrderId===order.id)).toBe(false);
  });

  it('permits explicit cancellation, native invalidation and unrestricted production at an unaffected facility',()=>{
    const {world,siteId,remoteId,a,b,c,strike}=fixture();
    const remoteActor=world.cultivators.find(actor=>actor.locationId===remoteId)!;
    const queued=turn(world,{[a]:reserve(siteId),[b]:reserve(siteId),[c]:reserve(siteId)});
    const [left,gone,waiting]=[a,b,c].map(id=>queued.furnaceReservations.reservations.find(row=>row.actorId===id)!);
    person(queued,b).locationId=remoteId;
    const damaged=turn(strike(queued),{[a]:action('FURNACE_RESERVATION',{furnaceMove:'cancel',targetFurnaceReservationId:left.id})});
    expect(damaged.furnaceReservations.reservations.find(row=>row.id===left.id)).toMatchObject({status:'cancelled',reason:'owner_cancelled',suspendedTicks:1});
    const lost=damaged.furnaceReservations.reservations.find(row=>row.id===gone.id)!;
    expect(lost).toMatchObject({status:'cancelled',reason:'actor_unavailable',expiresTick:gone.expiresTick});
    expect(lost.suspendedTicks).toBeUndefined();
    expect(damaged.furnaceReservations.reservations.find(row=>row.id===waiting.id)).toMatchObject({status:'queued',suspendedTicks:1});
    expect(canUseFurnace(damaged,person(damaged,c),siteId,'forge')).toBe(false);
    const worker=person(damaged,remoteActor.id);
    expect(canUseFurnace(damaged,worker,remoteId,'forge')).toBe(true);
    expect(claimFurnaceUse(damaged,worker,remoteId,'forge')).toBe(true);
  });
});
