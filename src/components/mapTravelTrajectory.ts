import type {Cultivator,EscortContract,MapPoint,MarketShipment,PilgrimageJourney,WorldState} from '../types/world';
import {addFastForwardCalendarMonths} from '../engine/fastForwardCalendar';
import {canSeeMarketFreightCheckpoint,marketFreightCheckpoint} from '../engine/marketFreightCheckpoint';
import {PILGRIMAGE_LEG_COST,PILGRIMAGE_TILE_STRIDE,pilgrimageCheckpoint} from '../engine/pilgrimageEngine';
import {roadCrossingForLeg} from '../engine/roadEngine';
import {terrainTileAt} from '../engine/terrainEngine';
import {onLowerPlane} from '../engine/upperPassageIsolation';
import {visibleCheckpointRoute} from './mapConvoyView';
import type {createTerrainMapView} from './terrainMapView';

type TerrainView=ReturnType<typeof createTerrainMapView>;
export interface MapTravelTrajectoryMarker {
  id:string;
  kind:'caravan'|'pilgrimage';
  point:MapPoint;
  walked:readonly MapPoint[];
}

const same=(a:MapPoint|undefined,b:MapPoint|undefined)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
const samePath=(a:readonly MapPoint[],b:readonly MapPoint[])=>a.length===b.length&&a.every((p,i)=>same(p,b[i]));
const copy=({x,y}:MapPoint):MapPoint=>({x,y});
const unique=<T>(rows:readonly T[],matches:(row:T)=>boolean):T|undefined=>{
  let found:T|undefined;
  for(const row of rows)if(matches(row)){
    if(found!==undefined)return undefined;
    found=row;
  }
  return found;
};
const livingLower=(person:Cultivator|undefined):person is Cultivator=>!!person&&person.alive&&person.hp>0&&onLowerPlane(person);
const physicalTile=(world:WorldState,point:MapPoint|undefined)=>point&&terrainTileAt(world,point.x,point.y);
const visiblePoint=(world:WorldState,view:TerrainView,point:MapPoint|undefined)=>{
  const tile=physicalTile(world,point);
  return !!tile&&view.tileState(tile)==='visible';
};
const validCursor=(index:number,path:readonly MapPoint[])=>Number.isSafeInteger(index)&&index>=0&&index<path.length;
const actualStride=(index:number,next:number,stride:number,length:number)=>
  Number.isSafeInteger(stride)&&stride>0&&next>index&&next===Math.min(length-1,index+stride);

/** Do not draw a clipped stride: every new edge, including between two visible endpoints, has to be visible. */
function visibleStride(world:WorldState,view:TerrainView,path:MapPoint[],from:number,to:number):MapPoint[]{
  if(!validCursor(from,path)||!validCursor(to,path)||to<=from)return [];
  const points=path.slice(from,to+1).filter((point,i)=>i===0||!same(point,path[from+i-1]));
  if(points.length<2||!points.every(point=>visiblePoint(world,view,point)))return [];
  const visible=visibleCheckpointRoute(world,view,points,0);
  return visible&&samePath(visible.route,points)?points.map(copy):[];
}

function linkedShipment(world:WorldState,row:EscortContract):MarketShipment|undefined{
  const item=unique(world.markets.shipments,shipment=>shipment.id===row.shipmentId);
  if(!item||item.status!=='in_transit'||item.sellerId!==row.clientId||item.originId!==row.originId||
    item.destinationId!==row.destinationId||item.departedTick>world.tick)return undefined;
  const freight=row.freight;
  return !freight||freight.carrierId===row.escortId&&freight.buyOrderId===item.buyOrderId&&freight.sellOrderId===item.sellOrderId&&
    freight.buyerId===item.buyerId&&freight.good===item.good&&freight.quantity===item.quantity&&freight.unitPrice===item.unitPrice&&
    freight.departedTick===item.departedTick?item:undefined;
}

