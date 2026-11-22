import type {Cultivator,LocationNode,MapPoint,MapTile,PilgrimageJourney,RoadCrossing,RoadLink,VillageSupplyAgreement,VillageSupplyLeg,WorldState} from '../types/world';
import {regionForColumn} from './simulationRegionGeometry';
import {currentVisibleTileIds,knownMapLocations,terrainTileAt} from './terrainEngine';
import {onLowerPlane} from './upperPassageIsolation';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {doctrineFoundingPhysicallyAt} from './doctrineFoundingEngine';
import {danxiaMedicineCheckpoint} from './danxiaMedicineTerms';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {courierCheckpoint} from './sealedCourierEngine';
import {pilgrimageCheckpoint} from './pilgrimageEngine';
import {ROAD_CONDITION_MAX,ROAD_FARE,ROAD_PAID_STRIDE,ROAD_PATH_TILE_LIMIT,visibleRoadCrossings,visibleRoads} from './roadEngine';
import {VILLAGE_SUPPLY_MAX_ROUTE_TILES} from './villageSupplyAccounting';
import {PHYSICAL_ATLAS_CHART_ID,PHYSICAL_ATLAS_REGION_IDS} from './physicalAtlasTerms';
import type {PhysicalAtlasAddress,PhysicalAtlasBorder,PhysicalAtlasLocal,PhysicalAtlasPoint,PhysicalAtlasRegionId,
  PhysicalAtlasRouteKind,PhysicalAtlasRouteView,PhysicalAtlasView} from './physicalAtlasTerms';

export type {PhysicalAtlasView,PhysicalAtlasRouteView} from './physicalAtlasTerms';
export interface PhysicalAtlasRegionRecord {
  id:PhysicalAtlasRegionId;
  chartId:typeof PHYSICAL_ATLAS_CHART_ID;
  tileCount:number;
  locationIds:string[];
  settlementIds:string[];
}
export interface PhysicalAtlasTraversal {
  kind:'road_crossing'|'village_supply_leg';
  refId:string;
  observedTick:number;
  borders:PhysicalAtlasBorder[];
}
export interface PhysicalAtlasRouteRecord extends PhysicalAtlasRouteView {
  establishedTick:number;
  fromLocationId:string;
  toLocationId:string;
  path:PhysicalAtlasPoint[];
  traversals:PhysicalAtlasTraversal[];
}
export interface PhysicalAtlasInspection {
  regions:PhysicalAtlasRegionRecord[];
  borders:PhysicalAtlasBorder[];
  /** Physical boundaries only; same-region native routes are not entered here. */
  routes:PhysicalAtlasRouteRecord[];
}
interface Grid {
  byId:Map<string,PhysicalAtlasPoint>;
  tiles:Map<string,MapTile>;
  regions:PhysicalAtlasRegionRecord[];
  borders:PhysicalAtlasBorder[];
  sites:Map<string,LocationNode>;
}

const stableSite=(site:LocationNode):boolean=>site.type!=='secret_realm'&&site.type!=='abyss'&&!isScopedExpeditionGate(site);
const integer=(number:number,minimum:number,maximum=Number.MAX_SAFE_INTEGER)=>
  Number.isSafeInteger(number)&&number>=minimum&&number<=maximum;
const equalPoint=(a:MapPoint|undefined,b:MapPoint|undefined)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
const adjacent=(a:PhysicalAtlasPoint,b:PhysicalAtlasPoint)=>Math.abs(a.row-b.row)+Math.abs(a.col-b.col)===1;
const between=(a:PhysicalAtlasPoint,b:PhysicalAtlasPoint):PhysicalAtlasBorder=>({from:a,to:b});
const orderedBorders=(path:readonly PhysicalAtlasPoint[]):PhysicalAtlasBorder[]=>path.slice(1).flatMap((to,i)=>
  path[i].regionId!==to.regionId?[between(path[i],to)]:[]);
