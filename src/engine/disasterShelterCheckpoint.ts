import type {DisasterShelter} from '../types/disasterShelter';
import type {Cultivator, WorldState} from '../types/world';

export const DISASTER_SHELTER_OFFER_TICKS=3;
export const DISASTER_SHELTER_MAX_PATH=64;
export const DISASTER_SHELTER_MAX_OPEN=24;
export const DISASTER_SHELTER_HISTORY=24;
export const disasterShelterOpen=(row:DisasterShelter)=>
  row.status==='offered'||row.status==='reserved'||row.status==='outbound'||row.status==='occupied'||row.status==='returning';
export const disasterShelterRoomHeld=(row:DisasterShelter)=>
  row.status==='reserved'||row.status==='outbound'||row.status==='occupied'||
  row.status==='returning'&&row.returnDepartedTick===undefined;
export const disasterShelterPinnedRecordIds=(world:WorldState)=>new Set(world.disasterShelter?.cases.map(row=>row.disasterRecordId)??[]);

const interior=(row:DisasterShelter)=>row.pathIndex>0&&row.pathIndex<row.path.length-1;
export const disasterShelterStrandedInterior=(row:DisasterShelter)=>row.status==='stranded'&&interior(row);
export function disasterShelterLocksTravel(world:WorldState,actor:Cultivator):boolean{
  return !!world.disasterShelter?.cases.some(row=>row.guest.actorId===actor.id&&(
    disasterShelterOpen(row)&&row.status!=='offered'||disasterShelterStrandedInterior(row)));
}
export function disasterShelterCheckpoint(world:WorldState,actor:Cultivator):{x:number;y:number}|undefined{
  if(!actor.alive||actor.positionPlane!==undefined)return undefined;
  const row=world.disasterShelter?.cases.find(item=>item.guest.actorId===actor.id&&interior(item)&&
    (item.status==='outbound'||item.status==='returning'||item.status==='stranded'));
  if(!row)return undefined;
  const tile=world.terrain.tiles.find(item=>item.id===row.path[row.pathIndex]);
  if(!tile)return undefined;
  return {x:(tile.col+0.5)*1000/world.terrain.columns,y:(tile.row+0.5)*600/world.terrain.rows};
}