function sameCargo(current:MarketShipment|undefined,prior:MarketShipment|undefined):boolean{
  return !!current&&!!prior&&current.sequence===prior.sequence&&current.departedTick===prior.departedTick&&
    current.buyOrderId===prior.buyOrderId&&current.sellOrderId===prior.sellOrderId&&current.buyerId===prior.buyerId&&
    current.sellerId===prior.sellerId&&current.good===prior.good&&current.quantity===prior.quantity&&current.unitPrice===prior.unitPrice;
}

function selectedEscort(world:WorldState,viewer:Cultivator):EscortContract|undefined{
  const row=unique(world.escorts.contracts,item=>item.status==='active'&&item.escortId===viewer.id);
  return row&&row.originId===viewer.locationId&&row.arrivedTick===undefined&&row.acceptedTick!==undefined&&
    row.acceptedTick<=world.tick&&validCursor(row.pathIndex,row.path)&&linkedShipment(world,row)?row:undefined;
}

function actualFreightPin(world:WorldState,row:EscortContract,viewer:Cultivator,view:TerrainView):boolean{
  const freight=row.freight;
  if(!freight)return true;
  const dispatch=freight.dispatch;
  return !!dispatch&&row.acceptedTick!==undefined&&dispatch.tick>=row.acceptedTick&&dispatch.tick<=world.tick&&dispatch.pathIndex===1&&
    row.pathIndex>=dispatch.pathIndex&&dispatch.fromTileId!==dispatch.toTileId&&
    physicalTile(world,row.path[0])?.id===dispatch.fromTileId&&physicalTile(world,row.path[1])?.id===dispatch.toTileId&&
    row.feePaid===freight.fee&&row.feeEscrow===0&&row.rationsSpent>=1&&canSeeMarketFreightCheckpoint(world,viewer,viewer)&&
    same(marketFreightCheckpoint(world,viewer),view.trailPositions.get(viewer.id));
}

function caravan(world:WorldState,view:TerrainView,viewer:Cultivator,previous?:WorldState,previousViewer?:Cultivator):
  MapTravelTrajectoryMarker|undefined {
  const row=selectedEscort(world,viewer);
  if(!row||row.pathIndex<=0||row.lastAdvancedTick===undefined||row.lastAdvancedTick>world.tick||
    !actualFreightPin(world,row,viewer,view))return undefined;
  const point=row.path[row.pathIndex];
  if(!visiblePoint(world,view,point))return undefined;
  let walked:MapPoint[]=[];
  const prior=previous&&previousViewer?selectedEscort(previous,previousViewer):undefined;
  if(prior&&previous&&row.lastAdvancedTick===world.tick&&(prior.lastAdvancedTick??-Infinity)<=previous.tick&&
    prior.id===row.id&&prior.shipmentId===row.shipmentId&&sameCargo(linkedShipment(world,row),linkedShipment(previous,prior))&&
    prior.clientId===row.clientId&&prior.originId===row.originId&&prior.destinationId===row.destinationId&&
    prior.acceptedTick===row.acceptedTick&&prior.stride===row.stride&&!!prior.freight===!!row.freight&&
    samePath(row.path,prior.path)&&actualStride(prior.pathIndex,row.pathIndex,row.stride,row.path.length)){
    const crossed=[...new Set(row.path.slice(prior.pathIndex,row.pathIndex+1).map(p=>physicalTile(world,p)?.id))];
    if(crossed.every((id,i)=>id!==undefined&&id===row.lastCrossedTileIds[i])&&crossed.length===row.lastCrossedTileIds.length)
      walked=visibleStride(world,view,row.path,prior.pathIndex,row.pathIndex);
  }
  return {id:row.id,kind:'caravan',point:copy(point),walked};
}

