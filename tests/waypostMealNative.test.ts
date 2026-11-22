import {describe,expect,it} from 'vitest';
import {availableWaypostMealActions} from '../src/engine/waypostMealEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {PILGRIMAGE_LEG_COST,pilgrimageCheckpoint} from '../src/engine/pilgrimageEngine';
import {WAYPOST_MEAL_REST,waypostMealEventId} from '../src/types/waypostMeal';
import {acceptedWaypostMeal,mealActor,mealGroups,mealGuest,mealHost,mealLeaders,mealMonth,mealOrder,mealOutsider,
  offeredWaypostMeal,pairedMealPilgrims,pilgrimageOrder} from './waypostMealNativeFixture';

describe('native waypost meal',()=>{
  it('legally advances two independent paid parties to one live interior point',()=>{
    const {world,journeys,ids,point}=pairedMealPilgrims();
    expect(journeys[0].id).not.toBe(journeys[1].id);
    expect(journeys[0].stopIds).toEqual(journeys[1].stopIds);
    expect(ids.map(id=>mealActor(world,id).spiritStones)).toEqual(ids.map(()=>100-PILGRIMAGE_LEG_COST));
    expect(ids.map(id=>pilgrimageCheckpoint(world,mealActor(world,id)))).toEqual(ids.map(()=>point));
  });

  it('escrows and consumes one actual leaf over separate months, heals only the two consenting origins, and strictly resumes',()=>{
    const {before,offered,world,row,journeys,ids,point,tile}=acceptedWaypostMeal(true);
    const host=mealActor(before,mealHost);
    expect(row).toMatchObject({hostId:mealHost,guestId:mealGuest,hostVisit:{journeyId:journeys[0].id,pathIndex:journeys[0].pathIndex},
      guestVisit:{journeyId:journeys[1].id,pathIndex:journeys[1].pathIndex},
      point,tileId:tile.id,offeredTick:offered.tick,closedTick:world.tick,escrowLeaves:0,spentLeaves:1,returnedLeaves:0});
    expect(offered.waypostMeals?.meals[0]).toMatchObject({status:'offered',escrowLeaves:1,spentLeaves:0,returnedLeaves:0});
    expect(world.tick).toBe(offered.tick+1);
    expect(mealActor(offered,mealHost).herbs.jade_leaf).toBe(host.herbs.jade_leaf-1);
    expect(mealActor(world,mealHost).herbs.jade_leaf).toBe(host.herbs.jade_leaf-1);
    const recovery=[mealHost,mealGuest].map(actorId=>{
      const {hp:beforeHp,maxHp}=mealActor(offered,actorId);
      const afterHp=Math.min(maxHp,beforeHp+WAYPOST_MEAL_REST);
      expect(mealActor(world,actorId).hp).toBe(afterHp);
      return {actorId,beforeHp,afterHp,maxHp};
    });
    expect(row.recovery).toEqual(recovery);
    expect(recovery.map(r=>r.afterHp-r.beforeHp)).toEqual([3,WAYPOST_MEAL_REST]);
    for(const id of ids.filter(id=>id!==mealHost&&id!==mealGuest))expect(mealActor(world,id).hp).toBe(mealActor(offered,id).hp);
    expect(world.pilgrimages.journeys.map(({waypostMealWitnesses: _proof, ...itinerary}) => itinerary))
      .toEqual(before.pilgrimages.journeys);
    for (const journey of world.pilgrimages.journeys) {
      expect(journey.waypostMealWitnesses).toEqual([expect.objectContaining({
        mealId: row.id, offeredTick: offered.tick, pathIndex: journey.pathIndex, tileId: tile.id, point,
      })]);
    }
    expect(world.events.find(event=>event.id===waypostMealEventId(row.id,world.tick,'served')))
      .toMatchObject({witnessScope:'participants',actorIds:[mealHost,mealGuest]});
    const exact=world.resourceFlow.months.flatMap(month=>month.entries).filter(flow=>flow.refId===row.id);
    expect(exact).toEqual([expect.objectContaining({tick:offered.tick,kind:'transfer',reason:'waypost_meal_deposit',good:'jade_leaf',amount:1,
      from:{kind:'actor',id:mealHost},to:{kind:'waypost_meal',id:row.id},visibility:{kind:'participants',actorIds:[mealHost,mealGuest]}}),
      expect.objectContaining({tick:world.tick,kind:'consumption',reason:'waypost_meal_consumed',good:'jade_leaf',amount:1,
        from:{kind:'waypost_meal',id:row.id},visibility:{kind:'participants',actorIds:[mealHost,mealGuest]}})]);
    const pendingRaw=encodeEraWorldSave(offered),pending=decodeEraWorldSave(pendingRaw);
    expect(encodeEraWorldSave(pending)).toBe(pendingRaw);
    expect(encodeEraWorldSave(mealMonth(pending,{[mealGuest]:mealOrder(pending,mealGuest,'accept')}))).toBe(encodeEraWorldSave(world));
    const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
    expect(encodeEraWorldSave(restored)).toBe(raw);
    expect(encodeEraWorldSave(mealMonth(restored))).toBe(encodeEraWorldSave(mealMonth(world)));
  });

  it('refuses the wrong group or actor and returns exact escrow on the original guest declining',()=>{
    const {before,world,row}=offeredWaypostMeal(true);
    expect(mealActor(world,mealOutsider).name).toBe(mealActor(world,mealGuest).name);
    expect(pilgrimageCheckpoint(world,mealActor(world,mealOutsider))).toBeUndefined();
    const hostLeaf=mealActor(before,mealHost).herbs.jade_leaf;
    for(const wrongId of [mealGroups[0][1],mealGroups[1][1],mealOutsider]){
      expect(availableWaypostMealActions(mealActor(world,wrongId),world,world.tick+1).some(option=>option.waypostMealMove==='accept')).toBe(false);
      const refused=mealMonth(world,{[wrongId]:{chosenAction:'WAYPOST_MEAL',innerMonologue:'不得替人承认。',waypostMealMove:'accept',targetWaypostMealId:row.id}});
      expect(refused.waypostMeals?.meals[0]).toMatchObject({status:'offered',escrowLeaves:1});
    }
    const declined=mealMonth(world,{[mealGuest]:mealOrder(world,mealGuest,'decline')});
    expect(declined.waypostMeals?.meals[0]).toMatchObject({status:'declined',escrowLeaves:0,spentLeaves:0,returnedLeaves:1});
    expect(mealActor(declined,mealHost).herbs.jade_leaf).toBe(hostLeaf);
    expect(mealActor(mealMonth(declined),mealHost).herbs.jade_leaf).toBe(hostLeaf);
    expect(declined.pilgrimages.journeys).toEqual(world.pilgrimages.journeys);
    expect(declined.resourceFlow.months.flatMap(month=>month.entries).filter(flow=>flow.refId===row.id&&flow.reason==='waypost_meal_refund'))
      .toEqual([expect.objectContaining({kind:'transfer',good:'jade_leaf',amount:1,from:{kind:'waypost_meal',id:row.id},to:{kind:'actor',id:mealHost}})]);
  });

  it('returns unused custody when the guest group truly moves on or the offer expires',()=>{
    const {before,world,row,point}=offeredWaypostMeal();
    const hostLeaf=mealActor(before,mealHost).herbs.jade_leaf;
    const departed=mealMonth(world,{[mealGuest]:pilgrimageOrder(world,mealGuest,'advance')});
    expect(departed.waypostMeals?.meals[0]).toMatchObject({status:'missed',escrowLeaves:0,spentLeaves:0,returnedLeaves:1});
    expect(mealActor(departed,mealHost).herbs.jade_leaf).toBe(hostLeaf);
    expect(pilgrimageCheckpoint(departed,mealActor(departed,mealHost))).toEqual(point);
    expect(pilgrimageCheckpoint(departed,mealActor(departed,mealGuest))).not.toEqual(point);
    expect(availableWaypostMealActions(mealActor(departed,mealGuest),departed,departed.tick+1)
      .some(option=>option.waypostMealMove==='accept')).toBe(false);
    const guestJourney=departed.pilgrimages.journeys.find(row=>row.organizerId===mealGuest);
    const earlier=world.pilgrimages.journeys.find(row=>row.organizerId===mealGuest);
    expect(guestJourney?.stopIds).toEqual(earlier?.stopIds);
    expect(guestJourney?.lastMovedTick).toBe(departed.tick);
    let waiting=world;
    while(waiting.tick<row.expiresTick)waiting=mealMonth(waiting);
    expect(waiting.waypostMeals?.meals[0]).toMatchObject({status:'expired',closedTick:row.expiresTick,escrowLeaves:0,spentLeaves:0,returnedLeaves:1});
    expect(mealActor(waiting,mealHost).herbs.jade_leaf).toBe(hostLeaf);
    expect(waiting.pilgrimages.journeys.filter(row=>mealLeaders.some(id=>id===row.organizerId))).toEqual(world.pilgrimages.journeys);
  });
});
