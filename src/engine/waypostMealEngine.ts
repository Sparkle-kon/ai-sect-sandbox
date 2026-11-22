import type {Cultivator,LLMDecisionPayload,ResourceFlowAccount,WorldEvent,WorldState} from '../types/world';
import {
  WAYPOST_MEAL_LEAF as LEAF,WAYPOST_MEAL_REST as REST,WAYPOST_MEAL_REPLY_TICKS as TICKS,WAYPOST_MEAL_TERMINAL_LIMIT as LIMIT,
  waypostMealEventId,waypostMealId,type WaypostMeal,type WaypostMealVisit,type WaypostMealStatus,type WaypostMealOption,
} from '../types/waypostMeal';
import {pilgrimageWaypostCheckpoint,type PilgrimageWaypostCheckpoint} from './pilgrimageEngine';
import {flowActor,recordResourceFlow,RESOURCE_FLOW_MONTH_LIMIT} from './resourceFlowEngine';
import {waypostMealServedThisTick} from './waypostMealTerms';

export type {WaypostMealOption} from '../types/waypostMeal';
export {waypostMealServedThisTick} from './waypostMealTerms';

const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id);
const living=(actor:Cultivator|undefined):actor is Cultivator=>!!actor&&actor.alive&&actor.hp>0;
const tired=(actor:Cultivator)=>Number.isFinite(actor.hp)&&Number.isFinite(actor.maxHp)&&actor.maxHp>actor.hp;
const points=(a:{point:{x:number;y:number};tileId:string},b:{point:{x:number;y:number};tileId:string})=>
  a.tileId===b.tileId&&a.point.x===b.point.x&&a.point.y===b.point.y;
const groups=(a:WaypostMealVisit,b:WaypostMealVisit)=>a.journeyId!==b.journeyId&&
  new Set([a.organizerId,a.companionId,b.organizerId,b.companionId]).size===4;
const visitEquals=(a:WaypostMealVisit,b:WaypostMealVisit)=>
  a.journeyId===b.journeyId&&a.organizerId===b.organizerId&&a.companionId===b.companionId&&a.spentByEach===b.spentByEach&&
  a.legIndex===b.legIndex&&a.pathIndex===b.pathIndex&&a.reachedTick===b.reachedTick&&
  a.originId===b.originId&&a.destinationId===b.destinationId;
const participant=(row:WaypostMeal,id:string)=>row.hostId===id||row.guestId===id;
const account=(id:string):ResourceFlowAccount=>({kind:'waypost_meal',id});
const peers=(row:WaypostMeal)=>({kind:'participants' as const,actorIds:[row.hostId,row.guestId]});
const validCustody=(row:WaypostMeal)=>row.status==='offered'&&row.escrowLeaves===1&&!row.spentLeaves&&!row.returnedLeaves&&
  row.closedTick===undefined&&row.recovery===undefined;

function currentPair(world:WorldState,row:WaypostMeal,tick:number):
  {host:PilgrimageWaypostCheckpoint;guest:PilgrimageWaypostCheckpoint}|undefined {
  const first=world.pilgrimages.journeys.find(journey=>journey.id===row.hostVisit.journeyId);
  const second=world.pilgrimages.journeys.find(journey=>journey.id===row.guestVisit.journeyId);
  const host=first&&pilgrimageWaypostCheckpoint(world,first,tick),guest=second&&pilgrimageWaypostCheckpoint(world,second,tick);
  return host&&guest&&host.leader.id===row.hostId&&guest.leader.id===row.guestId&&
    groups(host.visit,guest.visit)&&points(host,row)&&points(guest,row)&&
    visitEquals(host.visit,row.hostVisit)&&visitEquals(guest.visit,row.guestVisit)?{host,guest}:undefined;
}
const reply=(waypostMealMove:Exclude<WaypostMealOption['waypostMealMove'],'offer'>,row:WaypostMeal):WaypostMealOption=>
  ({action:'WAYPOST_MEAL',waypostMealMove,targetWaypostMealId:row.id});

