import { describe,expect,it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { resolveObservatoryAction } from '../src/engine/fieldObservatoryEngine';
import {
  advanceShortShifts, availableShortShiftActions, resolveShortShiftAction, SHORT_SHIFT_OFFER_TICKS, SHORT_SHIFT_WAGE, visibleShortShifts,
} from '../src/engine/shortShiftEngine';
import { localQiWeather } from '../src/engine/weatherEngine';
import type { Cultivator, LLMDecisionPayload, ShortShift, ShortShiftMove } from '../src/types/world';

function fixture() {
  const world=createInitialWorld(729);
  world.tick=18;
  world.month=6;
  const sect=world.sects[0];
  const host=world.cultivators.find(actor=>actor.id===sect.leaderId)!;
  const worker=world.cultivators.find(actor=>actor.sectId!==host.sectId)!;
  const other=world.cultivators.find(actor=>actor.sectId!==host.sectId && actor.id!==worker.id)!;
  const site=world.locations.find(place=>place.id===sect.headquartersId)!;
  for (const actor of [host,worker,other]) { actor.locationId=site.id;actor.spiritStones=100; }
  const step=()=>{++world.tick;if(world.month===12){world.month=1;++world.year;}else ++world.month;};
  const atObservatory=(actor:Cultivator,observatoryMove:'fund'|'measure',targetObservatoryTick?:number) =>
    resolveObservatoryAction(world,actor,{chosenAction:'FIELD_OBSERVATORY',observatoryMove,innerMonologue:'核对现地风候',
      targetLocationId:site.id,targetObservatoryTick});
  const act=(actor:Cultivator,shortShiftMove:ShortShiftMove,fields:Partial<LLMDecisionPayload>={}) =>
    resolveShortShiftAction(world,actor,{chosenAction:'SHORT_SHIFT',shortShiftMove,innerMonologue:'按现场轮次验收',...fields});
  const take=(actor:Cultivator,move:'accept'|'decline'|'withdraw'|'work',row:ShortShift)=>act(actor,move,{targetShortShiftId:row.id});
  const openTick=world.tick;
  expect(atObservatory(host,'fund')).not.toBeNull();
  step();step();
  expect(atObservatory(host,'measure',openTick)).not.toBeNull();
  const source=world.fieldObservatories.byActor[host.id].runs[0];
  const offer=()=>{
    expect(act(host,'offer',{targetCultivatorId:worker.id,targetObservatoryTick:openTick})).not.toBeNull();
    return world.shortShifts.shifts.at(-1)!;
  };
  const sign=()=>{
    const row=offer();step();
    expect(take(worker,'accept',row)).not.toBeNull();
    return row;
  };
  return {world,sect,host,worker,other,site,step,act,take,offer,sign,source,openTick,atObservatory};
}

describe('cross-sect observatory shift and original personal wage custody',()=>{
  it('requires exact real qualified offer and later consent; pays only an actual due-time local read once',()=>{
    const {world,sect,host,worker,other,site,step,act,take,offer,source,openTick}=fixture();
    const ownerBefore=host.spiritStones, visitorBefore=worker.spiritStones, treasury=sect.spiritStones;
    const originalSource=structuredClone(source);
    const roleBaseline=[host,worker].map(({sectId,sectRank,contribution})=>({sectId,sectRank,contribution}));
    expect(act(host,'offer',{targetCultivatorId:worker.id,targetObservatoryTick:openTick-1})).toBeNull();
    expect(act(worker,'offer',{targetCultivatorId:host.id,targetObservatoryTick:openTick})).toBeNull();
    const row=offer();
    expect(row).toMatchObject({escrowStones:0,paidStones:0,refundedStones:0,status:'offered',observatoryOpenedTick:openTick,
      offerExpiresTick:world.tick+SHORT_SHIFT_OFFER_TICKS});
    expect(host.spiritStones).toBe(ownerBefore);
    expect(act(host,'offer',{targetCultivatorId:other.id,targetObservatoryTick:openTick})).toBeNull();
    expect(take(worker,'accept',row)).toBeNull();
    expect(visibleShortShifts(world,other)).toEqual([]);
    expect(visibleShortShifts(world,{...worker})).toEqual([]);
    step();
    expect(take(other,'accept',row)).toBeNull();
    expect(take(worker,'accept',row)).toMatchObject({witnessScope:'participants',actorIds:[host.id,worker.id]});
    expect(row).toMatchObject({acceptedTick:world.tick,shiftTick:world.tick+1,status:'active',escrowStones:SHORT_SHIFT_WAGE});
    expect(host.spiritStones).toBe(ownerBefore-SHORT_SHIFT_WAGE);
    expect(sect.spiritStones).toBe(treasury);
    expect(take(worker,'accept',row)).toBeNull();
    expect(take(worker,'work',row)).toBeNull();
    expect(availableShortShiftActions(worker,world,world.tick+1).find(option=>option.shortShiftMove==='work')).toBeDefined();
    step();
    const distant=world.locations.find(place=>place.id!==site.id)!;
    worker.locationId=distant.id;
    expect(take(worker,'work',row)).toBeNull();
    worker.locationId=site.id;
    expect(take(host,'work',row)).toBeNull();
    const {kind,intensity}=localQiWeather(world,site);
    expect(take(worker,'work',row)).toMatchObject({title:'访客到场实测并领薪',witnessScope:'participants'});
    expect(row).toMatchObject({status:'completed',escrowStones:0,refundedStones:0,paidStones:SHORT_SHIFT_WAGE,
      attendance:{tick:world.tick,reading:{kind,intensity}},closedTick:world.tick});
    expect(worker.spiritStones).toBe(visitorBefore+SHORT_SHIFT_WAGE);
    expect(host.spiritStones).toBe(ownerBefore-SHORT_SHIFT_WAGE);
    expect(sect.spiritStones).toBe(treasury);
    expect(world.fieldObservatories.byActor[host.id].runs[0]).toEqual(originalSource);
    expect([host,worker].map(({sectId,sectRank,contribution})=>({sectId,sectRank,contribution}))).toEqual(roleBaseline);
    expect(take(worker,'work',row)).toBeNull();
    expect(take(host,'withdraw',row)).toBeNull();
    expect(advanceShortShifts(world)).toEqual([]);
    const view=visibleShortShifts(world,worker);
    view[0].attendance!.reading.intensity=-1;
    expect(row.attendance?.reading.intensity).toBe(intensity);
  });

  it.each(['host','worker'] as const)('returns only unspent wage to the original personal purse after voluntary %s exit',who=>{
    const {world,sect,host,worker,other,take,sign}=fixture();
    const initial=host.spiritStones, workerBefore=worker.spiritStones, treasury=sect.spiritStones;
    const row=sign();
    expect(host.spiritStones).toBe(initial-SHORT_SHIFT_WAGE);
    expect(take(other,'withdraw',row)).toBeNull();
    const actor=who==='host'?host:worker;
    expect(take(actor,'withdraw',row)).not.toBeNull();
    expect(row).toMatchObject({status:'withdrawn',paidStones:0,refundedStones:SHORT_SHIFT_WAGE,escrowStones:0,
      closedById:actor.id,closeReason:who==='host'?'host_withdrew':'worker_withdrew'});
    expect(row.attendance).toBeUndefined();
    expect(host.spiritStones).toBe(initial);
    expect(worker.spiritStones).toBe(workerBefore);
    expect(sect.spiritStones).toBe(treasury);
    expect(take(actor,'withdraw',row)).toBeNull();
    expect(advanceShortShifts(world)).toEqual([]);
  });

  it.each(['title','ownership','membership','war','death','missed'] as const)('settles once with no attendance when %s invalidates signed work',reason=>{
    const {world,sect,host,worker,site,step,take,sign}=fixture();
    const initial=host.spiritStones, wageBefore=worker.spiritStones, treasury=sect.spiritStones;
    const row=sign(); step();
    switch(reason) {
      case 'title': sect.leaderId='changed';break;
      case 'ownership': site.ownerSectId=worker.sectId;break;
      case 'membership': worker.sectId=host.sectId;break;
      case 'war':
        world.diplomacy=world.diplomacy.filter(row=>![row.sectAId,row.sectBId].includes(host.sectId) ||
          ![row.sectAId,row.sectBId].includes(worker.sectId));
        world.diplomacy.push({sectAId:host.sectId,sectBId:worker.sectId,affinity:-60,pact:'war',sinceTick:world.tick});
        break;
      case 'death': host.alive=false;host.hp=0;break;
      case 'missed': worker.locationId='not-present';break;
    }
    expect(take(worker,'work',row)).toBeNull();
    expect(advanceShortShifts(world)).toHaveLength(1);
    expect(row).toMatchObject({escrowStones:0,refundedStones:SHORT_SHIFT_WAGE,paidStones:0,closedTick:world.tick,
      status:reason==='missed'?'expired':'revoked',
      closeReason:reason==='missed'?'shift_missed':reason==='death'?'party_lost':'access_revoked'});
    expect(row.attendance).toBeUndefined();
    expect(host.spiritStones).toBe(initial);
    expect(worker.spiritStones).toBe(wageBefore);
    expect(sect.spiritStones).toBe(treasury);
    expect(advanceShortShifts(world)).toEqual([]);
  });

  it('never escrows declined, unfunded or expired offers and rejects late duty',()=>{
    const {world,host,worker,take,offer,step}=fixture();
    const original=host.spiritStones, originalVisitor=worker.spiritStones;
    const first=offer();
    expect(take(worker,'decline',first)).not.toBeNull();
    expect(first).toMatchObject({status:'declined',refundedStones:0,paidStones:0,escrowStones:0});
    const other=offer();step();
    host.spiritStones=0;
    expect(take(worker,'accept',other)).toBeNull();
    host.spiritStones=original;
    while(world.tick<other.offerExpiresTick)step();
    expect(take(worker,'accept',other)).toBeNull();
    expect(advanceShortShifts(world)).toHaveLength(1);
    expect(other).toMatchObject({status:'expired',closeReason:'offer_expired',refundedStones:0,escrowStones:0,paidStones:0});
    expect(take(worker,'work',other)).toBeNull();
    expect(host.spiritStones).toBe(original);
    expect(worker.spiritStones).toBe(originalVisitor);
  });

  it('does not schedule a dual own-instrument shift or invite from evidence too old to survive a complete term',()=>{
    const {world,host,worker,take,offer,step,atObservatory,source}=fixture();
    const row=offer();
    expect(atObservatory(worker,'fund')).not.toBeNull();
    step();
    expect(take(worker,'accept',row)).toBeNull(); // Their own previously paid instrument requires the same work tick.
    expect(take(worker,'decline',row)).not.toBeNull();
    while(world.tick<source.targetTick+6)step();
    expect(availableShortShiftActions(host,world)).toEqual([]);
  });
});
