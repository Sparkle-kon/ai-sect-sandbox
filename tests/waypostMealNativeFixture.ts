import {createInitialWorld} from '../src/data/initialWorld';
import {availablePilgrimageActions,PILGRIMAGE_LEG_COST,pilgrimageCheckpoint} from '../src/engine/pilgrimageEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {availableWaypostMealActions} from "../src/engine/waypostMealEngine";
import type {WaypostMealMove} from "../src/types/waypostMeal";
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

export const mealGroups=[['npc-1','npc-2'],['npc-3','npc-4']] as const;
export const mealOrigin='loc-taixu';
export const mealOutsider='npc-5';
export const mealLeaders=mealGroups.map(group=>group[0]);
export const mealActor=(world:WorldState,id:string)=>world.cultivators.find(person=>person.id===id)!;
export const mealJourney=(world:WorldState,id:string)=>world.pilgrimages.journeys.find(row=>row.organizerId===id)!;
export function mealCheck(value:unknown,message:string):asserts value{if(!value)throw Error(message);}
const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'就地歇息。'};
export const mealMonth=(world:WorldState,choices:Readonly<Record<string,LLMDecisionPayload>>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.filter(row=>row.alive&&row.hp>0).map(row=>[row.id,choices[row.id]??rest])),
  undefined,'utility',undefined,{captureTrace:false,capturePresentation:false});
export function pilgrimageOrder(world:WorldState,id:string,move:LLMDecisionPayload['pilgrimageMove'],peer?:string):LLMDecisionPayload{
  const row=availablePilgrimageActions(mealActor(world,id),world,true,world.tick+1).find(
    plan=>plan.pilgrimageMove===move&&!plan.targetRoadId&&(!peer||peer===plan.targetCultivatorId),
  );
  mealCheck(row,`No genuine ${move} for ${id} at T${world.tick}`);
  const {action,...payload}=row;
  return {...payload,chosenAction:action,innerMonologue:'照正路同行。'};
}
export function pairedMealPilgrims(sameNameDecoy=false,cappedHost=false){
  const ids=mealGroups.flat();
  let world=createInitialWorld(13071);
  // Controlled initial actors only: shared departure, money and actual wounds/provisions.
  // The native clock, map, contracts, movement paths and paid receipts remain unmodified.
  for(const person of world.cultivators){
    person.locationId=ids.some(id=>id===person.id)||person.id===mealOutsider?mealOrigin:'loc-market-east';
    person.exploredTileIds=[];
    person.rumors=[];
    if(ids.some(id=>id===person.id)){
      person.spiritStones=100;
      person.hp=Math.max(1,person.maxHp-Math.round(person.maxHp*.35)-(person.id===mealGroups[0][0]&&cappedHost?3:Math.ceil(person.maxHp*.30)));
    }
  }
  if(sameNameDecoy)mealActor(world,mealOutsider).name=mealActor(world,mealGroups[1][0]).name;
  mealActor(world,mealGroups[0][0]).herbs.jade_leaf=3;
  world=mealMonth(world,{[mealGroups[0][0]]:pilgrimageOrder(world,mealGroups[0][0],'propose',mealGroups[0][1]),
    [mealGroups[1][0]]:pilgrimageOrder(world,mealGroups[1][0],'propose',mealGroups[1][1])});
  const leaderRows=mealLeaders.map(id=>mealJourney(world,id));
  mealCheck(leaderRows.every(row=>row?.status==='proposed'&&row.stopIds[0]===mealOrigin)&&
    JSON.stringify(leaderRows[0].stopIds)===JSON.stringify(leaderRows[1].stopIds),'Two agreed local routes must match');
  world=mealMonth(world,Object.fromEntries(mealGroups.map(([,id])=>[id,pilgrimageOrder(world,id,'accept')])));
  world=mealMonth(world,Object.fromEntries(mealLeaders.map(id=>[id,pilgrimageOrder(world,id,'advance')])));
  const journeys=mealLeaders.map(id=>mealJourney(world,id));
  mealCheck(journeys.every(row=>row?.status==='active'&&row.spentByEach===PILGRIMAGE_LEG_COST&&
    row.pathIndex>0&&row.pathIndex<row.path.length-1),'Both parties paid a real leg and reached its interior');
  const points=ids.map(id=>pilgrimageCheckpoint(world,mealActor(world,id)));
  const point=points[0];
  mealCheck(point&&points.every(p=>p?.x===point.x&&p.y===point.y),'The four must share the exact live point');
  const tile=terrainTileAt(world,point.x,point.y);
  mealCheck(tile,'Exact native tile');
  return {world,point,tile,ids,journeys};
}

export const mealHost=mealGroups[0][0],mealGuest=mealGroups[1][0];
export function mealOrder(world:WorldState,id:string,move:WaypostMealMove):LLMDecisionPayload{
  const row=availableWaypostMealActions(mealActor(world,id),world,world.tick+1)
    .find(plan=>plan.waypostMealMove===move&&(plan.waypostMealMove!=='offer'||plan.targetCultivatorId===mealGuest));
  mealCheck(row,`No genuine meal ${move} for ${id} at T${world.tick}`);
  const {action,...payload}=row;
  return {...payload,chosenAction:action,innerMonologue:'只在同一山驿，与亲到的另一队人分茶。'};
}
export function offeredWaypostMeal(sameNameDecoy=false,cappedHost=false){
  const paired=pairedMealPilgrims(sameNameDecoy,cappedHost);
  const world=mealMonth(paired.world,{[mealHost]:mealOrder(paired.world,mealHost,'offer')});
  const row=world.waypostMeals?.meals[0];
  mealCheck(row?.status==='offered'&&row.hostId===mealHost&&row.guestId===mealGuest,'No native meal offer');
  return {...paired,before:paired.world,world,row};
}
export function acceptedWaypostMeal(cappedHost=false){
  const offered=offeredWaypostMeal(false,cappedHost);
  const world=mealMonth(offered.world,{[mealGuest]:mealOrder(offered.world,mealGuest,'accept')});
  const row=world.waypostMeals?.meals[0];
  mealCheck(row?.status==='served','No native meal acceptance');
  return {...offered,offered:offered.world,world,row};
}
