import type {MapPoint,PilgrimageJourney,ResourceFlowAccount,WorldState} from '../types/world';
import {WAYPOST_MEAL_LEAF,WAYPOST_MEAL_REPLY_TICKS,WAYPOST_MEAL_REST,waypostMealEventId,waypostMealId,
  type WaypostMeal,type WaypostMealVisit} from '../types/waypostMeal';
import {PILGRIMAGE_LEG_COST,pilgrimageWaypostCheckpoint} from './pilgrimageEngine';
import {RESOURCE_FLOW_MONTH_LIMIT} from './resourceFlowEngine';
import {terrainTileAt} from './terrainEngine';

type Fail=(field:string)=>never;
type Receipt={row:WaypostMeal;tick:number};
type Bill=Receipt&{from:ResourceFlowAccount;to?:ResourceFlowAccount};
const eventPattern=/^evt-(waypost-meal-[1-9][0-9]*)-([1-9][0-9]*)-(offered|served|declined|withdrawn|missed|expired)$/u;
const serial=(id:string)=>Number(id.match(/^waypost-meal-([1-9][0-9]*)$/u)?.[1]);
const eqPoint=(a:MapPoint|undefined,b:MapPoint|undefined)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
const eqIds=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,index)=>id===b[index]);
const eqAccount=(a:ResourceFlowAccount,b:ResourceFlowAccount)=>a.kind===b.kind&&a.id===b.id;
const ref=(id:string,reason:string)=>JSON.stringify([id,reason]);
const parties=(row:WaypostMeal)=>[row.hostId,row.guestId];
const sameVisit=(left:WaypostMealVisit,right:WaypostMealVisit)=>
  left.journeyId===right.journeyId&&left.organizerId===right.organizerId&&left.companionId===right.companionId&&
  left.spentByEach===right.spentByEach&&left.legIndex===right.legIndex&&left.pathIndex===right.pathIndex&&left.reachedTick===right.reachedTick&&
  left.originId===right.originId&&left.destinationId===right.destinationId;

