import type { RouteWarningObservation, WorldState } from '../types/world';
import { routeWarningEdgeKey,routeWarningExpiry,routeWarningHazardValid } from './routeWarningProof';
import { terrainTileAt } from './terrainEngine';

export function validateRouteWarningHistory(world:WorldState,actorIds:ReadonlySet<string>,fail:(path:string)=>never):void {
  const {notices,observations,nextId,nextObservationId}=world.routeWarnings;
  if(!notices.length && !observations.length) return;
  const tiles=new Map(world.terrain.tiles.map((tile)=>[tile.id,tile]));
  const journeys=new Map(world.pilgrimages.journeys.map((row)=>[row.id,row]));
  const warningIds=new Set<string>(),observationIds=new Set<string>(),physicalProofs=new Set<string>();
  const lifetimeByEdge=new Map<string,Array<{from:number;to:number}>>();
  const adjacent=(a:string,b:string):boolean=>{
    const left=tiles.get(a),right=tiles.get(b);
    return !!left && !!right && Math.abs(left.col-right.col)+Math.abs(left.row-right.row)===1;
  };
  const withinSerial=(id:string,pattern:RegExp,bound:number)=>{
    const value=Number(pattern.exec(id)?.[1]);
    return Number.isSafeInteger(value) && value<bound;
  };

  function observe(row:RouteWarningObservation) {
    const {id,actorId,journeyId,partyIds,observedTick,fromTileId,toTileId,fromPathIndex,toPathIndex,legIndex,exitTileId,exitPathIndex,hazard}=row;
    const directProof=JSON.stringify([actorId,journeyId,legIndex,toPathIndex,observedTick]);
    if(!withinSerial(id,/^route-observation-([1-9]\d*)$/,nextObservationId) || observationIds.has(id) ||
        physicalProofs.has(directProof) || !withinSerial(journeyId,/^pilgrimage-([1-9]\d*)$/,world.pilgrimages.nextId) ||
        partyIds.length!==2 || partyIds[0]===partyIds[1] || partyIds.some((p)=>!actorIds.has(p)) || !partyIds.includes(actorId) ||
        observedTick>world.tick || legIndex>1 || toPathIndex<=fromPathIndex || hazard.tileId!==toTileId ||
        !adjacent(fromTileId,toTileId) || !routeWarningHazardValid(world,hazard,observedTick) ||
        ((exitTileId===undefined)!==(exitPathIndex===undefined)) ||
        (exitTileId!==undefined && (exitTileId===fromTileId || (exitPathIndex ?? 0)<=toPathIndex || !adjacent(toTileId,exitTileId))))
      fail('routeWarnings.observations.source');
    observationIds.add(id);physicalProofs.add(directProof);
    const journey=journeys.get(journeyId);
    if(!journey) return;
    if(journey.organizerId!==partyIds[0] || journey.companionId!==partyIds[1] ||
        journey.startedTick===undefined || journey.startedTick>=observedTick ||
        observedTick>(journey.lastMovedTick ?? -1) || observedTick>=(journey.expiresTick ?? Infinity) || legIndex>journey.legIndex ||
        observedTick>(journey.settledTick ?? Infinity)) fail('routeWarnings.observations.journey');
    if(journey.legIndex===legIndex && journey.path.length>0) {
      const at=(index:number)=>{const point=journey.path[index];return point&&terrainTileAt(world,point.x,point.y)?.id;};
      if(toPathIndex>journey.pathIndex || at(fromPathIndex)!==fromTileId || at(toPathIndex)!==toTileId ||
          (exitPathIndex!==undefined && (exitPathIndex>journey.pathIndex || at(exitPathIndex)!==exitTileId)))
        fail('routeWarnings.observations.checkpoint');
    }
  }

  for(const row of observations) {
    observe(row);
    if(world.tick>=routeWarningExpiry(row)) fail('routeWarnings.observations.expired');
  }
  let previousPost=-1;
  for(const notice of notices) {
    const {id,observation,postedTick,expiresTick,retractedTick,corroboration}=notice;
    observe(observation);
    if(warningIds.has(id) || !withinSerial(id,/^route-warning-([1-9]\d*)$/,nextId) ||
        postedTick<previousPost || postedTick<=observation.observedTick || postedTick>world.tick || expiresTick!==routeWarningExpiry(observation) ||
        expiresTick<=postedTick ||
        (retractedTick!==undefined && (retractedTick<=postedTick || retractedTick>=expiresTick || retractedTick>world.tick)))
      fail('routeWarnings.notices.lifetime');
    warningIds.add(id);previousPost=postedTick;
    const edgeKey=routeWarningEdgeKey(observation);
    const group=lifetimeByEdge.get(edgeKey)??[];
    group.push({from:postedTick,to:retractedTick??expiresTick});
    lifetimeByEdge.set(edgeKey,group);
    if(corroboration) {
      const second=corroboration.observation;observe(second);
      if(corroboration.tick<=postedTick || corroboration.tick<=second.observedTick || corroboration.tick>=expiresTick ||
          corroboration.tick>=routeWarningExpiry(second) || corroboration.tick>world.tick || corroboration.tick>(retractedTick??Infinity) ||
          observation.journeyId===second.journeyId || second.partyIds.some((id)=>observation.partyIds.includes(id)) ||
          routeWarningEdgeKey(second)!==edgeKey)
        fail('routeWarnings.notices.corroboration');
    }
  }
  for(const group of lifetimeByEdge.values()){
    group.sort((a,b)=>a.from-b.from || a.to-b.to);
    if(group.some((row,index)=>index>0 && row.from<group[index-1].to))fail('routeWarnings.notices.overlapping');
  }
}