function selectedPilgrimage(world:WorldState,viewer:Cultivator):PilgrimageJourney|undefined{
  const row=unique(world.pilgrimages.journeys,item=>item.status==='active'&&
    (item.organizerId===viewer.id||item.companionId===viewer.id));
  if(!row||row.organizerId===row.companionId||row.legIndex!==0&&row.legIndex!==1||
    row.startedTick===undefined||row.startedTick>world.tick||(row.expiresTick??0)<=world.tick||
    row.lastMovedTick===undefined||row.lastMovedTick<=row.startedTick||row.lastMovedTick>world.tick||
    row.pathIndex<=0||row.pathIndex>=row.path.length-1||!validCursor(row.pathIndex,row.path)||
    row.spentByEach!==(row.legIndex+1)*PILGRIMAGE_LEG_COST)return undefined;
  const originId=row.stopIds[row.legIndex],destinationId=row.stopIds[row.legIndex+1];
  const origin=unique(world.locations,loc=>loc.id===originId&&loc.type!=='secret_realm');
  const destination=unique(world.locations,loc=>loc.id===destinationId&&loc.type!=='secret_realm');
  if(!same(origin,row.path[0])||!same(destination,row.path.at(-1)))return undefined;
  const companionId=row.organizerId===viewer.id?row.companionId:row.organizerId;
  const companion=unique(world.cultivators,person=>person.id===companionId);
  return livingLower(companion)&&viewer.locationId===originId&&companion.locationId===originId&&
    same(row.path[row.pathIndex],pilgrimageCheckpoint(world,viewer))?row:undefined;
}

function pilgrimage(world:WorldState,view:TerrainView,viewer:Cultivator,previous?:WorldState,previousViewer?:Cultivator):
  MapTravelTrajectoryMarker|undefined {
  const row=selectedPilgrimage(world,viewer);
  if(!row)return undefined;
  const point=row.path[row.pathIndex];
  if(!visiblePoint(world,view,point)||!same(point,view.trailPositions.get(viewer.id)))return undefined;
  const prior=previous&&previousViewer?selectedPilgrimage(previous,previousViewer):undefined;
  const stride=roadCrossingForLeg(world,row)?.stride??PILGRIMAGE_TILE_STRIDE;
  const walked=prior&&row.lastMovedTick===world.tick&&prior.id===row.id&&prior.legIndex===row.legIndex&&
    prior.startedTick===row.startedTick&&prior.organizerId===row.organizerId&&prior.companionId===row.companionId&&
    prior.spentByEach===row.spentByEach&&row.stopIds.every((id,i)=>prior.stopIds[i]===id)&&samePath(row.path,prior.path)&&
    actualStride(prior.pathIndex,row.pathIndex,stride,row.path.length)?
    visibleStride(world,view,row.path,prior.pathIndex,row.pathIndex):[];
  return {id:row.id,kind:'pilgrimage',point:copy(point),walked};
}

/** The caller supplies a retained previous frame from the same timeline branch, never from a sibling. */
export function buildMapTravelTrajectory(world:WorldState,view:TerrainView,viewer?:Cultivator,previousWorld?:WorldState):
  {markers:readonly MapTravelTrajectoryMarker[];hasMotion:boolean} {
  if(!livingLower(viewer)||unique(world.cultivators,person=>person.id===viewer.id)!==viewer)return {markers:[],hasMotion:false};
  const next=previousWorld&&previousWorld.tick+1===world.tick&&addFastForwardCalendarMonths(previousWorld,1);
  const previous=next&&next.year===world.year&&next.month===world.month?previousWorld:undefined;
  const previousViewer=previous&&unique(previous.cultivators,person=>person.id===viewer.id);
  const retained=livingLower(previousViewer)?previousViewer:undefined;
  const markers=[caravan(world,view,viewer,previous,retained),pilgrimage(world,view,viewer,previous,retained)]
    .filter((marker):marker is MapTravelTrajectoryMarker=>marker!==undefined);
  return {markers,hasMotion:markers.some(({walked})=>walked.length>1)};
}
