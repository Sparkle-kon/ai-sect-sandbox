import { createInitialWorld } from '../src/data/initialWorld';
import { centerCamera, DEFAULT_CAMERA, type MapCamera } from '../src/components/mapCamera';
import { pickActorMarker, planActorMarkers, type MapActorMarker } from '../src/components/mapActorClusters';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { availablePilgrimageActions, PILGRIMAGE_LEG_COST, pilgrimageCheckpoint } from '../src/engine/pilgrimageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';

const counts=[48,526,1221] as const;
const scopes=['panorama','local-checkpoint','off-route-fog'] as const;
const formats=[{width:360,height:216},{width:390,height:234},{width:1440,height:864}] as const;
const repeats=120;
const groups=[['npc-1','npc-2'],['npc-3','npc-4']] as const;
const local='npc-1',remote='npc-5',origin='loc-taixu';
const routeIds=new Set<string>(groups.flat());
const neutral:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在演练中原地安歇。'};

function check(condition:unknown,message:string):asserts condition{
  if(!condition)throw new Error(message);
}
const p=(times:readonly number[],part:number)=>Number(times[Math.min(times.length-1,Math.ceil(times.length*part)-1)].toFixed(3));
const q=(n:number)=>Math.round(n*1e8);
const checksum=(value:unknown)=>{
  const text=JSON.stringify(value);let n=0x811c9dc5;
  for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),0x01000193);
  return (n>>>0).toString(16).padStart(8,'0');
};
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id);
function step(world:WorldState,orders:Readonly<Record<string,LLMDecisionPayload>>){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,orders[row.id]??neutral])),
    undefined,'utility',undefined,{captureTrace:false,capturePresentation:false});
}

function realRoutes(){
  let world=createInitialWorld(13071);
  // Controlled synthetic spatial distribution/equal resources at genesis. The
  // route, paid legs, arrival coordinates and authority records are all native.
  for(const person of world.cultivators){
    person.locationId=routeIds.has(person.id)?origin:'loc-market-east';
    person.exploredTileIds=[];person.rumors=[];
    if(routeIds.has(person.id))person.spiritStones=100;
  }
  function order(id:string,move:'propose'|'accept'|'advance',peer?:string):LLMDecisionPayload{
    const person=actor(world,id);check(person,'Missing original route member '+id);
    const option=availablePilgrimageActions(person,world,true,world.tick+1)
      .find(row=>row.pilgrimageMove===move&&!row.targetRoadId&&(!peer||row.targetCultivatorId===peer));
    check(option,`No real pilgrimage ${move} for ${id} at ${world.tick}`);
    const {action,...args}=option;
    return {...neutral,chosenAction:action,...args};
  }
  world=step(world,Object.fromEntries(groups.map(([id,peer])=>[id,order(id,'propose',peer)])));
  world=step(world,Object.fromEntries(groups.map(([,id])=>[id,order(id,'accept')])));
  world=step(world,Object.fromEntries(groups.map(([id])=>[id,order(id,'advance')])));
  const journeys=world.pilgrimages.journeys,first=actor(world,local);
  check(journeys.length===2&&journeys.every(row=>row.status==='active'&&row.spentByEach===PILGRIMAGE_LEG_COST&&
    row.pathIndex>0&&row.pathIndex<row.path.length-1)&&first,'Two independent paid physical legs must be active');
  const checkpoint=pilgrimageCheckpoint(world,first);
  check(checkpoint&&[...routeIds].every(id=>{
    const person=actor(world,id);const point=person&&pilgrimageCheckpoint(world,person);
    return point?.x===checkpoint.x&&point.y===checkpoint.y;
  }),'Benchmark quartet must share exact actual checkpoint');
  return {world,checkpoint};
}

function fixture(count:number){
  const {world,checkpoint}=realRoutes();
  const root=world.cultivators[0];
  const market=world.locations.find(({id})=>id==='loc-market');
  check(root&&market&&count>=world.cultivators.length,'Missing base actor/market or inconsistent requested roster');
  const extras=world.locations.filter(({id})=>id!==market.id);
  const newCount=count-world.cultivators.length;
  for(let i=0;i<newCount;i++)world.cultivators.push({
    ...root,id:`benchmark-actor-${String(i).padStart(4,'0')}`,name:`演练修士${i+1}`,
    locationId:i<Math.ceil(newCount*.86)?market.id:extras[i%extras.length].id,
  });
  return {world,market,checkpoint};
}

