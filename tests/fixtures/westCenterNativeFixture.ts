import {createInitialWorld} from '../../src/data/initialWorld';
import {regionForColumn} from '../../src/engine/simulationRegionGeometry';
import {terrainTileAt} from '../../src/engine/terrainEngine';
import {availableRoadActions,ROAD_CHARTER_ROOTS,ROAD_CHARTER_STONES,ROAD_FARE} from '../../src/engine/roadEngine';
import {availablePilgrimageActions,PILGRIMAGE_LEG_COST,pilgrimageCheckpoint} from '../../src/engine/pilgrimageEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {LLMDecisionPayload,MapPoint,WorldState} from '../../src/types/world';

export const WEST_TRIP_SITE='loc-danxia', CENTRAL_TRIP_SITE='loc-market', REVERSE_WEST_SITE='loc-taixu';
export const WEST_TRIP_COMPANION='elder-danxia-2', WEST_TRIP_PAYER='npc-5';
const REST:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'暂留实际停靠处。'};
const thought='仅按查勘所得与当月原生许可行事。';
const requireProof=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
export const tripActor=(world:WorldState,id:string)=>world.cultivators.find(person=>person.id===id)!;
export function stepWestTrip(world:WorldState,commands:Readonly<Record<string,LLMDecisionPayload>>={}):WorldState{
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive&&row.hp>0)
    .map(row=>[row.id,commands[row.id]??REST])),undefined,'utility');
}
export const tripCells=(world:WorldState,points:readonly MapPoint[])=>points.map(point=>{
  const tile=terrainTileAt(world,point.x,point.y);
  if(!tile)throw Error('Route must contain only actual terrain points.');
  const region=regionForColumn(tile.col,world.terrain.columns);
  return {id:tile.id,col:tile.col,row:tile.row,region};
});
export function tripBoundaries(world:WorldState,points:readonly MapPoint[]){
  const cells=tripCells(world,points);
  return cells.flatMap((to,index)=>{
    const from=cells[index-1];
    if(!from||from.region===to.region)return [];
    requireProof(Math.abs(from.col-to.col)+Math.abs(from.row-to.row)===1,'Region crossing must be on one real adjacent map edge.');
    return [{index,from,to}];
  });
}
const scout=(world:WorldState,locationId:string)=>stepWestTrip(world,Object.fromEntries([WEST_TRIP_PAYER,WEST_TRIP_COMPANION].map(id=>
  [id,{chosenAction:'EXPLORE',targetLocationId:locationId,innerMonologue:thought}])));
