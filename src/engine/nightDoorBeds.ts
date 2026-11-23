import type {NightDoorEncounter} from '../types/nightDoor';
import type {WorldState} from '../types/world';

function holds(world:WorldState,row:NightDoorEncounter,tick:number){
  const o=row.offer;
  if(o?.move!=='shelter'||o.acceptedTick===undefined||o.acceptedTick>tick||o.expiresTick===undefined||o.expiresTick<=tick||row.closedTick!==undefined)return false;
  const guest=world.cultivators.filter(actor=>actor.id===row.guestId);
  return guest.length===1&&guest[0].alive&&guest[0].hp>0&&guest[0].positionPlane===undefined&&guest[0].locationId===row.siteId;
}
const count=(world:WorldState,tick:number,match:(row:NightDoorEncounter)=>boolean)=>
  world.nightDoors?.encounters.filter(row=>match(row)&&holds(world,row,tick)).length??0;
export const nightDoorBedsHeld=(world:WorldState,villageId:string,tick=world.tick)=>
  count(world,tick,row=>row.villageId===villageId);
export const nightDoorGuestHeld=(world:WorldState,actorId:string,tick=world.tick)=>
  count(world,tick,row=>row.guestId===actorId)>0;
export const nightDoorHouseholdHeld=(world:WorldState,householdId:string,tick=world.tick)=>
  count(world,tick,row=>row.hostHouseholdId===householdId)>0;
