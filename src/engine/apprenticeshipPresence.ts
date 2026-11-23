import type {Cultivator,WorldState} from '../types/world';
import {activeDanxiaMedicineEscort,danxiaMedicineActedThisTick} from './danxiaMedicineTerms';
import {disasterShelterCheckpoint} from './disasterShelterCheckpoint';
import {pilgrimageForkActedThisTick,pilgrimageForkTravelLocked} from './pilgrimageForkPresence';
import {pilgrimageActedThisTick} from './pilgrimageEngine';
import {courierActedThisTick} from './sealedCourierEngine';

/** A conversation requires both bodies at the site, not the address retained by an active obligation. */
export function apprenticeshipPhysicallyAt(world:WorldState,actor:Cultivator,siteId:string,tick:number):boolean{
  const id=actor.id,guard=actor.guardAssignment;
  return actor.alive&&actor.hp>0&&actor.positionPlane===undefined&&actor.locationId===siteId&&actor.service?.status!=='retired'&&
    actor.tribulation?.stage!=='lightning'&&actor.tribulation?.stage!=='heart_demon'&&
    (!guard||guard.expiresTick<=tick||guard.locationId===siteId)&&
    !activeDanxiaMedicineEscort(world,actor)&&!disasterShelterCheckpoint(world,actor)&&!pilgrimageForkTravelLocked(world,actor)&&
    !world.boundaryReliefs.cases.some(row=>row.incomingId===id&&(row.status==='travelling'||row.status==='returning'))&&
    !world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(id))&&
    !world.escorts.contracts.some(row=>row.status==='active'&&row.escortId===id)&&
    !world.pilgrimages.journeys.some(row=>row.status==='active'&&(row.organizerId===id||row.companionId===id))&&
    !world.couriers.dispatches.some(row=>row.courierId===id&&(row.status==='in_transit'||row.status==='returning'))&&
    !world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(id))&&
    !world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(id))&&
    (tick!==world.tick||!danxiaMedicineActedThisTick(world,actor)&&!pilgrimageActedThisTick(world,actor)&&
      !pilgrimageForkActedThisTick(world,actor)&&!courierActedThisTick(world,actor));
}