export function availableWaypostMealActions(actor:Cultivator,world:WorldState,tick=world.tick):WaypostMealOption[]{
  if((tick!==world.tick&&tick!==world.tick+1)||!living(actor)||person(world,actor.id)!==actor||
    waypostMealServedThisTick(world,actor.id,tick))return [];
  const rows=world.waypostMeals?.meals??[];
  if(rows.some(row=>row.offeredTick===tick&&row.hostId===actor.id||
    row.closedTick===tick&&(row.status==='withdrawn'&&row.hostId===actor.id||row.status==='declined'&&row.guestId===actor.id)))return [];
  const pending=rows.find(row=>row.status==='offered'&&row.expiresTick>tick&&participant(row,actor.id));
  if(pending){
    if(!validCustody(pending)||pending.offeredTick>=tick)return [];
    const pair=currentPair(world,pending,tick);
    if(!pair)return [];
    if(pending.hostId===actor.id)return [reply('withdraw',pending)];
    const options=[reply('decline',pending)];
    if(!waypostMealServedThisTick(world,pending.hostId,tick)&&tired(pair.host.leader)&&tired(pair.guest.leader))
      options.push(reply('accept',pending));
    return options;
  }
  if(!tired(actor)||!Number.isSafeInteger(actor.herbs[LEAF])||actor.herbs[LEAF]<1)return [];
  const routes=world.pilgrimages.journeys;
  const source=routes.find(row=>row.organizerId===actor.id&&row.status==='active');
  const host=source&&pilgrimageWaypostCheckpoint(world,source,tick);
  if(!host||host.leader!==actor||(source.expiresTick??0)<=tick+1)return [];
  const reserved=new Set(rows.filter(row=>row.status==='offered'&&row.expiresTick>tick)
    .flatMap(row=>[row.hostVisit.journeyId,row.guestVisit.journeyId]));
  return routes.flatMap((route):WaypostMealOption[]=>{
    if(reserved.has(route.id)||route===source||(route.expiresTick??0)<=tick+1||waypostMealServedThisTick(world,route.organizerId,tick))return [];
    const guest=pilgrimageWaypostCheckpoint(world,route,tick);
    if(!guest||!points(host,guest)||!groups(host.visit,guest.visit)||!tired(guest.leader))return [];
    return [{action:'WAYPOST_MEAL',waypostMealMove:'offer',targetCultivatorId:guest.leader.id}];
  });
}
function result(world:WorldState,row:WaypostMeal,phase:WaypostMealStatus,title:string,description:string):WorldEvent {
  return {id:waypostMealEventId(row.id,world.tick,phase),tick:world.tick,year:world.year,month:world.month,
    actorIds:[row.hostId,row.guestId],witnessScope:'participants',category:'diplomacy',title,description};
}
function refund(world:WorldState,row:WaypostMeal,status:'declined'|'withdrawn'|'missed'|'expired'):WorldEvent|null{
  const host=person(world,row.hostId);
  if(!host||!validCustody(row))return null;
  host.herbs[LEAF]++;
  row.escrowLeaves=0;row.returnedLeaves=1;row.closedTick=world.tick;row.status=status;
  recordResourceFlow(world,{kind:'transfer',mechanism:'pilgrimage',reason:'waypost_meal_refund',good:LEAF,amount:1,
    from:account(row.id),to:flowActor(row.hostId),refId:row.id,visibility:peers(row)});
  const labels={declined:'对客谢茶',withdrawn:'主人收回茶约',missed:'山径上错过这一席',expired:'茶约过时无人应'};
  return result(world,row,status,labels[status],'未用的那株翡翠灵叶退还原人。无人据此歇复，两队原路不改。');
}
export function resolveWaypostMealAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='WAYPOST_MEAL')return null;
  const choice=availableWaypostMealActions(actor,world).find(option=>option.waypostMealMove===decision.waypostMealMove&&
    option.targetCultivatorId===decision.targetCultivatorId&&option.targetWaypostMealId===decision.targetWaypostMealId);
  if(!choice||Object.keys(decision).some(key=>!['chosenAction','innerMonologue','waypostMealMove',
    choice.waypostMealMove==='offer'?'targetCultivatorId':'targetWaypostMealId'].includes(key)))return null;
  if(choice.waypostMealMove==='offer'){
    const routes=world.pilgrimages.journeys;
    const first=routes.find(route=>route.status==='active'&&route.organizerId===actor.id);
    const second=routes.find(route=>route.status==='active'&&route.organizerId===choice.targetCultivatorId);
    const host=first&&pilgrimageWaypostCheckpoint(world,first),guest=second&&pilgrimageWaypostCheckpoint(world,second);
    if(!first||!second||!host||!guest||!points(host,guest)||!groups(host.visit,guest.visit))return null;
    const state=world.waypostMeals??={version:1,nextId:1,meals:[]};
    const row:WaypostMeal={id:waypostMealId(state.nextId++),hostId:actor.id,guestId:guest.leader.id,
      hostVisit:host.visit,guestVisit:guest.visit,tileId:host.tileId,point:host.point,offeredTick:world.tick,
      expiresTick:world.tick+TICKS,status:'offered',escrowLeaves:1,spentLeaves:0,returnedLeaves:0};
    actor.herbs[LEAF]--;
    state.meals.push(row);
    for(const [journey,visit] of [[first,host.visit],[second,guest.visit]] as const){
      const {legIndex,pathIndex,reachedTick}=visit;
      (journey.waypostMealWitnesses??=[]).push({mealId:row.id,offeredTick:row.offeredTick,legIndex,pathIndex,reachedTick,
        tileId:row.tileId,point:{...row.point}});
    }
    recordResourceFlow(world,{kind:'transfer',mechanism:'pilgrimage',reason:'waypost_meal_deposit',good:LEAF,amount:1,
      from:flowActor(row.hostId),to:account(row.id),refId:row.id,visibility:peers(row)});
    return result(world,row,'offered','在同一处山径留一壶茶','只封一株实有翡翠灵叶，等另一队领路人应约。未开席，未挪任何行程。');
  }
  const row=world.waypostMeals?.meals.find(row=>row.id===choice.targetWaypostMealId);
  if(!row)return null;
  if(choice.waypostMealMove==='decline'||choice.waypostMealMove==='withdraw')
    return refund(world,row,choice.waypostMealMove==='decline'?'declined':'withdrawn');
  const pair=currentPair(world,row,world.tick);
  if(!pair||!validCustody(row)||!tired(pair.host.leader)||!tired(pair.guest.leader))return null;
  const serve=(person:Cultivator)=>{
    const beforeHp=person.hp, maxHp=person.maxHp,afterHp=Math.min(maxHp,beforeHp+REST);
    person.hp=afterHp;
    return {actorId:person.id,beforeHp,afterHp,maxHp};
  };
  row.recovery=[serve(pair.host.leader),serve(pair.guest.leader)];
  row.escrowLeaves=0;row.spentLeaves=1;row.closedTick=world.tick;row.status='served';
  recordResourceFlow(world,{kind:'consumption',mechanism:'pilgrimage',reason:'waypost_meal_consumed',good:LEAF,amount:1,
    from:account(row.id),refId:row.id,visibility:peers(row)});
  return result(world,row,'served','山径同席，各歇一息','实用翡翠灵叶一株，两位领路人依各自气血实得休养。各队仍守自己的原路。');
}
export function advanceWaypostMeals(world:WorldState):WorldEvent[]{
  const state=world.waypostMeals;
  if(!state)return [];
  const events:WorldEvent[]=[];
  for(const row of state.meals){
    if(!validCustody(row))continue;
    const status=world.tick>=row.expiresTick?'expired':!currentPair(world,row,world.tick)?'missed':undefined;
    if(!status)continue;
    const event=refund(world,row,status);
    if(event)events.push(event);
  }
  const heldJournal=new Set(world.resourceFlow.months.flatMap(month=>month.entries
    .filter(entry=>entry.reason.startsWith('waypost_meal_')).map(entry=>entry.refId)));
  const hotEvents=new Set(world.events.map(row=>row.id));
  const recent=state.meals.filter(row=>row.closedTick!==undefined).sort((a,b)=>b.closedTick!-a.closedTick!).slice(0,LIMIT);
  const keep=new Set(recent.map(row=>row.id));
  const previousLength=state.meals.length;
  state.meals=state.meals.filter(row=>row.status==='offered'||keep.has(row.id)||heldJournal.has(row.id)||
    row.closedTick!==undefined&&(row.closedTick>world.tick-RESOURCE_FLOW_MONTH_LIMIT||
      hotEvents.has(waypostMealEventId(row.id,row.offeredTick,'offered'))||
      hotEvents.has(waypostMealEventId(row.id,row.closedTick,row.status))));
  if(state.meals.length<previousLength){
    const retained=new Set(state.meals.map(row=>row.id));
    for(const journey of world.pilgrimages.journeys){
      if(!journey.waypostMealWitnesses)continue;
      const witnesses=journey.waypostMealWitnesses.filter(row=>retained.has(row.mealId));
      if(witnesses.length)journey.waypostMealWitnesses=witnesses;
      else delete journey.waypostMealWitnesses;
    }
  }
  return events;
}
export function visibleWaypostMeals(world:WorldState,actor?:Cultivator):WaypostMeal[]{
  return living(actor)&&person(world,actor.id)===actor?(world.waypostMeals?.meals??[])
    .filter(row=>row.offeredTick<=world.tick&&participant(row,actor.id)).map(row=>structuredClone(row)):[];
}