const tileId=(point:PhysicalAtlasPoint)=>point.address.tileId;
const safeOwners=(world:WorldState,id:string|undefined)=>id&&world.sects.filter(row=>row.id===id).length===1?id:undefined;
function uniqueById<T extends {id:string}>(rows:readonly T[]):Map<string,T>{
  const result=new Map<string,T>(),duplicates=new Set<string>();
  for(const row of rows){
    if(result.has(row.id)){result.delete(row.id);duplicates.add(row.id);}
    if(!duplicates.has(row.id))result.set(row.id,row);
  }
  return result;
}
function pointAt(world:WorldState,grid:Pick<Grid,'byId'>,point:MapPoint|undefined){
  const cell=point&&terrainTileAt(world,point.x,point.y);
  return cell&&grid.byId.get(cell.id);
}
function gridFrom(world:WorldState):Grid|undefined {
  const terrain=world.terrain;
  if(!integer(terrain.columns,3,80)||!integer(terrain.rows,1,80)||terrain.tiles.length!==terrain.columns*terrain.rows)return undefined;
  const raw:PhysicalAtlasPoint[]=[],tiles=new Map<string,MapTile>();
  const catalog=new Map<PhysicalAtlasRegionId,PhysicalAtlasRegionRecord>(PHYSICAL_ATLAS_REGION_IDS.map(id=>
    [id,{id,chartId:PHYSICAL_ATLAS_CHART_ID,tileCount:0,locationIds:[],settlementIds:[]}]));
  for(const [index,tile] of terrain.tiles.entries()){
    if(tile.col!==index%terrain.columns||tile.row!==Math.floor(index/terrain.columns)||tile.id!==`tile-${tile.col}-${tile.row}`||
      tiles.has(tile.id))return undefined;
    const regionId=regionForColumn(tile.col,terrain.columns);
    const record=regionId&&catalog.get(regionId);
    if(!regionId||!record)return undefined;
    record.tileCount++;
    raw.push({address:{chartId:PHYSICAL_ATLAS_CHART_ID,tileId:tile.id},regionId,col:tile.col,row:tile.row});
    tiles.set(tile.id,tile);
  }
  const base=new Map(raw.map(row=>[tileId(row),row]));
  const sites=new Map([...uniqueById(world.locations)].filter(([,site])=>stableSite(site)));
  for(const site of sites.values()){
    const tile=pointAt(world,{byId:base},site);
    if(tile)catalog.get(tile.regionId)?.locationIds.push(site.id);
  }
  for(const village of uniqueById(world.settlements.villages).values()){
    const tile=pointAt(world,{byId:base},sites.get(village.locationId));
    if(tile)catalog.get(tile.regionId)?.settlementIds.push(village.id);
  }
  const regions=[...catalog.values()].filter(row=>row.tileCount>0&&row.locationIds.length>0);
  const enabled=new Set(regions.map(row=>row.id));
  const byId=new Map([...base].filter(([,point])=>enabled.has(point.regionId)));
  const borders:PhysicalAtlasBorder[]=[];
  for(const from of byId.values()){
    // Present exactly one canonical edge per adjacent pair of cells.
    const right=raw[from.row*terrain.columns+from.col+1];
    if(from.col+1<terrain.columns&&right&&enabled.has(right.regionId)&&from.regionId!==right.regionId)
      borders.push(between(from,right));
  }
  return {byId,tiles,regions,borders,sites};
}
export function locatePhysicalAtlasAddress(world:WorldState,address:PhysicalAtlasAddress):PhysicalAtlasPoint|undefined {
  return address.chartId===PHYSICAL_ATLAS_CHART_ID?gridFrom(world)?.byId.get(address.tileId):undefined;
}
function validPath(points:(PhysicalAtlasPoint|undefined)[],maximum:number):PhysicalAtlasPoint[]|undefined {
  if(!integer(points.length,2,maximum)||!points.every((point):point is PhysicalAtlasPoint=>!!point))return undefined;
  // These two producers write simple ordered routes, never map render trails or diagonal shortcuts.
  const unique=new Set(points.map(tileId));
  return unique.size===points.length&&points.every((point,i)=>i===0||adjacent(points[i-1],point))?points:undefined;
}
interface NativePath {path:PhysicalAtlasPoint[];from:LocationNode;to:LocationNode;borders:PhysicalAtlasBorder[]}
function nativePath(path:PhysicalAtlasPoint[]|undefined,world:WorldState,grid:Grid,from:LocationNode|undefined,to:LocationNode|undefined):NativePath|undefined {
  if(!path||!from||!to||from.id===to.id||path[0]!==pointAt(world,grid,from)||path.at(-1)!==pointAt(world,grid,to))return undefined;
  const borders=orderedBorders(path);
  return borders.length?{path,from,to,borders}:undefined;
}
const serialBelow=(id:string,prefix:RegExp,next:number)=>{
  const value=Number(prefix.exec(id)?.[1]);
  return integer(value,1,next-1);
};
function roadPath(world:WorldState,grid:Grid,road:RoadLink):NativePath|undefined {
  const from=grid.sites.get(road.anchorSiteId),to=grid.sites.get(road.otherSiteId);
  if(!from||!to||to.type!=='market'||!safeOwners(world,road.sectId)||
    !serialBelow(road.id,/^road-([1-9][0-9]*)$/u,world.roads.nextId)||
    !integer(road.openedTick,1,world.tick)||!integer(road.condition,0,ROAD_CONDITION_MAX)||
    (road.closedTick===undefined
      ? road.closeReason!==undefined||from.ownerSectId!==road.sectId||
        !world.sects.some(sect=>sect.id===road.sectId&&sect.headquartersId===from.id)||
        (to.ownerSectId!==undefined&&to.ownerSectId!==road.sectId)
      : !integer(road.closedTick,road.openedTick,world.tick)||(road.closeReason!=='title_lost'&&road.closeReason!=='endpoint_lost'))||
    !equalPoint(road.path[0],from)||!equalPoint(road.path.at(-1),to))return undefined;
  return nativePath(validPath(road.path.map(point=>pointAt(world,grid,point)),ROAD_PATH_TILE_LIMIT),world,grid,from,to);
}
function roadTraversals(world:WorldState,road:RoadLink,native:NativePath,crossings:readonly RoadCrossing[],
  journeys:ReadonlyMap<string,PilgrimageJourney>):PhysicalAtlasTraversal[]{
  return crossings.flatMap(row=>{
    if(!serialBelow(row.id,/^crossing-([1-9][0-9]*)$/u,world.roads.nextId)||
      !integer(row.departedTick,road.openedTick,road.closedTick??world.tick)||row.fee!==ROAD_FARE||row.stride!==ROAD_PAID_STRIDE||
      row.paidSteps!==road.path.length-1||!integer(row.freeSteps,1)||!integer(row.freeStride,1)||
      Math.ceil(row.paidSteps/row.stride)>=Math.ceil(row.freeSteps/row.freeStride)||(row.legIndex!==0&&row.legIndex!==1)||
      row.payerId===row.companionId)return [];
    const journey=journeys.get(row.journeyId);
    if(!journey||journey.organizerId!==row.payerId||journey.companionId!==row.companionId||
      !integer(journey.startedTick??0,1,row.departedTick-1)||!integer(journey.expiresTick??0,row.departedTick+1))return [];
    const from=journey.stopIds[row.legIndex],to=journey.stopIds[row.legIndex+1];
    const forward=from===native.from.id&&to===native.to.id;
    if(!forward&&!(from===native.to.id&&to===native.from.id))return [];
    const path=forward?native.path:[...native.path].reverse();
    const waypoint=journey.stopsVisited[row.legIndex],arrival=journey.stopsVisited[row.legIndex+1];
    if(waypoint?.locationId!==from||!integer(waypoint.tick,journey.startedTick!,row.departedTick-1))return [];
    let passed:PhysicalAtlasPoint[],observedTick:number;
    if(arrival?.locationId===to&&journey.legIndex>row.legIndex&&integer(arrival.tick,
      row.departedTick+Math.ceil(row.paidSteps/row.stride)-1,Math.min(world.tick,(journey.expiresTick??0)-1))){
      passed=path;observedTick=arrival.tick;
    }else if(journey.status==='active'&&journey.legIndex===row.legIndex&&
      integer(journey.pathIndex,1,row.paidSteps-1)&&integer(journey.lastMovedTick??0,row.departedTick,world.tick)&&
      journey.path.length===road.path.length&&journey.path.every((point,i)=>equalPoint(point,road.path[forward?i:road.path.length-1-i]))){
      observedTick=journey.lastMovedTick!;
      if(journey.pathIndex>(observedTick-row.departedTick+1)*row.stride)return [];
      passed=path.slice(0,journey.pathIndex+1);
    }else return [];
    const borders=orderedBorders(passed);
    return borders.length?[{kind:'road_crossing',refId:row.id,observedTick,borders}]:[];
  });
}
function freightPath(world:WorldState,grid:Grid,row:VillageSupplyAgreement):NativePath|undefined {
  if(!row.path||!row.legs||(row.status!=='active'&&row.status!=='completed')||
    !serialBelow(row.id,/^village-supply-([1-9][0-9]*)$/u,world.villageSupply.nextId)||
    !integer(row.offeredTick,1,world.tick)||!integer(row.acceptedTick??0,row.offeredTick+1,Math.min(world.tick,row.expiresTick-1))||
    !row.acceptor||row.proposer.actorId===row.acceptor.actorId||row.legs.length!==2||
    !row.legs.some(leg=>leg.good==='earth_root')||!row.legs.some(leg=>leg.good==='stone')||
    (row.status==='active')!==row.legs.some(leg=>leg.phase==='outbound'||leg.phase==='returning')||
    (row.status==='completed'?!integer(row.closedTick??0,row.acceptedTick??0,world.tick):row.closedTick!==undefined))return undefined;
  const villages=uniqueById(world.settlements.villages);
  const from=grid.sites.get(villages.get(row.fromSettlementId)?.locationId??'');
  const to=grid.sites.get(villages.get(row.toSettlementId)?.locationId??'');
  return nativePath(validPath(row.path.map(id=>grid.byId.get(id)),VILLAGE_SUPPLY_MAX_ROUTE_TILES),world,grid,from,to);
}
function freightLegProgress(row:VillageSupplyAgreement,leg:VillageSupplyLeg,last:number,tick:number):number|undefined {
  const started=row.acceptedTick;
  if(started===undefined||(leg.good!=='earth_root'&&leg.good!=='stone')||!integer(leg.checkpoint,0,last)||
    !integer(leg.lastAdvancedTick,started,row.closedTick??tick))return undefined;
  const elapsed=leg.lastAdvancedTick-started;
  const complete=leg.phase==='delivered'||leg.phase==='returned'||leg.phase==='lost';
  if(complete?!integer(leg.settledTick??0,started+1,leg.lastAdvancedTick)||leg.lastAdvancedTick!==leg.settledTick:leg.settledTick!==undefined)return undefined;
  if(leg.phase==='delivered')return leg.checkpoint===last&&elapsed>=last&&!leg.turnback?last:undefined;
  if(leg.phase==='outbound')return leg.checkpoint<last&&elapsed>=leg.checkpoint&&!leg.turnback?leg.checkpoint:undefined;
  if(leg.phase==='lost'&&!leg.turnback)return leg.loss&&elapsed>=leg.checkpoint?leg.checkpoint:undefined;
  const turn=leg.turnback;
  if(!turn||!integer(turn.checkpoint,leg.checkpoint,last)||!integer(turn.tick,started+turn.checkpoint+1,leg.lastAdvancedTick)||
    leg.lastAdvancedTick-turn.tick<turn.checkpoint-leg.checkpoint||
    (leg.phase==='returned'&&leg.checkpoint!==0)||(leg.phase==='lost'&&!leg.loss)||
    (leg.phase!=='returned'&&leg.phase!=='returning'&&leg.phase!=='lost'))return undefined;
  return turn.checkpoint;
}
function freightTraversals(world:WorldState,row:VillageSupplyAgreement,native:NativePath):PhysicalAtlasTraversal[] {
  const last=native.path.length-1;
  return (row.legs??[]).flatMap(leg=>{
    const far=freightLegProgress(row,leg,last,world.tick);
    if(far===undefined||far<1)return [];
    const path=leg.good==='earth_root'?native.path:[...native.path].reverse();
    const borders=orderedBorders(path.slice(0,far+1));
    return borders.length?[{kind:'village_supply_leg',refId:`${row.id}:${leg.good}`,
      observedTick:leg.lastAdvancedTick,borders}]:[];
  });
}
function routeRecord(kind:PhysicalAtlasRouteKind,id:string,tick:number,closed:boolean,
  native:NativePath,traversals:PhysicalAtlasTraversal[]):PhysicalAtlasRouteRecord {
  return {kind,id,status:closed?'closed':traversals.length?'traversed':'established',
    path:native.path,borders:native.borders,traversals,traversedBorders:traversals.flatMap(row=>row.borders),
    establishedTick:tick,fromLocationId:native.from.id,toLocationId:native.to.id};
}
function routeRecords(world:WorldState,grid:Grid,viewer?:Cultivator):PhysicalAtlasRouteRecord[] {
  const roads=viewer?new Set(visibleRoads(world,viewer).map(row=>row.id)):undefined;
  const seenCrossings=viewer?new Set(visibleRoadCrossings(world,viewer).map(row=>row.id)):undefined;
  const journeys=uniqueById(world.pilgrimages.journeys);
  const crossings=new Map<string,RoadCrossing[]>();
  for(const crossing of uniqueById(world.roads.crossings).values()){
    if(seenCrossings&&!seenCrossings.has(crossing.id))continue;
    const local=crossings.get(crossing.roadId);
    if(local)local.push(crossing);
    else crossings.set(crossing.roadId,[crossing]);
  }
  const roadRows=[...uniqueById(world.roads.links).values()].flatMap((row):PhysicalAtlasRouteRecord[]=>{
    const native=roadPath(world,grid,row);
    if(!native)return [];
    const walked=roadTraversals(world,row,native,crossings.get(row.id)??[],journeys);
    const established=routeRecord('road',row.id,row.openedTick,row.closedTick!==undefined,native,walked);
    if(!roads||roads.has(row.id))return [established];
    // While in flight the normal road-site view is suspended. Only verified, self-paid
    // footfalls can still be shown; no other part of the route is authorized.
    return walked.length?[{...established,status:'traversed',borders:established.traversedBorders}]:[];
  });
  const freightRows=[...uniqueById(world.villageSupply.agreements).values()].flatMap(row=>{
    if(viewer&&row.proposer.actorId!==viewer.id&&row.acceptor?.actorId!==viewer.id)return [];
    const native=freightPath(world,grid,row);
    if(!native||!row.acceptedTick||!row.legs)return [];
    const closed=row.status==='completed'&&!row.legs.every(leg=>leg.phase==='delivered');
    return [routeRecord('village_supply',row.id,row.acceptedTick,closed,native,freightTraversals(world,row,native))];
  });
  return [...roadRows,...freightRows];
}
/** Unscoped read-only structural audit for development, never a Canvas or model input. */
export function inspectPhysicalAtlas(world:WorldState):PhysicalAtlasInspection {
  const grid=gridFrom(world);
  return grid?{regions:grid.regions,borders:grid.borders,routes:routeRecords(world,grid)}:{regions:[],borders:[],routes:[]};
}
function scoutCheckpoint(world:WorldState,viewer:Cultivator){
  // Exactly the authoritative source priority used by currentVisibleTileIds, not map animation.
  return danxiaMedicineCheckpoint(world,viewer)??expeditionRescueCheckpoint(world,viewer)??boundaryReliefCheckpoint(world,viewer)??
    courierCheckpoint(world,viewer)??pilgrimageCheckpoint(world,viewer);
}
function localPoint(world:WorldState,address:MapPoint):PhysicalAtlasPoint|undefined {
  const {columns,rows,tiles}=world.terrain;
  if(!integer(columns,3,80)||!integer(rows,1,80)||tiles.length!==columns*rows)return undefined;
  const tile=terrainTileAt(world,address.x,address.y);
  if(!tile||!integer(tile.col,0,columns-1)||!integer(tile.row,0,rows-1)||tile.id!==`tile-${tile.col}-${tile.row}`||
    tiles[tile.row*columns+tile.col]!==tile)return undefined;
  // Guard against a corrupted recorded row/column pointing at itself from the wrong cell.
  const col=Math.min(columns-1,Math.floor(address.x/(1000/columns)));
  const row=Math.min(rows-1,Math.floor(address.y/(600/rows)));
  const regionId=regionForColumn(tile.col,columns);
  return tile.col===col&&tile.row===row&&regionId?{address:{chartId:PHYSICAL_ATLAS_CHART_ID,tileId:tile.id},regionId,col,row}:undefined;
}
function homeFor(world:WorldState,viewer?:Cultivator) {
  if(!viewer||!viewer.alive||viewer.hp<=0||!onLowerPlane(viewer)||!world.cultivators.includes(viewer))return undefined;
  const exact=world.locations.filter(row=>row.id===viewer.locationId);
  if(exact.length!==1||!stableSite(exact[0]))return undefined;
  const place=exact[0],checkpoint=scoutCheckpoint(world,viewer);
  if(!checkpoint&&!doctrineFoundingPhysicallyAt(world,viewer,place.id,world.tick))return undefined;
  const address=checkpoint??place;
  const point=localPoint(world,address);
  if(!point)return undefined;
  // A verified moving person is at their real checkpoint, not at a former home.
  if(checkpoint&&localPoint(world,place)?.regionId!==point.regionId&&
    !world.locations.some(site=>stableSite(site)&&localPoint(world,site)?.regionId===point.regionId))return undefined;
  const seen=currentVisibleTileIds(world,viewer);
  if(!seen.has(tileId(point)))return undefined;
  const stationary=!checkpoint&&knownMapLocations(world,viewer).includes(place);
  const locationOwnerSectId=stationary?safeOwners(world,place.ownerSectId):undefined;
  const tileOwnerSectId=safeOwners(world,terrainTileAt(world,address.x,address.y)?.ownerSectId);
  const home:PhysicalAtlasLocal={point,...(stationary?{locationId:place.id}:{}),
    ...(locationOwnerSectId?{locationOwnerSectId}:{}),...(tileOwnerSectId?{tileOwnerSectId}:{})};
  return {seen,home};
}
/** Exact current typed address, without compiling the chart or querying road/freight proofs. */
export function physicalAtlasHome(world:WorldState,viewer?:Cultivator):PhysicalAtlasLocal|undefined {
  return homeFor(world,viewer)?.home;
}
/** Safe local view. Turning map fog off does not bypass native route or current-visibility gates. */
export function projectPhysicalAtlas(world:WorldState,viewer?:Cultivator):PhysicalAtlasView|undefined {
  const nearby=homeFor(world,viewer);
  if(!nearby||!viewer)return undefined;
  const {seen,home}=nearby;
  const grid=gridFrom(world);
  if(!grid||!grid.byId.has(tileId(home.point)))return undefined;
  const scoped=(row:PhysicalAtlasBorder)=>seen.has(tileId(row.from))&&seen.has(tileId(row.to));
  const currentRegions=new Set([...seen].map(tile=>grid.byId.get(tile)?.regionId));
  const regions=PHYSICAL_ATLAS_REGION_IDS.filter(id=>currentRegions.has(id));
  const routes=routeRecords(world,grid,viewer).flatMap(({kind,id,status,borders,traversedBorders}):PhysicalAtlasRouteView[]=>{
    const visible=borders.filter(scoped);
    const walked=traversedBorders.filter(scoped);
    return visible.length?[{kind,id,status:status==='closed'?'closed':walked.length?'traversed':'established',borders:visible,traversedBorders:walked}]:[];
  });
  return {home,regions,borders:grid.borders.filter(scoped),routes};
}