function propose(world:WorldState){
  const option=availablePilgrimageActions(tripActor(world,WEST_TRIP_PAYER),world,true,world.tick+1).find(row=>
    row.pilgrimageMove==='propose'&&row.targetCultivatorId===WEST_TRIP_COMPANION&&row.targetLocationId===CENTRAL_TRIP_SITE&&
    row.targetPilgrimageNextStopId===REVERSE_WEST_SITE);
  if(!option)throw Error(`No native exact pilgrimage proposal at T${world.tick}.`);
  return stepWestTrip(world,{[WEST_TRIP_PAYER]:{...option,chosenAction:option.action,innerMonologue:thought}});
}
function accept(world:WorldState){
  const option=availablePilgrimageActions(tripActor(world,WEST_TRIP_COMPANION),world,false,world.tick+1).find(row=>row.pilgrimageMove==='accept');
  if(!option)throw Error(`No companion consent at T${world.tick}.`);
  return stepWestTrip(world,{[WEST_TRIP_COMPANION]:{...option,chosenAction:option.action,innerMonologue:thought}});
}
export function moveWestTrip(world:WorldState,roadId?:string){
  const option=availablePilgrimageActions(tripActor(world,WEST_TRIP_PAYER),world,false,world.tick+1).find(row=>
    row.pilgrimageMove==='advance'&&row.targetRoadId===roadId);
  if(!option)throw Error(`No native legal ${roadId?'tolled':'ordinary'} next stride at T${world.tick}.`);
  return stepWestTrip(world,{[WEST_TRIP_PAYER]:{...option,chosenAction:option.action,innerMonologue:thought}});
}
export function prepareNativeWestCenterTrip(){
  let world=createInitialWorld(11401);
  const sectBefore=world.sects.find(row=>row.id==='sect-danxia')!;
  requireProof(sectBefore.leaderId===WEST_TRIP_PAYER,'Exact genuine sponsor office mismatch.');
  requireProof([WEST_TRIP_PAYER,WEST_TRIP_COMPANION].every(id=>tripActor(world,id).locationId===WEST_TRIP_SITE),'Both actors must start at their real HQ.');
  const nativeGather:LLMDecisionPayload={chosenAction:'GATHER_HERBS',targetHerbId:'earth_root',innerMonologue:thought};
  const rootsAtBirth=tripActor(world,WEST_TRIP_PAYER).herbs.earth_root;
  for(let attempts=0;tripActor(world,WEST_TRIP_PAYER).herbs.earth_root<ROAD_CHARTER_ROOTS&&attempts<4;attempts++)
    world=stepWestTrip(world,{[WEST_TRIP_PAYER]:nativeGather});
  requireProof(rootsAtBirth===0&&tripActor(world,WEST_TRIP_PAYER).herbs.earth_root>=ROAD_CHARTER_ROOTS,'Roots were not actually gathered.');
  world=accept(propose(world));
  const surveyId=world.pilgrimages.journeys.at(-1)!.id;
  const initialSurveyTick=world.tick;
  for(let marches=0;world.pilgrimages.journeys.find(row=>row.id===surveyId)?.status==='active'&&marches<10;marches++)
    world=moveWestTrip(world);
  const surveyed=world.pilgrimages.journeys.find(row=>row.id===surveyId)!;
  requireProof(surveyed.status==='completed'&&surveyed.stopsVisited.length===3&&world.roads.crossings.length===0,
    'Need the real completed non-toll route survey before constructing the road.');
  const surveyedTick=world.tick;
  world=scout(world,WEST_TRIP_SITE);
  requireProof([WEST_TRIP_PAYER,WEST_TRIP_COMPANION].every(id=>tripActor(world,id).locationId===WEST_TRIP_SITE),'Surveyors must actually return to the office.');
  const charter=availableRoadActions(tripActor(world,WEST_TRIP_PAYER),world).find(row=>row.roadMove==='charter'&&row.targetLocationId===CENTRAL_TRIP_SITE);
  if(!charter)throw Error('Real shared route survey did not reveal a fully legal charter corridor.');
  const stock=tripActor(world,WEST_TRIP_PAYER).herbs.earth_root;
  world=stepWestTrip(world,{[WEST_TRIP_PAYER]:{...charter,chosenAction:'ROAD',innerMonologue:thought}});
  const road=world.roads.links.find(row=>row.anchorSiteId===WEST_TRIP_SITE&&row.otherSiteId===CENTRAL_TRIP_SITE);
  if(!road)throw Error('Funded native ROAD did not publish an active corridor.');
  const charge=world.resourceFlow.months.find(month=>month.tick===road.openedTick)?.entries.filter(row=>row.refId===road.id);
  requireProof(tripActor(world,WEST_TRIP_PAYER).herbs.earth_root===stock-ROAD_CHARTER_ROOTS&&
    charge?.some(row=>row.kind==='consumption'&&row.good==='stone'&&row.amount===ROAD_CHARTER_STONES)&&
    charge.some(row=>row.kind==='consumption'&&row.good==='earth_root'&&row.amount===ROAD_CHARTER_ROOTS),
    'Actual charter funding receipts or stock movement are missing.');
  const boundaries=tripBoundaries(world,road.path);
  requireProof(boundaries.length===1&&boundaries[0].from.col===8&&boundaries[0].to.col===9&&
    boundaries[0].from.region==='west'&&boundaries[0].to.region==='center','Need the exact real west→center col8↔9 terrain hinge.');
  for(let waits=0;!availablePilgrimageActions(tripActor(world,WEST_TRIP_PAYER),world,true,world.tick+1).some(row=>
    row.pilgrimageMove==='propose'&&row.targetCultivatorId===WEST_TRIP_COMPANION)&&waits<4;waits++)world=stepWestTrip(world);
  world=accept(propose(world));
  // Paid preview reads an already-mature native journey. This month is not claimed as a stride.
  world=stepWestTrip(world);
  const journey=world.pilgrimages.journeys.at(-1)!;
  requireProof(journey.status==='active'&&journey.legIndex===0&&journey.path.length===0&&journey.stopsVisited.length===1,
    'Hired travelers must begin at real west office with no phantom approach.');
  return {ready:world,journeyId:journey.id,roadId:road.id,initialSurveyTick,surveyedTick,roadCharteredTick:road.openedTick,
    paidRoadPath:tripCells(world,road.path),paidBoundary:boundaries[0],charterCharge:charge!};
}
export function runNativeWestCenterCrossing(){
  const before=prepareNativeWestCenterTrip(), start=before.ready;
  const w0=tripActor(start,WEST_TRIP_PAYER).spiritStones,w1=tripActor(start,WEST_TRIP_COMPANION).spiritStones;
  const arrived=moveWestTrip(start,before.roadId);
  const native=arrived.roads.crossings.find(row=>row.journeyId===before.journeyId);
  const met=arrived.pilgrimages.journeys.find(row=>row.id===before.journeyId);
  requireProof(native?.paidSteps===8&&native.fee===ROAD_FARE&&native.departedTick===arrived.tick&&met?.stopsVisited.at(-1)?.locationId===CENTRAL_TRIP_SITE&&
    [WEST_TRIP_PAYER,WEST_TRIP_COMPANION].every(id=>tripActor(arrived,id).locationId===CENTRAL_TRIP_SITE),
    'Paid native stride must physically arrive at center from exact approved west corridor.');
  const transfer=arrived.resourceFlow.months.find(month=>month.tick===arrived.tick)?.entries.find(row=>
    row.refId===native?.id&&row.mechanism==='road'&&row.reason==='road_crossing');
  requireProof(transfer?.kind==='transfer'&&transfer.amount===ROAD_FARE&&transfer.from.kind==='actor'&&
    transfer.from.id===WEST_TRIP_PAYER&&transfer.to.kind==='sect'&&transfer.to.id==='sect-danxia','Actual native toll transfer missing.');
  requireProof(w0-tripActor(arrived,WEST_TRIP_PAYER).spiritStones===PILGRIMAGE_LEG_COST+ROAD_FARE&&
    w1-tripActor(arrived,WEST_TRIP_COMPANION).spiritStones===PILGRIMAGE_LEG_COST,'Native base fares and additional toll should be genuine charges.');
  const returnInitial=moveWestTrip(arrived);
  let reverse=returnInitial;
  const route=reverse.pilgrimages.journeys.find(row=>row.id===before.journeyId)!;
  requireProof(route.path.length>0&&route.pathIndex>0&&route.lastMovedTick===reverse.tick,'Return must physically enter original unchecked checkpoints.');
  const returnedBoundary=tripBoundaries(reverse,route.path).find(edge=>edge.from.region==='center'&&edge.to.region==='west');
  requireProof(returnedBoundary?.from.col===9&&returnedBoundary.to.col===8,'Paid journey must later return separately through actual center→west edge.');
  const reverseProgress:{tick:number;index:number;tile:string|undefined}[]=[];
  while((reverse.pilgrimages.journeys.find(row=>row.id===before.journeyId)?.status==='active')&&reverseProgress.length<8){
    const row=reverse.pilgrimages.journeys.find(row=>row.id===before.journeyId)!;
    const point=pilgrimageCheckpoint(reverse,tripActor(reverse,WEST_TRIP_PAYER));
    reverseProgress.push({tick:reverse.tick,index:row.pathIndex,tile:point&&terrainTileAt(reverse,point.x,point.y)?.id});
    reverse=moveWestTrip(reverse);
  }
  const completed=reverse.pilgrimages.journeys.find(row=>row.id===before.journeyId)!;
  requireProof(completed.status==='completed'&&completed.spentByEach===16&&completed.stopsVisited.at(-1)?.locationId===REVERSE_WEST_SITE&&
    [WEST_TRIP_PAYER,WEST_TRIP_COMPANION].every(id=>tripActor(reverse,id).locationId===REVERSE_WEST_SITE)&&
    reverseProgress.length>=3&&reverse.roads.crossings.length===1,
    'Reverse leg did not genuinely move across consecutive months, or charged a second toll without proof.');
  return {...before,arrived,returnInitial,finished:reverse,crossing:native!,transfer:transfer!,returnBoundary:returnedBoundary!,
    reverseProgress,stops:completed.stopsVisited};
}
