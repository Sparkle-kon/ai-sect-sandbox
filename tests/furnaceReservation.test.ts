import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import {
  availableFurnaceReservationActions, availableFurnaceSlotSummary, canUseFurnace, claimFurnaceUse, FURNACE_QUEUE_TICKS,
  getFurnaceView, heldFurnaceReservation, openFurnaceTurn, resolveFurnaceReservationAction, settleFurnaceTurn,
} from '../src/engine/furnaceReservationEngine';
import { currentVisibleTileIds, terrainTileAt } from '../src/engine/terrainEngine';
import type { Cultivator, FurnaceUseKind, LLMDecisionPayload, WorkshopOrder, WorldState } from '../src/types/world';

function fixture(size = 5, grade: 1 | 2 | 3 = 1) {
  const world = createInitialWorld(994);
  world.tick = 10;
  const site = world.locations[0];
  site.furnaceGrade = grade;
  const all = Array.from({ length:size }, (_,i): Cultivator => ({
    ...structuredClone(world.cultivators[i % world.cultivators.length]),id:`furnace-person-${String(i).padStart(3,'0')}`,
    locationId:site.id, alive:true, hp:100, tribulation:undefined,
  }));
  world.cultivators = all;
  const act = (actor: Cultivator, payload: Partial<LLMDecisionPayload>) => resolveFurnaceReservationAction(world,actor,{
    chosenAction:'FURNACE_RESERVATION',innerMonologue:'核对实际炉位',...payload,
  });
  const reserve = (actor: Cultivator, workshopOrderId?: string) => act(actor,{
    furnaceMove:'reserve',targetLocationId:site.id,...(workshopOrderId ? {targetWorkshopId:workshopOrderId} : {}),
  });
  const step = () => { ++world.tick; openFurnaceTurn(world); };
  const rows = () => world.furnaceReservations.reservations;
  return { world, site, all, act, reserve, step, rows };
}
function commission(world: WorldState, patron: Cultivator, maker: Cultivator, id = 'commission-1'): WorkshopOrder {
  const row: WorkshopOrder = { id,patronId:patron.id,makerId:maker.id,siteId:maker.locationId,tier:'法器',quantity:1,
    qualityFloor:'standard',status:'active',offeredTick:world.tick-1,offerExpiresTick:world.tick+2,acceptedTick:world.tick,
    deadlineTick:world.tick+7,escrowStones:55,escrowHerbs:2,refundedStones:0,refundedHerbs:0,work:[] };
  world.workshops.orders.push(row);
  return row;
}

