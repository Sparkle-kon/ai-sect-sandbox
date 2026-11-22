import type {WorldState} from '../types/world';

export function waypostMealServedThisTick(world:WorldState,actorId:string,tick=world.tick):boolean{
  return world.waypostMeals?.meals.some(row=>row.status==='served'&&row.closedTick===tick&&
    (row.hostId===actorId||row.guestId===actorId))??false;
}