const markerMembers=(row:MapActorMarker)=>row.kind==='cluster'?row.ids:[row.point.actor.id];
const markerRef=(row:MapActorMarker|undefined)=>row?`${row.kind}:${row.key}`:null;
const markerRow=(row:MapActorMarker)=>[markerRef(row),q(row.x),q(row.y),markerMembers(row),
  ...(row.kind==='actor'?[row.selected,q(row.mouseRadius)]:[])];
function hitShape(rows:readonly MapActorMarker[],width:number,height:number){
  const sample=rows.flatMap(({x,y})=>[{x,y},{x:x+11,y:y-7},{x:x-9,y:y+13}]);
  sample.push({x:-4,y:-4},{x:width/2,y:height/2},{x:width+8,y:height+8});
  return sample.map(at=>[markerRef(pickActorMarker(rows,at,false)),markerRef(pickActorMarker(rows,at,true))]);
}
for(const total of counts){
  const {world,market,checkpoint}=fixture(total);
  for(const scope of scopes){
    const viewer=scope==='panorama'?undefined:actor(world,scope==='local-checkpoint'?local:remote);
    const fog=scope!=='panorama';
    const selectedId=viewer?.id??world.cultivators.find(row=>row.locationId===market.id&&!routeIds.has(row.id))?.id??null;
    const project=()=>{
      const view=createTerrainMapView(world,viewer,fog);
      const positions=mapActorPositions(view.seenLocations,view.liveActors,view.trailPositions);
      return {view,positions};
    };
    const {view,positions}=project();
    check(positions.length===view.liveActors.length,`Each mapped live actor has exactly one location in ${scope}`);
    const trailIds=[...view.trailPositions.keys()];
    check(trailIds.length===(scope==='off-route-fog'?0:4),`Mismatched authorized route checkpoint in ${scope}`);
    check(trailIds.every(id=>routeIds.has(id)),`Synthetic extra roster acquired a real route in ${scope}`);
    const projectionChecksum=checksum([
      view.seenLocations.map(row=>row.id),[...view.current??[]],[...view.known??[]],
      positions.map(row=>[row.actor.id,q(row.x),q(row.y)]),
      [...view.trailPositions].map(([id,row])=>[id,q(row.x),q(row.y)]),
    ]);
    const focus=scope==='local-checkpoint'?checkpoint:scope==='off-route-fog'?world.locations.find(site=>site.id===viewer?.locationId)??market:market;
    const cameras:[string,MapCamera][]=[
      ['1×',DEFAULT_CAMERA],
      ['2.35×',centerCamera({...DEFAULT_CAMERA,zoom:2.35},focus)],
      ['4×',centerCamera({...DEFAULT_CAMERA,zoom:4},focus)],
    ];
    for(let i=0;i<formats.length;i++){
      const size=formats[i],[zoom,camera]=cameras[i];
      const planned=()=>planActorMarkers(positions,camera,size,selectedId);
      const run=()=>{
        const start=performance.now(),frame=project(),projected=performance.now();
        planActorMarkers(frame.positions,camera,size,selectedId);const end=performance.now();
        return {projection:projected-start,planning:end-projected,total:end-start};
      };
      for(let warmup=0;warmup<24;warmup++)run();
      const sample=Array.from({length:repeats},run);
      const rows=planned();
      const ids=rows.flatMap(row=>markerMembers(row));
      check(ids.length===new Set(ids).size,'A shown actor was duplicated by marker clustering');
      const authorized=new Set(view.liveActors.map(row=>row.id));
      check(ids.every(id=>authorized.has(id)),'A marker included an actor outside the projected view');
      const selected=rows.find(row=>row.kind==='actor'&&row.selected);
      check(selected&&pickActorMarker(rows,selected,true)===selected,'The focal actor must remain visible and independently tappable');
      const timing=(key:'projection'|'planning'|'total')=>sample.map(row=>row[key]).sort((a,b)=>a-b);
      const projection=timing('projection'),planning=timing('planning'),combined=timing('total');
      console.log(JSON.stringify({
        benchmark:'node-map-projection-and-marker-planning',actors:total,scope,width:size.width,height:size.height,zoom,
        projectedActors:positions.length,trailActors:trailIds.length,onScreenActors:ids.length,markers:rows.length,
        projectionChecksum,markerChecksum:checksum(rows.map(markerRow)),hitChecksum:checksum(hitShape(rows,size.width,size.height)),
        samples:repeats,medianMs:p(planning,.5),p95Ms:p(planning,.95),projectionP50Ms:p(projection,.5),projectionP95Ms:p(projection,.95),
        combinedP50Ms:p(combined,.5),combinedP95Ms:p(combined,.95),
      }));
    }
  }
}