/** Monetary state and private location receipts never grant fresh presence or recreate a moved journey's path. */
export function validateWaypostMeals(world:WorldState,fail:Fail):void{
  const ledger=world.waypostMeals;
  const rows=ledger?.meals??[];
  const actors=new Set((ledger?world.cultivators:[]).map(row=>row.id));
  const journeys=new Map((ledger?world.pilgrimages.journeys:[]).map(row=>[row.id,row]));
  const reserved=new Set<string>(),rowsById=new Map<string,WaypostMeal>();
  const events=new Map<string,Receipt>(),bills=new Map<string,Bill>(),acted=new Set<string>();
  if(ledger&&!rows.length)return fail('waypostMeals.retention');
  const once=(actorId:string,tick:number)=>{
    const key=JSON.stringify([actorId,tick]);
    if(acted.has(key))return fail('waypostMeals.actorTurn');
    acted.add(key);
  };
  const validTime=(value:number)=>Number.isSafeInteger(value)&&value>=1&&value<=world.tick;
  const account=(id:string):ResourceFlowAccount=>({kind:'waypost_meal',id});
  const pocket=(id:string):ResourceFlowAccount=>({kind:'actor',id});
  const add=(row:WaypostMeal,tick:number,reason:string,from:ResourceFlowAccount,to?:ResourceFlowAccount)=>{
    bills.set(ref(row.id,reason),{row,tick,from,to});
  };

  function boundVisit(row:WaypostMeal,source:WaypostMealVisit,organizer:string,through:number,mayLeaveAfterAction:boolean):PilgrimageJourney|undefined{
    const journey=journeys.get(source.journeyId);
    const index=source.legIndex;
    const came=journey?.stopsVisited[index],left=journey?.stopsVisited[index+1];
    if(!journey||source.organizerId!==organizer||journey.organizerId!==organizer||source.companionId!==journey.companionId||
      journey.organizerId===journey.companionId||!actors.has(journey.companionId)||
      source.originId!==journey.stopIds[index]||source.destinationId!==journey.stopIds[index+1]||
      source.spentByEach!==(index+1)*PILGRIMAGE_LEG_COST||journey.spentByEach<source.spentByEach||
      !came||came.tick>=source.reachedTick||!validTime(source.reachedTick)||source.reachedTick>=row.offeredTick||
      (journey.lastMovedTick??0)<source.reachedTick||through>=(journey.expiresTick??0)||
      (left!==undefined&&left.tick<(mayLeaveAfterAction?through:through+1))||
      (journey.settledTick!==undefined&&journey.settledTick<(mayLeaveAfterAction?through:through+1)))return undefined;
    const stamps=journey.waypostMealWitnesses?.filter(mark=>mark.mealId===row.id)??[];
    const mark=stamps[0];
    if(stamps.length!==1||mark.offeredTick!==row.offeredTick||mark.legIndex!==source.legIndex||
      mark.pathIndex!==source.pathIndex||mark.reachedTick!==source.reachedTick||mark.tileId!==row.tileId||
      !eqPoint(mark.point,row.point))return undefined;
    if(journey.lastMovedTick===source.reachedTick&&journey.legIndex===index&&journey.path.length>0&&
      (journey.pathIndex!==source.pathIndex||source.pathIndex>=journey.path.length-1||
        !eqPoint(journey.path[source.pathIndex],row.point)))return undefined;
    return journey;
  }

  let previous=0,previousOffer=0;
  for(const row of rows){
    const number=serial(row.id);
    if(!Number.isSafeInteger(number)||number<=previous||number>=(ledger?.nextId??0)||row.id!==waypostMealId(number)||
      !actors.has(row.hostId)||!actors.has(row.guestId)||!validTime(row.offeredTick)||row.offeredTick<previousOffer||
      row.expiresTick!==row.offeredTick+WAYPOST_MEAL_REPLY_TICKS)
      return fail('waypostMeals.references');
    rowsById.set(row.id,row);previous=number;previousOffer=row.offeredTick;
    const {status,closedTick}=row,open=status==='offered',served=status==='served';
    if(open!==(closedTick===undefined)||open&&world.tick>=row.expiresTick||
      closedTick!==undefined&&(!validTime(closedTick)||
        (status==='missed'?closedTick<row.offeredTick:closedTick<=row.offeredTick)||
        (status==='expired'?closedTick!==row.expiresTick:closedTick>=row.expiresTick)))
      return fail('waypostMeals.deadline');
    if(row.escrowLeaves!==+open||row.spentLeaves!==+served||row.returnedLeaves!==+(!open&&!served)||row.escrowLeaves+row.spentLeaves+row.returnedLeaves!==1)
      return fail('waypostMeals.custody');
    const tile=terrainTileAt(world,row.point.x,row.point.y);
    if(!tile||tile.id!==row.tileId)return fail('waypostMeals.checkpoint');
    const signedReply=status==='declined'||status==='withdrawn';
    const historicalThrough=served||signedReply?closedTick!:row.offeredTick;
    const mayLeaveAfterAction=signedReply||status==='missed'&&closedTick===row.offeredTick;
    const a=boundVisit(row,row.hostVisit,row.hostId,historicalThrough,mayLeaveAfterAction),
      b=boundVisit(row,row.guestVisit,row.guestId,historicalThrough,mayLeaveAfterAction);
    if(!a||!b||a.id===b.id||new Set([a.organizerId,a.companionId,b.organizerId,b.companionId]).size!==4)
      return fail('waypostMeals.source');
    if(open){
      const atHost=pilgrimageWaypostCheckpoint(world,a),atGuest=pilgrimageWaypostCheckpoint(world,b);
      if(!atHost||!atGuest||!sameVisit(atHost.visit,row.hostVisit)||!sameVisit(atGuest.visit,row.guestVisit)||
        !eqPoint(atHost.point,row.point)||!eqPoint(atGuest.point,row.point)||atHost.tileId!==row.tileId||atGuest.tileId!==row.tileId||
        reserved.has(a.id)||reserved.has(b.id))return fail('waypostMeals.contact');
      reserved.add(a.id);reserved.add(b.id);
    }
    if(served){
      const recovery=row.recovery;
      if(!recovery||recovery.length!==2||
        !eqIds(recovery.map(row=>row.actorId),parties(row))||recovery.some(r=>r.beforeHp>=r.maxHp||
          r.afterHp<=r.beforeHp||r.afterHp>r.maxHp||r.afterHp!==Math.min(r.beforeHp+WAYPOST_MEAL_REST,r.maxHp)))
        return fail('waypostMeals.recovery');
      once(row.hostId,closedTick!);once(row.guestId,closedTick!);
    }else if(row.recovery!==undefined)return fail('waypostMeals.recovery');
    if(status==='declined')once(row.guestId,closedTick!);
    if(status==='withdrawn')once(row.hostId,closedTick!);
    once(row.hostId,row.offeredTick);
    events.set(waypostMealEventId(row.id,row.offeredTick,'offered'),{row,tick:row.offeredTick});
    add(row,row.offeredTick,'waypost_meal_deposit',pocket(row.hostId),account(row.id));
    if(closedTick!==undefined){
      events.set(waypostMealEventId(row.id,closedTick,status),{row,tick:closedTick});
      if(served)add(row,closedTick,'waypost_meal_consumed',account(row.id));
      else add(row,closedTick,'waypost_meal_refund',account(row.id),pocket(row.hostId));
    }
  }

  for(const journey of world.pilgrimages.journeys){
    if(journey.waypostMealWitnesses){
      if(!journey.waypostMealWitnesses.length)return fail('waypostMeals.orphanWitness');
      for(const mark of journey.waypostMealWitnesses){
        const meal=rowsById.get(mark.mealId);
        if(!meal||meal.hostVisit.journeyId!==journey.id&&meal.guestVisit.journeyId!==journey.id)
          return fail('waypostMeals.orphanWitness');
      }
    }
  }
  const seenEvents=new Set<string>();
  for(const news of world.events){
    const matched=eventPattern.exec(news.id);
    if(!matched)continue;
    const expected=events.get(news.id);
    if(seenEvents.has(news.id)||news.tick!==Number(matched[2])||news.category!=='diplomacy'||
      news.witnessScope!=='participants'||news.locationId!==undefined||
      (!expected||news.tick!==expected.tick||!eqIds(news.actorIds,parties(expected.row))))
      return fail('waypostMeals.event');
    seenEvents.add(news.id);
  }
  const leaked=(anchors:readonly {id:string}[])=>anchors.some(anchor=>eventPattern.test(anchor.id));
  if(leaked(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(chapter=>leaked(chapter.anchors))||
    world.coldHistory.chapters.some(chapter=>leaked(chapter.anchors)))return fail('waypostMeals.archive');

  const seenBills=new Set<string>(),monthComplete=new Map<number,boolean>();
  for(const month of world.resourceFlow.months){
    monthComplete.set(month.tick,month.totalEntries===month.entries.length);
    for(const flow of month.entries){
      const usesMealAccount=('to'in flow&&flow.to.kind==='waypost_meal')||('from'in flow&&flow.from.kind==='waypost_meal');
      if(!usesMealAccount&&!flow.reason.startsWith('waypost_meal_')&&!rowsById.has(flow.refId))continue;
      const id=ref(flow.refId,flow.reason),expected=bills.get(id);
      if(!expected||seenBills.has(id)||flow.mechanism!=='pilgrimage'||flow.amount!==1||flow.good!==WAYPOST_MEAL_LEAF||
        flow.visibility.kind!=='participants'||flow.tick!==expected.tick||!eqIds(flow.visibility.actorIds,parties(expected.row))||
        (expected.to?(flow.kind!=='transfer'||!eqAccount(flow.from,expected.from)||!eqAccount(flow.to,expected.to)):
          flow.kind!=='consumption'||!eqAccount(flow.from,expected.from)))return fail('waypostMeals.resourceJournal');
      seenBills.add(id);
    }
  }
  for(const [id,bill] of bills){
    if(!seenBills.has(id)&&bill.tick>world.tick-RESOURCE_FLOW_MONTH_LIMIT&&monthComplete.get(bill.tick)!==false)
      return fail('waypostMeals.resourceJournal');
  }
}