describe('physical scarce furnace turns', () => {
  it.each([48,526])('queues the complete %i-person roster, grants one last slot by stable tie and leaves actors/assets intact', size => {
    const { world, site, all, act, reserve, step, rows } = fixture(size,3);
    const cargo = all.map(actor=>({ id:actor.id,stones:actor.spiritStones,herbs:actor.herbs,artifacts:actor.artifacts }));
    const snapshot = structuredClone(cargo);
    for (const actor of [...all].reverse()) expect(reserve(actor)?.witnessScope).toBe('participants');
    expect(rows()).toHaveLength(size);
    expect(reserve(all[0])).toBeNull();
    expect(rows().some(row=> row.status !== 'queued')).toBe(false);
    const pregrant = getFurnaceView(world,all[0])!;
    expect(pregrant.queue).toHaveLength(size);
    expect(pregrant.queue[0]).toMatchObject({position:1,isOwn:true});
    expect(act(all[0],{furnaceMove:'cancel',targetFurnaceReservationId:rows().find(row=>row.actorId === all[1].id)!.id})).toBeNull();
    expect(heldFurnaceReservation(world,all[2],world.tick+1)?.slot).toBe(3);
    expect(heldFurnaceReservation(world,all[3],world.tick+1)).toBeUndefined();
    step(); openFurnaceTurn(world);
    const winners = rows().filter(row=>row.status === 'reserved').sort((a,b)=>a.slot!-b.slot!);
    expect(winners.map(({ actorId,slot })=>({actorId,slot}))).toEqual(all.slice(0,3).map(({id},index)=>({actorId:id,slot:index + 1})));
    for (const actor of all.slice(3)) expect(claimFurnaceUse(world,actor,site.id,'forge')).toBe(false);
    for (const actor of [...all.slice(0,3)].reverse()) expect(claimFurnaceUse(world,actor,site.id,'forge')).toBe(true);
    expect(claimFurnaceUse(world,all[2],site.id,'brew')).toBe(false);
    expect(world.furnaceReservations.uses.map(row=>row.slot)).toEqual([3,2,1]);
    expect(world.cultivators.map(actor=>({ id:actor.id,stones:actor.spiritStones,herbs:actor.herbs,artifacts:actor.artifacts }))).toEqual(snapshot);
    expect(world.cultivators).toHaveLength(size);
  });

  it('prioritizes earlier requests, releases real cancellation, and never reopens a used seat after death', () => {
    const { world, site, all, act, reserve, step, rows } = fixture(5,1);
    const [aaa,bbb,ccc,ddd] = all;
    expect(reserve(ccc)).not.toBeNull();
    step();
    expect(heldFurnaceReservation(world,ccc)?.slot).toBe(1);
    expect(reserve(aaa)).not.toBeNull();
    const own = heldFurnaceReservation(world,ccc)!;
    expect(claimFurnaceUse(world,bbb,site.id,'brew')).toBe(false);
    expect(act(ccc,{furnaceMove:'cancel',targetFurnaceReservationId:own.id})).not.toBeNull();
    expect(rows().find(row=>row.id===own.id)).toMatchObject({status:'cancelled',reason:'owner_cancelled'});
    expect(claimFurnaceUse(world,bbb,site.id,'forge')).toBe(true);
    bbb.alive = false; bbb.hp = 0;
    expect(claimFurnaceUse(world,ddd,site.id,'brew')).toBe(false);
    settleFurnaceTurn(world);
    expect(world.furnaceReservations.uses).toHaveLength(1);
    step();
    expect(heldFurnaceReservation(world,aaa)?.slot).toBe(1);
    expect(claimFurnaceUse(world,aaa,site.id,'brew')).toBe(true);
  });

  it('frees an unused seat after real death, including a waiting candidate, but does not retroactively use a missed turn', () => {
    const { world,site,all,reserve,step,rows } = fixture(4,1);
    const [a,b,c] = all;
    expect(reserve(b)).not.toBeNull();
    expect(reserve(a)).not.toBeNull();
    step();
    expect(heldFurnaceReservation(world,a)?.slot).toBe(1);
    a.alive = false; a.hp = 0;
    expect(canUseFurnace(world,c,site.id,'forge')).toBe(false);
    expect(claimFurnaceUse(world,b,site.id,'brew')).toBe(true);
    expect(rows().find(row=>row.actorId===a.id)).toMatchObject({status:'cancelled',reason:'actor_unavailable'});
    expect(reserve(c)).not.toBeNull();
    step();
    expect(heldFurnaceReservation(world,c)?.slot).toBe(1);
    settleFurnaceTurn(world);
    expect(rows().find(row=>row.actorId===c.id)).toMatchObject({status:'expired',reason:'turn_missed',assignedTick:world.tick});
    expect(getFurnaceView(world,c)?.slots).toEqual([{slot:1,status:'free',isOwn:false}]);
    step();
    expect(heldFurnaceReservation(world,c)).toBeUndefined();
  });

  it('expires the exact losing queue boundary without fabricated spend or assignment', () => {
    const { world,site,all,reserve,step,rows } = fixture(8,1);
    for (const actor of [...all].reverse()) expect(reserve(actor)).not.toBeNull();
    const booked = world.tick;
    for (let n = 1; n < FURNACE_QUEUE_TICKS; n++) {
      step();
      expect(claimFurnaceUse(world,all[n-1],site.id,'forge')).toBe(true);
      settleFurnaceTurn(world);
    }
    step();
    expect(world.tick).toBe(booked+FURNACE_QUEUE_TICKS);
    expect(rows().filter(row=>row.status==='used')).toHaveLength(FURNACE_QUEUE_TICKS-1);
    expect(rows().filter(row=>row.status==='expired')).toHaveLength(8-(FURNACE_QUEUE_TICKS-1));
    expect(rows().find(row=>row.actorId===all[7].id)).toMatchObject({status:'expired',reason:'queue_expired'});
    expect(rows().find(row=>row.actorId===all[7].id)?.assignedTick).toBeUndefined();
  });

  it('preserves the named commission custody, refuses mismatched consumers and releases a closed commission before any burn', () => {
    const { world,site,all,act,reserve,step,rows } = fixture(4,1);
    const [maker,patron,outsider] = all;
    const live = commission(world,patron,maker);
    const escrow = [live.escrowStones,live.escrowHerbs,patron.artifacts.length];
    expect(reserve(patron,live.id)).toBeNull();
    expect(act(maker,{furnaceMove:'reserve',targetWorkshopId:live.id})).toBeNull();
    expect(reserve(maker,live.id)).not.toBeNull();
    expect([live.escrowStones,live.escrowHerbs,patron.artifacts.length]).toEqual(escrow);
    step();
    expect(heldFurnaceReservation(world,maker)).toMatchObject({workshopOrderId:live.id});
    for (const operation of ['brew','forge','repair','awaken','relic'] satisfies FurnaceUseKind[]) {
      expect(claimFurnaceUse(world,maker,site.id,operation)).toBe(false);
    }
    expect(claimFurnaceUse(world,maker,site.id,'workshop','different-order')).toBe(false);
    expect(claimFurnaceUse(world,outsider,site.id,'workshop',live.id)).toBe(false);
    live.status='cancelled';
    expect(claimFurnaceUse(world,maker,site.id,'workshop',live.id)).toBe(false);
    expect(claimFurnaceUse(world,outsider,site.id,'relic')).toBe(true);
    expect(rows()[0]).toMatchObject({status:'cancelled',reason:'workshop_closed'});
    expect([live.escrowStones,live.escrowHerbs,patron.artifacts.length]).toEqual(escrow); // No furnace-side custody.
  });

  it('protects exact visibility and stale/dead/replaced actor identity, and cancels a lost furnace', () => {
    const { world,site,all,reserve,step,rows } = fixture(4,1);
    const [a,b,c] = all;
    expect(reserve(a)).not.toBeNull();
    expect(getFurnaceView(world,b)?.queue[0]).toEqual({position:1,requestedTick:world.tick,expiresTick:world.tick+FURNACE_QUEUE_TICKS,isOwn:false});
    expect(JSON.stringify(getFurnaceView(world,b))).not.toContain(a.id);
    expect(availableFurnaceSlotSummary(world,b,site.id)).toEqual({capacity:1,reserved:0,used:0,queued:1});
    const targetTile = terrainTileAt(world,site.x,site.y)!;
    const unseen = world.locations.find(other=>{
      if (other === site) return false;
      c.locationId = other.id;
      return !currentVisibleTileIds(world,c).has(targetTile.id);
    })!;
    expect(unseen).toBeDefined();
    expect(c.locationId).toBe(unseen.id);
    expect(getFurnaceView(world,c,site.id)).toBeUndefined();
    expect(availableFurnaceSlotSummary(world,c,site.id)).toBeUndefined();
    expect(availableFurnaceSlotSummary(world,undefined,site.id)).toBeUndefined();
    expect(availableFurnaceReservationActions({ ...a },world)).toEqual([]);
    step();
    site.furnaceGrade = 0;
    expect(claimFurnaceUse(world,a,site.id,'forge')).toBe(false);
    settleFurnaceTurn(world);
    expect(rows()[0]).toMatchObject({status:'cancelled',reason:'site_unavailable'});
    expect(getFurnaceView(world,a)).toBeUndefined();
  });
});
