import type {Cultivator,WorldState} from '../types/world';
import { ascensionDutyActive } from './ascensionPresence';
import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {disasterShelterLocksTravel} from './disasterShelterCheckpoint';
import {activeEscortForActor} from './escortEngine';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {activePilgrimageForActor} from './pilgrimageEngine';
import {activeCourierForActor} from './sealedCourierEngine';
import {activeRelocationForActor,sparringLocksActor} from './siteDutyTerms';

export function isGrandSiegeFighterPresent(world:WorldState,actor:Cultivator,siteId:string){
  return actor.alive&&actor.hp>0&&actor.positionPlane===undefined&&!ascensionDutyActive(world,actor)&&actor.locationId===siteId&&
    actor.tribulation?.stage!=='lightning'&&actor.tribulation?.stage!=='heart_demon'&&
    !activeDanxiaMedicineEscort(world,actor)&&!activeEscortForActor(world,actor)&&!activeCourierForActor(world,actor)&&
    !activeRelocationForActor(world,actor)&&!activePilgrimageForActor(world,actor)&&!disasterShelterLocksTravel(world,actor)&&
    !expeditionRescueCheckpoint(world,actor)&&!boundaryReliefCheckpoint(world,actor)&&!sparringLocksActor(world,actor)&&
    !world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(actor.id))&&
    !world.forbiddenDuels?.some(row=>row.attackerId===actor.id||row.defenderId===actor.id);
}
